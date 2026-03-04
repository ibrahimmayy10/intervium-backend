// controllers/InterviewController.js

const Interview = require('../models/Interview');
const mongoose = require('mongoose');

// ─── Premium kontrolü yardımcısı ─────────────────────────────────────────────
// Sadece GET endpoint'lerinde gösterim kontrolü için kullanılır.
// Kayıt (POST) her zaman tüm alanları kaydeder — kullanıcı sonradan
// premiuma geçince eski mülakatlarına da erişebilsin.
const isPremiumActive = (user) =>
  user.isPremium &&
  user.premiumExpiresAt &&
  new Date() < new Date(user.premiumExpiresAt);

// @desc    Create new interview
// @route   POST /api/v1/interviews
// @access  Private
exports.createInterview = async (req, res) => {
  try {
    const {
      professionId,
      characterId,
      overallScore,
      feedback,
      strengths,
      improvements,
      technicalScore,
      communicationScore,
      detailedness,
      recommendation,
      // Premium alanlar
      questionFeedbacks,
      performanceProfile,
      hiringProbability,
      learningPath,
      // İstatistikler
      questionCount,
      correctAnswers,
      duration
    } = req.body;

    if (!professionId || !characterId) {
      return res.status(400).json({
        success: false,
        message: 'Meslek ve karakter bilgisi gereklidir'
      });
    }

    const userId = req.user.id;

    // ─── Günlük mülakat limiti kontrolü ──────────────────────────────────────
    // Ücretsiz: günde 1 mülakat | Premium: sınırsız
    if (!isPremiumActive(req.user)) {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const todayCount = await Interview.countDocuments({
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startOfDay }
      });

      if (todayCount >= 1) {
        return res.status(403).json({
          success: false,
          message: 'Günlük mülakat limitinize ulaştınız',
          code: 'DAILY_LIMIT_REACHED',
          data: {
            limit: 1,
            used: todayCount,
            resetAt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)
          }
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Tüm alanlar her zaman kaydedilir — premium/ücretsiz fark yok.
    // Premium kontrolü sadece GET /interviews/:id response'unda yapılır.
    // Böylece kullanıcı sonradan premiuma geçince eski mülakatlarına da erişebilir.
    const interview = await Interview.create({
      userId,
      professionId,
      characterId,
      status:      'completed',
      completedAt: new Date(),
      overallScore:       overallScore       || 0,
      feedback:           feedback           || '',
      strengths:          strengths          || [],
      improvements:       improvements       || [],
      technicalScore:     technicalScore     || 0,
      communicationScore: communicationScore || 0,
      detailedness:       detailedness       || 0,
      recommendation:     recommendation     || '',
      questionFeedbacks:  questionFeedbacks  || [],
      performanceProfile: performanceProfile || null,
      hiringProbability:  hiringProbability  || null,
      learningPath:       learningPath       || [],
      questionCount:  questionCount  || 0,
      correctAnswers: correctAnswers || 0,
      duration:       duration       || null
    });

    res.status(201).json({
      success: true,
      message: 'Mülakat kaydedildi',
      data: interview
    });

  } catch (error) {
    console.error('❌ Create interview error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: messages[0] || 'Geçersiz veri' });
    }
    res.status(500).json({ success: false, message: 'Mülakat kaydedilirken hata oluştu' });
  }
};

// @desc    Get all interviews for logged in user
// @route   GET /api/v1/interviews
// @access  Private
exports.getUserInterviews = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, professionId, limit = 10, page = 1 } = req.query;

    const query = { userId };
    if (status)      query.status = status;
    if (professionId) query.professionId = professionId;

    const skip = (page - 1) * parseInt(limit);

    // Premium alanlar listede gösterilmez, detay sayfasında gelir
    const interviews = await Interview.find(query)
      .select('-questionFeedbacks -performanceProfile -hiringProbability -learningPath')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Interview.countDocuments(query);

    res.status(200).json({
      success: true,
      count: interviews.length,
      total,
      page:  parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data:  interviews
    });

  } catch (error) {
    console.error('❌ Get user interviews error:', error);
    res.status(500).json({ success: false, message: 'Mülakatlar alınırken hata oluştu' });
  }
};

