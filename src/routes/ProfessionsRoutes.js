const express = require('express');
const router = express.Router();
const {
  getCategories,
  getAllProfessions,
  getProfessionsByCategory,
  getProfession,
  searchProfessions
} = require('../controllers/ProfessionsController');

// Public routes - Authentication gerekmez
router.get('/categories', getCategories);
router.get('/search', searchProfessions);
router.get('/category/:categoryId', getProfessionsByCategory);
router.get('/:professionId', getProfession);
router.get('/', getAllProfessions);

module.exports = router;