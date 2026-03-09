/**
 * GameLoop — игровой цикл с фиксированным тиком
 * Обновляет позиции караванов и обрабатывает торговые операции
 */

export const TICK_RATE = 1000; // 1 тик в секунду
export const TRADE_DURATION = 5000; // 5 секунд на торговлю

export default class GameLoop {
    constructor(worldState) {
        this.world = worldState;
        this.interval = null;
        this.lastTick = Date.now();
        this.eventListeners = new Map();
    }

    /**
     * Запуск игрового цикла
     */
    start() {
        if (this.interval) return;

        console.log('[GameLoop] Запуск игрового цикла, тик каждые ' + TICK_RATE + 'мс');
        this.lastTick = Date.now();
        this.interval = setInterval(() => this.tick(), TICK_RATE);
    }

    /**
     * Остановка игрового цикла
     */
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
            console.log('[GameLoop] Остановлен');
        }
    }

    /**
     * Один тик игрового цикла
     */
    tick() {
        const now = Date.now();
        const deltaTime = now - this.lastTick;
        this.lastTick = now;

        this.world.incrementTick();

        // Обновляем все караваны
        this.updateCaravans(deltaTime);

        // Генерируем события для клиентов
        this.emit('tick', { tick: this.world.tick, deltaTime });
    }

    /**
     * Обновление позиций караванов
     */
    updateCaravans(deltaTime) {
        const arrivedCaravans = [];
        const tradingCaravans = [];

        for (const caravan of this.world.caravans) {
            const oldProgress = caravan.progress;
            const oldState = caravan.state;

            this.updateSingleCaravan(caravan, deltaTime);

            // Собираем события
            if (caravan.state === 'trading' && oldState !== 'trading') {
                tradingCaravans.push({ ...caravan });
            }
            
            if (caravan.progress >= 100 && oldProgress < 100) {
                arrivedCaravans.push({ ...caravan });
            }
        }

        // Отправляем события прибытия
        if (arrivedCaravans.length > 0) {
            this.emit('caravansArrived', arrivedCaravans);
        }
        
        // Отправляем события начала торговли
        if (tradingCaravans.length > 0) {
            this.emit('caravansTrading', tradingCaravans);
        }
    }

    /**
     * Обновление одного каравана
     */
    updateSingleCaravan(caravan, deltaTime) {
        // Если караван в состоянии торговли — отсчитываем время
        if (caravan.state === 'trading') {
            caravan.tradeProgress = (caravan.tradeProgress || 0) + deltaTime;

            if (caravan.tradeProgress >= TRADE_DURATION) {
                this.completeTrade(caravan);
            }
            return;
        }

        // Если караван завершил маршрут
        if (caravan.progress >= 100) {
            caravan.progress = 100;
            caravan.state = 'trading';
            caravan.tradeProgress = 0;
            this.emit('caravanArrived', caravan);
            return;
        }

        // Движение по маршруту
        const route = this.world.routes.find(r => r.id === caravan.route_id);
        if (!route) return;

        const speed = this.getCaravanSpeed(caravan, route); // км/ч
        const distance = route.distance || this.calculateRouteDistance(route); // пиксели

        // Конвертируем: 1 пиксель = 0.1 км
        const distanceKm = distance * 0.1;

        // Прогресс: (скорость * deltaTime) / (дистанция * 3600000) * 100%
        const progressDelta = (speed * deltaTime) / (distanceKm * 3600000) * 100;

        caravan.progress = Math.min(100, caravan.progress + progressDelta);
        caravan.x = this.calculatePosition(route, caravan.progress).x;
        caravan.y = this.calculatePosition(route, caravan.progress).y;

        // Проверка прибытия
        if (caravan.progress >= 100) {
            caravan.progress = 100;
            caravan.state = 'trading';
            caravan.tradeProgress = 0;
            this.emit('caravanArrived', caravan);
        }
    }

    /**
     * Завершение торговли и разворот каравана
     */
    completeTrade(caravan) {
        caravan.state = 'returning';
        caravan.progress = 0;
        caravan.tradeProgress = null;

        // Меняем направление: from <-> to
        const temp = caravan.from_id;
        caravan.from_id = caravan.to_id;
        caravan.to_id = temp;

        this.emit('tradeComplete', caravan);
    }

    /**
     * Расчёт времени пути в миллисекундах
     */
    calculateTravelTime(caravan, route) {
        const speed = this.getCaravanSpeed(caravan, route); // км/ч
        const distance = route.distance || this.calculateRouteDistance(route); // пиксели
        const distanceKm = distance * 0.1; // конвертируем в км

        // Время в часах = дистанция / скорость
        // Время в мс = время в часах * 3600000
        const travelTimeHours = distanceKm / speed;
        return travelTimeHours * 3600000;
    }

    /**
     * Расчёт скорости каравана
     */
    getCaravanSpeed(caravan, route) {
        const transport = this.world.transportTypes.find(t => t.id === caravan.transport_id);
        const baseSpeed = transport?.speed || 100; // км/ч
        const coeff = route.speedCoeff || 1.0;
        return baseSpeed * coeff;
    }

    /**
     * Расчёт длины ПОЛНОГО маршрута (from_id -> points -> to_id)
     */
    calculateRouteDistance(route) {
        if (route.distance) return route.distance;

        // Получаем координаты городов
        const startCity = this.world.cities.find(c => c.id === route.from_id);
        const endCity = this.world.cities.find(c => c.id === route.to_id);
        
        if (!startCity || !endCity) return 100;

        // Собираем все точки: start -> intermediate -> end
        const allPoints = [
            { x: startCity.x, y: startCity.y },
            ...(route.points || []),
            { x: endCity.x, y: endCity.y }
        ];
        
        if (allPoints.length < 2) return 100;

        let distance = 0;
        for (let i = 1; i < allPoints.length; i++) {
            const dx = allPoints[i][0] - allPoints[i-1][0];
            const dy = allPoints[i][1] - allPoints[i-1][1];
            distance += Math.sqrt(dx * dx + dy * dy);
        }

        // Конвертируем пиксели в условные километры (1 пиксель = 0.1 км)
        return distance * 0.1;
    }

    /**
     * Расчёт позиции на маршруте по прогрессу (использует полный маршрут)
     */
    calculatePosition(route, progress) {
        // Получаем координаты городов
        const startCity = this.world.cities.find(c => c.id === route.from_id);
        const endCity = this.world.cities.find(c => c.id === route.to_id);
        
        if (!startCity || !endCity) return { x: 0, y: 0 };

        // Собираем все точки: start -> intermediate -> end
        const allPoints = [
            [startCity.x, startCity.y],
            ...(route.points || []),
            [endCity.x, endCity.y]
        ];
        
        if (allPoints.length < 2) return { x: 0, y: 0 };

        // Ограничиваем прогресс от 0 до 100
        const clampedProgress = Math.max(0, Math.min(100, progress));
        
        // Если прогресс 0 или 100 - возвращаем крайние точки
        if (clampedProgress <= 0) return { x: startCity.x, y: startCity.y };
        if (clampedProgress >= 100) return { x: endCity.x, y: endCity.y };

        const totalSegments = allPoints.length - 1;
        const segmentProgress = (clampedProgress / 100) * totalSegments;
        const currentSegment = Math.floor(segmentProgress);
        const segmentT = segmentProgress - currentSegment;

        // Защита от выхода за границы массива
        const p1Index = Math.max(0, Math.min(currentSegment, allPoints.length - 2));
        const p2Index = Math.max(0, Math.min(currentSegment + 1, allPoints.length - 1));
        
        const p1 = allPoints[p1Index] || [0, 0];
        const p2 = allPoints[p2Index] || [0, 0];

        return {
            x: p1[0] + (p2[0] - p1[0]) * segmentT,
            y: p1[1] + (p2[1] - p1[1]) * segmentT
        };
    }

    /**
     * Подписка на события
     */
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    /**
     * Отписка от событий
     */
    off(event, callback) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) listeners.splice(index, 1);
        }
    }

    /**
     * Генерация события
     */
    emit(event, data) {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(cb => cb(data));
        }
    }
}
