// professions.js
const express = require('express');
const router = express.Router();
const {
  getCategories,
  getAllProfessions,
  getProfessionsByCategory,
  getProfession,
  searchProfessions
} = require('../controllers/ProfessionsController');

// Özel route'lar önce
router.get('/categories', getCategories);
router.get('/search', searchProfessions);
router.get('/category/:categoryId', getProfessionsByCategory);

// Parametre alan route en sona
router.get('/:professionId', getProfession);

module.exports = router;