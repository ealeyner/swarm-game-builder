const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const GameRoom = require('./GameRoom');
const Player = require('../models/Player');
const AntiCheat = require('./AntiCheat');
const ReplaySystem = require('./ReplaySystem');

class GameManager {
  constructor() {
    this.rooms = new Map();
    this.players = new Map();
    this.matchmaking = new Map();
    this.spectators = new Map();
    this.antiCheat = new AntiCheat();
    this.replaySystem = new ReplaySystem();
    
    this.gameTickRate = parseInt(process.env.GAME_TICK_RATE) || 60;
    this.maxPlayersPerRoom = parseInt(process.env.MAX_PLAYERS_PER_ROOM) || 8;
    this.spectatorLimit = parseInt(process.env.SPECTATOR_LIMIT) || 50;
    
    this.gameLoop = null;
    this.stats = {
      totalGames: 0,
      activeRooms: 0,
      totalPlayers: 0,
      peakConcurrentPlayers: 0,
      serverStartTime: Date.now()
    };
  }

  async initialize() {
    logger.info('🎮 Initializing Game Manager...');
    
    // Start game loop
    this.startGameLoop();
    
    // Initialize anti-cheat system
    await this.antiCheat.initialize();
    
    // Initialize replay system
    await this.replaySystem.initialize();
    
    logger.info('✅ Game Manager initialized successfully');
  }

  startGameLoop() {
    const tickInterval = 1000 / this.gameTickRate;
    
    this.gameLoop = setInterval(() => {
      this.tick();
    }, tickInterval);
    
    logger.info(`🔄 Game loop started at ${this.gameTickRate} FPS`);
  }

  tick() {
    // Update all active game rooms
    for (const room of this.rooms.values()) {
      if (room.isActive()) {
        room.tick();
      }
    }
    
    // Clean up inactive rooms
    this.cleanupInactiveRooms();
    
    // Update statistics
    this.updateStats();
  }

  // Player Management
  addPlayer(socketId, playerData) {
    const player = new Player(socketId, playerData);
    this.players.set(socketId, player);
    
    logger.info(`👤 Player connected: ${player.username} (${socketId})`);
    
    this.stats.totalPlayers = this.players.size;
    this.stats.peakConcurrentPlayers = Math.max(
      this.stats.peakConcurrentPlayers, 
      this.stats.totalPlayers
    );
    
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return null;

    // Remove from any room
    if (player.roomId) {
      this.leaveRoom(socketId, player.roomId);
    }

    // Remove from matchmaking
    this.removeFromMatchmaking(socketId);

    // Remove from spectators
    this.removeSpectator(socketId);

    this.players.delete(socketId);
    this.stats.totalPlayers = this.players.size;
    
    logger.info(`👋 Player disconnected: ${player.username} (${socketId})`);
    return player;
  }

  getPlayer(socketId) {
    return this.players.get(socketId);
  }

  // Room Management
  createRoom(hostSocketId, roomConfig = {}) {
    const roomId = uuidv4();
    const host = this.players.get(hostSocketId);
    
    if (!host) {
      throw new Error('Host player not found');
    }

    const room = new GameRoom(roomId, host, {
      maxPlayers: Math.min(roomConfig.maxPlayers || 4, this.maxPlayersPerRoom),
      gameMode: roomConfig.gameMode || 'classic',
      mapId: roomConfig.mapId || 'backyard',
      isPrivate: roomConfig.isPrivate || false,
      ...roomConfig
    });

    this.rooms.set(roomId, room);
    this.stats.activeRooms = this.rooms.size;
    
    // Add host to room
    this.joinRoom(hostSocketId, roomId);
    
    logger.info(`🏠 Room created: ${roomId} by ${host.username}`);
    return room;
  }

  joinRoom(socketId, roomId) {
    const player = this.players.get(socketId);
    const room = this.rooms.get(roomId);

    if (!player) throw new Error('Player not found');
    if (!room) throw new Error('Room not found');
    if (room.isFull()) throw new Error('Room is full');
    if (player.roomId) throw new Error('Player already in a room');

    room.addPlayer(player);
    player.roomId = roomId;
    
    logger.info(`🚪 Player ${player.username} joined room ${roomId}`);
    return room;
  }

  leaveRoom(socketId, roomId) {
    const player = this.players.get(socketId);
    const room = this.rooms.get(roomId);

    if (!player || !room) return false;

    room.removePlayer(socketId);
    player.roomId = null;

    // If room is empty, delete it
    if (room.isEmpty()) {
      this.deleteRoom(roomId);
    }

    logger.info(`🚪 Player ${player.username} left room ${roomId}`);
    return true;
  }

  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    // Remove all players from room
    for (const player of room.players.values()) {
      player.roomId = null;
    }

    // Stop replay recording if active
    if (room.replayId) {
      this.replaySystem.stopRecording(room.replayId);
    }

    this.rooms.delete(roomId);
    this.stats.activeRooms = this.rooms.size;
    
    logger.info(`🗑️ Room deleted: ${roomId}`);
    return true;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getRoomsList(filters = {}) {
    const roomsList = Array.from(this.rooms.values())
      .filter(room => !room.isPrivate)
      .filter(room => {
        if (filters.gameMode && room.gameMode !== filters.gameMode) return false;
        if (filters.mapId && room.mapId !== filters.mapId) return false;
        if (filters.hasSlots && room.isFull()) return false;
        return true;
      })
      .map(room => room.getPublicInfo());

    return roomsList;
  }

