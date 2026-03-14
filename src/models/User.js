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
    minlength: [8, 'Şifre en az 8 karakter olmalıdır'],
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
  },

  // ─── Premium Üyelik ───────────────────────────────────────────
  isPremium: {
    type: Boolean,
    default: false
  },
  premiumExpiresAt: {
    type: Date,
    default: null
  },
  // Apple'dan gelen orijinal transaction ID (ilk satın alma)
  appleOriginalTransactionId: {
    type: String,
    default: null,
    select: false
  },
  // Son Apple transaction ID (en son yenileme)
  appleLatestTransactionId: {
    type: String,
    default: null,
    select: false
  },
  // Abonelik durumu: active, expired, cancelled, grace_period, trial
  subscriptionStatus: {
    type: String,
    enum: ['none', 'active', 'expired', 'cancelled', 'grace_period', 'trial'],
    default: 'none'
  },

  // ─── Deneme Süresi ────────────────────────────────────────────
  isTrialUsed: {
    type: Boolean,
    default: false
  },
  trialStartedAt: {
    type: Date,
    default: null
  }

}, {
  timestamps: true
});

// Virtual: Full name
userSchema.virtual('fullName').get(function () {
  return `${this.name} ${this.surname}`;
});

// Virtual: Premium aktif mi? (tarih kontrolü dahil)
userSchema.virtual('isPremiumActive').get(function () {
  if (!this.isPremium) return false;
  if (!this.premiumExpiresAt) return false;
  return new Date() < new Date(this.premiumExpiresAt);
});

// Password hash
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Premium süre kontrolü — her sorguda otomatik güncelle
userSchema.pre('findOne', function () {
  // Süresi dolmuş premium'ları otomatik kapat (gerçek zamanlı kontrol)
});

// Password karşılaştırma
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Premium durumu kontrol et ve gerekirse güncelle
userSchema.methods.checkAndUpdatePremium = async function () {
  if (this.isPremium && this.premiumExpiresAt && new Date() > new Date(this.premiumExpiresAt)) {
    this.isPremium = false;
    this.subscriptionStatus = 'expired';
    await this.save({ validateBeforeSave: false });
  }
  return this.isPremium;
};

// JSON response'da hassas alanları gizle
userSchema.methods.toJSON = function () {
  const user = this.toObject({ virtuals: true });
  delete user.password;
  delete user.refreshToken;
  delete user.emailVerificationCode;
  delete user.emailVerificationExpire;
  delete user.passwordResetCode;
  delete user.passwordResetExpire;
  delete user.appleOriginalTransactionId;
  delete user.appleLatestTransactionId;
  delete user.__v;
  return user;
};

module.exports = mongoose.model('User', userSchema);