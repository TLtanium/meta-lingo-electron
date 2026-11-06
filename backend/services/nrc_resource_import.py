"""Read the original NRC download folder; no NRC data is shipped in the app."""
import csv
import json
from pathlib import Path
from services.user_resource_store import staged_import
from services.nrc_service import NRC_FILES, NRC_EMOTIONS


def import_nrc(folder: Path) -> dict:
    candidates = {p.name: p for p in folder.rglob("*.txt") if not p.name.startswith("._")}
    lexicons = {}
    english_file = candidates.get("NRC-Emotion-Lexicon-Wordlevel-v0.92.txt")
    if english_file:
        english = {}
        for line in english_file.read_text(encoding="utf-8-sig").splitlines():
            if not line.strip() or line.startswith("#"):
                continue
            parts = line.split("\t")
            if len(parts) != 3 or parts[1] not in NRC_EMOTIONS or parts[2] not in ("0", "1"):
                raise ValueError("Invalid NRC English word-level file")
            scores = english.setdefault(parts[0], dict.fromkeys(NRC_EMOTIONS, 0))
            scores[parts[1]] = max(scores[parts[1]], int(parts[2]))
        if english:
            lexicons["english"] = english
    for language, (filename, key_col) in NRC_FILES.items():
        path = candidates.get(filename)
        if not path:
            continue
        words = {}
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.reader(stream, delimiter="\t")
            header = next(reader, [])
            if header[1:11] != NRC_EMOTIONS:
                raise ValueError(f"Invalid NRC header: {filename}")
            for row in reader:
                if len(row) <= max(10, key_col) or any(v not in ("0", "1") for v in row[1:11]):
                    raise ValueError(f"Invalid NRC row: {filename}")
                word = row[key_col].strip()
                if not word:
                    continue
                scores = words.setdefault(word, dict.fromkeys(NRC_EMOTIONS, 0))
                for emotion, value in zip(NRC_EMOTIONS, row[1:11]):
                    scores[emotion] = max(scores[emotion], int(value))
        if words:
            lexicons[language] = words
    if not lexicons:
        raise ValueError("Select the extracted NRC-Emotion-Lexicon folder (including OneFilePerLanguage)")
    with staged_import("nrc") as (stage, meta):
        for language, lexicon in lexicons.items():
            (stage / f"{language}.json").write_text(json.dumps(lexicon, ensure_ascii=False), encoding="utf-8")
        meta.update(name="NRC Emotion Lexicon", languages={k: len(v) for k, v in lexicons.items()})
    return meta
