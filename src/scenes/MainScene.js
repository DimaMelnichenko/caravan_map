import Caravan from '../classes/Caravan.js';

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

    async create() { // Добавляем async перед названием метода
        try {
            // Ждем самого ответа от сервера
            const response = await fetch('/api/load'); 
            
            // Ждем превращения ответа в JSON объект
            this.routesData = await response.json(); 

            // ТЕПЕРЬ данные в this.routesData загружены. 
            // Только после этого можно запускать отрисовку карты:
            this.initGame(); 
            
        } catch (err) {
            console.error("Ошибка при загрузке данных из БД:", err);
        }
    }
    
    initGame() {
        // Добавление карты
        this.map = this.add.image(0, 0, 'map')
            .setOrigin(0)
            .setScale(1.5);

        this.baseSpeeds = {
            track: 20,  // Базовая скорость каравана (пикс/сек)
            water: 30   // Базовая скорость корабля (пикс/сек)
        };
        

        this.isPlacingCity = false; // Режим ожидания клика для города
        this.isCreatingRoute = false;
        this.firstCityForRoute = null;
        
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
            const subBtns = document.getElementById('editor-sub-btns');
            const btn = document.getElementById('toggle-editor-btn');
            
            // Показываем под-кнопки
            subBtns.style.display = this.isEditorMode ? 'flex' : 'none';
            this.isPlacingCity = false; // Сбрасываем режим стройки при переключении
            this.updatePlacementCursor();

            if (this.isEditorMode) {
                btn.innerText = '🏰 Выйти из режима мастера';
                btn.style.background = '#2a4f85';
            } else {
                btn.innerText = '🛠️ Режим Мастера';
                btn.style.background = '#4a6fa5';
                // Скрываем все панели (город, путь, страна)
                document.getElementById('editor-panel').style.display = 'none';
                document.getElementById('route-editor-panel').style.display = 'none';
                document.getElementById('country-editor-panel').style.display = 'none';
            }
        };

        document.getElementById('add-city-btn').onclick = (e) => {
            e.stopPropagation();
            this.isPlacingCity = !this.isPlacingCity;
            this.updatePlacementCursor();
            
            const btn = document.getElementById('add-city-btn');
            btn.style.background = this.isPlacingCity ? '#ffcc00' : '#e67e22';
            btn.innerText = this.isPlacingCity ? '📍 Укажите место на карте' : '🏘️ Новый город (клик на карту)';
        };

        // Логика кнопки "Проложить путь"
        document.getElementById('add-route-btn').onclick = (e) => {
            e.stopPropagation();
            this.isCreatingRoute = !this.isCreatingRoute;
            this.firstCityForRoute = null; // Сброс при каждом нажатии кнопки
            
            const btn = document.getElementById('add-route-btn');
            btn.style.background = this.isCreatingRoute ? '#ffcc00' : '#6b4e31';
            btn.innerText = this.isCreatingRoute ? '📍 Выберите первый город' : '🗺️ Проложить путь (город -> город)';
            
            // Отключаем режим строительства города, если он был включен
            this.isPlacingCity = false;
            this.updatePlacementCursor();
        };

        // Создаем графический объект для "призрачной линии" (один раз)
        this.ghostGraphics = this.add.graphics().setDepth(100);

        // Сохранение города
        document.getElementById('save-city-btn').onclick = () => this.saveCityData();
        document.getElementById('delete-city-btn').onclick = () => this.deleteCityData();

        window.gameScene = this;

        this.setupDragPanning();   // Панорамирование и создание городов
        this.setupRouteEditing(); // Перетаскивание точек


        document.getElementById('save-route-btn').onclick = () => {
            if (this.selectedRoute) {
                this.selectedRoute.type = document.getElementById('edit-route-type').value;
                this.selectedRoute.speedCoeff = parseFloat(document.getElementById('edit-route-coeff').value);
                this.selectedRoute.unitCount = parseInt(document.getElementById('edit-route-count').value);
                
                this.refreshScene(); // Чтобы сразу применилась новая скорость и кол-во
                this.saveDataToServer();
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

        this.infoPanelInit();

        document.getElementById('save-country-btn').onclick = () => this.saveCountryData();
        document.getElementById('add-country-btn').onclick = () => this.createNewCountry();
        document.getElementById('delete-country-btn').onclick = () => {
            const id = parseInt(document.getElementById('edit-country-id').value);
            this.routesData.countries = this.routesData.countries.filter(c => c.id !== id);
            this.createCountries(this.routesData.countries);
            document.getElementById('country-editor-panel').style.display = 'none';
            this.saveDataToServer();
        };

        // Слушатели для живого обновления цифр в панели страны
        const cultureSlider = document.getElementById('edit-country-culture');
        const militancySlider = document.getElementById('edit-country-militancy');

        if (cultureSlider) {
            cultureSlider.oninput = function() {
                document.getElementById('val-culture').innerText = this.value;
            };
        }

        if (militancySlider) {
            militancySlider.oninput = function() {
                document.getElementById('val-militancy').innerText = this.value;
            };
        }

        // Находим ползунок наклона
        const angleSlider = document.getElementById('edit-country-angle');
        if (angleSlider) {
            angleSlider.oninput = () => {
                const val = angleSlider.value;
                document.getElementById('val-angle').innerText = val;
                
                // Живой предпросмотр: находим выбранный текст на карте и крутим его
                const id = parseInt(document.getElementById('edit-country-id').value);
                const textObj = this.countryObjects.find(obj => obj.getData('countryData').id === id);
                if (textObj) {
                    textObj.setAngle(val);
                }
            };
        }
        
        // Автовыбор первого города для демонстрации
        setTimeout(() => {
            if (this.cities.length > 0) {
                this.selectCity(this.cities[10].data);
            }
        }, 1000);
    }

    updatePlacementCursor() {
        if (this.isPlacingCity) {
            this.input.setDefaultCursor('crosshair'); // Крестик, когда мы "строим"
        } else {
            this.input.setDefaultCursor('default');
        }
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

    infoPanelInit() {
        const panelHeader = document.getElementById('city-info-header');
        const panelBody = document.getElementById('city-info-body');
        const panelArrow = document.getElementById('panel-toggle-arrow');

        panelHeader.onclick = () => {
            const isCollapsed = panelBody.style.maxHeight === '0px';
            
            if (isCollapsed) {
                // Разворачиваем
                panelBody.style.maxHeight = '1000px';
                panelBody.style.marginTop = '15px';
                panelArrow.style.transform = 'rotate(0deg)';
            } else {
                // Сворачиваем
                panelBody.style.maxHeight = '0px';
                panelBody.style.marginTop = '0px';
                panelArrow.style.transform = 'rotate(-90deg)';
            }
        };

        // Сохраним ссылку на функцию раскрытия, чтобы использовать её при клике на город
        this.expandInfoPanel = () => {
            panelBody.style.maxHeight = '1000px';
            panelBody.style.marginTop = '15px';
            panelArrow.style.transform = 'rotate(0deg)';
        };       
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
            const startCity = this.cities.find(c => c.data.id === route.from_id).data;
            const endCity = this.cities.find(c => c.data.id === route.to_id).data;

            if (!startCity || !endCity) return; 
            
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
            
            if (route.type === 'water') {
                const pathLength = curve.getLength();
                const segmentLength = 12; 
                const divisions = Math.max(1, Math.floor(pathLength / segmentLength));
                
                // ВАЖНО: используем getSpacedPoints вместо getPoints
                const points = curve.getSpacedPoints(divisions); 
                
                this.routeGraphics.lineStyle(2, color, 0.4);
                for (let i = 0; i < points.length - 1; i += 2) {
                    this.routeGraphics.lineBetween(points[i].x, points[i].y, points[i+1].x, points[i+1].y);
                }
                
                if (isSelected) {
                    this.highlightGraphics.lineStyle(4, 0x00ff00, 1);
                    for (let i = 0; i < points.length - 1; i += 2) {
                        this.highlightGraphics.lineBetween(points[i].x, points[i].y, points[i+1].x, points[i+1].y);
                    }
                }
            } else {
                // Для сухопутных путей рисуем сплошную линию
                this.routeGraphics.lineStyle(2, color, 0.4);
                curve.draw(this.routeGraphics);
                
                if (isSelected) {
                    this.highlightGraphics.lineStyle(4, 0x00ff00, 1);
                    curve.draw(this.highlightGraphics);
                }
            }
        });
    }

    createFollowers() {
        if (this.caravans) {
            this.caravans.forEach(item => {
                if (item.tween) item.tween.remove();
                if (item.sprite) item.sprite.destroy();
            });
        }
        this.caravans = [];

        this.routesData.routes.forEach(route => {
            if (!route.curve) return;

            // 1. Берем параметры из данных или ставим дефолтные
            const speedCoeff = route.speedCoeff || 1.0; // Коэффициент дороги (1.0 - норма)
            const unitCount = route.unitCount !== undefined ? route.unitCount : (route.type === 'water' ? 1 : 3);
            
            // 2. Рассчитываем реальную скорость: (Базовая * Коэффициент)
            const baseSpeed = this.baseSpeeds[route.type] || 50;
            const finalSpeed = baseSpeed * speedCoeff;

            // 3. Рассчитываем время в пути: (Длина пути в пикселях / Скорость) * 1000 мс
            const pathLength = route.curve.getLength();
            const travelTimeMs = (pathLength / finalSpeed) * 1000;

            // Сохраняем рассчитанную длительность для отображения в инфо (в днях, если нужно)
            route.calculatedDuration = Math.round(travelTimeMs / 1000); 

            const spacing = 1 / unitCount;

            for (let i = 0; i < unitCount; i++) {
                const caravanSprite = new Caravan(this, 0, 0, route.type, route);
                const follower = { t: 0, vec: new Phaser.Math.Vector2() };

                const tween = this.tweens.add({
                    targets: follower,
                    t: 1,
                    ease: 'Linear',
                    duration: travelTimeMs / (window.gameSpeed || 1),
                    repeat: -1,
                    delay: i * (spacing * (travelTimeMs / (window.gameSpeed || 1))),
                    onUpdate: () => {
                        route.curve.getPointAt(follower.t, follower.vec);
                        caravanSprite.setPosition(follower.vec.x, follower.vec.y);

                        const tangent = route.curve.getTangentAt(follower.t);
                        const angle = Phaser.Math.RadToDeg(Math.atan2(tangent.y, tangent.x));
                        caravanSprite.setAngle(angle);
                        
                        if (angle > 90 || angle < -90) caravanSprite.setFlipY(true);
                        else caravanSprite.setFlipY(false);
                    }
                });

                this.caravans.push({ sprite: caravanSprite, tween: tween });
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
        // 1. Отключаем стандартное поведение средней кнопки мыши в браузере (чтобы не появлялся значок прокрутки)
        this.game.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 1) e.preventDefault();
        });

        this.input.on('pointerdown', (pointer, gameObjects) => {
            const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            const clickedObject = gameObjects.length > 0;

            // --- ЛОГИКА СРЕДНЕЙ КНОПКИ (ПАНОРАМИРОВАНИЕ) ---
            if (pointer.middleButtonDown()) {
                this.isDragging = true;
                this.dragStart = {
                    x: pointer.x, y: pointer.y,
                    scrollX: this.cameras.main.scrollX, scrollY: this.cameras.main.scrollY
                };
                this.input.setDefaultCursor('grabbing');
                return;
            }

            // --- ЛОГИКА ЛЕВОЙ КНОПКИ ---
            if (pointer.leftButtonDown()) {

                if (this.isCreatingRoute) {
                    // Ищем, кликнули ли мы по городу
                    const clickedCitySprite = gameObjects.find(obj => obj.texture && obj.texture.key === 'city');
                    
                    if (clickedCitySprite) {
                        const cityId = clickedCitySprite.getData('cityId');
                        const cityData = this.routesData.cities.find(c => c.id === cityId);

                        if (!this.firstCityForRoute) {
                            // ШАГ 1: Выбрали первый город
                            this.firstCityForRoute = cityData;
                            document.getElementById('add-route-btn').innerText = `📍 Из ${cityData.name} в...`;
                            console.log("Первая точка пути:", cityData.name);
                        } else {
                            // ШАГ 2: Выбрали второй город
                            if (this.firstCityForRoute.id === cityData.id) {
                                alert("Нельзя проложить путь в тот же самый город!");
                                return;
                            }
                            
                            this.createNewRoute(this.firstCityForRoute.id, cityData.id);
                            
                            // Завершаем режим
                            this.isCreatingRoute = false;
                            this.firstCityForRoute = null;
                            this.ghostGraphics.clear();
                            const btn = document.getElementById('add-route-btn');
                            btn.style.background = '#6b4e31';
                            btn.innerText = '🗺️ Проложить путь (город -> город)';
                        }
                        return; // Прерываем, чтобы не сработали другие клики
                    }
                }
                
                // 1. ПРИОРИТЕТ: Режим установки нового города
                if (this.isPlacingCity) {
                    this.createNewCity(worldPoint.x, worldPoint.y);
                    this.isPlacingCity = false;
                    const btn = document.getElementById('add-city-btn');
                    btn.style.background = '#e67e22';
                    btn.innerText = '🏘️ Новый город (клик на карту)';
                    this.updatePlacementCursor();
                    return;
                }

                // 2. ПРИОРИТЕТ: Добавление точки к существующему пути (Shift + Клик)
                // Работает, если мы в режиме мастера И выбран какой-то путь
                if (this.isEditorMode && this.shiftKey.isDown && this.selectedRoute) {
                    if (!this.selectedRoute.points) this.selectedRoute.points = [];
                    
                    // Добавляем новую точку в массив
                    this.selectedRoute.points.push([Math.round(worldPoint.x), Math.round(worldPoint.y)]);
                    
                    // Сразу перерисовываем всё
                    this.refreshScene(); 
                    this.showRouteHandles(this.selectedRoute); // Обновляем синие точки
                    return;
                }

                // 3. ПРИОРИТЕТ: Сброс выделения, если кликнули по пустому месту (без Shift)
                if (this.isEditorMode && !clickedObject) {
                    // Скрываем панели, если кликнули в "молоко"
                    document.getElementById('editor-panel').style.display = 'none';
                    document.getElementById('country-editor-panel').style.display = 'none';
                    document.getElementById('route-editor-panel').style.display = 'none';
                    
                    // Убираем точки редактирования пути
                    this.editHandles.forEach(h => h.destroy());
                    this.editHandles = [];
                    this.selectedRoute = null;
                    this.drawAllRoutes(); // Перерисовываем, чтобы убрать подсветку
                }
            }
        });

        // Перемещение (работает, когда зажата кнопка, инициировавшая dragging)
        this.input.on('pointermove', (pointer) => {
            if (this.isDragging) {
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

    async deleteCityData() {
        const id = parseInt(document.getElementById('edit-city-id').value);
        if (!id) return;

        const cityIndex = this.routesData.cities.findIndex(c => c.id === id);
        
        if (cityIndex === -1) {
            alert("Город не найден в базе данных.");
            return;
        }

        const cityName = this.routesData.cities[cityIndex].name;
        
        // Подтверждение удаления
        if (!confirm(`Вы уверены, что хотите удалить город ${cityName}? Все торговые пути к нему будут уничтожены.`)) {
            return;
        }

        // 1. Удаляем город из массива данных
        this.routesData.cities.splice(cityIndex, 1);

        // 2. Очищаем маршруты, которые вели в этот город или из него
        this.routesData.routes = this.routesData.routes.filter(route => 
            route.from !== id && route.to !== id
        );

        // 3. Сбрасываем состояние выбора в игре
        this.selectedCity = null;
        this.selectedRoute = null;

        // 4. Обновляем UI (скрываем панели и чистим инфо)
        document.getElementById('editor-panel').style.display = 'none';
        document.getElementById('route-editor-panel').style.display = 'none';
        document.getElementById('city-info-content').innerHTML = '<p>Город удален.</p>';

        // 5. Визуальное обновление карты
        this.refreshMap();   // Пересоздает спрайты городов
        this.refreshScene(); // Перерисовывает пути и перезапускает караваны

        // 6. Сохранение изменений на сервере
        await this.saveDataToServer();
        
        console.log(`Город ${cityName} успешно удален.`);
    }

    refreshMap() {
        // 1. Запоминаем ID текущего выбранного города, если он есть
        const selectedId = this.selectedCity ? this.selectedCity.data.id : null;

        // 2. Очищаем текущие спрайты и тексты
        this.cities.forEach(c => {
            if (c.sprite) c.sprite.destroy();
            if (c.text) c.text.destroy();
        });
        this.cities = [];

        // 3. Обнуляем ссылку на выбранный город перед пересозданием
        this.selectedCity = null;

        // 4. Пересоздаем спрайты из обновленных данных
        this.createCities(this.routesData.cities);

        // 5. Если до этого был выбран город, выбираем его снова (уже новый спрайт)
        if (selectedId) {
            const newCityData = this.routesData.cities.find(c => c.id === selectedId);
            if (newCityData) {
                this.selectCity(newCityData);
            }
        }
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
        
        // Очистим старые объекты, если они были (для refreshMap)
        if (this.countryObjects) {
            this.countryObjects.forEach(obj => obj.destroy());
        }
        this.countryObjects = [];

        countryData.forEach(data => {
            const countryText = this.add.text(data.x, data.y, data.name, {
                fontFamily: 'MyMedievalFont',
                fontSize: data.fontSize || '40px',
                fill: data.color || '#ff0000',
                stroke: '#000000',
                strokeThickness: 4
            })
            .setOrigin(0.5)
            .setDepth(1)
            .setAngle(data.angle || 0)
            .setInteractive({ useHandCursor: true, draggable: true }) // Делаем перетаскиваемым
            .setData('countryData', data);

            // Клик по стране
            countryText.on('pointerdown', (pointer) => {
                if (this.isEditorMode) {
                    this.openCountryEditor(data);
                } else {
                    // Показываем инфо о стране в левой панели
                    this.updateCountryInfoPanel(data);
                }
                this.sound.play('city_click', { volume: window.gameVolume });
            });

            // Перетаскивание
            countryText.on('drag', (pointer, dragX, dragY) => {
                if (this.isEditorMode) {
                    countryText.x = Math.round(dragX);
                    countryText.y = Math.round(dragY);
                    data.x = countryText.x;
                    data.y = countryText.y;
                }
            });

            this.countryObjects.push(countryText);
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

         // Если объект спрайта уже уничтожен, просто сбрасываем ссылку
        if (this.selectedCity && (!this.selectedCity.sprite || !this.selectedCity.sprite.active)) {
            this.selectedCity = null;
        }

        if (this.expandInfoPanel) this.expandInfoPanel();

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
            scale: this.cityScale + 0.07,
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
                        <small>Дистанция: ${route.distance || 0} км, Длительность: ${route.calculatedDuration || 0} дн.</small>
                    </div>
                `;
            }).join('')
            : '<p>Нет активных маршрутов</p>';

        const populationFormatted = typeof cityData.population === 'number' 
            ? cityData.population.toLocaleString('ru-RU') + ' жителей'
            : (cityData.population || 'Нет данных');
        
        let debugInfo = '';
        //if (this.isEditorMode === true) {
            debugInfo = `
                <div class="city-property">id: ${cityData.id}</div>
                <div class="city-property">x: ${cityData.x}</div>
                <div class="city-property">y: ${cityData.y}</div>
            `;
        //}    

        // Обновляем содержимое DOM-элемента
        contentElement.innerHTML = `
            <div class="city-property">Город: <strong>${cityData.name}</strong></div>
            <div class="city-property">Описание: ${cityData.description || 'Нет описания'}</div>
            <div class="city-property">Население: ${populationFormatted}</div>
            <div class="city-property">Товары: ${goodsHTML}</div>
            <div class="city-property">Склад: ${cityData.storage || '0'} единиц</div>
            <div class="city-property">Активные маршруты (${connectedRoutes.length}):</div>
            ${debugInfo}
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
        const dataToSave = {
            cities: this.routesData.cities,
            routes: this.routesData.routes,
            countries: this.routesData.countries
        };

        try {
            await fetch(`${window.location.origin}/api/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dataToSave)
            });
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

        // Отрисовка линии прокладываемого пути
        if (this.isCreatingRoute && this.firstCityForRoute) {
            const pointer = this.input.activePointer;
            const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
            
            this.ghostGraphics.clear();
            this.ghostGraphics.lineStyle(2, 0xffcc00, 0.8);
            this.ghostGraphics.lineBetween(
                this.firstCityForRoute.x, 
                this.firstCityForRoute.y, 
                worldPoint.x, 
                worldPoint.y
            );
        } else if (this.ghostGraphics) {
            this.ghostGraphics.clear();
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
            document.getElementById('edit-route-type').value = route.type;
            document.getElementById('edit-route-coeff').value = route.speedCoeff || 1.0;
            document.getElementById('edit-route-count').value = route.unitCount !== undefined ? route.unitCount : (route.type === 'water' ? 1 : 3);
            
            this.showRouteHandles(route); // Показываем синие точки
        } else {
            // Если в обычном режиме - просто подсвечиваем на карте (без точек)
            document.getElementById('route-editor-panel').style.display = 'none';
            this.editHandles.forEach(h => h.destroy());
            this.editHandles = [];
        }

        this.drawAllRoutes(); // Перерисовываем для подсветки
    }

    openCountryEditor(data) {
        document.getElementById('country-editor-panel').style.display = 'block';
        document.getElementById('editor-panel').style.display = 'none';
        document.getElementById('route-editor-panel').style.display = 'none';

        document.getElementById('edit-country-id').value = data.id;
        document.getElementById('edit-country-name').value = data.name;
        document.getElementById('edit-country-race').value = data.race || '';
        document.getElementById('edit-country-religion').value = data.religion || '';
        document.getElementById('edit-country-pop').value = data.population || 0;
        
        // Устанавливаем значения ползунков
        const culture = data.culture || 0;
        const militancy = data.militancy || 0;
        
        document.getElementById('edit-country-culture').value = culture;
        document.getElementById('val-culture').innerText = culture; // Обновляем текст
        
        document.getElementById('edit-country-militancy').value = militancy;
        document.getElementById('val-militancy').innerText = militancy; // Обновляем текст

        const angle = data.angle || 0;
        document.getElementById('edit-country-angle').value = angle;
        document.getElementById('val-angle').innerText = angle;
    }

    async saveCountryData() {
        const id = parseInt(document.getElementById('edit-country-id').value);
        const country = this.routesData.countries.find(c => c.id === id);
        
        if (country) {
            country.name = document.getElementById('edit-country-name').value;
            country.race = document.getElementById('edit-country-race').value;
            country.religion = document.getElementById('edit-country-religion').value;
            country.population = parseInt(document.getElementById('edit-country-pop').value);
            country.culture = parseInt(document.getElementById('edit-country-culture').value);
            country.militancy = parseInt(document.getElementById('edit-country-militancy').value);
            country.angle = parseInt(document.getElementById('edit-country-angle').value) || 0;

            this.createCountries(this.routesData.countries); // Перерисовываем надписи
            await this.saveDataToServer();
            alert('Данные страны сохранены!');
        }
    }

    createNewCountry() {
        const newId = this.routesData.countries.length > 0 
            ? Math.max(...this.routesData.countries.map(c => c.id)) + 1 : 1;
        
        const cam = this.cameras.main;
        const newCountry = {
            id: newId,
            name: "Новая Держава",
            x: Math.round(cam.midPoint.x),
            y: Math.round(cam.midPoint.y),
            race: "Люди",
            religion: "Нет",
            population: 1000,
            culture: 5,
            militancy: 5
        };

        this.routesData.countries.push(newCountry);
        this.createCountries(this.routesData.countries);
        this.openCountryEditor(newCountry);
    }

    updateCountryInfoPanel(data) {
        const content = document.getElementById('city-info-content');
        content.innerHTML = `
            <div class="city-property">Страна: <strong>${data.name}</strong></div>
            <div class="city-property">Основная раса: ${data.race || 'Неизвестно'}</div>
            <div class="city-property">Религия: ${data.religion || 'Нет'}</div>
            <div class="city-property">Население: ${data.population?.toLocaleString() || 0} чел.</div>
            <hr>
            <div class="city-property">Культура: ${data.culture || 0}/3</div>
            <div class="city-property">Воинственность: ${data.militancy || 0}/10</div>
            <p><small>Кликните по городу этой страны для деталей</small></p>
        `;
        if (this.expandInfoPanel) this.expandInfoPanel();
    }

    createNewRoute(fromId, toId) {
        const newId = this.routesData.routes.length > 0 
            ? Math.max(...this.routesData.routes.map(r => r.id)) + 1 : 1;

        const newRoute = {
            id: newId,
            from: fromId,
            to: toId,
            type: "track",
            points: [],
            speedCoeff: 1.0,
            unitCount: 3
        };

        this.routesData.routes.push(newRoute);
        
        // Перерисовываем всё
        this.refreshScene();
        
        // Сразу выбираем этот путь для редактирования
        this.selectRouteById(newId);
        
        // Сохраняем на сервер
        this.saveDataToServer();
        
        console.log(`Путь ID:${newId} создан успешно.`);
    }
}