# Implementation Specifications for Development Team

## FRONTEND DEVELOPMENT SPECIFICATIONS

### 1. CLIENT-SIDE ARCHITECTURE

#### Core Game Engine Structure
```javascript
// Main game engine entry point
class BlueyGameEngine {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.networkManager = new NetworkManager();
    this.inputManager = new InputManager();
    this.renderer = new GameRenderer(this.ctx);
    this.audioManager = new AudioManager();
    this.gameState = new ClientGameState();
    
    this.lastTime = 0;
    this.running = false;
  }
  
  start() {
    this.running = true;
    this.gameLoop(0);
  }
  
  gameLoop(timestamp) {
    if (!this.running) return;
    
    const deltaTime = (timestamp - this.lastTime) / 1000;
    this.lastTime = timestamp;
    
    this.update(deltaTime);
    this.render();
    
    requestAnimationFrame(this.gameLoop.bind(this));
  }
  
  update(deltaTime) {
    this.inputManager.update();
    this.gameState.update(deltaTime);
    this.networkManager.sendInputs(this.inputManager.getState());
  }
  
  render() {
    this.renderer.clear();
    this.renderer.renderGame(this.gameState);
  }
}
```

#### Input Management System
```javascript
class InputManager {
  constructor() {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, buttons: 0 };
    this.gamepad = null;
    
    this.bindEvents();
  }
  
  bindEvents() {
    // Keyboard events
    document.addEventListener('keydown', (e) => this.keys.add(e.code));
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    
    // Mouse events
    canvas.addEventListener('mousemove', (e) => {
      this.mouse.x = e.offsetX;
      this.mouse.y = e.offsetY;
    });
    
    // Gamepad support
    window.addEventListener('gamepadconnected', (e) => {
      this.gamepad = e.gamepad;
    });
  }
  
  getState() {
    return {
      keys: Array.from(this.keys),
      mouse: { ...this.mouse },
      gamepad: this.gamepad ? {
        axes: [...this.gamepad.axes],
        buttons: this.gamepad.buttons.map(b => b.pressed)
      } : null,
      timestamp: performance.now()
    };
  }
}
```

#### WebSocket Client Manager
```javascript
class NetworkManager {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.latency = 0;
    this.serverTimeOffset = 0;
    
    this.messageQueue = [];
    this.stateBuffer = [];
  }
  
  connect(serverUrl) {
    this.socket = io(serverUrl);
    
    this.socket.on('connect', () => {
      this.connected = true;
      this.measureLatency();
    });
    
    this.socket.on('gameStateUpdate', (data) => {
      this.handleStateUpdate(data);
    });
    
    this.socket.on('playerJoined', (data) => {
      this.handlePlayerJoined(data);
    });
  }
  
  sendInputs(inputState) {
    if (!this.connected) return;
    
    this.socket.emit('playerInput', {
      ...inputState,
      clientTime: this.getServerTime()
    });
  }
  
  handleStateUpdate(serverState) {
    // Store state with timestamp for interpolation
    this.stateBuffer.push({
      ...serverState,
      receivedAt: performance.now()
    });
    
    // Keep only recent states
    const cutoff = performance.now() - 1000;
    this.stateBuffer = this.stateBuffer.filter(s => s.receivedAt > cutoff);
  }
  
  getInterpolatedState(renderTime) {
    // Interpolate between buffered states for smooth rendering
    if (this.stateBuffer.length < 2) return this.stateBuffer[0];
    
    // Find states to interpolate between
    let previous = this.stateBuffer[0];
    let next = this.stateBuffer[1];
    
    for (let i = 1; i < this.stateBuffer.length; i++) {
      if (this.stateBuffer[i].timestamp <= renderTime) {
        previous = this.stateBuffer[i];
        next = this.stateBuffer[i + 1] || previous;
      } else {
        break;
      }
    }
    
    // Interpolate player positions
    const factor = (renderTime - previous.timestamp) / (next.timestamp - previous.timestamp);
    return this.interpolateStates(previous, next, Math.min(factor, 1));
  }
}
```

### 2. RENDERING SYSTEM

