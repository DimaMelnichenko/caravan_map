import sqlite3 from 'sqlite3';

const db = new sqlite3.Database('world.db', sqlite3.OPEN_READONLY);

console.log('=== transport_types ===');
db.all('SELECT * FROM transport_types', (err, rows) => {
    if (err) console.error(err);
    else {
        console.table(rows);
        console.log('\n=== routes (sample) ===');
        db.all('SELECT id, from_id, to_id, speedCoeff, unitCount FROM routes LIMIT 5', (err, rows) => {
            if (err) console.error(err);
            else console.table(rows);
            db.close();
        });
    }
});
