const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const pgp = require('pg-promise')();
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// Database configuration
const dbConfig = {
  host: process.env.HOST,
  port: 5432,
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
};

const db = pgp(dbConfig);

console.log(process.env.HOST);

// Test database connection
db.connect()
  .then(obj => {
    console.log('Database connection successful');
    obj.done();
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });

// ── Health ────────────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({
    message: 'Linguistic Glossing API is running!',
    timestamp: new Date().toISOString()
  });
});

// ── Languages ─────────────────────────────────────────────────────────────────

app.get('/api/languages', async (req, res) => {
  const query = `SELECT lang_id, lang_str FROM languages ORDER BY lang_str;`;
  try {
    const languages = await db.any(query);
    res.json({ success: true, count: languages.length, data: languages });
  } catch (err) {
    console.error('Error fetching languages:', err);
    res.status(500).json({ error: 'Failed to retrieve languages', details: err.message });
  }
});

// ── Glosses ───────────────────────────────────────────────────────────────────

app.post('/api/upload_glosses', async (req, res) => {
  const { lang, data } = req.body;

  const insertLangQuery = `
    INSERT INTO languages (lang_str) VALUES ($1)
    ON CONFLICT (lang_str) DO UPDATE SET lang_str = EXCLUDED.lang_str
    RETURNING lang_id;
  `;
  const insertGlossQuery = `
    INSERT INTO glosses (transcript, segmentation, gloss, translation, source)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING gloss_id;
  `;
  const insertLangToGloss = `INSERT INTO lang_to_gloss (lang_id, gloss_id) VALUES ($1, $2)`;

  try {
    const langResult = await db.one(insertLangQuery, [lang]);
    const lang_id = langResult.lang_id;
    const insertedCount = [];

    for (const row of data) {
      const glossResult = await db.one(insertGlossQuery, [
        row.transcript,
        row.segmentation,
        row.gloss,
        row.translation,
        row.source || 'train'
      ]);
      await db.none(insertLangToGloss, [lang_id, glossResult.gloss_id]);
      insertedCount.push(glossResult.gloss_id);
    }

    res.json({ message: 'Data saved successfully', count: insertedCount.length, lang_id });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Failed to save data', details: err.message });
  }
});

app.get('/api/get_glosses', async (req, res) => {
  const { lang, limit } = req.query;

  if (!lang) {
    return res.status(400).json({ error: 'Language parameter is required' });
  }

  const langQuery = `SELECT lang_id FROM languages WHERE lang_str = $1`;
  const query = `
    SELECT glosses.gloss_id, glosses.transcript, glosses.segmentation,
           glosses.gloss, glosses.translation, glosses.source
    FROM glosses
    JOIN lang_to_gloss ON lang_to_gloss.gloss_id = glosses.gloss_id
    JOIN languages ON languages.lang_id = lang_to_gloss.lang_id
    WHERE languages.lang_id = $1
    ORDER BY glosses.gloss_id
    LIMIT $2;
  `;

  try {
    const langResult = await db.one(langQuery, [lang]);
    const data = await db.any(query, [langResult.lang_id, limit || 100]);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    console.error('Error fetching glosses:', err);
    if (err.message?.includes('No data returned')) {
      return res.status(404).json({ error: `Language '${lang}' not found` });
    }
    res.status(500).json({ error: 'Failed to retrieve data', details: err.message });
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
// Returns all user corrections for a given morpheme in a language, sorted by frequency.
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
      // Language not found — return empty rather than 404 so the frontend
      // doesn't need special handling for a brand-new language with no corrections yet
      return res.json({ success: true, data: [] });
    }
    res.status(500).json({ error: 'Failed to fetch corrections', details: err.message });
  }
});

// POST /api/corrections
// Body: { lang: string, corrections: [{ segmentation: string, gloss: string }] }
// Upserts each correction, incrementing its count on conflict.
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
      if (!segmentation || !gloss) continue; // skip malformed entries
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

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});