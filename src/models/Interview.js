const mongoose = require('mongoose');

// ─── Soru bazlı geri bildirim (premium) ──────────────────────────────────────
const questionFeedbackSchema = new mongoose.Schema({
  questionNumber: { type: Number, required: true },
  question:       { type: String, required: true, maxlength: [1000, 'Soru en fazla 1000 karakter'] },
  userAnswer:     { type: String, required: true, maxlength: [3000, 'Cevap en fazla 3000 karakter'] },
  score:          { type: Number, min: 0, max: 100 },
  comment:        { type: String, maxlength: [1000, 'Yorum en fazla 1000 karakter'] },
  answerQuality:  { type: String, enum: ['strong', 'adequate', 'weak', 'unknown'], default: 'adequate' }
}, { _id: false });

// ─── Performans profili (premium) ────────────────────────────────────────────
// Radar chart için 5 eksen skoru
const performanceProfileSchema = new mongoose.Schema({
  technical:      { type: Number, min: 0, max: 100 },  // Teknik Bilgi
  communication:  { type: Number, min: 0, max: 100 },  // İletişim
  detailedness:   { type: Number, min: 0, max: 100 },  // Detaylılık
  problemSolving: { type: Number, min: 0, max: 100 },  // Problem Çözme
  confidence:     { type: Number, min: 0, max: 100 }   // Özgüven & Netlik
}, { _id: false });

// ─── İşe alım olasılığı (premium) ────────────────────────────────────────────
const hiringProbabilitySchema = new mongoose.Schema({
  percentage: { type: Number, min: 0, max: 100 },
  verdict:    { type: String, maxlength: [200, 'Karar ifadesi en fazla 200 karakter'] },
  reasoning:  { type: String, maxlength: [500, 'Gerekçe en fazla 500 karakter'] }
}, { _id: false });

// ─── Kişisel öğrenme yolu (premium) ──────────────────────────────────────────
const learningTopicSchema = new mongoose.Schema({
  title:       { type: String, maxlength: [100, 'Başlık en fazla 100 karakter'] },
  description: { type: String, maxlength: [500, 'Açıklama en fazla 500 karakter'] },
  priority:    { type: String, enum: ['high', 'medium', 'low'], default: 'medium' }
}, { _id: false });

// ─── Ana mülakat şeması ───────────────────────────────────────────────────────
const interviewSchema = new mongoose.Schema({
  // İlişkiler
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Kullanıcı ID gereklidir']
  },
  professionId: { type: String, required: [true, 'Meslek ID gereklidir'], trim: true },
  characterId:  { type: String, required: [true, 'Karakter ID gereklidir'], trim: true },

  // Durum & Zaman
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'cancelled'],
    default: 'in_progress'
  },
  startedAt:   { type: Date, default: Date.now },
  completedAt: { type: Date },
  duration:    { type: Number, min: 0 }, // dakika

  // Ana Sonuçlar (herkese görünür)
  overallScore: { type: Number, min: 0, max: 100 },
  feedback:     { type: String, maxlength: [2000, 'Geri bildirim en fazla 2000 karakter'] },
  strengths:    [{ type: String, maxlength: [500] }],
  improvements: [{ type: String, maxlength: [500] }],

  // Detaylı Skorlar (herkese görünür — premium kartında gösterilir)
  technicalScore:     { type: Number, min: 0, max: 100 },
  communicationScore: { type: Number, min: 0, max: 100 },
  detailedness:       { type: Number, min: 0, max: 100 },

  // İşe Alım Önerisi (herkese görünür — premium kartında gösterilir)
  recommendation: { type: String, maxlength: [500] },

  // ─── PREMIUM ALANLAR ─────────────────────────────────────────────────────
  // Sadece premium kullanıcılar için doldurulur ve gösterilir

  // Soru bazlı geri bildirim
  questionFeedbacks: {
    type: [questionFeedbackSchema],
    default: []
  },

  // Performans profili (radar chart)
  performanceProfile: {
    type: performanceProfileSchema,
    default: null
  },

  // İşe alım olasılığı
  hiringProbability: {
    type: hiringProbabilitySchema,
    default: null
  },

  // Kişisel öğrenme yolu
  learningPath: {
    type: [learningTopicSchema],
    default: []
  },
  // ─────────────────────────────────────────────────────────────────────────

  // İstatistikler
  questionCount:  { type: Number, min: 0, default: 0 },
  correctAnswers: { type: Number, min: 0, default: 0 }
}, {
  timestamps: true
});

// Virtuals
interviewSchema.virtual('successRate').get(function () {
  if (this.questionCount === 0) return 0;
  return Math.round((this.correctAnswers / this.questionCount) * 100);
});

interviewSchema.virtual('averageDetailScore').get(function () {
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

// Tamamlandığında otomatik süre hesapla
interviewSchema.pre('save', function (next) {
  if (this.isModified('completedAt') && this.completedAt && this.startedAt && !this.duration) {
    const durationMs = this.completedAt - this.startedAt;
    this.duration = Math.round(durationMs / 60000);
  }
  next();
});

interviewSchema.methods.toJSON = function () {
  const interview = this.toObject({ virtuals: true });
  delete interview.__v;
  return interview;
};

// Static methods
interviewSchema.statics.getUserAverageScore = async function (userId) {
  const result = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'completed' } },
    { $group: { _id: null, avgScore: { $avg: '$overallScore' } } }
  ]);
  return result.length > 0 ? Math.round(result[0].avgScore) : 0;
};

interviewSchema.statics.getUserAverageTechnicalScore = async function (userId) {
  const result = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'completed', technicalScore: { $exists: true } } },
    { $group: { _id: null, avgTechnical: { $avg: '$technicalScore' } } }
  ]);
  return result.length > 0 ? Math.round(result[0].avgTechnical) : 0;
};

interviewSchema.statics.getUserBestScore = async function (userId) {
  return await this.findOne({ userId, status: 'completed' })
    .sort({ overallScore: -1 })
    .select('overallScore professionId createdAt');
};

interviewSchema.statics.getUserInterviewCount = async function (userId, status = null) {
  const query = { userId };
  if (status) query.status = status;
  return await this.countDocuments(query);
};

module.exports = mongoose.model('Interview', interviewSchema);