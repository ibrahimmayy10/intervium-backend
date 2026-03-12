// controllers/InterviewController.js

const Interview = require('../models/Interview');
const mongoose = require('mongoose');

// ─── Premium kontrolü yardımcısı ─────────────────────────────────────────────
const isPremiumActive = (user) =>
  user.isPremium &&
  user.premiumExpiresAt &&
  new Date() < new Date(user.premiumExpiresAt);

// ─── Ortak filtre sabitleri ───────────────────────────────────────────────────
// Placeholder kayıtları istatistiklerden hariç tutan filtre
const statsMatch = (userId) => ({
  userId: new mongoose.Types.ObjectId(userId),
  status: 'completed',
  isPlaceholder: { $ne: true }
});

// ─── Create Interview ─────────────────────────────────────────────────────────

// @desc    Create new interview
// @route   POST /api/v1/interviews
// @access  Private
exports.createInterview = async (req, res) => {
  try {
    const {
      professionId, characterId,
      overallScore, feedback, strengths, improvements,
      technicalScore, communicationScore, detailedness, recommendation,
      questionFeedbacks, performanceProfile, hiringProbability, learningPath,
      questionCount, correctAnswers, duration
    } = req.body;

    if (!professionId || !characterId) {
      return res.status(400).json({ success: false, message: 'Meslek ve karakter bilgisi gereklidir' });
    }

    const userId = req.user.id;

    if (!isPremiumActive(req.user)) {
      const startOfDay = getTurkeyStartOfDay();

      const realInterviewCount = await Interview.countDocuments({
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startOfDay },
        isPlaceholder: { $ne: true }
      });

      if (realInterviewCount >= 1) {
        return res.status(403).json({
          success: false,
          message: 'Günlük mülakat limitinize ulaştınız',
          code: 'DAILY_LIMIT_REACHED',
          data: {
            limit: 1,
            used: realInterviewCount,
            resetAt: new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000)
          }
        });
      }
    }

    const interview = await Interview.create({
      userId,
      professionId,
      characterId,
      status: 'completed',
      completedAt: new Date(),
      isPlaceholder: false,
      overallScore: overallScore || 0,
      feedback: feedback || '',
      strengths: strengths || [],
      improvements: improvements || [],
      technicalScore: technicalScore || 0,
      communicationScore: communicationScore || 0,
      detailedness: detailedness || 0,
      recommendation: recommendation || '',
      questionFeedbacks: questionFeedbacks || [],
      performanceProfile: performanceProfile || null,
      hiringProbability: hiringProbability || null,
      learningPath: learningPath || [],
      questionCount: questionCount || 0,
      correctAnswers: correctAnswers || 0,
      duration: duration || null
    });

    res.status(201).json({ success: true, message: 'Mülakat kaydedildi', data: interview });

  } catch (error) {
    console.error('❌ Create interview error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ success: false, message: messages[0] || 'Geçersiz veri' });
    }
    res.status(500).json({ success: false, message: 'Mülakat kaydedilirken hata oluştu' });
  }
};

// ─── Complete Interview (limit tüketimi) ──────────────────────────────────────

// @desc    Mülakat tamamlandı — limit tüket, placeholder kayıt oluştur
// @route   POST /api/v1/interviews/complete
// @access  Private
exports.completeInterview = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!isPremiumActive(req.user)) {
      const startOfDay = getTurkeyStartOfDay();
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

    // Placeholder kayıt — sadece limit tüketmek için, istatistiklere dahil edilmez
    await Interview.create({
      userId,
      status: 'completed',
      completedAt: new Date(),
      professionId: req.body.professionId || 'unknown',
      characterId: req.body.characterId || 'unknown',
      isPlaceholder: true,
      overallScore: 0,
      feedback: '',
      strengths: [],
      improvements: [],
      technicalScore: 0,
      communicationScore: 0,
      detailedness: 0,
      recommendation: ''
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('❌ completeInterview error:', error);
    return res.status(500).json({ success: false, message: 'Mülakat tamamlanamadı' });
  }
};

// ─── Get User Interviews ──────────────────────────────────────────────────────

// @desc    Get all interviews for logged in user
// @route   GET /api/v1/interviews
// @access  Private
exports.getUserInterviews = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, professionId, limit = 10, page = 1 } = req.query;

    const query = { userId, isPlaceholder: { $ne: true } };
    if (status) query.status = status;
    if (professionId) query.professionId = professionId;

    const skip = (page - 1) * parseInt(limit);

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
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data: interviews
    });

  } catch (error) {
    console.error('❌ Get user interviews error:', error);
    res.status(500).json({ success: false, message: 'Mülakatlar alınırken hata oluştu' });
  }
};

// ─── Get Single Interview ─────────────────────────────────────────────────────

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

