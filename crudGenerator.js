const express = require("express");
const db = require("./db");
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config()
const SleepAnalysisService = require('./sleepAnalyzer/sleepAnalysisService')
const telegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN)
const telegramChatId = process.env.TELEGRAM_CHAT_ID

// Auto CRUD Generator
function createCRUDRoute({ table, columns }) {
    const router = express.Router();

    const colList = columns.join(", ");
    const placeholders = columns.map(() => "?").join(", ");
    const updateList = columns.map(c => `${c}=?`).join(", ");

    // ---- CREATE ----
    router.post("/", (req, res) => {
        const values = columns.map(c => req.body[c] ?? null);
        // console.log(values)
        db.run(
            `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`,
            values,
            function (err) {
                if (err) return res.json({ success: false, error: err.message });

                if (values.includes("sleep_statistics")) {
                    const analysis = new SleepAnalysisService({ openaiApiKey: process.env.OPENAI_API_KEY })
                    analysis.processNewSleepStatistic(this.lastID)
                }
                if (values.includes("sleep_data")) {
                    // console.log(req.body)
                    checkThresholdsAndAlert(req.body, req.body.deviceID)
                }
                res.json({ success: true, id: this.lastID, message: 'Đã nhận dữ liệu. Đang phân tích...' });
            }
        );
    });

    // ---- READ ALL + Pagination + Filter + Sort ----
    router.get("/", (req, res) => {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        const offset = (page - 1) * limit;

        // Build WHERE dynamically
        let where = [];
        let params = [];

        // 1. FILTER by exact match
        for (const col of columns) {
            if (req.query[col] !== undefined) {
                where.push(`${col} = ?`);
                params.push(req.query[col]);
            }
        }

        // 2. FILTER by time range (optional)
        if (req.query.startDate && req.query.endDate) {
            where.push(`timestamp BETWEEN ? AND ?`);
            params.push(req.query.startDate);
            params.push(req.query.endDate);
        }

        const whereSQL = where.length ? `WHERE ${where.join(" AND ")}` : "";

        // 3. SORTING
        let sortSQL = "ORDER BY timestamp DESC";
        if (req.query.sortBy) {
            const col = req.query.sortBy;
            if (columns.includes(col)) {
                const direction = req.query.order === "desc" ? "DESC" : "ASC";
                sortSQL = `ORDER BY ${col} ${direction}`;
            }
        }

        // Final SQL
        const sql = `
        SELECT * FROM ${table}
        ${whereSQL}
        ${sortSQL}
        LIMIT ? OFFSET ?
    `;

        db.all(sql, [...params, limit, offset], (err, rows) => {
            if (err) return res.json({ success: false, error: err.message });

            // Count for pagination
            db.get(
                `SELECT COUNT(*) AS total FROM ${table} ${whereSQL}`,
                params,
                (err, count) => {
                    res.json({
                        success: true,
                        data: rows,
                        pagination: {
                            page,
                            limit,
                            total: count.total,
                            totalPages: Math.ceil(count.total / limit)
                        }
                    });
                }
            );
        });
    });


    // ---- READ ONE ----
    router.get("/:id", (req, res) => {
        db.get(`SELECT * FROM ${table} WHERE id=?`, [req.params.id], (err, row) => {
            if (err) return res.json({ success: false, error: err.message });
            if (!row) return res.json({ success: false, error: "Not found" });
            res.json({ success: true, data: row });
        });
    });

    // ---- UPDATE ----
    router.put("/:id", (req, res) => {
        const values = columns.map(c => req.body[c] ?? null);

        db.run(
            `UPDATE ${table} SET ${updateList} WHERE id=?`,
            [...values, req.params.id],
            function (err) {
                if (err) return res.json({ success: false, error: err.message });
                res.json({ success: true, updated: this.changes });
            }
        );
    });

    // ---- DELETE ----
    router.delete("/:id", (req, res) => {
        db.run(
            `DELETE FROM ${table} WHERE id=?`,
            [req.params.id],
            function (err) {
                if (err) return res.json({ success: false, error: err.message });
                res.json({ success: true, deleted: this.changes });
            }
        );
    });

    return router;
}


