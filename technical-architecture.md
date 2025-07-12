# Bluey Super Smash Bros - Technical Architecture Specification

## 1. OVERALL GAME ARCHITECTURE

### Client-Server Model
```
┌─────────────────┐    WebSocket    ┌─────────────────┐
│   Game Client   │◄──────────────►│   Game Server   │
│  (Web Browser)  │    Real-time    │   (Node.js)     │
└─────────────────┘   Communication └─────────────────┘
        │                                    │
        │                                    │
    ┌───▼───┐                        ┌──────▼──────┐
    │ Local │                        │  Authoritative│
    │ State │                        │  Game State │
    │Manager│                        │   Manager   │
    └───────┘                        └─────────────┘
```

### Core Technology Stack
- **Frontend**: HTML5 Canvas, JavaScript ES6+, WebSockets
- **Backend**: Node.js with Express.js, Socket.IO for real-time communication
- **Physics**: Custom lightweight 2D physics engine
- **Graphics**: 2D sprite-based rendering with HTML5 Canvas
- **Audio**: Web Audio API for sound effects and music
- **State Management**: Custom event-driven state manager

## 2. REAL-TIME MULTIPLAYER NETWORKING ARCHITECTURE

### Network Protocol Design
```javascript
// Message Structure
{
  type: 'GAME_INPUT' | 'GAME_STATE' | 'PLAYER_ACTION',
  timestamp: number,
  playerId: string,
  data: {
    // Action-specific payload
  }
}
```

### Client-Server Synchronization
- **Tick Rate**: 60Hz client rendering, 20Hz server updates
- **Interpolation**: Client-side prediction with server reconciliation
- **Lag Compensation**: Input buffering and rollback for smooth gameplay
- **Authority Model**: Server-authoritative for game state, client prediction for responsiveness

### WebSocket Message Types
```typescript
interface GameMessages {
  // Input Messages
  PLAYER_INPUT: {
    keys: KeyState,
    mousePosition: Vector2,
    timestamp: number
  },
  
  // State Updates
  GAME_STATE_UPDATE: {
    players: PlayerState[],
    projectiles: ProjectileState[],
    stage: StageState,
    timestamp: number
  },
  
  // Match Events
  MATCH_START: MatchConfig,
  MATCH_END: MatchResult,
  PLAYER_JOIN: PlayerInfo,
  PLAYER_LEAVE: PlayerId
}
```

## 3. GAME STATE MANAGEMENT

### State Architecture
```javascript
class GameStateManager {
  constructor() {
    this.gameState = {
      match: {
        id: string,
        status: 'waiting' | 'active' | 'paused' | 'ended',
        timer: number,
        round: number
      },
      players: Map<PlayerId, PlayerState>,
      stage: StageState,
      projectiles: ProjectileState[],
      effects: EffectState[]
    };
  }
}
```

### Player State Structure
```typescript
interface PlayerState {
  id: string,
  character: CharacterType,
  position: Vector2,
  velocity: Vector2,
  health: number,
  damage: number, // Accumulated damage percentage
  stocks: number, // Lives remaining
  facing: 'left' | 'right',
  animation: {
    current: string,
    frame: number,
    timer: number
  },
  hitbox: Rectangle,
  hurtbox: Rectangle,
  invulnerable: boolean,
  stunned: number,
  airborne: boolean,
  grounded: boolean
}
```

## 4. CHARACTER SYSTEM ARCHITECTURE

### Bluey Character Roster
```javascript
const CHARACTERS = {
  BLUEY: {
    name: 'Bluey',
    stats: { speed: 8, jump: 7, weight: 6, reach: 6 },
    animations: ['idle', 'run', 'jump', 'attack_neutral', 'special_play'],
    moves: {
      neutral: 'Paw Swipe',
      side: 'Keepy Uppy Kick',
      up: 'Jump Attack',
      down: 'Ground Pound',
      special: 'Imaginative Play (spawns temporary platform)'
    }
  },
  BINGO: {
    name: 'Bingo',
    stats: { speed: 9, jump: 8, weight: 5, reach: 5 },
    moves: {
      special: 'Hide and Seek (brief invisibility)'
    }
  },
  BANDIT: {
    name: 'Bandit (Dad)',
    stats: { speed: 6, jump: 6, weight: 8, reach: 7 },
    moves: {
      special: 'Dad Mode (increased strength temporarily)'
    }
  },
  CHILLI: {
    name: 'Chilli (Mum)',
    stats: { speed: 7, jump: 7, weight: 7, reach: 6 },
    moves: {
      special: 'Family Hug (healing move)'
    }
  }
};
```

### Animation System
```javascript
class AnimationManager {
  constructor() {
    this.sprites = new Map(); // Loaded sprite sheets
    this.animations = new Map(); // Animation definitions
  }
  
  loadCharacterSprites(character) {
    // Load sprite sheets for each character
    // Define frame sequences for each animation
  }
  
  updateAnimation(player, deltaTime) {
    // Update current animation frame
    // Handle animation transitions
    // Apply animation-based hitboxes
  }
}
```

## 5. PHYSICS AND COLLISION SYSTEM

### Physics Engine Design
```javascript
class PhysicsEngine {
  constructor() {
    this.gravity = 980; // pixels/second²
    this.friction = 0.8;
    this.airResistance = 0.98;
  }
  
  update(entities, deltaTime) {
    // Apply gravity
    // Update velocities
    // Check collisions
    // Resolve physics interactions
  }
}
```

