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

// ÖNEMLİ: Spesifik route'lar ÖNCE gelir
router.get('/difficulty/:level', getCharactersByDifficulty);
router.get('/recommend', protect, getRecommendedCharacter);
router.get('/', getAllCharacters);

// Genel parametre alan route EN SONA
router.get('/:characterId', getCharacter);

module.exports = router;