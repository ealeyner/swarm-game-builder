const { v4: uuidv4 } = require('uuid');
const { logger } = require('../utils/logger');
const GameState = require('../models/GameState');
const { validateGameInput } = require('../utils/validation');

class GameRoom {
  constructor(id, host, config = {}) {
    this.id = id;
    this.host = host;
    this.players = new Map();
    this.gameState = new GameState();
    
    // Room configuration
    this.maxPlayers = config.maxPlayers || 4;
    this.gameMode = config.gameMode || 'classic';
    this.mapId = config.mapId || 'backyard';
    this.isPrivate = config.isPrivate || false;
    this.settings = {
      stockLives: config.stockLives || 3,
      timeLimit: config.timeLimit || 300, // 5 minutes
      itemsEnabled: config.itemsEnabled !== false,
      teamMode: config.teamMode || false,
      ...config.settings
    };
    
    // Game session state
    this.sessionId = null;
    this.isGameActive = false;
    this.gameStartTime = null;
    this.gameEndTime = null;
    this.gameResults = null;
    
    // Room metadata
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.replayId = null;
    
    // Input buffer for rollback netcode
    this.inputBuffer = new Map(); // playerId -> circular buffer of inputs
    this.confirmedFrame = 0;
    this.currentFrame = 0;
    
    // Bluey-specific character data
    this.blueyCharacters = {
      'bluey': {
        name: 'Bluey',
        abilities: ['keepy-uppy', 'shadowlands', 'dance-mode'],
        stats: { speed: 8, strength: 6, agility: 9 }
      },
      'bingo': {
        name: 'Bingo',
        abilities: ['magic-asparagus', 'sleepytime', 'featherwand'],
        stats: { speed: 7, strength: 5, agility: 8 }
      },
      'bandit': {
        name: 'Bandit (Dad)',
        abilities: ['takeaway', 'shadowlands', 'dad-dance'],
        stats: { speed: 6, strength: 9, agility: 7 }
      },
      'chilli': {
        name: 'Chilli (Mum)',
        abilities: ['meditation', 'helicopter', 'yoga-ball'],
        stats: { speed: 7, strength: 7, agility: 8 }
      }
    };
    
    logger.info(`🏠 Game room created: ${id} (${this.gameMode} on ${this.mapId})`);
  }

  // Player Management
  addPlayer(player) {
    if (this.players.size >= this.maxPlayers) {
      throw new Error('Room is full');
    }
    
    if (this.isGameActive) {
      throw new Error('Cannot join game in progress');
    }
    
    // Assign character if not already selected
    if (!player.character) {
      player.character = this.getAvailableCharacter();
    }
    
    this.players.set(player.socketId, player);
    player.roomId = this.id;
    
    // Initialize input buffer for this player
    this.inputBuffer.set(player.socketId, {
      buffer: new Array(120).fill(null), // 2 seconds at 60fps
      head: 0
    });
    
    this.updateLastActivity();
    
    logger.info(`👤 Player ${player.username} joined room ${this.id} as ${player.character}`);
    
    // Broadcast player joined
    this.broadcast('room:player-joined', {
      player: player.getPublicData(),
      roomInfo: this.getPublicInfo()
    }, player.socketId);
    
    return player;
  }

  removePlayer(socketId) {
    const player = this.players.get(socketId);
    if (!player) return false;
    
    this.players.delete(socketId);
    this.inputBuffer.delete(socketId);
    
    // If removing host and room has other players, transfer host
    if (this.host.socketId === socketId && this.players.size > 0) {
      this.host = this.players.values().next().value;
      logger.info(`👑 Host transferred to ${this.host.username} in room ${this.id}`);
    }
    
    this.updateLastActivity();
    
    // Broadcast player left
    this.broadcast('room:player-left', {
      playerId: socketId,
      roomInfo: this.getPublicInfo()
    });
    
    logger.info(`👋 Player ${player.username} left room ${this.id}`);
    return true;
  }

  getAvailableCharacter() {
    const usedCharacters = new Set(
      Array.from(this.players.values()).map(p => p.character).filter(Boolean)
    );
    
    const available = Object.keys(this.blueyCharacters).find(char => 
      !usedCharacters.has(char)
    );
    
    return available || 'bluey'; // Default to Bluey if all taken
  }

