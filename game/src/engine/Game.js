import { Renderer } from './Renderer.js';
import { InputManager } from './InputManager.js';
import { PhysicsEngine } from './PhysicsEngine.js';
import { GameStateManager } from './GameStateManager.js';
import { NetworkManager } from './NetworkManager.js';
import { AudioManager } from './AudioManager.js';
import { Character } from '../entities/Character.js';
import { Stage } from '../entities/Stage.js';

export class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        
        // Core systems
        this.renderer = new Renderer(this.ctx, canvas.width, canvas.height);
        this.input = new InputManager();
        this.physics = new PhysicsEngine();
        this.stateManager = new GameStateManager();
        this.network = new NetworkManager();
        this.audio = new AudioManager();
        
        // Game entities
        this.players = [];
        this.stage = null;
        this.projectiles = [];
        
        // Game state
        this.isRunning = false;
        this.lastTime = 0;
        this.deltaTime = 0;
        this.targetFPS = 60;
        this.frameTime = 1000 / this.targetFPS;
        
        // Performance monitoring
        this.frameCount = 0;
        this.fpsDisplay = 0;
        this.lastFPSUpdate = 0;
        
        this.initialize();
    }
    
    initialize() {
        console.log('🎮 Initializing Bluey Smash Bros Game...');
        
        // Set up canvas scaling for different screen sizes
        this.setupCanvas();
        
        // Initialize game state
        this.stateManager.setState('LOADING');
        
        // Create stage
        this.stage = new Stage('backyard', this.canvas.width, this.canvas.height);
        
        // Create default characters (Bluey and Bingo)
        this.createDefaultPlayers();
        
        // Set up input handlers
        this.setupInputHandlers();
        
        // Set up network handlers
        this.setupNetworkHandlers();
        
        // Load assets
        this.loadAssets().then(() => {
            this.stateManager.setState('MENU');
            console.log('✅ Game initialization complete!');
        });
    }
    
    setupCanvas() {
        // Handle high DPI displays
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.scale(dpr, dpr);
        
        // Prevent context menu on right click
        this.canvas.addEventListener('contextmenu', e => e.preventDefault());
    }
    
    createDefaultPlayers() {
        // Player 1 - Bluey
        const player1 = new Character({
            id: 'player1',
            name: 'Bluey',
            x: this.canvas.width * 0.25,
            y: this.canvas.height * 0.7,
            color: '#4169E1', // Bluey's blue color
            controls: {
                left: 'KeyA',
                right: 'KeyD',
                up: 'KeyW',
                down: 'KeyS',
                attack: 'Space',
                special: 'KeyQ'
            }
        });
        
        // Player 2 - Bingo
        const player2 = new Character({
            id: 'player2',
            name: 'Bingo',
            x: this.canvas.width * 0.75,
            y: this.canvas.height * 0.7,
            color: '#FF6347', // Bingo's orange/red color
            controls: {
                left: 'ArrowLeft',
                right: 'ArrowRight',
                up: 'ArrowUp',
                down: 'ArrowDown',
                attack: 'Enter',
                special: 'ShiftRight'
            }
        });
        
        this.players = [player1, player2];
        
        console.log('👥 Created default players: Bluey and Bingo');
    }
    
    setupInputHandlers() {
        // Handle game-level controls
        this.input.on('keydown', (key) => {
            switch(key) {
                case 'Escape':
                    this.togglePause();
                    break;
                case 'F11':
                    this.toggleFullscreen();
                    break;
                case 'KeyR':
                    if (this.stateManager.getState() === 'GAME_OVER') {
                        this.restart();
                    }
                    break;
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            this.setupCanvas();
        });
    }
    
    setupNetworkHandlers() {
        this.network.on('playerJoined', (playerData) => {
            console.log('🌐 Player joined:', playerData);
            // Handle multiplayer player joining
        });
        
        this.network.on('gameState', (gameState) => {
            // Sync game state for multiplayer
            this.syncGameState(gameState);
        });
        
        this.network.on('playerInput', (inputData) => {
            // Handle remote player input
            this.handleRemoteInput(inputData);
        });
    }
    
    async loadAssets() {
        console.log('📦 Loading game assets...');
        
        // Load character sprites, sounds, etc.
        // This would typically load from actual asset files
        const assets = {
            blueySprite: await this.createCharacterSprite('#4169E1'),
            bingoSprite: await this.createCharacterSprite('#FF6347'),
            backgroundMusic: null, // Would load audio files
            soundEffects: null
        };
        
        // Store assets for use by renderer
        this.renderer.setAssets(assets);
        
        console.log('✅ Assets loaded successfully');
    }
    
    // Create simple colored rectangle sprites for characters
    async createCharacterSprite(color) {
        const spriteCanvas = document.createElement('canvas');
        spriteCanvas.width = 64;
        spriteCanvas.height = 64;
        const spriteCtx = spriteCanvas.getContext('2d');
        
        // Draw simple character sprite
        spriteCtx.fillStyle = color;
        spriteCtx.fillRect(8, 8, 48, 56);
        
        // Add simple face
        spriteCtx.fillStyle = '#FFF';
        spriteCtx.fillRect(16, 20, 8, 8); // Left eye
        spriteCtx.fillRect(40, 20, 8, 8); // Right eye
        
        spriteCtx.fillStyle = '#000';
        spriteCtx.fillRect(18, 22, 4, 4); // Left pupil
        spriteCtx.fillRect(42, 22, 4, 4); // Right pupil
        
        spriteCtx.fillStyle = '#000';
        spriteCtx.fillRect(28, 35, 8, 4); // Mouth
        
        return spriteCanvas;
    }
    
    start() {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.lastTime = performance.now();
        this.gameLoop();
        
        console.log('🚀 Game started!');
    }
    
    stop() {
        this.isRunning = false;
        console.log('⏹️ Game stopped');
    }
    
    restart() {
        console.log('🔄 Restarting game...');
        
        // Reset players
        this.players.forEach(player => player.reset());
        
        // Clear projectiles
        this.projectiles = [];
        
        // Reset game state
        this.stateManager.setState('PLAYING');
        
        // Reset stage
        this.stage.reset();
    }
    
    togglePause() {
        const currentState = this.stateManager.getState();
        
        if (currentState === 'PLAYING') {
            this.stateManager.setState('PAUSED');
            console.log('⏸️ Game paused');
        } else if (currentState === 'PAUSED') {
            this.stateManager.setState('PLAYING');
            console.log('▶️ Game resumed');
        }
    }
    
    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }
    
    gameLoop(currentTime = performance.now()) {
        if (!this.isRunning) return;
        
        // Calculate delta time
        this.deltaTime = currentTime - this.lastTime;
        this.lastTime = currentTime;
        
        // Cap delta time to prevent spiral of death
        if (this.deltaTime > 50) {
            this.deltaTime = 50;
        }
        
        // Update FPS counter
        this.updateFPS(currentTime);
        
        // Only update and render if not paused
        if (this.stateManager.getState() !== 'PAUSED') {
            this.update(this.deltaTime);
        }
        
        this.render();
        
        // Schedule next frame
        requestAnimationFrame((time) => this.gameLoop(time));
    }
    
    update(deltaTime) {
        const gameState = this.stateManager.getState();
        
        switch(gameState) {
            case 'MENU':
                this.updateMenu(deltaTime);
                break;
            case 'PLAYING':
                this.updateGameplay(deltaTime);
                break;
            case 'GAME_OVER':
                this.updateGameOver(deltaTime);
                break;
        }
    }
    
    updateMenu(deltaTime) {
        // Handle menu input
        if (this.input.isKeyPressed('Space') || this.input.isKeyPressed('Enter')) {
            this.stateManager.setState('PLAYING');
            console.log('🎯 Starting gameplay!');
        }
    }
    
    updateGameplay(deltaTime) {
        // Update players
        this.players.forEach(player => {
            player.handleInput(this.input);
            player.update(deltaTime);
        });
        
        // Update projectiles
        this.projectiles.forEach((projectile, index) => {
            projectile.update(deltaTime);
            
            // Remove projectiles that are off-screen or expired
            if (projectile.shouldRemove()) {
                this.projectiles.splice(index, 1);
            }
        });
        
        // Update physics
        this.physics.update(deltaTime, [...this.players, ...this.projectiles]);
        
        // Check for collisions
        this.checkCollisions();
        
        // Check win conditions
        this.checkWinConditions();
        
        // Update stage
        this.stage.update(deltaTime);
        
        // Send network updates if multiplayer
        if (this.network.isConnected()) {
            this.sendNetworkUpdate();
        }
    }
    
    updateGameOver(deltaTime) {
        // Handle game over state
        if (this.input.isKeyPressed('KeyR')) {
            this.restart();
        }
    }
    
    checkCollisions() {
        // Player vs Player collision
        for (let i = 0; i < this.players.length; i++) {
            for (let j = i + 1; j < this.players.length; j++) {
                if (this.physics.checkCollision(this.players[i], this.players[j])) {
                    this.handlePlayerCollision(this.players[i], this.players[j]);
                }
            }
        }
        
        // Player vs Projectile collision
        this.players.forEach(player => {
            this.projectiles.forEach((projectile, index) => {
                if (projectile.owner !== player && 
                    this.physics.checkCollision(player, projectile)) {
                    this.handleProjectileHit(player, projectile);
                    this.projectiles.splice(index, 1);
                }
            });
        });
        
        // Player vs Stage boundaries
        this.players.forEach(player => {
            this.stage.checkBoundaries(player);
        });
    }
    
    handlePlayerCollision(player1, player2) {
        // Simple collision response - push players apart
        const dx = player2.x - player1.x;
        const dy = player2.y - player1.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < player1.width) {
            const pushForce = (player1.width - distance) / 2;
            const angle = Math.atan2(dy, dx);
            
            player1.x -= Math.cos(angle) * pushForce;
            player1.y -= Math.sin(angle) * pushForce;
            player2.x += Math.cos(angle) * pushForce;
            player2.y += Math.sin(angle) * pushForce;
        }
    }
    
    handleProjectileHit(player, projectile) {
        // Apply damage and knockback
        player.takeDamage(projectile.damage);
        player.applyKnockback(projectile.knockback);
        
        console.log(`💥 ${player.name} hit by projectile for ${projectile.damage} damage!`);
    }
    
    checkWinConditions() {
        const alivePlayers = this.players.filter(player => !player.isKnockedOut);
        
        if (alivePlayers.length <= 1) {
            const winner = alivePlayers[0];
            this.stateManager.setState('GAME_OVER');
            
            if (winner) {
                console.log(`🏆 ${winner.name} wins!`);
            } else {
                console.log('🤝 Draw!');
            }
        }
    }
    
    render() {
        // Clear canvas
        this.renderer.clear();
        
        const gameState = this.stateManager.getState();
        
        switch(gameState) {
            case 'LOADING':
                this.renderLoading();
                break;
            case 'MENU':
                this.renderMenu();
                break;
            case 'PLAYING':
            case 'PAUSED':
                this.renderGameplay();
                if (gameState === 'PAUSED') {
                    this.renderPauseOverlay();
                }
                break;
            case 'GAME_OVER':
                this.renderGameplay();
                this.renderGameOver();
                break;
        }
        
        // Always render FPS
        this.renderFPS();
    }
    
    renderLoading() {
        this.renderer.drawText('Loading...', 
            this.canvas.width / 2, this.canvas.height / 2, 
            '32px Arial', '#FFF', 'center');
    }
    
    renderMenu() {
        // Render background
        this.renderer.drawGradient(0, 0, this.canvas.width, this.canvas.height,
            '#87CEEB', '#98FB98');
        
        // Render title
        this.renderer.drawText('BLUEY SMASH BROS', 
            this.canvas.width / 2, this.canvas.height / 3, 
            'bold 48px Arial', '#4169E1', 'center');
        
        // Render instructions
        this.renderer.drawText('Press SPACE or ENTER to start!', 
            this.canvas.width / 2, this.canvas.height / 2, 
            '24px Arial', '#FFF', 'center');
        
        // Render character previews
        this.renderCharacterPreviews();
    }
    
    renderGameplay() {
        // Render stage
        this.stage.render(this.renderer);
        
        // Render players
        this.players.forEach(player => player.render(this.renderer));
        
        // Render projectiles
        this.projectiles.forEach(projectile => projectile.render(this.renderer));
        
        // Update UI
        this.updateUI();
    }
    
    renderCharacterPreviews() {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height * 0.7;
        
        // Render Bluey preview
        this.renderer.drawRect(centerX - 150, centerY, 64, 64, '#4169E1');
        this.renderer.drawText('Bluey', centerX - 118, centerY + 80, '16px Arial', '#FFF', 'center');
        
        // Render Bingo preview
        this.renderer.drawRect(centerX + 86, centerY, 64, 64, '#FF6347');
        this.renderer.drawText('Bingo', centerX + 118, centerY + 80, '16px Arial', '#FFF', 'center');
    }
    
    renderPauseOverlay() {
        // Semi-transparent overlay
        this.renderer.drawRect(0, 0, this.canvas.width, this.canvas.height, 'rgba(0,0,0,0.5)');
        
        // Pause text
        this.renderer.drawText('PAUSED', 
            this.canvas.width / 2, this.canvas.height / 2, 
            'bold 48px Arial', '#FFF', 'center');
        
        this.renderer.drawText('Press ESC to resume', 
            this.canvas.width / 2, this.canvas.height / 2 + 60, 
            '24px Arial', '#FFF', 'center');
    }
    
    renderGameOver() {
        // Semi-transparent overlay
        this.renderer.drawRect(0, 0, this.canvas.width, this.canvas.height, 'rgba(0,0,0,0.7)');
        
        const alivePlayers = this.players.filter(player => !player.isKnockedOut);
        const winner = alivePlayers[0];
        
        if (winner) {
            this.renderer.drawText(`${winner.name.toUpperCase()} WINS!`, 
                this.canvas.width / 2, this.canvas.height / 2, 
                'bold 48px Arial', '#FFD700', 'center');
        } else {
            this.renderer.drawText('DRAW!', 
                this.canvas.width / 2, this.canvas.height / 2, 
                'bold 48px Arial', '#FFF', 'center');
        }
        
        this.renderer.drawText('Press R to restart', 
            this.canvas.width / 2, this.canvas.height / 2 + 60, 
            '24px Arial', '#FFF', 'center');
    }
    
    updateUI() {
        // Update health bars
        this.players.forEach((player, index) => {
            const healthElement = document.getElementById(`player${index + 1}Health`);
            const healthFill = healthElement.querySelector('.health-fill');
            const healthPercent = Math.max(0, player.health / player.maxHealth * 100);
            healthFill.style.width = `${healthPercent}%`;
        });
    }
    
    updateFPS(currentTime) {
        this.frameCount++;
        
        if (currentTime - this.lastFPSUpdate >= 1000) {
            this.fpsDisplay = this.frameCount;
            this.frameCount = 0;
            this.lastFPSUpdate = currentTime;
        }
    }
    
    renderFPS() {
        this.renderer.drawText(`FPS: ${this.fpsDisplay}`, 
            this.canvas.width - 80, 30, 
            '16px Arial', '#FFF', 'left');
    }
    
    // Network methods
    sendNetworkUpdate() {
        const gameState = {
            players: this.players.map(player => player.getNetworkData()),
            projectiles: this.projectiles.map(proj => proj.getNetworkData()),
            timestamp: Date.now()
        };
        
        this.network.send('gameUpdate', gameState);
    }
    
    syncGameState(remoteGameState) {
        // Handle network synchronization
        // This would interpolate between local and remote state
        console.log('🌐 Syncing game state from network');
    }
    
    handleRemoteInput(inputData) {
        // Handle input from remote players
        const player = this.players.find(p => p.id === inputData.playerId);
        if (player) {
            player.applyRemoteInput(inputData);
        }
    }
}