const { logger } = require('../utils/logger');

class AntiCheat {
  constructor() {
    this.enabled = process.env.ANTI_CHEAT_ENABLED === 'true';
    this.playerData = new Map();
    this.suspiciousPlayers = new Map();
    this.banList = new Set();
    
    // Thresholds for different violations
    this.thresholds = {
      speedHack: 20, // Max pixels per frame
      teleportDistance: 100, // Max distance between frames
      rapidInput: 30, // Max inputs per second
      impossibleJumps: 5, // Consecutive impossible jumps
      invalidStates: 10, // Invalid game states per minute
      healthManipulation: 3, // Suspicious health changes
      scoreManipulation: 5, // Suspicious score changes
      positionRollback: 50 // Max rollback distance
    };
    
    // Time windows for tracking
    this.windows = {
      inputTracking: 1000, // 1 second
      positionTracking: 100, // 100ms
      stateValidation: 60000, // 1 minute
      violationDecay: 300000 // 5 minutes
    };
    
    this.statistics = {
      totalChecks: 0,
      violationsDetected: 0,
      playersWarned: 0,
      playersBanned: 0,
      falsePositives: 0
    };
  }

  async initialize() {
    if (!this.enabled) {
      logger.info('🛡️ Anti-cheat system disabled');
      return;
    }
    
    logger.info('🛡️ Anti-cheat system initialized');
    
    // Start periodic cleanup
    setInterval(() => {
      this.cleanupOldData();
    }, 60000); // Every minute
    
    // Load ban list from database if available
    await this.loadBanList();
  }

  async loadBanList() {
    // TODO: Load from database
    logger.info('📋 Ban list loaded');
  }

  // Main validation entry point
  validateAction(player, action) {
    if (!this.enabled) return true;
    
    this.statistics.totalChecks++;
    
    // Initialize player tracking if needed
    if (!this.playerData.has(player.socketId)) {
      this.initializePlayerTracking(player);
    }
    
    const playerData = this.playerData.get(player.socketId);
    const now = Date.now();
    
    try {
      // Validate different types of actions
      switch (action.type) {
        case 'input':
          return this.validateInput(player, action, playerData, now);
        case 'position':
          return this.validatePosition(player, action, playerData, now);
        case 'state':
          return this.validateGameState(player, action, playerData, now);
        case 'combat':
          return this.validateCombatAction(player, action, playerData, now);
        default:
          return this.validateGeneric(player, action, playerData, now);
      }
    } catch (error) {
      logger.error('Anti-cheat validation error:', error);
      return true; // Allow action if validation fails
    }
  }

  initializePlayerTracking(player) {
    this.playerData.set(player.socketId, {
      playerId: player.id,
      socketId: player.socketId,
      username: player.username,
      joinTime: Date.now(),
      
      // Input tracking
      inputHistory: [],
      inputRate: 0,
      lastInputTime: 0,
      
      // Position tracking
      positionHistory: [],
      lastPosition: { x: 0, y: 0 },
      lastPositionTime: 0,
      velocityHistory: [],
      
      // State tracking
      stateHistory: [],
      lastHealth: 100,
      lastLives: 3,
      lastScore: 0,
      
      // Violation tracking
      violations: new Map(),
      warningCount: 0,
      lastWarning: 0,
      
      // Game-specific tracking
      jumpCount: 0,
      consecutiveJumps: 0,
      lastGroundTime: Date.now(),
      impossibleActions: 0,
      
      // Performance metrics
      averageLatency: 0,
      latencyHistory: [],
      packetLoss: 0
    });
  }

  validateInput(player, action, playerData, now) {
    const input = action.data;
    
    // Track input rate
    playerData.inputHistory.push(now);
    playerData.inputHistory = playerData.inputHistory.filter(
      time => now - time < this.windows.inputTracking
    );
    
    playerData.inputRate = playerData.inputHistory.length;
    
    // Check for rapid input spam
    if (playerData.inputRate > this.thresholds.rapidInput) {
      this.recordViolation(player, 'rapid_input', {
        rate: playerData.inputRate,
        threshold: this.thresholds.rapidInput
      });
      return false;
    }
    
    // Validate input timing
    if (now - playerData.lastInputTime < 16) { // Minimum 16ms between inputs (60fps)
      const timeDiff = now - playerData.lastInputTime;
      if (timeDiff < 5) { // Less than 5ms is suspicious
        this.recordViolation(player, 'input_timing', {
          timeDiff,
          expected: 16
        });
        return false;
      }
    }
    
    // Validate input combinations
    if (!this.validateInputCombination(input, playerData)) {
      this.recordViolation(player, 'impossible_input', {
        input,
        context: 'Invalid input combination'
      });
      return false;
    }
    
    playerData.lastInputTime = now;
    return true;
  }

