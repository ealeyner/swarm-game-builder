export class InputManager {
    constructor() {
        this.keys = new Map();
        this.keyStates = new Map();
        this.mouse = {
            x: 0,
            y: 0,
            buttons: new Map()
        };
        this.gamepadStates = new Map();
        this.eventListeners = new Map();
        
        this.setupEventListeners();
        this.setupGamepadSupport();
    }
    
    setupEventListeners() {
        // Keyboard events
        document.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });
        
        document.addEventListener('keyup', (e) => {
            this.handleKeyUp(e);
        });
        
        // Mouse events
        document.addEventListener('mousedown', (e) => {
            this.handleMouseDown(e);
        });
        
        document.addEventListener('mouseup', (e) => {
            this.handleMouseUp(e);
        });
        
        document.addEventListener('mousemove', (e) => {
            this.handleMouseMove(e);
        });
        
        // Prevent context menu
        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
        
        // Touch events for mobile support
        document.addEventListener('touchstart', (e) => {
            this.handleTouchStart(e);
        });
        
        document.addEventListener('touchend', (e) => {
            this.handleTouchEnd(e);
        });
        
        document.addEventListener('touchmove', (e) => {
            this.handleTouchMove(e);
        });
    }
    
    setupGamepadSupport() {
        // Check for gamepad support
        this.gamepadSupported = 'getGamepads' in navigator;
        
        if (this.gamepadSupported) {
            window.addEventListener('gamepadconnected', (e) => {
                console.log('🎮 Gamepad connected:', e.gamepad.id);
                this.gamepadStates.set(e.gamepad.index, e.gamepad);
            });
            
            window.addEventListener('gamepaddisconnected', (e) => {
                console.log('🎮 Gamepad disconnected:', e.gamepad.id);
                this.gamepadStates.delete(e.gamepad.index);
            });
        }
    }
    
    handleKeyDown(e) {
        const key = e.code;
        
        if (!this.keys.get(key)) {
            this.keys.set(key, true);
            this.keyStates.set(key, { pressed: true, justPressed: true, justReleased: false });
            this.emit('keydown', key);
        }
        
        // Prevent default for game keys
        if (this.isGameKey(key)) {
            e.preventDefault();
        }
    }
    
    handleKeyUp(e) {
        const key = e.code;
        
        this.keys.set(key, false);
        this.keyStates.set(key, { pressed: false, justPressed: false, justReleased: true });
        this.emit('keyup', key);
        
        if (this.isGameKey(key)) {
            e.preventDefault();
        }
    }
    
    handleMouseDown(e) {
        this.mouse.buttons.set(e.button, true);
        this.emit('mousedown', { button: e.button, x: this.mouse.x, y: this.mouse.y });
    }
    
    handleMouseUp(e) {
        this.mouse.buttons.set(e.button, false);
        this.emit('mouseup', { button: e.button, x: this.mouse.x, y: this.mouse.y });
    }
    
    handleMouseMove(e) {
        const canvas = document.getElementById('gameCanvas');
        const rect = canvas.getBoundingClientRect();
        
        this.mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
        this.mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        this.emit('mousemove', { x: this.mouse.x, y: this.mouse.y });
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const canvas = document.getElementById('gameCanvas');
        const rect = canvas.getBoundingClientRect();
        
        const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
        
        this.emit('touchstart', { x, y, id: touch.identifier });
    }
    
    handleTouchEnd(e) {
        e.preventDefault();
        const touch = e.changedTouches[0];
        
        this.emit('touchend', { id: touch.identifier });
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const canvas = document.getElementById('gameCanvas');
        const rect = canvas.getBoundingClientRect();
        
        const x = (touch.clientX - rect.left) * (canvas.width / rect.width);
        const y = (touch.clientY - rect.top) * (canvas.height / rect.height);
        
        this.emit('touchmove', { x, y, id: touch.identifier });
    }
    
    isGameKey(key) {
        const gameKeys = [
            'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'Space',
            'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
            'Enter', 'ShiftLeft', 'ShiftRight', 'Escape', 'F11'
        ];
        return gameKeys.includes(key);
    }
    
    // Public API methods
    isKeyDown(key) {
        return this.keys.get(key) || false;
    }
    
    isKeyPressed(key) {
        const state = this.keyStates.get(key);
        return state ? state.justPressed : false;
    }
    
    isKeyReleased(key) {
        const state = this.keyStates.get(key);
        return state ? state.justReleased : false;
    }
    
    isMouseButtonDown(button) {
        return this.mouse.buttons.get(button) || false;
    }
    
    getMousePosition() {
        return { x: this.mouse.x, y: this.mouse.y };
    }
    
    // Gamepad methods
    updateGamepads() {
        if (!this.gamepadSupported) return;
        
        const gamepads = navigator.getGamepads();
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                this.gamepadStates.set(i, gamepads[i]);
            }
        }
    }
    
    getGamepadInput(playerIndex) {
        const gamepad = this.gamepadStates.get(playerIndex);
        if (!gamepad) return null;
        
        return {
            leftStick: {
                x: gamepad.axes[0],
                y: gamepad.axes[1]
            },
            rightStick: {
                x: gamepad.axes[2],
                y: gamepad.axes[3]
            },
            buttons: {
                a: gamepad.buttons[0].pressed,
                b: gamepad.buttons[1].pressed,
                x: gamepad.buttons[2].pressed,
                y: gamepad.buttons[3].pressed,
                lb: gamepad.buttons[4].pressed,
                rb: gamepad.buttons[5].pressed,
                lt: gamepad.buttons[6].value,
                rt: gamepad.buttons[7].value,
                back: gamepad.buttons[8].pressed,
                start: gamepad.buttons[9].pressed,
                leftStickClick: gamepad.buttons[10].pressed,
                rightStickClick: gamepad.buttons[11].pressed,
                dpadUp: gamepad.buttons[12].pressed,
                dpadDown: gamepad.buttons[13].pressed,
                dpadLeft: gamepad.buttons[14].pressed,
                dpadRight: gamepad.buttons[15].pressed
            }
        };
    }
    
    // Character input mapping
    getPlayerInput(playerId, controls) {
        const input = {
            left: false,
            right: false,
            up: false,
            down: false,
            attack: false,
            special: false,
            leftPressed: false,
            rightPressed: false,
            upPressed: false,
            downPressed: false,
            attackPressed: false,
            specialPressed: false
        };
        
        // Keyboard input
        if (controls) {
            input.left = this.isKeyDown(controls.left);
            input.right = this.isKeyDown(controls.right);
            input.up = this.isKeyDown(controls.up);
            input.down = this.isKeyDown(controls.down);
            input.attack = this.isKeyDown(controls.attack);
            input.special = this.isKeyDown(controls.special);
            
            input.leftPressed = this.isKeyPressed(controls.left);
            input.rightPressed = this.isKeyPressed(controls.right);
            input.upPressed = this.isKeyPressed(controls.up);
            input.downPressed = this.isKeyPressed(controls.down);
            input.attackPressed = this.isKeyPressed(controls.attack);
            input.specialPressed = this.isKeyPressed(controls.special);
        }
        
        // Gamepad input (if available)
        const gamepadInput = this.getGamepadInput(playerId === 'player1' ? 0 : 1);
        if (gamepadInput) {
            // Override keyboard with gamepad input
            const deadzone = 0.2;
            
            if (Math.abs(gamepadInput.leftStick.x) > deadzone) {
                input.left = gamepadInput.leftStick.x < -deadzone;
                input.right = gamepadInput.leftStick.x > deadzone;
            }
            
            if (Math.abs(gamepadInput.leftStick.y) > deadzone) {
                input.up = gamepadInput.leftStick.y < -deadzone;
                input.down = gamepadInput.leftStick.y > deadzone;
            }
            
            // D-pad input
            input.left = input.left || gamepadInput.buttons.dpadLeft;
            input.right = input.right || gamepadInput.buttons.dpadRight;
            input.up = input.up || gamepadInput.buttons.dpadUp;
            input.down = input.down || gamepadInput.buttons.dpadDown;
            
            // Action buttons
            input.attack = input.attack || gamepadInput.buttons.a;
            input.special = input.special || gamepadInput.buttons.x;
        }
        
        return input;
    }
    
    // Virtual on-screen controls for mobile
    createVirtualControls() {
        const virtualControls = document.createElement('div');
        virtualControls.id = 'virtualControls';
        virtualControls.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            right: 20px;
            height: 120px;
            display: none;
            pointer-events: none;
            z-index: 1000;
        `;
        
        // Left side - D-pad
        const dpad = document.createElement('div');
        dpad.style.cssText = `
            position: absolute;
            left: 0;
            bottom: 0;
            width: 120px;
            height: 120px;
            pointer-events: all;
        `;
        
        // Right side - Action buttons
        const actionButtons = document.createElement('div');
        actionButtons.style.cssText = `
            position: absolute;
            right: 0;
            bottom: 0;
            width: 120px;
            height: 120px;
            pointer-events: all;
        `;
        
        virtualControls.appendChild(dpad);
        virtualControls.appendChild(actionButtons);
        document.body.appendChild(virtualControls);
        
        // Show virtual controls on mobile
        if ('ontouchstart' in window) {
            virtualControls.style.display = 'block';
        }
        
        return virtualControls;
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
    
    // Update method called each frame
    update() {
        // Reset just pressed/released states
        this.keyStates.forEach((state, key) => {
            if (state.justPressed) {
                state.justPressed = false;
            }
            if (state.justReleased) {
                state.justReleased = false;
            }
        });
        
        // Update gamepad states
        this.updateGamepads();
    }
    
    // Cleanup
    destroy() {
        // Remove all event listeners
        this.eventListeners.clear();
        
        // Clear all input states
        this.keys.clear();
        this.keyStates.clear();
        this.mouse.buttons.clear();
        this.gamepadStates.clear();
    }
    
    // Input recording and playback for replay system
    startRecording() {
        this.recording = [];
        this.recordingStartTime = Date.now();
    }
    
    stopRecording() {
        const recording = this.recording;
        this.recording = null;
        return recording;
    }
    
    recordInput(playerId, input) {
        if (!this.recording) return;
        
        this.recording.push({
            timestamp: Date.now() - this.recordingStartTime,
            playerId,
            input: { ...input }
        });
    }
    
    playbackInput(recording, callback) {
        let playbackIndex = 0;
        const startTime = Date.now();
        
        const playbackInterval = setInterval(() => {
            const currentTime = Date.now() - startTime;
            
            while (playbackIndex < recording.length && 
                   recording[playbackIndex].timestamp <= currentTime) {
                callback(recording[playbackIndex]);
                playbackIndex++;
            }
            
            if (playbackIndex >= recording.length) {
                clearInterval(playbackInterval);
            }
        }, 16); // ~60 FPS
        
        return playbackInterval;
    }
}