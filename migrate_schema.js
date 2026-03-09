/**
 * Скрипт миграции схемы БД
 * Добавляет отсутствующие колонки в таблицу caravans
 */

import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, 'world.db');

const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE);

// Проверяем и добавляем колонки в таблицу caravans
const migrations = [
    // Добавляем колонку cargo если её нет
    `ALTER TABLE caravans ADD COLUMN cargo TEXT DEFAULT NULL`,
    
    // Добавляем колонку state если её нет
    `ALTER TABLE caravans ADD COLUMN state TEXT DEFAULT 'moving'`,
    
    // Добавляем колонку x если её нет
    `ALTER TABLE caravans ADD COLUMN x REAL DEFAULT 0`,
    
    // Добавляем колонку y если её нет
    `ALTER TABLE caravans ADD COLUMN y REAL DEFAULT 0`,
    
    // Добавляем колонку trade_progress если её нет
    `ALTER TABLE caravans ADD COLUMN trade_progress INTEGER DEFAULT 0`,
    
    // Добавляем from_id и to_id для направления движения
    `ALTER TABLE caravans ADD COLUMN from_id INTEGER DEFAULT 0`,
    `ALTER TABLE caravans ADD COLUMN to_id INTEGER DEFAULT 0`,
    
    // Добавляем started_at для клиентской интерполяции
    `ALTER TABLE caravans ADD COLUMN started_at INTEGER DEFAULT 0`
];

async function runMigration() {
    console.log('Начало миграции схемы БД...');
    
    // Сначала создадим таблицы если их нет
    await createTablesIfNotExists();
    
    for (const sql of migrations) {
        await new Promise((resolve) => {
            db.run(sql, function(err) {
                if (err) {
                    // Игнорируем ошибку "duplicate column" - колонка уже существует
                    if (err.message.includes('duplicate column')) {
                        console.log(`✓ Колонка уже существует: ${sql.split('ADD COLUMN')[1].split(' ')[1]}`);
                    } else {
                        console.error(`✗ Ошибка: ${err.message}`);
                    }
                } else {
                    console.log(`✓ Выполнено: ${sql}`);
                }
                resolve();
            });
        });
    }
    
    // Проверяем итоговую схему
    db.all("PRAGMA table_info(caravans)", (err, rows) => {
        if (err) {
            console.error('Ошибка получения схемы:', err);
        } else {
            console.log('\nИтоговая схема таблицы caravans:');
            rows.forEach(row => {
                console.log(`  - ${row.name} (${row.type})`);
            });
        }
        
        db.close((err) => {
            if (err) console.error('Ошибка закрытия БД:', err);
            else console.log('\nМиграция завершена!');
        });
    });
}

async function createTablesIfNotExists() {
    // Создаём таблицу city_inventory если её нет
    await new Promise((resolve) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS city_inventory (
                city_id INTEGER,
                item_id INTEGER,
                amount REAL DEFAULT 0,
                PRIMARY KEY (city_id, item_id)
            )
        `, (err) => {
            if (err) console.error('Ошибка создания city_inventory:', err);
            else console.log('✓ Таблица city_inventory готова');
            resolve();
        });
    });
    
    // Создаём таблицу transport_types если её нет
    await new Promise((resolve) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS transport_types (
                id INTEGER PRIMARY KEY,
                name TEXT,
                type TEXT,
                capacity REAL,
                speed REAL,
                texture TEXT
            )
        `, (err) => {
            if (err) console.error('Ошибка создания transport_types:', err);
            else console.log('✓ Таблица transport_types готова');
            resolve();
        });
    });
}

runMigration();
