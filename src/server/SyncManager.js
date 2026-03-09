/**
 * SyncManager — менеджер синхронизации с клиентами
 * Управляет подключениями, viewport и отправкой обновлений
 */

export const VIEWPORT_UPDATE_INTERVAL = 500; // Обновление viewport каждые 500мс
export const STATE_BROADCAST_INTERVAL = 50; // Отправка состояния каждые 50мс (20 раз в секунду)

export default class SyncManager {
    constructor(worldState, gameLoop, wsServer) {
        this.world = worldState;
        this.gameLoop = gameLoop;
        this.wsServer = wsServer;
        this.clients = new Map(); // clientId -> { ws, viewport, lastUpdate }
        this.clientIdCounter = 0;
    }

    /**
     * Инициализация менеджера
     */
    initialize() {
        // Подписка на события игрового цикла
        this.gameLoop.on('tick', (data) => this.onTick(data));
        this.gameLoop.on('caravansArrived', (caravans) => this.onCaravansArrived(caravans));
        this.gameLoop.on('caravansTrading', (caravans) => this.onCaravansTrading(caravans));
        this.gameLoop.on('tradeComplete', (caravan) => this.onTradeComplete(caravan));

        // Периодическая отправка состояния (теперь только для синхронизации времени)
        setInterval(() => this.broadcastState(), STATE_BROADCAST_INTERVAL);

        console.log('[SyncManager] Инициализирован');
    }

    /**
     * Добавление нового клиента
     */
    addClient(ws) {
        const clientId = ++this.clientIdCounter;
        const client = {
            id: clientId,
            ws,
            viewport: null,
            lastViewportUpdate: 0,
            connectedAt: Date.now()
        };

        this.clients.set(clientId, client);

        // Отправляем полное состояние при подключении
        this.sendFullState(client);
        
        // Отправляем все активные караваны как новые
        this.sendActiveCaravans(client);

        console.log(`[SyncManager] Клиент ${clientId} подключен. Всего: ${this.clients.size}`);
        return clientId;
    }

    /**
     * Отправка активных караванов новому клиенту
     */
    sendActiveCaravans(client) {
        const activeCaravans = this.world.caravans.filter(c => 
            c.state === 'moving' && c.progress < 100
        );

        for (const caravan of activeCaravans) {
            const route = this.world.routes.find(r => r.id === caravan.route_id);
            if (!route) continue;

            // Вычисляем travel_time ТОЧНО ТАК ЖЕ как в GameLoop
            const travelTime = this.calculateTravelTimeForCaravan(caravan, route);

            // Корректируем started_at чтобы прогресс совпадал
            // Используем серверное время
            const serverTime = Date.now();
            const elapsed = (caravan.progress / 100) * travelTime;
            const adjustedStartedAt = serverTime - elapsed;

            this.send(client.ws, {
                type: 'caravan_spawn',
                data: {
                    id: caravan.id,
                    route_id: caravan.route_id,
                    x: caravan.x,
                    y: caravan.y,
                    progress: caravan.progress,
                    state: caravan.state,
                    started_at: adjustedStartedAt,
                    server_time: serverTime,  // Отправляем серверное время
                    travel_time: travelTime,
                    transport_id: caravan.transport_id,
                    from_id: caravan.from_id,
                    to_id: caravan.to_id
                }
            });
        }
    }

