const { logger } = require('../utils/logger');

class GameState {
  constructor() {
    this.initialized = false;
    this.players = new Map();
    this.entities = new Map(); // Items, projectiles, etc.
    this.map = null;
    this.settings = {};
    this.frame = 0;
    this.lastUpdate = Date.now();
    
    // Bluey-specific game elements
    this.gameElements = {
      toys: new Map(), // Bluey toys as items/power-ups
      playAreas: [], // Different play areas on the map
      obstacles: [], // Interactive obstacles
      collectibles: new Map() // Keepy-uppy balls, etc.
    };
    
    // Physics constants
    this.physics = {
      gravity: 0.8,
      friction: 0.85,
      airResistance: 0.98,
      maxFallSpeed: 15,
      groundLevel: 400,
      stageWidth: 1200,
      stageHeight: 600
    };
    
    // Game mechanics
    this.mechanics = {
      shieldDuration: 180, // frames
      dodgeDuration: 20,
      attackCooldown: 15,
      comboWindow: 30,
      invulnerabilityFrames: 60,
      respawnTime: 180
    };
  }

  initialize(config) {
    this.players.clear();
    this.entities.clear();
    this.gameElements.toys.clear();
    this.gameElements.collectibles.clear();
    
    this.settings = config.settings;
    this.map = this.loadMap(config.mapId);
    this.frame = 0;
    this.lastUpdate = Date.now();
    
    // Initialize players
    for (const player of config.players) {
      this.initializePlayer(player, config.characters);
    }
    
    // Initialize map-specific elements
    this.initializeMapElements(config.mapId);
    
    this.initialized = true;
    logger.info(`🎮 Game state initialized for ${this.players.size} players on ${config.mapId}`);
  }

  initializePlayer(player, characters) {
    const spawnPoint = this.getSpawnPoint(this.players.size);
    const character = characters[player.character] || characters['bluey'];
    
    const playerState = {
      id: player.id,
      socketId: player.socketId,
      username: player.username,
      character: player.character,
      
      // Position and movement
      position: { x: spawnPoint.x, y: spawnPoint.y },
      velocity: { x: 0, y: 0 },
      acceleration: { x: 0, y: 0 },
      facing: 'right',
      
      // State flags
      isGrounded: false,
      isShielding: false,
      isDodging: false,
      isAttacking: false,
      isJumping: false,
      isRespawning: false,
      
      // Game stats
      health: 100,
      lives: this.settings.stockLives || 3,
      score: 0,
      knockouts: 0,
      deaths: 0,
      damage: 0,
      combo: 0,
      
      // Frame counters
      shieldFrames: 0,
      dodgeFrames: 0,
      attackFrames: 0,
      invulnerabilityFrames: 0,
      respawnFrames: 0,
      
      // Character-specific
      characterStats: character.stats,
      abilities: character.abilities,
      
      // Input state
      inputState: {
        left: false,
        right: false,
        up: false,
        down: false,
        attack: false,
        special: false,
        shield: false,
        dodge: false
      },
      
      // Last confirmed input frame
      lastInputFrame: 0,
      
      // Animation
      animation: 'idle',
      animationFrame: 0,
      
      // Status effects
      statusEffects: new Map(),
      
      // Bluey-specific
      blueyMeter: 100, // Special ability meter
      playMode: 'normal' // Can be 'keepy-uppy', 'shadowlands', etc.
    };
    
    this.players.set(player.socketId, playerState);
  }

