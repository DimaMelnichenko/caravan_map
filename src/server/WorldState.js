/**
 * WorldState — модуль хранения состояния мира в памяти
 * Загружает данные из SQLite при старте и сохраняет изменения периодически
 */

import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, '../../world.db');

export default class WorldState {
    constructor() {
        this.db = null;
        this.cities = [];
        this.routes = [];
        this.countries = [];
        this.borders = [];
        this.caravans = [];
        this.items = [];
        this.transportTypes = [];
        this.cityInventory = [];
        this.cityEconomy = [];
        this.tick = 0;
        this.lastSaveTime = Date.now();
        this.saveInterval = 30000; // Сохранение каждые 30 секунд
    }

    /**
     * Инициализация базы данных и загрузка состояния
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
                if (err) {
                    console.error('Ошибка подключения к БД:', err);
                    reject(err);
                    return;
                }
                console.log('Подключено к SQLite:', DB_PATH);
                this.loadAllData().then(resolve).catch(reject);
            });
        });
    }

    /**
     * Загрузка всех данных из БД
     */
    async loadAllData() {
        await Promise.all([
            this.loadCities(),
            this.loadRoutes(),
            this.loadCountries(),
            this.loadBorders(),
            this.loadItems(),
            this.loadTransportTypes(),
            this.loadCityInventory(),
            this.loadCaravans(),
            this.loadCityEconomy()
        ]);
        console.log('Мир загружен:', {
            cities: this.cities.length,
            routes: this.routes.length,
            countries: this.countries.length,
            borders: this.borders.length,
            caravans: this.caravans.length,
            items: this.items.length,
            transportTypes: this.transportTypes.length,
            cityInventory: this.cityInventory.length
        });
    }

    loadCities() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM cities', (err, rows) => {
                if (err) reject(err);
                else {
                    this.cities = rows || [];
                    resolve(this.cities);
                }
            });
        });
    }

    loadRoutes() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM routes', (err, rows) => {
                if (err) reject(err);
                else {
                    this.routes = (rows || []).map(route => ({
                        ...route,
                        points: typeof route.points === 'string' ? JSON.parse(route.points) : route.points
                    }));
                    resolve(this.routes);
                }
            });
        });
    }

    loadCountries() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM countries', (err, rows) => {
                if (err) reject(err);
                else {
                    this.countries = rows || [];
                    resolve(this.countries);
                }
            });
        });
    }

    loadBorders() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM borders', (err, rows) => {
                if (err) reject(err);
                else {
                    this.borders = (rows || []).map(border => ({
                        ...border,
                        points: typeof border.points === 'string' ? JSON.parse(border.points) : border.points
                    }));
                    resolve(this.borders);
                }
            });
        });
    }

    loadItems() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM items', (err, rows) => {
                if (err) reject(err);
                else {
                    this.items = rows || [];
                    resolve(this.items);
                }
            });
        });
    }

    loadTransportTypes() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM transport_types', (err, rows) => {
                if (err) reject(err);
                else {
                    this.transportTypes = rows || [];
                    resolve(this.transportTypes);
                }
            });
        });
    }

    loadCityInventory() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM city_inventory', (err, rows) => {
                if (err) reject(err);
                else {
                    this.cityInventory = rows || [];
                    resolve(this.cityInventory);
                }
            });
        });
    }

    loadCaravans() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM caravans', (err, rows) => {
                if (err) reject(err);
                else {
                    this.caravans = (rows || []).map(caravan => ({
                        ...caravan,
                        cargo: caravan.cargo ? JSON.parse(caravan.cargo) : null
                    }));
                    resolve(this.caravans);
                }
            });
        });
    }

    loadCityEconomy() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM city_economy', (err, rows) => {
                if (err) reject(err);
                else {
                    this.cityEconomy = rows || [];
                    resolve(this.cityEconomy);
                }
            });
        });
    }

    /**
     * Периодическое сохранение изменений
     */
    startAutoSave() {
        setInterval(() => this.saveToDatabase(), this.saveInterval);
    }

    /**
     * Сохранение всех изменений в БД
     */
    async saveToDatabase() {
        const now = Date.now();
        if (now - this.lastSaveTime < this.saveInterval) return;
        
        console.log(`[WorldState] Сохранение мира (тик ${this.tick})...`);
        await this.saveCaravans();
        this.lastSaveTime = now;
    }

    saveCaravans() {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                UPDATE caravans SET 
                    progress = ?, 
                    cargo = ?, 
                    state = ?
                WHERE id = ?
            `);

            const saveNext = (index = 0) => {
                if (index >= this.caravans.length) {
                    stmt.finalize(err => err ? reject(err) : resolve());
                    return;
                }

                const caravan = this.caravans[index];
                stmt.run(
                    caravan.progress,
                    JSON.stringify(caravan.cargo),
                    caravan.state,
                    caravan.id,
                    (err) => {
                        if (err) reject(err);
                        else saveNext(index + 1);
                    }
                );
            };

            saveNext();
        });
    }

    /**
     * Получить полные данные мира для клиента
     */
    getFullState() {
        return {
            tick: this.tick,
            cities: this.cities,
            routes: this.routes,
            countries: this.countries,
            borders: this.borders,
            caravans: this.caravans,
            items: this.items,
            transportTypes: this.transportTypes,
            cityInventory: this.cityInventory,
            cityEconomy: this.cityEconomy
        };
    }

    /**
     * Получить видимые сущности для viewport клиента
     */
    getVisibleState(viewport) {
        if (!viewport) return this.getFullState();

        const { x, y, width, height } = viewport;
        const margin = 100; // Запас для плавности

        return {
            tick: this.tick,
            cities: this.cities.filter(c =>
                c.x >= x - margin && c.x <= x + width + margin &&
                c.y >= y - margin && c.y <= y + height + margin
            ),
            caravans: this.caravans.filter(c =>
                c.x >= x - margin && c.x <= x + width + margin &&
                c.y >= y - margin && c.y <= y + height + margin
            ),
            // Маршруты, границы и экономику отправляем полностью
            routes: this.routes,
            borders: this.borders,
            countries: this.countries,
            cityEconomy: this.cityEconomy
        };
    }

    /**
     * Обновить позицию каравана
     */
    updateCaravan(id, updates) {
        const caravan = this.caravans.find(c => c.id === id);
        if (caravan) {
            Object.assign(caravan, updates);
            return caravan;
        }
        return null;
    }

    /**
     * Инкремент игрового тика
     */
    incrementTick() {
        this.tick++;
        return this.tick;
    }

    /**
     * Закрыть соединение с БД
     */
    close() {
        return new Promise((resolve) => {
            this.saveToDatabase().then(() => {
                this.db.close(err => {
                    if (err) console.error('Ошибка закрытия БД:', err);
                    else console.log('БД закрыта');
                    resolve();
                });
            });
        });
    }
}
