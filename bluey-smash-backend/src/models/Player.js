const { v4: uuidv4 } = require('uuid');

class Player {
  constructor(socketId, data = {}) {
    this.socketId = socketId;
    this.id = data.id || uuidv4();
    this.username = data.username || `Player_${socketId.slice(0, 6)}`;
    this.email = data.email || null;
    
    // Game-specific properties
    this.character = data.character || null;
    this.skin = data.skin || 'default';
    this.level = data.level || 1;
    this.experience = data.experience || 0;
    this.rank = data.rank || 'Bronze';
    
    // Session properties
    this.roomId = null;
    this.isReady = false;
    this.isSpectating = false;
    this.socket = null; // Will be set by socket handler
    
    // Game state
    this.gameState = {
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      health: 100,
      lives: 3,
      score: 0,
      knockouts: 0,
      deaths: 0,
      combo: 0,
      isGrounded: true,
      isShielding: false,
      isDodging: false,
      isAttacking: false,
      facing: 'right',
      animation: 'idle',
      invulnerabilityFrames: 0
    };
    
    // Statistics
    this.stats = {
      totalGames: data.totalGames || 0,
      gamesWon: data.gamesWon || 0,
      totalKnockouts: data.totalKnockouts || 0,
      totalDeaths: data.totalDeaths || 0,
      totalDamageDealt: data.totalDamageDealt || 0,
      totalDamageTaken: data.totalDamageTaken || 0,
      favoriteCharacter: data.favoriteCharacter || 'bluey',
      longestWinStreak: data.longestWinStreak || 0,
      currentWinStreak: data.currentWinStreak || 0,
      hoursPlayed: data.hoursPlayed || 0,
      lastPlayed: new Date()
    };
    
    // Connection tracking
    this.connectionTime = Date.now();
    this.lastPing = Date.now();
    this.latency = 0;
    this.isConnected = true;
    
    // Anti-cheat tracking
    this.suspiciousActivity = {
      rapidInputs: 0,
      impossibleMovements: 0,
      invalidStates: 0,
      lastWarning: null
    };
    
    // Preferences
    this.preferences = {
      controls: data.controls || this.getDefaultControls(),
      audio: {
        masterVolume: data.audio?.masterVolume || 1.0,
        musicVolume: data.audio?.musicVolume || 0.8,
        sfxVolume: data.audio?.sfxVolume || 1.0
      },
      graphics: {
        quality: data.graphics?.quality || 'medium',
        showFPS: data.graphics?.showFPS || false,
        showHitboxes: data.graphics?.showHitboxes || false
      }
    };
  }

  getDefaultControls() {
    return {
      moveLeft: 'KeyA',
      moveRight: 'KeyD',
      jump: 'Space',
      crouch: 'KeyS',
      attack: 'KeyJ',
      specialAttack: 'KeyK',
      shield: 'KeyL',
      dodge: 'KeyI',
      taunt: 'KeyT',
      pause: 'Escape'
    };
  }

  // Game State Management
  updateGameState(newState) {
    this.gameState = { ...this.gameState, ...newState };
  }

  resetGameState() {
    this.gameState = {
      position: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      health: 100,
      lives: 3,
      score: 0,
      knockouts: 0,
      deaths: 0,
      combo: 0,
      isGrounded: true,
      isShielding: false,
      isDodging: false,
      isAttacking: false,
      facing: 'right',
      animation: 'idle',
      invulnerabilityFrames: 0
    };
  }

  // Character Management
  setCharacter(characterId) {
    const validCharacters = ['bluey', 'bingo', 'bandit', 'chilli'];
    if (validCharacters.includes(characterId)) {
      this.character = characterId;
      return true;
    }
    return false;
  }

  setSkin(skinId) {
    this.skin = skinId;
  }

  // Readiness State
  setReady(ready = true) {
    this.isReady = ready;
  }

  toggleReady() {
    this.isReady = !this.isReady;
    return this.isReady;
  }

  // Statistics Updates
  addGameResult(result) {
    this.stats.totalGames++;
    this.stats.totalKnockouts += result.knockouts || 0;
    this.stats.totalDeaths += result.deaths || 0;
    this.stats.totalDamageDealt += result.damageDealt || 0;
    this.stats.totalDamageTaken += result.damageTaken || 0;
    
    if (result.won) {
      this.stats.gamesWon++;
      this.stats.currentWinStreak++;
      this.stats.longestWinStreak = Math.max(
        this.stats.longestWinStreak, 
        this.stats.currentWinStreak
      );
    } else {
      this.stats.currentWinStreak = 0;
    }
    
    this.stats.lastPlayed = new Date();
    this.updateRank();
  }

