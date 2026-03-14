// controllers/AuthController.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  generateVerificationCode
} = require('../services/EmailService');

// ─── Token Helpers ────────────────────────────────────────────────────────────

const generateAccessToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });

const generateRefreshToken = (userId) =>
  jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRE });

const isCodeExpired = (expireDate) => !expireDate || new Date() > new Date(expireDate);

// ─── User Response Helper ─────────────────────────────────────────────────────
// Tüm endpointlerde tutarlı user objesi döndürmek için merkezi helper.
// İleride yeni alan eklenince sadece burası güncellenir.

const buildUserResponse = (user) => ({
  id: user._id,
  name: user.name,
  surname: user.surname,
  email: user.email,
  fullName: user.fullName,
  isPremium: user.isPremium ?? false,
  createdAt: user.createdAt
});

// ─── Password Validation ──────────────────────────────────────────────────────

const validatePassword = (password) => {
  if (!password || password.length < 8) {
    return 'Şifre en az 8 karakter olmalıdır';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Şifre en az bir büyük harf içermelidir';
  }
  if (!/[0-9]/.test(password)) {
    return 'Şifre en az bir rakam içermelidir';
  }
  return null; // geçerli
};

// ─── Register ─────────────────────────────────────────────────────────────────

// @desc    Register user — email doğrulama kodu gönderir, token VERMEZ
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, surname, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      if (!existingUser.isEmailVerified) {
        const code = generateVerificationCode();
        existingUser.emailVerificationCode = code;
        existingUser.emailVerificationExpire = new Date(Date.now() + 15 * 60 * 1000);
        await existingUser.save({ validateBeforeSave: false });
        await sendVerificationEmail(email, existingUser.name, code);

        return res.status(200).json({
          success: true,
          message: 'Doğrulama kodu e-posta adresinize tekrar gönderildi',
          data: { email, requiresVerification: true }
        });
      }

      return res.status(400).json({
        success: false,
        message: 'Bu email adresi zaten kullanılıyor'
      });
    }

    const code = generateVerificationCode();
    const codeExpire = new Date(Date.now() + 15 * 60 * 1000);

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const user = await User.create({
      name,
      surname,
      email,
      password,
      isEmailVerified: false,
      emailVerificationCode: code,
      emailVerificationExpire: codeExpire
    });

    await sendVerificationEmail(email, name, code);

    res.status(201).json({
      success: true,
      message: 'Doğrulama kodu e-posta adresinize gönderildi',
      data: { email, requiresVerification: true }
    });

  } catch (error) {
    console.error('Register error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: messages[0] || 'Geçersiz veri' });
    }
    res.status(500).json({ success: false, message: 'Kayıt sırasında bir hata oluştu' });
  }
};

// ─── Verify Email ─────────────────────────────────────────────────────────────

// @desc    Email doğrulama kodu kontrol et — başarılıysa token döner
// @route   POST /api/v1/auth/verify-email
// @access  Public
exports.verifyEmail = async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ success: false, message: 'Email ve kod gereklidir' });
    }

    const user = await User.findOne({ email })
      .select('+emailVerificationCode +emailVerificationExpire');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Bu hesap zaten doğrulanmış' });
    }

    if (isCodeExpired(user.emailVerificationExpire)) {
      return res.status(400).json({
        success: false,
        message: 'Doğrulama kodunun süresi dolmuş. Lütfen yeni kod isteyin',
        data: { codeExpired: true }
      });
    }

    if (user.emailVerificationCode !== code.trim()) {
      return res.status(400).json({ success: false, message: 'Geçersiz doğrulama kodu' });
    }

    user.isEmailVerified = true;
    user.emailVerificationCode = undefined;
    user.emailVerificationExpire = undefined;

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshToken = refreshToken;

    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: 'E-posta adresiniz başarıyla doğrulandı',
      data: {
        user: buildUserResponse(user),   // ← isPremium dahil
        token: accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Verify email error:', error);
    res.status(500).json({ success: false, message: 'Doğrulama sırasında bir hata oluştu' });
  }
};

// ─── Resend Verification Code ─────────────────────────────────────────────────

// @desc    Yeni doğrulama kodu gönder
// @route   POST /api/v1/auth/resend-verification
// @access  Public
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email gereklidir' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    if (user.isEmailVerified) {
      return res.status(400).json({ success: false, message: 'Bu hesap zaten doğrulanmış' });
    }

    const code = generateVerificationCode();
    user.emailVerificationCode = code;
    user.emailVerificationExpire = new Date(Date.now() + 15 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    await sendVerificationEmail(email, user.name, code);

    res.status(200).json({
      success: true,
      message: 'Doğrulama kodu tekrar gönderildi'
    });

  } catch (error) {
    console.error('Resend verification error:', error);
    res.status(500).json({ success: false, message: 'Kod gönderilemedi' });
  }
};

