const express = require('express');
const router = express.Router();
const {
  createInterview,
  getUserInterviews,
  getInterview,
  updateInterview,
  deleteInterview,
  getUserStats,
  getUserStatsByProfession, // ✅ YENİ
  getRecentInterviews
} = require('../controllers/InterviewController');
const { protect } = require('../middleware/AuthMiddleware');

// Tüm routes protected (authentication gerekli)
router.use(protect);

// Stats endpoints (önce tanımla, yoksa :id ile karışır)
router.get('/stats', getUserStats);
router.get('/stats/profession/:professionId', getUserStatsByProfession); // ✅ YENİ
router.get('/recent', getRecentInterviews);

// CRUD endpoints
router.post('/', createInterview);
router.get('/', getUserInterviews);
router.get('/:id', getInterview);
router.put('/:id', updateInterview);
router.delete('/:id', deleteInterview);

module.exports = router;