// models/User.js

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'İsim gereklidir'],
    trim: true,
    minlength: [2, 'İsim en az 2 karakter olmalıdır'],
    maxlength: [50, 'İsim en fazla 50 karakter olabilir']
  },
  surname: {
    type: String,
    required: [true, 'Soyisim gereklidir'],
    trim: true,
    minlength: [2, 'Soyisim en az 2 karakter olmalıdır'],
    maxlength: [50, 'Soyisim en fazla 50 karakter olabilir']
  },
  email: {
    type: String,
    required: [true, 'Email gereklidir'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Geçerli bir email adresi giriniz'
    ]
  },
  password: {
    type: String,
    required: [true, 'Şifre gereklidir'],
    minlength: [6, 'Şifre en az 6 karakter olmalıdır'],
    select: false
  },
  refreshToken: {
    type: String,
    select: false
  },

  // ─── Email Doğrulama ───────────────────────────────────────────
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationCode: {
    type: String,
    select: false
  },
  emailVerificationExpire: {
    type: Date,
    select: false
  },

  // ─── Şifre Sıfırlama ──────────────────────────────────────────
  passwordResetCode: {
    type: String,
    select: false
  },
  passwordResetExpire: {
    type: Date,
    select: false
  }

}, {
  timestamps: true
});

// Virtual: Full name
userSchema.virtual('fullName').get(function () {
  return `${this.name} ${this.surname}`;
});

// Password hash
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Password karşılaştırma
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// JSON response'da hassas alanları gizle
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  delete user.refreshToken;
  delete user.emailVerificationCode;
  delete user.emailVerificationExpire;
  delete user.passwordResetCode;
  delete user.passwordResetExpire;
  delete user.__v;
  return user;
};

module.exports = mongoose.model('User', userSchema);