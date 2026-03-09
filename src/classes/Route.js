// src/classes/Route.js
import Caravan from './Caravan.js';

export default class Route {
    constructor(scene, routeData) {
        this.scene = scene;
        this.routeData = routeData;
        this.curve = null;
        this.caravans = []; // Массив объектов {sprite, serverId}

        this.updateCurve();
    }

    /**
     * Создает или обновляет математическую кривую пути
     */
    updateCurve() {
        const startCity = this.scene.cities.find(c => c.cityData.id === this.routeData.from_id);
        const endCity = this.scene.cities.find(c => c.cityData.id === this.routeData.to_id);

        if (!startCity || !endCity) {
            console.warn(`Города для маршрута ${this.routeData.id} не найдены`);
            return;
        }

        const allPoints = [new Phaser.Math.Vector2(startCity.x, startCity.y)];
        if (this.routeData.points) {
            this.routeData.points.forEach(p => allPoints.push(new Phaser.Math.Vector2(p[0], p[1])));
        }
        allPoints.push(new Phaser.Math.Vector2(endCity.x, endCity.y));

        this.curve = new Phaser.Curves.Spline(allPoints);
    }

    /**
     * Отрисовка линии маршрута
     */
    draw(graphics, isSelected) {
        if (!this.curve) return;

        const color = (this.routeData.type === 'water' ? 0xaaaaff : 0x6b4e31);
        const alpha = isSelected ? 1.0 : 0.4;
        const width = isSelected ? 4 : 2;

        graphics.lineStyle(width, isSelected ? 0x00ff00 : color, alpha);

        if (this.routeData.type === 'water') {
            const pathLength = this.curve.getLength();
            const segmentLength = 12;
            const divisions = Math.max(1, Math.floor(pathLength / segmentLength));
            const points = this.curve.getSpacedPoints(divisions);

            for (let i = 0; i < points.length - 1; i += 2) {
                graphics.lineBetween(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
            }
        } else {
            this.curve.draw(graphics);
        }
    }

    /**
     * Инициализация караванов с сервера
     */
    async initCaravansFromServer() {
        this.clearCaravans();

        const result = await this.scene.caravanService.initCaravans(this.routeData.id);
        if (result && result.caravans) {
            console.log(`Инициализировано ${result.caravans.length} караванов для маршрута ${this.routeData.id}`);
        }
    }

    /**
     * Синхронизация караванов с сервером
     */
    async syncCaravans(serverCaravans) {
        const transport = this.scene.routesData.transportTypes.find(t =>
            Number(t.id) === Number(this.routeData.transport_id)
        ) || this.scene.routesData.transportTypes[0];

        // Фильтруем караваны только для этого маршрута
        const routeCaravans = serverCaravans.filter(c => Number(c.route_id) === Number(this.routeData.id));

        // Синхронизируем каждый караван
        for (const serverCaravan of routeCaravans) {
            let caravanObj = this.caravans.find(c => c.serverId === serverCaravan.id);

            if (!caravanObj) {
                // Вычисляем travel_time на основе данных маршрута
                const travelTime = this.calculateTravelTime();
                
                // Создаем новый караван с данными от сервера, передаём ссылку на этот Route
                const caravanSprite = new Caravan(
                    this.scene, 
                    serverCaravan.x || 0, 
                    serverCaravan.y || 0, 
                    transport, 
                    this.routeData,
                    {
                        ...serverCaravan,
                        travel_time: travelTime
                    },
                    this  // Передаём ссылку на Route
                );

                caravanObj = {
                    sprite: caravanSprite,
                    serverId: serverCaravan.id
                };

                this.caravans.push(caravanObj);
            } else {
                // Обновляем существующий караван
                caravanObj.sprite.updateFromServer(serverCaravan, false);
            }
        }

        // Удаляем караваны, которых нет на сервере
        const serverIds = new Set(routeCaravans.map(c => c.id));
        const toRemove = this.caravans.filter(c => !serverIds.has(c.serverId));
        for (const c of toRemove) {
            if (c.sprite) c.sprite.destroy();
        }
        this.caravans = this.caravans.filter(c => serverIds.has(c.serverId));
    }

    /**
     * Расчёт времени пути в мс
     */
    calculateTravelTime() {
        const transport = this.scene.routesData.transportTypes.find(t =>
            Number(t.id) === Number(this.routeData.transport_id)
        );
        if (!transport || !transport.speed) return 3600000; // 1 час по умолчанию

        const speed = transport.speed * (this.routeData.speedCoeff || 1.0); // км/ч
        const distance = this.getFullRouteDistance(); // пиксели (полный маршрут)
        const distanceKm = distance * 0.1; // км

        // Время в мс = (дистанция / скорость) * 3600000
        return (distanceKm / speed) * 3600000;
    }

    /**
     * Расчёт длины ПОЛНОГО маршрута в пикселях (from_id -> points -> to_id)
     */
    getFullRouteDistance() {
        const startCity = this.scene.cities.find(c => c.cityData.id === this.routeData.from_id);
        const endCity = this.scene.cities.find(c => c.cityData.id === this.routeData.to_id);
        
        if (!startCity || !endCity) return 100;

        // Собираем все точки: start -> intermediate -> end
        const allPoints = [
            { x: startCity.x, y: startCity.y },
            ...(this.routeData.points || []).map(p => ({ x: p[0], y: p[1] })),
            { x: endCity.x, y: endCity.y }
        ];
        
        if (allPoints.length < 2) return 100;

        let distance = 0;
        for (let i = 1; i < allPoints.length; i++) {
            const dx = allPoints[i].x - allPoints[i-1].x;
            const dy = allPoints[i].y - allPoints[i-1].y;
            distance += Math.sqrt(dx * dx + dy * dy);
        }
        return distance;
    }

    /**
     * Расчёт длины маршрута в пикселях (только points - устарело)
     */
    getRouteDistance() {
        const points = this.routeData.points || [];
        if (points.length < 2) return 100;

        let distance = 0;
        for (let i = 1; i < points.length; i++) {
            const dx = points[i][0] - points[i-1][0];
            const dy = points[i][1] - points[i-1][1];
            distance += Math.sqrt(dx * dx + dy * dy);
        }
        return distance;
    }

    /**
     * Обновление позиций всех караванов (вычисление на основе времени)
     */
    updateCaravans(delta) {
        for (const caravanObj of this.caravans) {
            caravanObj.sprite.updateByTime(delta);
        }
    }

    /**
     * Обновление каравана от сервера
     */
    updateCaravanFromServer(serverId, serverState) {
        const caravanObj = this.caravans.find(c => c.serverId === serverId);
        if (caravanObj && serverState) {
            caravanObj.sprite.updateFromServer(serverState, true);
        }
    }

    /**
     * Отладка: проверка обновления
     */
    debugUpdate() {
        if (this.caravans.length > 0) {
            const c = this.caravans[0].sprite;
            console.log(`[Route ${this.routeData.id}] Караван ${c.id}: progress=${c.progress}%, targetX=${c.targetX}, targetY=${c.targetY}`);
        }
    }

    refreshCityUI() {
        if (this.scene.selectedCity && this.scene.viewingType === 'city') {
            this.scene.ui.updateCityInfo(this.scene.selectedCity.cityData, this.scene.routes);
        }
    }

    clearCaravans() {
        this.caravans.forEach(c => {
            if (c.sprite) {
                c.sprite.destroy(true);
                c.sprite = null;
            }
        });
        this.caravans = [];
    }

    destroy() {
        this.clearCaravans();
    }
}
