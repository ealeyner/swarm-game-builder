import { io } from 'socket.io-client';

export class NetworkManager {
    constructor() {
        this.socket = null;
        this.connected = false;
        this.eventListeners = new Map();
        this.playerData = null;
        this.roomId = null;
        this.isHost = false;
        
        // Network settings
        this.serverUrl = process.env.NODE_ENV === 'production' 
            ? 'https://bluey-smash-server.herokuapp.com' 
            : 'http://localhost:3001';
        
        // Connection options
        this.connectionOptions = {
            transports: ['websocket', 'polling'],
            timeout: 5000,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        };
        
        // Message queue for offline mode
        this.messageQueue = [];
        this.maxQueueSize = 100;
        
        // Lag compensation
        this.latency = 0;
        this.serverTimeOffset = 0;
        this.lastPingTime = 0;
        
        // State synchronization
        this.lastSyncTime = 0;
        this.syncInterval = 50; // 20 Hz
        this.interpolationBuffer = [];
        this.maxBufferSize = 10;
    }
    
    connect() {
        if (this.connected) return Promise.resolve();
        
        return new Promise((resolve, reject) => {
            console.log('🌐 Connecting to game server...');
            
            this.socket = io(this.serverUrl, this.connectionOptions);
            
            this.socket.on('connect', () => {
                console.log('✅ Connected to game server');
                this.connected = true;
                this.startPingMeasurement();
                this.emit('connected');
                resolve();
            });
            
            this.socket.on('disconnect', (reason) => {
                console.log('❌ Disconnected from server:', reason);
                this.connected = false;
                this.emit('disconnected', reason);
            });
            
            this.socket.on('connect_error', (error) => {
                console.error('❌ Connection error:', error);
                reject(error);
            });
            
            this.socket.on('reconnect', (attemptNumber) => {
                console.log('🔄 Reconnected to server (attempt', attemptNumber, ')');
                this.connected = true;
                this.emit('reconnected', attemptNumber);
            });
            
            this.setupGameEventHandlers();
            
            // Timeout fallback
            setTimeout(() => {
                if (!this.connected) {
                    reject(new Error('Connection timeout'));
                }
            }, this.connectionOptions.timeout);
        });
    }
    
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.connected = false;
        console.log('🌐 Disconnected from server');
    }
    
    setupGameEventHandlers() {
        // Player management
        this.socket.on('playerJoined', (data) => {
            console.log('👤 Player joined:', data.playerId);
            this.emit('playerJoined', data);
        });
        
        this.socket.on('playerLeft', (data) => {
            console.log('👤 Player left:', data.playerId);
            this.emit('playerLeft', data);
        });
        
        // Room management
        this.socket.on('roomCreated', (data) => {
            console.log('🏠 Room created:', data.roomId);
            this.roomId = data.roomId;
            this.isHost = true;
            this.emit('roomCreated', data);
        });
        
        this.socket.on('roomJoined', (data) => {
            console.log('🏠 Joined room:', data.roomId);
            this.roomId = data.roomId;
            this.isHost = false;
            this.emit('roomJoined', data);
        });
        
        this.socket.on('roomFull', () => {
            console.log('🏠 Room is full');
            this.emit('roomFull');
        });
        
        // Game state synchronization
        this.socket.on('gameState', (data) => {
            this.handleGameStateUpdate(data);
        });
        
        this.socket.on('playerInput', (data) => {
            this.emit('playerInput', data);
        });
        
        this.socket.on('gameStarted', (data) => {
            console.log('🎮 Game started');
            this.emit('gameStarted', data);
        });
        
        this.socket.on('gameEnded', (data) => {
            console.log('🏁 Game ended');
            this.emit('gameEnded', data);
        });
        
        // Ping/latency measurement
        this.socket.on('pong', (timestamp) => {
            this.latency = Date.now() - timestamp;
            this.emit('latencyUpdate', this.latency);
        });
        
        // Chat messages
        this.socket.on('chatMessage', (data) => {
            this.emit('chatMessage', data);
        });
        
        // Error handling
        this.socket.on('error', (error) => {
            console.error('🌐 Network error:', error);
            this.emit('error', error);
        });
    }
    
    // Room management
    createRoom(gameMode = 'versus', maxPlayers = 2) {
        if (!this.connected) {
            console.warn('Not connected to server');
            return;
        }
        
        this.send('createRoom', {
            gameMode,
            maxPlayers,
            playerData: this.playerData
        });
    }
    
    joinRoom(roomId) {
        if (!this.connected) {
            console.warn('Not connected to server');
            return;
        }
        
        this.send('joinRoom', {
            roomId,
            playerData: this.playerData
        });
    }
    
    leaveRoom() {
        if (!this.connected || !this.roomId) return;
        
        this.send('leaveRoom', { roomId: this.roomId });
        this.roomId = null;
        this.isHost = false;
    }
    
    // Game management
    startGame() {
        if (!this.connected || !this.isHost) return;
        
        this.send('startGame', { roomId: this.roomId });
    }
    
    sendPlayerInput(inputData) {
        if (!this.connected) {
            // Queue input for when connection is restored
            this.queueMessage('playerInput', inputData);
            return;
        }
        
        const networkInput = {
            ...inputData,
            timestamp: this.getServerTime(),
            sequence: this.getNextSequence()
        };
        
        this.send('playerInput', networkInput);
    }
    
    sendGameState(gameState) {
        if (!this.connected || !this.isHost) return;
        
        const now = Date.now();
        if (now - this.lastSyncTime < this.syncInterval) return;
        
        this.lastSyncTime = now;
        
        const networkState = {
            ...gameState,
            timestamp: this.getServerTime(),
            sequence: this.getNextSequence()
        };
        
        this.send('gameState', networkState);
    }
    
    handleGameStateUpdate(data) {
        // Add to interpolation buffer
        this.interpolationBuffer.push(data);
        
        // Keep buffer size manageable
        if (this.interpolationBuffer.length > this.maxBufferSize) {
            this.interpolationBuffer.shift();
        }
        
        // Sort by timestamp
        this.interpolationBuffer.sort((a, b) => a.timestamp - b.timestamp);
        
        this.emit('gameState', data);
    }
    
    // Get interpolated game state for smooth movement
    getInterpolatedGameState() {
        if (this.interpolationBuffer.length < 2) {
            return this.interpolationBuffer[0] || null;
        }
        
        const now = this.getServerTime();
        const interpolationTime = now - 100; // 100ms behind
        
        // Find the two states to interpolate between
        let before = null;
        let after = null;
        
        for (let i = 0; i < this.interpolationBuffer.length - 1; i++) {
            if (this.interpolationBuffer[i].timestamp <= interpolationTime &&
                this.interpolationBuffer[i + 1].timestamp >= interpolationTime) {
                before = this.interpolationBuffer[i];
                after = this.interpolationBuffer[i + 1];
                break;
            }
        }
        
        if (!before || !after) {
            return this.interpolationBuffer[this.interpolationBuffer.length - 1];
        }
        
        // Interpolate between the two states
        const t = (interpolationTime - before.timestamp) / (after.timestamp - before.timestamp);
        return this.interpolateGameStates(before, after, t);
    }
    
    interpolateGameStates(state1, state2, t) {
        const interpolated = { ...state2 };
        
        if (state1.players && state2.players) {
            interpolated.players = state2.players.map((player2, index) => {
                const player1 = state1.players[index];
                if (!player1) return player2;
                
                return {
                    ...player2,
                    x: this.lerp(player1.x, player2.x, t),
                    y: this.lerp(player1.y, player2.y, t),
                    vx: this.lerp(player1.vx, player2.vx, t),
                    vy: this.lerp(player1.vy, player2.vy, t)
                };
            });
        }
        
        return interpolated;
    }
    
    lerp(a, b, t) {
        return a + (b - a) * t;
    }
    
    // Chat system
    sendChatMessage(message) {
        if (!this.connected) return;
        
        this.send('chatMessage', {
            message,
            playerId: this.playerData?.id,
            timestamp: Date.now()
        });
    }
    
    // Latency measurement
    startPingMeasurement() {
        this.pingInterval = setInterval(() => {
            if (this.connected) {
                this.lastPingTime = Date.now();
                this.send('ping', this.lastPingTime);
            }
        }, 1000);
    }
    
    stopPingMeasurement() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }
    
    // Time synchronization
    getServerTime() {
        return Date.now() + this.serverTimeOffset;
    }
    
    syncServerTime(serverTime) {
        const now = Date.now();
        this.serverTimeOffset = serverTime - now;
        console.log('🕒 Server time synchronized, offset:', this.serverTimeOffset);
    }
    
    // Message management
    send(event, data) {
        if (!this.connected) {
            this.queueMessage(event, data);
            return;
        }
        
        this.socket.emit(event, data);
    }
    
    queueMessage(event, data) {
        if (this.messageQueue.length >= this.maxQueueSize) {
            this.messageQueue.shift(); // Remove oldest message
        }
        
        this.messageQueue.push({ event, data, timestamp: Date.now() });
    }
    
    processMessageQueue() {
        if (!this.connected || this.messageQueue.length === 0) return;
        
        console.log(`📤 Processing ${this.messageQueue.length} queued messages`);
        
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            this.socket.emit(message.event, message.data);
        }
    }
    
    // Sequence numbering for packet ordering
    getNextSequence() {
        this.sequence = (this.sequence || 0) + 1;
        return this.sequence;
    }
    
    // Player data management\n    setPlayerData(playerData) {\n        this.playerData = playerData;\n        \n        if (this.connected) {\n            this.send('updatePlayerData', playerData);\n        }\n    }\n    \n    getPlayerData() {\n        return this.playerData;\n    }\n    \n    // Connection state\n    isConnected() {\n        return this.connected;\n    }\n    \n    getLatency() {\n        return this.latency;\n    }\n    \n    getRoomId() {\n        return this.roomId;\n    }\n    \n    isRoomHost() {\n        return this.isHost;\n    }\n    \n    // Event system\n    on(event, callback) {\n        if (!this.eventListeners.has(event)) {\n            this.eventListeners.set(event, []);\n        }\n        this.eventListeners.get(event).push(callback);\n    }\n    \n    off(event, callback) {\n        if (!this.eventListeners.has(event)) return;\n        \n        const listeners = this.eventListeners.get(event);\n        const index = listeners.indexOf(callback);\n        if (index > -1) {\n            listeners.splice(index, 1);\n        }\n    }\n    \n    emit(event, data) {\n        if (!this.eventListeners.has(event)) return;\n        \n        this.eventListeners.get(event).forEach(callback => {\n            callback(data);\n        });\n    }\n    \n    // Statistics and debugging\n    getNetworkStats() {\n        return {\n            connected: this.connected,\n            latency: this.latency,\n            queuedMessages: this.messageQueue.length,\n            interpolationBufferSize: this.interpolationBuffer.length,\n            roomId: this.roomId,\n            isHost: this.isHost,\n            serverTimeOffset: this.serverTimeOffset\n        };\n    }\n    \n    // Cleanup\n    destroy() {\n        this.stopPingMeasurement();\n        this.disconnect();\n        this.eventListeners.clear();\n        this.messageQueue = [];\n        this.interpolationBuffer = [];\n    }\n}