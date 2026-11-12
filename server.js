'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const session = require('express-session');
const SQLiteStoreFactory = require('connect-sqlite3');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET || SESSION_SECRET.length < 32) {
    console.error(
        'ERROR: SESSION_SECRET must exist and contain at least 32 characters.'
    );

    process.exit(1);
}


// ==========================================
// DATABASE
// ==========================================

const dataFolder = path.join(__dirname, 'data');

if (!fs.existsSync(dataFolder)) {
    fs.mkdirSync(dataFolder, {
        recursive: true
    });
}

const dbPath = path.join(dataFolder, 'aoea.db');

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS game_progress (
        user_id INTEGER PRIMARY KEY,
        x INTEGER NOT NULL DEFAULT 0,
        y INTEGER NOT NULL DEFAULT 0,
        health INTEGER NOT NULL DEFAULT 90,
        web_energy INTEGER NOT NULL DEFAULT 75,
        completed_missions INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
`);


// ==========================================
// EXPRESS SECURITY
// ==========================================

if (isProduction) {
    app.set('trust proxy', 1);
}

app.disable('x-powered-by');

app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginResourcePolicy: {
            policy: 'cross-origin'
        }
    })
);

app.use(
    express.json({
        limit: '50kb'
    })
);

app.use(
    express.urlencoded({
        extended: false,
        limit: '50kb'
    })
);


// ==========================================
// SESSION
// ==========================================

const SQLiteStore = SQLiteStoreFactory(session);

app.use(
    session({
        store: new SQLiteStore({
            db: 'sessions.db',
            dir: dataFolder
        }),

        name: 'aoea.sid',

        secret: SESSION_SECRET,

        resave: false,

        saveUninitialized: false,

        rolling: true,

        cookie: {
            httpOnly: true,
            secure: isProduction,
            sameSite: 'lax',

            maxAge:
                1000 *
                60 *
                60 *
                24 *
                7
        }
    })
);


// ==========================================
// RATE LIMITING
// ==========================================

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,

    limit: 30,

    standardHeaders: true,

    legacyHeaders: false,

    message: {
        error:
            'Too many attempts. Please wait and try again.'
    }
});


const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,

    limit: 20,

    standardHeaders: true,

    legacyHeaders: false,

    message: {
        error:
            'Too many messages. Please try again later.'
    }
});


// ==========================================
// HELPER FUNCTIONS
// ==========================================

function cleanText(value, maximum = 200) {

    return String(value || '')
        .trim()
        .slice(0, maximum);
}


function formatUser(user) {

    return {
        id: user.id,
        username: user.username,
        email: user.email,
        createdAt: user.created_at
    };
}


function defaultGameState() {

    return {
        x: 0,
        y: 0,
        health: 90,
        webEnergy: 75,
        completedMissions: 0
    };

}


function formatGameState(progress) {

    return {
        x: progress.x,
        y: progress.y,
        health: progress.health,
        webEnergy: progress.web_energy,
        completedMissions: progress.completed_missions,
        updatedAt: progress.updated_at || null
    };

}


// ==========================================
// HEALTH CHECK
// ==========================================

app.get('/api/health', (req, res) => {

    res.json({
        status: 'ok',
        application: 'AOEA Portfolio'
    });

});


// ==========================================
// GAME PROGRESS
// ==========================================

app.get('/api/game/state', (req, res) => {

    if (!req.session.userId) {

        return res.json({
            authenticated: false,
            state: defaultGameState()
        });

    }


    const progress = db.prepare(`
        SELECT x, y, health, web_energy, completed_missions, updated_at
        FROM game_progress
        WHERE user_id = ?
    `).get(req.session.userId);


    res.json({
        authenticated: true,
        state: progress ? formatGameState(progress) : defaultGameState()
    });

});


app.post('/api/game/state', (req, res) => {

    if (!req.session.userId) {

        return res.status(401).json({
            error: 'Log in to save game progress.'
        });

    }


    const state = req.body || {};
    const x = Math.round(Number(state.x));
    const y = Math.round(Number(state.y));
    const health = Math.round(Number(state.health));
    const webEnergy = Math.round(Number(state.webEnergy));
    const completedMissions = Math.round(Number(state.completedMissions));


    if (![x, y, health, webEnergy, completedMissions].every(Number.isFinite)) {

        return res.status(400).json({
            error: 'Game state contains invalid values.'
        });

    }


    const boundedHealth = Math.max(0, Math.min(100, health));
    const boundedWebEnergy = Math.max(0, Math.min(100, webEnergy));
    const boundedMissions = Math.max(0, Math.min(4, completedMissions));


    db.prepare(`
        INSERT INTO game_progress
            (user_id, x, y, health, web_energy, completed_missions, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            x = excluded.x,
            y = excluded.y,
            health = excluded.health,
            web_energy = excluded.web_energy,
            completed_missions = excluded.completed_missions,
            updated_at = CURRENT_TIMESTAMP
    `).run(
        req.session.userId,
        x,
        y,
        boundedHealth,
        boundedWebEnergy,
        boundedMissions
    );


    res.json({
        message: 'Game progress saved.',
        state: {
            x,
            y,
            health: boundedHealth,
            webEnergy: boundedWebEnergy,
            completedMissions: boundedMissions
        }
    });

});


// ==========================================
// SIGN UP
// ==========================================

app.post(
    '/api/auth/signup',
    loginLimiter,
    async (req, res) => {

        const username =
            cleanText(req.body.username, 40);

        const email =
            cleanText(req.body.email, 120)
                .toLowerCase();

        const password =
            String(req.body.password || '');


        if (username.length < 3) {

            return res.status(400).json({
                error:
                    'Username must contain at least 3 characters.'
            });

        }


        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


        if (!emailPattern.test(email)) {

            return res.status(400).json({
                error:
                    'Please enter a valid email address.'
            });

        }


        if (password.length < 8) {

            return res.status(400).json({
                error:
                    'Password must contain at least 8 characters.'
            });

        }


        try {

            const existingUser =
                db.prepare(`
                    SELECT id
                    FROM users
                    WHERE username = ?
                    OR email = ?
                `).get(
                    username,
                    email
                );


            if (existingUser) {

                return res.status(409).json({
                    error:
                        'Username or email already exists.'
                });

            }


            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );


            const result =
                db.prepare(`
                    INSERT INTO users
                    (
                        username,
                        email,
                        password_hash
                    )
                    VALUES (?, ?, ?)
                `).run(
                    username,
                    email,
                    passwordHash
                );


            const user =
                db.prepare(`
                    SELECT
                        id,
                        username,
                        email,
                        created_at
                    FROM users
                    WHERE id = ?
                `).get(
                    result.lastInsertRowid
                );


            req.session.userId =
                user.id;


            req.session.save(
                error => {

                    if (error) {

                        console.error(error);

                        return res
                            .status(500)
                            .json({
                                error:
                                    'Account created but login session failed.'
                            });

                    }


                    res.status(201).json({
                        message:
                            'Account created successfully.',

                        user:
                            formatUser(user)
                    });

                }
            );

        }

        catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    'Unable to create account.'
            });

        }

    }
);


// ==========================================
// LOGIN
// ==========================================

app.post(
    '/api/auth/login',
    loginLimiter,
    async (req, res) => {

        const identity =
            cleanText(
                req.body.identity,
                120
            );

        const password =
            String(
                req.body.password || ''
            );


        if (!identity || !password) {

            return res.status(400).json({
                error:
                    'Enter your username/email and password.'
            });

        }


        try {

            const user =
                db.prepare(`
                    SELECT *
                    FROM users
                    WHERE username = ?
                    OR email = ?
                `).get(
                    identity,
                    identity.toLowerCase()
                );


            if (!user) {

                return res.status(401).json({
                    error:
                        'Incorrect username/email or password.'
                });

            }


            const correctPassword =
                await bcrypt.compare(
                    password,
                    user.password_hash
                );


            if (!correctPassword) {

                return res.status(401).json({
                    error:
                        'Incorrect username/email or password.'
                });

            }


            req.session.regenerate(
                error => {

                    if (error) {

                        console.error(error);

                        return res
                            .status(500)
                            .json({
                                error:
                                    'Unable to create login session.'
                            });

                    }


                    req.session.userId =
                        user.id;


                    req.session.save(
                        saveError => {

                            if (saveError) {

                                console.error(
                                    saveError
                                );

                                return res
                                    .status(500)
                                    .json({
                                        error:
                                            'Unable to save login session.'
                                    });

                            }


                            res.json({
                                message:
                                    'Login successful.',

                                user:
                                    formatUser(
                                        user
                                    )
                            });

                        }
                    );

                }
            );

        }

        catch (error) {

            console.error(error);

            res.status(500).json({
                error:
                    'Unable to log in.'
            });

        }

    }
);


// ==========================================
// CURRENT USER
// ==========================================

app.get(
    '/api/auth/me',
    (req, res) => {

        if (!req.session.userId) {

            return res
                .status(401)
                .json({
                    error:
                        'You are not logged in.'
                });

        }


        const user =
            db.prepare(`
                SELECT
                    id,
                    username,
                    email,
                    created_at
                FROM users
                WHERE id = ?
            `).get(
                req.session.userId
            );


        if (!user) {

            return res
                .status(401)
                .json({
                    error:
                        'User account not found.'
                });

        }


        res.json({
            user:
                formatUser(user)
        });

    }
);


// ==========================================
// LOGOUT
// ==========================================

app.post(
    '/api/auth/logout',
    (req, res) => {

        req.session.destroy(
            error => {

                if (error) {

                    console.error(error);

                    return res
                        .status(500)
                        .json({
                            error:
                                'Unable to logout.'
                        });

                }


                res.clearCookie(
                    'aoea.sid'
                );


                res.json({
                    message:
                        'Logout successful.'
                });

            }
        );

    }
);


// ==========================================
// CONTACT FORM
// ==========================================

app.post(
    '/api/contact',
    contactLimiter,
    (req, res) => {

        const name =
            cleanText(
                req.body.name,
                80
            );

        const email =
            cleanText(
                req.body.email,
                120
            ).toLowerCase();

        const message =
            cleanText(
                req.body.message,
                3000
            );


        if (name.length < 2) {

            return res
                .status(400)
                .json({
                    error:
                        'Please enter your name.'
                });

        }


        const emailPattern =
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


        if (!emailPattern.test(email)) {

            return res
                .status(400)
                .json({
                    error:
                        'Please enter a valid email address.'
                });

        }


        if (message.length < 5) {

            return res
                .status(400)
                .json({
                    error:
                        'Your message is too short.'
                });

        }


        try {

            db.prepare(`
                INSERT INTO contact_messages
                (
                    name,
                    email,
                    message
                )
                VALUES (?, ?, ?)
            `).run(
                name,
                email,
                message
            );


            res
                .status(201)
                .json({
                    message:
                        'Your message was sent successfully.'
                });

        }

        catch (error) {

            console.error(error);

            res
                .status(500)
                .json({
                    error:
                        'Unable to save message.'
                });

        }

    }
);


// ==========================================
// FRONTEND FILES
// ==========================================

app.get(
    '/',
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                'portfolio.html'
            )
        );

    }
);


app.use(
    express.static(
        __dirname,
        {
            dotfiles: 'ignore',

            maxAge:
                isProduction
                    ? '1h'
                    : 0
        }
    )
);


// ==========================================
// API 404
// ==========================================

app.use(
    '/api',
    (req, res) => {

        res
            .status(404)
            .json({
                error:
                    'API route not found.'
            });

    }
);


// ==========================================
// WEBSITE 404
// ==========================================

app.use(
    (req, res) => {

        res
            .status(404)
            .sendFile(
                path.join(
                    __dirname,
                    'portfolio.html'
                )
            );

    }
);


// ==========================================
// START SERVER
// ==========================================

app.listen(
    PORT,
    '0.0.0.0',
    () => {

        console.log(
            `AOEA website running at http://localhost:${PORT}`
        );

    }
);