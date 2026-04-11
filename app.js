var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');

var apiRouter = require('./routes/api');
var triggerRouter = require('./routes/trigger');
var getStatisticRouter = require('./routes/get_statistic');
var authRouter = require('./routes/auth');
var controlRouter = require('./routes/control');

var app = express();

// ===== MIDDLEWARE =====
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ===== SESSION =====
app.use(session({
    secret: 'my-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// ===== STATIC =====
app.use(express.static(path.join(__dirname, 'public'), {
    index: false
}));

// ===== API ROUTES =====
app.use('/api', apiRouter);
app.use('/trigger', triggerRouter);
app.use('/statistic', getStatisticRouter);
app.use('/auth', authRouter);
app.use('/control', controlRouter);

// ===== MIDDLEWARE CHECK LOGIN =====
function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

// ===== ROUTES =====
app.get('/', (req, res) => {
    res.redirect('/login');
});

// route động
app.get('/:page', (req, res, next) => {
    const publicPages = ['login'];

    if (!publicPages.includes(req.params.page)) {
        if (!req.session.user) {
            return res.redirect('/login');
        }
    }

    next();
}, (req, res) => {
    const filePath = path.join(__dirname, 'public', `${req.params.page}.html`);

    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(404).send('Trang không tồn tại!');
        }
    });
});

module.exports = app;