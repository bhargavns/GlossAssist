# GlossAssist

A web application for AI-assisted interlinear glossing of linguistic data. GlossAssist pairs a human annotator with a machine learning model: the model proposes morpheme segmentations and gloss labels, the annotator corrects them, and those corrections feed back into a shared codebook that improves suggestions over time.

---

## Features

- **Live model inference** — sends transcripts to a configurable ML backend and displays predicted segmentation and gloss labels word by word
- **Inline correction UI** — annotators can edit segmentation and gloss fields directly, with a dropdown showing the model's prediction alongside past human corrections ranked by frequency
- **Corrections codebook** — every accepted correction is stored in the database and surfaced as a suggestion on future examples with the same morpheme
- **Session tracking** — per-example timers, pause/resume, and a progress bar across the full example set
- **CSV export** — completed sessions export a flat file with example ID, source, word index, segmentation, gloss, translation, and time spent
- **Multi-language support** — language is a first-class parameter throughout the API and UI

---

The **Flask inference server** is an external service not managed by this repo's Docker Compose file. Its base URL is configured via the `INFERENCE_API_BASE` environment variable.

---

## Getting Started

### Prerequisites

- Docker and Docker Compose
- A running instance of the Flask inference server (see [Inference Server](#inference-server))

### 1. Clone and configure

```bash
git clone https://github.com/your-org/glossassist.git
cd glossassist
cp .env.example .env
```

Edit `.env` with your values:

```env
POSTGRES_DB=glossassist
POSTGRES_USER=postgres
POSTGRES_PASSWORD=yourpassword
DATABASE_URL=postgresql://postgres:yourpassword@db:5432/glossassist
JWT_SECRET=your-secret-key
REGISTRATION_CODE=optional-shared-registration-code
ADMIN_EMAIL=admin@example.com
ADMIN_API_KEY=set-a-strong-admin-key
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=smtp-user
SMTP_PASS=smtp-password
SMTP_FROM=glossassist@example.com
INFERENCE_API_BASE=http://your-flask-server:8000
```

For user-study mode in the frontend, set these variables in the frontend environment:

```env
REACT_APP_USER_STUDY_MODE=true
REACT_APP_STUDY_LANG_NO_PRED=Study_NoPred
REACT_APP_STUDY_LANG_WITH_PRED=Study_WithPred
```

### 2. Start services

```bash
docker compose up --build
```

### Production (AWS EC2)

Use the production stack and Dockerfiles instead of dev compose.

1. Prepare env file on server:

```bash
cp .env.example .env
```

Set strong values at minimum:

- `JWT_SECRET`
- `ADMIN_API_KEY`
- `POSTGRES_PASSWORD`
- `CORS_ORIGINS` (comma-separated allowed origins, for example `https://yourdomain.com`)

2. Build and run production services:

```bash
docker compose -f docker-compose.prod.yaml up --build -d
```

3. Service exposure:

- Only Nginx is public on port `80`
- Backend and DB are internal to Docker network

4. First admin user bootstrap:

Run from your EC2 shell after services are up:

```bash
docker compose -f docker-compose.prod.yaml exec backend \
  npm run admin:bootstrap -- \
  --username=your_admin_username \
  --email=you@example.com \
  --password='StrongPassword!ChangeMe'
```

This creates or upgrades that user to role `admin`.

5. Optional registration-code creation via API key:

```bash
curl -X POST http://localhost/api/auth/create-code \
  -H "x-admin-api-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"code":"LIVE-ACCESS-2026"}'
```

If you use TLS termination via ALB/CloudFront/Nginx, call your HTTPS domain instead of localhost.

| Service   | URL                        |
|-----------|----------------------------|
| Frontend  | http://localhost:3000       |
| Backend   | http://localhost:5001       |
| Adminer   | http://localhost:8080       |

### 3. Initialize the database

SQL init scripts in `database/init/` are run automatically on first startup by the Postgres container.

To re-apply schema + seed data at any time (for demo/user-study resets), run:

```bash
npm --prefix backend run db:reseed
```

Default seeded local users:

- Admin: username `admin`, password `Admin123!Change`
- Normal user: username `researcher`, password `User123!Change`

Default seeded study dataset:

- `SampleStudyDataset` (language: `SampleStudyLanguage`, globally visible)

After logging in as admin, open `/admin` in the frontend for the admin console.

The corrections feature requires this table (included in init or run manually):

```sql
CREATE TABLE IF NOT EXISTS corrections (
  id           SERIAL PRIMARY KEY,
  lang_id      INT NOT NULL REFERENCES languages(lang_id) ON DELETE CASCADE,
  segmentation TEXT NOT NULL,
  gloss        TEXT NOT NULL,
  count        INT NOT NULL DEFAULT 1,
  UNIQUE(lang_id, segmentation, gloss)
);

CREATE INDEX IF NOT EXISTS idx_corrections_lookup
  ON corrections(lang_id, segmentation);
```

---

## API Reference

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login with username/email and password |
| `POST` | `/api/auth/register` | Register with username/email/password + access code |
| `POST` | `/api/auth/request-code` | Request an access code (saved + emailed to admin if SMTP configured) |
| `POST` | `/api/auth/create-code` | Admin endpoint to generate a registration code (`x-admin-api-key` header required) |
| `GET` | `/api/auth/me` | Get current authenticated user |

### Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/code-requests` | List all access code requests (admin JWT required) |
| `PATCH` | `/api/admin/code-requests/:id` | Update request status to `pending`, `approved`, or `rejected` |
| `GET` | `/api/admin/registration-codes` | List recently created registration codes |
| `POST` | `/api/admin/registration-codes` | Create a registration code |

All non-auth data endpoints require a valid `Authorization: Bearer <token>` header.

### Languages

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/languages` | List all languages |

### Datasets

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/datasets` | List datasets accessible to current user |
| `POST` | `/api/upload_glosses` | Upload or overwrite a dataset by owner + dataset name |
| `GET` | `/api/get_glosses?datasetId=&limit=&mode=` | Fetch dataset rows for `control` (hide predictions) or `treatment` |

Dataset visibility rules:

- Admin uploads are globally visible.
- Non-admin uploads are only visible to the uploader.

### Glosses

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/get_glosses?lang=&limit=` | Fetch examples for a language |
| `POST` | `/api/upload_glosses` | Bulk upload glossed examples |

### Corrections

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/corrections?lang=&segmentation=` | Get ranked corrections for a morpheme |
| `POST` | `/api/corrections` | Submit one or more new corrections |

### Prediction

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/predict` | Proxy a prediction request to the inference server |

### Study Sessions

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/study-sessions` | Save completed user-study session details + final modified rows |
| `GET` | `/api/study-sessions` | List saved sessions (own sessions, or all for admins) |
| `GET` | `/api/study-sessions/:id/export` | Retrieve saved session rows for CSV export |

Prediction request body:
```json
{ "model": "model-name", "transcript": "source text", "language": "Swahili" }
```

---

## Inference Server

GlossAssist expects an external HTTP server exposing:

```
POST /<model>/predict
Body: { "transcript": "...", "language": "..." }
Response: { "segmentation": "mor-phe-me ...", "gloss": "GLOSS1 GLOSS2 ..." }
```

Set its location with `INFERENCE_API_BASE` (default: `http://localhost:8000`).

---

## Project Structure

```
glossassist/
├── frontend/
│   ├── src/
│   │   ├── pages/         # GlossingPage and other views
│   │   ├── utils/api.js   # API helper functions
│   │   └── styles/
│   └── Dockerfile.dev
├── backend/
│   ├── index.js           # Express server
│   └── Dockerfile.dev
├── database/
│   └── init/              # SQL init scripts run on first startup
├── docker-compose.yml
└── .env.example
```

---

## License

MIT