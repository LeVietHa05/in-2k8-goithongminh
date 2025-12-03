const express = require("express");
const router = express.Router();
const createCRUDRoute = require("../crudGenerator");

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

module.exports = router;
