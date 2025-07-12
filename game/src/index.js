import './style.css';
import { Game } from './engine/Game.js';
import { InputManager } from './engine/InputManager.js';
import { NetworkManager } from './engine/NetworkManager.js';

// Initialize the game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    const game = new Game(canvas);
    
    // Start the game
    game.start();
    
    console.log('🐕 Bluey Smash Bros Game Started! 🎮');
});