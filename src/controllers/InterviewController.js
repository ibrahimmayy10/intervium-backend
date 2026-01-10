const Interview = require('../models/Interview');
const User = require('../models/User');

// @desc    Create new interview
// @route   POST /api/v1/interviews
// @access  Private
exports.createInterview = async (req, res) => {
  try {
    const { professionId, characterId, overallScore, feedback, strengths, weaknesses, questionCount, correctAnswers } = req.body;

    // Kullanıcı ID'sini req.user'dan al (middleware'den geliyor)
    const userId = req.user.id;

    // Yeni mülakat oluştur
    const interview = await Interview.create({
      userId,
      professionId,
      characterId,
      status: 'completed', // Mülakat tamamlandı olarak gelecek
      completedAt: new Date(),
      overallScore,
      feedback,
      strengths: strengths || [],
      weaknesses: weaknesses || [],
      questionCount: questionCount || 0,
      correctAnswers: correctAnswers || 0
    });

    res.status(201).json({
      success: true,
      message: 'Mülakat kaydedildi',
      data: interview
    });

  } catch (error) {
    console.error('Create interview error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Geçersiz veri'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Mülakat kaydedilirken hata oluştu'
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

    // Query oluştur
    const query = { userId };
    if (status) query.status = status;
    if (professionId) query.professionId = professionId;

    // Pagination
    const skip = (page - 1) * limit;

    // Mülakatları getir (en yeni önce)
    const interviews = await Interview.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    // Toplam sayı
    const total = await Interview.countDocuments(query);

    res.status(200).json({
      success: true,
      count: interviews.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      data: interviews
    });

  } catch (error) {
    console.error('Get user interviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Mülakatlar alınırken hata oluştu'
    });
  }
};

// @desc    Get single interview
// @route   GET /api/v1/interviews/:id
// @access  Private
exports.getInterview = async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Mülakat bulunamadı'
      });
    }

    // Sadece kendi mülakatına erişebilir
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
    console.error('Get interview error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Mülakat bulunamadı'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Mülakat alınırken hata oluştu'
    });
  }
};

// @desc    Update interview
// @route   PUT /api/v1/interviews/:id
// @access  Private
exports.updateInterview = async (req, res) => {
  try {
    let interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Mülakat bulunamadı'
      });
    }

    // Sadece kendi mülakatını güncelleyebilir
    if (interview.userId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Bu mülakatı güncelleme yetkiniz yok'
      });
    }

    // Güncellenebilir alanlar
    const { overallScore, feedback, strengths, weaknesses, status } = req.body;

    const updateData = {};
    if (overallScore !== undefined) updateData.overallScore = overallScore;
    if (feedback !== undefined) updateData.feedback = feedback;
    if (strengths !== undefined) updateData.strengths = strengths;
    if (weaknesses !== undefined) updateData.weaknesses = weaknesses;
    if (status !== undefined) updateData.status = status;

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
    console.error('Update interview error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Mülakat bulunamadı'
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: messages[0] || 'Geçersiz veri'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Mülakat güncellenirken hata oluştu'
    });
  }
};

// @desc    Delete interview
// @route   DELETE /api/v1/interviews/:id
// @access  Private
exports.deleteInterview = async (req, res) => {
  try {
    const interview = await Interview.findById(req.params.id);

    if (!interview) {
      return res.status(404).json({
        success: false,
        message: 'Mülakat bulunamadı'
      });
    }

    // Sadece kendi mülakatını silebilir
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
    console.error('Delete interview error:', error);
    
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Mülakat bulunamadı'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Mülakat silinirken hata oluştu'
    });
  }
};

// @desc    Get user statistics
// @route   GET /api/v1/interviews/stats
// @access  Private
exports.getUserStats = async (req, res) => {
  try {
    const userId = req.user.id;

    // Toplam mülakat sayısı
    const totalInterviews = await Interview.getUserInterviewCount(userId, 'completed');

    // Ortalama puan
    const averageScore = await Interview.getUserAverageScore(userId);

    // En iyi performans
    const bestScore = await Interview.getUserBestScore(userId);

    // Son 7 gün
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const recentInterviews = await Interview.countDocuments({
      userId,
      status: 'completed',
      createdAt: { $gte: sevenDaysAgo }
    });

    // Mesleğe göre dağılım
    const professionStats = await Interview.aggregate([
      { $match: { userId: req.user._id, status: 'completed' } },
      { 
        $group: { 
          _id: '$professionId', 
          count: { $sum: 1 },
          avgScore: { $avg: '$overallScore' }
        } 
      },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Karaktere göre dağılım
    const characterStats = await Interview.aggregate([
      { $match: { userId: req.user._id, status: 'completed' } },
      { 
        $group: { 
          _id: '$characterId', 
          count: { $sum: 1 },
          avgScore: { $avg: '$overallScore' }
        } 
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalInterviews,
        averageScore,
        bestScore: bestScore ? {
          score: bestScore.overallScore,
          professionId: bestScore.professionId,
          date: bestScore.createdAt
        } : null,
        recentInterviews,
        professionStats: professionStats.map(stat => ({
          professionId: stat._id,
          count: stat.count,
          averageScore: Math.round(stat.avgScore)
        })),
        characterStats: characterStats.map(stat => ({
          characterId: stat._id,
          count: stat.count,
          averageScore: Math.round(stat.avgScore)
        }))
      }
    });

  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({
      success: false,
      message: 'İstatistikler alınırken hata oluştu'
    });
  }
};

// @desc    Get recent interviews (last 5)
// @route   GET /api/v1/interviews/recent
// @access  Private
exports.getRecentInterviews = async (req, res) => {
  try {
    const userId = req.user.id;

    const interviews = await Interview.find({ 
      userId, 
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
    console.error('Get recent interviews error:', error);
    res.status(500).json({
      success: false,
      message: 'Son mülakatlar alınırken hata oluştu'
    });
  }
};