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
    timestamp INTEGER DEFAULT (strftime('%s','now'))
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
    timestamp INTEGER DEFAULT (strftime('%s','now'))   
);

CREATE TABLE IF NOT EXISTS analysisTriggers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sleepStatID INTEGER NOT NULL,
    triggerType TEXT NOT NULL, -- 'auto', 'manual', 'scheduled'
    status TEXT NOT NULL, -- 'pending', 'processing', 'completed', 'failed'
    errorMessage TEXT,
    startedAt INTEGER,
    completedAt INTEGER,
    createdAt INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS sleepAnalysisReports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    deviceID INTEGER NOT NULL,
    sleepStatID INTEGER NOT NULL,
    reportDate DATE NOT NULL,

    -- Metrics từ sleepStatistic (từ IoT)
    totalSleepHours REAL,
    isCompleteSleep BOOLEAN,
    timeLeft INTEGER,
    timeRight INTEGER,
    timeCenter INTEGER,
    positionChanges INTEGER,

    -- Metrics tính từ sleepData
    avgHeartRate REAL,
    minHeartRate REAL,
    maxHeartRate REAL,
    avgSpO2 REAL,
    minSpO2 REAL,
    avgBodyTemp REAL,

    -- Metrics môi trường
    avgEnvTemp REAL,
    avgHumidity REAL,
    avgCO2 REAL,
    avgPM25 REAL,
    avgLight REAL,
    avgNoise REAL,

    -- Phân bố giai đoạn ngủ
    lightSleepPercent REAL,
    deepSleepPercent REAL,
    wakingSleepPercent REAL,

    -- Điểm đánh giá
    sleepEfficiency REAL,
    environmentScore REAL,
    physiologyScore REAL,
    overallScore REAL,
    qualityLevel TEXT,

    -- Phân tích AI
    aiAnalysis TEXT,
    recommendations TEXT,

    -- Metadata
    createdAt INTEGER DEFAULT (strftime('%s', 'now')),
    updatedAt INTEGER DEFAULT (strftime('%s', 'now')),

    UNIQUE(deviceID, sleepStatID),
    FOREIGN KEY (sleepStatID) REFERENCES sleepStatistic(id)
);