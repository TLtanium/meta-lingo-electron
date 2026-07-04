"""
Term extraction from bibliographic entries for the CiteSpace network engine.

Turns a list of entries into the per-term incidence structures the rest of the
pipeline consumes: which entries each term appears in, term frequency, and the
term's first appearance year (used for tree-ring colouring and timeline X position).
"""

from __future__ import annotations

import re
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

# Valid Term Source ids (mirror CiteSpace: Title / Abstract / Author Keywords (DE) /
# Keywords Plus (ID) / Noun Phrases (NP)). Used only for keyword/term node types.
TERM_SOURCES = ("title", "abstract", "author_keywords", "keywords_plus", "noun_phrases")
_DEFAULT_TERM_SOURCES = ["title", "abstract", "author_keywords", "keywords_plus"]

# Minimal multilingual-agnostic stopword set for tokenising title/abstract into terms.
_STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with", "by", "as",
    "at", "from", "into", "is", "are", "be", "been", "this", "that", "these", "those",
    "we", "our", "their", "its", "it", "can", "using", "used", "use", "based", "via",
    "study", "studies", "paper", "results", "approach", "method", "methods", "new",
    "two", "one", "three", "between", "which", "such", "more", "than", "also", "however",
}

_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z\-]{1,}|[一-鿿]{2,}")


def _tokenize_terms(text: Optional[str]) -> List[str]:
    """Crude term extraction from title/abstract: keep content unigrams + adjacent
    bigrams (excluding stopwords). Good enough for a CiteSpace-style term network."""
    if not text or not isinstance(text, str):
        return []
    words = [w.lower() for w in _TOKEN_RE.findall(text)]
    content = [w for w in words if w not in _STOPWORDS and len(w) > 2]
    terms: List[str] = list(content)
    # adjacent bigrams of content words (skips across removed stopwords intentionally)
    for i in range(len(content) - 1):
        terms.append(f"{content[i]} {content[i + 1]}")
    return terms


def _filter_noun_phrases(raw_phrases: List[str]) -> List[str]:
    """Common NP filter: 2-5 words, >=4 chars, not all stopwords, de-duplicated."""
    phrases: List[str] = []
    seen: Set[str] = set()
    for p in raw_phrases:
        p = p.lower().strip()
        words = p.split()
        if not (2 <= len(words) <= 5):
            continue
        if len(p) < 4:
            continue
        if all(w in _STOPWORDS for w in words):
            continue
        if p not in seen:
            seen.add(p)
            phrases.append(p)
    return phrases


def _noun_phrases_from_text(text: Optional[str], language: str = "english") -> List[str]:
    """Extract noun phrases via spaCy noun_chunks (ADJ* NOUN+ patterns).

    Fallback path only (entries without a stored SpaCy sidecar): runs live model
    inference, capped at 4000 chars. The normal path reads precomputed sidecar
    tokens instead — see :func:`_noun_phrases_from_sidecar`.
    """
    if not text or not isinstance(text, str):
        return []
    try:
        from ...spacy_service import get_spacy_service
        nlp = get_spacy_service().load_model(language)
        if nlp is None:
            return []
        doc = nlp(text[:4000])
        return _filter_noun_phrases([chunk.text for chunk in doc.noun_chunks])
    except Exception:
        return []


# content_path+mtime -> phrases; bounds repeat visualization calls to pure dict hits
_NP_SIDECAR_CACHE: Dict[str, List[str]] = {}
_NP_POS = frozenset(("ADJ", "NOUN", "PROPN"))


