export default class Caravan extends Phaser.GameObjects.Container {
    constructor(scene, x, y, transportData, routeData, caravanData, route) {
        super(scene, x, y);
        this.scene = scene;
        this.routeData = routeData;
        this.transportData = transportData;
        this.caravanData = caravanData || {};
        this.route = route; // Ссылка на объект Route для доступа к кривой

        // Идентификатор каравана для синхронизации
        this.id = caravanData?.id;
        this.route_id = caravanData?.route_id;

        // Физические свойства груза
        this.capacity = transportData.capacity || 1;
        this.cargoItem = null;
        this.cargoAmount = 0;

        // Состояние для серверной синхронизации
        this.progress = caravanData?.progress || 0;
        this.state = caravanData?.state || 'moving';
        this.targetX = x;
        this.targetY = y;
        this._lastLogProgress = 0;

        // Визуальные части (базовый спрайт и иконка)
        const texture = transportData.texture || 'caravan';
        this.baseSprite = scene.add.sprite(0, 0, texture);
        const baseScale = texture === 'ship' ? 0.05 : 0.1;
        this.baseSprite.setScale(baseScale);
        this.add(this.baseSprite);

        this.goodsIcon = scene.add.sprite(0, -20, '');
        this.goodsIcon.setScale(0.4);
        this.goodsIcon.setVisible(false);
        this.add(this.goodsIcon);

        scene.add.existing(this);
        this.setDepth(5);
        this.setupInteraction();
    }
    
    /**
     * Обновление позиции от сервера (с интерполяцией)
     */
    updateFromServer(serverState, smooth = true) {
        if (!serverState) return;

        this.progress = serverState.progress;
        this.state = serverState.state;

        if (smooth) {
            // Плавная интерполяция к новой позиции
            this.targetX = serverState.x;
            this.targetY = serverState.y;
        } else {
            // Мгновенное перемещение
            this.x = serverState.x;
            this.y = serverState.y;
            this.targetX = serverState.x;
            this.targetY = serverState.y;
        }

        // Обновляем визуальное отображение груза
        if (serverState.cargo) {
            this.loadCargo(serverState.cargo.item, serverState.cargo.amount);
        }
    }

    /**
     * Обновление позиции на основе времени (клиентская интерполяция)
     */
    updateByTime(delta) {
        if (!this.caravanData || !this.caravanData.started_at || !this.caravanData.travel_time) {
            return;
        }

        // Вычисляем прогресс на основе времени
        // Используем серверное время для синхронизации
        const gameSpeed = window.gameSpeed || 1.0;
        const serverTime = this.scene.serverSync?.getServerTime() || Date.now();
        const elapsed = (serverTime - this.caravanData.started_at) * gameSpeed;
        const rawProgress = Math.min(100, (elapsed / this.caravanData.travel_time) * 100);
        
        // Если караван едет обратно - инвертируем прогресс
        const progress = this.caravanData.returning ? (100 - rawProgress) : rawProgress;

        // Если караван прибыл (достиг конца текущего направления)
        if (rawProgress >= 100) {
            this.progress = 100;
            return;
        }

        this.progress = progress;

        // Получаем позицию на кривой
        if (this.scene && this.routeData && this.routeData.points) {
            const position = this.calculatePositionOnRoute(progress);
            this.targetX = position.x;
            this.targetY = position.y;

            // Вычисляем угол поворота
            const angle = this.calculateAngle(progress);
            this.setRotationAndFlip(angle);
        }

        // Применяем интерполяцию для плавности
        this.interpolate(delta);
    }

    /**
     * Расчёт позиции на маршруте по прогрессу
     */
    calculatePositionOnRoute(progress) {
        // Используем кривую из Route для правильного расчёта
        if (this.route && this.route.curve && typeof this.route.curve.getPointAt === 'function') {
            try {
                const t = Phaser.Math.Clamp(progress / 100, 0, 1);
                return this.route.curve.getPointAt(t);
            } catch (e) {
                // Если ошибка - используем резервный вариант
            }
        }
        
        // Резервный вариант: строим полный маршрут
        const startCity = this.scene.cities?.find(c => c.cityData?.id === this.routeData.from_id);
        const endCity = this.scene.cities?.find(c => c.cityData?.id === this.routeData.to_id);
        
        if (!startCity || !endCity) return { x: 0, y: 0 };

        const allPoints = [
            { x: startCity.x, y: startCity.y },
            ...(this.routeData.points || []).map(p => ({ x: p[0], y: p[1] })),
            { x: endCity.x, y: endCity.y }
        ];
        
        if (allPoints.length < 2) return { x: 0, y: 0 };

        const clampedProgress = Math.max(0, Math.min(100, progress));
        const totalSegments = allPoints.length - 1;
        const segmentProgress = (clampedProgress / 100) * totalSegments;
        const currentSegment = Math.floor(segmentProgress);
        const segmentT = segmentProgress - currentSegment;

        const p1Index = Math.max(0, Math.min(currentSegment, allPoints.length - 2));
        const p2Index = Math.max(0, Math.min(currentSegment + 1, allPoints.length - 1));

        const p1 = allPoints[p1Index];
        const p2 = allPoints[p2Index];

        return {
            x: p1.x + (p2.x - p1.x) * segmentT,
            y: p1.y + (p2.y - p1.y) * segmentT
        };
    }

