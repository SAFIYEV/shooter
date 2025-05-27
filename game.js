import * as THREE from 'three';

// Сохранение данных
const GameData = {
    totalScore: 0,
    maxHealth: 100,
    damageMultiplier: 1,
    maxAmmo: 30,
    reloadTime: 1500,
    movementSpeedMultiplier: 1,
    damageReduction: 1,
    healthRegen: 0,
    missions: {
        1: { killed: 0, completed: false },
        2: { score: 0, completed: false },
        3: { time: 0, completed: false },
        4: { killed: 0, completed: false },
        5: { score: 0, completed: false },
        6: { time: 0, completed: false },
        7: { killed: 0, completed: false },
        8: { score: 0, completed: false },
        9: { time: 0, completed: false },
        10: { killed: 0, completed: false, noReload: true },
        11: { killed: 0, completed: false, timer: 0 },
        12: { distance: 0, completed: false },
        13: { killed: 0, completed: false },
        14: { score: 0, completed: false },
        15: { time: 0, completed: false }
    },
    
    save() {
        localStorage.setItem('zombieShooterData', JSON.stringify({
            totalScore: this.totalScore,
            maxHealth: this.maxHealth,
            damageMultiplier: this.damageMultiplier,
            maxAmmo: this.maxAmmo,
            reloadTime: this.reloadTime,
            movementSpeedMultiplier: this.movementSpeedMultiplier,
            damageReduction: this.damageReduction,
            healthRegen: this.healthRegen,
            missions: this.missions
        }));
    },
    
    load() {
        const data = localStorage.getItem('zombieShooterData');
        if (data) {
            const parsed = JSON.parse(data);
            this.totalScore = parsed.totalScore;
            this.maxHealth = parsed.maxHealth;
            this.damageMultiplier = parsed.damageMultiplier;
            this.maxAmmo = parsed.maxAmmo || 30;
            this.reloadTime = parsed.reloadTime || 1500;
            this.movementSpeedMultiplier = parsed.movementSpeedMultiplier || 1;
            this.damageReduction = parsed.damageReduction || 1;
            this.healthRegen = parsed.healthRegen || 0;
            this.missions = parsed.missions;
        }
        this.updateUI();
    },
    
    updateUI() {
        document.getElementById('total-score').textContent = this.totalScore;
    }
};

