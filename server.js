/**
 * Caravan Map Server
 * Express + WebSocket сервер для синхронизации игрового мира
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import cors from 'cors';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import WorldState from './src/server/WorldState.js';
import GameLoop from './src/server/GameLoop.js';
import SyncManager from './src/server/SyncManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// Глобальные объекты сервера
let worldState = null;
let gameLoop = null;
let syncManager = null;
let wss = null;

// ==================== REST API ====================

/**
 * Загрузка всех данных мира
 */
app.get('/api/load', async (req, res) => {
    try {
        const state = worldState.getFullState();
        res.json(state);
    } catch (err) {
        console.error('Ошибка загрузки мира:', err);
        res.status(500).json({ error: 'Failed to load world data' });
    }
});

/**
 * Получить видимые данные для viewport
 */
app.post('/api/viewport', async (req, res) => {
    try {
        const { x, y, width, height } = req.body;
        const viewport = { x, y, width, height };
        const state = worldState.getVisibleState(viewport);
        res.json(state);
    } catch (err) {
        console.error('Ошибка получения viewport:', err);
        res.status(500).json({ error: 'Failed to get viewport data' });
    }
});

// ==================== Города ====================

app.post('/api/cities', async (req, res) => {
    try {
        const city = req.body;
        // Вставка в БД
        const sql = `INSERT INTO cities (name, x, y, population, country_id, description) 
                     VALUES (?, ?, ?, ?, ?, ?)`;
        
        worldState.db.run(sql, [
            city.name, city.x, city.y, city.population || 1000, 
            city.country_id || 0, city.description || ''
        ], function(err) {
            if (err) {
                console.error('Ошибка сохранения города:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            
            city.id = this.lastID;
            worldState.cities.push(city);
            res.json({ success: true, id: this.lastID });
        });
    } catch (err) {
        console.error('Ошибка создания города:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/cities/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        worldState.db.run('DELETE FROM cities WHERE id = ?', [id], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            worldState.cities = worldState.cities.filter(c => c.id !== id);
            res.json({ success: true });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== Маршруты ====================

app.post('/api/routes', async (req, res) => {
    try {
        const route = req.body;
        const pointsStr = typeof route.points === 'string' 
            ? route.points 
            : JSON.stringify(route.points);
        
        const sql = `INSERT OR REPLACE INTO routes 
                     (id, from_id, to_id, points, type, transport_id, speedCoeff, unitCount) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        
        worldState.db.run(sql, [
            route.id || null, route.from_id, route.to_id, pointsStr,
            route.type, route.transport_id, route.speedCoeff || 1, route.unitCount || 1
        ], function(err) {
            if (err) {
                console.error('Ошибка сохранения маршрута:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            
            route.id = route.id || this.lastID;
            route.points = typeof route.points === 'string' 
                ? JSON.parse(route.points) 
                : route.points;
            
            // Обновляем в памяти
            const idx = worldState.routes.findIndex(r => r.id === route.id);
            if (idx >= 0) worldState.routes[idx] = route;
            else worldState.routes.push(route);
            
            res.json({ success: true, id: route.id });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/routes/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        
        // Удаляем караваны маршрута
        await new Promise((resolve) => {
            worldState.db.run('DELETE FROM caravans WHERE route_id = ?', [id], resolve);
        });
        worldState.caravans = worldState.caravans.filter(c => c.route_id !== id);
        
        // Удаляем маршрут
        worldState.db.run('DELETE FROM routes WHERE id = ?', [id], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            worldState.routes = worldState.routes.filter(r => r.id !== id);
            res.json({ success: true });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * Инициализация караванов для маршрута
 */
app.post('/api/routes/:id/init-caravans', async (req, res) => {
    try {
        const routeId = parseInt(req.params.id);
        const route = worldState.routes.find(r => r.id === routeId);
        
        if (!route) {
            res.status(404).json({ error: 'Route not found' });
            return;
        }

        // Удаляем старые караваны
        await new Promise((resolve) => {
            worldState.db.run('DELETE FROM caravans WHERE route_id = ?', [routeId], resolve);
        });
        worldState.caravans = worldState.caravans.filter(c => c.route_id !== routeId);

        // Создаем новые караваны согласно unitCount
        const count = route.unitCount || 1;
        const newCaravans = [];

        for (let i = 0; i < count; i++) {
            await new Promise((resolve) => {
                const startX = route.points?.[0]?.[0] || 0;
                const startY = route.points?.[0]?.[1] || 0;
                const startedAt = Date.now();

                const sql = `INSERT INTO caravans (route_id, progress, state, x, y, transport_id, from_id, to_id, cargo, started_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

                worldState.db.run(sql, [
                    routeId, 0, 'moving', startX, startY,
                    route.transport_id, route.from_id, route.to_id, null, startedAt
                ], function(err) {
                    if (err) {
                        console.error('Ошибка создания каравана:', err);
                        resolve(null);
                        return;
                    }

                    const caravan = {
                        id: this.lastID,
                        route_id: routeId,
                        progress: 0,
                        state: 'moving',
                        x: startX,
                        y: startY,
                        transport_id: route.transport_id,
                        from_id: route.from_id,
                        to_id: route.to_id,
                        cargo: null,
                        started_at: startedAt
                    };
                    worldState.caravans.push(caravan);
                    newCaravans.push(caravan);
                    resolve();
                });
            });
        }

        // Отправляем событие о появлении караванов клиентам
        if (syncManager && newCaravans.length > 0) {
            const route = worldState.routes.find(r => r.id === routeId);
            if (route) {
                const travelTime = calculateTravelTime(route);
                for (const caravan of newCaravans) {
                    syncManager.broadcast({
                        type: 'caravan_spawn',
                        data: {
                            id: caravan.id,
                            route_id: caravan.route_id,
                            x: caravan.x,
                            y: caravan.y,
                            progress: 0,
                            state: 'moving',
                            started_at: caravan.started_at,
                            travel_time: travelTime,
                            transport_id: caravan.transport_id,
                            from_id: caravan.from_id,
                            to_id: caravan.to_id
                        }
                    });
                }
            }
        }

        res.json({ success: true, caravans: newCaravans });
    } catch (err) {
        console.error('Ошибка инициализации караванов:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * Расчёт времени пути для маршрута
 */
function calculateTravelTime(route) {
    const transport = worldState.transportTypes.find(t => t.id === route.transport_id);
    if (!transport || !transport.speed) return 3600000; // 1 час по умолчанию

    const speed = transport.speed * (route.speedCoeff || 1.0); // км/ч
    const points = route.points || [];
    
    if (points.length < 2) return 3600000;

    let distance = 0;
    for (let i = 1; i < points.length; i++) {
        const dx = points[i][0] - points[i-1][0];
        const dy = points[i][1] - points[i-1][1];
        distance += Math.sqrt(dx * dx + dy * dy);
    }
    
    const distanceKm = distance * 0.1; // км
    return (distanceKm / speed) * 3600000; // мс
}

// ==================== Караваны ====================

app.get('/api/caravans', async (req, res) => {
    try {
        res.json(worldState.caravans);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/caravans/:id/update', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { deltaTime } = req.body;
        
        const caravan = worldState.caravans.find(c => c.id === id);
        if (!caravan) {
            res.status(404).json({ error: 'Caravan not found' });
            return;
        }

        // Обновляем позицию через GameLoop
        gameLoop.updateSingleCaravan(caravan, deltaTime || 1000);

        res.json({
            id: caravan.id,
            progress: caravan.progress,
            state: caravan.state,
            x: caravan.x,
            y: caravan.y
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== Страны ====================

app.post('/api/countries', async (req, res) => {
    try {
        const country = req.body;
        const sql = `INSERT OR REPLACE INTO countries 
                     (id, name, color, culture, militancy, religion, owner_id, angle) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        
        worldState.db.run(sql, [
            country.id || null, country.name, country.color,
            country.culture || 50, country.militancy || 50,
            country.religion || '', country.owner_id || null, country.angle || 0
        ], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            country.id = country.id || this.lastID;
            const idx = worldState.countries.findIndex(c => c.id === country.id);
            if (idx >= 0) worldState.countries[idx] = country;
            else worldState.countries.push(country);
            
            res.json({ success: true, id: country.id });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/countries/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        worldState.db.run('DELETE FROM countries WHERE id = ?', [id], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            worldState.countries = worldState.countries.filter(c => c.id !== id);
            res.json({ success: true });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== Границы ====================

app.post('/api/borders', async (req, res) => {
    try {
        const border = req.body;
        const pointsStr = typeof border.points === 'string' 
            ? border.points 
            : JSON.stringify(border.points);
        
        const sql = `INSERT OR REPLACE INTO borders (id, country_id, points) 
                     VALUES (?, ?, ?)`;
        
        worldState.db.run(sql, [
            border.id || null, border.country_id, pointsStr
        ], function(err) {
            if (err) {
                console.error('Ошибка сохранения границы:', err);
                res.status(500).json({ error: err.message });
                return;
            }
            
            border.id = border.id || this.lastID;
            border.points = typeof border.points === 'string' 
                ? JSON.parse(border.points) 
                : border.points;
            
            const idx = worldState.borders.findIndex(b => b.id === border.id);
            if (idx >= 0) worldState.borders[idx] = border;
            else worldState.borders.push(border);
            
            res.json({ success: true, id: border.id });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/borders/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        worldState.db.run('DELETE FROM borders WHERE id = ?', [id], function(err) {
            if (err) {
                res.status(500).json({ error: err.message });
                return;
            }
            
            worldState.borders = worldState.borders.filter(b => b.id !== id);
            res.json({ success: true });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== Экономика города ====================

app.post('/api/city-economy', async (req, res) => {
    try {
        const { city_id, economy } = req.body;
        
        for (const item of economy) {
            await new Promise((resolve) => {
                const sql = `INSERT OR REPLACE INTO city_economy 
                             (city_id, item_id, production, consumption, storage) 
                             VALUES (?, ?, ?, ?, ?)`;
                
                worldState.db.run(sql, [
                    city_id, item.item_id, item.production || 0, 
                    item.consumption || 0, item.storage || 0
                ], resolve);
            });
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/save-inventory', async (req, res) => {
    try {
        const { inventory } = req.body;
        
        for (const item of inventory) {
            await new Promise((resolve) => {
                const sql = `UPDATE city_storage SET amount = ? WHERE city_id = ? AND item_id = ?`;
                worldState.db.run(sql, [item.amount, item.city_id, item.item_id], resolve);
            });
        }
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==================== WebSocket ====================

function setupWebSocket(server) {
    wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        const clientId = syncManager.addClient(ws);

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                handleClientMessage(clientId, data);
            } catch (err) {
                console.error('Ошибка парсинга WebSocket сообщения:', err);
            }
        });

        ws.on('close', () => {
            syncManager.removeClient(clientId);
        });

        ws.on('error', (err) => {
            console.error(`WebSocket ошибка клиента ${clientId}:`, err);
        });
    });

    console.log('[Server] WebSocket сервер запущен');
}

/**
 * Обработка сообщений от клиентов
 */
function handleClientMessage(clientId, data) {
    const client = syncManager.getClient(clientId);
    if (!client) return;

    switch (data.type) {
        case 'viewport_update':
            syncManager.updateViewport(clientId, data.viewport);
            break;

        case 'action':
            // Действия игрока (создание города, пути и т.д.)
            handlePlayerAction(clientId, data.action);
            break;

        case 'ping':
            // Ответ на ping для проверки соединения
            syncManager.send(client.ws, { type: 'pong', timestamp: Date.now() });
            break;

        default:
            console.log('Неизвестное сообщение от клиента:', data.type);
    }
}

/**
 * Обработка действий игрока
 */
async function handlePlayerAction(clientId, action) {
    console.log(`[Action] от клиента ${clientId}:`, action.type);
    
    // Действия обрабатываются через REST API
    // Здесь можно добавить валидацию и авторизацию
}

// ==================== Запуск сервера ====================

async function startServer() {
    try {
        // Инициализация состояния мира
        worldState = new WorldState();
        await worldState.initialize();

        // Запуск игрового цикла
        gameLoop = new GameLoop(worldState);
        gameLoop.start();

        // Создание HTTP сервера
        const server = createServer(app);

        // Инициализация менеджера синхронизации
        syncManager = new SyncManager(worldState, gameLoop, wss);
        syncManager.initialize();

        // Запуск WebSocket
        setupWebSocket(server);

        // Авто-сохранение
        worldState.startAutoSave();

        // Старт HTTP сервера
        server.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════════════╗
║           Caravan Map Server запущен!                     ║
╠═══════════════════════════════════════════════════════════╣
║  HTTP:      http://localhost:${PORT}                        ║
║  WebSocket: ws://localhost:${PORT}                          ║
║  Клиентов:  ${syncManager.getClientCount()}                                  ║
╚═══════════════════════════════════════════════════════════╝
            `);
        });

        // Обработка завершения работы
        process.on('SIGINT', async () => {
            console.log('\nЗавершение работы сервера...');
            gameLoop.stop();
            await worldState.close();
            
            if (wss) {
                wss.clients.forEach(client => client.close());
            }
            
            process.exit(0);
        });

    } catch (err) {
        console.error('Критическая ошибка запуска сервера:', err);
        process.exit(1);
    }
}

startServer();
