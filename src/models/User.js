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
    minlength: [6, 'Şifre en az 8 karakter olmalıdır'],
    select: false // Query'lerde otomatik gelmesin
  }
}, {
  timestamps: true // createdAt, updatedAt otomatik ekler
});

// Virtual field: Full name
userSchema.virtual('fullName').get(function() {
  return `${this.name} ${this.surname}`;
});

// Password'u hashle (kaydetmeden önce)
userSchema.pre('save', async function() {  // ← next parametresini kaldırdık
  // Eğer password değişmediyse skip et
  if (!this.isModified('password')) {
    return;  // ← next() yerine return
  }

  // Password'u hashle (bcrypt)
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});  // ← next() kaldırıldı

// Password karşılaştırma metodu
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// JSON response'da password'u gösterme
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.__v;
  return user;
};

module.exports = mongoose.model('User', userSchema);