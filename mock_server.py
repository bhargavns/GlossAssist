"""
Mock inference server for live glossing.

Endpoints:
  GET  /models              → list available models
  POST /<model>/predict     → dummy segmentation + gloss prediction
  POST /codebook/update     → record corrections (simulates active learning)

Run:
  pip install flask flask-cors
  python mock_inference_server.py
"""

import random
import string
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# ─── Fake codebook: { (language, segmentation): gloss } ──────────────────────
# Corrections submitted by users accumulate here.
# Future predictions check this first, simulating active learning.
codebook = {}

# ─── Available "models" ──────────────────────────────────────────────────────
MODELS = ["baseline-v1", "transformer-v2", "active-learning-v3"]

# ─── Dummy morpheme inventory ────────────────────────────────────────────────
PREFIXES = ["na-", "ka-", "mu-", "ni-", "a-", "ki-", ""]
ROOTS = ["pend", "som", "lim", "tak", "chez", "fung", "pat", "end", "anz"]
SUFFIXES = ["-a", "-i", "-e", "-isha", "-wa", "-ika", "-ana", ""]

GLOSS_MAP = {
    "na-": "1SG-", "ka-": "PST-", "mu-": "CL1-", "ni-": "1SG.SUBJ-",
    "a-": "3SG-", "ki-": "CL7-", "": "",
    "pend": "love", "som": "read", "lim": "farm", "tak": "want",
    "chez": "play", "fung": "open", "pat": "get", "end": "go", "anz": "start",
    "-a": "-FV", "-i": "-STAT", "-e": "-SBJV", "-isha": "-CAUS",
    "-wa": "-PASS", "-ika": "-APPL", "-ana": "-RECP",
}


def make_fake_word():
    """Generate a single fake morphologically segmented word + gloss."""
    prefix = random.choice(PREFIXES)
    root = random.choice(ROOTS)
    suffix = random.choice(SUFFIXES)

    segmentation = f"{prefix}{root}{suffix}".replace("--", "-")
    gloss_parts = [GLOSS_MAP.get(prefix, ""), GLOSS_MAP.get(root, "?"), GLOSS_MAP.get(suffix, "")]
    gloss = "".join(p for p in gloss_parts if p)

    # Clean up leading/trailing hyphens for display
    segmentation = segmentation.strip("-") if segmentation else root
    gloss = gloss.strip("-") if gloss else "?"

    return segmentation, gloss


def predict_dummy(transcript, language, model):
    """
    Generate a fake prediction.
    If the codebook has an override for a segment, use that instead.
    """
    # Produce 2–6 "words" regardless of actual transcript content
    n_words = random.randint(2, 6)
    seg_tokens = []
    gloss_tokens = []

    for _ in range(n_words):
        seg, gloss = make_fake_word()

        # Check codebook for an override (simulates active learning)
        key = (language, seg)
        if key in codebook:
            gloss = codebook[key]

        seg_tokens.append(seg)
        gloss_tokens.append(gloss)

    return {
        "segmentation": " ".join(seg_tokens),
        "gloss": " ".join(gloss_tokens),
    }


# ─── Routes ──────────────────────────────────────────────────────────────────

@app.route("/models", methods=["GET"])
def list_models():
    return jsonify({"models": MODELS})


@app.route("/<model>/predict", methods=["POST"])
def predict(model):
    if model not in MODELS:
        return jsonify({"error": f"Unknown model: {model}"}), 404

    data = request.get_json(force=True)
    transcript = data.get("transcript", "")
    language = data.get("language", "unknown")

    result = predict_dummy(transcript, language, model)
    return jsonify(result)


@app.route("/codebook/update", methods=["POST"])
def update_codebook():
    """
    Accept corrections and store them in the codebook.
    Body: { "language": "...", "corrections": [{ "segmentation": "...", "gloss": "..." }, ...] }
    """
    data = request.get_json(force=True)
    language = data.get("language", "unknown")
    corrections = data.get("corrections", [])

    for entry in corrections:
        seg = entry.get("segmentation")
        gloss = entry.get("gloss")
        if seg and gloss:
            codebook[(language, seg)] = gloss

    return jsonify({
        "status": "ok",
        "codebook_size": len(codebook),
        "updated": len(corrections),
    })


@app.route("/codebook", methods=["GET"])
def view_codebook():
    """Debug endpoint: see current codebook state."""
    entries = [
        {"language": lang, "segmentation": seg, "gloss": gloss}
        for (lang, seg), gloss in codebook.items()
    ]
    return jsonify({"entries": entries, "total": len(entries)})


if __name__ == "__main__":
    print("Mock inference server running on http://localhost:5050")
    print(f"Available models: {MODELS}")
    app.run(host="0.0.0.0", port=5050, debug=True)