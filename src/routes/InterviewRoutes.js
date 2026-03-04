// routes/InterviewRoutes.js
const express = require('express');
const router = express.Router();
const {
  createInterview,
  completeInterview,
  getUserInterviews,
  getInterview,
  updateInterview,
  deleteInterview,
  getUserStats,
  getUserStatsByProfession,
  getRecentInterviews,
  getPremiumComparison,
  getPremiumProgress,
  getInterviewLimitStatus
} = require('../controllers/InterviewController');
const { protect } = require('../middleware/AuthMiddleware');
const { requirePremium } = require('../middleware/PremiumMiddleware');

// Tüm route'lar protected
router.use(protect);

// Stats endpoints (önce tanımla, :id ile karışmasın)
router.get('/stats', getUserStats);
router.get('/stats/profession/:professionId', getUserStatsByProfession);
router.get('/recent', getRecentInterviews);
router.get('/limit-status', getInterviewLimitStatus);
router.post('/complete', completeInterview);

// ─── PREMIUM ENDPOINTS ────────────────────────────────────────────────────────
router.get('/premium/comparison', requirePremium, getPremiumComparison);
router.get('/premium/progress', requirePremium, getPremiumProgress);

// CRUD endpoints
router.post('/', createInterview);
router.get('/', getUserInterviews);
router.get('/:id', getInterview);
router.put('/:id', updateInterview);
router.delete('/:id', deleteInterview);

module.exports = router;