// ─── Update Interview ─────────────────────────────────────────────────────────

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
    if (overallScore !== undefined) updateData.overallScore = overallScore;
    if (feedback !== undefined) updateData.feedback = feedback;
    if (strengths !== undefined) updateData.strengths = strengths;
    if (improvements !== undefined) updateData.improvements = improvements;
    if (status !== undefined) updateData.status = status;
    if (technicalScore !== undefined) updateData.technicalScore = technicalScore;
    if (communicationScore !== undefined) updateData.communicationScore = communicationScore;
    if (detailedness !== undefined) updateData.detailedness = detailedness;
    if (recommendation !== undefined) updateData.recommendation = recommendation;

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

// ─── Delete Interview ─────────────────────────────────────────────────────────

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

// ─── Get User Stats ───────────────────────────────────────────────────────────

// @desc    Get user statistics
// @route   GET /api/v1/interviews/stats
// @access  Private
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı ID' });
    }

    const filter = statsMatch(userId);

    const totalInterviews = await Interview.countDocuments(filter);

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

    // Ortalamalar — placeholder hariç
    const avgAgg = await Interview.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$overallScore' },
          avgTechnical: { $avg: '$technicalScore' },
          avgCommunication: { $avg: '$communicationScore' },
          avgDetailedness: { $avg: '$detailedness' }
        }
      }
    ]);

    const averageScore = avgAgg.length > 0 ? Math.round(avgAgg[0].avgScore || 0) : 0;
    const averageTechnicalScore = avgAgg.length > 0 ? Math.round(avgAgg[0].avgTechnical || 0) : 0;

    // En iyi skor
    const bestScoreDoc = await Interview.findOne(filter)
      .sort({ overallScore: -1 })
      .select('overallScore professionId createdAt');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentInterviews = await Interview.countDocuments({
      ...filter,
      createdAt: { $gte: sevenDaysAgo }
    });

    const detailedScores = avgAgg.length > 0 ? {
      technical: Math.round(avgAgg[0].avgTechnical || 0),
      communication: Math.round(avgAgg[0].avgCommunication || 0),
      detailedness: Math.round(avgAgg[0].avgDetailedness || 0)
    } : { technical: 0, communication: 0, detailedness: 0 };

    const professionStats = await Interview.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$professionId',
          count: { $sum: 1 },
          avgScore: { $avg: '$overallScore' },
          avgTechnical: { $avg: '$technicalScore' }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    const characterStats = await Interview.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$characterId',
          count: { $sum: 1 },
          avgScore: { $avg: '$overallScore' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const progressTrend = await Interview.find(filter)
      .sort({ createdAt: -1 })
      .limit(10)
      .select('overallScore technicalScore communicationScore createdAt');

    const premium = isPremiumActive(req.user);

    // Premium: performanceProfile ortalaması
    let avgPerformanceProfile = null;
    if (premium) {
      const profileAgg = await Interview.aggregate([
        { $match: { ...filter, performanceProfile: { $ne: null } } },
        {
          $group: {
            _id: null,
            avgTechnical: { $avg: '$performanceProfile.technical' },
            avgCommunication: { $avg: '$performanceProfile.communication' },
            avgDetailedness: { $avg: '$performanceProfile.detailedness' },
            avgProblemSolving: { $avg: '$performanceProfile.problemSolving' },
            avgConfidence: { $avg: '$performanceProfile.confidence' }
          }
        }
      ]);
      if (profileAgg.length > 0) {
        avgPerformanceProfile = {
          technical: Math.round(profileAgg[0].avgTechnical || 0),
          communication: Math.round(profileAgg[0].avgCommunication || 0),
          detailedness: Math.round(profileAgg[0].avgDetailedness || 0),
          problemSolving: Math.round(profileAgg[0].avgProblemSolving || 0),
          confidence: Math.round(profileAgg[0].avgConfidence || 0)
        };
      }
    }

    // Premium: hiringProbability ortalaması
    let avgHiringProbability = null;
    if (premium) {
      const hiringAgg = await Interview.aggregate([
        { $match: { ...filter, hiringProbability: { $ne: null } } },
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
        detailedScores,
        bestScore: bestScoreDoc ? {
          score: bestScoreDoc.overallScore,
          professionId: bestScoreDoc.professionId,
          date: bestScoreDoc.createdAt
        } : null,
        recentInterviews,
        professionStats: professionStats.map(stat => ({
          professionId: stat._id,
          count: stat.count,
          averageScore: Math.round(stat.avgScore || 0),
          averageTechnical: Math.round(stat.avgTechnical || 0)
        })),
        characterStats: characterStats.map(stat => ({
          characterId: stat._id,
          count: stat.count,
          averageScore: Math.round(stat.avgScore || 0)
        })),
        progressTrend: progressTrend.reverse(),
        avgPerformanceProfile,
        avgHiringProbability
      }
    });

  } catch (error) {
    console.error('❌ Get user stats error:', error);
    res.status(500).json({ success: false, message: 'İstatistikler alınırken hata oluştu' });
  }
};