  getSpawnPoint(playerIndex) {
    // Spawn points for different maps
    const spawnPoints = {
      backyard: [
        { x: 200, y: 300 },
        { x: 1000, y: 300 },
        { x: 400, y: 300 },
        { x: 800, y: 300 },
        { x: 100, y: 300 },
        { x: 1100, y: 300 },
        { x: 300, y: 200 },
        { x: 900, y: 200 }
      ],
      playground: [
        { x: 150, y: 350 },
        { x: 1050, y: 350 },
        { x: 350, y: 250 },
        { x: 850, y: 250 },
        { x: 250, y: 450 },
        { x: 950, y: 450 },
        { x: 500, y: 150 },
        { x: 700, y: 150 }
      ],
      creek: [
        { x: 100, y: 400 },
        { x: 1100, y: 400 },
        { x: 300, y: 300 },
        { x: 900, y: 300 },
        { x: 500, y: 200 },
        { x: 700, y: 200 },
        { x: 200, y: 500 },
        { x: 1000, y: 500 }
      ]
    };
    
    const points = spawnPoints[this.map?.id] || spawnPoints.backyard;
    return points[playerIndex % points.length];
  }

  loadMap(mapId) {
    const maps = {
      backyard: {
        id: 'backyard',
        name: 'Heeler Family Backyard',
        platforms: [
          // Main ground
          { x: 0, y: 450, width: 1200, height: 150, type: 'solid' },
          // Deck
          { x: 100, y: 350, width: 200, height: 20, type: 'platform' },
          // Trampoline
          { x: 500, y: 400, width: 200, height: 50, type: 'bouncy' },
          // Tree platform
          { x: 900, y: 250, width: 150, height: 20, type: 'platform' }
        ],
        hazards: [],
        blueyElements: [
          { type: 'swing', x: 300, y: 200 },
          { type: 'sandpit', x: 700, y: 420 },
          { type: 'fort', x: 950, y: 200 }
        ]
      },
      playground: {
        id: 'playground',
        name: 'Local Playground',
        platforms: [
          { x: 0, y: 500, width: 1200, height: 100, type: 'solid' },
          { x: 200, y: 400, width: 150, height: 20, type: 'platform' },
          { x: 450, y: 300, width: 300, height: 20, type: 'platform' },
          { x: 850, y: 400, width: 150, height: 20, type: 'platform' }
        ],
        hazards: [
          { type: 'slide', x: 100, y: 300, width: 100, height: 200 }
        ],
        blueyElements: [
          { type: 'monkey_bars', x: 450, y: 250 },
          { type: 'slide', x: 100, y: 300 },
          { type: 'roundabout', x: 600, y: 480 }
        ]
      },
      creek: {
        id: 'creek',
        name: 'The Creek',
        platforms: [
          { x: 0, y: 550, width: 400, height: 50, type: 'solid' },
          { x: 500, y: 580, width: 200, height: 20, type: 'platform' },
          { x: 800, y: 550, width: 400, height: 50, type: 'solid' },
          { x: 200, y: 450, width: 100, height: 20, type: 'platform' },
          { x: 900, y: 450, width: 100, height: 20, type: 'platform' }
        ],
        hazards: [
          { type: 'water', x: 400, y: 550, width: 400, height: 50 }
        ],
        blueyElements: [
          { type: 'log_bridge', x: 450, y: 530 },
          { type: 'rope_swing', x: 600, y: 400 },
          { type: 'rock_pile', x: 300, y: 500 }
        ]
      }
    };
    
    return maps[mapId] || maps.backyard;
  }

  initializeMapElements(mapId) {
    // Initialize Bluey-specific interactive elements
    switch (mapId) {
      case 'backyard':
        this.addToy('keepy_uppy_ball', { x: 600, y: 300 });
        this.addToy('magic_asparagus', { x: 800, y: 200 });
        break;
      case 'playground':
        this.addToy('featherwand', { x: 600, y: 250 });
        this.addCollectible('rainbow', { x: 300, y: 350 });
        break;
      case 'creek':
        this.addToy('takeaway_phone', { x: 500, y: 400 });
        this.addCollectible('creek_treasure', { x: 600, y: 530 });
        break;
    }
  }

