export class GameStateManager {
    constructor() {
        this.currentState = 'LOADING';
        this.previousState = null;
        this.stateHistory = [];
        this.stateData = new Map();
        this.eventListeners = new Map();
        
        // Game states
        this.states = {
            LOADING: 'LOADING',
            MENU: 'MENU',
            CHARACTER_SELECT: 'CHARACTER_SELECT',
            PLAYING: 'PLAYING',
            PAUSED: 'PAUSED',
            GAME_OVER: 'GAME_OVER',
            VICTORY: 'VICTORY',
            SETTINGS: 'SETTINGS',
            CREDITS: 'CREDITS'
        };
        
        // State transition rules
        this.validTransitions = new Map([
            ['LOADING', ['MENU']],
            ['MENU', ['CHARACTER_SELECT', 'SETTINGS', 'CREDITS', 'PLAYING']],
            ['CHARACTER_SELECT', ['PLAYING', 'MENU']],
            ['PLAYING', ['PAUSED', 'GAME_OVER', 'VICTORY', 'MENU']],
            ['PAUSED', ['PLAYING', 'MENU', 'SETTINGS']],
            ['GAME_OVER', ['MENU', 'PLAYING']],
            ['VICTORY', ['MENU', 'PLAYING']],
            ['SETTINGS', ['MENU', 'PAUSED']],
            ['CREDITS', ['MENU']]
        ]);
        
        // State timers
        this.stateStartTime = Date.now();
        this.stateTimers = new Map();
    }
    
    setState(newState, data = null) {
        // Validate state transition
        if (!this.isValidTransition(this.currentState, newState)) {
            console.warn(`Invalid state transition from ${this.currentState} to ${newState}`);
            return false;
        }
        
        // Store previous state
        this.previousState = this.currentState;
        
        // Add to history
        this.stateHistory.push({
            state: this.currentState,
            timestamp: Date.now(),
            duration: Date.now() - this.stateStartTime
        });
        
        // Exit current state
        this.onStateExit(this.currentState);
        
        // Change state
        this.currentState = newState;
        this.stateStartTime = Date.now();
        
        // Store state data
        if (data) {
            this.stateData.set(newState, data);
        }
        
        // Enter new state
        this.onStateEnter(newState, data);
        
        // Emit state change event
        this.emit('stateChanged', {
            previousState: this.previousState,
            currentState: this.currentState,
            data: data
        });
        
        console.log(`🎮 State changed: ${this.previousState} → ${this.currentState}`);
        return true;
    }
    
    getState() {
        return this.currentState;
    }
    
    getPreviousState() {
        return this.previousState;
    }
    
    getStateData(state = null) {
        const targetState = state || this.currentState;
        return this.stateData.get(targetState);
    }
    
    setStateData(state, data) {
        this.stateData.set(state, data);
    }
    
    isValidTransition(fromState, toState) {
        const allowedTransitions = this.validTransitions.get(fromState);
        return allowedTransitions ? allowedTransitions.includes(toState) : false;
    }
    
    isInState(state) {
        return this.currentState === state;
    }
    
    isInAnyState(states) {
        return states.includes(this.currentState);
    }
    
    getStateDuration() {
        return Date.now() - this.stateStartTime;
    }
    
    // State lifecycle methods
    onStateEnter(state, data) {
        switch(state) {
            case this.states.LOADING:
                this.onEnterLoading(data);
                break;
            case this.states.MENU:
                this.onEnterMenu(data);
                break;
            case this.states.CHARACTER_SELECT:
                this.onEnterCharacterSelect(data);
                break;
            case this.states.PLAYING:
                this.onEnterPlaying(data);
                break;
            case this.states.PAUSED:
                this.onEnterPaused(data);
                break;
            case this.states.GAME_OVER:
                this.onEnterGameOver(data);
                break;
            case this.states.VICTORY:
                this.onEnterVictory(data);
                break;
            case this.states.SETTINGS:
                this.onEnterSettings(data);
                break;
            case this.states.CREDITS:
                this.onEnterCredits(data);
                break;
        }
        
        this.emit('stateEnter', { state, data });
    }
    
