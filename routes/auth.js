var express = require('express');
var router = express.Router();
var db = require('../db');

// ===== LOGIN =====
router.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get(
        `SELECT * FROM users WHERE username = ? AND password = ?`,
        [username, password],
        (err, user) => {
            if (err) {
                return res.json({ success: false, error: err.message });
            }

            if (user) {
                // ✅ LƯU SESSION
                req.session.user = {
                    username: user.username,
                    deviceID: user.deviceID
                };

                return res.json({
                    success: true,
                    deviceID: user.deviceID
                });
            } else {
                return res.json({
                    success: false,
                    message: "Sai tài khoản hoặc mật khẩu"
                });
            }
        }
    );
});

// ===== CHECK LOGIN =====
router.get('/me', (req, res) => {
    if (req.session.user) {
        return res.json({
            loggedIn: true,
            user: req.session.user
        });
    }

    res.json({ loggedIn: false });
});

// ===== LOGOUT =====
router.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// ===== CHECK USER =====
router.get('/check-user/:username', (req, res) => {
    const username = req.params.username;

    db.get(
        `SELECT * FROM users WHERE username = ?`,
        [username],
        (err, row) => {
            if (err) {
                return res.json({ success: false, error: err.message });
            }

            if (row) {
                res.json({
                    success: true,
                    exists: true,
                    data: row
                });
            } else {
                res.json({
                    success: true,
                    exists: false
                });
            }
        }
    );
});

module.exports = router;