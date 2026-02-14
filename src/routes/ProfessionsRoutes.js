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

// ÖNEMLİ: Spesifik route'lar ÖNCE gelir
router.get('/categories', getCategories);
router.get('/search', searchProfessions);
router.get('/category/:categoryId', getProfessionsByCategory);

// Genel parametre alan route EN SONA
router.get('/:professionId', getProfession);

module.exports = router;