class ZombieShooter {
    constructor() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => {
                console.error('Ошибка включения полноэкранного режима:', err);
            });
        }

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({
            canvas: document.getElementById('game'),
            antialias: true
        });
        
        this.renderer.setSize(window.screen.width, window.screen.height);
        this.renderer.setClearColor(0x000000);
        
        this.camera.aspect = window.screen.width / window.screen.height;
        this.camera.updateProjectionMatrix();
        
        this.shootSound = document.getElementById('shoot-sound');
        
        this.groundTexture = new THREE.TextureLoader().load(
            window.location.origin + '/texture.png',
            () => {
                console.log('Текстура успешно загружена');
                this.groundTexture.wrapS = THREE.RepeatWrapping;
                this.groundTexture.wrapT = THREE.RepeatWrapping;
                this.groundTexture.repeat.set(4, 4);
                if (this.floor) {
                    this.floor.material.map = this.groundTexture;
                    this.floor.material.needsUpdate = true;
                    console.log('Текстура применена к полу');
                }
            },
            (progress) => {
                const percent = (progress.loaded / progress.total * 100).toFixed(2);
                console.log('Загрузка текстуры:', percent + '%');
            },
            (error) => {
                console.error('Ошибка загрузки текстуры:', error);
                if (this.floor) {
                    this.floor.material.color.setHex(0x2d5a27); // Зеленый цвет по умолчанию
                    this.floor.material.needsUpdate = true;
                    console.log('Установлен зеленый цвет пола');
                }
            }
        );
        
        this.score = 0;
        this.health = GameData.maxHealth;
        this.ammo = GameData.maxAmmo;
        this.isGameOver = false;
        this.zombies = [];
        this.bullets = [];
        this.gameTime = 0;
        this.zombiesKilled = 0;
        this.zombiesKilledNoReload = 0;
        this.zombiesKilledIn10Sec = 0;
        this.killTimer = 0;
        this.distanceTraveled = 0;
        this.lastPosition = new THREE.Vector3();
        
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canShoot = true;
        this.movementSpeed = 0;
        
        this.setupScene();
        this.setupLights();
        this.setupPlayer();
        this.setupControls();
        
        this.lastTime = performance.now();
        this.animate();
        this.spawnZombies();
        this.healthRegeneration();
    }
    
    setupScene() {
        const skyGeometry = new THREE.SphereGeometry(50, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x87CEEB,
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);

        const floorGeometry = new THREE.PlaneGeometry(100, 100);
        const floorMaterial = new THREE.MeshStandardMaterial({
            map: this.groundTexture,
            roughness: 0.8,
            color: 0x2d5a27 // Зеленый цвет по умолчанию
        });
        this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
        this.floor.rotation.x = -Math.PI / 2;
        this.scene.add(this.floor);

        const terrainGeometry = new THREE.PlaneGeometry(20, 20);
        const terrainMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a472a,
            roughness: 0.9
        });

        const base1 = new THREE.Mesh(terrainGeometry, terrainMaterial);
        base1.position.set(-15, 0.1, -15);
        base1.rotation.x = -Math.PI / 2;
        this.scene.add(base1);

        const base2 = new THREE.Mesh(terrainGeometry, terrainMaterial);
        base2.position.set(15, 0.1, 15);
        base2.rotation.x = -Math.PI / 2;
        this.scene.add(base2);

        for (let i = 0; i < 20; i++) {
            const tree = new THREE.Group();
            const trunkGeometry = new THREE.CylinderGeometry(0.1, 0.15, 2, 8);
            const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a2f10 });
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.y = 1;
            tree.add(trunk);

            const crownLayers = 3;
            for (let j = 0; j < crownLayers; j++) {
                const crownGeometry = new THREE.ConeGeometry(0.8 - j * 0.2, 1.5, 8);
                const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5a27 });
                const crown = new THREE.Mesh(crownGeometry, crownMaterial);
                crown.position.y = 2 + j * 0.8;
                tree.add(crown);
            }

            const angle = Math.random() * Math.PI * 2;
            const distance = 5 + Math.random() * 15;
            tree.position.x = Math.cos(angle) * distance;
            tree.position.z = Math.sin(angle) * distance;
            tree.rotation.y = Math.random() * Math.PI;
            this.scene.add(tree);
            this.trees = this.trees || [];
            this.trees.push(tree);
        }

        for (let i = 0; i < 15; i++) {
            const rockGeometry = new THREE.DodecahedronGeometry(0.5);
            const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
            const rock = new THREE.Mesh(rockGeometry, rockMaterial);
            const angle = Math.random() * Math.PI * 2;
            const distance = 5 + Math.random() * 15;
            rock.position.x = Math.cos(angle) * distance;
            rock.position.z = Math.sin(angle) * distance;
            rock.position.y = 0.25;
            this.scene.add(rock);
            this.rocks = this.rocks || [];
            this.rocks.push(rock);
        }
    }
    
    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(5, 10, 5);
        this.scene.add(directionalLight);
        
        const secondaryLight = new THREE.DirectionalLight(0xffffff, 0.5);
        secondaryLight.position.set(-5, 8, -5);
        this.scene.add(secondaryLight);
    }
    
    setupPlayer() {
        this.camera.position.y = 1.6;
        this.camera.position.z = 5;
        this.lastPosition.copy(this.camera.position);
        
        const gunGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.3);
        const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        this.gun = new THREE.Mesh(gunGeometry, gunMaterial);
        this.gun.position.set(0.3, -0.2, -0.5);
        this.camera.add(this.gun);
        this.scene.add(this.camera);
    }
    
    setupControls() {
        const joystick = document.getElementById('joystick');
        const joystickHead = document.getElementById('joystick-head');
        let isDragging = false;
        let startX, startY;

        const handleJoystickMove = (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];
            const rect = joystick.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const deltaX = touch.clientX - centerX;
            const deltaY = touch.clientY - centerY;
            const maxDistance = 35;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            const normalizedDistance = Math.min(distance, maxDistance);
            const scale = normalizedDistance / distance || 0;
            const moveX = deltaX * scale;
            const moveY = deltaY * scale;
            joystickHead.style.transform = `translate(${moveX}px, ${moveY}px)`;
            const deadzone = 5;
            this.moveForward = moveY < -deadzone;
            this.moveBackward = moveY > deadzone;
            this.moveLeft = moveX < -deadzone;
            this.moveRight = moveX > deadzone;
            this.movementSpeed = Math.min(Math.max(normalizedDistance / maxDistance, 0), 1);
        };

        joystick.addEventListener('touchstart', (e) => {
            isDragging = true;
            handleJoystickMove(e);
        }, { passive: true });

        document.addEventListener('touchmove', handleJoystickMove, { passive: true });

        document.addEventListener('touchend', () => {
            isDragging = false;
            joystickHead.style.transform = '';
            this.moveForward = this.moveBackward = this.moveLeft = this.moveRight = false;
            this.movementSpeed = 0;
        });

        const shootBtn = document.getElementById('shoot-btn');
        shootBtn.addEventListener('touchstart', () => this.shoot(), { passive: true });

        const reloadBtn = document.getElementById('reload-btn');
        reloadBtn.addEventListener('touchstart', () => this.reload(), { passive: true });

        const rewardBtn = document.getElementById('reward-btn');
        rewardBtn.addEventListener('touchstart', () => this.showRewardedAd(), { passive: true });

        let touchStartX = 0;
        let isRotating = false;
        let lastRotationTime = 0;
        const rotationInterval = 16;

        const handleRotation = (e) => {
            if (!isRotating) return;
            const currentTime = performance.now();
            if (currentTime - lastRotationTime < rotationInterval) return;
            const touch = e.touches[0];
            const deltaX = touch.clientX - touchStartX;
            const maxRotationSpeed = 0.1;
            const rotationSpeed = Math.min(Math.abs(deltaX) * 0.002, maxRotationSpeed);
            this.camera.rotation.y -= Math.sign(deltaX) * rotationSpeed;
            touchStartX = touch.clientX;
            lastRotationTime = currentTime;
        };

        document.addEventListener('touchstart', (e) => {
            const joystickRect = joystick.getBoundingClientRect();
            if (e.touches[0].clientX < joystickRect.left || 
                e.touches[0].clientX > joystickRect.right || 
                e.touches[0].clientY < joystickRect.top || 
                e.touches[0].clientY > joystickRect.bottom) {
                touchStartX = e.touches[0].clientX;
                isRotating = true;
                lastRotationTime = performance.now();
            }
        }, { passive: true });

        document.addEventListener('touchmove', handleRotation, { passive: true });

        document.addEventListener('touchend', () => {
            isRotating = false;
        });
    }
    
    shoot() {
        if (!this.canShoot || this.ammo <= 0) return;
        this.shootSound.currentTime = 0;
        this.shootSound.play();
        this.ammo--;
        document.getElementById('ammo-count').textContent = this.ammo;
        const bulletGeometry = new THREE.SphereGeometry(0.05);
        const bulletMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
        bullet.position.copy(this.camera.position);
        bullet.rotation.copy(this.camera.rotation);
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);
        bullet.velocity = direction.multiplyScalar(0.7);
        this.bullets.push(bullet);
        this.scene.add(bullet);
        this.canShoot = false;
        setTimeout(() => this.canShoot = true, 250);
    }
    
    reload() {
        if (this.ammo === GameData.maxAmmo) return;
        setTimeout(() => {
            this.ammo = GameData.maxAmmo;
            this.zombiesKilledNoReload = 0; // Сбрасываем счетчик для миссии 10
            document.getElementById('ammo-count').textContent = this.ammo;
        }, GameData.reloadTime);
    }
    
    showRewardedAd() {
        window.ysdk.adv.showRewardedVideo({
            callbacks: {
                onOpen: () => {
                    console.log('Video ad open.');
                },
                onRewarded: () => {
                    GameData.totalScore += 500;
                    GameData.save();
                    GameData.updateUI();
                    console.log('Rewarded! +500 points');
                },
                onClose: () => {
                    console.log('Video ad closed.');
                },
                onError: (e) => {
                    console.log('Error while open video ad:', e);
                }
            }
        });
    }
    
    showFullscreenAd() {
        window.ysdk.adv.showFullscreenAdv({
            callbacks: {
                onClose: function(wasShown) {
                    console.log('Fullscreen ad closed:', wasShown);
                },
                onError: function(error) {
                    console.log('Error showing fullscreen ad:', error);
                }
            }
        });
    }
    
    spawnZombie() {
        const zombieGeometry = new THREE.BoxGeometry(0.6, 1.8, 0.3);
        const zombieMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        const zombie = new THREE.Mesh(zombieGeometry, zombieMaterial);
        const angle = Math.random() * Math.PI * 2;
        const distance = 15 + Math.random() * 10;
        zombie.position.x = Math.cos(angle) * distance;
        zombie.position.z = Math.sin(angle) * distance;
        zombie.position.y = 0.9;
        zombie.health = 100;
        this.zombies.push(zombie);
        this.scene.add(zombie);
    }
    
    spawnZombies() {
        setInterval(() => {
            if (this.zombies.length < 10 && !this.isGameOver) {
                this.spawnZombie();
            }
        }, 3000);
    }
    
    updateZombies() {
        for (let i = this.zombies.length - 1; i >= 0; i--) {
            const zombie = this.zombies[i];
            const direction = new THREE.Vector3();
            direction.subVectors(this.camera.position, zombie.position).normalize();
            zombie.position.add(direction.multiplyScalar(0.03));
            zombie.lookAt(this.camera.position);
            if (zombie.position.distanceTo(this.camera.position) < 1.5) {
                this.health -= 0.1 * GameData.damageReduction;
                document.getElementById('health-count').textContent = Math.ceil(this.health);
                if (this.health <= 0) {
                    this.gameOver();
                }
            }
        }
    }
    
    updateBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.position.add(bullet.velocity);
            for (let j = this.zombies.length - 1; j >= 0; j--) {
                const zombie = this.zombies[j];
                if (bullet.position.distanceTo(zombie.position) < 1) {
                    this.scene.remove(bullet);
                    this.bullets.splice(i, 1);
                    zombie.health -= 50 * GameData.damageMultiplier;
                    if (zombie.health <= 0) {
                        this.scene.remove(zombie);
                        this.zombies.splice(j, 1);
                        this.score += 100;
                        this.zombiesKilled++;
                        this.zombiesKilledNoReload++;
                        this.zombiesKilledIn10Sec++;
                        document.getElementById('score-count').textContent = this.score;

                        // Миссия 1: Убить 10 зомби
                        if (!GameData.missions[1].completed) {
                            GameData.missions[1].killed = this.zombiesKilled;
                            if (this.zombiesKilled >= 10) {
                                this.completeMission(1);
                            }
                        }
                        // Миссия 4: Убить 50 зомби
                        if (!GameData.missions[4].completed) {
                            GameData.missions[4].killed = this.zombiesKilled;
                            if (this.zombiesKilled >= 50) {
                                this.completeMission(4);
                            }
                        }
                        // Миссия 7: Убить 100 зомби
                        if (!GameData.missions[7].completed) {
                            GameData.missions[7].killed = this.zombiesKilled;
                            if (this.zombiesKilled >= 100) {
                                this.completeMission(7);
                            }
                        }
                        // Миссия 10: Убить 20 зомби без перезарядки
                        if (!GameData.missions[10].completed) {
                            GameData.missions[10].killed = this.zombiesKilledNoReload;
                            if (this.zombiesKilledNoReload >= 20) {
                                this.completeMission(10);
                            }
                        }
                        // Миссия 11: Убить 5 зомби за 10 секунд
                        if (!GameData.missions[11].completed) {
                            GameData.missions[11].killed = this.zombiesKilledIn10Sec;
                            if (this.zombiesKilledIn10Sec >= 5) {
                                this.completeMission(11);
                            }
                        }
                        // Миссия 13: Убить 200 зомби
                        if (!GameData.missions[13].completed) {
                            GameData.missions[13].killed = this.zombiesKilled;
                            if (this.zombiesKilled >= 200) {
                                this.completeMission(13);
                            }
                        }
                        // Миссия 2: Набрать 1000 очков
                        if (!GameData.missions[2].completed && this.score >= 1000) {
                            this.completeMission(2);
                        }
                        // Миссия 5: Набрать 5000 очков
                        if (!GameData.missions[5].completed && this.score >= 5000) {
                            this.completeMission(5);
                        }
                        // Миссия 8: Набрать 10000 очков
                        if (!GameData.missions[8].completed && this.score >= 10000) {
                            this.completeMission(8);
                        }
                        // Миссия 14: Набрать 50000 очков
                        if (!GameData.missions[14].completed && this.score >= 50000) {
                            this.completeMission(14);
                        }
                    }
                    break;
                }
            }
            if (bullet.position.length() > 50) {
                this.scene.remove(bullet);
                this.bullets.splice(i, 1);
            }
        }
    }
    
    updateMovement() {
        const baseSpeed = 0.05 * GameData.movementSpeedMultiplier;
        const direction = new THREE.Vector3();
        const oldPosition = this.camera.position.clone();

        this.camera.getWorldDirection(direction);
        const right = new THREE.Vector3();
        right.crossVectors(direction, new THREE.Vector3(0, 1, 0));

        const currentSpeed = baseSpeed * (this.movementSpeed || 1);

        if (this.moveForward) {
            this.camera.position.add(direction.multiplyScalar(currentSpeed));
        }
        if (this.moveBackward) {
            direction.set(0, 0, 0);
            this.camera.getWorldDirection(direction);
            this.camera.position.add(direction.multiplyScalar(-currentSpeed));
        }
        if (this.moveLeft) {
            this.camera.position.add(right.multiplyScalar(-currentSpeed));
        }
        if (this.moveRight) {
            right.set(0, 0, 0);
            right.crossVectors(direction, new THREE.Vector3(0, 1, 0));
            this.camera.position.add(right.multiplyScalar(currentSpeed));
        }

        const distanceMoved = this.camera.position.distanceTo(oldPosition);
        this.distanceTraveled += distanceMoved;
        if (!GameData.missions[12].completed) {
            GameData.missions[12].distance = Math.floor(this.distanceTraveled);
            if (this.distanceTraveled >= 1000) {
                this.completeMission(12);
            }
        }

        if (this.trees) {
            for (const tree of this.trees) {
                const distance = this.camera.position.distanceTo(tree.position);
                if (distance < 1.5) {
                    this.camera.position.copy(oldPosition);
                    break;
                }
            }
        }

        if (this.rocks) {
            for (const rock of this.rocks) {
                const distance = this.camera.position.distanceTo(rock.position);
                if (distance < 1) {
                    this.camera.position.copy(oldPosition);
                    break;
                }
            }
        }
    }
    
    healthRegeneration() {
        setInterval(() => {
            if (!this.isGameOver && GameData.healthRegen > 0) {
                this.health = Math.min(this.health + GameData.healthRegen, GameData.maxHealth);
                document.getElementById('health-count').textContent = Math.ceil(this.health);
            }
        }, 1000);
    }
    
    completeMission(missionId) {
        const rewards = {
            1: 500,
            2: 1000,
            3: 2000,
            4: 2500,
            5: 3000,
            6: 4000,
            7: 5000,
            8: 7000,
            9: 6000,
            10: 1500,
            11: 2000,
            12: 1000,
            13: 8000,
            14: 25000,
            15: 12000
        };
        
        GameData.missions[missionId].completed = true;
        GameData.totalScore += rewards[missionId];
        GameData.save();
        
        const missionElement = document.querySelector(`.mission[data-id="${missionId}"]`);
        if (missionElement) {
            const claimBtn = missionElement.querySelector('.claim-btn');
            claimBtn.disabled = false;
        }
    }
    
    animate() {
        if (this.isGameOver) return;
        requestAnimationFrame(() => this.animate());
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastTime) / 1000;
        this.lastTime = currentTime;
        this.gameTime += deltaTime;

        // Миссия 3: Выжить 5 минут
        if (!GameData.missions[3].completed) {
            GameData.missions[3].time = this.gameTime;
            if (this.gameTime >= 300) {
                this.completeMission(3);
            }
        }
        // Миссия 6: Выжить 10 минут
        if (!GameData.missions[6].completed) {
            GameData.missions[6].time = this.gameTime;
            if (this.gameTime >= 600) {
                this.completeMission(6);
            }
        }
        // Миссия 9: Выжить 15 минут
        if (!GameData.missions[9].completed) {
            GameData.missions[9].time = this.gameTime;
            if (this.gameTime >= 900) {
                this.completeMission(9);
            }
        }
        // Миссия 15: Выжить 30 минут
        if (!GameData.missions[15].completed) {
            GameData.missions[15].time = this.gameTime;
            if (this.gameTime >= 1800) {
                this.completeMission(15);
            }
        }
        // Миссия 11: Убить 5 зомби за 10 секунд
        if (!GameData.missions[11].completed) {
            this.killTimer += deltaTime;
            if (this.killTimer >= 10) {
                this.zombiesKilledIn10Sec = 0;
                this.killTimer = 0;
            }
        }

        this.updateMovement();
        this.updateZombies();
        this.updateBullets();
        this.renderer.render(this.scene, this.camera);
    }
    
    gameOver() {
        this.isGameOver = true;
        GameData.totalScore += this.score;
        GameData.save();
        window.ysdk.getLeaderboards().then(lb => {
            lb.setLeaderboardScore('zombieShooterLeaderboard', this.score);
        });
        this.showFullscreenAd();
        document.getElementById('game-over').classList.add('active');
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('completed-missions').textContent = 
            Object.values(GameData.missions).filter(m => m.completed).length;
    }
}

