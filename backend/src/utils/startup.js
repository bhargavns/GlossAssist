const initializeSchema = async (db) => {
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
      description TEXT,
      lang_id INT NOT NULL REFERENCES languages(lang_id) ON DELETE CASCADE,
      owner_user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      is_public BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS dataset_access_requests (
      request_id SERIAL PRIMARY KEY,
      dataset_id INT NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
      requester_user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP,
      resolved_by INT REFERENCES users(user_id),
      UNIQUE(dataset_id, requester_user_id)
    );

    CREATE TABLE IF NOT EXISTS dataset_access_grants (
      grant_id SERIAL PRIMARY KEY,
      dataset_id INT NOT NULL REFERENCES datasets(dataset_id) ON DELETE CASCADE,
      grantee_user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      granted_by_user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(dataset_id, grantee_user_id)
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
      source_row_index INT,
      transcript TEXT,
      previous_segmentation TEXT,
      previous_gloss TEXT,
      segmentation TEXT,
      gloss TEXT,
      translation TEXT,
      source VARCHAR(20),
      time_spent_sec INT NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS study_session_feedback (
      feedback_id SERIAL PRIMARY KEY,
      session_id INT NOT NULL UNIQUE REFERENCES study_sessions(session_id) ON DELETE CASCADE,
      user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      survey_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      interview_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS app_bootstrap_flags (
      key VARCHAR(120) PRIMARY KEY,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await db.none(schemaSql);
  await db.none(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'user'`);
  await db.none(`ALTER TABLE datasets ADD COLUMN IF NOT EXISTS description TEXT`);
  await db.none(`ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS run_id VARCHAR(64)`);
  await db.none(`ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS study_type VARCHAR(20) NOT NULL DEFAULT 'single'`);
  await db.none(`ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS control_dataset_id INT REFERENCES datasets(dataset_id)`);
  await db.none(`ALTER TABLE study_sessions ADD COLUMN IF NOT EXISTS treatment_dataset_id INT REFERENCES datasets(dataset_id)`);
  await db.none(`ALTER TABLE study_session_rows ADD COLUMN IF NOT EXISTS row_mode VARCHAR(20) NOT NULL DEFAULT 'treatment'`);
  await db.none(`ALTER TABLE study_session_rows ADD COLUMN IF NOT EXISTS row_dataset_id INT REFERENCES datasets(dataset_id)`);
  await db.none(`ALTER TABLE study_session_rows ADD COLUMN IF NOT EXISTS source_row_index INT`);
  await db.none(`ALTER TABLE study_session_rows ADD COLUMN IF NOT EXISTS transcript TEXT`);
  await db.none(`ALTER TABLE study_session_rows ADD COLUMN IF NOT EXISTS previous_segmentation TEXT`);
  await db.none(`ALTER TABLE study_session_rows ADD COLUMN IF NOT EXISTS previous_gloss TEXT`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_datasets_owner_visibility ON datasets(owner_user_id, is_public)`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_dataset_access_requests_dataset ON dataset_access_requests(dataset_id)`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_dataset_access_requests_requester ON dataset_access_requests(requester_user_id)`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_dataset_access_grants_dataset ON dataset_access_grants(dataset_id)`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_dataset_access_grants_grantee ON dataset_access_grants(grantee_user_id)`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_dataset_rows_dataset_row_index ON dataset_rows(dataset_id, row_index)`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_study_sessions_user_completed ON study_sessions(user_id, completed_at DESC)`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_study_sessions_run_id ON study_sessions(run_id)`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_study_session_rows_source ON study_session_rows(row_dataset_id, source_row_index)`);
  await db.none(`CREATE INDEX IF NOT EXISTS idx_study_feedback_user ON study_session_feedback(user_id)`);
};

const runInitialAdminBootstrap = async (db, bcrypt, options) => {
  const {
    username,
    email,
    password
  } = options;

  const hasAnyAdminBootstrapValue = Boolean(username || email || password);

  if (!hasAnyAdminBootstrapValue) {
    return;
  }

  if (!username || !email || !password) {
    throw new Error(
      'ADMIN_BOOTSTRAP_USERNAME, ADMIN_BOOTSTRAP_EMAIL, and ADMIN_BOOTSTRAP_PASSWORD must all be set together'
    );
  }

  const alreadyBootstrapped = await db.oneOrNone(
    `SELECT key FROM app_bootstrap_flags WHERE key = 'admin_bootstrap_done'`
  );

  if (alreadyBootstrapped) {
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await db.tx(async (transaction) => {
    await transaction.none(
      `INSERT INTO users (username, email, password_hash, role)
       VALUES ($1, $2, $3, 'admin')
       ON CONFLICT (username)
       DO UPDATE SET
         email = EXCLUDED.email,
         password_hash = EXCLUDED.password_hash,
         role = 'admin'`,
      [username, email, passwordHash]
    );

    await transaction.none(
      `INSERT INTO app_bootstrap_flags (key)
       VALUES ('admin_bootstrap_done')
       ON CONFLICT (key) DO NOTHING`
    );
  });

  console.log(`Admin bootstrap complete for user "${username}"`);
};

module.exports = {
  initializeSchema,
  runInitialAdminBootstrap
};