  addToy(toyType, position) {
    const toyId = `${toyType}_${Date.now()}`;
    const toy = {
      id: toyId,
      type: toyType,
      position: { ...position },
      velocity: { x: 0, y: 0 },
      active: true,
      respawnTime: 300, // frames until respawn
      effect: this.getToyEffect(toyType)
    };
    
    this.gameElements.toys.set(toyId, toy);
  }

  addCollectible(type, position) {
    const collectibleId = `${type}_${Date.now()}`;
    const collectible = {
      id: collectibleId,
      type,
      position: { ...position },
      value: this.getCollectibleValue(type),
      collected: false
    };
    
    this.gameElements.collectibles.set(collectibleId, collectible);
  }

  getToyEffect(toyType) {
    const effects = {
      keepy_uppy_ball: { type: 'bounce_boost', power: 2.0, duration: 300 },
      magic_asparagus: { type: 'health_restore', amount: 50 },
      featherwand: { type: 'flight', duration: 180 },
      takeaway_phone: { type: 'teleport', range: 300 }
    };
    
    return effects[toyType] || { type: 'none' };
  }

  getCollectibleValue(type) {
    const values = {
      rainbow: 100,
      creek_treasure: 150,
      dance_sticker: 50
    };
    
    return values[type] || 10;
  }

  // Main game tick
  tick(frame) {
    this.frame = frame;
    const deltaTime = Date.now() - this.lastUpdate;
    this.lastUpdate = Date.now();
    
    // Update all players
    for (const player of this.players.values()) {
      this.updatePlayer(player, deltaTime);
    }
    
    // Update toys and collectibles
    this.updateToys(deltaTime);
    this.updateCollectibles(deltaTime);
    
    // Check collisions
    this.checkCollisions();
    
    // Update entities (projectiles, effects)
    this.updateEntities(deltaTime);
    
    // Clean up expired elements
    this.cleanup();
  }

  updatePlayer(player, deltaTime) {
    if (player.isRespawning) {
      player.respawnFrames--;
      if (player.respawnFrames <= 0) {
        this.respawnPlayer(player);
      }
      return;
    }
    
    // Update frame counters
    if (player.shieldFrames > 0) player.shieldFrames--;
    if (player.dodgeFrames > 0) player.dodgeFrames--;
    if (player.attackFrames > 0) player.attackFrames--;
    if (player.invulnerabilityFrames > 0) player.invulnerabilityFrames--;
    
    // Update state flags
    player.isShielding = player.shieldFrames > 0;
    player.isDodging = player.dodgeFrames > 0;
    player.isAttacking = player.attackFrames > 0;
    
    // Apply input
    this.applyPlayerInput(player);
    
    // Apply physics
    this.applyPhysics(player);
    
    // Update animation
    this.updatePlayerAnimation(player);
    
    // Regenerate Bluey meter
    if (player.blueyMeter < 100) {
      player.blueyMeter = Math.min(100, player.blueyMeter + 0.2);
    }
  }

  applyPlayerInput(player) {
    const input = player.inputState;
    const stats = player.characterStats;
    
    // Horizontal movement
    if (input.left && !input.right) {
      player.acceleration.x = -stats.speed * 0.5;
      player.facing = 'left';
    } else if (input.right && !input.left) {
      player.acceleration.x = stats.speed * 0.5;
      player.facing = 'right';
    } else {
      player.acceleration.x = 0;
    }
    
    // Jumping
    if (input.up && player.isGrounded && !player.isJumping) {
      player.velocity.y = -stats.agility * 1.2;
      player.isJumping = true;
      player.isGrounded = false;
    }
    
    // Shielding
    if (input.shield && player.shieldFrames === 0 && !player.isDodging) {
      player.shieldFrames = this.mechanics.shieldDuration;
    }
    
    // Dodging
    if (input.dodge && player.dodgeFrames === 0 && !player.isShielding) {
      player.dodgeFrames = this.mechanics.dodgeDuration;
      player.invulnerabilityFrames = this.mechanics.dodgeDuration;
      
      // Dodge movement
      const dodgeForce = player.facing === 'right' ? 8 : -8;
      player.velocity.x += dodgeForce;
    }
    
    // Attacking
    if (input.attack && player.attackFrames === 0) {
      this.executeAttack(player, 'basic');
    }
    
    if (input.special && player.attackFrames === 0 && player.blueyMeter >= 25) {
      this.executeSpecialAttack(player);
    }
  }