window.addEventListener('load', () => {
    YaGames.init().then(ysdk => {
        console.log('Yandex SDK initialized');
        window.ysdk = ysdk;

        GameData.load();
        const menu = document.getElementById('menu');
        const missions = document.getElementById('missions');
        const shop = document.getElementById('shop');
        const leaderboardScreen = document.getElementById('leaderboard');

        menu.classList.add('active');

        document.getElementById('start-btn').addEventListener('click', () => {
            window.ysdk.adv.showFullscreenAdv({
                callbacks: {
                    onClose: function(wasShown) {
                        document.documentElement.requestFullscreen().then(() => {
                            menu.classList.remove('active');
                            new ZombieShooter();
                        }).catch(err => {
                            console.error('Ошибка включения полноэкранного режима:', err);
                            menu.classList.remove('active');
                            new ZombieShooter();
                        });
                    },
                    onError: function(error) {
                        console.log('Error showing fullscreen ad:', error);
                        document.documentElement.requestFullscreen().then(() => {
                            menu.classList.remove('active');
                            new ZombieShooter();
                        }).catch(err => {
                            console.error('Ошибка включения полноэкранного режима:', err);
                            menu.classList.remove('active');
                            new ZombieShooter();
                        });
                    }
                }
            });
        });

        document.getElementById('missions-btn').addEventListener('click', () => {
            menu.classList.remove('active');
            missions.classList.add('active');
            updateMissionsUI();
        });

        document.getElementById('shop-btn').addEventListener('click', () => {
            menu.classList.remove('active');
            shop.classList.add('active');
            updateShopUI();
        });

        document.getElementById('leaderboard-btn').addEventListener('click', () => {
            menu.classList.remove('active');
            leaderboardScreen.classList.add('active');
            updateLeaderboardUI();
        });

        document.getElementById('missions-back').addEventListener('click', () => {
            missions.classList.remove('active');
            menu.classList.add('active');
        });

        document.getElementById('shop-back').addEventListener('click', () => {
            shop.classList.remove('active');
            menu.classList.add('active');
        });

        document.getElementById('leaderboard-back').addEventListener('click', () => {
            leaderboardScreen.classList.remove('active');
            menu.classList.add('active');
        });

        document.getElementById('menu-btn').addEventListener('click', () => {
            window.ysdk.adv.showFullscreenAdv({
                callbacks: {
                    onClose: function(wasShown) {
                        document.getElementById('game-over').classList.remove('active');
                        menu.classList.add('active');
                    },
                    onError: function(error) {
                        console.log('Error showing fullscreen ad:', error);
                        document.getElementById('game-over').classList.remove('active');
                        menu.classList.add('active');
                    }
                }
            });
        });

        document.querySelectorAll('.buy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const itemId = e.target.closest('.shop-item').dataset.id;
                buyItem(itemId);
            });
        });
    });
});

