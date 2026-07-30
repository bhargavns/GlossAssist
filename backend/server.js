const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const axios = require('axios');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const pgp = require('pg-promise')();
const { createInferenceProxyHelpers } = require('./src/utils/inferenceProxy');
const { initializeSchema, runInitialAdminBootstrap } = require('./src/utils/startup');
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || '';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const ADMIN_BOOTSTRAP_USERNAME = (process.env.ADMIN_BOOTSTRAP_USERNAME || '').trim();
const ADMIN_BOOTSTRAP_EMAIL = (process.env.ADMIN_BOOTSTRAP_EMAIL || '').trim().toLowerCase();
const ADMIN_BOOTSTRAP_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD || '';
const NODE_ENV = process.env.NODE_ENV || 'development';
const ENFORCE_HTTPS = process.env.ENFORCE_HTTPS === 'true';
const ENABLE_INFERENCE = process.env.ENABLE_INFERENCE === 'true';
const JSON_BODY_LIMIT = process.env.API_JSON_BODY_LIMIT || '25mb';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

if (!JWT_SECRET || JWT_SECRET === 'dev-secret-change-me' || JWT_SECRET === 'replace-with-long-random-secret') {
  throw new Error('JWT_SECRET must be set to a strong, unique value before starting the server');
}

// Flask inference server URL (no trailing slash)
const INFERENCE_API_BASE = process.env.INFERENCE_API_BASE || 'http://localhost:8000';
const ALLOW_LOCAL_INFERENCE_PATHS = process.env.ALLOW_LOCAL_INFERENCE_PATHS === 'true';
const { buildInferencePayload, handleInferenceProxyError } = createInferenceProxyHelpers({
  allowLocalInferencePaths: ALLOW_LOCAL_INFERENCE_PATHS
});

// Middleware
app.set('trust proxy', 1);
app.use(helmet({
  hsts: NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false
}));
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
app.use(express.json({ limit: JSON_BODY_LIMIT }));

if (NODE_ENV === 'production' && ENFORCE_HTTPS) {
  app.use((req, res, next) => {
    const forwardedProto = req.headers['x-forwarded-proto'];
    if (forwardedProto && forwardedProto !== 'https') {
      return res.status(400).json({ error: 'HTTPS is required' });
    }
    return next();
  });
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication requests. Please try again later.' }
});

const adminMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many privileged requests. Please try again later.' }
});

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
    return initializeSchema(db);
  })
  .then(() => {
    return runInitialAdminBootstrap(db, bcrypt, {
      username: ADMIN_BOOTSTRAP_USERNAME,
      email: ADMIN_BOOTSTRAP_EMAIL,
      password: ADMIN_BOOTSTRAP_PASSWORD
    });
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
    '/auth/request-code'
  ]);

  if (publicPaths.has(req.path)) {
    return next();
  }

  return authenticateToken(req, res, next);
});

app.use(['/api/models', '/api/predict', '/api/session-lexicon'], (req, res, next) => {
  if (!ENABLE_INFERENCE) {
    return res.status(503).json({ error: 'Live inference is disabled' });
  }

  return next();
});

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    message: 'Linguistic Glossing API is running!',
    timestamp: new Date().toISOString()
  });
});

// ── Auth ──────────────────────────────────────────────────────────────────────

