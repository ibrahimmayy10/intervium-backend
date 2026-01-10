const professionsData = require('../data/professions.json');

// @desc    Get all categories
// @route   GET /api/v1/professions/categories
// @access  Public
exports.getCategories = async (req, res) => {
  try {
    const categories = professionsData.categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      order: cat.order,
      professionsCount: cat.professions.length
    }));

    res.status(200).json({
      success: true,
      count: categories.length,
      data: categories
    });

  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Kategoriler alınırken hata oluştu'
    });
  }
};

// @desc    Get all professions
// @route   GET /api/v1/professions
// @access  Public
exports.getAllProfessions = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: professionsData
    });

  } catch (error) {
    console.error('Get all professions error:', error);
    res.status(500).json({
      success: false,
      message: 'Meslekler alınırken hata oluştu'
    });
  }
};

// @desc    Get professions by category
// @route   GET /api/v1/professions/category/:categoryId
// @access  Public
exports.getProfessionsByCategory = async (req, res) => {
  try {
    const { categoryId } = req.params;

    const category = professionsData.categories.find(cat => cat.id === categoryId);

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Kategori bulunamadı'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        category: {
          id: category.id,
          name: category.name,
          icon: category.icon
        },
        professions: category.professions
      }
    });

  } catch (error) {
    console.error('Get professions by category error:', error);
    res.status(500).json({
      success: false,
      message: 'Meslekler alınırken hata oluştu'
    });
  }
};

// @desc    Get single profession
// @route   GET /api/v1/professions/:professionId
// @access  Public
exports.getProfession = async (req, res) => {
  try {
    const { professionId } = req.params;

    let foundProfession = null;
    let foundCategory = null;

    // Tüm kategorilerde ara
    for (const category of professionsData.categories) {
      const profession = category.professions.find(prof => prof.id === professionId);
      if (profession) {
        foundProfession = profession;
        foundCategory = {
          id: category.id,
          name: category.name,
          icon: category.icon
        };
        break;
      }
    }

    if (!foundProfession) {
      return res.status(404).json({
        success: false,
        message: 'Meslek bulunamadı'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        profession: foundProfession,
        category: foundCategory
      }
    });

  } catch (error) {
    console.error('Get profession error:', error);
    res.status(500).json({
      success: false,
      message: 'Meslek alınırken hata oluştu'
    });
  }
};

// @desc    Search professions
// @route   GET /api/v1/professions/search?q=keyword
// @access  Public
exports.searchProfessions = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Arama için en az 2 karakter gereklidir'
      });
    }

    const keyword = q.toLowerCase().trim();
    const results = [];

    // Tüm kategorilerde ara
    professionsData.categories.forEach(category => {
      category.professions.forEach(profession => {
        // İsim, açıklama veya keywords'de ara
        const nameMatch = profession.name.toLowerCase().includes(keyword);
        const descMatch = profession.description.toLowerCase().includes(keyword);
        const keywordMatch = profession.keywords.some(k => 
          k.toLowerCase().includes(keyword)
        );

        if (nameMatch || descMatch || keywordMatch) {
          results.push({
            ...profession,
            category: {
              id: category.id,
              name: category.name,
              icon: category.icon
            }
          });
        }
      });
    });

    res.status(200).json({
      success: true,
      count: results.length,
      data: results
    });

  } catch (error) {
    console.error('Search professions error:', error);
    res.status(500).json({
      success: false,
      message: 'Arama sırasında hata oluştu'
    });
  }
};