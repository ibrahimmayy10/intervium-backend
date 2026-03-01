// routes/AppleRoutes.js

const express = require('express');
const router = express.Router();
const {
  handleAppleWebhook,
  verifyPurchase,
  getSubscriptionStatus
} = require('../controllers/AppleWebhookController');
const { protect } = require('../middleware/AuthMiddleware');

// Apple webhook — public (Apple'dan gelir, token olmaz)
router.post('/webhook', handleAppleWebhook);

// Satın alma doğrulama — protected
router.post('/verify-purchase', protect, verifyPurchase);

// Abonelik durumu — protected
router.get('/subscription-status', protect, getSubscriptionStatus);

module.exports = router;