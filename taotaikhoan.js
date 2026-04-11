const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./sleep.db');

// ===== 1. TẠO TABLE =====
db.serialize(() => {

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            deviceID INTEGER PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            createdAt INTEGER DEFAULT (strftime('%s','now'))
        )
    `);

    console.log("Table users ready");

    // ===== 2. XOÁ DATA CŨ (optional) =====
    db.run(`DELETE FROM users`, () => {
        console.log("🧹 Cleared old data");
    });

    // ===== 3. INSERT DATA MẪU =====
    const users = [
        { deviceID: 1, username: 'device1', password: '123456' },
        { deviceID: 2, username: 'device2', password: '123456' },
        { deviceID: 3, username: 'device3', password: '123456' },
        { deviceID: 4, username: 'device4', password: '123456' },
        { deviceID: 5, username: 'device5', password: '123456' }
    ];

    const stmt = db.prepare(`
        INSERT INTO users (deviceID, username, password)
        VALUES (?, ?, ?)
    `);

    users.forEach(user => {
        stmt.run(user.deviceID, user.username, user.password);
    });

    stmt.finalize(() => {
        console.log("🚀 Seed users thành công!");
    });

});

// ===== 4. CLOSE DB =====
db.close(() => {
    console.log("📦 Done.");
});