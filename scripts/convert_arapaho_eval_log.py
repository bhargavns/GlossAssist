#!/usr/bin/env python3
"""Convert Arapaho evaluation logs into GlossAssist user-study CSV files.

Input: evaluation log with repeated SENTENCE blocks, including lines like:
  Transcript: ...
  Translation: ...
  Pred Segmentation (Extended): ...
  Pred Gloss (Extended): ...

Output: three CSV files accepted by the GlossAssist upload UI or retained for
evaluation:
        - treatment: one disjoint half of the model segmentation/gloss predictions
        - control: the other disjoint half, with predictions retained but hidden by
            GlossAssist control mode
        - evaluation: full predicted-and-gold reference output for the source log
"""

from __future__ import annotations

import argparse
import csv
import random
import re
from pathlib import Path
from typing import Dict, List


_SENTENCE_SPLIT_RE = re.compile(r"^={5,}\nSENTENCE\s+\d+\n={5,}\n", re.MULTILINE)


def _extract_field(block: str, label: str) -> str:
    pattern = re.compile(rf"^{re.escape(label)}\s*(.*)$", re.MULTILINE)
    match = pattern.search(block)
    if not match:
        return ""
    return match.group(1).strip()


def parse_eval_log(log_text: str) -> List[Dict[str, str]]:
    blocks = _SENTENCE_SPLIT_RE.split(log_text)
    rows: List[Dict[str, str]] = []

    for block in blocks:
        if "Transcript:" not in block:
            continue

        transcript = _extract_field(block, "Transcript:")
        translation = _extract_field(block, "Translation:")

        # The study uses Extended-vocabulary model output exclusively.
        segmentation = _extract_field(block, "Pred Segmentation (Extended):")
        gloss = _extract_field(block, "Pred Gloss (Extended):")

        gold_match = re.search(
            r"^COMPLETE SENTENCE GLOSSES:\n"
            r"GT Transcript:\s*(.*)\n"
            r"GT Translation:\s*(.*)\n"
            r"GT Segmentation:\s*(.*)\n"
            r"GT Gloss:\s*(.*)$",
            block,
            re.MULTILINE,
        )

        if not transcript or not segmentation or not gloss or not gold_match:
            raise ValueError("A sentence block is missing a transcript, Extended prediction, or gold-standard output.")

        gold_transcript, gold_translation, gold_segmentation, gold_gloss = gold_match.groups()
        if transcript != gold_transcript or translation != gold_translation:
            raise ValueError("Transcript or translation does not match the complete-sentence gold-standard block.")

        rows.append(
            {
                "transcript": transcript,
                "segmentation": segmentation,
                "gloss": gloss,
                "translation": translation,
                "source": "test",
                "gold_segmentation": gold_segmentation,
                "gold_gloss": gold_gloss,
            }
        )

    return rows


def make_evaluation_rows(rows: List[Dict[str, str]]) -> List[Dict[str, str]]:
    return [
        {
            "transcript": row["transcript"],
            "predicted_segmentation": row["segmentation"],
            "predicted_gloss": row["gloss"],
            "gold_segmentation": row["gold_segmentation"],
            "gold_gloss": row["gold_gloss"],
            "translation": row["translation"],
            "source": row["source"],
        }
        for row in rows
    ]


def write_csv(path: Path, rows: List[Dict[str, str]], fieldnames: List[str] | None = None) -> None:
    fieldnames = fieldnames or ["transcript", "segmentation", "gloss", "translation", "source"]
    with path.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows({field: row.get(field, "") for field in fieldnames} for row in rows)


def split_rows(rows: List[Dict[str, str]], seed: int) -> tuple[List[Dict[str, str]], List[Dict[str, str]]]:
    """Return reproducible, equal-sized, non-overlapping control/treatment sets."""
    if len(rows) % 2 != 0:
        raise ValueError("The source data must contain an even number of rows for an equal condition split.")

    row_indices = list(range(len(rows)))
    random.Random(seed).shuffle(row_indices)
    control_indices = set(row_indices[: len(rows) // 2])

    # Preserve the source-log order inside each exported dataset while ensuring
    # that no source row occurs in both conditions.
    control_rows = [row for index, row in enumerate(rows) if index in control_indices]
    treatment_rows = [row for index, row in enumerate(rows) if index not in control_indices]
    return control_rows, treatment_rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert an Arapaho evaluation log into disjoint study-condition CSVs and a complete predicted-and-gold evaluation CSV.")
    parser.add_argument(
        "--input",
        default="docs/eval_test_2026-07-30_01-23-20.log",
        help="Path to the evaluation log file.",
    )
    parser.add_argument(
        "--output-dir",
        default="docs",
        help="Directory where output CSV files will be written.",
    )
    parser.add_argument(
        "--dataset-prefix",
        default="Arapaho-UserStudy-2026-07-30",
        help="Prefix used for output filenames.",
    )
    parser.add_argument(
        "--split-seed",
        type=int,
        default=20260730,
        help="Seed for the reproducible control/treatment split.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    log_text = input_path.read_text(encoding="utf-8")
    rows = parse_eval_log(log_text)

    if not rows:
        raise SystemExit("No sentence rows found in the provided log file.")

    control_rows, treatment_rows = split_rows(rows, args.split_seed)
    treatment_path = output_dir / f"{args.dataset_prefix}_treatment.csv"
    control_path = output_dir / f"{args.dataset_prefix}_control.csv"
    evaluation_path = output_dir / f"{args.dataset_prefix}_evaluation_gold.csv"

    write_csv(treatment_path, treatment_rows)
    write_csv(control_path, control_rows)
    write_csv(
        evaluation_path,
        make_evaluation_rows(rows),
        [
            "transcript",
            "predicted_segmentation",
            "predicted_gloss",
            "gold_segmentation",
            "gold_gloss",
            "translation",
            "source",
        ],
    )

    print(f"Parsed {len(rows)} sentence rows and split them into {len(control_rows)} control and {len(treatment_rows)} treatment rows")
    print(f"Wrote treatment file:  {treatment_path}")
    print(f"Wrote control file:    {control_path}")
    print(f"Wrote gold file:       {evaluation_path}")


if __name__ == "__main__":
    main()