  // Game State Management
  startGame() {
    if (this.isGameActive) {
      throw new Error('Game already in progress');
    }
    
    if (this.players.size < 2) {
      throw new Error('Need at least 2 players to start');
    }
    
    this.sessionId = uuidv4();
    this.isGameActive = true;
    this.gameStartTime = Date.now();
    this.currentFrame = 0;
    this.confirmedFrame = 0;
    
    // Initialize game state with all players
    this.gameState.initialize({
      players: Array.from(this.players.values()),
      mapId: this.mapId,
      settings: this.settings,
      characters: this.blueyCharacters
    });
    
    // Broadcast game start
    this.broadcast('game:start', {
      sessionId: this.sessionId,
      gameState: this.gameState.getInitialState(),
      settings: this.settings,
      timestamp: this.gameStartTime
    });
    
    logger.info(`🎮 Game started in room ${this.id} (session: ${this.sessionId})`);
    return this.sessionId;
  }

  endGame(results = null) {
    if (!this.isGameActive) return false;
    
    this.isGameActive = false;
    this.gameEndTime = Date.now();
    this.gameResults = results || this.calculateGameResults();
    
    // Broadcast game end
    this.broadcast('game:end', {
      sessionId: this.sessionId,
      results: this.gameResults,
      duration: this.gameEndTime - this.gameStartTime,
      timestamp: this.gameEndTime
    });
    
    logger.info(`🏁 Game ended in room ${this.id} (duration: ${this.gameEndTime - this.gameStartTime}ms)`);
    return true;
  }

  calculateGameResults() {
    // Calculate winner based on game mode and current state
    const playerStats = this.gameState.getPlayerStats();
    
    switch (this.gameMode) {
      case 'classic':
        // Winner is last player standing or highest score
        return this.calculateClassicResults(playerStats);
      case 'time':
        // Winner has highest score when time runs out
        return this.calculateTimeResults(playerStats);
      case 'stock':
        // Winner is last player with lives remaining
        return this.calculateStockResults(playerStats);
      default:
        return this.calculateClassicResults(playerStats);
    }
  }

  calculateClassicResults(playerStats) {
    const sorted = Object.entries(playerStats)
      .sort((a, b) => b[1].score - a[1].score);
    
    return {
      winner: sorted[0]?.[0],
      rankings: sorted.map(([playerId, stats], index) => ({
        rank: index + 1,
        playerId,
        score: stats.score,
        kos: stats.kos,
        deaths: stats.deaths
      }))
    };
  }

  calculateTimeResults(playerStats) {
    return this.calculateClassicResults(playerStats);
  }

  calculateStockResults(playerStats) {
    const sorted = Object.entries(playerStats)
      .sort((a, b) => {
        // First by lives remaining, then by score
        if (b[1].lives !== a[1].lives) {
          return b[1].lives - a[1].lives;
        }
        return b[1].score - a[1].score;
      });
    
    return {
      winner: sorted[0]?.[0],
      rankings: sorted.map(([playerId, stats], index) => ({
        rank: index + 1,
        playerId,
        lives: stats.lives,
        score: stats.score,
        kos: stats.kos,
        deaths: stats.deaths
      }))
    };
  }

  // Input Handling and Rollback Netcode
  processPlayerInput(socketId, input) {
    if (!this.isGameActive) return false;
    
    // Validate input
    if (!validateGameInput(input)) {
      logger.warn(`Invalid input from player ${socketId}:`, input);
      return false;
    }
    
    const inputData = this.inputBuffer.get(socketId);
    if (!inputData) return false;
    
    // Store input in circular buffer
    const frameIndex = input.frame % inputData.buffer.length;
    inputData.buffer[frameIndex] = {
      ...input,
      timestamp: Date.now(),
      socketId
    };
    
    // Advance current frame
    this.currentFrame = Math.max(this.currentFrame, input.frame);
    
    // Check if we can advance confirmed frame
    this.updateConfirmedFrame();
    
    // Apply input to game state
    this.gameState.applyInput(socketId, input);
    
    // Broadcast input to other players for client-side prediction
    this.broadcast('game:input', {
      playerId: socketId,
      input: input,
      frame: this.currentFrame
    }, socketId);
    
    return true;
  }

