CREATE TABLE IF NOT EXISTS languages (
  lang_id SERIAL PRIMARY KEY,
  lang_str VARCHAR(100) UNIQUE NOT NULL,
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