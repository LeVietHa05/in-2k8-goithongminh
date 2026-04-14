const express = require("express");
const router = express.Router();
const createCRUDRoute = require("../crudGenerator");
const db = require("./../db");

// sleepData
router.use(
  "/sleep-data",
  createCRUDRoute({
    table: "sleepData",
    columns: [
      "deviceID",
      "type",
      "stage",
      "sleepTime",
      "temperature",
      "humidity",
      "co2",
      "pm25",
      "light",
      "noise",
      "position",
      "heartRate",
      "bodyTemperature",
      "spo2"
    ]
  })
);

// sleepStatistic
router.use(
  "/sleep-stat",
  createCRUDRoute({
    table: "sleepStatistic",
    columns: [
      "deviceID",
      "type",
      "startTime",
      "endTime",
      "totalTime",
      "totalSleepHours",
      "isCompleteSleep",
      "timeLeft",
      "timeRight",
      "timeCenter",
      "positionChanges"
    ]
  })
);

// Custom threshold upsert route
router.post('/thresholds/upsert', (req, res) => {
  const { deviceID, temp, humid, pm25, co2, noise, light } = req.body;

  if (!deviceID) {
    return res.status(400).json({ success: false, error: 'deviceID is required' });
  }

  const query = `
        INSERT INTO thresholds (deviceID, temp, humid, pm25, co2, noise, light, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
        ON CONFLICT(deviceID) DO UPDATE SET
            temp = excluded.temp,
            humid = excluded.humid,
            pm25 = excluded.pm25,
            co2 = excluded.co2,
            noise = excluded.noise,
            light = excluded.light,
            updatedAt = strftime('%s', 'now')
    `;

  db.run(query, [deviceID, temp, humid, pm25, co2, noise, light], function (err) {
    if (err) {
      console.error('Error upserting thresholds:', err);
      res.status(500).json({ success: false, error: err.message });
    } else {
      res.json({
        success: true,
        id: this.lastID,
        message: 'Thresholds saved successfully'
      });
    }
  });
});

// thresholds
router.use(
  "/thresholds",
  createCRUDRoute({
    table: "thresholds",
    columns: [
      "deviceID",
      "temp",
      "humid",
      "pm25",
      "co2",
      "noise",
      "light"
    ]
  })
);


router.get('/debug/database', (req, res) => {
  // Lấy danh sách tất cả bảng
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      return res.status(500).json({
        success: false,
        error: err.message
      });
    }

    if (!tables || tables.length === 0) {
      return res.json({
        success: false,
        message: "❌ Không có bảng nào trong database"
      });
    }

    // Lấy dữ liệu từng bảng
    const result = {};
    let pending = tables.length;

    tables.forEach(table => {
      const tableName = table.name;

      db.all(`SELECT * FROM ${tableName} LIMIT 5`, [], (err, rows) => {
        if (err) {
          result[tableName] = { error: err.message };
        } else {
          result[tableName] = {
            total: rows.length,
            sample: rows
          };
        }

        pending--;

        if (pending === 0) {
          res.json({
            success: true,
            tables: result
          });
        }
      });
    });
  });
});


module.exports = router;
