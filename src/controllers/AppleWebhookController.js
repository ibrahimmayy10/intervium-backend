// controllers/AppleWebhookController.js

const User = require('../models/User');
const {
  verifySubscriptionWithFallback,
  decodeAppleJWT
} = require('../services/AppleStoreService');

// ─── Webhook Handler ──────────────────────────────────────────────────────────

// @desc    Apple App Store Server Notifications v2
// @route   POST /api/v1/apple/webhook
// @access  Public
exports.handleAppleWebhook = async (req, res) => {
  try {
    const { signedPayload } = req.body;

    if (!signedPayload) {
      return res.status(400).json({ success: false, message: 'signedPayload eksik' });
    }

    const payload = decodeAppleJWT(signedPayload);

    if (!payload) {
      console.error('❌ Apple webhook: payload decode edilemedi');
      return res.status(400).json({ success: false, message: 'Geçersiz payload' });
    }

    const { notificationType, subtype, data } = payload;
    console.log(`📱 Apple webhook: ${notificationType}${subtype ? '/' + subtype : ''}`);

    const transactionInfo = data?.signedTransactionInfo
      ? decodeAppleJWT(data.signedTransactionInfo)
      : null;

    if (!transactionInfo) {
      console.error('❌ Apple webhook: transactionInfo alınamadı');
      return res.status(200).json({ success: true });
    }

    const { originalTransactionId, expiresDate, transactionId } = transactionInfo;

    const user = await User.findOne({ appleOriginalTransactionId: originalTransactionId })
      .select('+appleOriginalTransactionId +appleLatestTransactionId');

    if (!user) {
      console.log(`⚠️ Kullanıcı bulunamadı: ${originalTransactionId}`);
      return res.status(200).json({ success: true });
    }

    await processSubscriptionEvent(
      user,
      notificationType,
      subtype,
      expiresDate,
      transactionId
    );

    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Apple webhook error:', error);
    res.status(200).json({ success: true }); // Apple'a her zaman 200 dön
  }
};

// ─── Satın Alma Doğrulama ─────────────────────────────────────────────────────

// @desc    iOS'tan gelen satın almayı Apple API ile doğrula
// @route   POST /api/v1/apple/verify-purchase
// @access  Private
exports.verifyPurchase = async (req, res) => {
  try {
    // Client sadece originalTransactionId gönderiyor
    // expiresDate, status vb. hiçbir şeye güvenmiyoruz — Apple'dan çekiyoruz
    const { originalTransactionId } = req.body;
    const userId = req.user.id;

    if (!originalTransactionId) {
      return res.status(400).json({
        success: false,
        message: 'originalTransactionId gereklidir'
      });
    }

    const user = await User.findById(userId)
      .select('+appleOriginalTransactionId +appleLatestTransactionId');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    // Apple API'den gerçek abonelik bilgilerini al
    const appleResult = await verifySubscriptionWithFallback(originalTransactionId);

    if (appleResult.status === 'not_found' || appleResult.status === 'api_error') {
      return res.status(400).json({
        success: false,
        message: 'Satın alma Apple tarafından doğrulanamadı'
      });
    }

    // Apple'dan gelen verileri kullan — client'tan gelen hiçbir şeye güvenme
    user.isPremium = appleResult.isValid;
    user.premiumExpiresAt = appleResult.expiresDate;
    user.appleOriginalTransactionId = originalTransactionId;
    user.appleLatestTransactionId = appleResult.latestTransactionId || originalTransactionId;
    user.subscriptionStatus = appleResult.status;

    await user.save({ validateBeforeSave: false });

    console.log(`✅ Satın alma doğrulandı: ${user.email} | durum: ${appleResult.status} | bitiş: ${appleResult.expiresDate}`);

    res.status(200).json({
      success: true,
      message: appleResult.isValid ? 'Premium üyelik aktifleştirildi' : 'Abonelik doğrulandı fakat aktif değil',
      data: {
        isPremium: appleResult.isValid,
        premiumExpiresAt: appleResult.expiresDate,
        subscriptionStatus: appleResult.status
      }
    });

  } catch (error) {
    console.error('❌ Verify purchase error:', error);
    res.status(500).json({
      success: false,
      message: 'Satın alma doğrulanamadı'
    });
  }
};

// ─── Abonelik Durumu ──────────────────────────────────────────────────────────

