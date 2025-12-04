// migration.js
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database('./sleep.db');

// Đọc và thực thi file SQL
const runMigration = (filePath) => {
    const sql = fs.readFileSync(filePath, 'utf8');

    db.serialize(() => {
        console.log(`Running migration: ${filePath}`);

        // Tách các câu lệnh SQL
        const statements = sql
            .split(';')
            .filter(stmt => stmt.trim().length > 0);

        db.run('BEGIN TRANSACTION');

        statements.forEach((statement, index) => {
            db.run(statement.trim() + ';', (err) => {
                if (err) {
                    console.error(`Error in statement ${index + 1}:`, err.message);
                    db.run('ROLLBACK');
                    return;
                }
                console.log(`✓ Statement ${index + 1} executed successfully`);
            });
        });

        db.run('COMMIT', (err) => {
            if (err) {
                console.error('Commit error:', err);
            } else {
                console.log('Migration completed successfully');
            }
            db.close();
        });
    });
};

// Chạy migration
runMigration(path.join(__dirname, './addtimestamp.sql'));