// ─── Get User Stats By Profession ────────────────────────────────────────────

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

    const filter = { ...statsMatch(userId), professionId };

    const totalInterviews = await Interview.countDocuments(filter);

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
      { $match: filter },
      {
        $group: {
          _id: null,
          avgScore: { $avg: '$overallScore' },
          avgTechnical: { $avg: '$technicalScore' },
          avgCommunication: { $avg: '$communicationScore' },
          avgDetailedness: { $avg: '$detailedness' }
        }
      }
    ]);

    const averageScore = scoreStats.length > 0 ? Math.round(scoreStats[0].avgScore || 0) : 0;
    const averageTechnicalScore = scoreStats.length > 0 ? Math.round(scoreStats[0].avgTechnical || 0) : 0;

    const bestScore = await Interview.findOne(filter)
      .sort({ overallScore: -1 })
      .select('overallScore professionId createdAt');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentInterviews = await Interview.countDocuments({
      ...filter,
      createdAt: { $gte: sevenDaysAgo }
    });

    const characterStats = await Interview.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$characterId',
          count: { $sum: 1 },
          avgScore: { $avg: '$overallScore' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    const progressTrend = await Interview.find(filter)
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
          technical: Math.round(scoreStats[0].avgTechnical || 0),
          communication: Math.round(scoreStats[0].avgCommunication || 0),
          detailedness: Math.round(scoreStats[0].avgDetailedness || 0)
        } : { technical: 0, communication: 0, detailedness: 0 },
        bestScore: bestScore ? {
          score: bestScore.overallScore,
          professionId: bestScore.professionId,
          date: bestScore.createdAt
        } : null,
        recentInterviews,
        professionStats: [{ professionId, count: totalInterviews, averageScore, averageTechnical: averageTechnicalScore }],
        characterStats: characterStats.map(stat => ({
          characterId: stat._id,
          count: stat.count,
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

// ─── Interview Limit Status ───────────────────────────────────────────────────

// @desc    Kullanıcının günlük mülakat hakkını döndürür
// @route   GET /api/v1/interviews/limit-status
// @access  Private
exports.getInterviewLimitStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const premium = isPremiumActive(req.user);

    if (premium) {
      return res.status(200).json({
        success: true,
        data: { isPremium: true, limit: null, used: null, remaining: null, canInterview: true, resetAt: null }
      });
    }

    const startOfDay = getTurkeyStartOfDay();
    const resetAt = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const used = await Interview.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      createdAt: { $gte: startOfDay }
    });

    const limit = 1;
    const remaining = Math.max(0, limit - used);

    return res.status(200).json({
      success: true,
      data: { isPremium: false, limit, used, remaining, canInterview: remaining > 0, resetAt }
    });

  } catch (error) {
    console.error('❌ getInterviewLimitStatus error:', error);
    return res.status(500).json({ success: false, message: 'Limit bilgisi alınamadı' });
  }
};

// ─── Recent Interviews ────────────────────────────────────────────────────────

exports.getRecentInterviews = async (req, res) => {
  try {
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ success: false, message: 'Geçersiz kullanıcı ID' });
    }

    const interviews = await Interview.find({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'completed',
      isPlaceholder: { $ne: true }
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

// ─── Premium: Karşılaştırma ───────────────────────────────────────────────────

exports.getPremiumComparison = async (req, res) => {
  try {
    const userId = req.user.id;
    const { professionId, characterId } = req.query;

    const query = { ...statsMatch(userId) };
    if (professionId) query.professionId = professionId;
    if (characterId) query.characterId = characterId;

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
          overallScore: (latest.overallScore || 0) - (previous.overallScore || 0),
          technicalScore: (latest.technicalScore || 0) - (previous.technicalScore || 0),
          communicationScore: (latest.communicationScore || 0) - (previous.communicationScore || 0),
          detailedness: (latest.detailedness || 0) - (previous.detailedness || 0)
        }
      }
    });

  } catch (error) {
    console.error('❌ Get premium comparison error:', error);
    res.status(500).json({ success: false, message: 'Karşılaştırma alınamadı' });
  }
};

// ─── Premium: İlerleme Trendi ─────────────────────────────────────────────────

exports.getPremiumProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { professionId, characterId, limit = 20 } = req.query;

    const query = { ...statsMatch(userId) };
    if (professionId) query.professionId = professionId;
    if (characterId) query.characterId = characterId;

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
      const firstHalf = interviews.slice(0, half);
      const secondHalf = interviews.slice(half);
      const avgFirst = firstHalf.reduce((sum, i) => sum + (i.overallScore || 0), 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((sum, i) => sum + (i.overallScore || 0), 0) / secondHalf.length;
      const diff = avgSecond - avgFirst;
      if (diff > 5) trend = 'improving';
      else if (diff < -5) trend = 'declining';
      else trend = 'stable';
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

// UTC+3 (Türkiye) gün başlangıcını döndürür
const getTurkeyStartOfDay = () => {
  const now = new Date();
  const turkeyOffset = 3 * 60;
  const turkeyTime = new Date(now.getTime() + turkeyOffset * 60 * 1000);
  return new Date(Date.UTC(
    turkeyTime.getUTCFullYear(),
    turkeyTime.getUTCMonth(),
    turkeyTime.getUTCDate(),
    0, 0, 0, 0
  ) - turkeyOffset * 60 * 1000);
};