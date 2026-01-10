const express = require('express');
const router = express.Router();
const {
  getAllCharacters,
  getCharacter,
  getCharactersByDifficulty,
  getRecommendedCharacter
} = require('../controllers/CharactersController');
const { protect } = require('../middleware/AuthMiddleware');

// Public routes
router.get('/', getAllCharacters);
router.get('/difficulty/:level', getCharactersByDifficulty);
router.get('/:characterId', getCharacter);

// Protected routes
router.get('/recommend', protect, getRecommendedCharacter);

module.exports = router;