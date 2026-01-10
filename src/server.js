// Load environment variables
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const connectDB = require('./config/database');

// Initialize Express app
const app = express();

// Middleware
app.use(cors()); // iOS'tan istek alabilmek için
app.use(express.json()); // JSON parse
app.use(express.urlencoded({ extended: true }));

// Request logging middleware (development)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// Connect to Database
connectDB();

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Intervium API is running! 🚀',
    version: process.env.API_VERSION || 'v1',
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/v1/auth', require('./routes/AuthRoutes'));
app.use('/api/v1/professions', require('./routes/ProfessionsRoutes'));
app.use('/api/v1/characters', require('./routes/CharactersRoutes'));
app.use('/api/v1/interviews', require('./routes/InterviewRoutes')); // ✅ YENİ

// Test endpoint (kaldırabilirsin)
app.get('/api/v1/test', (req, res) => {
  res.json({
    success: true,
    message: 'API endpoint çalışıyor! ✅',
    data: {
      app: process.env.APP_NAME,
      environment: process.env.NODE_ENV
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint bulunamadı'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Sunucu hatası',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('');
  console.log('🚀 ====================================');
  console.log(`📱 ${process.env.APP_NAME} API Server`);
  console.log('🚀 ====================================');
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
  console.log(`🔌 Port: ${PORT}`);
  console.log(`🔗 URL: http://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api/v1`);
  console.log('🚀 ====================================');
  console.log('');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  // Close server & exit
  process.exit(1);
});