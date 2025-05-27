// Сохранение данных
const GameData = {
    totalScore: 0,
    maxHealth: 100,
    damageMultiplier: 1,
    missions: {
        1: { killed: 0, completed: false },
        2: { score: 0, completed: false },
        3: { time: 0, completed: false },
        4: { completed: false }, // Telegram
        5: { completed: false }  // Share
    },
    
    save() {
        localStorage.setItem('zombieShooterData', JSON.stringify({
            totalScore: this.totalScore,
            maxHealth: this.maxHealth,
            damageMultiplier: this.damageMultiplier,
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
        // Автоматически запускаем полноэкранный режим
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
        
        // Устанавливаем размер на весь экран
        this.renderer.setSize(window.screen.width, window.screen.height);
        this.renderer.setClearColor(0x000000);
        
        // Обновляем пропорции камеры
        this.camera.aspect = window.screen.width / window.screen.height;
        this.camera.updateProjectionMatrix();
        
        // Загрузка звука выстрела
        this.shootSound = new Audio('pistolet_zvuk.mp3');
        
        // Загрузка текстуры земли
        const textureLoader = new THREE.TextureLoader();
        const textureUrl = window.location.origin + '/texture.png';
        console.log('Попытка загрузки текстуры:', textureUrl);
        
        this.groundTexture = textureLoader.load(
            textureUrl, 
            // Функция успешной загрузки
            (texture) => {
                console.log('Текстура успешно загружена');
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(4, 4);
                // Обновляем материал пола после загрузки текстуры
                if (this.floor) {
                    this.floor.material.map = texture;
                    this.floor.material.needsUpdate = true;
                    console.log('Текстура применена к полу');
                }
            },
            // Функция прогресса загрузки
            (progress) => {
                const percent = (progress.loaded / progress.total * 100).toFixed(2);
                console.log('Загрузка текстуры:', percent + '%');
            },
            // Функция ошибки
            (error) => {
                console.error('Ошибка загрузки текстуры:', error);
                console.log('Попытка загрузки из альтернативного пути...');
                // Пробуем загрузить из альтернативного пути
                const altTextureUrl = './texture.png';
                textureLoader.load(
                    altTextureUrl,
                    (texture) => {
                        console.log('Текстура успешно загружена из альтернативного пути');
                        texture.wrapS = THREE.RepeatWrapping;
                        texture.wrapT = THREE.RepeatWrapping;
                        texture.repeat.set(4, 4);
                        if (this.floor) {
                            this.floor.material.map = texture;
                            this.floor.material.needsUpdate = true;
                            console.log('Текстура применена к полу');
                        }
                    },
                    (progress) => {
                        const percent = (progress.loaded / progress.total * 100).toFixed(2);
                        console.log('Загрузка альтернативной текстуры:', percent + '%');
                    },
                    (error) => {
                        console.error('Ошибка загрузки альтернативной текстуры:', error);
                        // Устанавливаем базовый цвет при ошибке загрузки
                        if (this.floor) {
                            this.floor.material.color.setHex(0x4a7023);
                            this.floor.material.needsUpdate = true;
                            console.log('Установлен базовый цвет пола');
                        }
                    }
                );
            }
        );
        
        // Игровые переменные
        this.score = 0;
        this.health = GameData.maxHealth;
        this.ammo = 30;
        this.isGameOver = false;
        this.zombies = [];
        this.bullets = [];
        this.gameTime = 0;
        this.zombiesKilled = 0;
        
        // Управление
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.canShoot = true;
        this.movementSpeed = 0;
        
        // Настройка сцены
        this.setupScene();
        this.setupLights();
        this.setupPlayer();
        this.setupControls();
        
        // Запуск игры
        this.lastTime = performance.now();
        this.animate();
        this.spawnZombies();
    }
    
    setupScene() {
        // Создание неба
        const skyGeometry = new THREE.SphereGeometry(50, 32, 32);
        const skyMaterial = new THREE.MeshBasicMaterial({
            color: 0x87CEEB,
            side: THREE.BackSide
        });
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        this.scene.add(sky);

        // Создание пола с текстурой
        const floorGeometry = new THREE.PlaneGeometry(100, 100);
        const floorMaterial = new THREE.MeshStandardMaterial({
            map: this.groundTexture,
            roughness: 0.8,
            color: 0x666666 // Цвет по умолчанию, пока текстура не загрузится
        });
        this.floor = new THREE.Mesh(floorGeometry, floorMaterial);
        this.floor.rotation.x = -Math.PI / 2;
        this.scene.add(this.floor);
        
        // Создание ландшафта (темно-зеленые прямоугольники)
        const terrainGeometry = new THREE.PlaneGeometry(20, 20);
        const terrainMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a472a,
            roughness: 0.9
        });
        
        // Первая база
        const base1 = new THREE.Mesh(terrainGeometry, terrainMaterial);
        base1.position.set(-15, 0.1, -15);
        base1.rotation.x = -Math.PI / 2;
        this.scene.add(base1);
        
        // Вторая база
        const base2 = new THREE.Mesh(terrainGeometry, terrainMaterial);
        base2.position.set(15, 0.1, 15);
        base2.rotation.x = -Math.PI / 2;
        this.scene.add(base2);

        // Добавление деревьев
        for (let i = 0; i < 20; i++) {
            // Создаем группу для дерева
            const tree = new THREE.Group();
            
            // Создаем ствол
            const trunkGeometry = new THREE.CylinderGeometry(0.1, 0.15, 2, 8);
            const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4a2f10 });
            const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
            trunk.position.y = 1;
            tree.add(trunk);
            
            // Создаем крону (несколько слоев)
            const crownLayers = 3;
            for (let j = 0; j < crownLayers; j++) {
                const crownGeometry = new THREE.ConeGeometry(0.8 - j * 0.2, 1.5, 8);
                const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x2d5a27 });
                const crown = new THREE.Mesh(crownGeometry, crownMaterial);
                crown.position.y = 2 + j * 0.8;
                tree.add(crown);
            }
            
            // Случайное размещение деревьев
            const angle = Math.random() * Math.PI * 2;
            const distance = 5 + Math.random() * 15;
            tree.position.x = Math.cos(angle) * distance;
            tree.position.z = Math.sin(angle) * distance;
            
            // Добавляем случайный поворот для разнообразия
            tree.rotation.y = Math.random() * Math.PI;
            
            this.scene.add(tree);
            this.trees = this.trees || [];
            this.trees.push(tree);
        }

        // Добавление камней
        for (let i = 0; i < 15; i++) {
            const rockGeometry = new THREE.DodecahedronGeometry(0.5);
            const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
            const rock = new THREE.Mesh(rockGeometry, rockMaterial);
            
            // Случайное размещение камней
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
        // Усиленное фоновое освещение для дневного эффекта
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        
        // Основной солнечный свет
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
        directionalLight.position.set(5, 10, 5);
        this.scene.add(directionalLight);
        
        // Дополнительный свет для лучшего освещения
        const secondaryLight = new THREE.DirectionalLight(0xffffff, 0.5);
        secondaryLight.position.set(-5, 8, -5);
        this.scene.add(secondaryLight);
    }
    
    setupPlayer() {
        this.camera.position.y = 1.6; // Высота глаз
        this.camera.position.z = 5;
        
        // Создание оружия
        const gunGeometry = new THREE.BoxGeometry(0.1, 0.1, 0.3);
        const gunMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
        this.gun = new THREE.Mesh(gunGeometry, gunMaterial);
        
        // Позиционирование оружия относительно камеры
        this.gun.position.set(0.3, -0.2, -0.5);
        this.camera.add(this.gun);
        this.scene.add(this.camera);
    }
    
    setupControls() {
        // Настройка джойстика
        const joystick = document.getElementById('joystick');
        const joystickHead = document.getElementById('joystick-head');
        let isDragging = false;
        let startX, startY;
        
        // Оптимизированная обработка джойстика
        const handleJoystickMove = (e) => {
            if (!isDragging) return;
            
            const touch = e.touches[0];
            const rect = joystick.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            
            const deltaX = touch.clientX - centerX;
            const deltaY = touch.clientY - centerY;
            
            // Ограничение движения джойстика
            const maxDistance = 35;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            const normalizedDistance = Math.min(distance, maxDistance);
            const scale = normalizedDistance / distance || 0;
            
            const moveX = deltaX * scale;
            const moveY = deltaY * scale;
            
            joystickHead.style.transform = `translate(${moveX}px, ${moveY}px)`;
            
            // Плавное обновление движения игрока
            const deadzone = 5; // Мертвая зона для предотвращения случайных движений
            this.moveForward = moveY < -deadzone;
            this.moveBackward = moveY > deadzone;
            this.moveLeft = moveX < -deadzone;
            this.moveRight = moveX > deadzone;
            
            // Нормализация скорости движения
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
        
        // Кнопка стрельбы с оптимизацией
        const shootBtn = document.getElementById('shoot-btn');
        shootBtn.addEventListener('touchstart', () => this.shoot(), { passive: true });
        
        // Кнопка перезарядки с оптимизацией
        const reloadBtn = document.getElementById('reload-btn');
        reloadBtn.addEventListener('touchstart', () => this.reload(), { passive: true });

        // Оптимизированное управление поворотом головы
        let touchStartX = 0;
        let isRotating = false;
        let lastRotationTime = 0;
        const rotationInterval = 16; // ~60fps

        const handleRotation = (e) => {
            if (!isRotating) return;
            
            const currentTime = performance.now();
            if (currentTime - lastRotationTime < rotationInterval) return;
            
            const touch = e.touches[0];
            const deltaX = touch.clientX - touchStartX;
            
            // Плавный поворот с ограничением скорости
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
        
        // Воспроизведение звука выстрела
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
        if (this.ammo === 30) return;
        
        // Анимация перезарядки
        setTimeout(() => {
            this.ammo = 30;
            document.getElementById('ammo-count').textContent = this.ammo;
            // this.playSound('reload');
        }, 1500);
    }
    
    spawnZombie() {
        // Создание зомби
        const zombieGeometry = new THREE.BoxGeometry(0.6, 1.8, 0.3);
        const zombieMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
        const zombie = new THREE.Mesh(zombieGeometry, zombieMaterial);
        
        // Случайная позиция появления
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
                // Уменьшаем урон от зомби
                this.health -= 0.1;
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
                        document.getElementById('score-count').textContent = this.score;
                        
                        // Обновление прогресса заданий
                        if (!GameData.missions[1].completed) {
                            GameData.missions[1].killed = this.zombiesKilled;
                            if (this.zombiesKilled >= 10) {
                                this.completeMission(1);
                            }
                        }
                        
                        if (!GameData.missions[2].completed && this.score >= 1000) {
                            this.completeMission(2);
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
        const baseSpeed = 0.05;
        const direction = new THREE.Vector3();
        
        // Сохраняем текущую позицию
        const oldPosition = this.camera.position.clone();
        
        // Получаем направление взгляда камеры
        this.camera.getWorldDirection(direction);
        // Получаем вектор вправо от направления взгляда
        const right = new THREE.Vector3();
        right.crossVectors(direction, new THREE.Vector3(0, 1, 0));
        
        // Применяем скорость движения с учетом нормализации
        const currentSpeed = baseSpeed * (this.movementSpeed || 1);
        
        // Обновляем позицию с учетом направления камеры
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
        
        // Проверяем коллизии с деревьями
        if (this.trees) {
            for (const tree of this.trees) {
                const distance = this.camera.position.distanceTo(tree.position);
                if (distance < 1.5) {
                    this.camera.position.copy(oldPosition);
                    break;
                }
            }
        }
        
        // Проверяем коллизии с камнями
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
    
    completeMission(missionId) {
        const rewards = {
            1: 500,
            2: 1000,
            3: 2000
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
        
        // Обновление времени для задания выживания
        if (!GameData.missions[3].completed) {
            GameData.missions[3].time = this.gameTime;
            if (this.gameTime >= 300) { // 5 минут
                this.completeMission(3);
            }
            
            // Обновление прогресса на UI
            const minutes = Math.floor(this.gameTime / 60);
            const seconds = Math.floor(this.gameTime % 60);
            const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}/5:00`;
            document.querySelector('.mission[data-id="3"] .progress').textContent = timeString;
        }
        
        this.updateMovement();
        this.updateZombies();
        this.updateBullets();
        
        this.renderer.render(this.scene, this.camera);
    }
    
    gameOver() {
        this.isGameOver = true;
        
        // Добавляем очки в общий баланс
        GameData.totalScore += this.score;
        GameData.save();
        
        document.getElementById('game-over').classList.add('active');
        document.getElementById('final-score').textContent = this.score;
        document.getElementById('completed-missions').textContent = 
            Object.values(GameData.missions).filter(m => m.completed).length;
    }
}

// Инициализация игры
window.addEventListener('load', () => {
    GameData.load();
    
    const menu = document.getElementById('menu');
    const missions = document.getElementById('missions');
    const shop = document.getElementById('shop');
    
    menu.classList.add('active');
    
    // Обработчики социальных заданий
    document.querySelectorAll('.social-claim').forEach(btn => {
        const missionId = btn.closest('.mission').dataset.id;
        if (GameData.missions[missionId].completed) {
            btn.disabled = true;
            btn.textContent = 'Получено';
        }
        
        btn.addEventListener('click', () => {
            if (missionId === '4') {
                // Подтверждение подписки на Telegram
                if (confirm('Вы подписались на канал @tonbakuhub?')) {
                    completeSocialMission(4, 1500);
                }
            } else if (missionId === '5') {
                // Награда за шаринг
                completeSocialMission(5, 1000);
            }
        });
    });
    
    // Кнопка шаринга
    document.querySelector('.share-btn').addEventListener('click', () => {
        if (navigator.share) {
            navigator.share({
                title: 'Zombie Shooter 3D',
                text: 'Попробуй крутой шутер с зомби! Я уже набрал ' + GameData.totalScore + ' очков!',
                url: window.location.href
            });
        } else {
            // Запасной вариант для браузеров без API шаринга
            const shareText = `Zombie Shooter 3D - Попробуй крутой шутер с зомби! Я уже набрал ${GameData.totalScore} очков!\n${window.location.href}`;
            navigator.clipboard.writeText(shareText)
                .then(() => alert('Ссылка скопирована в буфер обмена!'))
                .catch(() => alert('Не удалось скопировать ссылку'));
        }
    });
    
    // Обработчики кнопок меню
    document.getElementById('start-btn').addEventListener('click', () => {
        // Запускаем полноэкранный режим
        document.documentElement.requestFullscreen().then(() => {
            menu.classList.remove('active');
            new ZombieShooter();
        }).catch(err => {
            console.error('Ошибка включения полноэкранного режима:', err);
            // Если не удалось включить полноэкранный режим, все равно запускаем игру
            menu.classList.remove('active');
            new ZombieShooter();
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
    
    document.getElementById('missions-back').addEventListener('click', () => {
        missions.classList.remove('active');
        menu.classList.add('active');
    });
    
    document.getElementById('shop-back').addEventListener('click', () => {
        shop.classList.remove('active');
        menu.classList.add('active');
    });
    
    document.getElementById('menu-btn').addEventListener('click', () => {
        document.getElementById('game-over').classList.remove('active');
        menu.classList.add('active');
    });
    
    // Обработчики покупок в магазине
    document.querySelectorAll('.buy-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const itemId = e.target.closest('.shop-item').dataset.id;
            buyItem(itemId);
        });
    });
});

function completeSocialMission(missionId, reward) {
    if (!GameData.missions[missionId].completed) {
        GameData.missions[missionId].completed = true;
        GameData.totalScore += reward;
        GameData.save();
        GameData.updateUI();
        
        const btn = document.querySelector(`.mission[data-id="${missionId}"] .social-claim`);
        btn.disabled = true;
        btn.textContent = 'Получено';
        
        alert(`Поздравляем! Вы получили ${reward} очков!`);
    }
}

function updateMissionsUI() {
    Object.entries(GameData.missions).forEach(([id, mission]) => {
        const missionElement = document.querySelector(`.mission[data-id="${id}"]`);
        if (missionElement) {
            const claimBtn = missionElement.querySelector('.claim-btn');
            
            if (id <= 3) { // Игровые задания
                const progressElement = missionElement.querySelector('.progress');
                switch (id) {
                    case '1':
                        progressElement.textContent = `${mission.killed}/10`;
                        break;
                    case '2':
                        progressElement.textContent = `${mission.score}/1000`;
                        break;
                    case '3':
                        const minutes = Math.floor(mission.time / 60);
                        const seconds = Math.floor(mission.time % 60);
                        progressElement.textContent = 
                            `${minutes}:${seconds.toString().padStart(2, '0')}/5:00`;
                        break;
                }
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
        const price = itemId === '1' ? 1000 : 2000;
        
        buyBtn.disabled = GameData.totalScore < price;
    });
}

function buyItem(itemId) {
    const prices = {
        1: 1000,
        2: 2000
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
        }
        
        GameData.save();
        GameData.updateUI();
        updateShopUI();
    }
}

// Обработка изменения размера окна
window.addEventListener('resize', () => {
    const game = document.querySelector('canvas').parentNode.__vue__;
    if (!game) return;
    
    game.camera.aspect = window.innerWidth / window.innerHeight;
    game.camera.updateProjectionMatrix();
    game.renderer.setSize(window.innerWidth, window.innerHeight);
}); 