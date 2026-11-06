"""Strict validation and import of the public reference-frequency CSV format."""
import csv
import re
import shutil
from pathlib import Path
from services.user_resource_store import staged_import
from services.reference_metadata import reference_metadata, present_reference

REFERENCE_COLUMNS = ["Word", "word", "lemma", "pos", "usas", "freq"]
TEXT_FIELDS = ("name", "prefix", "description")


def validate_reference_csv(path: Path) -> dict:
    count = total = 0
    try:
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream, strict=True)
            if reader.fieldnames != REFERENCE_COLUMNS:
                raise ValueError("CSV header must be: " + ",".join(REFERENCE_COLUMNS))
            for line, row in enumerate(reader, 2):
                if None in row or any(row.get(k) is None for k in REFERENCE_COLUMNS):
                    raise ValueError(f"Row {line}: incorrect number of columns")
                if any(not row[k].strip() for k in REFERENCE_COLUMNS):
                    raise ValueError(f"Row {line}: empty required value")
                if row["word"] != row["Word"].lower():
                    raise ValueError(f"Row {line}: word must be the lowercase form of Word")
                if not re.fullmatch(r"[0-9]+", row["freq"]) or int(row["freq"]) <= 0:
                    raise ValueError(f"Row {line}: freq must be a positive integer")
                count += 1
                total += int(row["freq"])
    except csv.Error as exc:
        raise ValueError("Malformed CSV quoting or row structure") from exc
    except UnicodeError as exc:
        raise ValueError("CSV must use UTF-8 encoding") from exc
    if not count:
        raise ValueError("CSV has no frequency rows")
    return {"rows": count, "word_count": total, "file_size": path.stat().st_size}


def import_reference(path: Path, metadata: dict) -> dict:
    report = validate_reference_csv(path)
    for field in ('tags', 'tags_en', 'tags_zh'):
        if field not in metadata:
            continue
        value = metadata[field]
        if not isinstance(value, (str, list)) or (isinstance(value, list) and any(not isinstance(tag, str) for tag in value)):
            raise ValueError('Required metadata: tags')
    clean = reference_metadata(metadata)
    for field in TEXT_FIELDS:
        value = clean[field]
        if not isinstance(value, str) or not value.strip() or len(value) > 4000:
            raise ValueError(f"Required metadata: {field}")
        clean[field] = value.strip()
    if not clean["tags"] or any(len(tag) > 4000 for tag in clean["tags"]):
        raise ValueError("Required metadata: tags")
    with staged_import("reference") as (stage, meta):
        shutil.copyfile(path, stage / "data.csv")
        meta.update(clean, **report)
    return present_reference(meta)
