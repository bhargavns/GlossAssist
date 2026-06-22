const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const pgp = require('pg-promise')();
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

// Flask inference server URL (no trailing slash)
const INFERENCE_API_BASE = process.env.INFERENCE_API_BASE || 'http://localhost:8000';

// Middleware
app.use(helmet());
app.use(cors(
  CORS_ORIGINS.length > 0
    ? {
        origin: (origin, callback) => {
          // Allow server-to-server and CLI requests without browser Origin header.
          if (!origin) return callback(null, true);
          if (CORS_ORIGINS.includes(origin)) return callback(null, true);
          return callback(new Error('Not allowed by CORS'));
        }
      }
    : undefined
));
app.use(morgan('combined'));
app.use(express.json());

// Database configuration
const dbConfig = process.env.DATABASE_URL
  ? process.env.DATABASE_URL
  : {
      host: process.env.DB_HOST || process.env.HOST || 'db',
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.POSTGRES_DB,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD
    };

const db = pgp(dbConfig);

console.log(process.env.HOST);

const initializeSchema = async () => {
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS languages (
      lang_id SERIAL PRIMARY KEY,
      lang_str VARCHAR(100) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      user_id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(32) NOT NULL DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS registration_codes (
      id SERIAL PRIMARY KEY,
      code VARCHAR(64) UNIQUE NOT NULL,
      is_used BOOLEAN NOT NULL DEFAULT FALSE,
      used_by INT REFERENCES users(user_id),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS code_requests (
      request_id SERIAL PRIMARY KEY,
      requester_name VARCHAR(255),
      requester_email VARCHAR(255) NOT NULL,
      message TEXT,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS datasets (
      dataset_id SERIAL PRIMARY KEY,
      dataset_name VARCHAR(150) NOT NULL,
      lang_id INT NOT NULL REFERENCES languages(lang_id) ON DELETE CASCADE,
      owner_user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      is_public BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dataset_rows (
      row_id SERIAL PRIMARY KEY,
      dataset_id INT NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
      row_index INT NOT NULL,
      transcript TEXT NOT NULL,
      segmentation TEXT,
      gloss TEXT,
      translation TEXT,
      source VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(dataset_id, row_index)
    );

    CREATE TABLE IF NOT EXISTS study_sessions (
      session_id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      dataset_id INT NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
      run_id VARCHAR(64),
      study_type VARCHAR(20) NOT NULL DEFAULT 'single',
      control_dataset_id INT REFERENCES datasets(dataset_id),
      treatment_dataset_id INT REFERENCES datasets(dataset_id),
      mode VARCHAR(20) NOT NULL,
      example_limit INT NOT NULL,
      total_time_sec INT NOT NULL DEFAULT 0,
      total_edits INT NOT NULL DEFAULT 0,
      summary_json JSONB,
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS study_session_rows (
      id SERIAL PRIMARY KEY,
      session_id INT NOT NULL REFERENCES study_sessions(session_id) ON DELETE CASCADE,
      example_order INT NOT NULL,
      word_index INT NOT NULL,
      row_mode VARCHAR(20) NOT NULL DEFAULT 'treatment',
      row_dataset_id INT REFERENCES datasets(dataset_id),
      segmentation TEXT,
      gloss TEXT,
      translation TEXT,
      source VARCHAR(20),
      time_spent_sec INT NOT NULL DEFAULT 0
    );
  `;

  await db.none(schemaSql);
  await db.none(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'user'`);
  await db.none(`ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS run_id VARCHAR(64)`);
  await db.none(`ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS study_type VARCHAR(20) NOT NULL DEFAULT 'single'`);
  await db.none(`ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS control_dataset_id INT REFERENCES datasets(dataset_id)`);
  await db.none(`ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS treatment_dataset_id INT REFERENCES datasets(dataset_id)`);
  await db.none(`ALTER TABLE study_session_rows ADD COLUMN IF NOT EXISTS row_mode VARCHAR(20) NOT NULL DEFAULT 'treatment'`);
  await db.none(`ALTER TABLE study_session_rows ADD COLUMN IF NOT EXISTS row_dataset_id INT REFERENCES datasets(dataset_id)`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_datasets_owner_visibility ON datasets(owner_user_id, is_public)`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_dataset_rows_dataset_row_index ON dataset_rows(dataset_id, row_index)`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_study_sessions_user_completed ON study_sessions(user_id, completed_at DESC)`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_study_sessions_run_id ON study_sessions(run_id)`);
};

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  return next();
};

const maybeNotifyAdminForCodeRequest = async ({ name, email, message, requestId }) => {
  if (!ADMIN_EMAIL || !process.env.SMTP_HOST) {
    return { emailSent: false, reason: 'SMTP not configured' };
  }

  const smtpPort = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || ''
        }
      : undefined
  });

  await transporter.sendMail({
    from: process.env.SMTP_FROM || ADMIN_EMAIL,
    to: ADMIN_EMAIL,
    subject: `GlossAssist access code request #${requestId}`,
    text: [
      `A new access-code request has been submitted.`,
      ``,
      `Request ID: ${requestId}`,
      `Name: ${name || 'Not provided'}`,
      `Email: ${email}`,
      `Message: ${message || 'Not provided'}`
    ].join('\n')
  });

  return { emailSent: true };
};

