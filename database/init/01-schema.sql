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

CREATE TABLE IF NOT EXISTS glosses (
  gloss_id SERIAL PRIMARY KEY,
  transcript TEXT NOT NULL,
  segmentation TEXT,
  gloss TEXT,
  translation TEXT,
  source VARCHAR(10),
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

CREATE TABLE IF NOT EXISTS lang_to_gloss (
  lang_id INT REFERENCES languages(lang_id),
  gloss_id INT REFERENCES glosses(gloss_id),
  PRIMARY KEY (lang_id, gloss_id)
);

CREATE TABLE IF NOT EXISTS corrections (
  id SERIAL PRIMARY KEY,
  lang_id INT NOT NULL REFERENCES languages(lang_id) ON DELETE CASCADE,
  segmentation TEXT NOT NULL,
  gloss TEXT NOT NULL,
  count INT NOT NULL DEFAULT 1,
  UNIQUE(lang_id, segmentation, gloss)
);
CREATE INDEX IF NOT EXISTS idx_corrections_lookup ON corrections(lang_id, segmentation);
CREATE INDEX IF NOT EXISTS idx_datasets_owner_visibility ON datasets(owner_user_id, is_public);
CREATE INDEX IF NOT EXISTS idx_dataset_rows_dataset_row_index ON dataset_rows(dataset_id, row_index);
CREATE INDEX IF NOT EXISTS idx_study_sessions_user_completed ON study_sessions(user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_study_sessions_run_id ON study_sessions(run_id);