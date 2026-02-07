const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Пути к вашим JSON файлам
const DATA_DIR = path.join(__dirname, 'assets', 'data');
const files = {
    cities: path.join(DATA_DIR, 'cities.json'),
    countries: path.join(DATA_DIR, 'countries.json'),
    routes: path.join(DATA_DIR, 'routes.json')
};

// Создаем подключение к новой БД
const db = new sqlite3.Database('./world.db');

db.serialize(() => {
    console.log("🚀 Начинаем миграцию данных в SQLite...");
/*
    // 1. Создаем таблицы
    db.run(`CREATE TABLE IF NOT EXISTS countries (
        id INTEGER PRIMARY KEY,
        name TEXT, 
        x REAL, 
        y REAL, 
        angle REAL,
        race TEXT, 
        religion TEXT, 
        population INTEGER,
        culture INTEGER, 
        militancy INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cities (
        id INTEGER PRIMARY KEY,
        name TEXT, 
        x REAL, 
        y REAL, 
        description TEXT, 
        population INTEGER, 
        storage TEXT,
        goods TEXT, 
        country_id INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS routes (
        id INTEGER PRIMARY KEY,
        from_id INTEGER, 
        to_id INTEGER, 
        type TEXT,
        points TEXT, 
        speedCoeff REAL, 
        unitCount INTEGER
    )`);

    console.log("✅ Таблицы созданы.");*/

   /* // 2. Миграция СТРАН
    if (fs.existsSync(files.countries)) {
        const countries = JSON.parse(fs.readFileSync(files.countries, 'utf8'));
        const stmt = db.prepare("INSERT INTO countries VALUES (?,?,?,?,?,?,?,?,?,?)");
        countries.forEach(c => {
            stmt.run(
                c.id, 
                c.name, 
                c.x, 
                c.y, 
                c.angle || 0, 
                c.race || 'Люди', 
                c.religion || 'Нет', 
                c.population || 0, 
                c.culture || 0, 
                c.militancy || 0
            );
        });
        stmt.finalize();
        console.log(`📦 Перенесено стран: ${countries.length}`);
    }

    // 3. Миграция ГОРОДОВ
    if (fs.existsSync(files.cities)) {
        const cities = JSON.parse(fs.readFileSync(files.cities, 'utf8'));
        const stmt = db.prepare("INSERT INTO cities VALUES (?,?,?,?,?,?,?,?,?)");
        cities.forEach(c => {
            // Преобразуем массив товаров в строку через запятую
            const goodsStr = Array.isArray(c.goods) ? c.goods.join(',') : '';
            stmt.run(
                c.id, 
                c.name, 
                c.x, 
                c.y, 
                c.description || '', 
                c.population || 0, 
                c.storage || '', 
                goodsStr, 
                c.country_id || null
            );
        });
        stmt.finalize();
        console.log(`📦 Перенесено городов: ${cities.length}`);
    }
*/
    // 4. Миграция МАРШРУТОВ
    if (fs.existsSync(files.routes)) {
        const routes = JSON.parse(fs.readFileSync(files.routes, 'utf8'));
        const stmt = db.prepare("INSERT INTO routes VALUES (?,?,?,?,?,?,?)");
        routes.forEach(r => {
            // Преобразуем массив точек в JSON-строку
            const pointsStr = JSON.stringify(r.points || []);
            stmt.run(
                r.id, 
                r.from, 
                r.to, 
                r.type || 'track', 
                pointsStr, 
                r.speedCoeff || 1.0, 
                r.unitCount || 3
            );
        });
        stmt.finalize();
        console.log(`📦 Перенесено маршрутов: ${routes.length}`);
    }

    console.log("🏁 Миграция успешно завершена! Файл world.db готов.");
});

db.close();