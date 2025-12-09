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


router.get('/re-ai/:sleepStatID', async function (req, res, next) {
    const { sleepStatID } = req.params
    let result = await analysisService.processNewSleepStatistic(sleepStatID)
    console.log(result)
    return res.json({ success: true, data: result })

})

router.get('/last-report', function (req, res, next) {
    db.get(
        `SELECT * FROM sleepAnalysisReports 
         ORDER BY createdAt DESC 
         LIMIT 1`,
        [],
        (err, row) => {

            if (err) return res.json({ success: false, error: err.message });
            if (!row) return res.json({ success: false, error: 'No reports found' });

            // Parse recommendations if it's stored as JSON string
            if (row.recommendations && typeof row.recommendations === 'string') {
                try {
                    row.recommendations = JSON.parse(row.recommendations);
                } catch (e) {
                    console.error('Error parsing recommendations:', e);
                }
            }
            res.json({ success: true, data: [row] });
        }
    );
});


router.get('/:sleepStatID', async function (req, res, next) {
    const { sleepStatID } = req.params
    const data = await analysisService.getReport(sleepStatID)
    res.json({ success: true, data: data })
})

module.exports = router
