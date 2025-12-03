const express = require("express");
const db = require("./db");

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
                res.json({ success: true, id: this.lastID });
            }
        );
    });

    // ---- READ ALL + Pagination ----
    router.get("/", (req, res) => {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        const offset = (page - 1) * limit;

        db.all(
            `SELECT * FROM ${table} LIMIT ? OFFSET ?`,
            [limit, offset],
            (err, rows) => {
                if (err) return res.json({ success: false, error: err.message });

                db.get(`SELECT COUNT(*) AS total FROM ${table}`, (err, count) => {
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
                });
            }
        );
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
