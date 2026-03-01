// middleware/PremiumMiddleware.js

// Premium kontrolü — kullanıcının aktif aboneliği var mı?
exports.requirePremium = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Giriş yapmalısınız'
      });
    }

    // Premium kontrolü: isPremium true mu ve süresi dolmamış mı?
    const isPremiumActive =
      user.isPremium &&
      user.premiumExpiresAt &&
      new Date() < new Date(user.premiumExpiresAt);

    if (!isPremiumActive) {
      // Süresi dolmuşsa güncelle
      if (user.isPremium && user.premiumExpiresAt && new Date() > new Date(user.premiumExpiresAt)) {
        user.isPremium = false;
        user.subscriptionStatus = 'expired';
        await user.save({ validateBeforeSave: false });
      }

      return res.status(403).json({
        success: false,
        message: 'Bu özellik Premium üyelik gerektirir',
        code: 'PREMIUM_REQUIRED'
      });
    }

    next();
  } catch (error) {
    console.error('Premium middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Yetkilendirme hatası'
    });
  }
};

// Premium durumunu response'a ekle (zorunlu değil ama bilgi için)
exports.attachPremiumStatus = (req, res, next) => {
  if (req.user) {
    req.isPremiumActive =
      req.user.isPremium &&
      req.user.premiumExpiresAt &&
      new Date() < new Date(req.user.premiumExpiresAt);
  }
  next();
};