// @desc    Get single interview
// @route   GET /api/v1/interviews/:id
// @access  Private
exports.getInterview = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Geçersiz mülakat ID' });
    }

    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({ success: false, message: 'Mülakat bulunamadı' });
    }
    if (interview.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bu mülakata erişim yetkiniz yok' });
    }

    const interviewData = interview.toJSON();

    // Premium değilse tüm premium alanları sil
    if (!isPremiumActive(req.user)) {
      delete interviewData.questionFeedbacks;
      delete interviewData.performanceProfile;
      delete interviewData.hiringProbability;
      delete interviewData.learningPath;
    }

    res.status(200).json({ success: true, data: interviewData });

  } catch (error) {
    console.error('❌ Get interview error:', error);
    res.status(500).json({ success: false, message: 'Mülakat alınırken hata oluştu' });
  }
};

// @desc    Update interview
// @route   PUT /api/v1/interviews/:id
// @access  Private
exports.updateInterview = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Geçersiz mülakat ID' });
    }

    let interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({ success: false, message: 'Mülakat bulunamadı' });
    }
    if (interview.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bu mülakatı güncelleme yetkiniz yok' });
    }

    const {
      overallScore, feedback, strengths, improvements, status,
      technicalScore, communicationScore, detailedness, recommendation
    } = req.body;

    const updateData = {};
    if (overallScore       !== undefined) updateData.overallScore       = overallScore;
    if (feedback           !== undefined) updateData.feedback           = feedback;
    if (strengths          !== undefined) updateData.strengths          = strengths;
    if (improvements       !== undefined) updateData.improvements       = improvements;
    if (status             !== undefined) updateData.status             = status;
    if (technicalScore     !== undefined) updateData.technicalScore     = technicalScore;
    if (communicationScore !== undefined) updateData.communicationScore = communicationScore;
    if (detailedness       !== undefined) updateData.detailedness       = detailedness;
    if (recommendation     !== undefined) updateData.recommendation     = recommendation;

    interview = await Interview.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

    res.status(200).json({ success: true, message: 'Mülakat güncellendi', data: interview });

  } catch (error) {
    console.error('❌ Update interview error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: messages[0] || 'Geçersiz veri' });
    }
    res.status(500).json({ success: false, message: 'Mülakat güncellenirken hata oluştu' });
  }
};

// @desc    Delete interview
// @route   DELETE /api/v1/interviews/:id
// @access  Private
exports.deleteInterview = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Geçersiz mülakat ID' });
    }

    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({ success: false, message: 'Mülakat bulunamadı' });
    }
    if (interview.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Bu mülakatı silme yetkiniz yok' });
    }

    await interview.deleteOne();

    res.status(200).json({ success: true, message: 'Mülakat silindi', data: {} });

  } catch (error) {
    console.error('❌ Delete interview error:', error);
    res.status(500).json({ success: false, message: 'Mülakat silinirken hata oluştu' });
  }
};