  executeAttack(player, attackType) {
    player.attackFrames = this.mechanics.attackCooldown;
    
    const attackData = {
      playerId: player.socketId,
      type: attackType,
      position: { ...player.position },
      facing: player.facing,
      frame: this.frame,
      damage: this.getAttackDamage(player, attackType),
      knockback: this.getAttackKnockback(player, attackType),
      hitbox: this.getAttackHitbox(player, attackType)
    };
    
    // Check for hits against other players
    this.checkAttackHits(attackData);
  }

  executeSpecialAttack(player) {
    const ability = player.abilities[0]; // Use first ability for now
    player.blueyMeter -= 25;
    
    switch (ability) {
      case 'keepy-uppy':
        this.activateKeepyUppy(player);
        break;
      case 'shadowlands':
        this.activateShadowlands(player);
        break;
      case 'dance-mode':
        this.activateDanceMode(player);
        break;
      case 'magic-asparagus':
        this.activateMagicAsparagus(player);
        break;
      default:
        this.executeAttack(player, 'special');
    }
  }

  activateKeepyUppy(player) {
    // Bluey's keepy-uppy: Creates bouncing projectiles
    for (let i = 0; i < 3; i++) {
      const angle = (i - 1) * 0.5 + (player.facing === 'right' ? 0 : Math.PI);
      this.createProjectile({
        type: 'keepy_uppy_ball',
        position: { ...player.position },
        velocity: {
          x: Math.cos(angle) * 8,
          y: Math.sin(angle) * 8 - 2
        },
        damage: 15,
        bounces: 3,
        owner: player.socketId
      });
    }
  }

  activateShadowlands(player) {
    // Shadowlands: Temporary invisibility and speed boost
    player.statusEffects.set('shadowlands', {
      duration: 180,
      effects: { invisible: true, speedBoost: 1.5 }
    });
  }

  activateDanceMode(player) {
    // Dance mode: Area effect that stuns nearby players
    const range = 150;
    for (const otherPlayer of this.players.values()) {
      if (otherPlayer.socketId === player.socketId) continue;
      
      const distance = Math.sqrt(
        Math.pow(otherPlayer.position.x - player.position.x, 2) +
        Math.pow(otherPlayer.position.y - player.position.y, 2)
      );
      
      if (distance <= range) {
        otherPlayer.statusEffects.set('stunned', { duration: 120 });
      }
    }
  }

  activateMagicAsparagus(player) {
    // Magic asparagus: Healing and temporary damage boost
    player.health = Math.min(100, player.health + 30);
    player.statusEffects.set('magic_boost', {
      duration: 300,
      effects: { damageBoost: 1.5 }
    });
  }

  getAttackDamage(player, attackType) {
    const baseDamage = {
      basic: 12,
      special: 20,
      aerial: 15
    };
    
    let damage = baseDamage[attackType] || 12;
    damage *= player.characterStats.strength / 7; // Normalize around average
    
    // Apply status effects
    if (player.statusEffects.has('magic_boost')) {
      damage *= player.statusEffects.get('magic_boost').effects.damageBoost;
    }
    
    return Math.round(damage);
  }

  getAttackKnockback(player, attackType) {
    const baseKnockback = {
      basic: { x: 3, y: 1 },
      special: { x: 5, y: 2 },
      aerial: { x: 2, y: 4 }
    };
    
    return baseKnockback[attackType] || baseKnockback.basic;
  }