    /**
     * Расчёт времени пути для каравана (так же как в GameLoop)
     */
    calculateTravelTimeForCaravan(caravan, route) {
        const transport = this.world.transportTypes.find(t => t.id === caravan.transport_id);
        if (!transport || !transport.speed) return 3600000;

        const speed = transport.speed * (route.speedCoeff || 1.0);
        
        // Получаем координаты городов для полного маршрута
        const startCity = this.world.cities.find(c => c.id === route.from_id);
        const endCity = this.world.cities.find(c => c.id === route.to_id);
        
        if (!startCity || !endCity) return 3600000;

        // Собираем все точки: start -> intermediate -> end
        const allPoints = [
            { x: startCity.x, y: startCity.y },
            ...(route.points || []),
            { x: endCity.x, y: endCity.y }
        ];
        
        if (allPoints.length < 2) return 3600000;

        let distance = 0;
        for (let i = 1; i < allPoints.length; i++) {
            const dx = allPoints[i][0] - allPoints[i-1][0];
            const dy = allPoints[i][1] - allPoints[i-1][1];
            distance += Math.sqrt(dx * dx + dy * dy);
        }
        
        const distanceKm = distance * 0.1;
        // Время = дистанция / скорость * 3600000
        return (distanceKm / speed) * 3600000;
    }

    /**
     * Удаление клиента
     */
    removeClient(clientId) {
        const client = this.clients.get(clientId);
        if (client) {
            this.clients.delete(clientId);
            console.log(`[SyncManager] Клиент ${clientId} отключен. Всего: ${this.clients.size}`);
        }
    }

    /**
     * Обновление viewport клиента
     */
    updateViewport(clientId, viewport) {
        const client = this.clients.get(clientId);
        if (client) {
            client.viewport = viewport;
            client.lastViewportUpdate = Date.now();
        }
    }

    /**
     * Отправка полного состояния мира клиенту
     */
    sendFullState(client) {
        const state = client.viewport 
            ? this.world.getVisibleState(client.viewport)
            : this.world.getFullState();

        this.send(client.ws, {
            type: 'full_state',
            data: state
        });
    }

    /**
     * Обработка тика игрового цикла
     */
    onTick(data) {
        // Отправляем только номер тика для синхронизации времени
        this.broadcast({
            type: 'tick',
            data: { tick: data.tick, serverTime: Date.now() }
        }, true);
    }

    /**
     * Обработка прибытия караванов
     */
    onCaravansArrived(caravans) {
        for (const caravan of caravans) {
            this.broadcast({
                type: 'caravan_arrived',
                data: {
                    id: caravan.id,
                    route_id: caravan.route_id,
                    to_id: caravan.to_id,
                    arrivedAt: Date.now()
                }
            });
        }
    }

    /**
     * Обработка начала торговли
     */
    onCaravansTrading(caravans) {
        for (const caravan of caravans) {
            this.broadcast({
                type: 'caravan_trading',
                data: {
                    id: caravan.id,
                    route_id: caravan.route_id,
                    startedAt: Date.now()
                }
            });
        }
    }

    /**
     * Обработка завершения торговли
     */
    onTradeComplete(caravan) {
        this.broadcast({
            type: 'trade_complete',
            data: {
                id: caravan.id,
                route_id: caravan.route_id,
                from_id: caravan.from_id,
                to_id: caravan.to_id,
                progress: caravan.progress,
                returning: true // Флаг что караван едет обратно
            }
        });
    }

    /**
     * Периодическая рассылка состояния (только время для синхронизации)
     */
    broadcastState() {
        this.broadcast({
            type: 'time_sync',
            data: {
                serverTime: Date.now(),
                tick: this.world.tick
            }
        });
    }

    /**
     * Широковещательная рассылка
     */
    broadcast(message, onlyWithViewport = false) {
        for (const client of this.clients.values()) {
            if (!onlyWithViewport || client.viewport) {
                this.send(client.ws, message);
            }
        }
    }

    /**
     * Отправка сообщения клиенту
     */
    send(ws, message) {
        if (ws.readyState === 1) { // WebSocket.OPEN
            try {
                ws.send(JSON.stringify(message));
            } catch (err) {
                console.error('[SyncManager] Ошибка отправки:', err);
            }
        }
    }

    /**
     * Получить количество подключенных клиентов
     */
    getClientCount() {
        return this.clients.size;
    }

    /**
     * Получить данные клиента
     */
    getClient(clientId) {
        return this.clients.get(clientId);
    }
}