// @desc    Get user statistics
// @route   GET /api/v1/interviews/stats
// @access  Private
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı ID' });
    }

    const totalInterviews = await Interview.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'completed'
    });

    if (totalInterviews === 0) {
      return res.status(200).json({
        success: true,
        data: {
          totalInterviews: 0, averageScore: 0, averageTechnicalScore: 0,
          detailedScores: { technical: 0, communication: 0, detailedness: 0 },
          bestScore: null, recentInterviews: 0,
          professionStats: [], characterStats: [], progressTrend: []
        }
      });
    }

    const averageScore        = await Interview.getUserAverageScore(userId);
    const averageTechnicalScore = await Interview.getUserAverageTechnicalScore(userId);
    const bestScore           = await Interview.getUserBestScore(userId);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentInterviews = await Interview.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'completed',
      createdAt: { $gte: sevenDaysAgo }
    });

    const detailedScores = await Interview.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'completed' } },
      {
        $group: {
          _id: null,
          avgTechnical:    { $avg: '$technicalScore' },
          avgCommunication:{ $avg: '$communicationScore' },
          avgDetailedness: { $avg: '$detailedness' }
        }
      }
    ]);

    const professionStats = await Interview.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'completed' } },
      {
        $group: {
          _id: '$professionId',
          count:      { $sum: 1 },
          avgScore:   { $avg: '$overallScore' },
          avgTechnical:{ $avg: '$technicalScore' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const characterStats = await Interview.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), status: 'completed' } },
      {
        $group: {
          _id: '$characterId',
          count:    { $sum: 1 },
          avgScore: { $avg: '$overallScore' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const progressTrend = await Interview.find({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'completed'
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('overallScore technicalScore communicationScore createdAt');

    const premium = isPremiumActive(req.user);

    // Premium: performanceProfile ortalaması
    let avgPerformanceProfile = null;
    if (premium) {
      const profileAgg = await Interview.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            status: 'completed',
            performanceProfile: { $ne: null }
          }
        },
        {
          $group: {
            _id: null,
            avgTechnical:      { $avg: '$performanceProfile.technical' },
            avgCommunication:  { $avg: '$performanceProfile.communication' },
            avgDetailedness:   { $avg: '$performanceProfile.detailedness' },
            avgProblemSolving: { $avg: '$performanceProfile.problemSolving' },
            avgConfidence:     { $avg: '$performanceProfile.confidence' }
          }
        }
      ]);
      if (profileAgg.length > 0) {
        avgPerformanceProfile = {
          technical:      Math.round(profileAgg[0].avgTechnical      || 0),
          communication:  Math.round(profileAgg[0].avgCommunication  || 0),
          detailedness:   Math.round(profileAgg[0].avgDetailedness   || 0),
          problemSolving: Math.round(profileAgg[0].avgProblemSolving || 0),
          confidence:     Math.round(profileAgg[0].avgConfidence     || 0)
        };
      }
    }

    // Premium: hiringProbability ortalaması
    let avgHiringProbability = null;
    if (premium) {
      const hiringAgg = await Interview.aggregate([
        {
          $match: {
            userId: new mongoose.Types.ObjectId(userId),
            status: 'completed',
            hiringProbability: { $ne: null }
          }
        },
        {
          $group: {
            _id: null,
            avgPercentage: { $avg: '$hiringProbability.percentage' },
            count: { $sum: 1 }
          }
        }
      ]);
      if (hiringAgg.length > 0) {
        avgHiringProbability = {
          percentage: Math.round(hiringAgg[0].avgPercentage || 0),
          count: hiringAgg[0].count
        };
      }
    }

    res.status(200).json({
      success: true,
      data: {
        totalInterviews,
        averageScore,
        averageTechnicalScore,
        detailedScores: detailedScores.length > 0 ? {
          technical:    Math.round(detailedScores[0].avgTechnical     || 0),
          communication:Math.round(detailedScores[0].avgCommunication || 0),
          detailedness: Math.round(detailedScores[0].avgDetailedness  || 0)
        } : { technical: 0, communication: 0, detailedness: 0 },
        bestScore: bestScore ? {
          score: bestScore.overallScore,
          professionId: bestScore.professionId,
          date: bestScore.createdAt
        } : null,
        recentInterviews,
        professionStats: professionStats.map(stat => ({
          professionId:   stat._id,
          count:          stat.count,
          averageScore:   Math.round(stat.avgScore    || 0),
          averageTechnical: Math.round(stat.avgTechnical || 0)
        })),
        characterStats: characterStats.map(stat => ({
          characterId:  stat._id,
          count:        stat.count,
          averageScore: Math.round(stat.avgScore || 0)
        })),
        progressTrend: progressTrend.reverse(),
        // Premium alanlar — sadece aktif premium kullanıcıya gönderilir
        avgPerformanceProfile,
        avgHiringProbability
      }
    });

  } catch (error) {
    console.error('❌ Get user stats error:', error);
    res.status(500).json({ success: false, message: 'İstatistikler alınırken hata oluştu' });
  }
};

// ─── PREMIUM: Geçmiş Karşılaştırma ───────────────────────────────────────────

