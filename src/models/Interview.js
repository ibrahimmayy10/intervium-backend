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
    type: Number, // dakika cinsinden
    min: 0
  },
  
  // Ana Sonuçlar
  overallScore: {
    type: Number,
    min: 0,
    max: 100
  },
  feedback: {
    type: String,
    maxlength: [2000, 'Geri bildirim en fazla 2000 karakter olabilir']
  },
  
  // Detaylı Skorlar
  technicalScore: {
    type: Number,
    min: 0,
    max: 100
  },
  communicationScore: {
    type: Number,
    min: 0,
    max: 100
  },
  detailedness: {
    type: Number,
    min: 0,
    max: 100
  },
  
  // Güçlü Yönler
  strengths: [{
    type: String,
    maxlength: [500, 'Güçlü yön açıklaması en fazla 500 karakter olabilir']
  }],
  
  // İyileştirme Önerileri (Swift'teki "improvements" ile aynı)
  improvements: [{
    type: String,
    maxlength: [500, 'İyileştirme önerisi en fazla 500 karakter olabilir']
  }],
  
  // İşe Alım Önerisi
  recommendation: {
    type: String,
    maxlength: [500, 'Öneri en fazla 500 karakter olabilir']
  },
  
  // İstatistikler
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
  timestamps: true
});

// Virtual field: Başarı yüzdesi
interviewSchema.virtual('successRate').get(function() {
  if (this.questionCount === 0) return 0;
  return Math.round((this.correctAnswers / this.questionCount) * 100);
});

// Virtual field: Ortalama detay skoru
interviewSchema.virtual('averageDetailScore').get(function() {
  const scores = [this.technicalScore, this.communicationScore, this.detailedness].filter(s => s != null);
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
});

// Index'ler
interviewSchema.index({ userId: 1, createdAt: -1 });
interviewSchema.index({ professionId: 1 });
interviewSchema.index({ status: 1 });
interviewSchema.index({ overallScore: -1 });
interviewSchema.index({ technicalScore: -1 });

// Mülakat tamamlandığında otomatik süre hesapla (eğer manuel gönderilmemişse)
interviewSchema.pre('save', function(next) {
  if (this.isModified('completedAt') && this.completedAt && this.startedAt && !this.duration) {
    const durationMs = this.completedAt - this.startedAt;
    this.duration = Math.round(durationMs / 60000); // milisaniye -> dakika
  }
  next();
});

// JSON response'da __v gösterme
interviewSchema.methods.toJSON = function() {
  const interview = this.toObject({ virtuals: true });
  delete interview.__v;
  return interview;
};

// Static methods
// models/Interview.js

// ✅ getUserAverageScore (ObjectId düzeltmesi)
interviewSchema.statics.getUserAverageScore = async function(userId) {
  const result = await this.aggregate([
    { 
      $match: { 
        userId: new mongoose.Types.ObjectId(userId),  // ✅ new ekledik
        status: 'completed' 
      } 
    },
    { 
      $group: { 
        _id: null, 
        avgScore: { $avg: '$overallScore' } 
      } 
    }
  ]);
  
  return result.length > 0 ? Math.round(result[0].avgScore) : 0;
};

// ✅ getUserAverageTechnicalScore (ObjectId düzeltmesi)
interviewSchema.statics.getUserAverageTechnicalScore = async function(userId) {
  const result = await this.aggregate([
    { 
      $match: { 
        userId: new mongoose.Types.ObjectId(userId),  // ✅ new ekledik
        status: 'completed', 
        technicalScore: { $exists: true } 
      } 
    },
    { 
      $group: { 
        _id: null, 
        avgTechnical: { $avg: '$technicalScore' } 
      } 
    }
  ]);
  
  return result.length > 0 ? Math.round(result[0].avgTechnical) : 0;
};

// ✅ getUserBestScore (zaten doğru ama kontrol edelim)
interviewSchema.statics.getUserBestScore = async function(userId) {
  const result = await this.findOne({ 
    userId, 
    status: 'completed' 
  })
  .sort({ overallScore: -1 })
  .select('overallScore professionId createdAt');
  
  return result;
};

// ✅ getUserInterviewCount (zaten doğru)
interviewSchema.statics.getUserInterviewCount = async function(userId, status = null) {
  const query = { userId };
  if (status) query.status = status;
  return await this.countDocuments(query);
};

module.exports = mongoose.model('Interview', interviewSchema);