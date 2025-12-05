const express = require("express");
const router = express.Router();
const SleepAnalysisTrigger = require('../sleepAnalyzer/triggerHandler');

// Cấu hình
const config = {
    dbPath: process.env.DB_PATH || '../sleep.db',
    openaiApiKey: process.env.OPENAI_API_KEY,
    pollingInterval: 10000 // 30 giây
};

// Khởi tạo
const triggerHandler = new SleepAnalysisTrigger(config);

// Khởi động polling (tự động phát hiện dữ liệu mới)
// triggerHandler.startPolling();


//lay report cua 1 device
router.get('/:deviceID', async (req, res) => {
    try {
        const { deviceID } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        const reports = await triggerHandler.service.getDeviceReports(deviceID, limit);

        res.json({
            success: true,
            data: reports
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


// API trigger thủ công
router.get('/analyze/:sleepStatID', async (req, res) => {
    try {
        const { sleepStatID } = req.params;

        const result = await triggerHandler.triggerManualAnalysis(sleepStatID);

        res.json(result);

    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


module.exports =  router