// @desc    Son mülakatı bir öncekiyle karşılaştır (premium)
// @route   GET /api/v1/interviews/premium/comparison
// @access  Private + Premium
exports.getPremiumComparison = async (req, res) => {
  try {
    const userId = req.user.id;
    const { professionId, characterId } = req.query;

    const query = { userId: new mongoose.Types.ObjectId(userId), status: 'completed' };
    if (professionId) query.professionId = professionId;
    if (characterId)  query.characterId  = characterId;

    const lastTwo = await Interview.find(query)
      .sort({ createdAt: -1 })
      .limit(2)
      .select('overallScore technicalScore communicationScore detailedness createdAt professionId characterId');

    if (lastTwo.length < 2) {
      return res.status(200).json({
        success: true,
        data: { hasComparison: false, message: 'Karşılaştırma için en az 2 mülakat gereklidir' }
      });
    }

    const [latest, previous] = lastTwo;

    res.status(200).json({
      success: true,
      data: {
        hasComparison: true,
        latest: {
          id: latest._id,
          overallScore: latest.overallScore, technicalScore: latest.technicalScore,
          communicationScore: latest.communicationScore, detailedness: latest.detailedness,
          createdAt: latest.createdAt
        },
        previous: {
          id: previous._id,
          overallScore: previous.overallScore, technicalScore: previous.technicalScore,
          communicationScore: previous.communicationScore, detailedness: previous.detailedness,
          createdAt: previous.createdAt
        },
        delta: {
          overallScore:      (latest.overallScore      || 0) - (previous.overallScore      || 0),
          technicalScore:    (latest.technicalScore    || 0) - (previous.technicalScore    || 0),
          communicationScore:(latest.communicationScore|| 0) - (previous.communicationScore|| 0),
          detailedness:      (latest.detailedness      || 0) - (previous.detailedness      || 0)
        }
      }
    });

  } catch (error) {
    console.error('❌ Get premium comparison error:', error);
    res.status(500).json({ success: false, message: 'Karşılaştırma alınamadı' });
  }
};

// @desc    Tüm geçmiş ilerleme trendi (premium - detaylı)
// @route   GET /api/v1/interviews/premium/progress
// @access  Private + Premium
exports.getPremiumProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { professionId, characterId, limit = 20 } = req.query;

    const query = { userId: new mongoose.Types.ObjectId(userId), status: 'completed' };
    if (professionId) query.professionId = professionId;
    if (characterId)  query.characterId  = characterId;

    const interviews = await Interview.find(query)
      .sort({ createdAt: 1 })
      .limit(parseInt(limit))
      .select('overallScore technicalScore communicationScore detailedness createdAt professionId characterId');

    if (interviews.length === 0) {
      return res.status(200).json({ success: true, data: { interviews: [], trend: 'insufficient_data' } });
    }

    const half = Math.floor(interviews.length / 2);
    let trend = 'stable';

    if (interviews.length >= 4) {
      const firstHalf  = interviews.slice(0, half);
      const secondHalf = interviews.slice(half);
      const avgFirst  = firstHalf.reduce( (sum, i) => sum + (i.overallScore || 0), 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((sum, i) => sum + (i.overallScore || 0), 0) / secondHalf.length;
      const diff = avgSecond - avgFirst;
      if      (diff >  5) trend = 'improving';
      else if (diff < -5) trend = 'declining';
      else                trend = 'stable';
    }

    res.status(200).json({
      success: true,
      data: { interviews, trend, totalCount: interviews.length }
    });

  } catch (error) {
    console.error('❌ Get premium progress error:', error);
    res.status(500).json({ success: false, message: 'İlerleme verisi alınamadı' });
  }
};

// @desc    Geçmiş mülakatlar (non-premium, temel)
// @route   GET /api/v1/interviews/recent
// @access  Private
exports.getRecentInterviews = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı ID' });
    }

    const interviews = await Interview.find({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'completed'
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('professionId characterId overallScore createdAt duration');

    res.status(200).json({ success: true, count: interviews.length, data: interviews });

  } catch (error) {
    console.error('❌ Get recent interviews error:', error);
    res.status(500).json({ success: false, message: 'Son mülakatlar alınırken hata oluştu' });
  }
};