  updateConfirmedFrame() {
    // Find the latest frame where we have inputs from all players
    let latestConfirmed = this.confirmedFrame;
    
    for (let frame = this.confirmedFrame + 1; frame <= this.currentFrame; frame++) {
      let hasAllInputs = true;
      
      for (const socketId of this.players.keys()) {
        const inputData = this.inputBuffer.get(socketId);
        const frameIndex = frame % inputData.buffer.length;
        
        if (!inputData.buffer[frameIndex] || inputData.buffer[frameIndex].frame !== frame) {
          hasAllInputs = false;
          break;
        }
      }
      
      if (hasAllInputs) {
        latestConfirmed = frame;
      } else {
        break;
      }
    }
    
    if (latestConfirmed > this.confirmedFrame) {
      this.confirmedFrame = latestConfirmed;
      
      // Broadcast confirmed frame for rollback
      this.broadcast('game:confirmed-frame', {
        frame: this.confirmedFrame,
        checksum: this.gameState.getChecksum(this.confirmedFrame)
      });
    }
  }

  // Game Loop Tick
  tick() {
    if (!this.isGameActive) return;
    
    this.currentFrame++;
    
    // Update game state
    this.gameState.tick(this.currentFrame);
    
    // Check win conditions
    if (this.checkWinConditions()) {
      this.endGame();
      return;
    }
    
    // Broadcast game state update every few frames
    if (this.currentFrame % 3 === 0) { // 20fps for state updates
      this.broadcast('game:state-update', {
        frame: this.currentFrame,
        state: this.gameState.getDeltaState(),
        timestamp: Date.now()
      });
    }
    
    this.updateLastActivity();
  }

  checkWinConditions() {
    const stats = this.gameState.getPlayerStats();
    
    switch (this.gameMode) {
      case 'stock':
        // Game ends when only one player has lives left
        const playersWithLives = Object.values(stats).filter(s => s.lives > 0);
        return playersWithLives.length <= 1;
        
      case 'time':
        // Game ends when time limit reached
        const elapsed = Date.now() - this.gameStartTime;
        return elapsed >= (this.settings.timeLimit * 1000);
        
      case 'classic':
        // Game ends when target score reached or all but one eliminated
        const activePlayers = Object.values(stats).filter(s => !s.eliminated);
        return activePlayers.length <= 1 || Math.max(...Object.values(stats).map(s => s.score)) >= 10;
        
      default:
        return false;
    }
  }

  // Communication
  broadcast(event, data, excludeSocketId = null) {
    for (const player of this.players.values()) {
      if (player.socketId !== excludeSocketId && player.socket) {
        player.socket.emit(event, data);
      }
    }
  }

  sendToPlayer(socketId, event, data) {
    const player = this.players.get(socketId);
    if (player && player.socket) {
      player.socket.emit(event, data);
    }
  }

  // Room State
  updateSettings(newSettings) {
    if (this.isGameActive) {
      throw new Error('Cannot change settings during active game');
    }
    
    this.settings = { ...this.settings, ...newSettings };
    this.updateLastActivity();
    
    this.broadcast('room:settings-updated', {
      settings: this.settings
    });
  }

  updateLastActivity() {
    this.lastActivity = Date.now();
  }

  // Status Checks
  isEmpty() {
    return this.players.size === 0;
  }

  isFull() {
    return this.players.size >= this.maxPlayers;
  }

  isActive() {
    return this.isGameActive || this.players.size > 0;
  }

  canStart() {
    return this.players.size >= 2 && !this.isGameActive;
  }

  // Public Data
  getPublicInfo() {
    return {
      id: this.id,
      hostId: this.host.socketId,
      hostName: this.host.username,
      players: Array.from(this.players.values()).map(p => p.getPublicData()),
      maxPlayers: this.maxPlayers,
      gameMode: this.gameMode,
      mapId: this.mapId,
      isPrivate: this.isPrivate,
      isGameActive: this.isGameActive,
      settings: this.settings,
      canJoin: !this.isFull() && !this.isGameActive,
      createdAt: this.createdAt
    };
  }

  getSpectatorData() {
    return {
      ...this.getPublicInfo(),
      gameState: this.isGameActive ? this.gameState.getPublicState() : null,
      currentFrame: this.currentFrame,
      gameStartTime: this.gameStartTime
    };
  }

  getGameData() {
    return {
      sessionId: this.sessionId,
      gameState: this.gameState.getFullState(),
      currentFrame: this.currentFrame,
      confirmedFrame: this.confirmedFrame,
      gameStartTime: this.gameStartTime,
      settings: this.settings
    };
  }
}

module.exports = GameRoom;