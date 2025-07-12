const fs = require('fs').promises;
const path = require('path');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class ReplaySystem {
  constructor() {
    this.activeRecordings = new Map();
    this.replayDirectory = path.join(process.cwd(), 'data', 'replays');
    this.compressionEnabled = true;
    this.maxReplaySize = 50 * 1024 * 1024; // 50MB
    this.maxReplayDuration = 30 * 60 * 1000; // 30 minutes
    
    this.statistics = {
      totalReplays: 0,
      totalSize: 0,
      averageSize: 0,
      recordingsInProgress: 0
    };
  }

  async initialize() {
    try {
      // Ensure replay directory exists
      await fs.mkdir(this.replayDirectory, { recursive: true });
      
      // Load existing replay metadata
      await this.loadReplayMetadata();
      
      logger.info('📽️ Replay system initialized');
    } catch (error) {
      logger.error('Failed to initialize replay system:', error);
    }
  }

  async loadReplayMetadata() {
    try {
      const files = await fs.readdir(this.replayDirectory);
      const replayFiles = files.filter(file => file.endsWith('.json'));
      
      let totalSize = 0;
      for (const file of replayFiles) {
        const filePath = path.join(this.replayDirectory, file);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      }
      
      this.statistics.totalReplays = replayFiles.length;
      this.statistics.totalSize = totalSize;
      this.statistics.averageSize = replayFiles.length > 0 ? 
        totalSize / replayFiles.length : 0;
      
      logger.info(`📊 Loaded ${replayFiles.length} replays (${(totalSize / 1024 / 1024).toFixed(2)} MB)`);
    } catch (error) {
      logger.error('Failed to load replay metadata:', error);
    }
  }

  startRecording(gameRoom) {
    const replayId = uuidv4();
    
    const recording = {
      id: replayId,
      roomId: gameRoom.id,
      sessionId: gameRoom.sessionId,
      startTime: Date.now(),
      endTime: null,
      
      // Game metadata
      gameMode: gameRoom.gameMode,
      mapId: gameRoom.mapId,
      players: gameRoom.players.size,
      settings: { ...gameRoom.settings },
      
      // Player information
      playerData: Array.from(gameRoom.players.values()).map(player => ({
        id: player.id,
        socketId: player.socketId,
        username: player.username,
        character: player.character,
        skin: player.skin,
        rank: player.rank
      })),
      
      // Recording data
      frames: [],
      inputs: [],
      events: [],
      
      // Statistics
      frameCount: 0,
      inputCount: 0,
      eventCount: 0,
      size: 0,
      
      // Compression data
      compressed: false,
      compressionRatio: 1.0
    };
    
    this.activeRecordings.set(replayId, recording);
    this.statistics.recordingsInProgress++;
    
    // Record initial game state
    this.recordEvent(replayId, {
      type: 'game_start',
      timestamp: Date.now(),
      frame: 0,
      data: {
        initialState: gameRoom.gameState.getInitialState(),
        playerPositions: Array.from(gameRoom.players.values()).map(p => ({
          id: p.socketId,
          position: p.gameState.position,
          character: p.character
        }))
      }
    });
    
    logger.info(`🎬 Started recording replay ${replayId} for room ${gameRoom.id}`);
    return replayId;
  }

  recordFrame(replayId, frameData) {
    const recording = this.activeRecordings.get(replayId);
    if (!recording) return false;
    
    // Check size limits
    if (recording.size > this.maxReplaySize) {
      logger.warn(`Replay ${replayId} exceeded size limit, stopping recording`);
      this.stopRecording(replayId);
      return false;
    }
    
    // Check duration limits
    if (Date.now() - recording.startTime > this.maxReplayDuration) {
      logger.warn(`Replay ${replayId} exceeded duration limit, stopping recording`);
      this.stopRecording(replayId);
      return false;
    }
    
    const frame = {
      frame: frameData.frame,
      timestamp: Date.now(),
      gameState: this.compressGameState(frameData.gameState),
      playerStates: frameData.players ? 
        frameData.players.map(p => this.compressPlayerState(p)) : []
    };
    
    recording.frames.push(frame);
    recording.frameCount++;
    recording.size += this.estimateFrameSize(frame);
    
    return true;
  }

  recordInput(replayId, inputData) {
    const recording = this.activeRecordings.get(replayId);
    if (!recording) return false;
    
    const input = {
      frame: inputData.frame,
      timestamp: Date.now(),
      playerId: inputData.playerId,
      input: { ...inputData.input },
      validated: inputData.validated || false
    };
    
    recording.inputs.push(input);
    recording.inputCount++;
    recording.size += this.estimateInputSize(input);
    
    return true;
  }

  recordEvent(replayId, eventData) {
    const recording = this.activeRecordings.get(replayId);
    if (!recording) return false;
    
    const event = {
      frame: eventData.frame,
      timestamp: eventData.timestamp || Date.now(),
      type: eventData.type,
      data: eventData.data ? { ...eventData.data } : null
    };
    
    recording.events.push(event);
    recording.eventCount++;
    recording.size += this.estimateEventSize(event);
    
    return true;
  }

  async stopRecording(replayId) {
    const recording = this.activeRecordings.get(replayId);
    if (!recording) return null;
    
    recording.endTime = Date.now();
    recording.duration = recording.endTime - recording.startTime;
    
    // Remove from active recordings
    this.activeRecordings.delete(replayId);
    this.statistics.recordingsInProgress--;
    
    try {
      // Compress the replay if enabled
      if (this.compressionEnabled) {
        await this.compressReplay(recording);
      }
      
      // Save to disk
      const filename = this.generateReplayFilename(recording);
      const filepath = path.join(this.replayDirectory, filename);
      
      await fs.writeFile(filepath, JSON.stringify(recording, null, 2));
      
      // Update statistics
      this.statistics.totalReplays++;
      this.statistics.totalSize += recording.size;
      this.statistics.averageSize = this.statistics.totalSize / this.statistics.totalReplays;
      
      logger.info(`💾 Saved replay ${replayId} (${(recording.size / 1024).toFixed(2)} KB, ${recording.frameCount} frames)`);
      
      return {
        id: replayId,
        filename,
        filepath,
        size: recording.size,
        duration: recording.duration,
        frameCount: recording.frameCount
      };
      
    } catch (error) {
      logger.error(`Failed to save replay ${replayId}:`, error);
      return null;
    }
  }

  async loadReplay(replayId) {
    try {
      const files = await fs.readdir(this.replayDirectory);
      const replayFile = files.find(file => file.includes(replayId));
      
      if (!replayFile) {
        throw new Error('Replay not found');
      }
      
      const filepath = path.join(this.replayDirectory, replayFile);
      const data = await fs.readFile(filepath, 'utf-8');
      const replay = JSON.parse(data);
      
      // Decompress if needed
      if (replay.compressed) {
        await this.decompressReplay(replay);
      }
      
      logger.info(`📼 Loaded replay ${replayId}`);
      return replay;
      
    } catch (error) {
      logger.error(`Failed to load replay ${replayId}:`, error);
      throw error;
    }
  }

  async deleteReplay(replayId) {
    try {
      const files = await fs.readdir(this.replayDirectory);
      const replayFile = files.find(file => file.includes(replayId));
      
      if (!replayFile) {
        return false;
      }
      
      const filepath = path.join(this.replayDirectory, replayFile);
      const stats = await fs.stat(filepath);
      
      await fs.unlink(filepath);
      
      // Update statistics
      this.statistics.totalReplays--;
      this.statistics.totalSize -= stats.size;
      this.statistics.averageSize = this.statistics.totalReplays > 0 ? 
        this.statistics.totalSize / this.statistics.totalReplays : 0;
      
      logger.info(`🗑️ Deleted replay ${replayId}`);
      return true;
      
    } catch (error) {
      logger.error(`Failed to delete replay ${replayId}:`, error);
      return false;
    }
  }

  async listReplays(filters = {}) {
    try {
      const files = await fs.readdir(this.replayDirectory);
      const replayFiles = files.filter(file => file.endsWith('.json'));
      
      const replays = [];
      
      for (const file of replayFiles) {
        try {
          const filepath = path.join(this.replayDirectory, file);
          const data = await fs.readFile(filepath, 'utf-8');
          const replay = JSON.parse(data);
          
          // Apply filters
          if (filters.gameMode && replay.gameMode !== filters.gameMode) continue;
          if (filters.mapId && replay.mapId !== filters.mapId) continue;
          if (filters.playerName && !replay.playerData.some(p => 
            p.username.toLowerCase().includes(filters.playerName.toLowerCase()))) continue;
          if (filters.minDuration && replay.duration < filters.minDuration) continue;
          if (filters.maxDuration && replay.duration > filters.maxDuration) continue;
          
          replays.push({
            id: replay.id,
            filename: file,
            gameMode: replay.gameMode,
            mapId: replay.mapId,
            players: replay.playerData.map(p => p.username),
            duration: replay.duration,
            frameCount: replay.frameCount,
            size: replay.size,
            startTime: replay.startTime,
            compressed: replay.compressed || false
          });
          
        } catch (error) {
          logger.error(`Failed to read replay file ${file}:`, error);
        }
      }
      
      // Sort by start time (newest first)
      replays.sort((a, b) => b.startTime - a.startTime);
      
      return replays;
      
    } catch (error) {
      logger.error('Failed to list replays:', error);
      return [];
    }
  }

  // Compression helpers
  compressGameState(gameState) {
    if (!gameState) return null;
    
    // Remove unnecessary data and round floating point numbers
    return {
      frame: gameState.frame,
      players: gameState.players ? gameState.players.map(p => ({
        id: p.id,
        pos: [Math.round(p.position.x), Math.round(p.position.y)],
        vel: [Math.round(p.velocity.x * 10) / 10, Math.round(p.velocity.y * 10) / 10],
        hp: p.health,
        lives: p.lives,
        score: p.score,
        anim: p.animation,
        face: p.facing === 'right' ? 1 : 0
      })) : [],
      entities: gameState.entities ? gameState.entities.map(e => ({
        id: e.id,
        type: e.type,
        pos: [Math.round(e.position.x), Math.round(e.position.y)]
      })) : []
    };
  }

  compressPlayerState(playerState) {
    return {
      id: playerState.id,
      pos: [Math.round(playerState.position.x), Math.round(playerState.position.y)],
      vel: [Math.round(playerState.velocity.x * 10) / 10, Math.round(playerState.velocity.y * 10) / 10],
      hp: playerState.health,
      lives: playerState.lives,
      score: playerState.score,
      anim: playerState.animation,
      flags: [
        playerState.isGrounded ? 1 : 0,
        playerState.isShielding ? 1 : 0,
        playerState.isDodging ? 1 : 0,
        playerState.isAttacking ? 1 : 0
      ]
    };
  }

  async compressReplay(recording) {
    // Simple compression by removing redundant data and delta encoding
    
    // Delta encode positions
    for (let i = 1; i < recording.frames.length; i++) {
      const current = recording.frames[i];
      const previous = recording.frames[i - 1];
      
      if (current.gameState && previous.gameState) {
        for (let j = 0; j < current.gameState.players.length; j++) {
          if (previous.gameState.players[j]) {
            const currentPlayer = current.gameState.players[j];
            const previousPlayer = previous.gameState.players[j];
            
            // Store position delta
            currentPlayer.pos = [
              currentPlayer.pos[0] - previousPlayer.pos[0],
              currentPlayer.pos[1] - previousPlayer.pos[1]
            ];
          }
        }
      }
    }
    
    const originalSize = recording.size;
    recording.size = this.estimateReplaySize(recording);
    recording.compressionRatio = originalSize / recording.size;
    recording.compressed = true;
    
    logger.info(`🗜️ Compressed replay ${recording.id} by ${(100 * (1 - recording.compressionRatio)).toFixed(1)}%`);
  }

  async decompressReplay(recording) {
    if (!recording.compressed) return;
    
    // Restore delta encoded positions
    for (let i = 1; i < recording.frames.length; i++) {
      const current = recording.frames[i];
      const previous = recording.frames[i - 1];
      
      if (current.gameState && previous.gameState) {
        for (let j = 0; j < current.gameState.players.length; j++) {
          if (previous.gameState.players[j]) {
            const currentPlayer = current.gameState.players[j];
            const previousPlayer = previous.gameState.players[j];
            
            // Restore absolute position from delta
            currentPlayer.pos = [
              currentPlayer.pos[0] + previousPlayer.pos[0],
              currentPlayer.pos[1] + previousPlayer.pos[1]
            ];
          }
        }
      }
    }
    
    recording.compressed = false;
  }

  // Size estimation helpers
  estimateFrameSize(frame) {
    return JSON.stringify(frame).length;
  }

  estimateInputSize(input) {
    return JSON.stringify(input).length;
  }

  estimateEventSize(event) {
    return JSON.stringify(event).length;
  }

  estimateReplaySize(recording) {
    return JSON.stringify(recording).length;
  }

  generateReplayFilename(recording) {
    const date = new Date(recording.startTime);
    const dateStr = date.toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const playerNames = recording.playerData.map(p => p.username).join('_');
    const shortNames = playerNames.length > 50 ? 
      playerNames.substring(0, 47) + '...' : playerNames;
    
    return `replay_${dateStr}_${recording.gameMode}_${shortNames}_${recording.id.slice(0, 8)}.json`;
  }

  // Cleanup old replays
  async cleanupOldReplays(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days
    try {
      const files = await fs.readdir(this.replayDirectory);
      const now = Date.now();
      let deletedCount = 0;
      let freedSpace = 0;
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filepath = path.join(this.replayDirectory, file);
        const stats = await fs.stat(filepath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.unlink(filepath);
          deletedCount++;
          freedSpace += stats.size;
        }
      }
      
      if (deletedCount > 0) {
        logger.info(`🧹 Cleaned up ${deletedCount} old replays, freed ${(freedSpace / 1024 / 1024).toFixed(2)} MB`);
        await this.loadReplayMetadata(); // Refresh statistics
      }
      
      return { deletedCount, freedSpace };
      
    } catch (error) {
      logger.error('Failed to cleanup old replays:', error);
      return { deletedCount: 0, freedSpace: 0 };
    }
  }

  getStatistics() {
    return {
      ...this.statistics,
      activeRecordings: this.activeRecordings.size
    };
  }

  async shutdown() {
    // Stop all active recordings
    const activeIds = Array.from(this.activeRecordings.keys());
    
    for (const replayId of activeIds) {
      await this.stopRecording(replayId);
    }
    
    logger.info('📽️ Replay system shutdown complete');
  }
}

module.exports = ReplaySystem;