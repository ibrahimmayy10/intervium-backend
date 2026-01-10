const charactersData = require('../data/characters.json');

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
    // Kullanıcının geçmiş mülakatlarına bakarak öneri yapılabilir
    // Şimdilik en popüler karakteri öner (Joe)
    
    const recommendedCharacter = charactersData.characters.find(
      char => char.badge === 'EN POPÜLER'
    );

    res.status(200).json({
      success: true,
      message: 'Yeni başlayanlar için önerilen karakter',
      data: recommendedCharacter
    });

  } catch (error) {
    console.error('Get recommended character error:', error);
    res.status(500).json({
      success: false,
      message: 'Öneri alınırken hata oluştu'
    });
  }
};