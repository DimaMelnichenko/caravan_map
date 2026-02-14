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
    
    // 1. Для сухопутных путей (track) ставим "Торговую повозку" (ID 2)
    db.run(`UPDATE routes SET transport_id = 1 WHERE type = 'track'`);
    
    // 2. Для водных путей (water) ставим "Торговое судно" (ID 4)
    db.run(`UPDATE routes SET transport_id = 2 WHERE type = 'water'`);

    console.log("🏁 Миграция успешно завершена! Файл world.db готов.");
});

db.close();