  validateInputCombination(input, playerData) {
    // Check for impossible input combinations
    
    // Can't move left and right simultaneously at max speed
    if (input.left && input.right && input.leftIntensity > 0.9 && input.rightIntensity > 0.9) {
      return false;
    }
    
    // Can't attack and shield simultaneously
    if (input.attack && input.shield) {
      return false;
    }
    
    // Can't dodge and move in opposite direction
    if (input.dodge && input.left && playerData.lastPosition && 
        playerData.velocityHistory.length > 0) {
      const lastVelocity = playerData.velocityHistory[playerData.velocityHistory.length - 1];
      if (lastVelocity.x > 5) { // Moving right fast
        return false; // But trying to dodge left
      }
    }
    
    return true;
  }

  validatePosition(player, action, playerData, now) {
    const position = action.data.position;
    const velocity = action.data.velocity;
    
    // Update position history
    playerData.positionHistory.push({
      position: { ...position },
      velocity: velocity ? { ...velocity } : null,
      timestamp: now
    });
    
    // Keep only recent history
    playerData.positionHistory = playerData.positionHistory.filter(
      entry => now - entry.timestamp < this.windows.positionTracking * 10
    );
    
    if (playerData.positionHistory.length < 2) {
      playerData.lastPosition = position;
      playerData.lastPositionTime = now;
      return true;
    }
    
    const lastEntry = playerData.positionHistory[playerData.positionHistory.length - 2];
    const timeDiff = now - lastEntry.timestamp;
    
    if (timeDiff > 0) {
      // Calculate movement distance
      const distance = Math.sqrt(
        Math.pow(position.x - lastEntry.position.x, 2) +
        Math.pow(position.y - lastEntry.position.y, 2)
      );
      
      const speed = distance / (timeDiff / 1000); // pixels per second
      const maxSpeed = this.thresholds.speedHack * 60; // Convert to pixels per second
      
      // Check for speed hacking
      if (speed > maxSpeed) {
        this.recordViolation(player, 'speed_hack', {
          speed,
          maxSpeed,
          distance,
          timeDiff
        });
        return false;
      }
      
      // Check for teleportation
      if (distance > this.thresholds.teleportDistance && timeDiff < 100) {
        this.recordViolation(player, 'teleport', {
          distance,
          threshold: this.thresholds.teleportDistance,
          timeDiff
        });
        return false;
      }
      
      // Validate physics consistency
      if (velocity && !this.validatePhysics(lastEntry, { position, velocity }, timeDiff)) {
        this.recordViolation(player, 'physics_violation', {
          lastVelocity: lastEntry.velocity,
          currentVelocity: velocity,
          distance,
          timeDiff
        });
        return false;
      }
    }
    
    playerData.lastPosition = position;
    playerData.lastPositionTime = now;
    return true;
  }

  validatePhysics(lastEntry, currentEntry, timeDiff) {
    if (!lastEntry.velocity || !currentEntry.velocity) return true;
    
    const deltaTime = timeDiff / 1000; // Convert to seconds
    const gravity = 0.8; // Game's gravity constant
    
    // Expected velocity change due to gravity
    const expectedVelocityY = lastEntry.velocity.y + (gravity * deltaTime * 60); // 60fps
    const actualVelocityY = currentEntry.velocity.y;
    
    // Allow some tolerance for floating point errors and network lag
    const tolerance = 5;
    
    if (Math.abs(actualVelocityY - expectedVelocityY) > tolerance) {
      // Check if player was on ground (gravity wouldn't apply)
      if (lastEntry.position.y < 450 && currentEntry.position.y < 450) {
        return true; // On ground, different physics
      }
      return false;
    }
    
    return true;
  }