#### Sprite Animation Manager
```javascript
class SpriteAnimationManager {
  constructor() {
    this.sprites = new Map();
    this.animations = new Map();
  }
  
  loadCharacterSprites(character) {
    const spriteSheet = new Image();
    spriteSheet.src = `assets/sprites/${character.name.toLowerCase()}_sheet.png`;
    
    spriteSheet.onload = () => {
      this.sprites.set(character.name, {
        image: spriteSheet,
        frameWidth: 64,
        frameHeight: 64,
        animations: {
          idle: { frames: [0, 1, 2, 3], duration: 0.8 },
          run: { frames: [4, 5, 6, 7, 8, 9], duration: 0.6 },
          jump: { frames: [10, 11], duration: 0.3 },
          attack_neutral: { frames: [12, 13, 14], duration: 0.4 },
          special: { frames: [15, 16, 17, 18], duration: 0.6 }
        }
      });
    };
  }
  
  renderCharacter(ctx, player, interpolatedState) {
    const sprite = this.sprites.get(player.character);
    if (!sprite) return;
    
    const anim = sprite.animations[player.animation.current];
    const frameIndex = Math.floor(player.animation.timer / anim.duration * anim.frames.length) % anim.frames.length;
    const frame = anim.frames[frameIndex];
    
    const srcX = (frame % 8) * sprite.frameWidth;
    const srcY = Math.floor(frame / 8) * sprite.frameHeight;
    
    ctx.save();
    if (player.facing === 'left') {
      ctx.scale(-1, 1);
    }
    
    ctx.drawImage(
      sprite.image,
      srcX, srcY, sprite.frameWidth, sprite.frameHeight,
      interpolatedState.position.x - sprite.frameWidth/2,
      interpolatedState.position.y - sprite.frameHeight,
      sprite.frameWidth, sprite.frameHeight
    );
    
    ctx.restore();
  }
}
```

### 3. UI COMPONENTS

#### Character Selection Screen
```javascript
class CharacterSelectUI {
  constructor(canvas, onCharacterSelected) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onCharacterSelected = onCharacterSelected;
    
    this.characters = [
      { name: 'Bluey', portrait: 'assets/portraits/bluey.png', unlocked: true },
      { name: 'Bingo', portrait: 'assets/portraits/bingo.png', unlocked: true },
      { name: 'Bandit', portrait: 'assets/portraits/bandit.png', unlocked: true },
      { name: 'Chilli', portrait: 'assets/portraits/chilli.png', unlocked: true }
    ];
    
    this.selectedIndex = 0;
    this.bindEvents();
  }
  
  render() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw background
    this.ctx.fillStyle = '#87CEEB'; // Sky blue
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw title
    this.ctx.fillStyle = '#FF6B35';
    this.ctx.font = 'bold 48px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Choose Your Character!', this.canvas.width/2, 80);
    
    // Draw character portraits
    const portraitSize = 120;
    const spacing = 150;
    const startX = (this.canvas.width - (this.characters.length * spacing)) / 2;
    
    this.characters.forEach((char, index) => {
      const x = startX + index * spacing;
      const y = 200;
      
      // Draw selection highlight
      if (index === this.selectedIndex) {
        this.ctx.fillStyle = '#FFD700';
        this.ctx.fillRect(x - 10, y - 10, portraitSize + 20, portraitSize + 20);
      }
      
      // Draw portrait placeholder
      this.ctx.fillStyle = char.unlocked ? '#FFFFFF' : '#CCCCCC';
      this.ctx.fillRect(x, y, portraitSize, portraitSize);
      
      // Draw character name
      this.ctx.fillStyle = '#000000';
      this.ctx.font = 'bold 20px Arial';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(char.name, x + portraitSize/2, y + portraitSize + 30);
    });
    
    // Draw instructions
    this.ctx.fillStyle = '#333333';
    this.ctx.font = '18px Arial';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Use ← → to select, ENTER to confirm', this.canvas.width/2, this.canvas.height - 50);
  }
}
```

## BACKEND DEVELOPMENT SPECIFICATIONS

### 1. SERVER ARCHITECTURE

#### Game Server Core
```javascript
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

class BlueyGameServer {
  constructor(port = 3000) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIo(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.matches = new Map();
    this.waitingPlayers = [];
    this.gameLoop = null;
    
    this.setupRoutes();
    this.setupSocketHandlers();
  }
  
  start() {
    this.server.listen(this.port, () => {
      console.log(`Bluey Game Server running on port ${this.port}`);
    });
    
    // Start game loop at 20Hz
    this.gameLoop = setInterval(() => {
      this.updateAllMatches();
    }, 50);
  }
  
  setupRoutes() {
    this.app.use(express.static('public'));
    this.app.get('/health', (req, res) => {
      res.json({ status: 'healthy', matches: this.matches.size });
    });
  }
  
  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log('Player connected:', socket.id);
      
      socket.on('joinMatchmaking', (data) => {
        this.handleJoinMatchmaking(socket, data);
      });
      
      socket.on('playerInput', (data) => {
        this.handlePlayerInput(socket, data);
      });
      
      socket.on('disconnect', () => {
        this.handlePlayerDisconnect(socket);
      });
    });
  }
}
```

