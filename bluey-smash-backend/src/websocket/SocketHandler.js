const { logger } = require('../utils/logger');
const { validateSocketInput } = require('../utils/validation');
const jwt = require('jsonwebtoken');

class SocketHandler {
  constructor(io, gameManager) {
    this.io = io;
    this.gameManager = gameManager;
    this.connectedSockets = new Map();
    
    // Rate limiting per socket
    this.rateLimits = new Map();
    this.rateLimitConfig = {
      windowMs: 1000, // 1 second window
      maxRequests: 30, // Max 30 requests per second per socket
      blockDuration: 5000 // Block for 5 seconds if exceeded
    };
  }

  initialize() {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
    
    logger.info('🔌 Socket.IO handlers initialized');
  }

  handleConnection(socket) {
    logger.info(`🔗 Socket connected: ${socket.id}`);
    
    // Initialize rate limiting for this socket
    this.rateLimits.set(socket.id, {
      requests: [],
      blockedUntil: 0
    });
    
    // Set up middleware for rate limiting
    socket.use((packet, next) => {
      if (this.checkRateLimit(socket.id)) {
        next();
      } else {
        logger.warn(`⚠️ Rate limit exceeded for socket ${socket.id}`);
        socket.emit('error', { 
          type: 'RATE_LIMIT',
          message: 'Too many requests, please slow down'
        });
      }
    });

    // Authentication middleware
    socket.use((packet, next) => {
      const [event, data] = packet;
      
      // Skip auth for initial connection events
      if (['auth:login', 'auth:guest', 'ping'].includes(event)) {
        return next();
      }
      
      // Check if socket is authenticated
      if (!socket.player) {
        return next(new Error('Authentication required'));
      }
      
      next();
    });

    // Event handlers
    this.setupAuthHandlers(socket);
    this.setupPlayerHandlers(socket);
    this.setupRoomHandlers(socket);
    this.setupGameHandlers(socket);
    this.setupMatchmakingHandlers(socket);
    this.setupSpectatorHandlers(socket);
    this.setupUtilityHandlers(socket);
    
    // Connection management
    this.setupDisconnectHandler(socket);
  }

  setupAuthHandlers(socket) {
    socket.on('auth:login', async (data) => {
      try {
        const { token, username, character } = data;
        
        // Verify JWT token (if provided)
        let userId = null;
        if (token) {
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            userId = decoded.userId;
          } catch (err) {
            logger.warn(`Invalid JWT token from ${socket.id}:`, err.message);
          }
        }
        
        // Create player
        const player = this.gameManager.addPlayer(socket.id, {
          id: userId,
          username: username || `Player_${socket.id.slice(0, 6)}`,
          character
        });
        
        player.setSocket(socket);
        socket.player = player;
        this.connectedSockets.set(socket.id, socket);
        
        socket.emit('auth:success', {
          player: player.getPublicData(),
          serverInfo: {
            version: '1.0.0',
            maxPlayersPerRoom: this.gameManager.maxPlayersPerRoom,
            tickRate: this.gameManager.gameTickRate
          }
        });
        
        logger.info(`✅ Player authenticated: ${player.username} (${socket.id})`);
        
      } catch (error) {
        logger.error('Auth error:', error);
        socket.emit('auth:error', { message: 'Authentication failed' });
      }
    });

