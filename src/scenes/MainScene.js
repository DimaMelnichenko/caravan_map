export default class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.caravans = [];
        this.cities = [];
        this.selectedCity = null;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.cityScale = 0.3;
        this.carvanScale = 0.1;
        this.isEditorMode = false;
    }
    
    create() {
        // Добавление карты
        this.map = this.add.image(0, 0, 'map')
            .setOrigin(0)
            .setScale(1.5);
        
        // Сохранение данных маршрутов
        this.routesData = this.cache.json.get('routes');
        
        // Настройка камеры
        this.cameras.main.setBounds(0, 0, this.map.width * 1.5, this.map.height * 1.5);
        this.cameras.main.setZoom(2.2);
        this.cameras.main.centerOn(this.map.width * 0.75, this.map.height * 0.75);
        
        // Включение зума и панорамирования
        this.setupCameraControls();
        
        // Создание городов
        this.createCities(this.routesData.cities);
        
        // Создание караванов
        this.createCaravans(this.routesData.routes);
        
        // Звуки
        this.ambientSound = this.sound.add('ambient', {
            volume: window.gameVolume * 0.3,
            loop: true
        });
        this.ambientSound.play();

        // Переключение режима редактора
        document.getElementById('toggle-editor-btn').onclick = () => {
            this.isEditorMode = !this.isEditorMode;
            const panel = document.getElementById('editor-panel');
            const btn = document.getElementById('toggle-editor-btn');
            
            panel.style.display = this.isEditorMode ? 'block' : 'none';
            
            if (this.isEditorMode) {
                btn.innerText = '🏰 Выйти из режима мастера';
                btn.style.background = '#2a4f85';
                
                // Если город уже выделен — сразу загружаем его в редактор
                if (this.selectedCity) {
                    this.openEditor(this.selectedCity.data);
                }
            } else {
                btn.innerText = '🛠️ Режим Мастера';
                btn.style.background = '#4a6fa5';
            }
        };

        // Сохранение города
        document.getElementById('save-city-btn').onclick = () => this.saveCityData();
        
        // Автовыбор первого города для демонстрации
        setTimeout(() => {
            if (this.cities.length > 0) {
                this.selectCity(this.cities[0].data);
            }
        }, 1000);
    }
    
    setupCameraControls() {
        // Прокрутка для зума (исправленный вариант)
        this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY, deltaZ) => {
            // Сохраняем точку под курсором до зума
            const worldPointBefore = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            
            const zoom = this.cameras.main.zoom;
            const newZoom = deltaY > 0 ? zoom * 0.95 : zoom * 1.05;
            const clampedZoom = Phaser.Math.Clamp(newZoom, 0.3, 3);
            
            // Применяем зум
            this.cameras.main.zoom = clampedZoom;
            
            // Получаем точку под курсором после зума
            const worldPointAfter = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            
            // Корректируем положение камеры для зума к точке под курсором
            this.cameras.main.scrollX += (worldPointAfter.x - worldPointBefore.x);
            this.cameras.main.scrollY += (worldPointAfter.y - worldPointBefore.y);
            
            return false;
        });
        
        // Панорамирование карты
        this.setupDragPanning();
    }
    
    setupDragPanning() {
        // Для перетаскивания используем событие pointerdown на самой сцене
        this.input.on('pointerdown', (pointer) => {
            if (pointer.leftButtonDown()) {
                const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
                const cityClicked = this.checkCityClick(pointer.x, pointer.y);

                if (this.isEditorMode && !cityClicked) {
                    // СОЗДАНИЕ НОВОГО ГОРОДА
                    this.createNewCity(worldPoint.x, worldPoint.y);
                } else if (!cityClicked) {
                    // Обычное перетаскивание
                    this.isDragging = true;
                    this.dragStart = {
                        x: pointer.x, y: pointer.y,
                        scrollX: this.cameras.main.scrollX, scrollY: this.cameras.main.scrollY
                    };
                    this.input.setDefaultCursor('grabbing');
                }
            }
        });
        
        // Перемещение мыши с зажатой кнопкой
        this.input.on('pointermove', (pointer) => {
            if (this.isDragging && pointer.leftButtonDown()) {
                // Рассчитываем смещение
                const deltaX = (this.dragStart.x - pointer.x) / this.cameras.main.zoom;
                const deltaY = (this.dragStart.y - pointer.y) / this.cameras.main.zoom;
                
                // Перемещаем камеру
                this.cameras.main.scrollX = this.dragStart.scrollX + deltaX;
                this.cameras.main.scrollY = this.dragStart.scrollY + deltaY;
            }
        });
        
        // Отпускание кнопки мыши
        this.input.on('pointerup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.input.setDefaultCursor('default');
            }
        });
        
        // Также обрабатываем выход указателя за пределы холста
        this.input.on('gameout', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.input.setDefaultCursor('default');
            }
        });
    }

    createNewCity(x, y) {
        const newId = this.routesData.cities.length > 0 
            ? Math.max(...this.routesData.cities.map(c => c.id)) + 1 
            : 1;

        const newCity = {
            id: newId,
            name: "Новый город",
            x: Math.round(x),
            y: Math.round(y),
            goods: [],
            storage: "0 единиц",
            population: 100,
            description: "Новое поселение"
        };

        this.routesData.cities.push(newCity);
        this.refreshMap(); // Метод для перерисовки всех городов
        this.openEditor(newCity);
    }

    openEditor(cityData) {
        // Показываем панель, если она вдруг была скрыта
        document.getElementById('editor-panel').style.display = 'block';

        // Заполняем поля данными из объекта города
        document.getElementById('edit-city-id').value = cityData.id;
        document.getElementById('edit-city-name').value = cityData.name;
        document.getElementById('edit-city-population').value = cityData.population || 0;
        document.getElementById('edit-city-desc').value = cityData.description || '';
        
        // Преобразуем массив товаров обратно в строку для редактирования
        document.getElementById('edit-city-goods').value = (cityData.goods || []).join(', ');

        // Добавим легкий визуальный эффект «мигания» панели, чтобы было ясно, что данные сменились
        const panel = document.getElementById('editor-panel');
        panel.style.borderColor = '#00FF00';
        setTimeout(() => { panel.style.borderColor = '#4a6fa5'; }, 300);
    }

    async saveCityData() {
        const id = parseInt(document.getElementById('edit-city-id').value);
        const cityIndex = this.routesData.cities.findIndex(c => c.id === id);
        
        if (cityIndex !== -1) {
            this.routesData.cities[cityIndex].name = document.getElementById('edit-city-name').value;
            this.routesData.cities[cityIndex].population = parseInt(document.getElementById('edit-city-population').value) || 0;
            this.routesData.cities[cityIndex].description = document.getElementById('edit-city-desc').value;
            this.routesData.cities[cityIndex].goods = document.getElementById('edit-city-goods').value.split(',').map(s => s.trim());

            // ОТПРАВКА НА СЕРВЕР
            try {
                const response = await fetch('http://localhost:8080/api/save', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(this.routesData)
                });
                
                if (response.ok) {
                    alert('Свиток обновлен и запечатан!');
                    this.refreshMap();
                }
            } catch (err) {
                console.error('Ошибка сохранения:', err);
                alert('Магия не сработала. Сервер запущен?');
            }
        }
    }

    refreshMap() {
        // Очищаем текущие спрайты и тексты городов
        this.cities.forEach(c => {
            c.sprite.destroy();
            c.text.destroy();
        });
        this.cities = [];
        // Пересоздаем из обновленных данных
        this.createCities(this.routesData.cities);
    }
    
    checkCityClick(screenX, screenY) {
        // Преобразуем экранные координаты в мировые
        const worldPoint = this.cameras.main.getWorldPoint(screenX, screenY);
        
        // Проверяем каждый город
        for (const city of this.cities) {
            const sprite = city.sprite;
            const bounds = sprite.getBounds();
            
            // Учитываем масштаб спрайта
            const scale = sprite.scaleX;
            const width = sprite.width * scale;
            const height = sprite.height * scale;
            
            // Создаем прямоугольник с учетом масштаба
            const cityBounds = new Phaser.Geom.Rectangle(
                sprite.x - width / 2,
                sprite.y - height / 2,
                width,
                height
            );
            
            // Проверяем, попал ли клик в город
            if (cityBounds.contains(worldPoint.x, worldPoint.y)) {
                return true;
            }
        }
        
        return false;
    }
    
    // Остальные методы остаются без изменений...
    createCities(cityData) {
        cityData.forEach(city => {
            // Создание спрайта города
            const citySprite = this.add.sprite(city.x, city.y, 'city')
                .setInteractive({ useHandCursor: true })
                .setScale(this.cityScale)
                .setData('cityId', city.id);
            
            // Анимация при наведении
            citySprite.on('pointerover', () => {
                this.tweens.add({
                    targets: citySprite,
                    scale: this.cityScale + 0.05,
                    duration: 200
                });
                if (this.selectedCity?.data.id !== city.id) {
                    citySprite.postFX.addGlow(0x4a6fa5, 2); // Слабое свечение
                }
            });
            
            citySprite.on('pointerout', () => {
                if (this.selectedCity?.data.id !== city.id) {
                    this.tweens.add({
                        targets: citySprite,
                        scale: this.cityScale,
                        duration: 200
                    });
                    citySprite.postFX.clear(); // Убираем свечение при наведении
                }
            });
            
            // Обработчик клика
            citySprite.on('pointerdown', (pointer) => {
                // Останавливаем распространение события, чтобы не срабатывало перетаскивание
                pointer.event.stopPropagation();
                this.selectCity(city);
                this.sound.play('city_click', { volume: window.gameVolume });
            });
            
            // Текст с названием города
            const cityName = this.add.text(city.x, city.y - 30, city.name, {
                font: 'bold 18px Arial',
                fill: '#aa7fFF',
                stroke: '#000000',
                strokeThickness: 4,
                shadow: {
                    offsetX: 2,
                    offsetY: 2,
                    color: '#000000',
                    blur: 2,
                    fill: true
                }
            }).setOrigin(0.5).setDepth(100);
            
            this.cities.push({
                sprite: citySprite,
                text: cityName,
                data: city
            });
        });
    }
    
    selectCity(cityData) {
        console.log('Выбран город:', cityData.name);
        
        // 1. Сброс предыдущего выделения
        if (this.selectedCity) {
            // Возвращаем масштаб
            this.tweens.add({
                targets: this.selectedCity.sprite,
                scale: this.cityScale,
                duration: 200
            });
            
            // Убираем все спецэффекты (свечение)
            this.selectedCity.sprite.postFX.clear();
            // Останавливаем анимацию пульсации, если она была привязана к спрайту
            this.tweens.killTweensOf(this.selectedCity.sprite.postFX); 
        }
        
        // 2. Поиск нового города
        const city = this.cities.find(c => c.data.id === cityData.id);
        if (!city) return;
        
        this.selectedCity = city;

        // 3. Визуальные эффекты для выбранного города
        
        // Увеличиваем масштаб
        this.tweens.add({
            targets: city.sprite,
            scale: this.cityScale + 0.15,
            duration: 300,
            ease: 'Back.easeOut'
        });

        // ДОБАВЛЯЕМ СИНЕВАТОЕ СВЕЧЕНИЕ (Glow)
        // аргументы: (цвет, внешняя сила, внутренняя сила, использование шейдера, шаг, итерации)
        const glowEffect = city.sprite.postFX.addGlow(0x4a6fa5, 4, 0, false, 0.1, 12);
        
        // 4. Анимация пульсации свечения
        this.tweens.add({
            targets: glowEffect,
            outerStrength: 10, // Сила свечения будет меняться от 4 до 10
            duration: 1000,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
        });

        // Обновление DOM-панели
        this.updateDomInfoPanel(city.data);
        
        // Подсветка маршрутов
        this.highlightRoutes(city.data.id);

        // Если мы в режиме редактора — заполняем правую панель
        if (this.isEditorMode) {
            this.openEditor(city.data);
        }
        
        // Плавное перемещение камеры
        this.cameras.main.pan(city.sprite.x, city.sprite.y, 800, 'Power2');
    }
    
    updateDomInfoPanel(cityData) {
        const contentElement = document.getElementById('city-info-content');
        if (!contentElement) {
            console.error('Элемент #city-info-content не найден');
            return;
        }
        
        // Получаем маршруты из/в этот город
        const connectedRoutes = this.routesData.routes.filter(route => 
            route.from === cityData.id || route.to === cityData.id
        );
        
        // Формируем HTML для товаров
        const goodsHTML = cityData.goods && cityData.goods.length > 0
            ? `<div class="goods-list">${cityData.goods.map(good => 
                `<span class="good-tag">${good}</span>`).join('')}</div>`
            : '<span>Нет товаров</span>';
        
        // Формируем HTML для маршрутов
        const routesHTML = connectedRoutes.length > 0
            ? connectedRoutes.map(route => {
                const targetCityId = route.from === cityData.id ? route.to : route.from;
                const targetCity = this.routesData.cities.find(c => c.id === targetCityId);
                const direction = route.from === cityData.id ? '→' : '←';
                
                return `
                    <div class="route-item">
                        <strong>${direction} ${targetCity?.name || 'Неизвестный город'}</strong><br>
                        <small>${route.name || 'Без названия'}</small><br>
                        <small>Дистанция: ${route.distance || 0} км, Длительность: ${route.duration || 0} дней</small>
                    </div>
                `;
            }).join('')
            : '<p>Нет активных маршрутов</p>';

        const populationFormatted = typeof cityData.population === 'number' 
            ? cityData.population.toLocaleString('ru-RU') + ' жителей'
            : (cityData.population || 'Нет данных');
        
        // Обновляем содержимое DOM-элемента
        contentElement.innerHTML = `
            <div class="city-property">Город: <strong>${cityData.name}</strong></div>
            <div class="city-property">Описание: ${cityData.description || 'Нет описания'}</div>
            <div class="city-property">Население: ${populationFormatted}</div>
            <div class="city-property">Товары: ${goodsHTML}</div>
            <div class="city-property">Склад: ${cityData.storage || '0'} единиц</div>
            <div class="city-property">Активные маршруты (${connectedRoutes.length}):</div>
            ${routesHTML}
        `;
        
        // Добавляем эффект выделения панели
        const panel = document.getElementById('city-info-panel');
        panel.style.borderColor = '#00FF00';
        panel.style.boxShadow = '0 0 15px rgba(0, 255, 0, 0.3)';
        
        // Через секунду убираем эффект
        setTimeout(() => {
            panel.style.borderColor = '#4a6fa5';
            panel.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.5)';
        }, 1000);
    }
    
    createCaravans(routes) {
        routes.forEach(route => {
            const startCity = this.cities.find(c => c.data.id === route.from);
            const endCity = this.cities.find(c => c.data.id === route.to);
            
            if (startCity && endCity) {
                // Создание каравана
                const caravan = this.add.sprite(
                    startCity.sprite.x,
                    startCity.sprite.y,
                    'caravan'
                ).setScale(this.carvanScale).setDepth(5);
                
                // Анимация движения
                const duration = (route.duration || 30) * 1000 / window.gameSpeed;
                
                this.tweens.add({
                    targets: caravan,
                    x: endCity.sprite.x,
                    y: endCity.sprite.y,
                    duration: duration,
                    ease: 'Sine.easeInOut',
                    onStart: () => {
                        caravan.angle = this.getAngle(
                            startCity.sprite.x, startCity.sprite.y,
                            endCity.sprite.x, endCity.sprite.y
                        );
                    },
                    onComplete: () => {
                        // Разворот и движение обратно
                        this.tweens.add({
                            targets: caravan,
                            x: startCity.sprite.x,
                            y: startCity.sprite.y,
                            duration: duration,
                            ease: 'Sine.easeInOut',
                            onStart: () => {
                                caravan.angle += 180;
                            },
                            onComplete: () => {
                                caravan.angle = this.getAngle(
                                    startCity.sprite.x, startCity.sprite.y,
                                    endCity.sprite.x, endCity.sprite.y
                                );
                            }
                        });
                    },
                    repeat: -1,
                    yoyo: false
                });
                
                // Добавляем в массив
                this.caravans.push({
                    sprite: caravan,
                    route: route
                });
            }
        });
    }
    
    getAngle(x1, y1, x2, y2) {
        const angle = Phaser.Math.RadToDeg(Math.atan2(y2 - y1, x2 - x1));
        return angle;
    }
    
    highlightRoutes(cityId) {
        // Удаляем старые линии
        this.children.list.forEach(child => {
            if (child.type === 'Graphics') {
                child.destroy();
            }
        });
        
        // Рисуем новые линии для связанных маршрутов
        const connectedRoutes = this.routesData.routes.filter(route => 
            route.from === cityId || route.to === cityId
        );
        
        connectedRoutes.forEach(route => {
            const startCity = this.cities.find(c => c.data.id === route.from);
            const endCity = this.cities.find(c => c.data.id === route.to);
            
            if (startCity && endCity) {
                const line = this.add.graphics();
                const isSelectedRoute = route.from === cityId || route.to === cityId;
                
                line.lineStyle(4, isSelectedRoute ? 0x00FF00 : 0xFF9900, 0.6);
                line.lineBetween(
                    startCity.sprite.x,
                    startCity.sprite.y,
                    endCity.sprite.x,
                    endCity.sprite.y
                );
                
                // Добавляем стрелочку направления
                this.addArrow(line, startCity.sprite.x, startCity.sprite.y, 
                            endCity.sprite.x, endCity.sprite.y, 
                            isSelectedRoute ? 0x00FF00 : 0xFF9900);
            }
        });
    }
    
    addArrow(graphics, x1, y1, x2, y2, color) {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const length = 15;
        const headLength = 10;
        const headAngle = Math.PI / 6;
        
        // Точка на 80% пути для стрелки
        const arrowX = x1 + (x2 - x1) * 0.8;
        const arrowY = y1 + (y2 - y1) * 0.8;
        
        // Рисуем стрелку
        graphics.fillStyle(color, 1);
        graphics.lineStyle(2, color, 1);
        
        graphics.beginPath();
        graphics.moveTo(arrowX, arrowY);
        graphics.lineTo(
            arrowX - headLength * Math.cos(angle - headAngle),
            arrowY - headLength * Math.sin(angle - headAngle)
        );
        graphics.lineTo(
            arrowX - headLength * Math.cos(angle + headAngle),
            arrowY - headLength * Math.sin(angle + headAngle)
        );
        graphics.closePath();
        graphics.fill();
    }
    
    update() {
        // Обновление звуков
        if (this.ambientSound) {
            this.ambientSound.setVolume(window.isMuted ? 0 : window.gameVolume * 0.3);
        }
        
        // Обновление скорости анимаций
        if (window.gameSpeed !== this.lastGameSpeed) {
            this.caravans.forEach(caravan => {
                caravan.sprite.activeTweens?.forEach(tween => {
                    tween.timeScale = window.gameSpeed;
                });
            });
            this.lastGameSpeed = window.gameSpeed;
        }
    }
}