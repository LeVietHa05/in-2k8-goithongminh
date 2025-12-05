const db = require('./db')

function randomFloat(max, min) {
    return ((Math.random() * (max - min)) + min + 1).toFixed(2)
}

function randomInt(max, min) {
    return Math.floor((Math.random() * (max - min)) + min + 1)
}

// Prepare insert statements
const insertSleepData = db.prepare(`
    INSERT INTO sleepData (deviceID, type, stage, sleepTime, temperature, humidity, co2, pm25, light, noise, position, heartRate, bodyTemperature, spo2)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function generateSeedData(time) {
    for (let i = 0; i < time; i++) {
        let a = {
            "deviceID": 1,
            "type": "sleep_data",
            "stage": randomInt(1, 3),
            "sleepTime": randomInt(1000, 2000),
            "temperature": randomFloat(25, 30),
            "humidity": randomFloat(55, 70),
            "co2": randomInt(400, 420),
            "pm25": randomInt(35, 50),
            "light": randomFloat(120, 130),
            "noise": randomFloat(40, 50),
            "position": randomInt(1, 3),
            "heartRate": randomInt(70, 80),
            "bodyTemperature": randomFloat(36, 37),
            "spo2": randomInt(92, 98)
        }

        insertSleepData.run(Object.values(a))
    }


    insertSleepData.finalize();

    // Close the database connection
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err.message);
        } else {
            console.log('Database connection closed.');
        }
    });
}

// generateSeedData(1000)