  getAttackHitbox(player, attackType) {
    const direction = player.facing === 'right' ? 1 : -1;
    
    return {
      x: player.position.x + (direction * 40),
      y: player.position.y - 20,
      width: 60,
      height: 80
    };
  }

  checkAttackHits(attackData) {
    for (const player of this.players.values()) {
      if (player.socketId === attackData.playerId) continue;
      if (player.invulnerabilityFrames > 0) continue;
      if (player.isRespawning) continue;
      
      if (this.checkHitboxCollision(player.position, attackData.hitbox)) {
        this.applyDamage(player, attackData);
      }
    }
  }

  applyDamage(player, attackData) {
    const attacker = this.players.get(attackData.playerId);
    
    // Apply damage
    player.damage += attackData.damage;
    
    // Apply knockback
    const knockbackMultiplier = player.damage / 100 + 1;
    player.velocity.x += attackData.knockback.x * knockbackMultiplier * 
      (attackData.facing === 'right' ? 1 : -1);
    player.velocity.y -= attackData.knockback.y * knockbackMultiplier;
    
    // Set invulnerability
    player.invulnerabilityFrames = this.mechanics.invulnerabilityFrames;
    
    // Check for knockout
    if (player.damage >= 100 || player.position.y > this.physics.stageHeight) {
      this.knockoutPlayer(player, attacker);
    }
  }

  knockoutPlayer(player, attacker) {
    player.lives--;
    player.deaths++;
    player.damage = 0;
    
    if (attacker) {
      attacker.knockouts++;
      attacker.score += 100;
      attacker.combo++;
    }
    
    if (player.lives <= 0) {
      player.eliminated = true;
    } else {
      player.isRespawning = true;
      player.respawnFrames = this.mechanics.respawnTime;
    }
  }

  respawnPlayer(player) {
    const spawnPoint = this.getSpawnPoint(Math.floor(Math.random() * 4));
    player.position = { ...spawnPoint };
    player.velocity = { x: 0, y: 0 };
    player.isRespawning = false;
    player.invulnerabilityFrames = 120; // 2 seconds of invulnerability
    player.animation = 'spawn';
  }

  applyPhysics(player) {
    // Apply acceleration to velocity
    player.velocity.x += player.acceleration.x;
    player.velocity.y += this.physics.gravity;
    
    // Apply friction when grounded
    if (player.isGrounded) {
      player.velocity.x *= this.physics.friction;
    } else {
      player.velocity.x *= this.physics.airResistance;
    }
    
    // Terminal velocity
    player.velocity.y = Math.min(player.velocity.y, this.physics.maxFallSpeed);
    
    // Apply velocity to position
    player.position.x += player.velocity.x;
    player.position.y += player.velocity.y;
    
    // Stage boundaries
    if (player.position.x < 0) {
      player.position.x = 0;
      player.velocity.x = 0;
    }
    if (player.position.x > this.physics.stageWidth) {
      player.position.x = this.physics.stageWidth;
      player.velocity.x = 0;
    }
    
    // Platform collision
    this.checkPlatformCollisions(player);
  }

  checkPlatformCollisions(player) {
    let wasGrounded = player.isGrounded;
    player.isGrounded = false;
    
    for (const platform of this.map.platforms) {
      if (this.checkPlatformCollision(player, platform)) {
        // Landing on platform
        if (player.velocity.y > 0 && !wasGrounded) {
          player.position.y = platform.y;
          player.velocity.y = 0;
          player.isGrounded = true;
          player.isJumping = false;
          
          if (platform.type === 'bouncy') {
            player.velocity.y = -15; // Trampoline effect
          }
        }
      }
    }
  }

  checkPlatformCollision(player, platform) {
    return (
      player.position.x + 20 > platform.x &&
      player.position.x - 20 < platform.x + platform.width &&
      player.position.y + 40 > platform.y &&
      player.position.y + 40 < platform.y + platform.height
    );
  }