function updateMissionsUI() {
    Object.entries(GameData.missions).forEach(([id, mission]) => {
        const missionElement = document.querySelector(`.mission[data-id="${id}"]`);
        if (missionElement) {
            const claimBtn = missionElement.querySelector('.claim-btn');
            const progressElement = missionElement.querySelector('.progress');
            switch (id) {
                case '1':
                case '4':
                case '7':
                case '10':
                case '11':
                case '13':
                    progressElement.textContent = `${mission.killed}/${id == '1' ? 10 : id == '4' ? 50 : id == '7' ? 100 : id == '10' ? 20 : id == '11' ? 5 : 200}`;
                    break;
                case '2':
                case '5':
                case '8':
                case '14':
                    progressElement.textContent = `${mission.score}/${id == '2' ? 1000 : id == '5' ? 5000 : id == '8' ? 10000 : 50000}`;
                    break;
                case '3':
                case '6':
                case '9':
                case '15':
                    const minutes = Math.floor(mission.time / 60);
                    const seconds = Math.floor(mission.time % 60);
                    progressElement.textContent = 
                        `${minutes}:${seconds.toString().padStart(2, '0')}/${id == '3' ? '5:00' : id == '6' ? '10:00' : id == '9' ? '15:00' : '30:00'}`;
                    break;
                case '12':
                    progressElement.textContent = `${mission.distance}/1000`;
                    break;
            }
            if (mission.completed) {
                claimBtn.disabled = true;
                claimBtn.textContent = 'Получено';
            }
        }
    });
}