async function checkThresholdsAndAlert(data, deviceID, isTest = false) {
    try {
        const alerts = []
        const thresholds = await getDeviceThresholds(deviceID);
        if ((!thresholds)) {
            console.log(`No thresholds found for device ${deviceID}`);
            return;
        }

        if (isTest) {
            alerts.push(`🌡️ Nhiệt độ phòng quá cao: ${1000}°C (ngưỡng: ${thresholds.temp}°C)`);
            alerts.push(`💧 Độ ẩm quá cao: ${200}% (ngưỡng: ${thresholds.humid}%)`);

            const message = `🚨 **CẢNH BÁO MÔI TRƯỜNG NGỦ**\n\n` +
                `Thiết bị: ${deviceID}\n` +
                `Thời gian: ${new Date().toLocaleString('vi-VN')}\n\n` +
                alerts.join('\n') +
                `\n\nKhuyến nghị kiểm tra điều kiện phòng ngủ!`;

            await sendTelegramMessage(message);
            console.log(`Sent ${alerts.length} threshold alerts for device ${deviceID}`);
            return
        }

        // Check each metric against thresholds
        if (data.temperature !== null && data.temperature > thresholds.temp) {
            alerts.push(`🌡️ Nhiệt độ phòng quá cao: ${data.temperature.toFixed(1)}°C (ngưỡng: ${thresholds.temp}°C)`);
        }

        if (data.humidity !== null && data.humidity > thresholds.humid) {
            alerts.push(`💧 Độ ẩm quá cao: ${data.humidity.toFixed(1)}% (ngưỡng: ${thresholds.humid}%)`);
        }

        if (data.pm25 !== null && data.pm25 > thresholds.pm25) {
            alerts.push(`🌫️ PM2.5 quá cao: ${data.pm25.toFixed(1)} µg/m³ (ngưỡng: ${thresholds.pm25} µg/m³)`);
        }

        if (data.co2 !== null && data.co2 > thresholds.co2) {
            alerts.push(`🫁 CO2 quá cao: ${data.co2.toFixed(0)} ppm (ngưỡng: ${thresholds.co2} ppm)`);
        }

        if (data.noise !== null && data.noise > thresholds.noise) {
            alerts.push(`🔊 Tiếng ồn quá cao: ${data.noise.toFixed(1)} dB (ngưỡng: ${thresholds.noise} dB)`);
        }

        if (data.light !== null && data.light > thresholds.light) {
            alerts.push(`💡 Ánh sáng quá mạnh: ${data.light.toFixed(0)} lux (ngưỡng: ${thresholds.light} lux)`);
        }

        // Send alerts if any thresholds exceeded
        if (alerts.length > 0) {
            const message = `🚨 **CẢNH BÁO MÔI TRƯỜNG NGỦ**\n\n` +
                `Thiết bị: ${deviceID}\n` +
                `Thời gian: ${new Date().toLocaleString('vi-VN')}\n\n` +
                alerts.join('\n') +
                `\n\nKhuyến nghị kiểm tra điều kiện phòng ngủ!`;

            await sendTelegramMessage(message);
            console.log(`Sent ${alerts.length} threshold alerts for device ${deviceID}`);
        }
    } catch (error) {
        console.error('Error checking thresholds:', error);
    }
}

/**
 * Get thresholds for a device
 */
async function getDeviceThresholds(deviceID) {
    return new Promise((resolve, reject) => {
        const query = `SELECT * FROM thresholds WHERE deviceID = ? ORDER BY id DESC LIMIT 1`;
        db.get(query, [deviceID], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

/**
 * Send Telegram message
 */
async function sendTelegramMessage(message) {
    try {
        if (!telegramBot || !telegramChatId) {
            console.warn('Telegram bot not configured');
            return;
        }

        await telegramBot.sendMessage(telegramChatId, message, {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });

        console.log('Telegram message sent successfully');
    } catch (error) {
        console.error('Error sending Telegram message:', error);
    }
}

// checkThresholdsAndAlert(null, 1, true)

module.exports = createCRUDRoute;