// ─── Login ────────────────────────────────────────────────────────────────────

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email ve şifre gereklidir' });
    }

    const user = await User.findOne({ email }).select('+password +refreshToken');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Email veya şifre hatalı' });
    }

    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      return res.status(400).json({ success: false, message: 'Email veya şifre hatalı' });
    }

    if (!user.isEmailVerified) {
      const code = generateVerificationCode();
      user.emailVerificationCode = code;
      user.emailVerificationExpire = new Date(Date.now() + 15 * 60 * 1000);
      await user.save({ validateBeforeSave: false });
      await sendVerificationEmail(email, user.name, code);

      return res.status(403).json({
        success: false,
        message: 'E-posta adresiniz doğrulanmamış. Doğrulama kodu tekrar gönderildi.',
        data: { email, requiresVerification: true }
      });
    }

    // Premium süresi dolmuşsa güncelle
    await user.checkAndUpdatePremium();

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: 'Giriş başarılı',
      data: {
        user: buildUserResponse(user),   // ← isPremium dahil
        token: accessToken,
        refreshToken
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Giriş sırasında bir hata oluştu' });
  }
};

// ─── Forgot Password ──────────────────────────────────────────────────────────

// @desc    Şifre sıfırlama kodu gönder
// @route   POST /api/v1/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email gereklidir' });
    }

    const user = await User.findOne({ email });

    if (!user) {
      // Güvenlik: kullanıcı yoksa bile aynı mesajı döndür
      return res.status(200).json({
        success: true,
        message: 'Şifre sıfırlama kodu e-posta adresinize gönderildi'
      });
    }

    const code = generateVerificationCode();
    user.passwordResetCode = code;
    user.passwordResetExpire = new Date(Date.now() + 15 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    await sendPasswordResetEmail(email, user.name, code);

    res.status(200).json({
      success: true,
      message: 'Şifre sıfırlama kodu e-posta adresinize gönderildi'
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ success: false, message: 'Kod gönderilemedi' });
  }
};

// ─── Reset Password ───────────────────────────────────────────────────────────

// @desc    Kod + yeni şifre ile şifre sıfırla
// @route   POST /api/v1/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, kod ve yeni şifre gereklidir' });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const user = await User.findOne({ email })
      .select('+passwordResetCode +passwordResetExpire +password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı' });
    }

    if (isCodeExpired(user.passwordResetExpire)) {
      return res.status(400).json({
        success: false,
        message: 'Şifre sıfırlama kodunun süresi dolmuş. Lütfen yeni kod isteyin',
        data: { codeExpired: true }
      });
    }

    if (user.passwordResetCode !== code.trim()) {
      return res.status(400).json({ success: false, message: 'Geçersiz sıfırlama kodu' });
    }

    user.password = newPassword;
    user.passwordResetCode = undefined;
    user.passwordResetExpire = undefined;
    user.refreshToken = undefined;

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Şifreniz başarıyla sıfırlandı. Lütfen yeni şifrenizle giriş yapın.'
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Şifre sıfırlanırken hata oluştu' });
  }
};

// ─── Refresh Token ────────────────────────────────────────────────────────────

exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'Refresh token gerekli' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Geçersiz veya süresi dolmuş refresh token' });
    }

    const user = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Geçersiz refresh token' });
    }

    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    user.refreshToken = newRefreshToken;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      data: { token: newAccessToken, refreshToken: newRefreshToken }
    });

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({ success: false, message: 'Token yenilenemedi' });
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────

exports.logout = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user) {
      user.refreshToken = null;
      await user.save({ validateBeforeSave: false });
    }
    res.status(200).json({ success: true, message: 'Çıkış başarılı' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Çıkış sırasında hata oluştu' });
  }
};

// ─── Get Me ───────────────────────────────────────────────────────────────────

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    // Premium süresi dolmuşsa giriş anında güncelle
    await user.checkAndUpdatePremium();

    res.status(200).json({
      success: true,
      data: {
        user: buildUserResponse(user)   // ← isPremium dahil
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ success: false, message: 'Kullanıcı bilgileri alınamadı' });
  }
};

// ─── Update Profile ───────────────────────────────────────────────────────────

exports.updateProfile = async (req, res) => {
  try {
    const { name, surname, email } = req.body;

    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
      if (existingUser) {
        return res.status(400).json({ success: false, message: 'Bu email adresi zaten kullanılıyor' });
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
      data: buildUserResponse(updatedUser)   // ← isPremium dahil
    });
  } catch (error) {
    console.error('Update profile error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: messages[0] || 'Geçersiz veri' });
    }
    res.status(500).json({ success: false, message: 'Profil güncellenirken bir hata oluştu' });
  }
};

// ─── Change Password ──────────────────────────────────────────────────────────

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Mevcut ve yeni şifre gereklidir' });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const user = await User.findById(req.user.id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Mevcut şifre hatalı' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: 'Yeni şifre mevcut şifreyle aynı olamaz' });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ success: true, message: 'Şifre başarıyla güncellendi' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Şifre değiştirilirken bir hata oluştu' });
  }
};

// ─── Delete Account ───────────────────────────────────────────────────────────

exports.deleteAccount = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: 'Hesabınızı silmek için şifrenizi girmeniz gerekiyor' });
    }

    const user = await User.findById(req.user.id).select('+password');
    const isMatch = await user.comparePassword(password);

    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Şifre hatalı' });
    }

    const Interview = require('../models/Interview');
    await Interview.deleteMany({ userId: req.user.id });
    await User.findByIdAndDelete(req.user.id);

    res.status(200).json({ success: true, message: 'Hesabınız ve tüm verileriniz başarıyla silindi' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ success: false, message: 'Hesap silinirken bir hata oluştu' });
  }
};