#### Match Management System
```javascript
class GameMatch {
  constructor(matchId, players) {
    this.id = matchId;
    this.players = new Map();
    this.gameState = {
      status: 'waiting',
      timer: 180, // 3 minutes
      stage: 'heeler_house',
      projectiles: [],
      effects: []
    };
    
    // Initialize players
    players.forEach((player, index) => {
      this.players.set(player.id, {
        ...player,
        position: { x: 200 + index * 300, y: 400 },
        velocity: { x: 0, y: 0 },
        health: 100,
        damage: 0,
        stocks: 3,
        facing: index === 0 ? 'right' : 'left',
        animation: { current: 'idle', frame: 0, timer: 0 },
        lastInput: { timestamp: 0, keys: [] }
      });
    });
    
    this.physics = new ServerPhysicsEngine();
    this.lastUpdate = Date.now();
  }
  
  update() {
    const now = Date.now();
    const deltaTime = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;
    
    if (this.gameState.status !== 'active') return;
    
    // Update game timer
    this.gameState.timer -= deltaTime;
    if (this.gameState.timer <= 0) {
      this.endMatch('timeout');
      return;
    }
    
    // Update players
    this.players.forEach(player => {
      this.updatePlayer(player, deltaTime);
    });
    
    // Update projectiles
    this.updateProjectiles(deltaTime);
    
    // Check win conditions
    this.checkWinConditions();
  }
  
  updatePlayer(player, deltaTime) {
    // Apply gravity
    if (!player.grounded) {
      player.velocity.y += 980 * deltaTime; // gravity
    }
    
    // Apply input-based movement
    const input = player.lastInput;
    if (input.keys.includes('KeyA') || input.keys.includes('ArrowLeft')) {
      player.velocity.x = -200; // move left
      player.facing = 'left';
    } else if (input.keys.includes('KeyD') || input.keys.includes('ArrowRight')) {
      player.velocity.x = 200; // move right
      player.facing = 'right';
    } else {
      player.velocity.x *= 0.8; // friction
    }
    
    // Jump
    if ((input.keys.includes('KeyW') || input.keys.includes('Space')) && player.grounded) {
      player.velocity.y = -400; // jump velocity
      player.grounded = false;
    }
    
    // Update position
    player.position.x += player.velocity.x * deltaTime;
    player.position.y += player.velocity.y * deltaTime;
    
    // Ground collision (simplified)
    if (player.position.y >= 400) {
      player.position.y = 400;
      player.velocity.y = 0;
      player.grounded = true;
    }
    
    // Stage boundaries
    player.position.x = Math.max(50, Math.min(750, player.position.x));
    
    // Update animation
    this.updatePlayerAnimation(player, deltaTime);
  }
  
  updatePlayerAnimation(player, deltaTime) {
    player.animation.timer += deltaTime;
    
    // Determine animation state
    let newAnimation = 'idle';
    if (!player.grounded) {
      newAnimation = 'jump';
    } else if (Math.abs(player.velocity.x) > 50) {
      newAnimation = 'run';
    }
    
    if (newAnimation !== player.animation.current) {
      player.animation.current = newAnimation;
      player.animation.timer = 0;
    }
  }
  
  handlePlayerInput(playerId, inputData) {
    const player = this.players.get(playerId);
    if (!player) return;
    
    // Validate input timestamp (basic lag compensation)
    const serverTime = Date.now();
    const inputDelay = serverTime - inputData.timestamp;
    
    if (inputDelay < 1000) { // Accept inputs within 1 second
      player.lastInput = inputData;
    }
  }
  
  getGameStateForClient() {
    return {
      status: this.gameState.status,
      timer: this.gameState.timer,
      players: Array.from(this.players.values()).map(player => ({
        id: player.id,
        character: player.character,
        position: player.position,
        velocity: player.velocity,
        health: player.health,
        damage: player.damage,
        stocks: player.stocks,
        facing: player.facing,
        animation: player.animation
      })),
      projectiles: this.gameState.projectiles,
      timestamp: Date.now()
    };
  }
}
```

### 2. MATCHMAKING SYSTEM