  checkHitboxCollision(position, hitbox) {
    return (
      position.x + 20 > hitbox.x &&
      position.x - 20 < hitbox.x + hitbox.width &&
      position.y + 40 > hitbox.y &&
      position.y - 40 < hitbox.y + hitbox.height
    );
  }

  updatePlayerAnimation(player) {
    // Determine animation based on state
    if (player.isRespawning) {
      player.animation = 'respawn';
    } else if (player.isAttacking) {
      player.animation = 'attack';
    } else if (player.isDodging) {
      player.animation = 'dodge';
    } else if (player.isShielding) {
      player.animation = 'shield';
    } else if (!player.isGrounded) {
      player.animation = player.velocity.y < 0 ? 'jump' : 'fall';
    } else if (Math.abs(player.velocity.x) > 1) {
      player.animation = 'run';
    } else {
      player.animation = 'idle';
    }
    
    player.animationFrame++;
  }

  updateToys(deltaTime) {
    for (const toy of this.gameElements.toys.values()) {
      if (!toy.active && toy.respawnTime > 0) {
        toy.respawnTime--;
        if (toy.respawnTime <= 0) {
          toy.active = true;
        }
      }
    }
  }

  updateCollectibles(deltaTime) {
    // Check if players are collecting items
    for (const player of this.players.values()) {
      for (const collectible of this.gameElements.collectibles.values()) {
        if (!collectible.collected) {
          const distance = Math.sqrt(
            Math.pow(player.position.x - collectible.position.x, 2) +
            Math.pow(player.position.y - collectible.position.y, 2)
          );
          
          if (distance < 50) {
            player.score += collectible.value;
            collectible.collected = true;
          }
        }
      }
    }
  }

  checkCollisions() {
    // Player vs toy collisions
    for (const player of this.players.values()) {
      for (const toy of this.gameElements.toys.values()) {
        if (toy.active) {
          const distance = Math.sqrt(
            Math.pow(player.position.x - toy.position.x, 2) +
            Math.pow(player.position.y - toy.position.y, 2)
          );
          
          if (distance < 40) {
            this.applyToyEffect(player, toy);
            toy.active = false;
            toy.respawnTime = 300;
          }
        }
      }
    }
  }

  applyToyEffect(player, toy) {
    const effect = toy.effect;
    
    switch (effect.type) {
      case 'bounce_boost':
        player.velocity.y -= 10;
        break;
      case 'health_restore':
        player.health = Math.min(100, player.health + effect.amount);
        break;
      case 'flight':
        player.statusEffects.set('flight', { duration: effect.duration });
        break;
      case 'teleport':
        // Random teleport within range
        const angle = Math.random() * Math.PI * 2;
        player.position.x += Math.cos(angle) * effect.range;
        player.position.y += Math.sin(angle) * effect.range;
        break;
    }
  }

  createProjectile(config) {
    const projectileId = `proj_${Date.now()}_${Math.random()}`;
    const projectile = {
      id: projectileId,
      type: config.type,
      position: { ...config.position },
      velocity: { ...config.velocity },
      damage: config.damage,
      owner: config.owner,
      bounces: config.bounces || 0,
      lifetime: config.lifetime || 300,
      frame: this.frame
    };
    
    this.entities.set(projectileId, projectile);
  }

