const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - JWT token kontrolü
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Header'dan token al
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Token var mı kontrol et
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Bu işlem için giriş yapmalısınız'
      });
    }

    // Token'ı doğrula
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // User'ı bul
    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // User'ı request'e ekle
    req.user = user;
    next();

  } catch (error) {
    console.error('Auth middleware error:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Geçersiz token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token süresi dolmuş'
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Yetkilendirme hatası'
    });
  }
};