  // Matchmaking
  joinMatchmaking(socketId, preferences = {}) {
    const player = this.players.get(socketId);
    if (!player) throw new Error('Player not found');
    if (player.roomId) throw new Error('Player already in a room');

    this.matchmaking.set(socketId, {
      player,
      preferences,
      joinedAt: Date.now()
    });

    // Try to find a match immediately
    this.tryMatchmaking();
    
    logger.info(`🔍 Player ${player.username} joined matchmaking`);
  }

  removeFromMatchmaking(socketId) {
    if (this.matchmaking.has(socketId)) {
      const entry = this.matchmaking.get(socketId);
      this.matchmaking.delete(socketId);
      logger.info(`❌ Player ${entry.player.username} removed from matchmaking`);
      return true;
    }
    return false;
  }

  tryMatchmaking() {
    const waitingPlayers = Array.from(this.matchmaking.values());
    
    if (waitingPlayers.length < 2) return;

    // Group players by preferences
    const groups = new Map();
    
    for (const entry of waitingPlayers) {
      const key = `${entry.preferences.gameMode || 'classic'}_${entry.preferences.mapId || 'backyard'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }

    // Create matches for groups with enough players
    for (const [key, group] of groups) {
      if (group.length >= 2) {
        const playersToMatch = group.slice(0, Math.min(group.length, this.maxPlayersPerRoom));
        this.createMatchFromGroup(playersToMatch, key);
      }
    }
  }

  createMatchFromGroup(players, preferenceKey) {
    const [gameMode, mapId] = preferenceKey.split('_');
    const host = players[0];
    
    try {
      const room = this.createRoom(host.player.socketId, {
        gameMode,
        mapId,
        isPrivate: false
      });

      // Add other players to the room
      for (let i = 1; i < players.length; i++) {
        const player = players[i];
        this.joinRoom(player.player.socketId, room.id);
        this.matchmaking.delete(player.player.socketId);
      }

      this.matchmaking.delete(host.player.socketId);
      
      logger.info(`⚡ Match created for ${players.length} players`);
      return room;
    } catch (error) {
      logger.error('Failed to create match:', error);
    }
  }

  // Spectator Management
  addSpectator(socketId, roomId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    
    const spectators = this.spectators.get(roomId) || new Set();
    if (spectators.size >= this.spectatorLimit) {
      throw new Error('Spectator limit reached');
    }
    
    spectators.add(socketId);
    this.spectators.set(roomId, spectators);
    
    logger.info(`👁️ Spectator ${socketId} joined room ${roomId}`);
    return room.getSpectatorData();
  }

  removeSpectator(socketId) {
    for (const [roomId, spectators] of this.spectators) {
      if (spectators.has(socketId)) {
        spectators.delete(socketId);
        if (spectators.size === 0) {
          this.spectators.delete(roomId);
        }
        logger.info(`👁️ Spectator ${socketId} removed from room ${roomId}`);
        return true;
      }
    }
    return false;
  }

  getSpectators(roomId) {
    return this.spectators.get(roomId) || new Set();
  }

  // Game Session Management
  startGameSession(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    
    const sessionId = room.startGame();
    this.stats.totalGames++;
    
    // Start replay recording
    const replayId = this.replaySystem.startRecording(room);
    room.replayId = replayId;
    
    logger.info(`🎮 Game session started in room ${roomId} (session: ${sessionId})`);
    return sessionId;
  }

  endGameSession(roomId, results) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    
    room.endGame(results);
    
    // Stop replay recording
    if (room.replayId) {
      this.replaySystem.stopRecording(room.replayId);
      room.replayId = null;
    }
    
    logger.info(`🏁 Game session ended in room ${roomId}`);
    return true;
  }

  // Anti-cheat Integration
  validatePlayerAction(socketId, action) {
    const player = this.players.get(socketId);
    if (!player) return false;
    
    return this.antiCheat.validateAction(player, action);
  }

  reportSuspiciousActivity(socketId, activity) {
    const player = this.players.get(socketId);
    if (!player) return;
    
    this.antiCheat.reportActivity(player, activity);
  }

  // Utility Methods
  cleanupInactiveRooms() {
    const now = Date.now();
    const inactivityThreshold = 30 * 60 * 1000; // 30 minutes
    
    for (const [roomId, room] of this.rooms) {
      if (room.isEmpty() && (now - room.lastActivity) > inactivityThreshold) {
        this.deleteRoom(roomId);
      }
    }
  }

  updateStats() {
    this.stats.activeRooms = this.rooms.size;
    this.stats.totalPlayers = this.players.size;
  }

  getServerStats() {
    return {
      ...this.stats,
      uptime: Date.now() - this.stats.serverStartTime,
      memoryUsage: process.memoryUsage(),
      matchmakingQueue: this.matchmaking.size,
      totalSpectators: Array.from(this.spectators.values())
        .reduce((total, spectators) => total + spectators.size, 0)
    };
  }

  async shutdown() {
    logger.info('🛑 Shutting down Game Manager...');
    
    // Stop game loop
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
    }
    
    // Notify all players about shutdown
    for (const room of this.rooms.values()) {
      room.broadcast('server:shutdown', { 
        message: 'Server is shutting down',
        gracePeriod: 30000 
      });
    }
    
    // Save any pending data
    await this.replaySystem.shutdown();
    
    logger.info('✅ Game Manager shutdown complete');
  }
}

module.exports = GameManager;