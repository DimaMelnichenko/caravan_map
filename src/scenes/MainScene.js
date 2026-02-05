export default class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.caravans = [];
        this.cities = [];
        this.selectedCity = null;
        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.cityScale = 0.2;
        this.carvanScale = 0.05;
        this.isEditorMode = false;
        this.selectedRoute = null;
        this.editHandles = []; // Массив визуальных точек-маркеров
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
        this.cameras.main.setZoom(0.8);
        this.cameras.main.centerOn(this.map.width * 0.75, this.map.height * 0.75);
        
        // Включение зума и панорамирования
        this.setupCameraControls();

        // Названия стран
        this.createCountries(this.routesData.countries);
        
        // 1. Создаем города
        this.createCities(this.routesData.cities);
        
        // 2. РИСУЕМ ПУТИ (теперь они видны всегда)
        // Этот метод создает объекты Curve внутри routesData.routes
        this.drawAllRoutes();

        // 3. ЗАПУСКАЕМ ДВИЖЕНИЕ
        // Этот метод использует созданные Curve для запуска спрайтов
        this.createFollowers();
        
        // Звуки
        this.ambientSound = this.sound.add('ambient', {
            volume: window.gameVolume * 0.3,
            loop: true
        });
        this.ambientSound.play();

        this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

        // Переключение режима редактора
        document.getElementById('toggle-editor-btn').onclick = () => {
            this.isEditorMode = !this.isEditorMode;
            const cityPanel = document.getElementById('editor-panel');
            const routePanel = document.getElementById('route-editor-panel'); // Наша панель пути
            const btn = document.getElementById('toggle-editor-btn');
            
            cityPanel.style.display = this.isEditorMode ? 'block' : 'none';
            
            if (this.isEditorMode) {
                btn.innerText = '🏰 Выйти из режима мастера';
                btn.style.background = '#2a4f85';
                if (this.selectedCity) this.openEditor(this.selectedCity.data);
            } else {
                // УБОРКА ПРИ ВЫХОДЕ:
                btn.innerText = '🛠️ Режим Мастера';
                btn.style.background = '#4a6fa5';
                
                // Скрываем панель маршрута
                routePanel.style.display = 'none';
                
                // Удаляем синие точки (ручки)
                this.editHandles.forEach(h => h.destroy());
                this.editHandles = [];
                
                // Сбрасываем выделение маршрута
                this.selectedRoute = null;
                
                // Полная перерисовка, чтобы убрать яркую подсветку
                this.refreshScene();
            }
        };

        // Сохранение города
        document.getElementById('save-city-btn').onclick = () => this.saveCityData();

        window.gameScene = this;

        this.setupDragPanning();   // Панорамирование и создание городов
        this.setupRouteEditing(); // Перетаскивание точек


        document.getElementById('save-route-btn').onclick = () => {
            if (this.selectedRoute) {
                this.selectedRoute.duration = parseInt(document.getElementById('edit-route-duration').value);
                this.selectedRoute.type = document.getElementById('edit-route-type').value;
                this.saveDataToServer(); // Универсальный метод сохранения всего JSON
            }
        };

        // Кнопка удаления маршрута
        document.getElementById('delete-route-btn').onclick = () => {
            if (this.selectedRoute && confirm('Удалить этот путь?')) {
                this.routesData.routes = this.routesData.routes.filter(r => r.id !== this.selectedRoute.id);
                this.selectedRoute = null;
                document.getElementById('route-editor-panel').style.display = 'none';
                this.refreshScene();
                this.saveDataToServer();
            }
        };
        
        // Автовыбор первого города для демонстрации
        setTimeout(() => {
            if (this.cities.length > 0) {
                this.selectCity(this.cities[0].data);
            }
        }, 1000);
    }

    setupRouteEditing() {
        this.input.on('drag', (pointer, gameObject, dragX, dragY) => {
            if (gameObject.getData('type') === 'pathHandle') {
                gameObject.x = dragX;
                gameObject.y = dragY;

                const index = gameObject.getData('index');
                if (this.selectedRoute && this.selectedRoute.points) {
                    this.selectedRoute.points[index] = [Math.round(dragX), Math.round(dragY)];
                    
                    // Просто перерисовываем линии, не перезапуская караваны (для производительности)
                    this.drawAllRoutes(); 
                }
            }
        });

        this.input.on('dragend', (pointer, gameObject) => {
            if (gameObject.getData('type') === 'pathHandle') {
                // А вот когда отпустили точку — пересоздаем караваны, чтобы они поехали по новому пути
                this.refreshScene();
                // И сохраняем автоматически (по желанию) или ждем нажатия кнопки Сохранить
            }
        });
    }

    showRouteHandles(route) {
        // Удаляем старые ручки
        this.editHandles.forEach(h => h.destroy());
        this.editHandles = [];

        if (!route.points) route.points = [];

        route.points.forEach((p, index) => {
            const handle = this.add.circle(p[0], p[1], 8, 0x4a6fa5)
                .setInteractive({ draggable: true, useHandCursor: true })
                .setDepth(20)
                .setData('type', 'pathHandle')
                .setData('index', index);
            
            // Подсветка при наведении
            handle.on('pointerover', () => handle.setFillStyle(0x00ff00));
            handle.on('pointerout', () => handle.setFillStyle(0x4a6fa5));

            this.editHandles.push(handle);
        });
    }

    drawAllRoutes() {
        // 1. Очищаем основную графику
        if (this.routeGraphics) {
            this.routeGraphics.clear();
        } else {
            this.routeGraphics = this.add.graphics().setDepth(2);
        }

        // 2. Очищаем графику подсветки выбранного пути
        if (this.highlightGraphics) {
            this.highlightGraphics.clear();
        } else {
            this.highlightGraphics = this.add.graphics().setDepth(3);
        }
        
        this.routesData.routes.forEach(route => {
            const startCity = this.cities.find(c => c.data.id === route.from).data;
            const endCity = this.cities.find(c => c.data.id === route.to).data;
            
            const allPoints = [new Phaser.Math.Vector2(startCity.x, startCity.y)];
            if (route.points) {
                route.points.forEach(p => allPoints.push(new Phaser.Math.Vector2(p[0], p[1])));
            }
            allPoints.push(new Phaser.Math.Vector2(endCity.x, endCity.y));

            const curve = new Phaser.Curves.Spline(allPoints);
            route.curve = curve;

            const isSelected = this.selectedRoute && this.selectedRoute.id === route.id;
            
            // РИСУЕМ ОБЫЧНУЮ ЛИНИЮ
            const color = (route.type === 'water' ? 0xaaaaff : 0x6b4e31);
            this.routeGraphics.lineStyle(2, color, 0.4);
            
            if (route.type === 'water') {
                const points = curve.getPoints(100);
                for (let i = 0; i < points.length - 1; i += 2) {
                    this.routeGraphics.lineBetween(points[i].x, points[i].y, points[i+1].x, points[i+1].y);
                }
            } else {
                curve.draw(this.routeGraphics);
            }

            // РИСУЕМ ПОДСВЕТКУ ПОВЕРХ, ЕСЛИ МАРШРУТ ВЫБРАН
            if (isSelected) {
                this.highlightGraphics.lineStyle(4, 0x00ff00, 1); // Яркий зеленый
                if (route.type === 'water') {
                    const points = curve.getPoints(100);
                    for (let i = 0; i < points.length - 1; i += 2) {
                        this.highlightGraphics.lineBetween(points[i].x, points[i].y, points[i+1].x, points[i+1].y);
                    }
                } else {
                    curve.draw(this.highlightGraphics);
                }
            }
        });
    }

    createFollowers() {

        if (this.followersSprites) {
            this.followersSprites.forEach(s => s.destroy());
        }
        this.followersSprites = [];

        this.routesData.routes.forEach(route => {
            const numSprites = route.type === 'water' ? 1 : 3; // Кораблей меньше, караванов больше
            const spacing = 1 / numSprites;

            for (let i = 0; i < numSprites; i++) {
                const spriteKey = route.type === 'water' ? 'ship' : 'caravan';
                const sprite = this.add.sprite(0, 0, spriteKey)
                    .setScale(route.type === 'water' ? 0.05 : 0.1)
                    .setDepth(5);

                // Объект-пустышка для анимации прогресса
                const follower = { t: 0, vec: new Phaser.Math.Vector2() };

                const tween = this.tweens.add({
                    targets: follower,
                    t: 1,
                    ease: 'Linear',
                    duration: (route.duration * 1000) / window.gameSpeed,
                    repeat: -1,
                    delay: i * (spacing * 10000), // Распределяем по времени
                    onUpdate: () => {
                        // 1. Получаем точку на кривой по времени t
                        route.curve.getPoint(follower.t, follower.vec);
                        sprite.setPosition(follower.vec.x, follower.vec.y);

                        // 2. Получаем вектор направления (касательную)
                        const tangent = route.curve.getTangent(follower.t);
                        const angle = Phaser.Math.RadToDeg(Math.atan2(tangent.y, tangent.x));
                        
                        // 3. Поворачиваем и фиксим flip
                        sprite.setAngle(angle);
                        if (angle > 90 || angle < -90) {
                            sprite.setFlipY(true);
                        } else {
                            sprite.setFlipY(false);
                        }
                    }
                });

                // Добавляем в список для последующей очистки
                this.caravans.push({
                    sprite: sprite,
                    tween: tween
                });
            }
        });
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
    }
    
    setupDragPanning() {
        this.input.on('pointerdown', (pointer, gameObjects) => {
            const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            
            // 1. Проверяем, есть ли под курсором интерактивные объекты (города или точки пути)
            // Мы ищем среди них города или ручки управления
            const clickedCitySprite = gameObjects.find(obj => obj.texture && obj.texture.key === 'city');
            const clickedHandle = gameObjects.find(obj => obj.getData('type') === 'pathHandle');
            
            const isOverObject = !!(clickedCitySprite || clickedHandle);

            // --- ЛОГИКА РЕДАКТОРА ---
            if (this.isEditorMode) {
                // Shift + Клик: Добавление точки пути
                if (this.shiftKey.isDown && this.selectedRoute) {
                    if (!this.selectedRoute.points) this.selectedRoute.points = [];
                    this.selectedRoute.points.push([Math.round(worldPoint.x), Math.round(worldPoint.y)]);
                    this.refreshScene();
                    this.showRouteHandles(this.selectedRoute);
                    return;
                }

                // Клик по пустому месту в режиме мастера: Создание города
                if (!isOverObject) {
                    this.createNewCity(worldPoint.x, worldPoint.y);
                    return;
                }
            }

            // --- ЛОГИКА ОБЫЧНОГО ВЫБОРА И ПАНОРАМИРОВАНИЯ ---
            if (clickedCitySprite) {
                // Если кликнули по городу — панорамирование НЕ начинаем.
                // Клик по самому спрайту обработается его собственным событием .on('pointerdown')
                return;
            }

            if (!isOverObject) {
                // Если кликнули в пустоту — начинаем двигать карту
                this.isDragging = true;
                this.dragStart = {
                    x: pointer.x,
                    y: pointer.y,
                    scrollX: this.cameras.main.scrollX,
                    scrollY: this.cameras.main.scrollY
                };
                this.input.setDefaultCursor('grabbing');
            }
        });

        this.input.on('pointermove', (pointer) => {
            if (this.isDragging && pointer.isDown) {
                const deltaX = (this.dragStart.x - pointer.x) / this.cameras.main.zoom;
                const deltaY = (this.dragStart.y - pointer.y) / this.cameras.main.zoom;
                this.cameras.main.scrollX = this.dragStart.scrollX + deltaX;
                this.cameras.main.scrollY = this.dragStart.scrollY + deltaY;
            }
        });

        const stopDrag = () => {
            this.isDragging = false;
            this.input.setDefaultCursor('default');
        };
        this.input.on('pointerup', stopDrag);
        this.input.on('gameout', stopDrag);
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
                const response = await fetch(`${window.location.origin}/api/save`, {
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
    

    createCountries(countryData) {
        if (!countryData) return;

        countryData.forEach(data => {
            const countryText = this.add.text(data.x, data.y, data.name, {
                font: `${data.fontSize || '40px'} "Behrens Modern"`,
                fill: data.color || '#ffffff',
                stroke: '#000000',
                strokeThickness: 4,
                align: 'center',
                fontStyle: 'italic',
            });

            countryText
                .setOrigin(0.5)
                .setDepth(1)               // Самый нижний слой (над картой, но под всем остальным)
                .setAngle(data.angle)            // Можно добавить легкий наклон для красоты
                .setShadow(2, 2, 'rgba(0,0,0,0.5)', 5);
        });
    }

    
    createCities(cityData) {
        cityData.forEach(city => {
            // Создание спрайта города
            const citySprite = this.add.sprite(city.x, city.y, 'city')
                .setInteractive({ useHandCursor: true })
                .setScale(this.cityScale)
                .setDepth(10)
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
                    <div class="route-item" 
                        onclick="window.gameScene.selectRouteById(${route.id})" 
                        style="cursor: pointer; transition: background 0.2s;"
                        onmouseover="this.style.background='rgba(255, 153, 0, 0.3)'"
                        onmouseout="this.style.background='rgba(255, 153, 0, 0.1)'">
                        <strong>${direction} ${targetCity?.name || 'Неизвестный город'}</strong><br>
                        <small>${route.name || (route.type === 'water' ? 'Морской путь' : 'Тракт')}</small><br>
                        <small>Дистанция: ${route.distance || 0} км, Длительность: ${route.duration || 0} дн.</small>
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
    
    updateSpriteOrientation(sprite, fromPoint, toPoint) {
        const angle = Phaser.Math.Angle.Between(fromPoint.x, fromPoint.y, toPoint.x, toPoint.y);
        const angleDeg = Phaser.Math.RadToDeg(angle);

        sprite.setAngle(angleDeg);

        // Логика: если спрайт движется влево (угол между 90 и 270 градусами), 
        // он перевернется вверх ногами. Чтобы это исправить, отражаем его по вертикали.
        if (angleDeg > 90 || angleDeg < -90) {
            sprite.setFlipY(true);
        } else {
            sprite.setFlipY(false);
        }
    }
    
    getAngle(x1, y1, x2, y2) {
        const angle = Phaser.Math.RadToDeg(Math.atan2(y2 - y1, x2 - x1));
        return angle;
    }

    async saveDataToServer() {
        try {
            const response = await fetch(`${window.location.origin}/api/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.routesData)
            });
            if (response.ok) {
                console.log("Данные успешно сохранены на сервере");
            }
        } catch (err) {
            console.error("Ошибка сохранения:", err);
        }
    }
    
    highlightRoutes(cityId) {
        if (this.highlightGraphics) this.highlightGraphics.clear();
        else this.highlightGraphics = this.add.graphics().setDepth(3);

        const connected = this.routesData.routes.filter(r => r.from === cityId || r.to === cityId);
        
        connected.forEach(route => {
            this.highlightGraphics.lineStyle(3, 0x00ff00, 0.8);
            route.curve.draw(this.highlightGraphics);
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

    refreshScene() {
        // 1. Останавливаем и удаляем все текущие караваны
        if (this.caravans && this.caravans.length > 0) {
            this.caravans.forEach(item => {
                if (item.tween) {
                    item.tween.stop();    // Полностью останавливаем анимацию
                    item.tween.remove();  // Удаляем её из менеджера твинов
                }
                if (item.sprite) {
                    item.sprite.destroy(); // Удаляем спрайт с экрана
                }
            });
        }
        
        // 2. Очищаем массив полностью
        this.caravans = [];

        // 3. Перерисовываем линии
        this.drawAllRoutes();

        // 4. Создаем новых последователей
        this.createFollowers();
    }

    selectRouteById(id) {
        const route = this.routesData.routes.find(r => r.id === id);
        if (!route) return;
        
        // Сохраняем выбранный маршрут
        this.selectedRoute = route;

        // ЕСЛИ МЫ В РЕЖИМЕ РЕДАКТОРА
        if (this.isEditorMode) {
            document.getElementById('route-editor-panel').style.display = 'block';
            document.getElementById('edit-route-id').value = route.id;
            document.getElementById('edit-route-duration').value = route.duration;
            document.getElementById('edit-route-type').value = route.type;
            
            this.showRouteHandles(route); // Показываем синие точки
        } else {
            // Если в обычном режиме - просто подсвечиваем на карте (без точек)
            document.getElementById('route-editor-panel').style.display = 'none';
            this.editHandles.forEach(h => h.destroy());
            this.editHandles = [];
        }

        this.drawAllRoutes(); // Перерисовываем для подсветки
    }
}