"""Download the NLTK resources bundled into the packaged app, if missing.

Extracted from build.bat/build.sh's inline `python -c "..."` one-liner:
a complex one-liner (nested parens/brackets from os.makedirs()/a list literal/
a list-comprehension calling nltk.download()) sitting directly inside a batch
`if (...) ( ... )` block confuses cmd.exe's paren-matching parser and fails
with "... was unexpected at this time." even though the Python syntax itself
is valid — see PROJECT.md v4.9.48 changelog. Keeping this logic in a real
.py file sidesteps that whole class of bug on Windows.

Usage: python scripts/ensure_nltk_resources.py <download_dir>
Exit code 0 on success, 1 on failure (missing arg, download error, etc.).
"""
import os
import sys

PACKAGES = [
    'wordnet',
    'omw-1.4',
    'punkt',
    'punkt_tab',
    'averaged_perceptron_tagger',
    'averaged_perceptron_tagger_eng',
    'stopwords',
]


def main() -> int:
    if len(sys.argv) < 2:
        print('[ERROR] usage: ensure_nltk_resources.py <download_dir>')
        return 1

    download_dir = sys.argv[1]
    os.makedirs(download_dir, exist_ok=True)

    import nltk

    for pkg in PACKAGES:
        nltk.download(pkg, download_dir=download_dir, quiet=True)

    print(f'[INFO] NLTK resources downloaded to {download_dir}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
