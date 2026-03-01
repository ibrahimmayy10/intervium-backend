// controllers/AppleWebhookController.js

const User = require('../models/User');

// Apple'dan gelen notification type'larını karşılık gelen durumlarla eşleştir
const SUBSCRIPTION_EVENTS = {
  // Yeni satın alma veya yenileme
  'SUBSCRIBED': 'active',
  'DID_RENEW': 'active',
  // İptal veya sona erme
  'EXPIRED': 'expired',
  'DID_FAIL_TO_RENEW': 'grace_period',
  'GRACE_PERIOD_EXPIRED': 'expired',
  'REVOKE': 'cancelled',
  // Kullanıcı iptal etti (ama süre dolmadı, hâlâ aktif)
  'DID_CHANGE_RENEWAL_STATUS': null // subtype'a göre işlenir
};

// @desc    Apple App Store Server Notifications v2
// @route   POST /api/v1/apple/webhook
// @access  Public (Apple'dan gelir, JWT ile imzalanmış)
exports.handleAppleWebhook = async (req, res) => {
  try {
    // Apple signedPayload gönderir — JWT formatında
    const { signedPayload } = req.body;

    if (!signedPayload) {
      return res.status(400).json({ success: false, message: 'signedPayload eksik' });
    }

    // signedPayload'u decode et (doğrulama production'da Apple public key ile yapılmalı)
    // Basit decode: JWT'nin payload kısmını al (production'da verify et!)
    const payload = decodeAppleJWT(signedPayload);

    if (!payload) {
      console.error('❌ Apple webhook: payload decode edilemedi');
      return res.status(400).json({ success: false, message: 'Geçersiz payload' });
    }

    const { notificationType, subtype, data } = payload;

    console.log(`📱 Apple webhook alındı: ${notificationType} / ${subtype}`);

    // Transaction bilgilerini al
    const transactionInfo = data?.signedTransactionInfo
      ? decodeAppleJWT(data.signedTransactionInfo)
      : null;

    if (!transactionInfo) {
      console.error('❌ Apple webhook: transactionInfo alınamadı');
      return res.status(200).json({ success: true }); // Apple'a 200 dön, tekrar denemesin
    }

    const originalTransactionId = transactionInfo.originalTransactionId;
    const expiresDateMs = transactionInfo.expiresDate;

    // Kullanıcıyı originalTransactionId ile bul
    const user = await User.findOne({ appleOriginalTransactionId: originalTransactionId }).select('+appleOriginalTransactionId +appleLatestTransactionId');

    if (!user) {
      console.log(`⚠️ Apple webhook: kullanıcı bulunamadı, originalTransactionId: ${originalTransactionId}`);
      return res.status(200).json({ success: true });
    }

    // Event'e göre kullanıcıyı güncelle
    await processSubscriptionEvent(user, notificationType, subtype, expiresDateMs, transactionInfo.transactionId);

    // Apple'a her zaman 200 dön
    res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ Apple webhook error:', error);
    // Apple'a 200 dön, hata olsa bile tekrar denemesin
    res.status(200).json({ success: true });
  }
};

// @desc    iOS'tan gelen satın alma doğrulama
// @route   POST /api/v1/apple/verify-purchase
// @access  Private
exports.verifyPurchase = async (req, res) => {
  try {
    const { transactionId, originalTransactionId, expiresDateMs, productId } = req.body;
    const userId = req.user.id;

    if (!transactionId || !originalTransactionId || !expiresDateMs) {
      return res.status(400).json({
        success: false,
        message: 'Transaction bilgileri eksik'
      });
    }

    const user = await User.findById(userId).select('+appleOriginalTransactionId +appleLatestTransactionId');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    const expiresDate = new Date(expiresDateMs);
    const now = new Date();
    const isPremiumActive = expiresDate > now;

    // Kullanıcı premium durumunu güncelle
    user.isPremium = isPremiumActive;
    user.premiumExpiresAt = expiresDate;
    user.appleOriginalTransactionId = originalTransactionId;
    user.appleLatestTransactionId = transactionId;
    user.subscriptionStatus = isPremiumActive ? 'active' : 'expired';

    await user.save({ validateBeforeSave: false });

    console.log(`✅ Premium aktifleştirildi: ${user.email}, bitiş: ${expiresDate}`);

    res.status(200).json({
      success: true,
      message: 'Premium üyelik aktifleştirildi',
      data: {
        isPremium: user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt,
        subscriptionStatus: user.subscriptionStatus
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

// @desc    Kullanıcının premium durumunu getir
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
        subscriptionStatus: isPremiumActive ? 'active' : user.subscriptionStatus
      }
    });

  } catch (error) {
    console.error('❌ Get subscription status error:', error);
    res.status(500).json({
      success: false,
      message: 'Abonelik durumu alınamadı'
    });
  }
};

// ─── Yardımcı Fonksiyonlar ────────────────────────────────────────────────────

// Apple JWT'yi decode et (production'da verify edilmeli)
function decodeAppleJWT(signedJWT) {
  try {
    // JWT: header.payload.signature
    const parts = signedJWT.split('.');
    if (parts.length !== 3) return null;

    // Base64URL decode
    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('JWT decode error:', error);
    return null;
  }
}

// Subscription event'i işle ve kullanıcıyı güncelle
async function processSubscriptionEvent(user, notificationType, subtype, expiresDateMs, latestTransactionId) {
  try {
    const expiresDate = expiresDateMs ? new Date(expiresDateMs) : null;
    const now = new Date();

    switch (notificationType) {

      case 'SUBSCRIBED':
      case 'DID_RENEW':
        // Abonelik aktif veya yenilendi
        user.isPremium = true;
        user.premiumExpiresAt = expiresDate;
        user.subscriptionStatus = 'active';
        user.appleLatestTransactionId = latestTransactionId;
        console.log(`✅ Premium yenilendi: ${user.email}, bitiş: ${expiresDate}`);
        break;

      case 'EXPIRED':
      case 'GRACE_PERIOD_EXPIRED':
        // Abonelik sona erdi
        user.isPremium = false;
        user.premiumExpiresAt = expiresDate;
        user.subscriptionStatus = 'expired';
        console.log(`⏰ Premium sona erdi: ${user.email}`);
        break;

      case 'DID_FAIL_TO_RENEW':
        // Yenileme başarısız, grace period başladı
        user.subscriptionStatus = 'grace_period';
        // isPremium hâlâ true, grace period boyunca erişim var
        console.log(`⚠️ Premium grace period: ${user.email}`);
        break;

      case 'REVOKE':
        // Geri alındı (refund gibi)
        user.isPremium = false;
        user.subscriptionStatus = 'cancelled';
        user.premiumExpiresAt = now;
        console.log(`🚫 Premium iptal edildi: ${user.email}`);
        break;

      case 'DID_CHANGE_RENEWAL_STATUS':
        if (subtype === 'AUTO_RENEW_DISABLED') {
          // Kullanıcı auto-renew kapattı, süre bitene kadar aktif
          console.log(`📴 Auto-renew kapatıldı: ${user.email}, bitiş: ${expiresDate}`);
          // isPremium değişmiyor, sadece bilgi amaçlı
        } else if (subtype === 'AUTO_RENEW_ENABLED') {
          console.log(`📲 Auto-renew açıldı: ${user.email}`);
        }
        break;

      default:
        console.log(`ℹ️ Bilinmeyen notification: ${notificationType}`);
    }

    await user.save({ validateBeforeSave: false });

  } catch (error) {
    console.error('❌ processSubscriptionEvent error:', error);
    throw error;
  }
}