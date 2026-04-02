const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const pgp = require('pg-promise')(); // To connect to the Postgres DB from the node server
const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

// database configuration
const dbConfig = {
  host: process.env.HOST, // the database server
  port: 5432, // the database port
  database: process.env.POSTGRES_DB, // the database name
  user: process.env.POSTGRES_USER, // the user account to connect with
  password: process.env.POSTGRES_PASSWORD, // the password of the user account
};

const db = pgp(dbConfig);

console.log(process.env.HOST)

// test your database
db.connect()
  .then(obj => {
    console.log('Database connection successful'); // you can view this message in the docker compose logs
    obj.done(); // success, release the connection;
  })
  .catch(error => {
    console.log('ERROR:', error.message || error);
  });

// Basic route
app.get('/api/health', (req, res) => {
  res.json({ 
    message: 'Linguistic Glossing API is running!',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/languages', async (req, res) => {
  const query = `SELECT lang_id, lang_str FROM languages ORDER BY lang_str;`;
  
  try {
    const languages = await db.any(query);
    res.json({ 
      success: true, 
      count: languages.length,
      data: languages 
    });
  } catch (err) {
    console.error('Error fetching languages:', err);
    res.status(500).json({ 
      error: 'Failed to retrieve languages', 
      details: err.message 
    });
  }
});


app.post('/api/upload_glosses', async (req, res) => {
  const { lang, data } = req.body; // data should now include 'source' field

  const insertLangQuery = "INSERT INTO languages (lang_str) VALUES ($1) ON CONFLICT (lang_str) DO UPDATE SET lang_str = EXCLUDED.lang_str RETURNING lang_id;";
  const insertGlossQuery = "INSERT INTO glosses (transcript, segmentation, gloss, translation, source) VALUES ($1, $2, $3, $4, $5) RETURNING gloss_id;";
  const insertLangToGloss = "INSERT INTO lang_to_gloss (lang_id, gloss_id) VALUES ($1, $2)";

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
        row.source || 'train' // default to 'train' if not specified
      ]);
      const gloss_id = glossResult.gloss_id;
      
      await db.none(insertLangToGloss, [lang_id, gloss_id]);
      insertedCount.push(gloss_id);
    }

    res.json({ 
      message: 'Data saved successfully', 
      count: insertedCount.length,
      lang_id: lang_id
    });
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
  const query = `SELECT glosses.gloss_id, glosses.transcript, glosses.segmentation, 
                        glosses.gloss, glosses.translation, glosses.source 
                 FROM glosses 
                 JOIN lang_to_gloss ON lang_to_gloss.gloss_id = glosses.gloss_id 
                 JOIN languages ON languages.lang_id = lang_to_gloss.lang_id
                 WHERE languages.lang_id = $1
                 ORDER BY glosses.gloss_id
                 LIMIT $2;`;

  try {
    const langResult = await db.one(langQuery, [lang]);
    const lang_id = langResult.lang_id;
    
    const data = await db.any(query, [lang_id, limit || 100]);
    
    res.json({ 
      success: true, 
      count: data.length, 
      data: data 
    });
    
  } catch (err) {
    console.error('Error fetching glosses:', err);
    
    if (err.message && err.message.includes('No data returned')) {
      return res.status(404).json({ error: `Language '${lang}' not found` });
    }
    
    res.status(500).json({ error: 'Failed to retrieve data', details: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});