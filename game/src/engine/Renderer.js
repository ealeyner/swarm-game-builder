export class Renderer {
    constructor(ctx, width, height) {
        this.ctx = ctx;
        this.width = width;
        this.height = height;
        this.assets = {};
        
        // Rendering settings
        this.ctx.imageSmoothingEnabled = false; // Pixel-perfect rendering
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'top';
    }
    
    setAssets(assets) {
        this.assets = assets;
    }
    
    clear(color = '#000000') {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(0, 0, this.width, this.height);
    }
    
    drawRect(x, y, width, height, color) {
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, width, height);
    }
    
    drawCircle(x, y, radius, color) {
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, Math.PI * 2);
        this.ctx.fill();
    }
    
    drawLine(x1, y1, x2, y2, color, width = 1) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = width;
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
    }
    
    drawText(text, x, y, font, color, align = 'left') {
        this.ctx.font = font;
        this.ctx.fillStyle = color;
        this.ctx.textAlign = align;
        this.ctx.fillText(text, x, y);
    }
    
    drawGradient(x, y, width, height, color1, color2, vertical = true) {
        const gradient = vertical 
            ? this.ctx.createLinearGradient(x, y, x, y + height)
            : this.ctx.createLinearGradient(x, y, x + width, y);
        
        gradient.addColorStop(0, color1);
        gradient.addColorStop(1, color2);
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(x, y, width, height);
    }
    
    drawSprite(sprite, x, y, width = null, height = null) {
        if (!sprite) return;
        
        const drawWidth = width || sprite.width;
        const drawHeight = height || sprite.height;
        
        this.ctx.drawImage(sprite, x, y, drawWidth, drawHeight);
    }
    
    drawSpriteFrame(sprite, frameX, frameY, frameWidth, frameHeight, 
                   destX, destY, destWidth = null, destHeight = null) {
        if (!sprite) return;
        
        const drawWidth = destWidth || frameWidth;
        const drawHeight = destHeight || frameHeight;
        
        this.ctx.drawImage(sprite, 
            frameX, frameY, frameWidth, frameHeight,
            destX, destY, drawWidth, drawHeight
        );
    }
    
    // Advanced drawing methods for game effects
    drawCharacter(character) {
        const { x, y, width, height, color, name, facing } = character;
        
        // Draw character body
        this.drawRect(x, y, width, height, color);
        
        // Draw simple face
        const faceColor = '#FFF';
        const eyeSize = width * 0.15;
        const eyeY = y + height * 0.25;
        
        // Eyes
        this.drawCircle(x + width * 0.25, eyeY, eyeSize, faceColor);
        this.drawCircle(x + width * 0.75, eyeY, eyeSize, faceColor);
        
        // Pupils
        this.drawCircle(x + width * 0.25, eyeY, eyeSize * 0.5, '#000');
        this.drawCircle(x + width * 0.75, eyeY, eyeSize * 0.5, '#000');
        
        // Mouth
        const mouthY = y + height * 0.6;
        this.drawRect(x + width * 0.3, mouthY, width * 0.4, height * 0.1, '#000');
        
        // Character name
        this.drawText(name, x, y - 20, '12px Arial', '#FFF', 'left');
        
        // Health bar above character
        this.drawHealthBar(x, y - 15, width, character.health, character.maxHealth);
    }
    
    drawHealthBar(x, y, width, currentHealth, maxHealth) {
        const barHeight = 4;
        const healthPercent = Math.max(0, currentHealth / maxHealth);
        
        // Background
        this.drawRect(x, y, width, barHeight, '#333');
        
        // Health fill
        const healthColor = healthPercent > 0.6 ? '#0F0' : 
                           healthPercent > 0.3 ? '#FF0' : '#F00';
        this.drawRect(x, y, width * healthPercent, barHeight, healthColor);
        
        // Border
        this.ctx.strokeStyle = '#FFF';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, width, barHeight);
    }
    
    drawStage(stage) {
        const { platforms, background } = stage;
        
        // Draw background
        if (background) {
            this.drawGradient(0, 0, this.width, this.height, 
                background.topColor, background.bottomColor);
        }
        
        // Draw platforms
        platforms.forEach(platform => {
            this.drawRect(platform.x, platform.y, platform.width, platform.height, 
                platform.color || '#8B4513');
            
            // Add platform outline
            this.ctx.strokeStyle = '#654321';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(platform.x, platform.y, platform.width, platform.height);
        });
    }
    
    drawProjectile(projectile) {
        const { x, y, width, height, color, type } = projectile;
        
        switch(type) {
            case 'energy':
                // Draw glowing energy ball
                this.drawCircle(x + width/2, y + height/2, width/2, color);
                this.drawCircle(x + width/2, y + height/2, width/3, '#FFF');
                break;
            case 'physical':
                // Draw spinning object
                this.drawRect(x, y, width, height, color);
                break;
            default:
                this.drawCircle(x + width/2, y + height/2, width/2, color);
        }
    }
    
    drawParticle(particle) {
        const { x, y, size, color, alpha } = particle;
        
        this.ctx.globalAlpha = alpha;
        this.drawCircle(x, y, size, color);
        this.ctx.globalAlpha = 1.0;
    }
    
    // Special effects
    drawExplosion(x, y, radius, intensity = 1) {
        const numParticles = Math.floor(20 * intensity);
        
        for (let i = 0; i < numParticles; i++) {
            const angle = (Math.PI * 2 * i) / numParticles;
            const distance = radius * (0.5 + Math.random() * 0.5);
            const particleX = x + Math.cos(angle) * distance;
            const particleY = y + Math.sin(angle) * distance;
            const size = 2 + Math.random() * 4;
            
            const colors = ['#FF4500', '#FF6347', '#FFD700', '#FFA500'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            this.drawCircle(particleX, particleY, size, color);
        }
    }
    
    drawDamageNumber(x, y, damage, color = '#FF0000') {
        this.ctx.font = 'bold 16px Arial';
        this.ctx.fillStyle = color;
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = 2;
        this.ctx.textAlign = 'center';
        
        this.ctx.strokeText(`-${damage}`, x, y);
        this.ctx.fillText(`-${damage}`, x, y);
    }
    
    // Screen effects
    drawScreenShake(intensity) {
        const shakeX = (Math.random() - 0.5) * intensity;
        const shakeY = (Math.random() - 0.5) * intensity;
        
        this.ctx.translate(shakeX, shakeY);
    }
    
    resetTransform() {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    
    drawHitEffect(x, y, size = 20) {
        // Draw impact lines radiating from point
        const numLines = 8;
        for (let i = 0; i < numLines; i++) {
            const angle = (Math.PI * 2 * i) / numLines;
            const startX = x + Math.cos(angle) * size * 0.3;
            const startY = y + Math.sin(angle) * size * 0.3;
            const endX = x + Math.cos(angle) * size;
            const endY = y + Math.sin(angle) * size;
            
            this.drawLine(startX, startY, endX, endY, '#FFF', 3);
        }
    }
    
    // UI drawing methods
    drawButton(x, y, width, height, text, isHovered = false) {
        const bgColor = isHovered ? '#6495ED' : '#4169E1';
        const textColor = '#FFF';
        
        // Button background
        this.drawRect(x, y, width, height, bgColor);
        
        // Button border
        this.ctx.strokeStyle = '#FFF';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x, y, width, height);
        
        // Button text
        this.drawText(text, x + width/2, y + height/2 - 8, 
            '16px Arial', textColor, 'center');
    }
    
    drawProgressBar(x, y, width, height, progress, bgColor = '#333', fillColor = '#0F0') {
        // Background
        this.drawRect(x, y, width, height, bgColor);
        
        // Progress fill
        this.drawRect(x, y, width * progress, height, fillColor);
        
        // Border
        this.ctx.strokeStyle = '#FFF';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(x, y, width, height);
    }
    
    // Debug drawing
    drawDebugInfo(entities, physics) {
        if (!physics.debugMode) return;
        
        this.ctx.globalAlpha = 0.5;
        
        entities.forEach(entity => {
            // Draw bounding box
            this.ctx.strokeStyle = '#FF0000';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(entity.x, entity.y, entity.width, entity.height);
            
            // Draw velocity vector
            if (entity.vx || entity.vy) {
                const centerX = entity.x + entity.width / 2;
                const centerY = entity.y + entity.height / 2;
                const endX = centerX + entity.vx * 2;
                const endY = centerY + entity.vy * 2;
                
                this.drawLine(centerX, centerY, endX, endY, '#00FF00', 2);
            }
        });
        
        this.ctx.globalAlpha = 1.0;
    }
}