  validateGameState(player, action, playerData, now) {
    const state = action.data;
    
    // Track state changes
    playerData.stateHistory.push({
      state: { ...state },
      timestamp: now
    });
    
    // Keep only recent history
    playerData.stateHistory = playerData.stateHistory.filter(
      entry => now - entry.timestamp < this.windows.stateValidation
    );
    
    // Validate health changes
    if (state.health !== undefined) {
      const healthDiff = state.health - playerData.lastHealth;
      
      // Health should only increase with healing items or decrease with damage
      if (healthDiff > 50) { // Suspicious large health increase
        this.recordViolation(player, 'health_manipulation', {
          oldHealth: playerData.lastHealth,
          newHealth: state.health,
          diff: healthDiff
        });
        return false;
      }
      
      playerData.lastHealth = state.health;
    }
    
    // Validate lives changes
    if (state.lives !== undefined) {
      if (state.lives > playerData.lastLives + 1) { // Lives shouldn't increase much
        this.recordViolation(player, 'lives_manipulation', {
          oldLives: playerData.lastLives,
          newLives: state.lives
        });
        return false;
      }
      
      playerData.lastLives = state.lives;
    }
    
    // Validate score changes
    if (state.score !== undefined) {
      const scoreDiff = state.score - playerData.lastScore;
      
      if (scoreDiff > 1000) { // Suspicious large score increase
        this.recordViolation(player, 'score_manipulation', {
          oldScore: playerData.lastScore,
          newScore: state.score,
          diff: scoreDiff
        });
        return false;
      }
      
      playerData.lastScore = state.score;
    }
    
    // Validate impossible states
    if (state.isGrounded && state.position && state.position.y < 100) {
      this.recordViolation(player, 'impossible_state', {
        state: 'grounded_in_air',
        position: state.position
      });
      return false;
    }
    
    return true;
  }

  validateCombatAction(player, action, playerData, now) {
    const combatData = action.data;
    
    // Validate attack timing
    if (combatData.type === 'attack') {
      const lastAttack = playerData.stateHistory
        .filter(entry => entry.state.isAttacking)
        .pop();
      
      if (lastAttack && now - lastAttack.timestamp < 250) { // 250ms cooldown
        this.recordViolation(player, 'attack_spam', {
          timeDiff: now - lastAttack.timestamp,
          minCooldown: 250
        });
        return false;
      }
    }
    
    // Validate damage values
    if (combatData.damage > 50) { // Max single hit damage
      this.recordViolation(player, 'damage_hack', {
        damage: combatData.damage,
        maxDamage: 50
      });
      return false;
    }
    
    return true;
  }

  validateGeneric(player, action, playerData, now) {
    // Generic validation for unknown action types
    
    // Check for action flooding
    const recentActions = playerData.stateHistory.filter(
      entry => now - entry.timestamp < 1000
    );
    
    if (recentActions.length > 100) { // Max 100 actions per second
      this.recordViolation(player, 'action_flood', {
        actionCount: recentActions.length
      });
      return false;
    }
    
    return true;
  }

  recordViolation(player, violationType, details) {
    const playerData = this.playerData.get(player.socketId);
    if (!playerData) return;
    
    this.statistics.violationsDetected++;
    
    // Initialize violation tracking for this type
    if (!playerData.violations.has(violationType)) {
      playerData.violations.set(violationType, {
        count: 0,
        firstOccurrence: Date.now(),
        lastOccurrence: Date.now(),
        details: []
      });
    }
    
    const violation = playerData.violations.get(violationType);
    violation.count++;
    violation.lastOccurrence = Date.now();
    violation.details.push({
      timestamp: Date.now(),
      ...details
    });
    
    // Keep only recent details
    violation.details = violation.details.filter(
      detail => Date.now() - detail.timestamp < this.windows.violationDecay
    );
    
    logger.warn(`🚨 Anti-cheat violation: ${violationType} by ${player.username} (${player.socketId})`, {
      count: violation.count,
      details
    });
    
    // Determine response based on violation severity
    this.handleViolation(player, violationType, violation);
  }

  handleViolation(player, violationType, violation) {
    const severity = this.getViolationSeverity(violationType, violation.count);
    
    switch (severity) {
      case 'low':
        // Just log for now
        break;
        
      case 'medium':
        this.warnPlayer(player, violationType);
        break;
        
      case 'high':
        this.kickPlayer(player, violationType);
        break;
        
      case 'critical':
        this.banPlayer(player, violationType);
        break;
    }
  }

