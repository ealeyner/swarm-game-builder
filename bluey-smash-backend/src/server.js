const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
require('dotenv').config();

const GameManager = require('./services/GameManager');
const SocketHandler = require('./websocket/SocketHandler');
const authRoutes = require('./controllers/authController');
const gameRoutes = require('./controllers/gameController');
const statsRoutes = require('./controllers/statsController');
const { initializeDatabase } = require('./models/database');
const { logger } = require('./utils/logger');
const { validateEnvironment } = require('./utils/validation');

class BlueySmashServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });
    
    this.gameManager = new GameManager();
    this.socketHandler = new SocketHandler(this.io, this.gameManager);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketHandlers();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet());
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || "http://localhost:3000",
      credentials: true
    }));

    // Performance middleware
    if (process.env.ENABLE_COMPRESSION === 'true') {
      this.app.use(compression());
    }

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false
    });
    this.app.use('/api/', limiter);

    // Logging
    this.app.use(morgan('combined', { 
      stream: { write: message => logger.info(message.trim()) }
    }));

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        gameStats: this.gameManager.getServerStats()
      });
    });

    // API routes
    this.app.use('/api/auth', authRoutes);
    this.app.use('/api/game', gameRoutes(this.gameManager));
    this.app.use('/api/stats', statsRoutes(this.gameManager));

    // Error handling
    this.app.use((err, req, res, next) => {
      logger.error('Unhandled error:', err);
      res.status(500).json({ 
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
  }

  setupSocketHandlers() {
    this.socketHandler.initialize();
  }

  async start() {
    try {
      // Validate environment
      validateEnvironment();
      
      // Initialize database
      await initializeDatabase();
      
      // Start game manager
      await this.gameManager.initialize();

      const port = process.env.PORT || 3001;
      this.server.listen(port, () => {
        logger.info(`🎮 Bluey Smash Backend Server running on port ${port}`);
        logger.info(`🌐 CORS enabled for: ${process.env.CORS_ORIGIN || 'http://localhost:3000'}`);
        logger.info(`🎯 Game tick rate: ${process.env.GAME_TICK_RATE || 60} FPS`);
        logger.info(`👥 Max players per room: ${process.env.MAX_PLAYERS_PER_ROOM || 8}`);
      });

      // Graceful shutdown
      process.on('SIGTERM', () => this.shutdown());
      process.on('SIGINT', () => this.shutdown());

    } catch (error) {
      logger.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async shutdown() {
    logger.info('🛑 Shutting down server...');
    
    // Close socket connections
    this.io.close();
    
    // Stop game manager
    await this.gameManager.shutdown();
    
    // Close HTTP server
    this.server.close(() => {
      logger.info('✅ Server shutdown complete');
      process.exit(0);
    });
  }
}

// Start server if called directly
if (require.main === module) {
  const server = new BlueySmashServer();
  server.start();
}

module.exports = BlueySmashServer;