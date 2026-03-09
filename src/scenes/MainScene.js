import Caravan from '../classes/Caravan.js';
import Country from '../classes/Country.js';
import City from '../classes/City.js';
import Route from '../classes/Route.js';
import UIManager from '../classes/UIManager.js';
import DataService from '../services/DataService.js';
import CaravanService from '../services/CaravanService.js';
import ServerSyncService from '../services/ServerSyncService.js';
import Border from '../classes/Border.js';


export default class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
        this.dataService = new DataService();
        this.caravanService = new CaravanService();
        this.serverSync = new ServerSyncService(this);
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
        this.routes = [];
        this.viewingType = null;
    }

    async create() {
        try {
            // Подключаемся к серверу синхронизации
            this.serverSync.connect();

            // Загружаем начальные данные через REST API
            this.routesData = await this.dataService.loadWorld();
            this.initGame();
        } catch (err) {
            console.error("Ошибка при загрузке данных из БД:", err);
        }
    }
    
    initGame() {
        // Добавление карты
        this.map = this.add.image(0, 0, 'map')
            .setDepth(0)
            .setOrigin(0)
            .setScale(1.5);

        this.borders = []; 
        const worldWidth = this.map.displayWidth;
        const worldHeight = this.map.displayHeight;
        if (this.borderLayer) this.borderLayer.destroy();
        this.borderLayer = this.add.renderTexture(0, 0, worldWidth, worldHeight)
            .setDepth(2)
            .setOrigin(0, 0);
        if (!this.dashStamp) {
            this.dashStamp = this.make.sprite({ key: 'border_dash' }, false);
            this.dashStamp.setScale( 0.7 ).setAlpha( 0.7 );
        }

        this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);

        this.economyTimer = 0;
        this.saveTimer = 0;

        this.routesData.routes.forEach(route => {
            if (route.from && !route.from_id) route.from_id = route.from;
            if (route.to && !route.to_id) route.to_id = route.to;
        });
        
        this.ui = new UIManager(this);

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

        this.routes = this.routesData.routes.map(data => new Route(this, data));
        
        // 2. РИСУЕМ ПУТИ (теперь они видны всегда)
        // Этот метод создает объекты Curve внутри routesData.routes
        this.drawAllRoutes();

        // 3. ЗАПУСКАЕМ ДВИЖЕНИЕ
        // Этот метод использует созданные Curve для запуска спрайтов
        this.createFollowers();

        this.initBordersSystem(this.routesData.borders)
        
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

        this.input.keyboard.on('keydown-DELETE', async () => {
            if (this.isEditorMode && this.selectedBorder) {
                if (confirm('Удалить эту линию границы?')) {
                    const success = await this.dataService.deleteBorder(this.selectedBorder.data.id);
                    if (success) {
                        this.borders = this.borders.filter(b => b !== this.selectedBorder);
                        this.selectedBorder = null;
                        this.editHandles.forEach(h => h.destroy());
                        this.redrawBorders();
                        this.ui.showNotification('Граница удалена');
                    }
                }
            }
        });

        // Создаем графический объект для "призрачной линии" (один раз)
        this.ghostGraphics = this.add.graphics().setDepth(100);

        // Сохранение города
        document.getElementById('save-city-btn').onclick = () => this.saveCityData();
        document.getElementById('delete-city-btn').onclick = () => this.deleteCityData();

        window.gameScene = this;

        this.setupDragPanning();   // Панорамирование и создание городов
        this.setupInputHandlers();  // Обработчики pointermove, pointerup
        this.setupRouteEditing(); // Перетаскивание точек


        document.getElementById('save-route-btn').onclick = async () => {
            if (this.selectedRoute) {
                // Находим элементы
                const transportEl = document.getElementById('edit-route-transport');
                const typeEl = document.getElementById('edit-route-type');
                const coeffEl = document.getElementById('edit-route-coeff');
                const countEl = document.getElementById('edit-route-count');

                // Проверяем, что элементы существуют, прежде чем брать .value
                if (!transportEl || !coeffEl || !countEl) {
                    console.error("Ошибка: Не найдены элементы редактора пути в HTML!");
                    return;
                }

                // Обновляем данные в объекте
                this.selectedRoute.type = typeEl.value;
                this.selectedRoute.transport_id = parseInt(transportEl.value);
                this.selectedRoute.speedCoeff = parseFloat(coeffEl.value);
                this.selectedRoute.unitCount = parseInt(countEl.value);
                
                // Сохраняем в БД через сервис
                const success = await this.dataService.saveRoute(this.selectedRoute);

                if (success) {
                    this.ui.showNotification('Торговый путь обновлен', 'success');
                    await this.refreshScene(); // Перезапуск караванов с новыми параметрами
                }
            }
        };

        // Кнопка удаления маршрута
        document.getElementById('delete-route-btn').onclick = async () => {
            // 1. Проверяем, выбран ли маршрут
            if (!this.selectedRoute) return;

            // 2. Подтверждение удаления
            if (!confirm('Вы уверены, что хотите навсегда удалить этот торговый путь?')) return;

            const routeId = this.selectedRoute.id;

            try {
                // 3. Удаление из базы данных через DataService
                const success = await this.dataService.deleteRoute(routeId);

                if (success) {
                    // 4. Удаление из локального массива данных (чтобы при следующей загрузке его не было)
                    this.routesData.routes = this.routesData.routes.filter(r => r.id !== routeId);

                    // 5. Сброс текущего выделения
                    this.selectedRoute = null;

                    // 7. Удаление синих точек-маркеров (handles), если они были
                    if (this.editHandles) {
                        this.editHandles.forEach(h => h.destroy());
                        this.editHandles = [];
                    }

                    // 8. Визуальное обновление всей сцены (перерисовка линий и перезапуск караванов)
                    await this.refreshScene();

                    // 9. Красивое уведомление
                    this.ui.showNotification('Торговый путь удален', 'success');
                } else {
                    this.ui.showNotification('Ошибка сервера при удалении пути', 'error');
                }
            } catch (err) {
                console.error("Ошибка при удалении маршрута:", err);
                this.ui.showNotification('Не удалось связаться с сервером', 'error');
            }
        };

        document.getElementById('save-country-btn').onclick = () => this.saveCountryData();
        document.getElementById('add-country-btn').onclick = () => this.createNewCountry();
        document.getElementById('delete-country-btn').onclick = async () => {
            const id = parseInt(document.getElementById('edit-country-id').value);
            if (!id || !confirm('Удалить эту державу из истории мира?')) return;

            try {
                const success = await this.dataService.deleteCountry(id); // Добавь этот метод в DataService по аналогии с другими
                if (success) {

                    this.routesData.cities.forEach(city => {
                        if (city.country_id === id) {
                            city.country_id = 0; // Стал независимым
                            this.dataService.saveCity(city); // Обновляем в БД
                        }
                    });

                    this.routesData.countries = this.routesData.countries.filter(c => c.id !== id);
                    this.createCountries(this.routesData.countries); // Перерисовываем карту
                    this.ui.hideAllEditors();
                    this.ui.showNotification('Держава стерта с карт', 'success');
                }
            } catch (err) {
                this.ui.showNotification('Ошибка удаления', 'error');
            }
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
                const countryObj = this.countryObjects.find(obj => obj.countryData && obj.countryData.id === id);
        
                if (countryObj) {
                    countryObj.setAngle(val);         // Визуально наклоняем текст
                    countryObj.countryData.angle = val; // Обновляем данные внутри объекта для сохранения
                }
            };
        }
        
        // Автовыбор первого города для демонстрации
        setTimeout(() => {
            if (this.cities.length > 0) {
                this.selectCity(this.cities[10].cityData);
            }
        }, 1000);
    }

    initBordersSystem(borders) {

        document.getElementById('toggle-border-editor-btn').onclick = () => {
            this.toggleBorderMode();
        };

        document.getElementById('close-border-mode').onclick = () => {
            this.toggleBorderMode();
        };

        // Кнопки внутри панели
        document.getElementById('create-border-btn').onclick = () => this.createNewBorder();
        document.getElementById('delete-border-btn').onclick = () => this.deleteSelectedBorder();

        this.borders = borders.map(data => new Border(this, data));

        // 2. Отрисовываем их на холсте
        this.redrawBorders();
    }

    async deleteSelectedBorder() {
        if (!this.selectedBorder) {
            this.ui.showNotification('Сначала выберите линию (кликните по ней)', 'error');
            return;
        }

        if (confirm('Удалить эту линию границы навсегда?')) {
            const id = this.selectedBorder.data.id;
            const success = await this.dataService.deleteBorder(id);
            if (success) {
                this.borders = this.borders.filter(b => b.data.id !== id);
                this.selectedBorder = null;
                this.editHandles.forEach(h => h.destroy());
                this.editHandles = [];
                this.redrawBorders();
                this.ui.showNotification('Граница удалена');
            }
        }
    }

    getDistanceToCurve(curve, point) {
        let minBorderDist = Infinity;
        const divisions = 100; // Точность поиска
        for (let i = 0; i <= divisions; i++) {
            const p = curve.getPointAt(i / divisions); // Обязательно getPointAt
            const dist = Phaser.Math.Distance.Between(point.x, point.y, p.x, p.y);
            if (dist < minBorderDist) minBorderDist = dist;
        }
        return minBorderDist;
    }

    toggleBorderMode() {
        if (this.viewingType !== 'edit_borders') {
            this.viewingType = 'edit_borders';
            this.ui.showBorderPanel();
            this.ui.showNotification('Режим редактирования границ');
            // Снимаем выделение с городов/стран
            if (this.selectedCity) this.selectedCity.setSelected(false);
            this.selectedCity = null;
        } else {
            this.viewingType = null;
            this.ui.hideAllEditors();
            this.selectedBorder = null;
            this.editHandles.forEach(h => h.destroy());
            this.editHandles = [];
            this.ui.showNotification('Режим границ выключен');
        }
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

            if (gameObject.getData('type') === 'borderHandle') {
                gameObject.x = dragX;
                gameObject.y = dragY;
                
                const index = gameObject.getData('index');
                const border = gameObject.getData('borderParent');
                
                border.points[index] = [Math.round(dragX), Math.round(dragY)];
                border.updateCurve();
                
                this.redrawBorders(); // Перерисовываем холст "на лету"
            }
        });

        this.input.on('dragend', async (pointer, gameObject) => {
            if (gameObject.getData('type') === 'pathHandle') {
                // А вот когда отпустили точку — пересоздаем караваны, чтобы они поехали по новому пути
                await this.refreshScene();
                // И сохраняем автоматически (по желанию) или ждем нажатия кнопки Сохранить
            }

            if (gameObject.getData('type') === 'borderHandle') {
                const border = gameObject.getData('borderParent');
                
                // Формируем объект для сохранения явно
                const payload = {
                    id: border.data.id,
                    country_id: border.data.country_id,
                    points: border.points // Отправляем наш "живой" массив
                };

                const success = await this.dataService.saveBorder(payload);
                if (success) {
                    this.ui.showNotification('Граница сохранена', 'success');
                }
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
        if (!this.routeGraphics) this.routeGraphics = this.add.graphics().setDepth(2);
        if (!this.highlightGraphics) this.highlightGraphics = this.add.graphics().setDepth(3);

        this.routeGraphics.clear();
        this.highlightGraphics.clear();

        this.routes.forEach(route => {
            const isSelected = this.selectedRoute && this.selectedRoute.id === route.routeData.id;
            
            // Вызываем метод рисования самого маршрута
            // Обычную линию рисуем в routeGraphics
            route.draw(this.routeGraphics, false);
            
            // Если выбран — рисуем подсветку в highlightGraphics
            if (isSelected) {
                route.draw(this.highlightGraphics, true);
            }
        });
    }

    async createFollowers() {
        // Инициализируем караваны на сервере для каждого маршрута
        for (const route of this.routes) {
            await route.initCaravansFromServer();
        }
        // Загружаем данные караванов с сервера
        await this.syncAllCaravans();

        // Подписываемся на события от сервера
        this.setupServerSyncListeners();
    }

    /**
     * Настройка слушателей событий сервера
     */
    setupServerSyncListeners() {
        // Обработка появления каравана
        this.serverSync.on('caravanSpawned', (data) => {
            // Находим маршрут и создаём караван
            const route = this.routes.find(r => r.routeData.id === data.route_id);
            if (route) {
                route.syncCaravans([data]);
            }
        });

        // Обработка прибытия каравана
        this.serverSync.on('caravanArrived', (data) => {
            // Сбрасываем флаг returning когда караван прибыл
            const route = this.routes.find(r => r.routeData.id === data.route_id);
            if (route) {
                const caravanObj = route.caravans.find(c => c.serverId === data.id);
                if (caravanObj) {
                    caravanObj.sprite.caravanData.returning = false;
                }
            }
            this.ui.showNotification(`Караван прибыл в город!`, 'success');
        });

        // Обработка начала торговли
        this.serverSync.on('caravanTrading', (data) => {
            // Можно добавить визуальные эффекты
        });

        // Обработка завершения торговли - разворот каравана
        this.serverSync.on('tradeComplete', (data) => {
            // Находим маршрут по route_id из данных каравана
            const route = this.routes.find(r => r.routeData.id === data.route_id);
            
            if (route) {
                const caravanObj = route.caravans.find(c => c.serverId === data.id);
                
                if (caravanObj) {
                    // Сбрасываем прогресс и устанавливаем флаг обратного пути
                    caravanObj.sprite.progress = data.returning ? 100 : 0;
                    caravanObj.sprite.caravanData.started_at = Date.now();
                    caravanObj.sprite.caravanData.returning = !!data.returning;
                }
            }
        });

        // Обработка состояния соединения
        this.serverSync.on('connected', () => {
            this.ui.showNotification('Соединение с сервером установлено', 'success');
        });

        this.serverSync.on('disconnected', () => {
            this.ui.showNotification('Потеряно соединение с сервером', 'error');
        });

        this.serverSync.on('reconnecting', (data) => {
            this.ui.showNotification(`Переподключение... (попытка ${data.attempt})`, 'warning');
        });
    }

    /**
     * Синхронизация всех караванов с сервером
     */
    async syncAllCaravans() {
        const serverCaravans = await this.caravanService.getAllCaravans();
        for (const route of this.routes) {
            await route.syncCaravans(serverCaravans);
        }
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
            this.handlePointerDown(pointer, gameObjects);
        });
    }

    async handlePointerDown(pointer, gameObjects) {
        const borderHandle = gameObjects.find(obj => obj.getData && obj.getData('type') === 'borderHandle');
        const pathHandle = gameObjects.find(obj => obj.getData && obj.getData('type') === 'pathHandle');

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

        // --- РЕЖИМ ГРАНИЦ ---
        if (this.viewingType === 'edit_borders') {
            // 1. Если кликнули по точке - ничего не делаем, даем Phaser её тащить
            if (borderHandle) return;

            // 2. Добавление новой точки (Shift + Клик)
            if (this.shiftKey.isDown && this.selectedBorder) {
                this.selectedBorder.points.push([Math.round(worldPoint.x), Math.round(worldPoint.y)]);
                this.selectedBorder.updateCurve();
                this.selectBorder(this.selectedBorder); // Пересоздаем розовые точки
                this.redrawBorders();
                return;
            }

            // 3. Выбор границы кликом по линии
            let closestBorder = null;
            let minDistance = 30;

            this.borders.forEach(border => {
                if (!border.curve) return;
                const dist = this.getDistanceToCurve(border.curve, worldPoint);
                if (dist < minDistance) {
                    minDistance = dist;
                    closestBorder = border;
                }
            });

            if (closestBorder) {
                this.selectBorder(closestBorder);
            } else if (gameObjects.length === 0) {
                // Кликнули в пустоту (не по handle и не по линии) - сброс
                this.selectedBorder = null;
                this.editHandles.forEach(h => h.destroy());
                this.editHandles = [];
            }
            return; // Важно: выходим из функции, чтобы не срабатывал выбор городов
        }

        // --- ЛОГИКА ЛЕВОЙ КНОПКИ ---
        if (pointer.leftButtonDown()) {

            if (this.isCreatingRoute) {
                // Ищем, кликнули ли мы по городу
                const clickedCity = gameObjects.find(obj => obj instanceof City);

                if (clickedCity) {
                    const cityData = clickedCity.cityData;

                    if (!this.firstCityForRoute) {
                        // ШАГ 1: Выбрали первый город
                        this.firstCityForRoute = cityData;
                        document.getElementById('add-route-btn').innerText = `📍 Из ${cityData.name} в...`;
                        console.log("Первая точка пути:", cityData.name);
                    } else {
                        // ШАГ 2: Выбрали второй город
                        if (this.firstCityForRoute.id === cityData.id) {
                            this.ui.showNotification("Нельзя проложить путь в тот же самый город!", 'error');
                            return;
                        }

                        await this.createNewRoute(this.firstCityForRoute.id, cityData.id);

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
                await this.refreshScene();
                this.showRouteHandles(this.selectedRoute); // Обновляем синие точки
                return;
            }

            if (this.isEditorMode && this.shiftKey.isDown && this.selectedBorder) {
                const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
                this.selectedBorder.points.push([Math.round(worldPoint.x), Math.round(worldPoint.y)]);
                this.selectedBorder.updateCurve();
                this.selectBorder(this.selectedBorder); // Пересоздаем ручки
                this.redrawBorders();
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
    }

    setupInputHandlers() {
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
        this.ui.showCityEditor(newCity); 
    }

    refreshMap() {
        const selectedId = this.selectedCity ? this.selectedCity.cityData.id : null;

        // Теперь c — это сам объект City
       if (this.cities) {
            this.cities.forEach(city => {
                if (city.destroy) city.destroy();
            });
        }

        this.cities = [];
        this.selectedCity = null;

        this.createCities(this.routesData.cities);

        if (selectedId) {
            const newCityData = this.routesData.cities.find(c => c.id === selectedId);
            if (newCityData) this.selectCity(newCityData);
        }
    }
    
    createCountries(countryData) {
        if (!countryData) return;
        
        // Очистим старые объекты, если они были
        if (this.countryObjects) {
            this.countryObjects.forEach(obj => obj.destroy());
        }
        this.countryObjects = [];

        countryData.forEach(data => {
            const country = new Country(this, data);
            this.countryObjects.push(country);
        });
    }

    createCities(cityData) {
        cityData.forEach(data => {
            const city = new City(this, data);
            this.cities.push(city); // Просто пушим сам объект города
        });
    }
    
    selectCity(cityData) {
        // 1. Логика Phaser (спрайты и выделение)
        if (this.selectedCity) {
            this.selectedCity.setSelected(false);
        }
        
        const city = this.cities.find(c => c.cityData.id === cityData.id);
        if (!city) return;
        
        this.selectedCity = city;
        this.selectedCity.setSelected(true);

        this.viewingType = 'city';

        // 2. Логика UI (теперь через менеджер)
        // Метод updateCityInfo сам внутри вызовет expandInfoPanel, так что здесь это не нужно
        this.ui.updateCityInfo(city.cityData, this.routes);

        // Если включен режим мастера — открываем редактор через UI менеджер
        if (this.isEditorMode) {
            this.ui.showCityEditor(city.cityData);
        }

        // 3. Логика Phaser (камера и маршруты)
        this.highlightRoutes(city.cityData.id);
        this.cameras.main.pan(city.x, city.y, 800, 'Power2');
    }

    async saveCityData() {
        const id = parseInt(document.getElementById('edit-city-id').value);
        const cityObj = this.cities.find(c => c.cityData.id === id);
        
        if (cityObj) {
            const data = cityObj.cityData;
            
            // Обновляем данные из полей ввода
            data.name = document.getElementById('edit-city-name').value;
            data.population = parseInt(document.getElementById('edit-city-population').value) || 0;
            data.description = document.getElementById('edit-city-desc').value;
            data.country_id = parseInt(document.getElementById('edit-city-country').value);

             // 1. Сбор данных экономики из динамических списков
            const economyData = this.ui.getEconomyData();

            // 2. Отправка на сервер
            try {
                const successCity = await this.dataService.saveCity(data);
                const successEconomy = await this.dataService.saveCityEconomy(id, economyData);

                if (successCity && successEconomy) {
                    // Обновляем локальный кэш данных в сцене
                    this.routesData.cityEconomy = (this.routesData.cityEconomy || []).filter(e => e.city_id !== id);
                    economyData.forEach(e => {
                        this.routesData.cityEconomy.push({ city_id: id, ...e });
                    });

                    this.ui.showNotification(`Данные города ${data.name} сохранены`, 'success');
                    this.refreshMap();
                }
            } catch (err) {
                console.error("Ошибка сохранения:", err);
                this.ui.showNotification('Ошибка при связи с сервером', 'error');
            }
        }
    }

    async deleteCityData() {
        const id = parseInt(document.getElementById('edit-city-id').value);
        if (!id) return;

        // 1. Сначала спрашиваем подтверждение
        if (!confirm('Удаление города приведет к уничтожению всех связанных торговых путей. Продолжить?')) return;

        try {
            // 2. Находим все маршруты, связанные с этим городом
            const routesToDelete = this.routesData.routes.filter(r => 
                r.from_id === id || r.to_id === id
            );

            // 3. Удаляем маршруты из базы данных (параллельно)
            if (routesToDelete.length > 0) {
                this.ui.showNotification(`Удаление связанных путей (${routesToDelete.length})...`, 'info');
                
                // Promise.all запускает все запросы сразу и ждет их завершения
                await Promise.all(routesToDelete.map(route => 
                    this.dataService.deleteRoute(route.id)
                ));

                // Чистим маршруты в локальных данных
                this.routesData.routes = this.routesData.routes.filter(r => 
                    r.from_id !== id && r.to_id !== id
                );
            }

            // 4. Удаляем сам город из базы данных
            const citySuccess = await this.dataService.deleteCity(id);

            if (citySuccess) {
                // Удаляем город из локальных данных
                this.routesData.cities = this.routesData.cities.filter(c => c.id !== id);

                // 5. Сбрасываем выделение и скрываем редакторы
                this.selectedCity = null;
                this.selectedRoute = null;

                // 6. ПОЛНОЕ ОБНОВЛЕНИЕ ВИЗУАЛА
                this.refreshMap();   // Перерисовать города
                await this.refreshScene(); // Перерисовать пути и караваны (удалит лишние линии)

                this.ui.showNotification('Город и связанные пути удалены', 'success');
            } else {
                this.ui.showNotification('Ошибка при удалении города', 'error');
            }

        } catch (err) {
            console.error("Ошибка при полном удалении города:", err);
            this.ui.showNotification('Произошла ошибка при очистке данных', 'error');
        }
    }
    
    highlightRoutes(cityId) {
        if (this.highlightGraphics) this.highlightGraphics.clear();
        else this.highlightGraphics = this.add.graphics().setDepth(3);

        const connected = this.routes.filter(r => 
        r.routeData.from_id === cityId || r.routeData.to_id === cityId
    );
        
        connected.forEach(route => {
            route.draw(this.highlightGraphics, true);
        });
    }
    
    update(time, delta) {
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


        const dt = (delta / 1000) * (window.gameSpeed || 1);

        // БЛОК 1: ЭКОНОМИКА (каждую 1 секунду)
        this.economyTimer = (this.economyTimer || 0) + dt;
        if (this.economyTimer >= 1) {
            this.processEconomy();
            this.economyTimer = 0; // СБРОС ТАЙМЕРА ЭКОНОМИКИ
            // console.log("Экономический тик (1 сек)");
        }

        // БЛОК 2: СОХРАНЕНИЕ В БД (каждые 30 секунд)
        this.saveTimer = (this.saveTimer || 0) + dt;
        if (this.saveTimer >= 30) {
            this.saveAllStorages(); // Вызываем новый метод
            this.saveTimer = 0;
        }

        // БЛОК 3: ОБНОВЛЕНИЕ КАРАВАНОВ (вычисление на основе времени)
        // Обновляем каждый кадр для плавности
        this.routes.forEach(route => {
            if (route.caravans.length > 0) {
                route.updateCaravans(delta);
            }
        });
    }

    saveAllStorages() {
        // Собираем данные со всех складов всех городов
        const allInventoryData = [];
        
        this.cities.forEach(city => {
            if (city.storage) {
                const cityData = city.storage.getSaveData();
                allInventoryData.push(...cityData);
            }
        });

        if (allInventoryData.length > 0) {
            this.dataService.saveAllInventory(allInventoryData);
            console.log("💾 [СИСТЕМА] Все склады синхронизированы с БД");
        }
    }

    processEconomy() {
        this.cities.forEach(city => {
            // Получаем правила именно для этого города
            const rules = (this.routesData.cityEconomy || []).filter(e =>
                Number(e.city_id) === Number(city.cityData.id)
            );

            // Город сам управляет своим складом
            city.storage.processCycle(rules);
        });

        // Обновляем UI если нужно
        if (this.selectedCity && this.viewingType === 'city') {
            this.ui.updateCityInfo(this.selectedCity.cityData, this.routes);
        }
    }

    async refreshScene() {
        // 1. Уничтожаем все старые маршруты (они сами почистят свои караваны)
        if (this.routes) {
            this.routes.forEach(r => r.destroy());
        }

        // 2. Создаем их заново из актуальных данных
        this.routes = this.routesData.routes.map(data => new Route(this, data));

        // 3. Перерисовываем
        this.drawAllRoutes();

        // 4. Запускаем караваны
        await this.createFollowers();
    }

    selectRouteById(id) {
        const routeObj = this.routes.find(r => r.routeData.id === id);
        if (!routeObj) return;
        
        this.selectedRoute = routeObj.routeData;

        if (this.isEditorMode) {
            this.ui.showRouteEditor(routeObj.routeData);
            this.showRouteHandles(routeObj.routeData); 
        }
        this.drawAllRoutes(); 
    }

    async saveCountryData() {
        const id = parseInt(document.getElementById('edit-country-id').value);
        // Ищем объект данных в локальном хранилище
        const countryData = this.routesData.countries.find(c => c.id === id);
        
        if (countryData) {
            // 1. Обновляем локальный объект данными из полей ввода
            countryData.name = document.getElementById('edit-country-name').value;
            countryData.race = document.getElementById('edit-country-race').value;
            countryData.religion = document.getElementById('edit-country-religion').value;
            countryData.population = parseInt(document.getElementById('edit-country-pop').value) || 0;
            countryData.culture = parseInt(document.getElementById('edit-country-culture').value) || 0;
            countryData.militancy = parseInt(document.getElementById('edit-country-militancy').value) || 0;
            countryData.angle = parseInt(document.getElementById('edit-country-angle').value) || 0;

            try {
                // 2. Отправляем на сервер только данные этой страны
                const success = await this.dataService.saveCountry(countryData);

                if (success) {
                    // 3. Перерисовываем надписи на карте, чтобы отразить изменения (имя, наклон)
                    this.createCountries(this.routesData.countries); 
                    
                    this.ui.showNotification(`Держава ${countryData.name} успешно сохранена`, 'success');
                } else {
                    this.ui.showNotification('Ошибка сохранения данных страны', 'error');
                }
            } catch (err) {
                console.error("Ошибка при сохранении страны:", err);
                this.ui.showNotification('Сервер не отвечает', 'error');
            }
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
        this.ui.showCountryEditor(newCountry);
    }

    async createNewRoute(fromId, toId) {
        const newId = this.routesData.routes.length > 0
            ? Math.max(...this.routesData.routes.map(r => r.id)) + 1 : 1;

        const newRoute = {
            id: newId,
            from_id: fromId,
            to_id: toId,
            type: "track",
            points: [],
            speedCoeff: 1.0,
            unitCount: 3
        };

        this.routesData.routes.push(newRoute);

        // Перерисовываем всё
        await this.refreshScene();

        // Сразу выбираем этот путь для редактирования
        this.selectRouteById(newId);

        // Сохраняем на сервер
        this.dataService.saveRoute(newRoute);
        
        console.log(`Путь ID:${newId} создан успешно.`);
    }

    // Метод полной перерисовки всех границ
    redrawBorders() {
        if (!this.borderLayer) {
            console.error("Ошибка: Попытка рисовать границы до создания borderLayer");
            return;
        }
        
        this.borderLayer.clear();
        console.log(`Отрисовка всех границ... Всего объектов: ${this.borders.length}`);

        this.borders.forEach((border, index) => {
            border.drawToCanvas(this.borderLayer, this.dashStamp);
        });
    }

    // Функция создания новой границы (вызывается из UI)
    async createNewBorder() {
        const countryId = parseInt(document.getElementById('edit-country-id').value) || 0;
        const cam = this.cameras.main;
        
        // Генерируем новый ID (можно просто Date.now())
        const newId = Date.now();

        const newBorderData = {
            id: newId,
            country_id: countryId,
            points: [
                [Math.round(cam.worldView.centerX - 100), Math.round(cam.worldView.centerY)],
                [Math.round(cam.worldView.centerX + 100), Math.round(cam.worldView.centerY)]
            ]
        };

        const border = new Border(this, newBorderData);
        this.borders.push(border);
        
        // Сохраняем в БД сразу после создания
        await this.dataService.saveBorder(newBorderData);
        
        this.redrawBorders();
        this.selectBorder(border);
        this.ui.showNotification('Граница создана и сохранена');
    }

    selectBorder(border) {
        this.selectedBorder = border;
        
        // Очищаем старые точки
        this.editHandles.forEach(h => h.destroy());
        this.editHandles = [];

        // Создаем новые точки для управления
        border.points.forEach((p, index) => {
            const handle = this.add.circle(p[0], p[1], 10, 0xff00ff)
                .setInteractive({ draggable: true, useHandCursor: true })
                .setDepth(1000)
                .setData('type', 'borderHandle')
                .setData('index', index)
                .setData('borderParent', border);

            this.editHandles.push(handle);
        });
    }

    /**
     * Очистка при остановке сцены (предотвращает утечки памяти)
     */
    shutdown() {
        // Удаляем все обработчики событий ввода
        this.input.off('pointerdown');
        this.input.off('pointermove');
        this.input.off('pointerup');
        this.input.off('drag');
        this.input.off('dragend');
        this.input.off('wheel');
        this.input.off('gameout');

        // Очищаем таймеры
        if (this.ambientSound) {
            this.ambientSound.stop();
            this.ambientSound.destroy();
        }

        // Удаляем все маршруты и караваны
        if (this.routes) {
            this.routes.forEach(r => r.destroy());
            this.routes = [];
        }

        // Удаляем все города
        if (this.cities) {
            this.cities.forEach(city => {
                if (city.label) city.label.destroy();
                if (city.destroy) city.destroy();
            });
            this.cities = [];
        }

        // Удаляем границы
        if (this.editHandles) {
            this.editHandles.forEach(h => h.destroy());
            this.editHandles = [];
        }

        // Очищаем графику
        if (this.routeGraphics) this.routeGraphics.destroy();
        if (this.highlightGraphics) this.highlightGraphics.destroy();
        if (this.ghostGraphics) this.ghostGraphics.destroy();
        if (this.borderLayer) this.borderLayer.destroy();

        // Сбрасываем ссылки
        this.selectedCity = null;
        this.selectedRoute = null;
        this.selectedBorder = null;
    }
}