// @desc    Get user statistics by profession
// @route   GET /api/v1/interviews/stats/profession/:professionId
// @access  Private
exports.getUserStatsByProfession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { professionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı ID' });
    }

    const totalInterviews = await Interview.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      professionId,
      status: 'completed'
    });

    if (totalInterviews === 0) {
      return res.status(200).json({
        success: true,
        data: {
          totalInterviews: 0, averageScore: 0, averageTechnicalScore: 0,
          detailedScores: { technical: 0, communication: 0, detailedness: 0 },
          bestScore: null, recentInterviews: 0,
          professionStats: [], characterStats: [], progressTrend: []
        }
      });
    }

    const scoreStats = await Interview.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), professionId, status: 'completed' } },
      {
        $group: {
          _id: null,
          avgScore:        { $avg: '$overallScore' },
          avgTechnical:    { $avg: '$technicalScore' },
          avgCommunication:{ $avg: '$communicationScore' },
          avgDetailedness: { $avg: '$detailedness' }
        }
      }
    ]);

    const averageScore          = scoreStats.length > 0 ? Math.round(scoreStats[0].avgScore    || 0) : 0;
    const averageTechnicalScore = scoreStats.length > 0 ? Math.round(scoreStats[0].avgTechnical || 0) : 0;

    const bestScore = await Interview.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      professionId,
      status: 'completed'
    }).sort({ overallScore: -1 }).select('overallScore professionId createdAt');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentInterviews = await Interview.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      professionId,
      status: 'completed',
      createdAt: { $gte: sevenDaysAgo }
    });

    const characterStats = await Interview.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId), professionId, status: 'completed' } },
      {
        $group: {
          _id: '$characterId',
          count:    { $sum: 1 },
          avgScore: { $avg: '$overallScore' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const progressTrend = await Interview.find({
      userId: new mongoose.Types.ObjectId(userId),
      professionId,
      status: 'completed'
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('overallScore technicalScore communicationScore createdAt professionId');

    res.status(200).json({
      success: true,
      data: {
        totalInterviews,
        averageScore,
        averageTechnicalScore,
        detailedScores: scoreStats.length > 0 ? {
          technical:    Math.round(scoreStats[0].avgTechnical     || 0),
          communication:Math.round(scoreStats[0].avgCommunication || 0),
          detailedness: Math.round(scoreStats[0].avgDetailedness  || 0)
        } : { technical: 0, communication: 0, detailedness: 0 },
        bestScore: bestScore ? {
          score: bestScore.overallScore,
          professionId: bestScore.professionId,
          date: bestScore.createdAt
        } : null,
        recentInterviews,
        professionStats: [{ professionId, count: totalInterviews, averageScore, averageTechnical: averageTechnicalScore }],
        characterStats: characterStats.map(stat => ({
          characterId:  stat._id,
          count:        stat.count,
          averageScore: Math.round(stat.avgScore || 0)
        })),
        progressTrend: progressTrend.reverse()
      }
    });

  } catch (error) {
    console.error('❌ Get user stats by profession error:', error);
    res.status(500).json({ success: false, message: 'Meslek istatistikleri alınırken hata oluştu' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERVIEW LIMIT STATUS
// GET /api/v1/interviews/limit-status
// Kullanıcının günlük mülakat hakkını döndürür
// ─────────────────────────────────────────────────────────────────────────────
exports.getInterviewLimitStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const premium = isPremiumActive(req.user);

    if (premium) {
      return res.status(200).json({
        success: true,
        data: {
          isPremium: true,
          limit: null,        // sınırsız
          used: null,
          remaining: null,
          canInterview: true,
          resetAt: null
        }
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const resetAt = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const used = await Interview.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      createdAt: { $gte: startOfDay }
    });

    const limit     = 1;
    const remaining = Math.max(0, limit - used);

    return res.status(200).json({
      success: true,
      data: {
        isPremium:    false,
        limit,
        used,
        remaining,
        canInterview: remaining > 0,
        resetAt
      }
    });

  } catch (error) {
    console.error('❌ getInterviewLimitStatus error:', error);
    return res.status(500).json({ success: false, message: 'Limit bilgisi alınamadı' });
  }
};