```javascript
class MatchmakingManager {
  constructor(gameServer) {
    this.gameServer = gameServer;
    this.waitingPlayers = [];
    this.playerRatings = new Map(); // For future ranked matchmaking
  }
  
  addPlayer(socket, playerData) {
    const player = {
      id: socket.id,
      socket: socket,
      character: playerData.character,
      rating: this.playerRatings.get(socket.id) || 1000,
      joinTime: Date.now()
    };
    
    this.waitingPlayers.push(player);
    
    // Try to create match
    if (this.waitingPlayers.length >= 2) {
      this.createMatch();
    }
  }
  
  createMatch() {
    // Simple 2-player matchmaking for now
    if (this.waitingPlayers.length < 2) return;
    
    const players = this.waitingPlayers.splice(0, 2);
    const matchId = `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const match = new GameMatch(matchId, players);
    this.gameServer.matches.set(matchId, match);
    
    // Notify players
    players.forEach(player => {
      player.socket.join(matchId);
      player.socket.emit('matchFound', {
        matchId: matchId,
        players: players.map(p => ({
          id: p.id,
          character: p.character
        })),
        stage: 'heeler_house'
      });
    });
    
    console.log(`Created match ${matchId} with players:`, players.map(p => p.id));
  }
  
  removePlayer(socketId) {
    this.waitingPlayers = this.waitingPlayers.filter(p => p.id !== socketId);
  }
}
```

### 3. DATABASE SCHEMA (PostgreSQL)

```sql
-- Players table
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  socket_id VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(50) NOT NULL,
  rating INTEGER DEFAULT 1000,
  matches_played INTEGER DEFAULT 0,
  matches_won INTEGER DEFAULT 0,
  favorite_character VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Matches table
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id VARCHAR(255) UNIQUE NOT NULL,
  stage VARCHAR(50) NOT NULL,
  duration INTEGER, -- in seconds
  winner_id UUID REFERENCES players(id),
  status VARCHAR(20) DEFAULT 'active', -- active, completed, abandoned
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP
);

-- Match participants table
CREATE TABLE match_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES matches(id),
  player_id UUID REFERENCES players(id),
  character VARCHAR(50) NOT NULL,
  final_damage INTEGER,
  stocks_remaining INTEGER,
  placement INTEGER, -- 1st, 2nd, etc.
  rating_change INTEGER
);

-- Game statistics table
CREATE TABLE game_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id UUID REFERENCES players(id),
  character VARCHAR(50) NOT NULL,
  total_matches INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  average_damage FLOAT DEFAULT 0,
  favorite_stage VARCHAR(50),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4. REDIS SESSION STORAGE

```javascript
const redis = require('redis');

class SessionManager {
  constructor() {
    this.client = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    });
    
    this.client.on('error', (err) => {
      console.error('Redis error:', err);
    });
  }
  
  async storePlayerSession(socketId, playerData) {
    const sessionKey = `session:${socketId}`;
    await this.client.setex(sessionKey, 3600, JSON.stringify(playerData)); // 1 hour TTL
  }
  
  async getPlayerSession(socketId) {
    const sessionKey = `session:${socketId}`;
    const data = await this.client.get(sessionKey);
    return data ? JSON.parse(data) : null;
  }
  
  async removePlayerSession(socketId) {
    const sessionKey = `session:${socketId}`;
    await this.client.del(sessionKey);
  }
  
  async storeMatchState(matchId, gameState) {
    const matchKey = `match:${matchId}`;
    await this.client.setex(matchKey, 1800, JSON.stringify(gameState)); // 30 minutes TTL
  }
  
  async getActiveMatches() {
    const keys = await this.client.keys('match:*');
    return keys.length;
  }
}
```

## DEPLOYMENT CONFIGURATION

### 1. Docker Configuration

#### Frontend Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=0 /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### Backend Dockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]
```

### 2. Docker Compose for Development
```yaml
version: '3.8'

services:
  game-server:
    build: ./server
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=development
      - REDIS_HOST=redis
      - DB_HOST=postgres
    depends_on:
      - redis
      - postgres
    volumes:
      - ./server:/app
      - /app/node_modules

  frontend:
    build: ./client
    ports:
      - "8080:80"
    depends_on:
      - game-server

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=bluey_game
      - POSTGRES_USER=gameuser
      - POSTGRES_PASSWORD=gamepass
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
```

This comprehensive implementation specification provides the development team with detailed technical requirements for both frontend and backend development, ensuring consistent architecture and efficient coordination between team members.