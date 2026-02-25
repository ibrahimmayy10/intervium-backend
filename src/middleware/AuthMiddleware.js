// middleware/AuthMiddleware.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Protect routes - JWT token kontrolü
exports.protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Bu işlem için giriş yapmalısınız'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Kullanıcı bulunamadı'
      });
    }

    // Email doğrulanmamışsa engelle
    if (!user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'E-posta adresiniz doğrulanmamış',
        data: { requiresVerification: true, email: user.email }
      });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error('Auth middleware error:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'Geçersiz token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Token süresi dolmuş' });
    }

    return res.status(401).json({ success: false, message: 'Yetkilendirme hatası' });
  }
};