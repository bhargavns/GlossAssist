ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(32) NOT NULL DEFAULT 'user';

INSERT INTO users (username, email, password_hash, role)
VALUES
	('admin', 'admin@example.com', '$2a$10$cz26H.0bI6b522RymMbAxOHMPU6MZ02nRR2co8ey1ran8dsLKfyu.', 'admin'),
	('researcher', 'user@example.com', '$2a$10$EQW6wPyUTtR.UANMEqdzhe6OXazJoe8wg4HnzYPKtDuqkDd1aDU1S', 'user')
ON CONFLICT (username) DO UPDATE
SET
	email = EXCLUDED.email,
	password_hash = EXCLUDED.password_hash,
	role = EXCLUDED.role;

INSERT INTO registration_codes (code, is_used)
VALUES ('WELCOME-2026', FALSE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO languages (lang_str)
VALUES ('SampleStudyLanguage')
ON CONFLICT (lang_str) DO NOTHING;

INSERT INTO datasets (dataset_name, lang_id, owner_user_id, is_public)
SELECT
	'SampleStudyDataset',
	l.lang_id,
	u.user_id,
	TRUE
FROM languages l
JOIN users u ON u.username = 'admin'
WHERE l.lang_str = 'SampleStudyLanguage'
	AND NOT EXISTS (
		SELECT 1 FROM datasets d
		WHERE d.dataset_name = 'SampleStudyDataset'
			AND d.owner_user_id = u.user_id
	);

INSERT INTO datasets (dataset_name, lang_id, owner_user_id, is_public)
SELECT
	'control_dummy',
	l.lang_id,
	u.user_id,
	TRUE
FROM languages l
JOIN users u ON u.username = 'admin'
WHERE l.lang_str = 'SampleStudyLanguage'
	AND NOT EXISTS (
		SELECT 1 FROM datasets d
		WHERE d.dataset_name = 'control_dummy'
			AND d.owner_user_id = u.user_id
	);

INSERT INTO datasets (dataset_name, lang_id, owner_user_id, is_public)
SELECT
	'treament_dummy',
	l.lang_id,
	u.user_id,
	TRUE
FROM languages l
JOIN users u ON u.username = 'admin'
WHERE l.lang_str = 'SampleStudyLanguage'
	AND NOT EXISTS (
		SELECT 1 FROM datasets d
		WHERE d.dataset_name = 'treament_dummy'
			AND d.owner_user_id = u.user_id
	);

WITH target_dataset AS (
	SELECT d.dataset_id
	FROM datasets d
	JOIN users u ON u.user_id = d.owner_user_id
	WHERE d.dataset_name = 'SampleStudyDataset'
		AND u.username = 'admin'
	ORDER BY d.dataset_id DESC
	LIMIT 1
)
INSERT INTO dataset_rows (dataset_id, row_index, transcript, segmentation, gloss, translation, source)
SELECT dataset_id, 1, 'sample sample sample', 'sample sample sample', 'sample sample sample', 'sample', 'dev' FROM target_dataset
UNION ALL
SELECT dataset_id, 2, 'sample sample2 sample', 'sample sample2 sample', 'sample sample2 sample', 'sample', 'dev' FROM target_dataset
UNION ALL
SELECT dataset_id, 3, 'sample2', 'sample2', 'sample2', 'sample2', 'test' FROM target_dataset
UNION ALL
SELECT dataset_id, 4, 'sample3', 'sample3', 'sample3', 'sample3', 'train' FROM target_dataset
UNION ALL
SELECT dataset_id, 5, 'sample4', 'sample4', 'sample4', 'sample4', 'train' FROM target_dataset
UNION ALL
SELECT dataset_id, 6, 'sample4', 'sample4', 'sample4', 'sample4', 'train' FROM target_dataset
ON CONFLICT (dataset_id, row_index) DO UPDATE
SET
	transcript = EXCLUDED.transcript,
	segmentation = EXCLUDED.segmentation,
	gloss = EXCLUDED.gloss,
	translation = EXCLUDED.translation,
	source = EXCLUDED.source;

WITH target_dataset AS (
	SELECT d.dataset_id
	FROM datasets d
	JOIN users u ON u.user_id = d.owner_user_id
	WHERE d.dataset_name = 'control_dummy'
		AND u.username = 'admin'
	ORDER BY d.dataset_id DESC
	LIMIT 1
)
INSERT INTO dataset_rows (dataset_id, row_index, transcript, segmentation, gloss, translation, source)
SELECT dataset_id, 1, 'control alpha one', '', '', 'control translation one', 'seed' FROM target_dataset
UNION ALL
SELECT dataset_id, 2, 'control beta two', '', '', 'control translation two', 'seed' FROM target_dataset
UNION ALL
SELECT dataset_id, 3, 'control gamma three', '', '', 'control translation three', 'seed' FROM target_dataset
ON CONFLICT (dataset_id, row_index) DO UPDATE
SET
	transcript = EXCLUDED.transcript,
	segmentation = EXCLUDED.segmentation,
	gloss = EXCLUDED.gloss,
	translation = EXCLUDED.translation,
	source = EXCLUDED.source;

WITH target_dataset AS (
	SELECT d.dataset_id
	FROM datasets d
	JOIN users u ON u.user_id = d.owner_user_id
	WHERE d.dataset_name = 'treament_dummy'
		AND u.username = 'admin'
	ORDER BY d.dataset_id DESC
	LIMIT 1
)
INSERT INTO dataset_rows (dataset_id, row_index, transcript, segmentation, gloss, translation, source)
SELECT dataset_id, 1, 'treatment alpha one', 'tre-at-ment al-pha one', 'TRT ALPHA ONE', 'treatment translation one', 'seed' FROM target_dataset
UNION ALL
SELECT dataset_id, 2, 'treatment beta two', 'tre-at-ment be-ta two', 'TRT BETA TWO', 'treatment translation two', 'seed' FROM target_dataset
UNION ALL
SELECT dataset_id, 3, 'treatment gamma three', 'tre-at-ment gam-ma three', 'TRT GAMMA THREE', 'treatment translation three', 'seed' FROM target_dataset
ON CONFLICT (dataset_id, row_index) DO UPDATE
SET
	transcript = EXCLUDED.transcript,
	segmentation = EXCLUDED.segmentation,
	gloss = EXCLUDED.gloss,
	translation = EXCLUDED.translation,
	source = EXCLUDED.source;