  updateEntities(deltaTime) {
    for (const [id, entity] of this.entities) {
      entity.lifetime--;
      
      if (entity.lifetime <= 0) {
        this.entities.delete(id);
        continue;
      }
      
      // Update position
      entity.position.x += entity.velocity.x;
      entity.position.y += entity.velocity.y;
      
      // Apply gravity to projectiles
      if (entity.type.includes('ball')) {
        entity.velocity.y += this.physics.gravity * 0.5;
      }
      
      // Check collisions with players
      for (const player of this.players.values()) {
        if (player.socketId === entity.owner) continue;
        if (player.invulnerabilityFrames > 0) continue;
        
        const distance = Math.sqrt(
          Math.pow(player.position.x - entity.position.x, 2) +
          Math.pow(player.position.y - entity.position.y, 2)
        );
        
        if (distance < 30) {
          this.applyDamage(player, {
            playerId: entity.owner,
            damage: entity.damage,
            knockback: { x: 2, y: 1 },
            facing: entity.velocity.x > 0 ? 'right' : 'left'
          });
          
          this.entities.delete(id);
          break;
        }
      }
      
      // Bounce off platforms
      for (const platform of this.map.platforms) {
        if (this.checkProjectilePlatformCollision(entity, platform)) {
          if (entity.bounces > 0) {
            entity.velocity.y = -Math.abs(entity.velocity.y) * 0.8;
            entity.bounces--;
          } else {
            this.entities.delete(id);
            break;
          }
        }
      }
    }
  }

  checkProjectilePlatformCollision(projectile, platform) {
    return (
      projectile.position.x > platform.x &&
      projectile.position.x < platform.x + platform.width &&
      projectile.position.y + 10 > platform.y &&
      projectile.position.y - 10 < platform.y + platform.height
    );
  }

  cleanup() {
    // Remove expired status effects
    for (const player of this.players.values()) {
      for (const [effect, data] of player.statusEffects) {
        data.duration--;
        if (data.duration <= 0) {
          player.statusEffects.delete(effect);
        }
      }
    }
    
    // Remove collected collectibles
    for (const [id, collectible] of this.gameElements.collectibles) {
      if (collectible.collected) {
        this.gameElements.collectibles.delete(id);
      }
    }
  }

  // Input handling
  applyInput(socketId, input) {
    const player = this.players.get(socketId);
    if (!player) return false;
    
    player.inputState = { ...player.inputState, ...input.state };
    player.lastInputFrame = input.frame;
    return true;
  }

  // State accessors
  getInitialState() {
    return {
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        socketId: p.socketId,
        username: p.username,
        character: p.character,
        position: p.position,
        stats: { health: p.health, lives: p.lives, score: p.score }
      })),
      map: this.map,
      settings: this.settings,
      toys: Array.from(this.gameElements.toys.values()),
      collectibles: Array.from(this.gameElements.collectibles.values())
    };
  }

  getPublicState() {
    return {
      frame: this.frame,
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        socketId: p.socketId,
        username: p.username,
        position: p.position,
        facing: p.facing,
        animation: p.animation,
        health: p.health,
        lives: p.lives,
        score: p.score,
        isShielding: p.isShielding,
        isDodging: p.isDodging,
        statusEffects: Array.from(p.statusEffects.keys())
      })),
      entities: Array.from(this.entities.values()),
      toys: Array.from(this.gameElements.toys.values()),
      collectibles: Array.from(this.gameElements.collectibles.values())
    };
  }

  getDeltaState() {
    // Return only changed data for efficient updates
    return this.getPublicState(); // Simplified for now
  }

  getFullState() {
    return {
      frame: this.frame,
      players: Array.from(this.players.values()),
      entities: Array.from(this.entities.values()),
      gameElements: this.gameElements,
      physics: this.physics,
      mechanics: this.mechanics
    };
  }

  getPlayerStats() {
    const stats = {};
    for (const [socketId, player] of this.players) {
      stats[socketId] = {
        lives: player.lives,
        score: player.score,
        kos: player.knockouts,
        deaths: player.deaths,
        damage: player.damage,
        eliminated: player.eliminated || false
      };
    }
    return stats;
  }

  getChecksum(frame) {
    // Simple checksum for rollback netcode
    let checksum = frame;
    for (const player of this.players.values()) {
      checksum ^= Math.floor(player.position.x) << 16;
      checksum ^= Math.floor(player.position.y);
      checksum ^= player.health << 8;
    }
    return checksum;
  }
}

module.exports = GameState;