### Collision Detection
- **Broadphase**: Spatial partitioning using quadtree
- **Narrowphase**: AABB and circle collision detection
- **Hitbox System**: Separate hitboxes for attacks and hurtboxes for damage
- **Stage Collision**: Platform collision with edge detection

### Stage Design System
```javascript
class Stage {
  constructor(stageData) {
    this.platforms = stageData.platforms; // Solid platforms
    this.boundaries = stageData.boundaries; // Stage limits
    this.hazards = stageData.hazards; // Environmental dangers
    this.background = stageData.background; // Visual layers
  }
}

// Example: Heeler House Stage
const HEELER_HOUSE_STAGE = {
  platforms: [
    { x: 0, y: 400, width: 800, height: 20 }, // Main floor
    { x: 200, y: 300, width: 150, height: 15 }, // Couch
    { x: 450, y: 250, width: 120, height: 15 }  // Table
  ],
  boundaries: { left: -50, right: 850, bottom: 600 },
  background: 'heeler_house_interior.png'
};
```

## 6. UI/UX ARCHITECTURE

### Screen Flow
```
Main Menu → Character Select → Stage Select → Match → Results → Back to Menu
```

### Responsive Design
- **Viewport**: 1280x720 base resolution with scaling
- **Controls**: Keyboard + optional gamepad support
- **Mobile**: Touch controls for mobile browsers

### Matchmaking System
```javascript
class MatchmakingManager {
  constructor() {
    this.waitingPlayers = [];
    this.activeMatches = new Map();
  }
  
  joinQueue(player) {
    // Add player to matchmaking queue
    // Attempt to create match when enough players
  }
  
  createMatch(players) {
    // Initialize new game instance
    // Set up WebSocket room
    // Start match countdown
  }
}
```

## 7. PERFORMANCE OPTIMIZATION

### Rendering Optimization
- **Sprite Batching**: Group similar sprites for efficient rendering
- **Culling**: Only render visible objects
- **Object Pooling**: Reuse game objects to reduce garbage collection
- **Delta Time**: Frame-rate independent movement

### Network Optimization
- **Message Compression**: Compress frequent state updates
- **Delta Compression**: Only send changed state
- **Priority System**: Prioritize important updates (player positions over effects)

### Memory Management
```javascript
class ObjectPool {
  constructor(createFn, resetFn, initialSize = 50) {
    this.pool = [];
    this.createFn = createFn;
    this.resetFn = resetFn;
    
    // Pre-populate pool
    for (let i = 0; i < initialSize; i++) {
      this.pool.push(this.createFn());
    }
  }
  
  acquire() {
    return this.pool.pop() || this.createFn();
  }
  
  release(obj) {
    this.resetFn(obj);
    this.pool.push(obj);
  }
}
```

## 8. AUDIO ARCHITECTURE

### Audio System
```javascript
class AudioManager {
  constructor() {
    this.context = new AudioContext();
    this.sfx = new Map(); // Sound effects
    this.music = new Map(); // Background music
    this.volume = { master: 1.0, sfx: 0.8, music: 0.6 };
  }
  
  loadAudio(key, url) {
    // Load and decode audio files
  }
  
  playSound(key, options = {}) {
    // Play sound with volume/pitch/pan control
  }
}
```

### Bluey-Themed Audio
- **Sound Effects**: Playful cartoon sounds, barks, squeaky toys
- **Music**: Upbeat, family-friendly background tracks
- **Voice Lines**: Character-specific catchphrases and reactions

## 9. DEVELOPMENT WORKFLOW

### File Structure
```
/bluey-smash/
├── client/
│   ├── src/
│   │   ├── game/          # Core game logic
│   │   ├── graphics/      # Rendering system
│   │   ├── physics/       # Physics engine
│   │   ├── networking/    # Client networking
│   │   ├── ui/           # User interface
│   │   └── assets/       # Game assets
│   ├── sprites/          # Character sprites
│   ├── audio/           # Sound effects and music
│   └── index.html       # Main game page
├── server/
│   ├── src/
│   │   ├── game/         # Server game logic
│   │   ├── networking/   # WebSocket handling
│   │   ├── matchmaking/  # Player matching
│   │   └── persistence/  # Data storage
│   └── package.json
└── shared/              # Shared code between client/server
    ├── constants.js
    ├── utils.js
    └── types.js
```

### Build System
- **Client**: Webpack for bundling, Babel for ES6+ support
- **Server**: Node.js with ES6 modules
- **Assets**: Automated sprite sheet generation and optimization
- **Testing**: Jest for unit tests, Cypress for integration tests

## 10. DEPLOYMENT STRATEGY

### Production Architecture
```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   CDN       │    │ Load        │    │ Game        │
│ (Static     │◄───┤ Balancer    │◄───┤ Servers     │
│  Assets)    │    │             │    │ (Multiple   │
└─────────────┘    └─────────────┘    │ Instances)  │
                                      └─────────────┘
```

### Scalability Considerations
- **Horizontal Scaling**: Multiple game server instances
- **Room-Based Architecture**: Separate server processes per match
- **Database**: Redis for session storage, PostgreSQL for persistent data
- **Monitoring**: Real-time performance and player metrics

This architecture provides a solid foundation for building a responsive, multiplayer Bluey-themed fighting game that can handle real-time gameplay while maintaining the charm and family-friendly nature of the source material.