const Interview = require('../models/Interview');
const User = require('../models/User');
const mongoose = require('mongoose'); // ✅ EKLEME

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
      questionCount, 
      correctAnswers,
      duration
    } = req.body;

    // ✅ Validasyon ekleyelim
    if (!professionId || !characterId) {
      return res.status(400).json({
        success: false,
        message: 'Meslek ve karakter bilgisi gereklidir'
      });
    }

    const userId = req.user.id;

    const interview = await Interview.create({
      userId,
      professionId,
      characterId,
      status: 'completed',
      completedAt: new Date(),
      overallScore: overallScore || 0,
      feedback: feedback || '',
      strengths: strengths || [],
      improvements: improvements || [],
      technicalScore: technicalScore || 0,
      communicationScore: communicationScore || 0,
      detailedness: detailedness || 0,
      recommendation: recommendation || '',
      questionCount: questionCount || 0,
      correctAnswers: correctAnswers || 0,
      duration: duration || null
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
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Geçersiz veri'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Mülakat kaydedilirken hata oluştu',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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
    if (status) query.status = status;
    if (professionId) query.professionId = professionId;

    const skip = (page - 1) * parseInt(limit);

    const interviews = await Interview.find(query)
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
    res.status(500).json({
      success: false,
      message: 'Mülakatlar alınırken hata oluştu',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get single interview
// @route   GET /api/v1/interviews/:id
// @access  Private
exports.getInterview = async (req, res) => {
  try {
    // ✅ ObjectId validasyonu
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'Geçersiz mülakat ID'
      });
    }

    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Mülakat bulunamadı'
      });
    }

    if (interview.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Bu mülakata erişim yetkiniz yok'
      });
    }

    res.status(200).json({
      success: true,
      data: interview
    });

  } catch (error) {
    console.error('❌ Get interview error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Mülakat alınırken hata oluştu',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Update interview
// @route   PUT /api/v1/interviews/:id
// @access  Private
exports.updateInterview = async (req, res) => {
  try {
    // ✅ ObjectId validasyonu
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'Geçersiz mülakat ID'
      });
    }

    let interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Mülakat bulunamadı'
      });
    }

    if (interview.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Bu mülakatı güncelleme yetkiniz yok'
      });
    }

    const { 
      overallScore, 
      feedback, 
      strengths, 
      improvements,
      status,
      technicalScore,
      communicationScore,
      detailedness,
      recommendation
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

    interview = await Interview.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Mülakat güncellendi',
      data: interview
    });

  } catch (error) {
    console.error('❌ Update interview error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Geçersiz veri'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Mülakat güncellenirken hata oluştu',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Delete interview
// @route   DELETE /api/v1/interviews/:id
// @access  Private
exports.deleteInterview = async (req, res) => {
  try {
    // ✅ ObjectId validasyonu
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({
        success: false,
        message: 'Geçersiz mülakat ID'
      });
    }

    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Mülakat bulunamadı'
      });
    }

    if (interview.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Bu mülakatı silme yetkiniz yok'
      });
    }

    await interview.deleteOne();

    res.status(200).json({
      success: true,
      message: 'Mülakat silindi',
      data: {}
    });

  } catch (error) {
    console.error('❌ Delete interview error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Mülakat silinirken hata oluştu',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get user statistics
// @route   GET /api/v1/interviews/stats
// @access  Private
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;
    
    console.log('📊 İstatistik istendi, userId:', userId);

    // ✅ userId validasyonu
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz kullanıcı ID'
      });
    }

    // Toplam mülakat sayısı
    const totalInterviews = await Interview.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'completed'
    });

    console.log('✅ Toplam mülakat:', totalInterviews);

    // Eğer hiç mülakat yoksa boş data döndür
    if (totalInterviews === 0) {
      return res.status(200).json({
        success: true,
        data: {
          totalInterviews: 0,
          averageScore: 0,
          averageTechnicalScore: 0,
          detailedScores: {
            technical: 0,
            communication: 0,
            detailedness: 0
          },
          bestScore: null,
          recentInterviews: 0,
          professionStats: [],
          characterStats: [],
          progressTrend: []
        }
      });
    }

    // Ortalama skorlar
    const averageScore = await Interview.getUserAverageScore(userId);
    const averageTechnicalScore = await Interview.getUserAverageTechnicalScore(userId);

    console.log('✅ Ortalama skorlar:', { averageScore, averageTechnicalScore });

    // En iyi performans
    const bestScore = await Interview.getUserBestScore(userId);

    console.log('✅ En iyi skor:', bestScore);

    // Son 7 gün
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentInterviews = await Interview.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'completed',
      createdAt: { $gte: sevenDaysAgo }
    });

    console.log('✅ Son 7 gün:', recentInterviews);

    // Detaylı skor ortalamaları
    const detailedScores = await Interview.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(userId),
          status: 'completed' 
        } 
      },
      { 
        $group: { 
          _id: null,
          avgTechnical: { $avg: '$technicalScore' },
          avgCommunication: { $avg: '$communicationScore' },
          avgDetailedness: { $avg: '$detailedness' }
        } 
      }
    ]);

    console.log('✅ Detaylı skorlar:', detailedScores);

    // Mesleğe göre dağılım
    const professionStats = await Interview.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(userId),
          status: 'completed' 
        } 
      },
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

    console.log('✅ Meslek istatistikleri:', professionStats);

    // Karaktere göre dağılım
    const characterStats = await Interview.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(userId),
          status: 'completed' 
        } 
      },
      { 
        $group: { 
          _id: '$characterId', 
          count: { $sum: 1 },
          avgScore: { $avg: '$overallScore' }
        } 
      },
      { $sort: { count: -1 } }
    ]);

    console.log('✅ Karakter istatistikleri:', characterStats);

    // Gelişim trendi (son 10 mülakat)
    const progressTrend = await Interview.find({
      userId: new mongoose.Types.ObjectId(userId),
      status: 'completed'
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('overallScore technicalScore communicationScore createdAt');

    console.log('✅ Gelişim trendi:', progressTrend.length, 'adet');

    const responseData = {
      totalInterviews,
      averageScore,
      averageTechnicalScore,
      detailedScores: detailedScores.length > 0 ? {
        technical: Math.round(detailedScores[0].avgTechnical || 0),
        communication: Math.round(detailedScores[0].avgCommunication || 0),
        detailedness: Math.round(detailedScores[0].avgDetailedness || 0)
      } : {
        technical: 0,
        communication: 0,
        detailedness: 0
      },
      bestScore: bestScore ? {
        score: bestScore.overallScore,
        professionId: bestScore.professionId,
        date: bestScore.createdAt
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
      progressTrend: progressTrend.reverse()
    };

    console.log('✅ Response gönderiliyor');

    res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('❌ Get user stats error:', error);
    console.error('❌ Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'İstatistikler alınırken hata oluştu',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get recent interviews (last 5)
// @route   GET /api/v1/interviews/recent
// @access  Private
exports.getRecentInterviews = async (req, res) => {
  try {
    const userId = req.user.id;

    // ✅ userId validasyonu
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz kullanıcı ID'
      });
    }

    const interviews = await Interview.find({ 
      userId: new mongoose.Types.ObjectId(userId), 
      status: 'completed' 
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('professionId characterId overallScore createdAt duration');

    res.status(200).json({
      success: true,
      count: interviews.length,
      data: interviews
    });

  } catch (error) {
    console.error('❌ Get recent interviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Son mülakatlar alınırken hata oluştu',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// @desc    Get user statistics by profession
// @route   GET /api/v1/interviews/stats/profession/:professionId
// @access  Private
exports.getUserStatsByProfession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { professionId } = req.params;
    
    console.log('📊 Meslek bazlı istatistik istendi:', { userId, professionId });

    // Validasyon
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz kullanıcı ID'
      });
    }

    if (!professionId) {
      return res.status(400).json({
        success: false,
        message: 'Meslek ID gereklidir'
      });
    }

    // Bu mesleğe ait toplam mülakat sayısı
    const totalInterviews = await Interview.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      professionId: professionId,
      status: 'completed'
    });

    console.log('✅ Bu mesleğe ait toplam mülakat:', totalInterviews);

    // Eğer hiç mülakat yoksa boş data döndür
    if (totalInterviews === 0) {
      return res.status(200).json({
        success: true,
        data: {
          totalInterviews: 0,
          averageScore: 0,
          averageTechnicalScore: 0,
          detailedScores: {
            technical: 0,
            communication: 0,
            detailedness: 0
          },
          bestScore: null,
          recentInterviews: 0,
          professionStats: [],
          characterStats: [],
          progressTrend: []
        }
      });
    }

    // Ortalama skorlar - sadece bu meslek için
    const scoreStats = await Interview.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(userId),
          professionId: professionId,
          status: 'completed' 
        } 
      },
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

    console.log('✅ Ortalama skorlar:', { averageScore, averageTechnicalScore });

    // En iyi performans - bu meslek için
    const bestScore = await Interview.findOne({ 
      userId: new mongoose.Types.ObjectId(userId),
      professionId: professionId,
      status: 'completed' 
    })
    .sort({ overallScore: -1 })
    .select('overallScore professionId createdAt');

    console.log('✅ En iyi skor:', bestScore);

    // Son 7 gün - bu meslek için
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentInterviews = await Interview.countDocuments({
      userId: new mongoose.Types.ObjectId(userId),
      professionId: professionId,
      status: 'completed',
      createdAt: { $gte: sevenDaysAgo }
    });

    console.log('✅ Son 7 gün:', recentInterviews);

    // Detaylı skor ortalamaları - bu meslek için
    const detailedScores = scoreStats.length > 0 ? {
      technical: Math.round(scoreStats[0].avgTechnical || 0),
      communication: Math.round(scoreStats[0].avgCommunication || 0),
      detailedness: Math.round(scoreStats[0].avgDetailedness || 0)
    } : {
      technical: 0,
      communication: 0,
      detailedness: 0
    };

    console.log('✅ Detaylı skorlar:', detailedScores);

    // Karaktere göre dağılım - bu meslek için
    const characterStats = await Interview.aggregate([
      { 
        $match: { 
          userId: new mongoose.Types.ObjectId(userId),
          professionId: professionId,
          status: 'completed' 
        } 
      },
      { 
        $group: { 
          _id: '$characterId', 
          count: { $sum: 1 },
          avgScore: { $avg: '$overallScore' }
        } 
      },
      { $sort: { count: -1 } }
    ]);

    console.log('✅ Karakter istatistikleri:', characterStats);

    // Gelişim trendi - bu meslek için (son 10 mülakat)
    const progressTrend = await Interview.find({
      userId: new mongoose.Types.ObjectId(userId),
      professionId: professionId,
      status: 'completed'
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('overallScore technicalScore communicationScore createdAt professionId');

    console.log('✅ Gelişim trendi:', progressTrend.length, 'adet');

    // Sadece bu mesleğin istatistiği
    const professionStats = [{
      professionId: professionId,
      count: totalInterviews,
      averageScore: averageScore,
      averageTechnical: averageTechnicalScore
    }];

    const responseData = {
      totalInterviews,
      averageScore,
      averageTechnicalScore,
      detailedScores,
      bestScore: bestScore ? {
        score: bestScore.overallScore,
        professionId: bestScore.professionId,
        date: bestScore.createdAt
      } : null,
      recentInterviews,
      professionStats,
      characterStats: characterStats.map(stat => ({
        characterId: stat._id,
        count: stat.count,
        averageScore: Math.round(stat.avgScore || 0)
      })),
      progressTrend: progressTrend.reverse()
    };

    console.log('✅ Response gönderiliyor');

    res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error) {
    console.error('❌ Get user stats by profession error:', error);
    console.error('❌ Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      message: 'Meslek istatistikleri alınırken hata oluştu',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};