  updateRank() {
    const winRate = this.stats.totalGames > 0 ? 
      this.stats.gamesWon / this.stats.totalGames : 0;
    const kdr = this.stats.totalDeaths > 0 ? 
      this.stats.totalKnockouts / this.stats.totalDeaths : this.stats.totalKnockouts;
    
    // Simple ranking system based on win rate and KDR
    const score = (winRate * 0.6) + (Math.min(kdr, 3) / 3 * 0.4);
    
    if (score >= 0.8) this.rank = 'Diamond';
    else if (score >= 0.65) this.rank = 'Platinum';
    else if (score >= 0.5) this.rank = 'Gold';
    else if (score >= 0.35) this.rank = 'Silver';
    else this.rank = 'Bronze';
  }

  // Connection Management
  updatePing(latency) {
    this.latency = latency;
    this.lastPing = Date.now();
  }

  setSocket(socket) {
    this.socket = socket;
    this.isConnected = true;
  }

  disconnect() {
    this.socket = null;
    this.isConnected = false;
  }

  // Anti-cheat
  reportSuspiciousActivity(activityType) {
    if (this.suspiciousActivity[activityType] !== undefined) {
      this.suspiciousActivity[activityType]++;
    }
    
    const totalSuspicious = Object.values(this.suspiciousActivity)
      .filter(val => typeof val === 'number')
      .reduce((sum, val) => sum + val, 0);
    
    if (totalSuspicious > 10) {
      this.suspiciousActivity.lastWarning = Date.now();
      return true; // Needs investigation
    }
    
    return false;
  }

  resetSuspiciousActivity() {
    this.suspiciousActivity = {
      rapidInputs: 0,
      impossibleMovements: 0,
      invalidStates: 0,
      lastWarning: null
    };
  }

  // Preferences
  updatePreferences(newPreferences) {
    this.preferences = { ...this.preferences, ...newPreferences };
  }

  updateControls(newControls) {
    this.preferences.controls = { ...this.preferences.controls, ...newControls };
  }

  // Validation
  isValidState() {
    return (
      this.socketId &&
      this.username &&
      this.gameState &&
      this.stats &&
      this.preferences
    );
  }

  // Public Data (for sending to other players)
  getPublicData() {
    return {
      id: this.id,
      socketId: this.socketId,
      username: this.username,
      character: this.character,
      skin: this.skin,
      level: this.level,
      rank: this.rank,
      isReady: this.isReady,
      isSpectating: this.isSpectating,
      isConnected: this.isConnected,
      latency: this.latency,
      gameState: {
        position: this.gameState.position,
        health: this.gameState.health,
        lives: this.gameState.lives,
        score: this.gameState.score,
        knockouts: this.gameState.knockouts,
        deaths: this.gameState.deaths,
        animation: this.gameState.animation,
        facing: this.gameState.facing
      }
    };
  }

  // Full data (for database storage)
  getFullData() {
    return {
      id: this.id,
      socketId: this.socketId,
      username: this.username,
      email: this.email,
      character: this.character,
      skin: this.skin,
      level: this.level,
      experience: this.experience,
      rank: this.rank,
      gameState: this.gameState,
      stats: this.stats,
      preferences: this.preferences,
      connectionTime: this.connectionTime,
      lastPing: this.lastPing,
      latency: this.latency,
      suspiciousActivity: this.suspiciousActivity
    };
  }

  // Minimal data (for matchmaking)
  getMatchmakingData() {
    return {
      id: this.id,
      socketId: this.socketId,
      username: this.username,
      level: this.level,
      rank: this.rank,
      character: this.character,
      latency: this.latency,
      preferences: {
        gameMode: this.preferences.gameMode,
        region: this.preferences.region
      }
    };
  }

  // Session data (for reconnection)
  getSessionData() {
    return {
      id: this.id,
      socketId: this.socketId,
      username: this.username,
      roomId: this.roomId,
      character: this.character,
      isReady: this.isReady,
      gameState: this.gameState,
      connectionTime: this.connectionTime
    };
  }

  // Calculate session duration
  getSessionDuration() {
    return Date.now() - this.connectionTime;
  }

  // Get win rate
  getWinRate() {
    return this.stats.totalGames > 0 ? 
      this.stats.gamesWon / this.stats.totalGames : 0;
  }

  // Get KDR
  getKDR() {
    return this.stats.totalDeaths > 0 ? 
      this.stats.totalKnockouts / this.stats.totalDeaths : 
      this.stats.totalKnockouts;
  }

  // Check if player is active (recently pinged)
  isActive() {
    const inactivityThreshold = 30000; // 30 seconds
    return (Date.now() - this.lastPing) < inactivityThreshold;
  }

  toString() {
    return `Player{${this.username}(${this.socketId.slice(0, 6)})}`;
  }
}

module.exports = Player;