  getViolationSeverity(violationType, count) {
    const severityRules = {
      rapid_input: { medium: 3, high: 8, critical: 15 },
      speed_hack: { medium: 1, high: 3, critical: 5 },
      teleport: { medium: 1, high: 2, critical: 3 },
      health_manipulation: { medium: 1, high: 2, critical: 3 },
      damage_hack: { medium: 1, high: 1, critical: 2 },
      physics_violation: { medium: 5, high: 10, critical: 20 },
      impossible_state: { medium: 3, high: 8, critical: 15 },
      attack_spam: { medium: 5, high: 12, critical: 25 }
    };
    
    const rules = severityRules[violationType] || { medium: 5, high: 10, critical: 20 };
    
    if (count >= rules.critical) return 'critical';
    if (count >= rules.high) return 'high';
    if (count >= rules.medium) return 'medium';
    return 'low';
  }

  warnPlayer(player, violationType) {
    const playerData = this.playerData.get(player.socketId);
    if (!playerData) return;
    
    playerData.warningCount++;
    playerData.lastWarning = Date.now();
    this.statistics.playersWarned++;
    
    logger.info(`⚠️ Warning issued to ${player.username} for ${violationType}`);
    
    // Send warning to player
    if (player.socket) {
      player.socket.emit('anti-cheat:warning', {
        type: violationType,
        message: 'Suspicious activity detected. Please play fairly.',
        warningCount: playerData.warningCount
      });
    }
  }

  kickPlayer(player, violationType) {
    logger.info(`👢 Kicking ${player.username} for ${violationType}`);
    
    if (player.socket) {
      player.socket.emit('anti-cheat:kick', {
        reason: violationType,
        message: 'You have been kicked for suspicious activity.'
      });
      
      player.socket.disconnect(true);
    }
  }

  banPlayer(player, violationType) {
    this.banList.add(player.id);
    this.statistics.playersBanned++;
    
    logger.warn(`🔨 Banned ${player.username} (${player.id}) for ${violationType}`);
    
    if (player.socket) {
      player.socket.emit('anti-cheat:ban', {
        reason: violationType,
        message: 'You have been banned for cheating.'
      });
      
      player.socket.disconnect(true);
    }
    
    // TODO: Save ban to database
  }

  // Public API for game manager
  reportActivity(player, activity) {
    this.validateAction(player, {
      type: activity.type || 'generic',
      data: activity.data || activity
    });
  }

  isPlayerBanned(playerId) {
    return this.banList.has(playerId);
  }

  getPlayerViolations(socketId) {
    const playerData = this.playerData.get(socketId);
    return playerData ? Array.from(playerData.violations.entries()) : [];
  }

  // Cleanup and maintenance
  cleanupOldData() {
    const now = Date.now();
    const cleanupThreshold = this.windows.violationDecay;
    
    for (const [socketId, playerData] of this.playerData) {
      // Clean old input history
      playerData.inputHistory = playerData.inputHistory.filter(
        time => now - time < this.windows.inputTracking
      );
      
      // Clean old position history
      playerData.positionHistory = playerData.positionHistory.filter(
        entry => now - entry.timestamp < this.windows.positionTracking * 10
      );
      
      // Clean old state history
      playerData.stateHistory = playerData.stateHistory.filter(
        entry => now - entry.timestamp < this.windows.stateValidation
      );
      
      // Decay old violations
      for (const [violationType, violation] of playerData.violations) {
        if (now - violation.lastOccurrence > cleanupThreshold) {
          violation.count = Math.max(0, violation.count - 1);
          if (violation.count === 0) {
            playerData.violations.delete(violationType);
          }
        }
      }
    }
  }

  removePlayer(socketId) {
    this.playerData.delete(socketId);
  }

  getStatistics() {
    return {
      ...this.statistics,
      activePlayers: this.playerData.size,
      bannedPlayers: this.banList.size,
      enabled: this.enabled
    };
  }

  // Admin functions
  unbanPlayer(playerId) {
    const result = this.banList.delete(playerId);
    if (result) {
      logger.info(`🔓 Unbanned player ${playerId}`);
    }
    return result;
  }

  clearPlayerViolations(socketId) {
    const playerData = this.playerData.get(socketId);
    if (playerData) {
      playerData.violations.clear();
      playerData.warningCount = 0;
      logger.info(`🧹 Cleared violations for player ${socketId}`);
      return true;
    }
    return false;
  }

  adjustThreshold(violationType, newThreshold) {
    if (this.thresholds.hasOwnProperty(violationType)) {
      this.thresholds[violationType] = newThreshold;
      logger.info(`⚙️ Adjusted ${violationType} threshold to ${newThreshold}`);
      return true;
    }
    return false;
  }
}

module.exports = AntiCheat;