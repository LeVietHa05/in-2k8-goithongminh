-- Schema for sleepData table
CREATE TABLE IF NOT EXISTS sleepData (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceID INTEGER NOT NULL,
    type TEXT NOT NULL,
    stage INTEGER,
    sleepTime INTEGER,
    temperature REAL,
    humidity REAL,
    co2 INTEGER,
    pm25 INTEGER,
    light REAL,
    noise REAL,
    position INTEGER,
    heartRate INTEGER,
    bodyTemperature REAL,
    spo2 INTEGER,
    timestamp INTEGER, 
);

-- Schema for sleepStatistic table
CREATE TABLE IF NOT EXISTS sleepStatistic (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceID INTEGER NOT NULL,
    type TEXT NOT NULL,
    startTime INTEGER,
    endTime INTEGER,
    totalTime INTEGER,
    totalSleepHours REAL,
    isCompleteSleep BOOLEAN,
    timeLeft INTEGER,
    timeRight INTEGER,
    timeCenter INTEGER,
    positionChanges INTEGER,
    timestamp INTEGER   
);