// @desc    Kullanıcının güncel premium durumunu getir
// @route   GET /api/v1/apple/subscription-status
// @access  Private
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const user = req.user;

    const isPremiumActive =
      user.isPremium &&
      user.premiumExpiresAt &&
      new Date() < new Date(user.premiumExpiresAt);

    // Süresi dolmuşsa güncelle
    if (user.isPremium && !isPremiumActive) {
      user.isPremium = false;
      user.subscriptionStatus = 'expired';
      await user.save({ validateBeforeSave: false });
    }

    res.status(200).json({
      success: true,
      data: {
        isPremium: isPremiumActive,
        premiumExpiresAt: user.premiumExpiresAt,
        subscriptionStatus: isPremiumActive ? user.subscriptionStatus : 'expired',
        isTrialUsed: user.isTrialUsed,
        trialStartedAt: user.trialStartedAt
      }
    });

  } catch (error) {
    console.error('❌ Get subscription status error:', error);
    res.status(500).json({ success: false, message: 'Abonelik durumu alınamadı' });
  }
};

// ─── Ücretsiz Deneme ──────────────────────────────────────────────────────────

// @desc    3 günlük ücretsiz deneme başlat
// @route   POST /api/v1/apple/start-trial
// @access  Private
exports.startTrial = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    if (user.isTrialUsed) {
      return res.status(400).json({
        success: false,
        message: 'Deneme süresi daha önce kullanıldı',
        code: 'TRIAL_ALREADY_USED'
      });
    }

    const isPremiumActive =
      user.isPremium &&
      user.premiumExpiresAt &&
      new Date() < new Date(user.premiumExpiresAt);

    if (isPremiumActive) {
      return res.status(400).json({
        success: false,
        message: 'Zaten aktif bir premium üyeliğiniz var',
        code: 'ALREADY_PREMIUM'
      });
    }

    const trialStart = new Date();
    const trialEnd = new Date(trialStart.getTime() + 3 * 24 * 60 * 60 * 1000);

    user.isPremium = true;
    user.premiumExpiresAt = trialEnd;
    user.subscriptionStatus = 'trial';
    user.isTrialUsed = true;
    user.trialStartedAt = trialStart;

    await user.save({ validateBeforeSave: false });

    console.log(`🎁 Trial başladı: ${user.email} | bitiş: ${trialEnd}`);

    res.status(200).json({
      success: true,
      message: '3 günlük ücretsiz deneme başlatıldı',
      data: {
        isPremium: true,
        premiumExpiresAt: trialEnd,
        subscriptionStatus: 'trial',
        trialStartedAt: trialStart
      }
    });

  } catch (error) {
    console.error('❌ Start trial error:', error);
    res.status(500).json({ success: false, message: 'Deneme süresi başlatılırken hata oluştu' });
  }
};

// ─── Yardımcı: Subscription Event İşle ───────────────────────────────────────

async function processSubscriptionEvent(user, notificationType, subtype, expiresDateMs, latestTransactionId) {
  try {
    const expiresDate = expiresDateMs ? new Date(expiresDateMs) : null;
    const now = new Date();

    switch (notificationType) {

      case 'SUBSCRIBED':
      case 'DID_RENEW':
        user.isPremium = true;
        user.premiumExpiresAt = expiresDate;
        user.subscriptionStatus = 'active';
        user.appleLatestTransactionId = latestTransactionId;
        console.log(`✅ Premium yenilendi: ${user.email} | bitiş: ${expiresDate}`);
        break;

      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED':
        user.isPremium = false;
        user.premiumExpiresAt = expiresDate;
        user.subscriptionStatus = 'expired';
        console.log(`⏰ Premium sona erdi: ${user.email}`);
        break;

      case 'DID_FAIL_TO_RENEW':
        user.subscriptionStatus = 'grace_period';
        console.log(`⚠️ Grace period: ${user.email}`);
        break;

      case 'REVOKE':
        user.isPremium = false;
        user.subscriptionStatus = 'cancelled';
        user.premiumExpiresAt = now;
        console.log(`🚫 Premium iptal: ${user.email}`);
        break;

      case 'DID_CHANGE_RENEWAL_STATUS':
        if (subtype === 'AUTO_RENEW_DISABLED') {
          console.log(`📴 Auto-renew kapatıldı: ${user.email}`);
        } else if (subtype === 'AUTO_RENEW_ENABLED') {
          console.log(`📲 Auto-renew açıldı: ${user.email}`);
        }
        break;

      default:
        console.log(`ℹ️ Bilinmeyen event: ${notificationType}`);
    }

    await user.save({ validateBeforeSave: false });

  } catch (error) {
    console.error('❌ processSubscriptionEvent error:', error);
    throw error;
  }
}