    onStateExit(state) {
        switch(state) {
            case this.states.LOADING:
                this.onExitLoading();
                break;
            case this.states.MENU:
                this.onExitMenu();
                break;
            case this.states.CHARACTER_SELECT:
                this.onExitCharacterSelect();
                break;
            case this.states.PLAYING:
                this.onExitPlaying();
                break;
            case this.states.PAUSED:
                this.onExitPaused();
                break;
            case this.states.GAME_OVER:
                this.onExitGameOver();
                break;
            case this.states.VICTORY:
                this.onExitVictory();
                break;
            case this.states.SETTINGS:
                this.onExitSettings();
                break;
            case this.states.CREDITS:
                this.onExitCredits();
                break;
        }
        
        this.emit('stateExit', { state });
    }
    
    // Specific state handlers
    onEnterLoading(data) {
        console.log('🔄 Entering loading state');
        // Show loading UI
        this.showLoadingUI();
    }
    
    onExitLoading() {
        console.log('✅ Exiting loading state');
        // Hide loading UI
        this.hideLoadingUI();
    }
    
    onEnterMenu(data) {
        console.log('📋 Entering menu state');
        // Reset game UI
        this.resetGameUI();
        // Show menu
        this.showMenuUI();
    }
    
    onExitMenu() {
        console.log('📋 Exiting menu state');
        this.hideMenuUI();
    }
    
    onEnterCharacterSelect(data) {
        console.log('👥 Entering character select state');
        this.showCharacterSelectUI();
    }
    
    onExitCharacterSelect() {
        console.log('👥 Exiting character select state');
        this.hideCharacterSelectUI();
    }
    
    onEnterPlaying(data) {
        console.log('🎮 Entering playing state');
        this.showGameUI();
        this.startGameTimer();
    }
    
    onExitPlaying() {
        console.log('🎮 Exiting playing state');
        this.stopGameTimer();
    }
    
    onEnterPaused(data) {
        console.log('⏸️ Entering paused state');
        this.showPauseUI();
        this.pauseGameTimer();
    }
    
    onExitPaused() {
        console.log('▶️ Exiting paused state');
        this.hidePauseUI();
        this.resumeGameTimer();
    }
    
    onEnterGameOver(data) {
        console.log('💀 Entering game over state');
        this.showGameOverUI(data);
        this.stopGameTimer();
    }
    
    onExitGameOver() {
        console.log('💀 Exiting game over state');
        this.hideGameOverUI();
    }
    
    onEnterVictory(data) {
        console.log('🏆 Entering victory state');
        this.showVictoryUI(data);
        this.stopGameTimer();
    }
    
    onExitVictory() {
        console.log('🏆 Exiting victory state');
        this.hideVictoryUI();
    }
    
    onEnterSettings(data) {
        console.log('⚙️ Entering settings state');
        this.showSettingsUI();
    }
    
    onExitSettings() {
        console.log('⚙️ Exiting settings state');
        this.hideSettingsUI();
    }
    
    onEnterCredits(data) {
        console.log('📜 Entering credits state');
        this.showCreditsUI();
    }
    
    onExitCredits() {
        console.log('📜 Exiting credits state');
        this.hideCreditsUI();
    }
    
    // UI Management methods
    showLoadingUI() {
        // Implementation would show loading screen
    }
    
    hideLoadingUI() {
        // Implementation would hide loading screen
    }
    
    showMenuUI() {
        // Implementation would show main menu
    }
    
    hideMenuUI() {
        // Implementation would hide main menu
    }
    
    showCharacterSelectUI() {
        // Implementation would show character selection
    }
    
    hideCharacterSelectUI() {
        // Implementation would hide character selection
    }
    
    showGameUI() {
        const gameInfo = document.getElementById('gameInfo');
        const controls = document.getElementById('controls');
        if (gameInfo) gameInfo.style.display = 'block';
        if (controls) controls.style.display = 'block';
    }
    
    resetGameUI() {
        // Reset health bars
        const player1Health = document.getElementById('player1Health');
        const player2Health = document.getElementById('player2Health');
        
        if (player1Health) {
            const healthFill = player1Health.querySelector('.health-fill');
            if (healthFill) healthFill.style.width = '100%';
        }
        
        if (player2Health) {
            const healthFill = player2Health.querySelector('.health-fill');
            if (healthFill) healthFill.style.width = '100%';
        }
    }
    
    showPauseUI() {
        // Implementation would show pause overlay
    }
    
    hidePauseUI() {
        // Implementation would hide pause overlay
    }
    