def _noun_phrases_from_tokens(tokens: List[Dict[str, Any]]) -> List[str]:
    """Rebuild noun phrases from stored SpaCy tokens (no model inference).

    Uses the classic ADJ*/NOUN+ pattern: maximal runs of ADJ/NOUN/PROPN tokens
    that end in a NOUN/PROPN. This mirrors what noun_chunks yields for the
    abstract genre while running as a pure linear scan over sidecar data.
    """
    phrases: List[str] = []
    run: List[str] = []
    run_pos: List[str] = []

    def _flush():
        if not run:
            return
        # trim leading tokens until the run starts at an ADJ/NOUN and ends at a NOUN
        end = len(run)
        while end > 0 and run_pos[end - 1] not in ("NOUN", "PROPN"):
            end -= 1
        if end >= 2:
            words = run[max(0, end - 5):end]
            phrases.append(" ".join(words))
        run.clear()
        run_pos.clear()

    for t in tokens:
        if t.get("is_space") or t.get("is_punct"):
            _flush()
            continue
        pos = t.get("pos") or ""
        if pos in _NP_POS:
            run.append(str(t.get("text") or "").lower())
            run_pos.append(pos)
        else:
            _flush()
    _flush()
    return _filter_noun_phrases(phrases)


def _noun_phrases_from_sidecar(entry: Dict[str, Any]) -> Optional[List[str]]:
    """Read the entry's abstract SpaCy sidecar (written at upload time) and rebuild
    noun phrases from its tokens. Returns None when no usable sidecar exists so the
    caller can fall back to live extraction."""
    entry_id = entry.get("id")
    if not entry_id:
        return None
    try:
        import json as _json
        from models.database import BiblioEntryAbstractsDB, TextDB
        from ...corpus_path_utils import resolve_stored_path

        text_id = BiblioEntryAbstractsDB.get_text_id(entry_id)
        if not text_id:
            return None
        text = TextDB.get_by_id(text_id)
        if not text:
            return None
        content_path = resolve_stored_path(text.get("content_path"))
        if not content_path:
            return None
        sidecar = content_path.parent / f"{content_path.stem}.spacy.json"
        if not sidecar.is_file():
            return None
        cache_key = f"{sidecar}:{sidecar.stat().st_mtime_ns}"
        cached = _NP_SIDECAR_CACHE.get(cache_key)
        if cached is not None:
            return cached
        with open(sidecar, "r", encoding="utf-8") as f:
            data = _json.load(f)
        phrases = _noun_phrases_from_tokens(data.get("tokens") or [])
        if len(_NP_SIDECAR_CACHE) > 4000:
            _NP_SIDECAR_CACHE.clear()
        _NP_SIDECAR_CACHE[cache_key] = phrases
        return phrases
    except Exception:
        return None


def _split_kw(raw: Any) -> List[str]:
    """Split a raw keyword string/list (DE / ID fields) into a clean list."""
    if not raw:
        return []
    if isinstance(raw, list):
        items: List[str] = []
        for r in raw:
            items.extend(_split_kw(r))
        return items
    return [p.strip() for p in re.split(r"[;\n,，、|]", str(raw)) if p.strip()]


_REF_YEAR_RE = re.compile(r"(1[5-9]\d{2}|20\d{2})")


def _reference_keys(entry: Dict[str, Any]) -> List[str]:
    """Parse cited references (WOS CR field) into "FirstAuthor, Year" keys — the unit
    of co-citation analysis. Returns de-duplicated keys for one citing paper."""
    raw = entry.get("raw_data") or {}
    cr_text = raw.get("CR") if isinstance(raw, dict) else None
    if not cr_text:
        return []
    out: List[str] = []
    seen: Set[str] = set()
    for line in str(cr_text).split("\n"):
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split(",")]
        author = parts[0].strip()
        if not author or author.lower().startswith("[anonymous"):
            continue
        year = None
        for p in parts[1:]:
            if re.fullmatch(r"(1[5-9]|20)\d{2}", p):
                year = p
                break
        key = (f"{author}, {year}" if year else author).lower()
        if key not in seen:
            seen.add(key)
            out.append(key)
    return out


def _ref_year(key: str) -> Optional[int]:
    """Extract the cited reference's own publication year from its key (for the
    co-citation timeline X axis — these span decades, unlike the citing-corpus year)."""
    m = _REF_YEAR_RE.search(key)
    if not m:
        return None
    y = int(m.group(1))
    return y if 1500 <= y <= 2100 else None