    /**
     * Расчёт угла движения
     */
    calculateAngle(progress) {
        const pos1 = this.calculatePositionOnRoute(progress);
        const pos2 = this.calculatePositionOnRoute(Math.min(100, progress + 1));

        const dx = pos2.x - pos1.x;
        const dy = pos2.y - pos1.y;
        
        // Защита от деления на 0
        if (dx === 0 && dy === 0) return this.angle;

        return Phaser.Math.RadToDeg(Math.atan2(dy, dx));
    }

    /**
     * Плавная интерполяция позиции (вызывается каждый кадр)
     */
    interpolate(delta) {
        if (this.x !== this.targetX || this.y !== this.targetY) {
            const lerpFactor = 0.2; // Коэффициент сглаживания
            this.x += (this.targetX - this.x) * lerpFactor;
            this.y += (this.targetY - this.y) * lerpFactor;

            // Если близко к цели — устанавливаем точно
            if (Math.abs(this.targetX - this.x) < 0.5 && Math.abs(this.targetY - this.y) < 0.5) {
                this.x = this.targetX;
                this.y = this.targetY;
            }
        }
    }

    /**
     * Метод для плавного удаления
     */
    destroy() {
        // Удаляем частицы, если они есть
        if (this.particles) {
            this.particles.destroy();
            this.particles = null;
        }
        // Удаляем все эффекты постобработки
        if (this.postFX) {
            this.postFX.clear();
        }
        // Вызываем родительский destroy
        super.destroy();
    }

    // Метод для загрузки товара в "ящик"
    loadCargo(item, amount) {
        this.cargoItem = item;
        this.cargoAmount = amount;

        if (item && amount > 0) {
            if (this.scene.textures.exists(item.icon)) {
                this.goodsIcon.setTexture(item.icon);
                this.goodsIcon.setVisible(true);
            }
        } else {
            this.goodsIcon.setVisible(false);
        }
    }

    // Метод для полной выгрузки
    unloadCargo() {
        const data = { item: this.cargoItem, amount: this.cargoAmount };
        this.cargoItem = null;
        this.cargoAmount = 0;
        this.goodsIcon.setVisible(false);
        return data;
    }

    setupInteraction() {
        const width = this.baseSprite.width * this.baseSprite.scaleX;
        const height = this.baseSprite.height * this.baseSprite.scaleY;
        this.setSize(width, height);
        this.setInteractive({ useHandCursor: true });

        this.on('pointerdown', (pointer) => {
            pointer.event.stopPropagation();
            
            // Находим города для отображения имен
            const startCity = this.scene.cities.find(c => Number(c.cityData.id) === Number(this.routeData.from_id));
            const endCity = this.scene.cities.find(c => Number(c.cityData.id) === Number(this.routeData.to_id));
            
            // Формируем объект информации
            const info = {
                // Берем название прямо из данных транспорта (из таблицы transport_types)
                title: this.transportData.name || "Транспорт", 
                from: startCity?.cityData.name || "Неизвестно",
                to: endCity?.cityData.name || "Неизвестно",
                // Показываем товар и количество, если они есть
                good: this.cargoItem ? `${this.cargoItem.name} (${Math.round(this.cargoAmount)} ед.)` : 'Пусто (ищет товар)'
            };
            
            this.scene.viewingType = 'caravan'; 
            this.scene.ui.showCaravanInfo(info);
        });
    }

    setRotationAndFlip(angle) {
        this.setAngle(angle);

        // Если едем влево, переворачиваем всё содержимое контейнера по вертикали
        if (angle > 90 || angle < -90) {
            this.baseSprite.setFlipY(true);
            this.goodsIcon.setFlipY(true);
            // Корректируем позицию иконки, чтобы она не оказалась под повозкой при перевороте
            this.goodsIcon.setY(20); 
        } else {
            this.baseSprite.setFlipY(false);
            this.goodsIcon.setFlipY(false);
            this.goodsIcon.setY(-20);
        }
    }
}