function updateShopUI() {
    document.querySelectorAll('.shop-item').forEach(item => {
        const buyBtn = item.querySelector('.buy-btn');
        const itemId = item.dataset.id;
        const price = itemId == '1' ? 1000 : itemId == '2' ? 2000 : itemId == '3' ? 3000 : itemId == '4' ? 2500 : itemId == '5' ? 4000 : itemId == '6' ? 6000 : 5000;
        buyBtn.disabled = GameData.totalScore < price;
    });
}

function buyItem(itemId) {
    const prices = {
        1: 1000,
        2: 2000,
        3: 3000,
        4: 2500,
        5: 4000,
        6: 6000,
        7: 5000
    };
    const price = prices[itemId];
    if (GameData.totalScore >= price) {
        GameData.totalScore -= price;
        switch (itemId) {
            case '1':
                GameData.maxHealth += 20;
                break;
            case '2':
                GameData.damageMultiplier *= 1.25;
                break;
            case '3':
                GameData.maxAmmo = 60;
                break;
            case '4':
                GameData.reloadTime *= 0.5;
                break;
            case '5':
                GameData.movementSpeedMultiplier *= 1.3;
                break;
            case '6':
                GameData.damageReduction *= 0.7;
                break;
            case '7':
                GameData.healthRegen = 1;
                break;
        }
        GameData.save();
        GameData.updateUI();
        updateShopUI();
    }
}

function updateLeaderboardUI() {
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = '';
    window.ysdk.getLeaderboards().then(lb => {
        lb.getLeaderboardEntries('zombieShooterLeaderboard', { quantityTop: 10 }).then(res => {
            res.entries.forEach(entry => {
                const div = document.createElement('div');
                div.className = 'leaderboard-entry';
                div.innerHTML = `<span>${entry.player.publicName || 'Аноним'}</span>: ${entry.score} очков`;
                leaderboardList.appendChild(div);
            });
        });
    });
}

window.addEventListener('resize', () => {
    const game = document.querySelector('canvas').parentNode.__vue__ || { camera: this.camera, renderer: this.renderer };
    if (game.camera) {
        game.camera.aspect = window.innerWidth / window.innerHeight;
        game.camera.updateProjectionMatrix();
        game.renderer.setSize(window.innerWidth, window.innerHeight);
    }
});
