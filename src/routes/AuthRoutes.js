const express = require('express');
const router = express.Router();
const { register, login, getMe } = require('../controllers/AuthController');
const { protect } = require('../middleware/AuthMiddleware');

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/me', protect, getMe);

module.exports = router;