app.post('/api/auth/request-code', authLimiter, async (req, res) => {
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

app.post('/api/auth/register', authLimiter, async (req, res) => {
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

app.post('/api/auth/login', authLimiter, async (req, res) => {
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

app.post('/api/auth/create-code', adminMutationLimiter, requireAdmin, async (req, res) => {
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

app.patch('/api/admin/code-requests/:id', adminMutationLimiter, requireAdmin, async (req, res) => {
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
    const result = await db.tx(async (trx) => {
      const existing = await trx.oneOrNone(
        `SELECT request_id, requester_email, status
         FROM code_requests
         WHERE request_id = $1
         FOR UPDATE`,
        [requestId]
      );

      if (!existing) {
        return { updated: null, generated: null };
      }

      let updated = existing;
      if (existing.status !== status) {
        updated = await trx.one(
          `UPDATE code_requests
           SET status = $2
           WHERE request_id = $1
           RETURNING request_id, requester_email, status`,
          [requestId, status]
        );
      }

      let generated = null;
      if (status === 'approved' && existing.status !== 'approved') {
        for (let attempt = 0; attempt < 5; attempt += 1) {
          const code = generateRegistrationCode();
          try {
            const inserted = await trx.one(
              `INSERT INTO registration_codes (code, expires_at)
               VALUES ($1, NOW() + INTERVAL '24 hours')
               RETURNING code, expires_at`,
              [code]
            );
            generated = inserted;
            break;
          } catch (insertErr) {
            if (insertErr.code !== '23505') {
              throw insertErr;
            }
          }
        }

        if (!generated) {
          throw new Error('Unable to generate a unique registration code');
        }
      }

      return { updated, generated };
    });

    const updated = result.updated;

    if (!updated) {
      return res.status(404).json({ error: 'Code request not found' });
    }

    return res.json({
      success: true,
      data: updated,
      autoGeneratedCode: result.generated
        ? {
            code: result.generated.code,
            expiresAt: result.generated.expires_at
          }
        : null
    });
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

app.post('/api/admin/registration-codes', adminMutationLimiter, requireAdmin, async (req, res) => {
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
      LEFT JOIN dataset_access_grants g ON g.dataset_id = d.dataset_id AND g.grantee_user_id = $1
      WHERE d.owner_user_id = $1 OR g.grantee_user_id IS NOT NULL
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

  const query = `
      SELECT d.dataset_id,
             d.dataset_name,
             COALESCE(d.description, '') AS description,
             d.is_public,
             d.created_at,
             l.lang_str AS language,
             u.username AS owner_username,
             COUNT(r.row_id)::INT AS row_count,
             (d.owner_user_id = $1) AS is_owner,
             ${isAdmin ? 'TRUE' : '(g.grantee_user_id IS NOT NULL OR d.owner_user_id = $1)'} AS can_access_data,
             ${isAdmin ? 'TRUE' : '(d.owner_user_id = $1)'} AS can_edit_data,
             CASE
               WHEN d.owner_user_id = $1 THEN 'owner'
               ${isAdmin ? "WHEN TRUE THEN 'admin'" : "WHEN g.grantee_user_id IS NOT NULL THEN 'granted'"}
               WHEN req.status = 'pending' THEN 'pending'
               WHEN req.status = 'approved' THEN 'approved'
               WHEN req.status = 'rejected' THEN 'rejected'
               ELSE 'none'
             END AS access_status
      FROM datasets d
      JOIN languages l ON l.lang_id = d.lang_id
      JOIN users u ON u.user_id = d.owner_user_id
      LEFT JOIN dataset_rows r ON r.dataset_id = d.dataset_id
      LEFT JOIN dataset_access_grants g ON g.dataset_id = d.dataset_id AND g.grantee_user_id = $1
      LEFT JOIN dataset_access_requests req ON req.dataset_id = d.dataset_id AND req.requester_user_id = $1
      GROUP BY d.dataset_id, d.dataset_name, d.description, d.is_public, d.created_at, l.lang_str, u.username,
               d.owner_user_id, g.grantee_user_id, req.status
      ORDER BY d.created_at DESC`;

  try {
    const datasets = await db.any(query, [userId]);
    return res.json({ success: true, count: datasets.length, data: datasets });
  } catch (err) {
    console.error('Error fetching datasets:', err);
    return res.status(500).json({ error: 'Failed to retrieve datasets', details: err.message });
  }
});

app.post('/api/datasets/:id/access-request', async (req, res) => {
  const datasetId = Number(req.params.id);
  const requesterId = req.user.userId;

  if (!datasetId || datasetId <= 0) {
    return res.status(400).json({ error: 'Invalid dataset id' });
  }

  try {
    const dataset = await db.oneOrNone(
      `SELECT dataset_id, owner_user_id FROM datasets WHERE dataset_id = $1 LIMIT 1`,
      [datasetId]
    );

    if (!dataset) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    if (Number(dataset.owner_user_id) === Number(requesterId)) {
      return res.status(400).json({ error: 'You already own this dataset' });
    }

    const existingGrant = await db.oneOrNone(
      `SELECT grant_id FROM dataset_access_grants WHERE dataset_id = $1 AND grantee_user_id = $2 LIMIT 1`,
      [datasetId, requesterId]
    );

    if (existingGrant) {
      return res.status(409).json({ error: 'Access is already granted for this dataset' });
    }

    const request = await db.one(
      `INSERT INTO dataset_access_requests (dataset_id, requester_user_id, status, requested_at, resolved_at, resolved_by)
       VALUES ($1, $2, 'pending', NOW(), NULL, NULL)
       ON CONFLICT (dataset_id, requester_user_id)
       DO UPDATE SET
         status = 'pending',
         requested_at = NOW(),
         resolved_at = NULL,
         resolved_by = NULL
       RETURNING request_id, dataset_id, requester_user_id, status, requested_at`,
      [datasetId, requesterId]
    );

    return res.status(201).json({ success: true, data: request });
  } catch (err) {
    console.error('Failed to create access request:', err);
    return res.status(500).json({ error: 'Failed to create dataset access request' });
  }
});

app.get('/api/datasets/access-requests/incoming', async (req, res) => {
  try {
    const requests = await db.any(
      `SELECT r.request_id, r.dataset_id, r.requester_user_id, r.status, r.requested_at, r.resolved_at,
              d.dataset_name, COALESCE(d.description, '') AS dataset_description,
              u.username AS requester_username, u.email AS requester_email
       FROM dataset_access_requests r
       JOIN datasets d ON d.dataset_id = r.dataset_id
       JOIN users u ON u.user_id = r.requester_user_id
       WHERE d.owner_user_id = $1
       ORDER BY r.requested_at DESC`,
      [req.user.userId]
    );
    return res.json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    console.error('Failed to fetch incoming access requests:', err);
    return res.status(500).json({ error: 'Failed to fetch incoming access requests' });
  }
});

app.get('/api/datasets/access-requests/outgoing', async (req, res) => {
  try {
    const requests = await db.any(
      `SELECT r.request_id, r.dataset_id, r.status, r.requested_at, r.resolved_at,
              d.dataset_name, COALESCE(d.description, '') AS dataset_description,
              owner.username AS owner_username
       FROM dataset_access_requests r
       JOIN datasets d ON d.dataset_id = r.dataset_id
       JOIN users owner ON owner.user_id = d.owner_user_id
       WHERE r.requester_user_id = $1
       ORDER BY r.requested_at DESC`,
      [req.user.userId]
    );
    return res.json({ success: true, count: requests.length, data: requests });
  } catch (err) {
    console.error('Failed to fetch outgoing access requests:', err);
    return res.status(500).json({ error: 'Failed to fetch outgoing access requests' });
  }
});

app.get('/api/datasets/access-grants', async (req, res) => {
  const isAdmin = req.user.role === 'admin';
  const userId = req.user.userId;

  try {
    const grants = isAdmin
      ? await db.any(
        `SELECT g.grant_id,
                g.dataset_id,
                d.dataset_name,
                g.grantee_user_id,
                grantee.username AS grantee_username,
                grantee.email AS grantee_email,
                g.granted_by_user_id,
                granter.username AS granted_by_username,
                g.granted_at,
                d.owner_user_id,
                owner.username AS owner_username
         FROM dataset_access_grants g
         JOIN datasets d ON d.dataset_id = g.dataset_id
         JOIN users grantee ON grantee.user_id = g.grantee_user_id
         JOIN users granter ON granter.user_id = g.granted_by_user_id
         JOIN users owner ON owner.user_id = d.owner_user_id
         ORDER BY g.granted_at DESC`
      )
      : await db.any(
        `SELECT g.grant_id,
                g.dataset_id,
                d.dataset_name,
                g.grantee_user_id,
                grantee.username AS grantee_username,
                grantee.email AS grantee_email,
                g.granted_by_user_id,
                granter.username AS granted_by_username,
                g.granted_at,
                d.owner_user_id,
                owner.username AS owner_username
         FROM dataset_access_grants g
         JOIN datasets d ON d.dataset_id = g.dataset_id
         JOIN users grantee ON grantee.user_id = g.grantee_user_id
         JOIN users granter ON granter.user_id = g.granted_by_user_id
         JOIN users owner ON owner.user_id = d.owner_user_id
         WHERE d.owner_user_id = $1
         ORDER BY g.granted_at DESC`,
        [userId]
      );

    return res.json({ success: true, count: grants.length, data: grants });
  } catch (err) {
    console.error('Failed to fetch dataset access grants:', err);
    return res.status(500).json({ error: 'Failed to fetch dataset access grants' });
  }
});

app.delete('/api/datasets/access-grants/:id', async (req, res) => {
  const grantId = Number(req.params.id);

  if (!grantId || grantId <= 0) {
    return res.status(400).json({ error: 'Invalid grant id' });
  }

  try {
    const grant = await db.oneOrNone(
      `SELECT g.grant_id, g.dataset_id, g.grantee_user_id, d.owner_user_id
       FROM dataset_access_grants g
       JOIN datasets d ON d.dataset_id = g.dataset_id
       WHERE g.grant_id = $1
       LIMIT 1`,
      [grantId]
    );

    if (!grant) {
      return res.status(404).json({ error: 'Access grant not found' });
    }

    const isOwner = Number(grant.owner_user_id) === Number(req.user.userId);
    const canManage = isOwner || req.user.role === 'admin';

    if (!canManage) {
      return res.status(403).json({ error: 'Only dataset owner can revoke grants' });
    }

    await db.tx(async (trx) => {
      await trx.none(
        `DELETE FROM dataset_access_grants
         WHERE grant_id = $1`,
        [grantId]
      );

      await trx.none(
        `UPDATE dataset_access_requests
         SET status = 'rejected',
             resolved_at = NOW(),
             resolved_by = $3
         WHERE dataset_id = $1
           AND requester_user_id = $2
           AND status = 'approved'`,
        [grant.dataset_id, grant.grantee_user_id, req.user.userId]
      );
    });

    return res.json({ success: true, data: { grant_id: grantId } });
  } catch (err) {
    console.error('Failed to revoke dataset access grant:', err);
    return res.status(500).json({ error: 'Failed to revoke dataset access grant' });
  }
});

app.patch('/api/datasets/access-requests/:id', async (req, res) => {
  const requestId = Number(req.params.id);
  const status = (req.body?.status || '').trim().toLowerCase();

  if (!requestId || requestId <= 0) {
    return res.status(400).json({ error: 'Invalid request id' });
  }

  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be approved or rejected' });
  }

  try {
    const requestRow = await db.oneOrNone(
      `SELECT r.request_id, r.dataset_id, r.requester_user_id, r.status,
              d.owner_user_id
       FROM dataset_access_requests r
       JOIN datasets d ON d.dataset_id = r.dataset_id
       WHERE r.request_id = $1
       LIMIT 1`,
      [requestId]
    );

    if (!requestRow) {
      return res.status(404).json({ error: 'Access request not found' });
    }

    const isOwner = Number(requestRow.owner_user_id) === Number(req.user.userId);
    const canManage = isOwner || req.user.role === 'admin';
    if (!canManage) {
      return res.status(403).json({ error: 'Only dataset owner can manage access requests' });
    }

    const updated = await db.one(
      `UPDATE dataset_access_requests
       SET status = $2,
           resolved_at = NOW(),
           resolved_by = $3
       WHERE request_id = $1
       RETURNING request_id, dataset_id, requester_user_id, status, requested_at, resolved_at, resolved_by`,
      [requestId, status, req.user.userId]
    );

    if (status === 'approved') {
      await db.none(
        `INSERT INTO dataset_access_grants (dataset_id, grantee_user_id, granted_by_user_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (dataset_id, grantee_user_id)
         DO UPDATE SET granted_by_user_id = EXCLUDED.granted_by_user_id, granted_at = NOW()`,
        [updated.dataset_id, updated.requester_user_id, req.user.userId]
      );
    }

    if (status === 'rejected') {
      await db.none(
        `DELETE FROM dataset_access_grants
         WHERE dataset_id = $1 AND grantee_user_id = $2`,
        [updated.dataset_id, updated.requester_user_id]
      );
    }

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('Failed to update access request:', err);
    return res.status(500).json({ error: 'Failed to update dataset access request' });
  }
});

// ── Glosses ───────────────────────────────────────────────────────────────────

app.post('/api/upload_glosses', async (req, res) => {
  const language = (req.body?.language || req.body?.lang || '').trim();
  const datasetName = (req.body?.datasetName || req.body?.lang || '').trim();
  const description = (req.body?.description || '').trim();
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
      const isPublic = false;

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
           SET lang_id = $2, is_public = $3, description = $4
           WHERE dataset_id = $1`,
          [datasetId, langResult.lang_id, isPublic, description]
        );
        await trx.none(`DELETE FROM dataset_rows WHERE dataset_id = $1`, [datasetId]);
      } else {
        const insertedDataset = await trx.one(
          `INSERT INTO datasets (dataset_name, description, lang_id, owner_user_id, is_public)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING dataset_id`,
          [datasetName, description, langResult.lang_id, ownerUserId, isPublic]
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
      LEFT JOIN dataset_access_grants g ON g.dataset_id = d.dataset_id AND g.grantee_user_id = $2
      WHERE d.dataset_id = $1
        AND (d.owner_user_id = $2 OR g.grantee_user_id IS NOT NULL)
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
         WHERE datasets.dataset_id = $1
           AND owner_user_id = $2
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
            `SELECT datasets.dataset_id FROM datasets
             LEFT JOIN dataset_access_grants g ON g.dataset_id = datasets.dataset_id AND g.grantee_user_id = $2
             WHERE datasets.dataset_id = $1
               AND (datasets.owner_user_id = $2 OR g.grantee_user_id IS NOT NULL)`,
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
        const previousWords = data?.previousWords || {};
        const timeSpentSec = Number(summary.exampleTimes?.[exampleIndex] || 0);
        const transcript = data?.transcript || null;
        const source = data?.source || null;
        const translation = data?.translation || null;
        const exampleOrder = Number(exampleIndex) + 1;
        const rowMode = (exampleModes?.[exampleIndex] || mode || 'treatment').toLowerCase();
        const rowDatasetId = Number(exampleDatasetIds?.[exampleIndex] || primaryDatasetId || 0) || null;
        const sourceRowIndex = Number(data?.sourceRowIndex || 0) || null;

        for (const [wordIndex, wordData] of Object.entries(words)) {
          await trx.none(
            `INSERT INTO study_session_rows
               (session_id, example_order, word_index, row_mode, row_dataset_id, source_row_index,
                transcript, previous_segmentation, previous_gloss,
                segmentation, gloss, translation, source, time_spent_sec)
             VALUES
               ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
            [
              session.session_id,
              exampleOrder,
              Number(wordIndex) + 1,
              rowMode,
              rowDatasetId,
              sourceRowIndex,
              transcript,
              previousWords?.[wordIndex]?.segmentation || null,
              previousWords?.[wordIndex]?.gloss || null,
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
      `SELECT example_order, word_index, row_mode, row_dataset_id, source_row_index,
              transcript, previous_segmentation, previous_gloss,
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

app.post('/api/study-sessions/:id/feedback', async (req, res) => {
  const sessionId = Number(req.params.id);
  const surveyAnswers = req.body?.surveyAnswers || {};
  const interviewAnswers = req.body?.interviewAnswers || {};

  if (!sessionId || sessionId <= 0) {
    return res.status(400).json({ error: 'Invalid session id' });
  }

  if (typeof surveyAnswers !== 'object' || Array.isArray(surveyAnswers)) {
    return res.status(400).json({ error: 'surveyAnswers must be an object' });
  }

  if (typeof interviewAnswers !== 'object' || Array.isArray(interviewAnswers)) {
    return res.status(400).json({ error: 'interviewAnswers must be an object' });
  }

  try {
    const targetSession = req.user.role === 'admin'
      ? await db.oneOrNone(
        `SELECT session_id, user_id
         FROM study_sessions
         WHERE session_id = $1`,
        [sessionId]
      )
      : await db.oneOrNone(
        `SELECT session_id, user_id
         FROM study_sessions
         WHERE session_id = $1
           AND user_id = $2`,
        [sessionId, req.user.userId]
      );

    if (!targetSession) {
      return res.status(404).json({ error: 'Study session not found' });
    }

    const ownerUserId = targetSession.user_id;
    const feedback = await db.one(
      `INSERT INTO study_session_feedback (session_id, user_id, survey_answers, interview_answers, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (session_id)
       DO UPDATE SET
         survey_answers = EXCLUDED.survey_answers,
         interview_answers = EXCLUDED.interview_answers,
         updated_at = NOW()
       RETURNING feedback_id, session_id, user_id, created_at, updated_at`,
      [sessionId, ownerUserId, surveyAnswers, interviewAnswers]
    );

    return res.status(201).json({ success: true, feedback });
  } catch (err) {
    console.error('Failed to save study session feedback:', err);
    return res.status(500).json({ error: 'Failed to save study session feedback' });
  }
});

app.get('/api/study-sessions/:id/feedback', async (req, res) => {
  const sessionId = Number(req.params.id);
  if (!sessionId || sessionId <= 0) {
    return res.status(400).json({ error: 'Invalid session id' });
  }

  try {
    const targetSession = req.user.role === 'admin'
      ? await db.oneOrNone(
        `SELECT session_id, user_id
         FROM study_sessions
         WHERE session_id = $1`,
        [sessionId]
      )
      : await db.oneOrNone(
        `SELECT session_id, user_id
         FROM study_sessions
         WHERE session_id = $1
           AND user_id = $2`,
        [sessionId, req.user.userId]
      );

    if (!targetSession) {
      return res.status(404).json({ error: 'Study session not found' });
    }

    const feedback = await db.oneOrNone(
      `SELECT feedback_id, session_id, user_id, survey_answers, interview_answers, created_at, updated_at
       FROM study_session_feedback
       WHERE session_id = $1
       LIMIT 1`,
      [sessionId]
    );

    return res.json({ success: true, feedback: feedback || null });
  } catch (err) {
    console.error('Failed to fetch study session feedback:', err);
    return res.status(500).json({ error: 'Failed to fetch study session feedback' });
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

// ── Prediction and CWoMP lexicon proxy ───────────────────────────────────────
//
// GET /api/models
// POST /api/session-lexicon/init
// POST /api/session-lexicon/update
// POST /api/predict

app.get('/api/models', async (req, res) => {
  try {
    const flaskResponse = await axios.get(`${INFERENCE_API_BASE}/models`, { timeout: 10000 });
    return res.json({ success: true, models: flaskResponse.data?.models || [] });
  } catch (err) {
    return handleInferenceProxyError(res, err, 'Failed to fetch inference models');
  }
});

app.post('/api/session-lexicon/init', async (req, res) => {
  const sessionKey = req.body?.sessionKey || req.body?.session_key;

  if (!sessionKey) {
    return res.status(400).json({ error: 'sessionKey is required' });
  }

  try {
    const payload = buildInferencePayload(req, {
      session_key: scopedInferenceSessionKey(req, sessionKey),
      ...(req.body?.forceReset || req.body?.force_reset ? { force_reset: true } : {})
    });
    const flaskResponse = await axios.post(
      `${INFERENCE_API_BASE}/session-lexicon/init`,
      payload,
      { timeout: 30000 }
    );
    return res.json({ success: true, data: flaskResponse.data });
  } catch (err) {
    return handleInferenceProxyError(res, err, 'Failed to initialize session lexicon');
  }
});

app.post('/api/session-lexicon/update', async (req, res) => {
  const sessionKey = req.body?.sessionKey || req.body?.session_key;
  const corrections = req.body?.corrections;

  if (!sessionKey || !Array.isArray(corrections)) {
    return res.status(400).json({ error: 'sessionKey and corrections[] are required' });
  }

  try {
    const payload = buildInferencePayload(req, {
      session_key: scopedInferenceSessionKey(req, sessionKey),
      corrections
    });
    const flaskResponse = await axios.post(
      `${INFERENCE_API_BASE}/session-lexicon/update`,
      payload,
      { timeout: 30000 }
    );
    return res.json({ success: true, data: flaskResponse.data });
  } catch (err) {
    return handleInferenceProxyError(res, err, 'Failed to update session lexicon');
  }
});

app.post('/api/predict', async (req, res) => {
  const { model, transcript, language, translation } = req.body;

  if (!model || !transcript || !language) {
    return res.status(400).json({
      error: 'model, transcript, and language are required'
    });
  }

  try {
    const payload = buildInferencePayload(req, {
      transcript,
      language,
      ...(translation ? { translation } : {})
    });
    const flaskResponse = await axios.post(
      `${INFERENCE_API_BASE}/${encodeURIComponent(model)}/predict`,
      payload,
      { timeout: 30000 }
    );

    return res.json({ success: true, data: flaskResponse.data });
  } catch (err) {
    return handleInferenceProxyError(res, err, 'Prediction failed');
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      error: `Request body exceeds the ${JSON_BODY_LIMIT} limit.`
    });
  }

  return next(err);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});