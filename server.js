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
});

// Эндпоинт загрузки всех данных при старте игры
app.get('/api/load', (req, res) => {
    const data = { cities: [], routes: [], countries: [] };
    
    db.all("SELECT * FROM countries order by name", [], (err, rows) => {
        data.countries = rows;
        db.all("SELECT * FROM cities", [], (err, rows) => {
            // Преобразуем goods обратно в массив из строки
            data.cities = rows.map(c => ({...c, goods: c.goods ? c.goods.split(',') : []}));
            db.all("SELECT * FROM routes", [], (err, rows) => {
                // Преобразуем points обратно в массив из JSON-строки
                data.routes = rows.map(r => ({...r, points: JSON.parse(r.points || '[]')}));
                res.json(data);
            });
        });
    });
});

// Эндпоинт сохранения (полная перезапись для простоты или точечные запросы)
app.post('/api/save', (req, res) => {
    const { cities, routes, countries } = req.body;

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        
        // Очищаем старые данные (или можно делать UPDATE/INSERT)
        db.run("DELETE FROM countries");
        db.run("DELETE FROM cities");
        db.run("DELETE FROM routes");

        const cityStmt = db.prepare("INSERT INTO cities VALUES (?,?,?,?,?,?,?,?,?)");
        cities.forEach(c => cityStmt.run(c.id, c.name, c.x, c.y, c.description, c.population, c.storage, c.goods.join(','), c.country_id));
        cityStmt.finalize();

        const routeStmt = db.prepare("INSERT INTO routes VALUES (?,?,?,?,?,?,?)");
        routes.forEach(r => routeStmt.run(r.id, r.from_id, r.to_id, r.type, JSON.stringify(r.points), r.speedCoeff, r.unitCount));
        routeStmt.finalize();

        const countryStmt = db.prepare("INSERT INTO countries VALUES (?,?,?,?,?,?,?,?,?,?)");
        countries.forEach(c => countryStmt.run(c.id, c.name, c.x, c.y, c.angle, c.race, c.religion, c.population, c.culture, c.militancy));
        countryStmt.finalize();

        db.run("COMMIT", (err) => {
            if (err) res.status(500).send(err);
            else res.send({ message: "База данных успешно обновлена" });
        });
    });
});

app.post('/api/cities', (req, res) => {
    const c = req.body;
    const stmt = db.prepare("INSERT OR REPLACE INTO cities (id, name, x, y, description, population, storage, goods, country_id) VALUES (?,?,?,?,?,?,?,?,?)");
    stmt.run(c.id, c.name, c.x, c.y, c.description, c.population, c.storage, c.goods.join(','), c.country_id, (err) => {
        if (err) res.status(500).json({ error: err.message });
        else res.json({ message: "City saved" });
    });
    stmt.finalize();
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

const port = 8080;
app.listen(port, '0.0.0.0', () => {
  console.log(`Сервер БД запущен: http://0.0.0.0:${PORT}`)
});
