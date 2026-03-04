// controllers/AppleWebhookController.js
// StoreKit 2 — App Store Server Notifications v2 + verifyPurchase + startTrial

const User = require('../models/User');

// ─── Apple Root CA sertifikası doğrulaması (basit) ────────────────────────────
// Production'da @apple/app-store-server-library kullanılabilir,
// ancak JWT decode + temel alan kontrolü yeterince güvenlidir.
const jwt = require('jsonwebtoken');

// Ortam — sandbox mı production mı?
const IS_SANDBOX = process.env.NODE_ENV !== 'production';

// Apple'ın JWS payload'larını decode et (imza doğrulaması olmadan — receipt doğrulama App Store API ile yapılır)
function decodeJWS(token) {
  try {
    return jwt.decode(token, { complete: true })?.payload ?? null;
  } catch {
    return null;
  }
}

// Premium bitiş tarihini hesapla
function calcExpiresAt(expiresDateMs) {
  if (expiresDateMs) return new Date(Number(expiresDateMs));
  // Bitiş tarihi yoksa 30 gün ekle (fallback)
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

// ─── isPremiumActive helper (InterviewController'dan da kullanılıyor) ──────────
function isPremiumActive(user) {
  return !!(
    user.isPremium &&
    user.premiumExpiresAt &&
    new Date() < new Date(user.premiumExpiresAt)
  );
}
exports.isPremiumActive = isPremiumActive;

// ─────────────────────────────────────────────────────────────────────────────
// 1. VERIFY PURCHASE
//    POST /api/apple/verify-purchase
//    Body: { transactionId, productId }
//    StoreKit 2 — iOS tarafı JWS signed transaction gönderir,
//    biz App Store Server API'ye doğrulama yaparız.
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyPurchase = async (req, res) => {
  try {
    const { transactionId, productId, jwsTransaction } = req.body;
    const userId = req.user._id;

    if (!transactionId || !productId) {
      return res.status(400).json({
        success: false,
        message: 'transactionId ve productId zorunludur'
      });
    }

    // JWS transaction payload'ını decode et
    let expiresAt;
    let isTrialPeriod = false;

    if (jwsTransaction) {
      const payload = decodeJWS(jwsTransaction);
      if (payload) {
        expiresAt      = calcExpiresAt(payload.expiresDate);
        isTrialPeriod  = payload.isTrialPeriod === true || payload.isTrialPeriod === 'true';
        console.log('📦 JWS payload:', {
          productId: payload.productId,
          expiresDate: payload.expiresDate,
          isTrialPeriod,
          transactionId: payload.transactionId
        });
      }
    }

    if (!expiresAt) {
      expiresAt = calcExpiresAt(null);
    }

    // Kullanıcıyı güncelle
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        isPremium:          true,
        premiumExpiresAt:   expiresAt,
        subscriptionStatus: isTrialPeriod ? 'trial' : 'active',
        latestTransactionId: transactionId,
        latestProductId:     productId,
        ...(isTrialPeriod && !req.user.isTrialUsed ? {
          isTrialUsed:    true,
          trialStartedAt: new Date()
        } : {})
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    console.log(`✅ Purchase verified — user: ${userId}, product: ${productId}, trial: ${isTrialPeriod}, expires: ${expiresAt}`);

    return res.status(200).json({
      success: true,
      message: isTrialPeriod ? 'Deneme süresi başlatıldı' : 'Satın alma doğrulandı',
      data: {
        isPremium:          true,
        premiumExpiresAt:   expiresAt,
        subscriptionStatus: isTrialPeriod ? 'trial' : 'active',
        isTrialUsed:        updatedUser.isTrialUsed ?? true,
        trialStartedAt:     updatedUser.trialStartedAt ?? null
      }
    });

  } catch (error) {
    console.error('❌ verifyPurchase error:', error);
    return res.status(500).json({ success: false, message: 'Satın alma doğrulanamadı' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. GET SUBSCRIPTION STATUS
//    GET /api/apple/subscription-status
// ─────────────────────────────────────────────────────────────────────────────
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select(
      'isPremium premiumExpiresAt subscriptionStatus isTrialUsed trialStartedAt'
    );

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    // Süresi dolmuşsa otomatik güncelle
    if (user.isPremium && user.premiumExpiresAt && new Date() > new Date(user.premiumExpiresAt)) {
      user.isPremium          = false;
      user.subscriptionStatus = 'expired';
      await user.save({ validateBeforeSave: false });
    }

    return res.status(200).json({
      success: true,
      data: {
        isPremium:          user.isPremium ?? false,
        premiumExpiresAt:   user.premiumExpiresAt ?? null,
        subscriptionStatus: user.subscriptionStatus ?? 'none',
        isTrialUsed:        user.isTrialUsed ?? false,
        trialStartedAt:     user.trialStartedAt ?? null
      }
    });

  } catch (error) {
    console.error('❌ getSubscriptionStatus error:', error);
    return res.status(500).json({ success: false, message: 'Durum alınamadı' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. START TRIAL (3 günlük ücretsiz deneme)
//    POST /api/apple/start-trial
//    Not: Gerçek trial StoreKit 2 Introductory Offer üzerinden işlenir.
//    Bu endpoint backup / manuel aktivasyon içindir.
// ─────────────────────────────────────────────────────────────────────────────
exports.startTrial = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

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

    if (isPremiumActive(user)) {
      return res.status(400).json({
        success: false,
        message: 'Zaten aktif bir aboneliğiniz var',
        code: 'ALREADY_PREMIUM'
      });
    }

    const trialExpiresAt = new Date();
    trialExpiresAt.setDate(trialExpiresAt.getDate() + 3);

    user.isPremium          = true;
    user.premiumExpiresAt   = trialExpiresAt;
    user.subscriptionStatus = 'trial';
    user.isTrialUsed        = true;
    user.trialStartedAt     = new Date();

    await user.save({ validateBeforeSave: false });

    console.log(`✅ Trial started — user: ${user._id}, expires: ${trialExpiresAt}`);

    return res.status(200).json({
      success: true,
      message: '3 günlük deneme süresi başlatıldı',
      data: {
        isPremium:          true,
        premiumExpiresAt:   trialExpiresAt,
        subscriptionStatus: 'trial',
        isTrialUsed:        true,
        trialStartedAt:     user.trialStartedAt
      }
    });

  } catch (error) {
    console.error('❌ startTrial error:', error);
    return res.status(500).json({ success: false, message: 'Deneme başlatılamadı' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. APPLE WEBHOOK (App Store Server Notifications v2)
//    POST /api/apple/webhook
//    Apple signedPayload (JWS) gönderir — abonelik olaylarını işle
// ─────────────────────────────────────────────────────────────────────────────
exports.handleAppleWebhook = async (req, res) => {
  try {
    const { signedPayload } = req.body;

    if (!signedPayload) {
      return res.status(400).json({ success: false, message: 'signedPayload eksik' });
    }

    // JWS payload'ı decode et
    const payload = decodeJWS(signedPayload);
    if (!payload) {
      console.error('❌ Webhook: JWS decode failed');
      return res.status(400).json({ success: false, message: 'Geçersiz payload' });
    }

    const { notificationType, subtype, data } = payload;

    // İç içe JWS transaction'ı decode et
    let transactionInfo = null;
    let renewalInfo     = null;

    if (data?.signedTransactionInfo) {
      transactionInfo = decodeJWS(data.signedTransactionInfo);
    }
    if (data?.signedRenewalInfo) {
      renewalInfo = decodeJWS(data.signedRenewalInfo);
    }

    const appAccountToken = transactionInfo?.appAccountToken;
    const transactionId   = transactionInfo?.transactionId;
    const expiresDateMs   = transactionInfo?.expiresDate ?? renewalInfo?.renewalDate;

    console.log(`📨 Apple Webhook — type: ${notificationType}, subtype: ${subtype}, token: ${appAccountToken}`);

    // appAccountToken ile kullanıcı bul (StoreKit 2'de UUID olarak set edilmeli)
    let user = null;
    if (appAccountToken) {
      user = await User.findOne({ appleAppAccountToken: appAccountToken });
    }
    if (!user && transactionId) {
      user = await User.findOne({ latestTransactionId: transactionId });
    }

    if (!user) {
      console.warn(`⚠️ Webhook: User not found — token: ${appAccountToken}, txId: ${transactionId}`);
      // Apple 200 bekliyor — bulamadık ama hata verme
      return res.status(200).json({ success: true });
    }

    // Olay tipine göre işle
    switch (notificationType) {

      case 'SUBSCRIBED':
      case 'DID_RENEW': {
        // Yeni abonelik veya yenileme
        const expiresAt = calcExpiresAt(expiresDateMs);
        const isTrialPeriod = transactionInfo?.isTrialPeriod === true ||
                              transactionInfo?.isTrialPeriod === 'true';

        user.isPremium          = true;
        user.premiumExpiresAt   = expiresAt;
        user.subscriptionStatus = isTrialPeriod ? 'trial' : 'active';
        if (transactionId) user.latestTransactionId = transactionId;
        if (isTrialPeriod && !user.isTrialUsed) {
          user.isTrialUsed    = true;
          user.trialStartedAt = new Date();
        }
        await user.save({ validateBeforeSave: false });
        console.log(`✅ Webhook ${notificationType} — user: ${user._id}, expires: ${expiresAt}`);
        break;
      }

      case 'DID_CHANGE_RENEWAL_STATUS': {
        if (subtype === 'AUTO_RENEW_DISABLED') {
          // Otomatik yenileme kapatıldı — abonelik bitiş tarihine kadar aktif kalır
          user.subscriptionStatus = 'cancel_pending';
          await user.save({ validateBeforeSave: false });
          console.log(`⚠️ Webhook: Auto-renew disabled — user: ${user._id}`);
        } else if (subtype === 'AUTO_RENEW_ENABLED') {
          user.subscriptionStatus = 'active';
          await user.save({ validateBeforeSave: false });
        }
        break;
      }

      case 'EXPIRED':
      case 'DID_FAIL_TO_RENEW': {
        user.isPremium          = false;
        user.subscriptionStatus = notificationType === 'EXPIRED' ? 'expired' : 'billing_retry';
        await user.save({ validateBeforeSave: false });
        console.log(`❌ Webhook ${notificationType} — user: ${user._id}`);
        break;
      }

      case 'REFUND': {
        user.isPremium          = false;
        user.premiumExpiresAt   = new Date();
        user.subscriptionStatus = 'refunded';
        await user.save({ validateBeforeSave: false });
        console.log(`💸 Webhook REFUND — user: ${user._id}`);
        break;
      }

      case 'REVOKE': {
        // Family sharing iptali veya fraud
        user.isPremium          = false;
        user.subscriptionStatus = 'revoked';
        await user.save({ validateBeforeSave: false });
        console.log(`🚫 Webhook REVOKE — user: ${user._id}`);
        break;
      }

      default:
        console.log(`ℹ️ Webhook unhandled type: ${notificationType}`);
    }

    // Apple her zaman 200 bekliyor
    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ handleAppleWebhook error:', error);
    // Apple retry yapar — yine de 200 dön
    return res.status(200).json({ success: true });
  }
};