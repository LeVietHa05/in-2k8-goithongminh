const express = require("express");
const db = require("./db");
require('dotenv').config()
const SleepAnalysisService = require('./sleepAnalyzer/sleepAnalysisService')

// Auto CRUD Generator
function createCRUDRoute({ table, columns }) {
    const router = express.Router();

    const colList = columns.join(", ");
    const placeholders = columns.map(() => "?").join(", ");
    const updateList = columns.map(c => `${c}=?`).join(", ");

    // ---- CREATE ----
    router.post("/", (req, res) => {
        const values = columns.map(c => req.body[c] ?? null);
        db.run(
            `INSERT INTO ${table} (${colList}) VALUES (${placeholders})`,
            values,
            function (err) {
                if (err) return res.json({ success: false, error: err.message });

                if (values.includes("sleep_statistics")) {
                    const analysis = new SleepAnalysisService({ openaiApiKey: process.env.OPENAI_API_KEY })
                    analysis.processNewSleepStatistic(this.lastID)
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

module.exports = createCRUDRoute;
