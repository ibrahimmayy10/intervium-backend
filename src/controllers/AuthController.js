const jwt = require('jsonwebtoken');
const User = require('../models/User');

// JWT token oluştur
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

// @desc    Register user
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, surname, email, password } = req.body;

    // Email zaten var mı kontrol et
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Bu email adresi zaten kullanılıyor'
      });
    }

    // Yeni user oluştur
    const user = await User.create({
      name,
      surname,
      email,
      password
    });

    // JWT token oluştur
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Kayıt başarılı',
      data: {
        user: {
          id: user._id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          fullName: user.fullName,
          createdAt: user.createdAt
        },
        token
      }
    });

  } catch (error) {
    console.error('Register error:', error);
    
    // Validation error
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Geçersiz veri'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Kayıt sırasında bir hata oluştu'
    });
  }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Email ve password kontrolü
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email ve şifre gereklidir'
      });
    }

    // User'ı bul (password'u da getir)
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Email veya şifre hatalı'
      });
    }

    // Password kontrolü
    const isPasswordCorrect = await user.comparePassword(password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: 'Email veya şifre hatalı'
      });
    }

    // JWT token oluştur
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Giriş başarılı',
      data: {
        user: {
          id: user._id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          fullName: user.fullName,
          createdAt: user.createdAt
        },
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Giriş sırasında bir hata oluştu'
    });
  }
};

// @desc    Get current user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    // req.user middleware'den geliyor
    const user = await User.findById(req.user.id);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: user._id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          fullName: user.fullName,
          createdAt: user.createdAt
        }
      }
    });

  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Kullanıcı bilgileri alınamadı'
    });
  }
};

// @desc    Update profile
// @route   PUT /api/v1/auth/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const { name, surname, email } = req.body;

    // Email başkası tarafından kullanılıyor mu?
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Bu email adresi zaten kullanılıyor'
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { name, surname, email },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Profil güncellendi',
      data: {
        id: updatedUser._id,
        name: updatedUser.name,
        surname: updatedUser.surname,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        createdAt: updatedUser.createdAt
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Geçersiz veri'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Profil güncellenirken bir hata oluştu'
    });
  }
};

// @desc    Change password
// @route   PUT /api/v1/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Mevcut ve yeni şifre gereklidir'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Yeni şifre en az 6 karakter olmalıdır'
      });
    }

    // Password'u select ile getir
    const user = await User.findById(req.user.id).select('+password');

    // Mevcut şifreyi doğrula
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Mevcut şifre hatalı'
      });
    }

    // Aynı şifre mi?
    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Yeni şifre mevcut şifreyle aynı olamaz'
      });
    }

    user.password = newPassword;
    await user.save(); // pre-save hook şifreyi otomatik hashler

    res.status(200).json({
      success: true,
      message: 'Şifre başarıyla güncellendi'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Şifre değiştirilirken bir hata oluştu'
    });
  }
};

// @desc    Delete account
// @route   DELETE /api/v1/auth/account
// @access  Private
exports.deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Hesabınızı silmek için şifrenizi girmeniz gerekiyor'
      });
    }

    // Şifreyi doğrula
    const user = await User.findById(req.user.id).select('+password');
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Şifre hatalı'
      });
    }

    // Kullanıcıya ait tüm mülakatları sil
    const Interview = require('../models/Interview');
    await Interview.deleteMany({ userId: req.user.id });

    // Kullanıcıyı sil
    await User.findByIdAndDelete(req.user.id);

    res.status(200).json({
      success: true,
      message: 'Hesabınız ve tüm verileriniz başarıyla silindi'
    });

  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Hesap silinirken bir hata oluştu'
    });
  }
};