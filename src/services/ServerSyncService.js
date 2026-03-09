/**
 * ServerSyncService — сервис синхронизации клиента с сервером
 * Управляет WebSocket соединением, буферизацией и интерполяцией
 */

export const RECONNECT_DELAY = 1000;
export const RECONNECT_MAX_DELAY = 30000;
export const INTERPOLATION_DELAY = 0; // Отключаем задержку, используем прямую интерполяцию
export const LERP_FACTOR = 0.15; // Коэффициент сглаживания

export default class ServerSyncService {
    constructor(scene) {
        this.scene = scene;
        this.ws = null;
        this.connected = false;
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.pingTimer = null;
        this.lastPingTime = 0;
        this.pingInterval = 5000;
        
        // Буфер состояний для интерполяции
        this.caravanBuffer = new Map(); // id -> [{tick, x, y, progress, state}, ...]
        
        // Текущее состояние мира
        this.worldState = {
            tick: 0,
            cities: [],
            routes: [],
            countries: [],
            borders: [],
            caravans: []
        };

        // Viewport клиента
        this.viewport = { x: 0, y: 0, width: 0, height: 0 };
        this.viewportUpdateInterval = null;

        // Слушатели событий
        this.eventListeners = new Map();
        
        // Синхронизация времени
        this.serverTimeOffset = 0; // Разница между клиентом и сервером

        this.wsUrl = this.getWebSocketUrl();
    }

