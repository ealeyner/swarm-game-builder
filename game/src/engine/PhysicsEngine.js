export class PhysicsEngine {
    constructor() {
        this.gravity = 0.8;
        this.friction = 0.85;
        this.airResistance = 0.98;
        this.bounceThreshold = 0.1;
        this.debugMode = false;
        
        // Collision detection optimization
        this.spatialGrid = new Map();
        this.gridSize = 64;
        
        // Physics constants
        this.maxVelocity = 20;
        this.terminalVelocity = 15;
        this.groundFriction = 0.8;
        this.airFriction = 0.95;
    }
    
    update(deltaTime, entities) {
        const dt = deltaTime / 16.67; // Normalize to 60 FPS
        
        // Clear spatial grid
        this.spatialGrid.clear();
        
        // Update entity physics
        entities.forEach(entity => {
            if (entity.hasPhysics) {
                this.updateEntityPhysics(entity, dt);
                this.addToSpatialGrid(entity);
            }
        });
        
        // Handle collisions
        this.detectCollisions(entities);
    }
    
    updateEntityPhysics(entity, deltaTime) {
        // Apply gravity
        if (entity.affectedByGravity && !entity.isGrounded) {
            entity.vy += this.gravity * deltaTime;
            
            // Terminal velocity
            if (entity.vy > this.terminalVelocity) {
                entity.vy = this.terminalVelocity;
            }
        }
        
        // Apply friction
        if (entity.isGrounded) {
            entity.vx *= Math.pow(this.groundFriction, deltaTime);
        } else {
            entity.vx *= Math.pow(this.airFriction, deltaTime);
            entity.vy *= Math.pow(this.airResistance, deltaTime);
        }
        
        // Limit velocity
        entity.vx = Math.max(-this.maxVelocity, Math.min(this.maxVelocity, entity.vx));
        entity.vy = Math.max(-this.maxVelocity, Math.min(this.maxVelocity, entity.vy));
        
        // Update position
        entity.x += entity.vx * deltaTime;
        entity.y += entity.vy * deltaTime;
        
        // Reset grounded state (will be set by collision detection)
        entity.isGrounded = false;
        
        // Update entity bounds
        this.updateBounds(entity);
    }
    
    updateBounds(entity) {
        entity.left = entity.x;
        entity.right = entity.x + entity.width;
        entity.top = entity.y;
        entity.bottom = entity.y + entity.height;
        entity.centerX = entity.x + entity.width / 2;
        entity.centerY = entity.y + entity.height / 2;
    }
    
    addToSpatialGrid(entity) {
        const gridX = Math.floor(entity.x / this.gridSize);
        const gridY = Math.floor(entity.y / this.gridSize);
        const gridKey = `${gridX},${gridY}`;
        
        if (!this.spatialGrid.has(gridKey)) {
            this.spatialGrid.set(gridKey, []);
        }
        this.spatialGrid.get(gridKey).push(entity);
        
        // Also add to neighboring cells if entity spans multiple cells
        const rightGrid = Math.floor((entity.x + entity.width) / this.gridSize);
        const bottomGrid = Math.floor((entity.y + entity.height) / this.gridSize);
        
        for (let x = gridX; x <= rightGrid; x++) {
            for (let y = gridY; y <= bottomGrid; y++) {
                const key = `${x},${y}`;
                if (key !== gridKey) {
                    if (!this.spatialGrid.has(key)) {
                        this.spatialGrid.set(key, []);
                    }
                    if (!this.spatialGrid.get(key).includes(entity)) {
                        this.spatialGrid.get(key).push(entity);
                    }
                }
            }
        }
    }
    
    detectCollisions(entities) {
        const checked = new Set();
        
        // Check collisions within each grid cell
        this.spatialGrid.forEach(cellEntities => {
            for (let i = 0; i < cellEntities.length; i++) {
                for (let j = i + 1; j < cellEntities.length; j++) {
                    const entityA = cellEntities[i];
                    const entityB = cellEntities[j];
                    
                    const pairId = `${Math.min(entityA.id, entityB.id)}-${Math.max(entityA.id, entityB.id)}`;
                    if (checked.has(pairId)) continue;
                    checked.add(pairId);
                    
                    if (this.checkCollision(entityA, entityB)) {
                        this.resolveCollision(entityA, entityB);
                    }
                }
            }
        });
    }
    
    checkCollision(entityA, entityB) {
        // Skip collision if entities don't collide with each other
        if (!this.shouldCollide(entityA, entityB)) {
            return false;
        }
        
        // AABB collision detection
        return entityA.left < entityB.right &&
               entityA.right > entityB.left &&
               entityA.top < entityB.bottom &&
               entityA.bottom > entityB.top;
    }
    
    shouldCollide(entityA, entityB) {
        // Define collision rules based on entity types
        const typeA = entityA.type || 'character';
        const typeB = entityB.type || 'character';
        
        // Characters collide with platforms and other characters
        if (typeA === 'character' && typeB === 'platform') return true;
        if (typeA === 'platform' && typeB === 'character') return true;
        if (typeA === 'character' && typeB === 'character') return true;
        
        // Projectiles collide with characters and platforms
        if (typeA === 'projectile' && typeB === 'character') return true;
        if (typeA === 'character' && typeB === 'projectile') return true;
        if (typeA === 'projectile' && typeB === 'platform') return true;
        if (typeA === 'platform' && typeB === 'projectile') return true;
        
        return false;
    }
    
    resolveCollision(entityA, entityB) {
        const typeA = entityA.type || 'character';
        const typeB = entityB.type || 'character';
        
        // Handle different collision types
        if (typeA === 'character' && typeB === 'platform') {
            this.resolveCharacterPlatformCollision(entityA, entityB);
        } else if (typeA === 'platform' && typeB === 'character') {
            this.resolveCharacterPlatformCollision(entityB, entityA);
        } else if (typeA === 'character' && typeB === 'character') {
            this.resolveCharacterCharacterCollision(entityA, entityB);
        } else if ((typeA === 'projectile' && typeB === 'character') || 
                   (typeA === 'character' && typeB === 'projectile')) {
            this.resolveProjectileCharacterCollision(entityA, entityB);
        } else if ((typeA === 'projectile' && typeB === 'platform') || 
                   (typeA === 'platform' && typeB === 'projectile')) {
            this.resolveProjectilePlatformCollision(entityA, entityB);
        }
    }
    
    resolveCharacterPlatformCollision(character, platform) {
        // Calculate overlap
        const overlapX = Math.min(character.right - platform.left, platform.right - character.left);
        const overlapY = Math.min(character.bottom - platform.top, platform.bottom - character.top);
        
        // Resolve collision based on smallest overlap
        if (overlapX < overlapY) {
            // Horizontal collision
            if (character.centerX < platform.centerX) {
                // Hit from left
                character.x = platform.left - character.width;
                if (character.vx > 0) character.vx = 0;
            } else {
                // Hit from right
                character.x = platform.right;
                if (character.vx < 0) character.vx = 0;
            }
        } else {
            // Vertical collision
            if (character.centerY < platform.centerY) {
                // Hit from above (landing on platform)
                character.y = platform.top - character.height;
                character.isGrounded = true;
                if (character.vy > 0) character.vy = 0;
            } else {
                // Hit from below (hitting ceiling)
                character.y = platform.bottom;
                if (character.vy < 0) character.vy = 0;
            }
        }
        
        this.updateBounds(character);
    }
    
    resolveCharacterCharacterCollision(characterA, characterB) {
        // Calculate separation vector
        const dx = characterB.centerX - characterA.centerX;
        const dy = characterB.centerY - characterA.centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance === 0) return; // Prevent division by zero
        
        // Minimum separation distance
        const minDistance = (characterA.width + characterB.width) / 2;
        const separation = minDistance - distance;
        
        if (separation > 0) {
            // Normalize separation vector
            const separationX = (dx / distance) * separation * 0.5;
            const separationY = (dy / distance) * separation * 0.5;
            
            // Apply separation
            characterA.x -= separationX;
            characterA.y -= separationY;
            characterB.x += separationX;
            characterB.y += separationY;
            
            // Apply collision response (elastic collision)
            const relativeVelX = characterB.vx - characterA.vx;
            const relativeVelY = characterB.vy - characterA.vy;
            
            // Calculate collision impulse
            const impulse = (relativeVelX * dx + relativeVelY * dy) / (distance * distance);
            
            characterA.vx += impulse * dx * 0.5;
            characterA.vy += impulse * dy * 0.5;
            characterB.vx -= impulse * dx * 0.5;
            characterB.vy -= impulse * dy * 0.5;
            
            this.updateBounds(characterA);
            this.updateBounds(characterB);
        }
    }
    
    resolveProjectileCharacterCollision(entityA, entityB) {
        const projectile = entityA.type === 'projectile' ? entityA : entityB;
        const character = entityA.type === 'character' ? entityA : entityB;
        
        // Don't collide with owner
        if (projectile.owner === character) return;
        
        // Mark projectile for removal
        projectile.shouldRemove = true;
        
        // Apply damage and knockback to character
        if (character.takeDamage) {
            character.takeDamage(projectile.damage || 10);
        }
        
        if (character.applyKnockback) {
            const knockbackX = projectile.vx * 0.3;
            const knockbackY = projectile.vy * 0.3;
            character.applyKnockback(knockbackX, knockbackY);
        }
    }
    
    resolveProjectilePlatformCollision(entityA, entityB) {
        const projectile = entityA.type === 'projectile' ? entityA : entityB;
        const platform = entityA.type === 'platform' ? entityA : entityB;
        
        // Mark projectile for removal or bounce
        if (projectile.bouncy) {
            // Calculate bounce
            const dx = projectile.centerX - platform.centerX;
            const dy = projectile.centerY - platform.centerY;
            
            if (Math.abs(dx) > Math.abs(dy)) {
                projectile.vx *= -0.7; // Horizontal bounce with energy loss
            } else {
                projectile.vy *= -0.7; // Vertical bounce with energy loss
            }
        } else {
            projectile.shouldRemove = true;
        }
    }
    
    // Utility methods
    getDistanceBetween(entityA, entityB) {
        const dx = entityB.centerX - entityA.centerX;
        const dy = entityB.centerY - entityA.centerY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    getAngleBetween(entityA, entityB) {
        const dx = entityB.centerX - entityA.centerX;
        const dy = entityB.centerY - entityA.centerY;
        return Math.atan2(dy, dx);
    }
    
    applyForce(entity, forceX, forceY) {
        entity.vx += forceX;
        entity.vy += forceY;
    }
    
    applyImpulse(entity, impulseX, impulseY) {
        entity.vx += impulseX;
        entity.vy += impulseY;
    }
    
    // Ray casting for line of sight, projectiles, etc.
    raycast(startX, startY, endX, endY, entities) {
        const hits = [];
        const dx = endX - startX;
        const dy = endY - startY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance === 0) return hits;
        
        const stepX = dx / distance;
        const stepY = dy / distance;
        const steps = Math.floor(distance);
        
        for (let i = 0; i <= steps; i++) {
            const x = startX + stepX * i;
            const y = startY + stepY * i;
            
            // Check which entities contain this point
            entities.forEach(entity => {
                if (entity.type === 'platform' || entity.type === 'character') {
                    if (x >= entity.left && x <= entity.right &&
                        y >= entity.top && y <= entity.bottom) {
                        hits.push({
                            entity,
                            x,
                            y,
                            distance: i
                        });
                    }
                }
            });
        }
        
        return hits;
    }
    
    // Point-in-entity test
    pointInEntity(x, y, entity) {
        return x >= entity.left && x <= entity.right &&
               y >= entity.top && y <= entity.bottom;
    }
    
    // Circle-rectangle collision
    circleRectCollision(circleX, circleY, radius, rectX, rectY, rectWidth, rectHeight) {
        const closestX = Math.max(rectX, Math.min(circleX, rectX + rectWidth));
        const closestY = Math.max(rectY, Math.min(circleY, rectY + rectHeight));
        
        const distanceX = circleX - closestX;
        const distanceY = circleY - closestY;
        
        return (distanceX * distanceX + distanceY * distanceY) <= (radius * radius);
    }
    
    // Debug methods
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }
    
    getDebugInfo() {
        return {
            spatialGridSize: this.spatialGrid.size,
            gravity: this.gravity,
            friction: this.friction,
            maxVelocity: this.maxVelocity
        };
    }
}