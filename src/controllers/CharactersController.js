const charactersData = require('../data/characters.json');
const Interview = require('../models/Interview');

// @desc    Get all characters
// @route   GET /api/v1/characters
// @access  Public
exports.getAllCharacters = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      count: charactersData.characters.length,
      data: charactersData.characters
    });
  } catch (error) {
    console.error('Get all characters error:', error);
    res.status(500).json({
      success: false,
      message: 'Karakterler alınırken hata oluştu'
    });
  }
};

// @desc    Get single character
// @route   GET /api/v1/characters/:characterId
// @access  Public
exports.getCharacter = async (req, res) => {
  try {
    const { characterId } = req.params;

    const character = charactersData.characters.find(char => char.id === characterId);

    if (!character) {
      return res.status(404).json({
        success: false,
        message: 'Karakter bulunamadı'
      });
    }

    res.status(200).json({
      success: true,
      data: character
    });
  } catch (error) {
    console.error('Get character error:', error);
    res.status(500).json({
      success: false,
      message: 'Karakter alınırken hata oluştu'
    });
  }
};

// @desc    Get characters by difficulty
// @route   GET /api/v1/characters/difficulty/:level
// @access  Public
exports.getCharactersByDifficulty = async (req, res) => {
  try {
    const { level } = req.params; // easy, medium, hard, extreme

    const validLevels = ['easy', 'medium', 'hard', 'extreme'];
    
    if (!validLevels.includes(level)) {
      return res.status(400).json({
        success: false,
        message: 'Geçersiz zorluk seviyesi. Geçerli değerler: easy, medium, hard, extreme'
      });
    }

    const characters = charactersData.characters.filter(char => char.difficulty === level);

    res.status(200).json({
      success: true,
      count: characters.length,
      data: characters
    });
  } catch (error) {
    console.error('Get characters by difficulty error:', error);
    res.status(500).json({
      success: false,
      message: 'Karakterler alınırken hata oluştu'
    });
  }
};

// @desc    Get recommended character for user
// @route   GET /api/v1/characters/recommend
// @access  Private
exports.getRecommendedCharacter = async (req, res) => {
  try {
    const userId = req.user.id;

    // Kullanıcının geçmiş mülakatlarını al
    const interviews = await Interview.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10);

    // İlk mülakat ise kolay karakter öner
    if (interviews.length === 0) {
      const easyCharacter = charactersData.characters.find(
        char => char.difficulty === 'easy'
      ) || charactersData.characters[0];

      return res.status(200).json({
        success: true,
        message: 'İlk mülakatınız için başlangıç seviyesi karakter önerildi',
        data: easyCharacter
      });
    }

    // Ortalama skoru hesapla
    const completedInterviews = interviews.filter(i => i.overallScore !== null);
    
    if (completedInterviews.length === 0) {
      const easyCharacter = charactersData.characters.find(
        char => char.difficulty === 'easy'
      ) || charactersData.characters[0];

      return res.status(200).json({
        success: true,
        message: 'Yeni başlayanlar için önerilen karakter',
        data: easyCharacter
      });
    }

    const avgScore = completedInterviews.reduce((sum, interview) => {
      return sum + interview.overallScore;
    }, 0) / completedInterviews.length;

    // En çok kullanılan karakterleri bul
    const characterUsage = {};
    interviews.forEach(interview => {
      const charId = interview.characterId;
      characterUsage[charId] = (characterUsage[charId] || 0) + 1;
    });

    // Zorluk seviyesi belirle
    let recommendedDifficulty;
    let recommendationMessage;

    if (avgScore >= 80) {
      recommendedDifficulty = 'extreme';
      recommendationMessage = `Harika performans! Ortalama skorunuz ${avgScore.toFixed(0)} - En zorlu karakterler sizin için hazır`;
    } else if (avgScore >= 65) {
      recommendedDifficulty = 'hard';
      recommendationMessage = `Çok iyi ilerliyorsunuz! Ortalama skorunuz ${avgScore.toFixed(0)} - Zorlu karakterlerle kendinizi test edin`;
    } else if (avgScore >= 50) {
      recommendedDifficulty = 'medium';
      recommendationMessage = `İyi bir performans! Ortalama skorunuz ${avgScore.toFixed(0)} - Orta seviye karakterlerle devam edin`;
    } else {
      recommendedDifficulty = 'easy';
      recommendationMessage = `Ortalama skorunuz ${avgScore.toFixed(0)} - Kolay seviye karakterlerle pratik yapın`;
    }

    // Önerilen zorluk seviyesindeki karakterleri al
    const suitableCharacters = charactersData.characters.filter(
      char => char.difficulty === recommendedDifficulty
    );

    if (suitableCharacters.length === 0) {
      // Fallback: En popüler karakteri öner
      const popularCharacter = charactersData.characters.find(
        char => char.badge === 'EN POPÜLER'
      ) || charactersData.characters[0];

      return res.status(200).json({
        success: true,
        message: 'Yeni başlayanlar için önerilen karakter',
        data: popularCharacter
      });
    }

    // Az kullanılmış veya hiç kullanılmamış karakteri öner
    const leastUsedCharacter = suitableCharacters.find(
      char => !characterUsage[char.id]
    ) || suitableCharacters.reduce((prev, current) => {
      const prevUsage = characterUsage[prev.id] || 0;
      const currentUsage = characterUsage[current.id] || 0;
      return currentUsage < prevUsage ? current : prev;
    });

    res.status(200).json({
      success: true,
      message: recommendationMessage,
      data: leastUsedCharacter,
      stats: {
        totalInterviews: interviews.length,
        averageScore: Math.round(avgScore),
        recommendedLevel: recommendedDifficulty
      }
    });

  } catch (error) {
    console.error('Get recommended character error:', error);
    res.status(500).json({
      success: false,
      message: 'Öneri alınırken hata oluştu'
    });
  }
};