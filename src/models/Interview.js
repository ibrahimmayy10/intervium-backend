const mongoose = require('mongoose');

const interviewSchema = new mongoose.Schema({
  // İlişkiler
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Kullanıcı ID gereklidir']
  },
  professionId: {
    type: String,
    required: [true, 'Meslek ID gereklidir'],
    trim: true
  },
  characterId: {
    type: String,
    required: [true, 'Karakter ID gereklidir'],
    trim: true
  },
  
  // Mülakat Durumu
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'cancelled'],
    default: 'in_progress'
  },
  
  // Zaman Bilgileri
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  duration: {
    type: Number, // Dakika cinsinden
    min: 0
  },
  
  // Sonuçlar
  overallScore: {
    type: Number,
    min: 0,
    max: 100
  },
  feedback: {
    type: String,
    maxlength: [2000, 'Geri bildirim en fazla 2000 karakter olabilir']
  },
  strengths: [{
    type: String,
    maxlength: [500, 'Güçlü yön açıklaması en fazla 500 karakter olabilir']
  }],
  weaknesses: [{
    type: String,
    maxlength: [500, 'Gelişim alanı açıklaması en fazla 500 karakter olabilir']
  }],
  
  // İstatistikler (opsiyonel)
  questionCount: {
    type: Number,
    min: 0,
    default: 0
  },
  correctAnswers: {
    type: Number,
    min: 0,
    default: 0
  }
  
}, {
  timestamps: true // createdAt, updatedAt otomatik ekler
});

// Virtual field: Başarı yüzdesi
interviewSchema.virtual('successRate').get(function() {
  if (this.questionCount === 0) return 0;
  return Math.round((this.correctAnswers / this.questionCount) * 100);
});

// Index'ler (performans için)
interviewSchema.index({ userId: 1, createdAt: -1 }); // Kullanıcının mülakatları
interviewSchema.index({ professionId: 1 }); // Mesleğe göre
interviewSchema.index({ status: 1 }); // Duruma göre
interviewSchema.index({ overallScore: -1 }); // Puana göre sıralama

// Mülakat tamamlandığında otomatik süre hesapla
interviewSchema.pre('save', function() {  // ← next parametresini kaldır
  if (this.isModified('completedAt') && this.completedAt && this.startedAt) {
    const durationMs = this.completedAt - this.startedAt;
    this.duration = Math.round(durationMs / 60000); // Milisaniyeden dakikaya
  }
});

// JSON response'da __v gösterme
interviewSchema.methods.toJSON = function() {
  const interview = this.toObject({ virtuals: true });
  delete interview.__v;
  return interview;
};

// Static method: Kullanıcının ortalama puanı
interviewSchema.statics.getUserAverageScore = async function(userId) {
  const result = await this.aggregate([
    { $match: { userId: mongoose.Types.ObjectId(userId), status: 'completed' } },
    { $group: { _id: null, avgScore: { $avg: '$overallScore' } } }
  ]);
  
  return result.length > 0 ? Math.round(result[0].avgScore) : 0;
};

// Static method: Kullanıcının toplam mülakat sayısı
interviewSchema.statics.getUserInterviewCount = async function(userId, status = null) {
  const query = { userId };
  if (status) query.status = status;
  
  return await this.countDocuments(query);
};

// Static method: En iyi performans
interviewSchema.statics.getUserBestScore = async function(userId) {
  const result = await this.findOne({ 
    userId, 
    status: 'completed' 
  })
  .sort({ overallScore: -1 })
  .select('overallScore professionId createdAt');
  
  return result;
};

module.exports = mongoose.model('Interview', interviewSchema);