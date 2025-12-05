const express = require("express");
const router = express.Router();
const db = require('../db')
const sleepAnalysisService = require('../sleepAnalyzer/sleepAnalysisService')
const analysisService = new sleepAnalysisService({ openaiApiKey: process.env.OPENAI_API_KEY })
router.get('/', function (req, res, next) {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    const offset = (page - 1) * limit;

    db.all(
        `SELECT * FROM sleepAnalysisReports`,
        [],
        (err, rows) => {

            if (err) return res.json({ success: false, error: err.message });
            res.json({ success: true, data: rows })
        }
    )
});

router.get('/:sleepStatID', async function (req, res, next) {
    const { sleepStatID } = req.params
    const data = await analysisService.getReport(sleepStatID)
    res.json({ success: true, data: data })
})

router.get('/re-ai/:id', function (req, res, next) {
    const { id } = req.params


})


module.exports = router