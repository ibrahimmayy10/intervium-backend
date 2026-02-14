// characters.js
const express = require('express');
const router = express.Router();
const {
  getAllCharacters,
  getCharacter,
  getCharactersByDifficulty,
  getRecommendedCharacter
} = require('../controllers/CharactersController');
const { protect } = require('../middleware/AuthMiddleware');

// Özel route'lar önce gelmeli
router.get('/difficulty/:level', getCharactersByDifficulty);
router.get('/recommend', protect, getRecommendedCharacter);

// Genel routes
router.get('/', getAllCharacters);

// Parametre alan route en sona
router.get('/:characterId', getCharacter);

module.exports = router;