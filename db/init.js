const db = require('../db');
const fs = require('fs');
const path = require('path');

// Read schema.sql and execute it
const schemaPath = path.join(__dirname, '..', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf8');

db.serialize(() => {
    db.exec(schema, (err) => {
        if (err) {
            console.error('Error creating tables:', err.message);
        } else {
            console.log('Tables created successfully.');
        }
    });
});

// Read mockdata.json and populate the database
const mockdataPath = path.join(__dirname, '..', 'mockdata.json');
const mockdata = JSON.parse(fs.readFileSync(mockdataPath, 'utf8'));

// Prepare insert statements
const insertSleepData = db.prepare(`
    INSERT INTO sleepData (deviceID, type, stage, sleepTime, temperature, humidity, co2, pm25, light, noise, position, heartRate, bodyTemperature, spo2)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const insertSleepStatistic = db.prepare(`
    INSERT INTO sleepStatistic (deviceID, type, startTime, endTime, totalTime, totalSleepHours, isCompleteSleep, timeLeft, timeRight, timeCenter, positionChanges)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

Object.values(mockdata).forEach((item) => {
    if (item.type === 'sleep_data') {
        insertSleepData.run(
            item.deviceID,
            item.type,
            item.stage,
            item.sleepTime,
            item.temperature,
            item.humidity,
            item.co2 || null,
            item.pm25,
            item.light,
            item.noise,
            item.position,
            item.heartRate || null,
            item.bodyTemperature || null,
            item.spo2 || null
        );
    } else if (item.type === 'sleep_statistics') {
        insertSleepStatistic.run(
            item.deviceID,
            item.type,
            item.startTime,
            item.endTime,
            item.totalTime,
            item['totalSleepHours '] || item.totalSleepHours, // Handle the space in key
            item.isCompleteSleep,
            item.timeLeft,
            item.timeRight,
            item.timeCenter,
            item.positionChanges
        );
    }
});

// Finalize prepared statements
insertSleepData.finalize();
insertSleepStatistic.finalize();

db.run(
    `INSERT INTO thresholds (deviceID, temp) VALUES (?, ?)`,
    [1, 25.5],
    function (err) {
        if (err) console.log('Insert error:', err);
        else     console.log('Inserted ID:', this.lastID);

        // Test UNIQUE constraint
        db.run(
            `INSERT INTO thresholds (deviceID) VALUES (?)`,
            [1],  // Trùng deviceID
            function (err) {
                if (err) console.log('Expected error (unique violation):', err.message);
                else console.log('UNIQUE constraint không hoạt động!');
            }
        );
    }
);

// Close the database connection
db.close((err) => {
    if (err) {
        console.error('Error closing database:', err.message);
    } else {
        console.log('Database connection closed.');
    }
});