# node_type -> entry field holding that term's list
TERM_FIELDS: Dict[str, str] = {
    "keyword": "keywords",
    "author": "authors",
    "institution": "institutions",
    "country": "countries",
    # "term" is an alias for keyword-space; kept so the frontend's node-type list
    # can offer it without a separate NLP path.
    "term": "keywords",
}


def _as_term_list(raw: Any) -> List[str]:
    """Coerce a possibly-None / str / list field into a clean lowercased term list."""
    if not raw:
        return []
    if isinstance(raw, str):
        raw = [raw]
    out: List[str] = []
    seen: Set[str] = set()
    for item in raw:
        if not item or not isinstance(item, str):
            continue
        t = item.strip().lower()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _safe_year(entry: Dict[str, Any]) -> Optional[int]:
    year = entry.get("year")
    try:
        y = int(year)
    except (TypeError, ValueError):
        return None
    return y if 1900 <= y <= 2100 else None


class TermIndex:
    """Per-term incidence built from a set of entries for one node type."""

    def __init__(self, node_type: str):
        if node_type in ("reference", "co-citation"):
            self.node_type = node_type
            self.field = ""  # references come from raw_data['CR'], not a list field
        else:
            self.node_type = node_type if node_type in TERM_FIELDS else "keyword"
            self.field = TERM_FIELDS[self.node_type]
        # term -> set of entry indices containing it
        self.term_entries: Dict[str, Set[int]] = defaultdict(set)
        # term -> earliest year seen
        self.term_first_year: Dict[str, int] = {}
        # entry index -> set of terms (for co-occurrence)
        self.entry_terms: List[Set[str]] = []
        # entry index -> year (or None)
        self.entry_years: List[Optional[int]] = []
        # entry index -> document text (title + abstract) for label extraction
        self.entry_docs: List[str] = []

    @property
    def term_freq(self) -> Dict[str, int]:
        return {t: len(idxs) for t, idxs in self.term_entries.items()}

    def years_present(self) -> List[int]:
        return sorted({y for y in self.entry_years if y is not None})


# Priority when the same string appears under several node types in a hybrid
# network (higher wins the term_type attribution)
_TYPE_PRIORITY = ("reference", "co-citation", "keyword", "term", "author",
                  "institution", "country")


def merge_term_indexes(indexes: Dict[str, "TermIndex"]) -> Tuple["TermIndex", Dict[str, str]]:
    """Merge per-node-type indexes into one hybrid index (multi node-type networks).

    Entry rows stay aligned (all indexes are built over the same entries list);
    ``entry_terms`` become unions. Returns the merged index plus a
    ``term -> node_type`` map used for per-type shapes / label groups downstream.
    """
    types = [t for t in _TYPE_PRIORITY if t in indexes] + \
            [t for t in indexes if t not in _TYPE_PRIORITY]
    merged = TermIndex(types[0] if types else "keyword")
    merged.node_type = "+".join(types)
    term_type: Dict[str, str] = {}

    n_entries = max((len(ix.entry_terms) for ix in indexes.values()), default=0)
    merged.entry_terms = [set() for _ in range(n_entries)]
    merged.entry_years = [None] * n_entries
    merged.entry_docs = [""] * n_entries

    for nt in types:
        ix = indexes[nt]
        for term, entry_idxs in ix.term_entries.items():
            if term not in term_type:
                term_type[term] = nt
            merged.term_entries[term] |= set(entry_idxs)
            fy = ix.term_first_year.get(term)
            if fy is not None:
                cur = merged.term_first_year.get(term)
                merged.term_first_year[term] = fy if cur is None else min(cur, fy)
        for i in range(len(ix.entry_terms)):
            merged.entry_terms[i] |= ix.entry_terms[i]
            if merged.entry_years[i] is None:
                merged.entry_years[i] = ix.entry_years[i]
            if not merged.entry_docs[i]:
                merged.entry_docs[i] = ix.entry_docs[i]

    return merged, term_type


