const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const PORT = 8080;

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Подключение к БД (создаст файл world.db автоматически)
const db = new sqlite3.Database('./world.db');

// Инициализация таблиц
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS countries (
        id INTEGER PRIMARY KEY,
        name TEXT, x REAL, y REAL, angle REAL,
        race TEXT, religion TEXT, population INTEGER,
        culture INTEGER, militancy INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cities (
        id INTEGER PRIMARY KEY,
        name TEXT, x REAL, y REAL, 
        description TEXT, population INTEGER, storage TEXT,
        goods TEXT, country_id INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY,
        from_id INTEGER, to_id INTEGER, type TEXT,
        points TEXT, speedCoeff REAL, unitCount INTEGER
    )`);

    // Справочник товаров
    db.run(`CREATE TABLE IF NOT EXISTS items (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE,
        icon TEXT,
        base_price REAL
    )`);

    // Таблица экономики городов (производство и потребление)
    db.run(`CREATE TABLE IF NOT EXISTS city_economy (
        city_id INTEGER,
        item_id INTEGER,
        type TEXT, -- 'production' или 'consumption'
        amount REAL,
        PRIMARY KEY (city_id, item_id, type),
        FOREIGN KEY (city_id) REFERENCES cities(id),
        FOREIGN KEY (item_id) REFERENCES items(id)
    )`);

    // Добавим несколько базовых товаров, если таблица пуста
    db.get("SELECT count(*) as count FROM items", (err, row) => {
        if (row.count === 0) {
            const stmt = db.prepare("INSERT INTO items (name, icon, base_price) VALUES (?, ?, ?)");
            const basicItems = [
                ['Зерно', 'icon_grain', 10],
                ['Железо', 'icon_iron', 50],
                ['Дерево', 'icon_wood', 20],
                ['Вино', 'icon_wine', 80],
                ['Ткань', 'icon_cloth', 40]
            ];
            basicItems.forEach(item => stmt.run(item));
            stmt.finalize();
        }
    });

    db.run(`ALTER TABLE cities ADD COLUMN max_storage INTEGER DEFAULT 1000`, (err) => {
        // Игнорируем ошибку, если колонка уже есть
    });

    // 2. Таблица текущих запасов
    db.run(`CREATE TABLE IF NOT EXISTS city_inventory (
        city_id INTEGER,
        item_id INTEGER,
        amount REAL DEFAULT 0,
        PRIMARY KEY (city_id, item_id)
    )`);

    // Справочник типов транспорта
    db.run(`CREATE TABLE IF NOT EXISTS transport_types (
        id INTEGER PRIMARY KEY,
        name TEXT,
        capacity INTEGER,
        speed REAL, -- Базовая скорость (пикселей в секунду)
        texture TEXT -- Имя текстуры (caravan или ship)
    )`);

    // Добавим колонку transport_id в таблицу routes, если её нет
    db.run(`ALTER TABLE routes ADD COLUMN transport_id INTEGER DEFAULT 1`, (err) => {});

    // Наполним базовыми типами, если пусто
    db.get("SELECT count(*) as count FROM transport_types", (err, row) => {
        if (row.count === 0) {
            const stmt = db.prepare("INSERT INTO transport_types (name, capacity, speed, texture) VALUES (?, ?, ?, ?)");
            stmt.run("Торговая повозка", 1, 2, "caravan");
            stmt.run("Торговое судно", 3, 20, "ship");
            stmt.finalize();
        }
    });

    db.run(`CREATE TABLE IF NOT EXISTS borders (
        id INTEGER PRIMARY KEY,
        country_id INTEGER,
        points TEXT
    )`);

});

// Вспомогательная функция для выполнения SQL-запросов с возвратом Promise
const dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const loadCountries = () => dbAll("SELECT * FROM countries ORDER BY name");

const loadItems = () => dbAll("SELECT * FROM items");

const loadCityEconomy = () => dbAll("SELECT * FROM city_economy");

const loadCityInventory = () => dbAll("SELECT * FROM city_inventory");

const loadTransportTypes = () => dbAll("SELECT * FROM transport_types");

const loadBorders = () => dbAll("SELECT * FROM borders");

const loadCities = async () => {
    const rows = await dbAll("SELECT * FROM cities");
    return rows.map(c => ({
        ...c,
        goods: c.goods ? c.goods.split(',') : []
    }));
};

const loadRoutes = async () => {
    const rows = await dbAll("SELECT * FROM routes");
    return rows.map(r => ({
        ...r,
        points: JSON.parse(r.points || '[]')
    }));
};


app.get('/api/load', async (req, res) => {
    try {
        // Запускаем все подфункции одновременно
        const [countries, items, cityEconomy, cities, routes, cityInventory, transportTypes, borders] = await Promise.all([
            loadCountries(),
            loadItems(),
            loadCityEconomy(),
            loadCities(),
            loadRoutes(),
            loadCityInventory(),
            loadTransportTypes(),
            loadBorders()
        ]);

        // Отправляем собранный объект
        res.json({
            countries,
            items,
            cityEconomy,
            cities,
            routes,
            cityInventory,
            transportTypes,
            borders
        });
    } catch (err) {
        console.error("Ошибка при загрузке данных:", err);
        res.status(500).json({ error: "Ошибка сервера при чтении базы данных" });
    }
});

app.post('/api/cities', async (req, res) => {
    const c = req.body;
    const sql = `INSERT OR REPLACE INTO cities 
                 (id, name, x, y, description, population, storage, goods, country_id) 
                 VALUES (?,?,?,?,?,?,?,?,?)`;
    const params = [c.id, c.name, c.x, c.y, c.description, c.population, c.storage, c.goods.join(','), c.country_id];

    try {
        await new Promise((res, rej) => db.run(sql, params, err => err ? rej(err) : res()));
        res.json({ message: "City saved" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Удалить город
app.delete('/api/cities/:id', (req, res) => {
    db.run("DELETE FROM cities WHERE id = ?", req.params.id, (err) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: "City deleted" });
    });
});

// Обновить или создать маршрут
app.post('/api/routes', (req, res) => {
    const r = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO routes (id, from_id, to_id, type, points, speedCoeff, unitCount) VALUES (?,?,?,?,?,?,?)");
    stmt.run(r.id, r.from_id, r.to_id, r.type, JSON.stringify(r.points), r.speedCoeff, r.unitCount, (err) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: "Route saved" });
    });
    stmt.finalize();
});

// Удалить маршрут
app.delete('/api/routes/:id', (req, res) => {
    db.run("DELETE FROM routes WHERE id = ?", req.params.id, (err) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: "Route deleted" });
    });
});

// Удалить линию границы
app.delete('/api/borders/:id', (req, res) => {
    const id = req.params.id;
    db.run("DELETE FROM borders WHERE id = ?", id, (err) => {
        if (err) {
            console.error("Ошибка при удалении границы:", err.message);
            res.status(500).json({ error: err.message });
        } else {
            res.json({ message: "Border deleted" });
        }
    });
});

// Аналогично для стран (Countries)
app.post('/api/countries', (req, res) => {
    const c = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO countries (id, name, x, y, angle, race, religion, population, culture, militancy) VALUES (?,?,?,?,?,?,?,?,?,?)");
    stmt.run(c.id, c.name, c.x, c.y, c.angle, c.race, c.religion, c.population, c.culture, c.militancy, (err) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: "Country saved" });
    });
    stmt.finalize();
});

app.post('/api/city-economy', async (req, res) => {
    const { city_id, economy } = req.body; 
    
    // economy — это массив объектов [{item_id, type, amount}, ...]
    
    try {
        // Используем транзакцию, чтобы если запись одного товара упала, не удалились старые
        await new Promise((resolve, reject) => {
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                
                // 1. Удаляем все старые записи экономики для этого города
                db.run("DELETE FROM city_economy WHERE city_id = ?", [city_id]);

                // 2. Подготавливаем запрос на вставку
                const stmt = db.prepare("INSERT INTO city_economy (city_id, item_id, type, amount) VALUES (?, ?, ?, ?)");
                
                economy.forEach(e => {
                    stmt.run(city_id, e.item_id, e.type, e.amount);
                });
                
                stmt.finalize();

                db.run("COMMIT", (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            });
        });

        res.json({ message: "Экономика города успешно обновлена" });
    } catch (err) {
        console.error("Ошибка при сохранении экономики:", err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/save-inventory', (req, res) => {
    const { inventory } = req.body; // Массив [{city_id, item_id, amount}, ...]
    const stmt = db.prepare("INSERT OR REPLACE INTO city_inventory (city_id, item_id, amount) VALUES (?, ?, ?)");
    db.serialize(() => {
        inventory.forEach(i => stmt.run(i.city_id, i.item_id, i.amount));
        stmt.finalize();
        res.json({ message: "Inventory saved" });
    });
});

app.post('/api/borders', (req, res) => {
    const b = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO borders (id, country_id, points) VALUES (?,?,?)");
    stmt.run(b.id, b.country_id, JSON.stringify(b.points), (err) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: "Border saved" });
    });
    stmt.finalize();
});

const port = 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Сервер БД запущен: http://0.0.0.0:${PORT}`)
});
