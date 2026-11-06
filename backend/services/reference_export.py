"""Combine selected annotated texts into a token-accurate reference CSV."""
import csv
import io
from collections import Counter


def export_reference(texts, load_tokens):
    counts = Counter()
    for text in texts:
        tokens = load_tokens(text)
        if not tokens:
            raise ValueError(f"No annotations: {text.get('filename', text.get('id', 'text'))}")
        for token in tokens:
            word = token.get("text", "")
            if not word.strip() or token.get("is_space"):
                continue
            lemma, pos = token.get("lemma"), token.get("pos")
            # Each token contributes once, using its primary semantic tag only.
            usas = token.get("usas_tag")
            if not usas and token.get("usas_tags"):
                usas = token["usas_tags"][0]
            if not all(isinstance(v, str) and v.strip() for v in (lemma, pos, usas)):
                raise ValueError(f"Complete POS, lemma and USAS annotations before exporting: {text.get('filename', '')}")
            counts[(word, word.lower(), lemma, pos, usas)] += 1
    if not counts:
        raise ValueError("No annotated tokens to export")
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(["Word", "word", "lemma", "pos", "usas", "freq"])
    for key, count in sorted(counts.items()):
        writer.writerow([*key, count])
    return stream.getvalue().encode("utf-8-sig")