def _keyword_terms_from_sources(entry: Dict[str, Any], sources: List[str]) -> List[str]:
    """Gather keyword-space terms for an entry from the selected Term Sources."""
    terms: List[str] = []
    raw = entry.get("raw_data") or {}
    de = _split_kw(entry.get("author_keywords") or raw.get("DE"))
    idk = _split_kw(entry.get("keywords_plus") or raw.get("ID"))
    if "author_keywords" in sources:
        terms += de
    if "keywords_plus" in sources:
        terms += idk
    # CNKI / non-WOS often lack split DE/ID — fall back to the combined keywords list
    # whenever a keyword source is requested but nothing split out.
    if ("author_keywords" in sources or "keywords_plus" in sources) and not de and not idk:
        terms += _as_term_list(entry.get("keywords"))
    if "title" in sources:
        terms += _tokenize_terms(entry.get("title"))
    if "abstract" in sources:
        terms += _tokenize_terms(entry.get("abstract"))
    if "noun_phrases" in sources:
        # Fast path: rebuild NPs from the abstract's SpaCy sidecar written at
        # upload/annotation time (pure file read + linear scan, no inference).
        sidecar_phrases = _noun_phrases_from_sidecar(entry)
        if sidecar_phrases is not None:
            terms += sidecar_phrases
        else:
            # Fallback (no sidecar, e.g. annotation still running): live spaCy
            lang = entry.get("_language") or entry.get("language") or "english"
            text = (entry.get("title") or "") + " " + (entry.get("abstract") or "")
            terms += _noun_phrases_from_text(text, lang)
    # de-dupe lowercased while preserving order
    seen: Set[str] = set()
    out: List[str] = []
    for t in terms:
        tl = t.strip().lower()
        if tl and tl not in seen:
            seen.add(tl)
            out.append(tl)
    return out


def build_term_index(entries: List[Dict[str, Any]], node_type: str,
                     term_sources: Optional[List[str]] = None) -> TermIndex:
    """Build a :class:`TermIndex` for the given node type.

    For keyword/term node types, ``term_sources`` (subset of TERM_SOURCES) selects which
    of Title / Abstract / Author Keywords / Keywords Plus feed the terms. Author /
    institution / country node types ignore it (they read their own structured field).
    """
    idx = TermIndex(node_type)
    use_refs = idx.node_type in ("reference", "co-citation")
    use_sources = idx.node_type in ("keyword", "term")
    sources = [s for s in (term_sources or _DEFAULT_TERM_SOURCES) if s in TERM_SOURCES] or list(_DEFAULT_TERM_SOURCES)
    for entry in entries:
        if use_refs:
            terms = _reference_keys(entry)
        elif use_sources:
            terms = _keyword_terms_from_sources(entry, sources)
        else:
            terms = _as_term_list(entry.get(idx.field))
        i = len(idx.entry_terms)
        idx.entry_terms.append(set(terms))
        year = _safe_year(entry)  # citing-paper year (used for time slicing)
        idx.entry_years.append(year)
        title = str(entry.get("title") or "")
        abstract = str(entry.get("abstract") or "")
        idx.entry_docs.append(f"{title}\n{abstract}".strip())
        for t in terms:
            idx.term_entries[t].add(i)
            if use_refs:
                # Co-citation timeline X = the cited reference's OWN year.
                ry = _ref_year(t)
                if ry is not None:
                    idx.term_first_year[t] = ry
            elif year is not None:
                prev = idx.term_first_year.get(t)
                if prev is None or year < prev:
                    idx.term_first_year[t] = year
    return idx


def cooccurrence_pairs(entry_terms: Set[str]) -> List[Tuple[str, str]]:
    """All unordered term pairs co-occurring within a single entry."""
    terms = sorted(entry_terms)
    pairs: List[Tuple[str, str]] = []
    for a in range(len(terms)):
        for b in range(a + 1, len(terms)):
            pairs.append((terms[a], terms[b]))
    return pairs