    socket.on('auth:guest', (data) => {
      try {
        const { username, character } = data || {};
        
        const player = this.gameManager.addPlayer(socket.id, {
          username: username || `Guest_${socket.id.slice(0, 6)}`,
          character
        });
        
        player.setSocket(socket);
        socket.player = player;
        this.connectedSockets.set(socket.id, socket);
        
        socket.emit('auth:success', {
          player: player.getPublicData(),
          serverInfo: {
            version: '1.0.0',
            maxPlayersPerRoom: this.gameManager.maxPlayersPerRoom,
            tickRate: this.gameManager.gameTickRate
          }
        });
        
        logger.info(`👤 Guest player connected: ${player.username} (${socket.id})`);
        
      } catch (error) {
        logger.error('Guest auth error:', error);
        socket.emit('auth:error', { message: 'Guest authentication failed' });
      }
    });
  }

  setupPlayerHandlers(socket) {
    socket.on('player:update-character', (data) => {
      try {
        const { character, skin } = data;
        const player = socket.player;
        
        if (player.roomId) {
          const room = this.gameManager.getRoom(player.roomId);
          if (room && room.isGameActive) {
            socket.emit('error', { message: 'Cannot change character during game' });
            return;
          }
        }
        
        if (player.setCharacter(character)) {
          if (skin) player.setSkin(skin);
          
          socket.emit('player:character-updated', {
            character: player.character,
            skin: player.skin
          });
          
          // Notify room if player is in one
          if (player.roomId) {
            const room = this.gameManager.getRoom(player.roomId);
            if (room) {
              room.broadcast('room:player-updated', {
                player: player.getPublicData()
              });
            }
          }
        } else {
          socket.emit('error', { message: 'Invalid character selected' });
        }
        
      } catch (error) {
        logger.error('Character update error:', error);
        socket.emit('error', { message: 'Failed to update character' });
      }
    });

    socket.on('player:update-preferences', (data) => {
      try {
        const player = socket.player;
        player.updatePreferences(data);
        
        socket.emit('player:preferences-updated', {
          preferences: player.preferences
        });
        
      } catch (error) {
        logger.error('Preferences update error:', error);
        socket.emit('error', { message: 'Failed to update preferences' });
      }
    });

    socket.on('player:ready', (data) => {
      try {
        const { ready } = data;
        const player = socket.player;
        
        if (!player.roomId) {
          socket.emit('error', { message: 'Not in a room' });
          return;
        }
        
        player.setReady(ready);
        
        const room = this.gameManager.getRoom(player.roomId);
        if (room) {
          room.broadcast('room:player-ready', {
            playerId: socket.id,
            ready: player.isReady,
            canStart: room.canStart()
          });
        }
        
      } catch (error) {
        logger.error('Player ready error:', error);
        socket.emit('error', { message: 'Failed to update ready status' });
      }
    });
  }

  setupRoomHandlers(socket) {
    socket.on('room:create', (data) => {
      try {
        const player = socket.player;
        
        if (player.roomId) {
          socket.emit('error', { message: 'Already in a room' });
          return;
        }
        
        const room = this.gameManager.createRoom(socket.id, data);
        
        socket.emit('room:created', {
          room: room.getPublicInfo()
        });
        
        socket.join(room.id);
        
      } catch (error) {
        logger.error('Room creation error:', error);
        socket.emit('error', { message: 'Failed to create room' });
      }
    });

    socket.on('room:join', (data) => {
      try {
        const { roomId } = data;
        const player = socket.player;
        
        if (player.roomId) {
          socket.emit('error', { message: 'Already in a room' });
          return;
        }
        
        const room = this.gameManager.joinRoom(socket.id, roomId);
        
        socket.join(roomId);
        socket.emit('room:joined', {
          room: room.getPublicInfo()
        });
        
      } catch (error) {
        logger.error('Room join error:', error);
        socket.emit('error', { message: error.message || 'Failed to join room' });
      }
    });

    socket.on('room:leave', () => {
      try {
        const player = socket.player;
        
        if (!player.roomId) {
          socket.emit('error', { message: 'Not in a room' });
          return;
        }
        
        const roomId = player.roomId;
        this.gameManager.leaveRoom(socket.id, roomId);
        
        socket.leave(roomId);
        socket.emit('room:left', { roomId });
        
      } catch (error) {
        logger.error('Room leave error:', error);
        socket.emit('error', { message: 'Failed to leave room' });
      }
    });

    socket.on('room:list', (data) => {
      try {
        const filters = data || {};
        const rooms = this.gameManager.getRoomsList(filters);
        
        socket.emit('room:list', { rooms });
        
      } catch (error) {
        logger.error('Room list error:', error);
        socket.emit('error', { message: 'Failed to get room list' });
      }
    });

    socket.on('room:update-settings', (data) => {
      try {
        const player = socket.player;
        
        if (!player.roomId) {
          socket.emit('error', { message: 'Not in a room' });
          return;
        }
        
        const room = this.gameManager.getRoom(player.roomId);
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }
        
        if (room.host.socketId !== socket.id) {
          socket.emit('error', { message: 'Only host can update settings' });
          return;
        }
        
        room.updateSettings(data);
        
      } catch (error) {
        logger.error('Room settings update error:', error);
        socket.emit('error', { message: 'Failed to update room settings' });
      }
    });
  }

  setupGameHandlers(socket) {
    socket.on('game:start', () => {
      try {
        const player = socket.player;
        
        if (!player.roomId) {
          socket.emit('error', { message: 'Not in a room' });
          return;
        }
        
        const room = this.gameManager.getRoom(player.roomId);
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }
        
        if (room.host.socketId !== socket.id) {
          socket.emit('error', { message: 'Only host can start game' });
          return;
        }
        
        if (!room.canStart()) {
          socket.emit('error', { message: 'Cannot start game (need at least 2 ready players)' });
          return;
        }
        
        this.gameManager.startGameSession(room.id);
        
      } catch (error) {
        logger.error('Game start error:', error);
        socket.emit('error', { message: 'Failed to start game' });
      }
    });

    socket.on('game:input', (data) => {
      try {
        if (!validateSocketInput(data)) {
          logger.warn(`Invalid game input from ${socket.id}:`, data);
          return;
        }
        
        const player = socket.player;
        
        if (!player.roomId) return;
        
        const room = this.gameManager.getRoom(player.roomId);
        if (!room || !room.isGameActive) return;
        
        // Anti-cheat validation
        if (!this.gameManager.validatePlayerAction(socket.id, data)) {
          this.gameManager.reportSuspiciousActivity(socket.id, {
            type: 'invalid_input',
            input: data,
            timestamp: Date.now()
          });
          return;
        }
        
        room.processPlayerInput(socket.id, data);
        
      } catch (error) {
        logger.error('Game input error:', error);
      }
    });

    socket.on('game:pause', () => {
      try {
        const player = socket.player;
        
        if (!player.roomId) {
          socket.emit('error', { message: 'Not in a room' });
          return;
        }
        
        const room = this.gameManager.getRoom(player.roomId);
        if (!room || !room.isGameActive) {
          socket.emit('error', { message: 'No active game to pause' });
          return;
        }
        
        // Only host can pause in most modes
        if (room.host.socketId !== socket.id && room.gameMode !== 'casual') {
          socket.emit('error', { message: 'Only host can pause game' });
          return;
        }
        
        room.broadcast('game:paused', {
          pausedBy: player.username,
          timestamp: Date.now()
        });
        
      } catch (error) {
        logger.error('Game pause error:', error);
        socket.emit('error', { message: 'Failed to pause game' });
      }
    });

    socket.on('game:forfeit', () => {
      try {
        const player = socket.player;
        
        if (!player.roomId) {
          socket.emit('error', { message: 'Not in a room' });
          return;
        }
        
        const room = this.gameManager.getRoom(player.roomId);
        if (!room || !room.isGameActive) {
          socket.emit('error', { message: 'No active game to forfeit' });
          return;
        }
        
        // Mark player as eliminated
        player.gameState.lives = 0;
        player.gameState.eliminated = true;
        
        room.broadcast('game:player-forfeit', {
          playerId: socket.id,
          playerName: player.username
        });
        
        // Check if game should end
        room.tick();
        
      } catch (error) {
        logger.error('Game forfeit error:', error);
        socket.emit('error', { message: 'Failed to forfeit game' });
      }
    });
  }

  setupMatchmakingHandlers(socket) {
    socket.on('matchmaking:join', (data) => {
      try {
        const player = socket.player;
        
        if (player.roomId) {
          socket.emit('error', { message: 'Leave current room before joining matchmaking' });
          return;
        }
        
        this.gameManager.joinMatchmaking(socket.id, data);
        
        socket.emit('matchmaking:joined', {
          estimatedWaitTime: this.estimateMatchmakingWait(data),
          position: this.gameManager.matchmaking.size
        });
        
      } catch (error) {
        logger.error('Matchmaking join error:', error);
        socket.emit('error', { message: 'Failed to join matchmaking' });
      }
    });

    socket.on('matchmaking:leave', () => {
      try {
        if (this.gameManager.removeFromMatchmaking(socket.id)) {
          socket.emit('matchmaking:left');
        }
        
      } catch (error) {
        logger.error('Matchmaking leave error:', error);
        socket.emit('error', { message: 'Failed to leave matchmaking' });
      }
    });
  }

  setupSpectatorHandlers(socket) {
    socket.on('spectate:join', (data) => {
      try {
        const { roomId } = data;
        const spectatorData = this.gameManager.addSpectator(socket.id, roomId);
        
        socket.join(`spectate_${roomId}`);
        socket.emit('spectate:joined', {
          roomId,
          gameData: spectatorData
        });
        
      } catch (error) {
        logger.error('Spectator join error:', error);
        socket.emit('error', { message: error.message || 'Failed to join as spectator' });
      }
    });

    socket.on('spectate:leave', () => {
      try {
        if (this.gameManager.removeSpectator(socket.id)) {
          // Find which room they were spectating and leave
          for (const roomId of socket.rooms) {
            if (roomId.startsWith('spectate_')) {
              socket.leave(roomId);
              break;
            }
          }
          
          socket.emit('spectate:left');
        }
        
      } catch (error) {
        logger.error('Spectator leave error:', error);
        socket.emit('error', { message: 'Failed to leave spectator mode' });
      }
    });
  }

  setupUtilityHandlers(socket) {
    socket.on('ping', (timestamp) => {
      const latency = Date.now() - timestamp;
      
      if (socket.player) {
        socket.player.updatePing(latency);
      }
      
      socket.emit('pong', {
        timestamp,
        latency,
        serverTime: Date.now()
      });
    });

    socket.on('stats:request', () => {
      try {
        const stats = this.gameManager.getServerStats();
        socket.emit('stats:response', stats);
        
      } catch (error) {
        logger.error('Stats request error:', error);
        socket.emit('error', { message: 'Failed to get server stats' });
      }
    });

    socket.on('replay:request', (data) => {
      try {
        const { replayId } = data;
        // Implementation would depend on replay system
        socket.emit('replay:data', {
          replayId,
          message: 'Replay system not yet implemented'
        });
        
      } catch (error) {
        logger.error('Replay request error:', error);
        socket.emit('error', { message: 'Failed to get replay data' });
      }
    });
  }

  setupDisconnectHandler(socket) {
    socket.on('disconnect', (reason) => {
      logger.info(`🔌 Socket disconnected: ${socket.id} (${reason})`);
      
      // Clean up rate limiting
      this.rateLimits.delete(socket.id);
      
      // Remove from connected sockets
      this.connectedSockets.delete(socket.id);
      
      // Clean up player
      if (socket.player) {
        this.gameManager.removePlayer(socket.id);
      }
    });
  }

  // Rate limiting
  checkRateLimit(socketId) {
    const limit = this.rateLimits.get(socketId);
    if (!limit) return true;
    
    const now = Date.now();
    
    // Check if still blocked
    if (now < limit.blockedUntil) {
      return false;
    }
    
    // Clean old requests
    limit.requests = limit.requests.filter(
      timestamp => now - timestamp < this.rateLimitConfig.windowMs
    );
    
    // Check if over limit
    if (limit.requests.length >= this.rateLimitConfig.maxRequests) {
      limit.blockedUntil = now + this.rateLimitConfig.blockDuration;
      return false;
    }
    
    // Add current request
    limit.requests.push(now);
    return true;
  }

  // Utility methods
  estimateMatchmakingWait(preferences) {
    // Simple estimation based on current queue size and preferences
    const queueSize = this.gameManager.matchmaking.size;
    const baseWait = Math.max(5, queueSize * 2); // 2 seconds per person minimum 5
    
    // Adjust for specific preferences
    if (preferences.gameMode && preferences.gameMode !== 'classic') {
      return baseWait * 1.5; // Longer wait for non-standard modes
    }
    
    return baseWait;
  }

  // Broadcast to all connected sockets
  broadcastToAll(event, data) {
    this.io.emit(event, data);
  }

  // Get connection statistics
  getConnectionStats() {
    return {
      totalConnections: this.connectedSockets.size,
      authenticatedPlayers: Array.from(this.connectedSockets.values())
        .filter(socket => socket.player).length,
      rateLimitedSockets: Array.from(this.rateLimits.values())
        .filter(limit => Date.now() < limit.blockedUntil).length
    };
  }
}

module.exports = SocketHandler;