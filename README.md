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
INFERENCE_API_BASE=http://your-flask-server:8000
```

### 2. Start services

```bash
docker compose up --build
```

| Service   | URL                        |
|-----------|----------------------------|
| Frontend  | http://localhost:3000       |
| Backend   | http://localhost:5001       |
| Adminer   | http://localhost:8080       |

### 3. Initialize the database

SQL init scripts in `database/init/` are run automatically on first startup by the Postgres container.

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

### Languages

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/languages` | List all languages |

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