    /**
     * Получение WebSocket URL
     */
    getWebSocketUrl() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}`;
    }

    /**
     * Подключение к серверу
     */
    connect() {
        if (this.ws?.readyState === WebSocket.OPEN) return;

        console.log('[ServerSync] Подключение к', this.wsUrl);
        
        try {
            this.ws = new WebSocket(this.wsUrl);

            this.ws.onopen = () => this.onOpen();
            this.ws.onmessage = (event) => this.onMessage(event);
            this.ws.onclose = () => this.onClose();
            this.ws.onerror = (err) => this.onError(err);

        } catch (err) {
            console.error('[ServerSync] Ошибка создания WebSocket:', err);
            this.scheduleReconnect();
        }
    }

    /**
     * Отключение от сервера
     */
    disconnect() {
        this.stopReconnect();
        this.stopViewportUpdates();
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
        this.emit('disconnected');
    }

    /**
     * Обработка открытия соединения
     */
    onOpen() {
        console.log('[ServerSync] Соединение установлено');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.emit('connected');
        this.updateConnectionUI('connected');
        
        // Запускаем пинг
        this.startPing();
        
        // Запускаем обновление viewport
        this.startViewportUpdates();
    }

    /**
     * Обновление UI индикатора соединения
     */
    updateConnectionUI(state) {
        const statusEl = document.getElementById('connection-status');
        const textEl = statusEl?.querySelector('.status-text');
        const dotEl = statusEl?.querySelector('.status-dot');
        
        if (!statusEl) return;
        
        statusEl.classList.remove('connected', 'disconnected', 'reconnecting');
        
        switch (state) {
            case 'connected':
                statusEl.classList.add('connected');
                if (textEl) textEl.textContent = 'Подключено';
                break;
            case 'disconnected':
                statusEl.classList.add('disconnected');
                if (textEl) textEl.textContent = 'Нет соединения';
                break;
            case 'reconnecting':
                statusEl.classList.add('reconnecting');
                if (textEl) textEl.textContent = 'Переподключение...';
                break;
            default:
                if (textEl) textEl.textContent = 'Подключение...';
        }
    }

    /**
     * Обработка входящих сообщений
     */
    onMessage(event) {
        try {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        } catch (err) {
            console.error('[ServerSync] Ошибка парсинга сообщения:', err);
        }
    }

    /**
     * Обработка сообщения от сервера
     */
    handleMessage(message) {
        // Синхронизация времени если сервер прислал своё время
        if (message.data?.server_time) {
            this.serverTimeOffset = message.data.server_time - Date.now();
        }
        
        switch (message.type) {
            case 'full_state':
                this.onFullState(message.data);
                break;

            case 'tick':
                this.onTick(message.data);
                break;

            case 'time_sync':
                this.onTimeSync(message.data);
                break;

            case 'caravan_spawn':
                this.onCaravanSpawn(message.data);
                break;

            case 'caravan_arrived':
                this.onCaravanArrived(message.data);
                break;

            case 'caravan_trading':
                this.onCaravanTrading(message.data);
                break;

            case 'trade_complete':
                this.onTradeComplete(message.data);
                break;

            case 'pong':
                this.onPong(message.timestamp);
                break;
        }
    }

    /**
     * Получение полного состояния мира
     */
    onFullState(state) {
        console.log('[ServerSync] Получено полное состояние мира:', state);
        this.worldState = state;
        
        // Инициализируем буфер для каждого каравана
        for (const caravan of state.caravans) {
            this.caravanBuffer.set(caravan.id, [{
                tick: state.tick,
                x: caravan.x,
                y: caravan.y,
                progress: caravan.progress,
                state: caravan.state
            }]);
        }
        
        this.emit('worldLoaded', state);
    }

    /**
     * Обработка тика от сервера
     */
    onTick(data) {
        this.worldState.tick = data.tick;
        if (data.serverTime) {
            this.lastServerTime = data.serverTime;
        }
        this.emit('tick', data);
    }

    /**
     * Синхронизация времени
     */
    onTimeSync(data) {
        this.lastServerTime = data.serverTime;
        this.worldState.tick = data.tick;
    }

    /**
     * Появление нового каравана
     */
    onCaravanSpawn(data) {
        // Добавляем караван в буфер с начальными данными
        this.caravanBuffer.set(data.id, [{
            tick: this.worldState.tick,
            x: data.x,
            y: data.y,
            progress: data.progress,
            state: data.state,
            started_at: data.started_at,
            travel_time: data.travel_time,
            route_id: data.route_id
        }]);
        this.emit('caravanSpawned', data);
    }

    /**
     * Прибытие каравана
     */
    onCaravanArrived(data) {
        this.emit('caravanArrived', data);
    }

    /**
     * Начало торговли
     */
    onCaravanTrading(data) {
        this.emit('caravanTrading', data);
    }

    /**
     * Завершение торговли - разворот каравана
     */
    onTradeComplete(data) {
        // Обновляем данные каравана для обратного пути
        const buffer = this.caravanBuffer.get(data.id);
        if (buffer && buffer.length > 0) {
            // Сбрасываем started_at для нового пути
            buffer[0].started_at = Date.now();
            buffer[0].progress = 0;
            buffer[0].from_id = data.from_id;
            buffer[0].to_id = data.to_id;
        }
        this.emit('tradeComplete', data);
    }

    /**
     * Добавление снимка состояния каравана в буфер
     */
    addCaravanSnapshot(id, snapshot) {
        if (!this.caravanBuffer.has(id)) {
            this.caravanBuffer.set(id, []);
        }

        const buffer = this.caravanBuffer.get(id);
        buffer.push(snapshot);

        // Храним только последние 10 снимков
        if (buffer.length > 10) {
            buffer.shift();
        }
    }

    /**
     * Получение позиции каравана на основе времени
     */
    getCaravanStateAtTime(id) {
        const buffer = this.caravanBuffer.get(id);
        if (!buffer || buffer.length === 0) return null;

        const caravanData = buffer[0]; // Берём начальные данные
        
        // Если нет времени отправления — возвращаем как есть
        if (!caravanData.started_at) {
            return caravanData;
        }

        // Вычисляем прогресс на основе времени
        const now = Date.now();
        const elapsed = now - caravanData.started_at;
        
        // Если караван ещё не начал движение
        if (elapsed < 0) {
            return { ...caravanData, progress: 0 };
        }

        // Вычисляем прогресс в процентах
        const progress = Math.min(100, (elapsed / caravanData.travel_time) * 100);
        
        return {
            ...caravanData,
            progress: progress,
            state: progress >= 100 ? 'arrived' : caravanData.state
        };
    }

    /**
     * Обработка закрытия соединения
     */
    onClose() {
        console.log('[ServerSync] Соединение закрыто');
        this.connected = false;
        this.stopPing();
        this.emit('disconnected');
        this.updateConnectionUI('disconnected');
        
        // Пытаемся переподключиться
        this.scheduleReconnect();
    }

    /**
     * Обработка ошибок
     */
    onError(err) {
        console.error('[ServerSync] Ошибка WebSocket:', err);
        this.emit('error', err);
    }

    /**
     * Обработка pong от сервера
     */
    onPong(timestamp) {
        const latency = Date.now() - timestamp;
        this.emit('ping', { latency, timestamp });
    }

    /**
     * Запуск пинга
     */
    startPing() {
        this.stopPing();
        this.pingTimer = setInterval(() => {
            if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
                this.send({ type: 'ping', timestamp: Date.now() });
            }
        }, this.pingInterval);
    }

    /**
     * Остановка пинга
     */
    stopPing() {
        if (this.pingTimer) {
            clearInterval(this.pingTimer);
            this.pingTimer = null;
        }
    }

    /**
     * Запуск обновления viewport
     */
    startViewportUpdates() {
        this.stopViewportUpdates();
        
        const updateViewport = () => {
            if (!this.connected || !this.scene?.cameras?.main) return;
            
            const camera = this.scene.cameras.main;
            const newViewport = {
                x: camera.scrollX,
                y: camera.scrollY,
                width: camera.width / camera.zoom,
                height: camera.height / camera.zoom
            };

            // Отправляем только если viewport изменился значительно
            const dx = Math.abs(newViewport.x - this.viewport.x);
            const dy = Math.abs(newViewport.y - this.viewport.y);
            
            if (dx > 50 || dy > 50) {
                this.viewport = newViewport;
                this.send({
                    type: 'viewport_update',
                    viewport: this.viewport
                });
            }
        };

        updateViewport();
        this.viewportUpdateInterval = setInterval(updateViewport, 500);
    }

    /**
     * Остановка обновления viewport
     */
    stopViewportUpdates() {
        if (this.viewportUpdateInterval) {
            clearInterval(this.viewportUpdateInterval);
            this.viewportUpdateInterval = null;
        }
    }

    /**
     * Планирование переподключения
     */
    scheduleReconnect() {
        this.stopReconnect();
        
        const delay = Math.min(
            RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
            RECONNECT_MAX_DELAY
        );
        
        this.reconnectAttempts++;
        console.log(`[ServerSync] Переподключение через ${delay}мс (попытка ${this.reconnectAttempts})`);
        
        this.updateConnectionUI('reconnecting');
        this.emit('reconnecting', { delay, attempt: this.reconnectAttempts });
        
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }

    /**
     * Остановка переподключения
     */
    stopReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    /**
     * Отправка сообщения на сервер
     */
    send(data) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify(data));
            } catch (err) {
                console.error('[ServerSync] Ошибка отправки:', err);
            }
        }
    }

    /**
     * Отправка действия игрока
     */
    sendAction(actionType, actionData) {
        this.send({
            type: 'action',
            action: {
                type: actionType,
                ...actionData
            }
        });
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

    /**
     * Получить текущее серверное время (с учётом оффсета)
     */
    getServerTime() {
        return Date.now() + this.serverTimeOffset;
    }

    /**
     * Статус соединения
     */
    isConnected() {
        return this.connected && this.ws?.readyState === WebSocket.OPEN;
    }

    /**
     * Получить пинг
     */
    getPing() {
        return Date.now() - this.lastPingTime;
    }
}