    showGameOverUI(data) {
        // Implementation would show game over screen
    }
    
    hideGameOverUI() {
        // Implementation would hide game over screen
    }
    
    showVictoryUI(data) {
        // Implementation would show victory screen
    }
    
    hideVictoryUI() {
        // Implementation would hide victory screen
    }
    
    showSettingsUI() {
        // Implementation would show settings menu
    }
    
    hideSettingsUI() {
        // Implementation would hide settings menu
    }
    
    showCreditsUI() {
        // Implementation would show credits
    }
    
    hideCreditsUI() {
        // Implementation would hide credits
    }
    
    // Timer management
    startGameTimer() {
        this.gameStartTime = Date.now();
        this.gameTimer = setInterval(() => {
            this.updateGameTimer();
        }, 1000);
    }
    
    stopGameTimer() {
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
            this.gameTimer = null;
        }
    }
    
    pauseGameTimer() {
        if (this.gameTimer) {
            this.pausedTime = Date.now();
            clearInterval(this.gameTimer);
        }
    }
    
    resumeGameTimer() {
        if (this.pausedTime) {
            const pauseDuration = Date.now() - this.pausedTime;
            this.gameStartTime += pauseDuration;
            this.pausedTime = null;
            
            this.gameTimer = setInterval(() => {
                this.updateGameTimer();
            }, 1000);
        }
    }
    
    updateGameTimer() {
        const elapsed = Date.now() - this.gameStartTime;
        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const displaySeconds = seconds % 60;
        
        const timeString = `${minutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
        
        const gameInfo = document.getElementById('gameInfo');
        if (gameInfo) {
            gameInfo.innerHTML = `<div>Time: ${timeString}</div><div>Fight!</div>`;
        }
    }
    
    getGameTime() {
        if (!this.gameStartTime) return 0;
        return Date.now() - this.gameStartTime;
    }
    
    // State persistence
    saveState() {
        const stateSnapshot = {
            currentState: this.currentState,
            stateData: Object.fromEntries(this.stateData),
            stateHistory: this.stateHistory.slice(-10), // Keep last 10 states
            gameTime: this.getGameTime(),
            timestamp: Date.now()
        };
        
        localStorage.setItem('bluey-smash-gamestate', JSON.stringify(stateSnapshot));
        return stateSnapshot;
    }
    
    loadState() {
        try {
            const saved = localStorage.getItem('bluey-smash-gamestate');
            if (!saved) return false;
            
            const stateSnapshot = JSON.parse(saved);
            
            this.currentState = stateSnapshot.currentState;
            this.stateData = new Map(Object.entries(stateSnapshot.stateData));
            this.stateHistory = stateSnapshot.stateHistory || [];
            
            console.log('📁 Game state loaded successfully');
            return true;
        } catch (error) {
            console.error('❌ Failed to load game state:', error);
            return false;
        }
    }
    
    clearSavedState() {
        localStorage.removeItem('bluey-smash-gamestate');
    }
    
    // Event system
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }
    
    off(event, callback) {
        if (!this.eventListeners.has(event)) return;
        
        const listeners = this.eventListeners.get(event);
        const index = listeners.indexOf(callback);
        if (index > -1) {
            listeners.splice(index, 1);
        }
    }
    
    emit(event, data) {
        if (!this.eventListeners.has(event)) return;
        
        this.eventListeners.get(event).forEach(callback => {
            callback(data);
        });
    }
    
    // Debug and analytics
    getStateHistory() {
        return this.stateHistory;
    }
    
    getStateStatistics() {
        const stats = {};
        
        this.stateHistory.forEach(entry => {
            if (!stats[entry.state]) {
                stats[entry.state] = {
                    count: 0,
                    totalDuration: 0,
                    averageDuration: 0
                };
            }
            
            stats[entry.state].count++;
            stats[entry.state].totalDuration += entry.duration;
            stats[entry.state].averageDuration = stats[entry.state].totalDuration / stats[entry.state].count;
        });
        
        return stats;
    }
    
    reset() {
        this.currentState = this.states.MENU;
        this.previousState = null;
        this.stateHistory = [];
        this.stateData.clear();
        this.stateStartTime = Date.now();
        
        if (this.gameTimer) {
            clearInterval(this.gameTimer);
            this.gameTimer = null;
        }
        
        console.log('🔄 Game state manager reset');
    }
}