const generateRegistrationCode = () => crypto.randomBytes(6).toString('hex').toUpperCase();

// Test database connection
db.connect()
  .then(obj => {
    console.log('Database connection successful');
    obj.done();
    return initializeSchema();
  })
  .then(() => {
    console.log('Schema initialization complete');
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });

app.use('/api', (req, res, next) => {
  const publicPaths = new Set([
    '/health',
    '/auth/login',
    '/auth/register',
    '/auth/request-code',
    '/auth/create-code'
  ]);

  if (publicPaths.has(req.path)) {
    return next();
  }

  return authenticateToken(req, res, next);
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    message: 'Linguistic Glossing API is running!',
    timestamp: new Date().toISOString()
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/request-code', async (req, res) => {
  const name = (req.body?.name || '').trim();
  const email = (req.body?.email || '').trim().toLowerCase();
  const message = (req.body?.message || '').trim();

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const requestRecord = await db.one(
      `INSERT INTO code_requests (requester_name, requester_email, message)
       VALUES ($1, $2, $3)
       RETURNING request_id`,
      [name || null, email, message || null]
    );

    const notifyResult = await maybeNotifyAdminForCodeRequest({
      name,
      email,
      message,
      requestId: requestRecord.request_id
    });

    return res.json({
      success: true,
      requestId: requestRecord.request_id,
      emailSent: notifyResult.emailSent,
      info: notifyResult.reason || null
    });
  } catch (err) {
    console.error('Code request submission failed:', err);
    return res.status(500).json({ error: 'Failed to submit code request' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  const username = (req.body?.username || '').trim();
  const email = (req.body?.email || '').trim().toLowerCase();
  const password = req.body?.password || '';
  const code = (req.body?.code || '').trim();

  if (!username || !email || !password || !code) {
    return res.status(400).json({ error: 'username, email, password, and code are required' });
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  try {
    const existing = await db.oneOrNone(
      `SELECT user_id FROM users WHERE username = $1 OR email = $2`,
      [username, email]
    );

    if (existing) {
      return res.status(409).json({ error: 'Username or email already in use' });
    }

    const envRegistrationCode = (process.env.REGISTRATION_CODE || '').trim();
    let codeRecord = null;

    if (envRegistrationCode && code === envRegistrationCode) {
      codeRecord = null;
    } else {
      codeRecord = await db.oneOrNone(
        `SELECT id, code
         FROM registration_codes
         WHERE code = $1
           AND is_used = FALSE
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [code]
      );

      if (!codeRecord) {
        return res.status(403).json({ error: 'Invalid or expired registration code' });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const createdUser = await db.one(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'user')
       RETURNING user_id, username, email, role`,
      [username, email, passwordHash]
    );

    if (codeRecord) {
      await db.none(
        `UPDATE registration_codes
         SET is_used = TRUE, used_by = $2
         WHERE id = $1`,
        [codeRecord.id, createdUser.user_id]
      );
    }

    const token = jwt.sign(
      {
        userId: createdUser.user_id,
        username: createdUser.username,
        email: createdUser.email,
        role: createdUser.role
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.status(201).json({ success: true, token, user: createdUser });
  } catch (err) {
    console.error('Registration failed:', err);
    return res.status(500).json({ error: 'Failed to register user' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const identifier = (req.body?.identifier || '').trim().toLowerCase();
  const password = req.body?.password || '';

  if (!identifier || !password) {
    return res.status(400).json({ error: 'identifier and password are required' });
  }

  try {
    const user = await db.oneOrNone(
      `SELECT user_id, username, email, password_hash, role
       FROM users
       WHERE LOWER(username) = $1 OR LOWER(email) = $1`,
      [identifier]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const passwordOk = await bcrypt.compare(password, user.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        userId: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({
      success: true,
      token,
      user: {
        user_id: user.user_id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login failed:', err);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const me = await db.oneOrNone(
      `SELECT user_id, username, email, role, created_at FROM users WHERE user_id = $1`,
      [req.user.userId]
    );

    if (!me) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({ success: true, user: me });
  } catch (err) {
    console.error('Failed to fetch profile:', err);
    return res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.post('/api/auth/create-code', async (req, res) => {
  const adminApiKey = process.env.ADMIN_API_KEY || '';
  const providedKey = req.headers['x-admin-api-key'];

  if (!adminApiKey) {
    return res.status(503).json({ error: 'ADMIN_API_KEY is not configured' });
  }

  if (!providedKey || providedKey !== adminApiKey) {
    return res.status(403).json({ error: 'Admin key required' });
  }

  const requestedCode = (req.body?.code || '').trim().toUpperCase();
  const generatedCode = requestedCode || generateRegistrationCode();

  try {
    await db.none(
      `INSERT INTO registration_codes (code, expires_at)
       VALUES ($1, $2)`,
      [generatedCode, req.body?.expiresAt || null]
    );

    return res.status(201).json({ success: true, code: generatedCode });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Code already exists' });
    }
    console.error('Failed to create code:', err);
    return res.status(500).json({ error: 'Failed to create registration code' });
  }
});

app.get('/api/admin/code-requests', requireAdmin, async (req, res) => {
  try {
    const requests = await db.any(
      `SELECT request_id, requester_name, requester_email, message, status, created_at
       FROM code_requests
       ORDER BY created_at DESC`
    );

    return res.json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    console.error('Failed to fetch code requests:', err);
    return res.status(500).json({ error: 'Failed to fetch code requests' });
  }
});

app.patch('/api/admin/code-requests/:id', requireAdmin, async (req, res) => {
  const requestId = Number(req.params.id);
  const status = (req.body?.status || '').trim().toLowerCase();

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return res.status(400).json({ error: 'Invalid request id' });
  }

  const allowedStatuses = new Set(['pending', 'approved', 'rejected']);
  if (!allowedStatuses.has(status)) {
    return res.status(400).json({ error: 'status must be pending, approved, or rejected' });
  }

  try {
    const updated = await db.oneOrNone(
      `UPDATE code_requests
       SET status = $2
       WHERE request_id = $1
       RETURNING request_id, requester_email, status`,
      [requestId, status]
    );

    if (!updated) {
      return res.status(404).json({ error: 'Code request not found' });
    }

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Failed to update code request status:', err);
    return res.status(500).json({ error: 'Failed to update code request status' });
  }
});

app.get('/api/admin/registration-codes', requireAdmin, async (req, res) => {
  try {
    const codes = await db.any(
      `SELECT c.id, c.code, c.is_used, c.created_at, c.expires_at,
              u.user_id AS used_by_user_id, u.username AS used_by_username
       FROM registration_codes c
       LEFT JOIN users u ON u.user_id = c.used_by
       ORDER BY c.created_at DESC
       LIMIT 200`
    );

    return res.json({ success: true, count: codes.length, data: codes });
  } catch (err) {
    console.error('Failed to fetch registration codes:', err);
    return res.status(500).json({ error: 'Failed to fetch registration codes' });
  }
});

app.post('/api/admin/registration-codes', requireAdmin, async (req, res) => {
  const requestedCode = (req.body?.code || '').trim().toUpperCase();
  const generatedCode = requestedCode || generateRegistrationCode();

  try {
    await db.none(
      `INSERT INTO registration_codes (code, expires_at)
       VALUES ($1, $2)`,
      [generatedCode, req.body?.expiresAt || null]
    );

    return res.status(201).json({ success: true, code: generatedCode });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Code already exists' });
    }
    console.error('Failed to create registration code:', err);
    return res.status(500).json({ error: 'Failed to create registration code' });
  }
});

// ── Languages ─────────────────────────────────────────────────────────────────

app.get('/api/languages', async (req, res) => {
  const userId = req.user.userId;
  const isAdmin = req.user.role === 'admin';
  const query = isAdmin
    ? `
      SELECT DISTINCT l.lang_id, l.lang_str
      FROM languages l
      JOIN datasets d ON d.lang_id = l.lang_id
      ORDER BY l.lang_str;
    `
    : `
      SELECT DISTINCT l.lang_id, l.lang_str
      FROM languages l
      JOIN datasets d ON d.lang_id = l.lang_id
      WHERE d.is_public = TRUE OR d.owner_user_id = $1
      ORDER BY l.lang_str;
    `;
  try {
    const languages = isAdmin ? await db.any(query) : await db.any(query, [userId]);
    res.json({ success: true, count: languages.length, data: languages });
  } catch (err) {
    console.error('Error fetching languages:', err);
    res.status(500).json({ error: 'Failed to retrieve languages', details: err.message });
  }
});

app.get('/api/datasets', async (req, res) => {
  const userId = req.user.userId;
  const isAdmin = req.user.role === 'admin';

  const query = isAdmin
    ? `
      SELECT d.dataset_id, d.dataset_name, d.is_public, d.created_at,
             l.lang_str AS language,
             u.username AS owner_username,
             COUNT(r.row_id)::INT AS row_count
      FROM datasets d
      JOIN languages l ON l.lang_id = d.lang_id
      JOIN users u ON u.user_id = d.owner_user_id
      LEFT JOIN dataset_rows r ON r.dataset_id = d.dataset_id
      GROUP BY d.dataset_id, d.dataset_name, d.is_public, d.created_at, l.lang_str, u.username
      ORDER BY d.created_at DESC;
    `
    : `
      SELECT d.dataset_id, d.dataset_name, d.is_public, d.created_at,
             l.lang_str AS language,
             u.username AS owner_username,
             COUNT(r.row_id)::INT AS row_count
      FROM datasets d
      JOIN languages l ON l.lang_id = d.lang_id
      JOIN users u ON u.user_id = d.owner_user_id
      LEFT JOIN dataset_rows r ON r.dataset_id = d.dataset_id
      WHERE d.is_public = TRUE OR d.owner_user_id = $1
      GROUP BY d.dataset_id, d.dataset_name, d.is_public, d.created_at, l.lang_str, u.username
      ORDER BY d.created_at DESC;
    `;

  try {
    const datasets = isAdmin ? await db.any(query) : await db.any(query, [userId]);
    return res.json({ success: true, count: datasets.length, data: datasets });
  } catch (err) {
    console.error('Error fetching datasets:', err);
    return res.status(500).json({ error: 'Failed to retrieve datasets', details: err.message });
  }
});

// ── Glosses ───────────────────────────────────────────────────────────────────

app.post('/api/upload_glosses', async (req, res) => {
  const language = (req.body?.language || req.body?.lang || '').trim();
  const datasetName = (req.body?.datasetName || req.body?.lang || '').trim();
  const data = Array.isArray(req.body?.data) ? req.body.data : [];

  if (!language || !datasetName) {
    return res.status(400).json({ error: 'language and datasetName are required' });
  }

  if (data.length === 0) {
    return res.status(400).json({ error: 'data must include at least one row' });
  }

  try {
    const result = await db.tx(async (trx) => {
      const langResult = await trx.one(
        `INSERT INTO languages (lang_str) VALUES ($1)
         ON CONFLICT (lang_str) DO UPDATE SET lang_str = EXCLUDED.lang_str
         RETURNING lang_id`,
        [language]
      );

      const ownerUserId = req.user.userId;
      const isPublic = req.user.role === 'admin';

      const existingDataset = await trx.oneOrNone(
        `SELECT dataset_id
         FROM datasets
         WHERE dataset_name = $1 AND owner_user_id = $2
         LIMIT 1`,
        [datasetName, ownerUserId]
      );

      let datasetId;

      if (existingDataset) {
        datasetId = existingDataset.dataset_id;
        await trx.none(
          `UPDATE datasets
           SET lang_id = $2, is_public = $3
           WHERE dataset_id = $1`,
          [datasetId, langResult.lang_id, isPublic]
        );
        await trx.none(`DELETE FROM dataset_rows WHERE dataset_id = $1`, [datasetId]);
      } else {
        const insertedDataset = await trx.one(
          `INSERT INTO datasets (dataset_name, lang_id, owner_user_id, is_public)
           VALUES ($1, $2, $3, $4)
           RETURNING dataset_id`,
          [datasetName, langResult.lang_id, ownerUserId, isPublic]
        );
        datasetId = insertedDataset.dataset_id;
      }

      for (let index = 0; index < data.length; index += 1) {
        const row = data[index];
        await trx.none(
          `INSERT INTO dataset_rows (dataset_id, row_index, transcript, segmentation, gloss, translation, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            datasetId,
            index + 1,
            row.transcript || '',
            row.segmentation || null,
            row.gloss || null,
            row.translation || null,
            row.source || 'train'
          ]
        );
      }

      return { datasetId, langId: langResult.lang_id };
    });

    return res.json({
      message: 'Data saved successfully',
      count: data.length,
      dataset_id: result.datasetId,
      lang_id: result.langId
    });
  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ error: 'Failed to save data', details: err.message });
  }
});

app.get('/api/get_glosses', async (req, res) => {
  const datasetId = Number(req.query.datasetId || req.query.lang);
  const hasLimit = typeof req.query.limit !== 'undefined';
  const limit = hasLimit ? Number(req.query.limit) : null;
  const mode = (req.query.mode || 'treatment').toLowerCase();

  if (!datasetId || datasetId <= 0) {
    return res.status(400).json({ error: 'datasetId is required' });
  }

  if (hasLimit && (!Number.isFinite(limit) || limit <= 0)) {
    return res.status(400).json({ error: 'limit must be greater than 0 when provided' });
  }

  const hidePredictions = mode === 'control';

  const datasetQuery = req.user.role === 'admin'
    ? `
      SELECT d.dataset_id, d.dataset_name, d.is_public, l.lang_str AS language
      FROM datasets d
      JOIN languages l ON l.lang_id = d.lang_id
      WHERE d.dataset_id = $1
      LIMIT 1`
    : `
      SELECT d.dataset_id, d.dataset_name, d.is_public, l.lang_str AS language
      FROM datasets d
      JOIN languages l ON l.lang_id = d.lang_id
      WHERE d.dataset_id = $1
        AND (d.is_public = TRUE OR d.owner_user_id = $2)
      LIMIT 1`;

  const rowsQueryWithLimit = `
    SELECT row_id AS gloss_id,
           row_index,
           transcript,
           segmentation,
           gloss,
           translation,
           source
    FROM dataset_rows
    WHERE dataset_id = $1
    ORDER BY row_index
    LIMIT $2
  `;

  const rowsQueryAll = `
    SELECT row_id AS gloss_id,
           row_index,
           transcript,
           segmentation,
           gloss,
           translation,
           source
    FROM dataset_rows
    WHERE dataset_id = $1
    ORDER BY row_index
  `;

  try {
    const dataset = req.user.role === 'admin'
      ? await db.oneOrNone(datasetQuery, [datasetId])
      : await db.oneOrNone(datasetQuery, [datasetId, req.user.userId]);

    if (!dataset) {
      return res.status(404).json({ error: 'Dataset not found or inaccessible' });
    }

    const rows = hasLimit
      ? await db.any(rowsQueryWithLimit, [datasetId, limit])
      : await db.any(rowsQueryAll, [datasetId]);
    const data = rows.map((row) => ({
      ...row,
      segmentation: hidePredictions ? '' : (row.segmentation || ''),
      gloss: hidePredictions ? '' : (row.gloss || ''),
      dataset_id: dataset.dataset_id,
      dataset_name: dataset.dataset_name,
      language: dataset.language,
      mode
    }));

    return res.json({ success: true, count: data.length, dataset, mode, data });
  } catch (err) {
    console.error('Error fetching glosses:', err);
    return res.status(500).json({ error: 'Failed to retrieve data', details: err.message });
  }
});

app.patch('/api/datasets/:datasetId/rows/:rowIndex', async (req, res) => {
  const datasetId = Number(req.params.datasetId);
  const rowIndex = Number(req.params.rowIndex);

  if (!datasetId || datasetId <= 0) {
    return res.status(400).json({ error: 'Valid datasetId is required' });
  }

  if (!rowIndex || rowIndex <= 0) {
    return res.status(400).json({ error: 'Valid rowIndex is required' });
  }

  const segmentation = req.body?.segmentation ?? null;
  const gloss = req.body?.gloss ?? null;
  const translation = req.body?.translation ?? null;
  const source = req.body?.source ?? null;

  try {
    const dataset = req.user.role === 'admin'
      ? await db.oneOrNone(`SELECT dataset_id FROM datasets WHERE dataset_id = $1 LIMIT 1`, [datasetId])
      : await db.oneOrNone(
        `SELECT dataset_id
         FROM datasets
         WHERE dataset_id = $1
           AND (is_public = TRUE OR owner_user_id = $2)
         LIMIT 1`,
        [datasetId, req.user.userId]
      );

    if (!dataset) {
      return res.status(404).json({ error: 'Dataset not found or inaccessible' });
    }

    const updated = await db.oneOrNone(
      `UPDATE dataset_rows
       SET segmentation = $3,
           gloss = $4,
           translation = $5,
           source = $6
       WHERE dataset_id = $1
         AND row_index = $2
       RETURNING row_id, dataset_id, row_index, segmentation, gloss, translation, source`,
      [datasetId, rowIndex, segmentation, gloss, translation, source]
    );

    if (!updated) {
      return res.status(404).json({ error: 'Row not found for dataset' });
    }

    return res.json({ success: true, row: updated });
  } catch (err) {
    console.error('Failed to update dataset row:', err);
    return res.status(500).json({ error: 'Failed to update dataset row' });
  }
});

// ── Study Sessions ───────────────────────────────────────────────────────────

app.post('/api/study-sessions', async (req, res) => {
  const datasetId = Number(req.body?.datasetId);
  const runId = (req.body?.runId || '').trim() || null;
  const studyType = (req.body?.studyType || 'single').toLowerCase();
  const controlDatasetId = Number(req.body?.controlDatasetId || 0) || null;
  const treatmentDatasetId = Number(req.body?.treatmentDatasetId || 0) || null;
  const mode = (req.body?.mode || 'treatment').toLowerCase();
  const exampleLimit = Number(req.body?.exampleLimit || 0);
  const totalTime = Number(req.body?.totalTime || 0);
  const totalEdits = Number(req.body?.totalEdits || 0);
  const exampleModes = req.body?.exampleModes || {};
  const exampleDatasetIds = req.body?.exampleDatasetIds || {};
  const summary = {
    exampleTimes: req.body?.exampleTimes || {},
    exampleEdits: req.body?.exampleEdits || {},
    exampleUncertain: req.body?.exampleUncertain || {},
    exampleModes,
    exampleDatasetIds
  };
  const finalData = req.body?.finalData || {};

  const primaryDatasetId = datasetId || treatmentDatasetId || controlDatasetId;

  if (!primaryDatasetId || primaryDatasetId <= 0) {
    return res.status(400).json({ error: 'datasetId is required' });
  }

  if (!exampleLimit || exampleLimit <= 0) {
    return res.status(400).json({ error: 'exampleLimit must be greater than 0' });
  }

  if (!['control', 'treatment', 'mixed'].includes(mode)) {
    return res.status(400).json({ error: 'mode must be control, treatment, or mixed' });
  }

  if (!['single', 'split', 'shuffle'].includes(studyType)) {
    return res.status(400).json({ error: 'studyType must be single, split, or shuffle' });
  }

  try {
    const savedSession = await db.tx(async (trx) => {
      const datasetCandidates = Array.from(new Set([
        primaryDatasetId,
        controlDatasetId,
        treatmentDatasetId,
        ...Object.values(exampleDatasetIds).map((value) => Number(value) || 0)
      ].filter((value) => value > 0)));

      for (const candidate of datasetCandidates) {
        const dataset = req.user.role === 'admin'
          ? await trx.oneOrNone(`SELECT dataset_id FROM datasets WHERE dataset_id = $1`, [candidate])
          : await trx.oneOrNone(
            `SELECT dataset_id FROM datasets
             WHERE dataset_id = $1
               AND (is_public = TRUE OR owner_user_id = $2)`,
            [candidate, req.user.userId]
          );

        if (!dataset) {
          throw new Error('Dataset not found or inaccessible');
        }
      }

      const session = await trx.one(
        `INSERT INTO study_sessions
           (user_id, dataset_id, run_id, study_type, control_dataset_id, treatment_dataset_id,
            mode, example_limit, total_time_sec, total_edits, summary_json, started_at, completed_at)
         VALUES
           ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING session_id`,
        [
          req.user.userId,
          primaryDatasetId,
          runId,
          studyType,
          controlDatasetId,
          treatmentDatasetId,
          mode,
          exampleLimit,
          totalTime,
          totalEdits,
          summary,
          req.body?.startedAt || new Date().toISOString(),
          req.body?.completedAt || new Date().toISOString()
        ]
      );

      const entries = Object.entries(finalData);
      for (const [exampleIndex, data] of entries) {
        const words = data?.words || {};
        const timeSpentSec = Number(summary.exampleTimes?.[exampleIndex] || 0);
        const source = data?.source || null;
        const translation = data?.translation || null;
        const exampleOrder = Number(exampleIndex) + 1;
        const rowMode = (exampleModes?.[exampleIndex] || mode || 'treatment').toLowerCase();
        const rowDatasetId = Number(exampleDatasetIds?.[exampleIndex] || primaryDatasetId || 0) || null;

        for (const [wordIndex, wordData] of Object.entries(words)) {
          await trx.none(
            `INSERT INTO study_session_rows
               (session_id, example_order, word_index, row_mode, row_dataset_id,
                segmentation, gloss, translation, source, time_spent_sec)
             VALUES
               ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [
              session.session_id,
              exampleOrder,
              Number(wordIndex) + 1,
              rowMode,
              rowDatasetId,
              wordData?.segmentation || null,
              wordData?.gloss || null,
              translation,
              source,
              timeSpentSec
            ]
          );
        }
      }

      return session;
    });

    return res.status(201).json({ success: true, sessionId: savedSession.session_id });
  } catch (err) {
    if (err.message === 'Dataset not found or inaccessible') {
      return res.status(404).json({ error: err.message });
    }
    console.error('Failed to save study session:', err);
    return res.status(500).json({ error: 'Failed to save study session' });
  }
});

app.get('/api/study-sessions', async (req, res) => {
  const runId = (req.query?.runId || '').trim();
  const query = req.user.role === 'admin'
    ? `
      SELECT s.session_id, s.run_id, s.study_type, s.mode, s.example_limit, s.total_time_sec, s.total_edits,
             s.control_dataset_id, s.treatment_dataset_id,
             s.started_at, s.completed_at,
             d.dataset_id, d.dataset_name,
             l.lang_str AS language,
             u.username
      FROM study_sessions s
      JOIN datasets d ON d.dataset_id = s.dataset_id
      JOIN languages l ON l.lang_id = d.lang_id
      JOIN users u ON u.user_id = s.user_id
      ${runId ? 'WHERE s.run_id = $1' : ''}
      ORDER BY s.completed_at DESC
      LIMIT 200`
    : `
      SELECT s.session_id, s.run_id, s.study_type, s.mode, s.example_limit, s.total_time_sec, s.total_edits,
             s.control_dataset_id, s.treatment_dataset_id,
             s.started_at, s.completed_at,
             d.dataset_id, d.dataset_name,
             l.lang_str AS language,
             u.username
      FROM study_sessions s
      JOIN datasets d ON d.dataset_id = s.dataset_id
      JOIN languages l ON l.lang_id = d.lang_id
      JOIN users u ON u.user_id = s.user_id
      WHERE s.user_id = $1
      ${runId ? 'AND s.run_id = $2' : ''}
      ORDER BY s.completed_at DESC
      LIMIT 200`;

  try {
    const sessions = req.user.role === 'admin'
      ? (runId ? await db.any(query, [runId]) : await db.any(query))
      : (runId ? await db.any(query, [req.user.userId, runId]) : await db.any(query, [req.user.userId]));

    return res.json({ success: true, count: sessions.length, data: sessions });
  } catch (err) {
    console.error('Failed to list study sessions:', err);
    return res.status(500).json({ error: 'Failed to list study sessions' });
  }
});

app.get('/api/study-sessions/:id/export', async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!sessionId || sessionId <= 0) {
    return res.status(400).json({ error: 'Invalid session id' });
  }

  try {
    const sessionQuery = req.user.role === 'admin'
      ? `
         SELECT s.session_id, s.run_id, s.study_type, s.mode, s.example_limit, s.total_time_sec, s.total_edits,
           s.summary_json,
               s.control_dataset_id, s.treatment_dataset_id,
               s.started_at, s.completed_at,
               d.dataset_id, d.dataset_name,
               l.lang_str AS language,
               u.username
        FROM study_sessions s
        JOIN datasets d ON d.dataset_id = s.dataset_id
        JOIN languages l ON l.lang_id = d.lang_id
        JOIN users u ON u.user_id = s.user_id
        WHERE s.session_id = $1
        LIMIT 1`
      : `
         SELECT s.session_id, s.run_id, s.study_type, s.mode, s.example_limit, s.total_time_sec, s.total_edits,
           s.summary_json,
           s.control_dataset_id, s.treatment_dataset_id,
               s.started_at, s.completed_at,
               d.dataset_id, d.dataset_name,
               l.lang_str AS language,
               u.username
        FROM study_sessions s
        JOIN datasets d ON d.dataset_id = s.dataset_id
        JOIN languages l ON l.lang_id = d.lang_id
        JOIN users u ON u.user_id = s.user_id
        WHERE s.session_id = $1
          AND s.user_id = $2
        LIMIT 1`;

    const session = req.user.role === 'admin'
      ? await db.oneOrNone(sessionQuery, [sessionId])
      : await db.oneOrNone(sessionQuery, [sessionId, req.user.userId]);

    if (!session) {
      return res.status(404).json({ error: 'Study session not found' });
    }

    const rows = await db.any(
      `SELECT example_order, word_index, row_mode, row_dataset_id,
              segmentation, gloss, translation, source, time_spent_sec
       FROM study_session_rows
       WHERE session_id = $1
       ORDER BY example_order, word_index`,
      [sessionId]
    );

    return res.json({ success: true, session, rows });
  } catch (err) {
    console.error('Failed to export study session:', err);
    return res.status(500).json({ error: 'Failed to export study session' });
  }
});

app.get('/api/study-sessions/:id/comparison-report', async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!sessionId || sessionId <= 0) {
    return res.status(400).json({ error: 'Invalid session id' });
  }

  try {
    const target = req.user.role === 'admin'
      ? await db.oneOrNone(
        `SELECT session_id, user_id, run_id, mode, total_time_sec, completed_at
         FROM study_sessions
         WHERE session_id = $1`,
        [sessionId]
      )
      : await db.oneOrNone(
        `SELECT session_id, user_id, run_id, mode, total_time_sec, completed_at
         FROM study_sessions
         WHERE session_id = $1 AND user_id = $2`,
        [sessionId, req.user.userId]
      );

    if (!target) {
      return res.status(404).json({ error: 'Study session not found' });
    }

    const runSessions = target.run_id
      ? await db.any(
        `SELECT s.session_id, s.mode, s.total_time_sec, s.summary_json, s.completed_at, s.run_id,
                u.username
         FROM study_sessions s
         JOIN users u ON u.user_id = s.user_id
         WHERE s.run_id = $1
           AND s.user_id = $2
         ORDER BY s.completed_at ASC`,
        [target.run_id, target.user_id]
      )
      : await db.any(
        `SELECT s.session_id, s.mode, s.total_time_sec, s.summary_json, s.completed_at, s.run_id,
                u.username
         FROM study_sessions s
         JOIN users u ON u.user_id = s.user_id
         WHERE s.session_id = $1`,
        [target.session_id]
      );

    const sessionIds = runSessions.map((item) => item.session_id);
    const rows = sessionIds.length === 0
      ? []
      : await db.any(
        `SELECT session_id, example_order, row_mode, time_spent_sec
         FROM study_session_rows
         WHERE session_id IN ($1:csv)
         ORDER BY session_id, example_order`,
        [sessionIds]
      );

    const perExampleKeyed = new Map();
    rows.forEach((row) => {
      const modeKey = row.row_mode || 'treatment';
      const key = `${row.session_id}:${row.example_order}:${modeKey}`;
      const previous = perExampleKeyed.get(key) || 0;
      perExampleKeyed.set(key, Math.max(previous, Number(row.time_spent_sec || 0)));
    });

    const uncertaintyByExampleKey = new Map();
    runSessions.forEach((session) => {
      const summary = session.summary_json || {};
      const exampleModes = summary.exampleModes || {};
      const exampleUncertain = summary.exampleUncertain || {};
      const exampleTimes = summary.exampleTimes || {};
      const keys = new Set([
        ...Object.keys(exampleModes),
        ...Object.keys(exampleUncertain),
        ...Object.keys(exampleTimes)
      ]);

      keys.forEach((exampleIndex) => {
        const idx = Number(exampleIndex);
        if (!Number.isFinite(idx) || idx < 0) return;
        const modeKey = String(exampleModes?.[exampleIndex] || session.mode || 'treatment').toLowerCase();
        const exampleOrder = idx + 1;
        const key = `${session.session_id}:${exampleOrder}:${modeKey}`;
        uncertaintyByExampleKey.set(key, Boolean(exampleUncertain?.[exampleIndex]));
      });
    });

    const byMode = {};
    const perExample = [];

    for (const [key, value] of perExampleKeyed.entries()) {
      const [sessionKey, exampleKey, modeKey] = key.split(':');
      if (!byMode[modeKey]) {
        byMode[modeKey] = {
          mode: modeKey,
          totalTimeSec: 0,
          exampleCount: 0,
          avgTimePerExampleSec: 0,
          uncertaintyCount: 0
        };
      }

      byMode[modeKey].totalTimeSec += value;
      byMode[modeKey].exampleCount += 1;
      if (uncertaintyByExampleKey.get(key)) {
        byMode[modeKey].uncertaintyCount += 1;
      }
      perExample.push({
        sessionId: Number(sessionKey),
        mode: modeKey,
        exampleOrder: Number(exampleKey),
        timeSpentSec: value,
        certainty: uncertaintyByExampleKey.get(key) ? 'uncertain' : 'certain'
      });
    }

    Object.values(byMode).forEach((entry) => {
      entry.avgTimePerExampleSec = entry.exampleCount > 0
        ? Number((entry.totalTimeSec / entry.exampleCount).toFixed(2))
        : 0;
    });

    const overallTimeSec = Object.values(byMode).reduce((acc, modeItem) => acc + modeItem.totalTimeSec, 0);
    const overallExamples = Object.values(byMode).reduce((acc, modeItem) => acc + modeItem.exampleCount, 0);

    return res.json({
      success: true,
      report: {
        runId: target.run_id || null,
        sessions: runSessions,
        overall: {
          totalTimeSec: overallTimeSec,
          exampleCount: overallExamples,
          avgTimePerExampleSec: overallExamples > 0 ? Number((overallTimeSec / overallExamples).toFixed(2)) : 0
        },
        byMode: Object.values(byMode),
        perExample
      }
    });
  } catch (err) {
    console.error('Failed to generate comparison report:', err);
    return res.status(500).json({ error: 'Failed to generate comparison report' });
  }
});

// ── Corrections ───────────────────────────────────────────────────────────────
//
// Table required (run once in your DB):
//
//   CREATE TABLE IF NOT EXISTS corrections (
//     id           SERIAL PRIMARY KEY,
//     lang_id      INT NOT NULL REFERENCES languages(lang_id) ON DELETE CASCADE,
//     segmentation TEXT NOT NULL,
//     gloss        TEXT NOT NULL,
//     count        INT NOT NULL DEFAULT 1,
//     UNIQUE(lang_id, segmentation, gloss)
//   );
//   CREATE INDEX IF NOT EXISTS idx_corrections_lookup
//     ON corrections(lang_id, segmentation);

// GET /api/corrections?lang=Swahili&segmentation=na
app.get('/api/corrections', async (req, res) => {
  const { lang, segmentation } = req.query;

  if (!lang || !segmentation) {
    return res.status(400).json({ error: 'lang and segmentation are required' });
  }

  try {
    const langResult = await db.one(
      `SELECT lang_id FROM languages WHERE lang_str = $1`, [lang]
    );
    const corrections = await db.any(
      `SELECT gloss, count
       FROM corrections
       WHERE lang_id = $1 AND segmentation = $2
       ORDER BY count DESC`,
      [langResult.lang_id, segmentation]
    );
    res.json({ success: true, data: corrections });
  } catch (err) {
    if (err.message?.includes('No data returned')) {
      return res.json({ success: true, data: [] });
    }
    res.status(500).json({ error: 'Failed to fetch corrections', details: err.message });
  }
});

// POST /api/corrections
app.post('/api/corrections', async (req, res) => {
  const { lang, corrections } = req.body;

  if (!lang || !Array.isArray(corrections) || corrections.length === 0) {
    return res.status(400).json({ error: 'lang and corrections[] are required' });
  }

  try {
    const langResult = await db.one(
      `SELECT lang_id FROM languages WHERE lang_str = $1`, [lang]
    );
    const lang_id = langResult.lang_id;

    for (const { segmentation, gloss } of corrections) {
      if (!segmentation || !gloss) continue;
      await db.none(
        `INSERT INTO corrections (lang_id, segmentation, gloss, count)
         VALUES ($1, $2, $3, 1)
         ON CONFLICT (lang_id, segmentation, gloss)
         DO UPDATE SET count = corrections.count + 1`,
        [lang_id, segmentation, gloss]
      );
    }

    res.json({ success: true, saved: corrections.length });
  } catch (err) {
    console.error('Error saving corrections:', err);
    res.status(500).json({ error: 'Failed to save corrections', details: err.message });
  }
});

// ── Prediction (proxy to Flask inference server) ──────────────────────────────
//
// POST /api/predict
// Body: { model: string, transcript: string, language: string }
// Forwards to Flask at INFERENCE_API_BASE/<model>/predict
// Returns: { success: true, data: { segmentation, gloss } }

app.post('/api/predict', async (req, res) => {
  const { model, transcript, language } = req.body;

  if (!model || !transcript || !language) {
    return res.status(400).json({
      error: 'model, transcript, and language are required'
    });
  }

  try {
    const flaskResponse = await axios.post(
      `${INFERENCE_API_BASE}/${encodeURIComponent(model)}/predict`,
      { transcript, language },
      { timeout: 30000 } // 30s timeout for inference
    );

    res.json({ success: true, data: flaskResponse.data });
  } catch (err) {
    console.error('Prediction proxy error:', err.message);

    // Forward the Flask error status if available
    const status = err.response?.status || 502;
    const detail = err.response?.data?.error || err.message;

    res.status(status).json({
      error: 'Prediction failed',
      details: detail
    });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});