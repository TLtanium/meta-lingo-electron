"""
Crossref metadata enrichment for paper-PDF imports.

Given an uploaded paper PDF (no Refworks metadata), this module:
  1. Extracts candidate bibliographic hints from the PDF (embedded DOI, title, author).
  2. Queries the public Crossref REST API (https://api.crossref.org) to resolve full
     metadata: title, authors, year, journal, volume/issue/pages, DOI, abstract, keywords,
     publisher, document type, citation count.
  3. Maps the Crossref record onto a biblio-entry dict compatible with BiblioEntryDB.

Designed to be robust: every network/parse failure degrades gracefully to whatever could be
extracted from the PDF itself, so an entry is always created.

Uses `httpx` (already a packaged dependency, used throughout the backend) and `fitz`
(PyMuPDF, already packaged). No new dependencies.
"""

import html
import logging
import re
import uuid
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

from services.pdf_text_service import extract_text_from_pdf_bytes

logger = logging.getLogger(__name__)

CROSSREF_BASE = "https://api.crossref.org/works"
ARXIV_API = "http://export.arxiv.org/api/query"
# Crossref asks for a mailto in the User-Agent for the "polite pool" (faster, more reliable).
_USER_AGENT = "Meta-Lingo/1.0 (https://github.com/; mailto:meta-lingo@example.com)"
_HTTP_TIMEOUT = 10

# DOI pattern (intentionally permissive); trailing punctuation is trimmed afterwards.
_DOI_RE = re.compile(r"10\.\d{4,9}/[-._;()/:A-Za-z0-9]+", re.IGNORECASE)

# arXiv identifier, both modern (1503.02531) and legacy (hep-th/9901001) forms, with an
# optional version suffix. arXiv PDFs carry this as a side-margin stamp on page 1.
_ARXIV_ID_RE = re.compile(
    r"arxiv:\s*(?P<id>(?:[a-z\-]+(?:\.[A-Z]{2})?/\d{7}|\d{4}\.\d{4,5}))(?:v\d+)?",
    re.IGNORECASE,
)

_CROSSREF_TYPE_MAP = {
    "journal-article": "Journal Article",
    "proceedings-article": "Conference Paper",
    "book-chapter": "Book Chapter",
    "book": "Book",
    "book-section": "Book Chapter",
    "monograph": "Book",
    "reference-book": "Book",
    "dissertation": "Dissertation/Thesis",
    "report": "Other",
    "posted-content": "Other",
}


# ==================== PDF hint extraction ====================

def _clean_doi(doi: str) -> str:
    """Trim trailing punctuation/brackets that regularly attach to DOIs in PDF text."""
    doi = doi.strip().rstrip(").,;]>'\"")
    # Drop accidental trailing tokens like '/abstract' separators only if obviously junk
    return doi


def extract_pdf_hints(pdf_bytes: bytes) -> Dict[str, Optional[str]]:
    """
    Extract DOI / title / first-author hints from a PDF using embedded metadata and
    first-page text heuristics. Returns a dict with keys: doi, title, author.
    """
    hints: Dict[str, Optional[str]] = {"doi": None, "title": None, "author": None, "arxiv_id": None}
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.warning("PyMuPDF (fitz) not installed; cannot extract PDF hints")
        return hints

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:
        logger.warning("Could not open PDF for hint extraction: %s", e)
        return hints

    try:
        # Embedded document metadata (often unreliable but a cheap first guess)
        meta = doc.metadata or {}
        meta_title = (meta.get("title") or "").strip()
        meta_author = (meta.get("author") or "").strip()
        if meta_author:
            hints["author"] = meta_author.split(",")[0].split(";")[0].strip()

        # First two pages of text for DOI + title heuristics
        first_text_parts = []
        for i in range(min(2, len(doc))):
            first_text_parts.append(doc.load_page(i).get_text())
        first_text = "\n".join(first_text_parts)

        # DOI: prefer an explicit "doi:" / "https://doi.org/" occurrence, else first match
        doi_match = re.search(r"doi[:\s/]*?(10\.\d{4,9}/[-._;()/:A-Za-z0-9]+)", first_text, re.IGNORECASE)
        if not doi_match:
            doi_match = _DOI_RE.search(first_text)
        if doi_match:
            hints["doi"] = _clean_doi(doi_match.group(1) if doi_match.lastindex else doi_match.group(0))

        # arXiv ID: the canonical signal for preprints (which usually carry no DOI).
        arxiv_match = _ARXIV_ID_RE.search(first_text)
        if arxiv_match:
            hints["arxiv_id"] = arxiv_match.group("id")

        # Title: trust a sensible embedded metadata title, otherwise heuristically pick the
        # most title-like line near the top of page 1 (largest font block).
        title_guess = meta_title if _looks_like_title(meta_title) else None
        if not title_guess:
            title_guess = _guess_title_from_first_page(doc)
        if title_guess:
            hints["title"] = title_guess
    except Exception as e:
        logger.warning("PDF hint extraction error: %s", e)
    finally:
        doc.close()

    return hints


def _looks_like_title(text: str) -> bool:
    """Heuristic: a plausible title is 15-300 chars, has spaces, isn't a URL/DOI/filename."""
    if not text:
        return False
    t = text.strip()
    if len(t) < 15 or len(t) > 300:
        return False
    if " " not in t:
        return False
    low = t.lower()
    if low.startswith(("http", "www.", "doi:", "arxiv")) or low.endswith((".pdf", ".doc", ".docx")):
        return False
    if "untitled" in low or "microsoft word" in low:
        return False
    # arXiv side-margin stamp ("arXiv:1503.02531v1 [stat.ML] 9 Mar 2015") is not a title.
    if _ARXIV_ID_RE.search(t):
        return False
    return True


def _guess_title_from_first_page(doc) -> Optional[str]:
    """
    Pick the title by scanning the first page's text spans for the largest font size that
    forms a plausible title line near the top of the page.
    """
    try:
        page = doc.load_page(0)
        data = page.get_text("dict")
    except Exception:
        return None

    candidates: List[Tuple[float, float, str]] = []  # (font_size, y_top, text)
    for block in data.get("blocks", []):
        for line in block.get("lines", []):
            spans = line.get("spans", [])
            if not spans:
                continue
            line_text = "".join(s.get("text", "") for s in spans).strip()
            if not line_text:
                continue
            max_size = max((s.get("size", 0.0) for s in spans), default=0.0)
            y_top = line.get("bbox", [0, 0, 0, 0])[1]
            candidates.append((max_size, y_top, line_text))

    if not candidates:
        return None

    # Consider only lines in the top ~45% of the page; pick the largest-font plausible line.
    page_height = getattr(doc.load_page(0).rect, "height", 800) or 800
    top_candidates = [c for c in candidates if c[1] <= page_height * 0.45] or candidates
    top_candidates.sort(key=lambda c: (-c[0], c[1]))
    for _size, _y, text in top_candidates:
        if _looks_like_title(text):
            return text
    return None


# ==================== Abstract / keywords from PDF text ====================

# Markers that end the abstract block (start of the next section).
_ABSTRACT_STOP_PATTERNS = [
    r"key\s*words?",
    r"index\s*terms",
    r"关\s*键\s*词",
    r"\n\s*1[\.\s]+introduction",
    r"\n\s*i[\.\s]+introduction",
    r"\n\s*introduction\s*\n",
    r"中图分类号",
    r"ccs\s+concepts",
    r"\bJEL\b",
    r"©",
]

_KEYWORDS_STOP_PATTERNS = [
    r"\n\s*\n",
    r"1[\.\s]+introduction",
    r"\n\s*introduction",
    r"中图分类号",
    r"\babstract\b",
    r"©",
]


def _extract_abstract_from_text(text: str) -> Optional[str]:
    """Heuristically pull the abstract paragraph out of a paper's extracted text."""
    if not text:
        return None
    head = text[:9000]
    m = re.search(r"(?im)^\s*(abstract|摘\s*要)\s*[:：.\-—]?\s*", head)
    if not m:
        return None
    rest = head[m.end(): m.end() + 5000]
    stop = len(rest)
    for pat in _ABSTRACT_STOP_PATTERNS:
        sm = re.search(pat, rest, re.IGNORECASE)
        if sm and sm.start() < stop:
            stop = sm.start()
    abstract = re.sub(r"\s+", " ", rest[:stop]).strip()
    # Reject too-short captures (likely a false "Abstract" hit) or page-noise.
    if len(abstract) < 40:
        return None
    return abstract


def _extract_keywords_from_text(text: str) -> List[str]:
    """Heuristically pull a keyword list out of a paper's extracted text."""
    if not text:
        return []
    head = text[:12000]
    m = re.search(r"(?im)(key\s*words?|index\s*terms|关\s*键\s*词)\s*[:：.\-—]?\s*", head)
    if not m:
        return []
    rest = head[m.end(): m.end() + 600]
    stop = len(rest)
    for pat in _KEYWORDS_STOP_PATTERNS:
        sm = re.search(pat, rest, re.IGNORECASE)
        if sm and sm.start() < stop:
            stop = sm.start()
    block = re.sub(r"\s+", " ", rest[:stop]).strip()
    if not block:
        return []
    parts = re.split(r"[;,，、·|]\s*", block)
    keywords: List[str] = []
    for p in parts:
        kw = p.strip(" .;:")
        if kw and 1 <= len(kw) <= 60 and kw.lower() not in {k.lower() for k in keywords}:
            keywords.append(kw)
    return keywords[:20]


def extract_abstract_keywords_from_pdf(pdf_bytes: bytes) -> Tuple[Optional[str], List[str]]:
    """Extract (abstract, keywords) directly from a PDF's first pages. Best-effort."""
    text = extract_text_from_pdf_bytes(pdf_bytes, max_pages=3)
    if not text:
        return None, []
    return _extract_abstract_from_text(text), _extract_keywords_from_text(text)


# ==================== Crossref queries ====================

def _strip_jats(abstract: Optional[str]) -> Optional[str]:
    """Crossref abstracts are JATS XML; strip tags and unescape entities to plain text."""
    if not abstract:
        return None
    text = re.sub(r"<[^>]+>", " ", abstract)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    # Drop a leading bare "Abstract" label if present
    text = re.sub(r"^abstract[:.\s]+", "", text, flags=re.IGNORECASE)
    return text or None


def _request_crossref(url: str, params: Optional[Dict[str, Any]] = None) -> Optional[Dict[str, Any]]:
    try:
        import httpx
        resp = httpx.get(
            url,
            params=params,
            headers={"User-Agent": _USER_AGENT},
            timeout=_HTTP_TIMEOUT,
            follow_redirects=True,
        )
        if resp.status_code != 200:
            logger.info("Crossref returned %s for %s", resp.status_code, url)
            return None
        return resp.json()
    except Exception as e:
        logger.warning("Crossref request failed (%s): %s", url, e)
        return None


def lookup_by_doi(doi: str) -> Optional[Dict[str, Any]]:
    """Resolve a single DOI to its Crossref work item."""
    if not doi:
        return None
    data = _request_crossref(f"{CROSSREF_BASE}/{doi.strip()}")
    if data and data.get("status") == "ok":
        return data.get("message")
    return None


def search_by_title(title: str, author: Optional[str] = None, rows: int = 5) -> Optional[Dict[str, Any]]:
    """
    Search Crossref by bibliographic title (+ optional author) and return the best-matching
    work item, judged by title similarity. Returns None if no reasonable match is found.
    """
    if not title:
        return None
    params: Dict[str, Any] = {"query.bibliographic": title, "rows": rows}
    if author:
        params["query.author"] = author
    data = _request_crossref(CROSSREF_BASE, params=params)
    if not data or data.get("status") != "ok":
        return None
    items = (data.get("message") or {}).get("items") or []
    if not items:
        return None

    target = _norm(title)
    best_item = None
    best_score = 0.0
    for item in items:
        cand_titles = item.get("title") or []
        cand = _norm(cand_titles[0]) if cand_titles else ""
        score = SequenceMatcher(None, target, cand).ratio() if cand else 0.0
        if score > best_score:
            best_score = score
            best_item = item

    # Only accept a confident title match. Returning Crossref's top relevance hit on a weak
    # match (e.g. when the "title" was actually an arXiv stamp or page noise) attaches a wrong
    # paper's DOI/abstract/authors — better to return nothing and fall back to PDF-derived data.
    if best_item and best_score >= 0.6:
        return best_item
    return None


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", (text or "").lower()).strip()


# ==================== arXiv lookup ====================

def lookup_arxiv(arxiv_id: str) -> Optional[Dict[str, Any]]:
    """Resolve an arXiv ID to mapped entry fields via the public arXiv Atom API.

    Returns an already-mapped fields dict (same shape as crossref_to_entry_fields output)
    or None on any failure. arXiv preprints rarely carry a DOI, so this is the reliable
    metadata path for them.
    """
    if not arxiv_id:
        return None
    try:
        import httpx
        resp = httpx.get(
            ARXIV_API,
            params={"id_list": arxiv_id, "max_results": 1},
            headers={"User-Agent": _USER_AGENT},
            timeout=_HTTP_TIMEOUT,
            follow_redirects=True,
        )
        if resp.status_code != 200:
            logger.info("arXiv API returned %s for %s", resp.status_code, arxiv_id)
            return None
        return _parse_arxiv_atom(resp.text, arxiv_id)
    except Exception as e:
        logger.warning("arXiv request failed (%s): %s", arxiv_id, e)
        return None


def _parse_arxiv_atom(xml_text: str, arxiv_id: str) -> Optional[Dict[str, Any]]:
    """Parse an arXiv Atom <entry> into entry fields. Returns None if no titled entry."""
    import xml.etree.ElementTree as ET
    ns = {"a": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}
    try:
        root = ET.fromstring(xml_text)
    except Exception as e:
        logger.warning("arXiv XML parse failed: %s", e)
        return None
    entry = root.find("a:entry", ns)
    if entry is None:
        return None

    title_el = entry.find("a:title", ns)
    title = re.sub(r"\s+", " ", (title_el.text or "").strip()) if title_el is not None else ""
    if not title:
        return None  # A bad id_list query returns an entry with no real title.

    summary_el = entry.find("a:summary", ns)
    abstract = re.sub(r"\s+", " ", (summary_el.text or "").strip()) if summary_el is not None and summary_el.text else None

    authors: List[str] = []
    for a in entry.findall("a:author", ns):
        n = a.find("a:name", ns)
        full = (n.text or "").strip() if n is not None else ""
        if not full:
            continue
        # arXiv gives "First [Middle] Last"; reformat to "Last, First …" like other entries.
        parts = full.split()
        authors.append(f"{parts[-1]}, {' '.join(parts[:-1])}" if len(parts) >= 2 else full)

    year: Optional[int] = None
    pub = entry.find("a:published", ns)
    if pub is not None and pub.text:
        ym = re.match(r"(\d{4})", pub.text.strip())
        if ym:
            year = int(ym.group(1))

    categories = [c.get("term") for c in entry.findall("a:category", ns) if c.get("term")]
    doi_el = entry.find("arxiv:doi", ns)
    doi = (doi_el.text.strip() if doi_el is not None and doi_el.text else None)

    return {
        "title": title,
        "authors": authors,
        "institutions": [],
        "countries": [],
        "journal": "arXiv preprint",
        "year": year,
        "volume": None,
        "issue": None,
        "pages": None,
        "doi": doi,
        "keywords": [c for c in categories if c],
        "abstract": abstract,
        "doc_type": "Preprint",
        "citation_count": 0,
        "url": f"https://arxiv.org/abs/{arxiv_id}",
        "publisher": "arXiv",
    }


# ==================== Mapping ====================

def _extract_year(item: Dict[str, Any]) -> Optional[int]:
    for key in ("published-print", "published-online", "issued", "created"):
        node = item.get(key) or {}
        parts = node.get("date-parts") or []
        if parts and parts[0] and isinstance(parts[0][0], int):
            return parts[0][0]
    return None


def _extract_authors(item: Dict[str, Any]) -> Tuple[List[str], List[str]]:
    """Return (authors, institutions) from a Crossref author list."""
    authors: List[str] = []
    institutions: List[str] = []
    for a in item.get("author") or []:
        given = (a.get("given") or "").strip()
        family = (a.get("family") or "").strip()
        name = (f"{family}, {given}".strip(", ") if (given or family) else (a.get("name") or "")).strip()
        if name:
            authors.append(name)
        for aff in a.get("affiliation") or []:
            aff_name = (aff.get("name") or "").strip()
            if aff_name and aff_name not in institutions:
                institutions.append(aff_name)
    return authors, institutions


def crossref_to_entry_fields(item: Dict[str, Any]) -> Dict[str, Any]:
    """Map a Crossref work item to biblio-entry field values (no id/library_id)."""
    titles = item.get("title") or []
    containers = item.get("container-title") or []
    authors, institutions = _extract_authors(item)
    cr_type = (item.get("type") or "").lower()

    fields: Dict[str, Any] = {
        "title": (titles[0].strip() if titles else "") or "Untitled",
        "authors": authors,
        "institutions": institutions,
        "countries": [],
        "journal": (containers[0].strip() if containers else None),
        "year": _extract_year(item),
        "volume": item.get("volume"),
        "issue": item.get("issue"),
        "pages": item.get("page"),
        "doi": (item.get("DOI") or "").strip() or None,
        "keywords": [s.strip() for s in (item.get("subject") or []) if s and s.strip()],
        "abstract": _strip_jats(item.get("abstract")),
        "doc_type": _CROSSREF_TYPE_MAP.get(cr_type, "Other"),
        "citation_count": int(item.get("is-referenced-by-count") or 0),
        # source_url intentionally omitted so paper-PDF entries match WOS entries (which
        # leave it empty); the canonical URL is retained in raw_data for traceability.
        "url": item.get("URL"),
        "publisher": item.get("publisher"),
    }
    return fields


# ==================== Top-level builder ====================

def build_entry_from_pdf(
    pdf_bytes: bytes,
    library_id: str,
    fallback_title: str = "",
) -> Dict[str, Any]:
    """
    Build a biblio-entry dict from a paper PDF, enriched via Crossref where possible.

    Always returns a valid entry dict (with a generated id). The 'raw_data' key records
    how the metadata was resolved (matched_via, crossref_score absent here for brevity).
    """
    hints = extract_pdf_hints(pdf_bytes)
    matched_via = "none"
    item: Optional[Dict[str, Any]] = None
    arxiv_fields: Optional[Dict[str, Any]] = None

    # 1) DOI is the most reliable signal
    if hints.get("doi"):
        item = lookup_by_doi(hints["doi"])
        if item:
            matched_via = "doi"

    # 2) arXiv ID — the canonical signal for preprints (resolved via the arXiv API)
    if item is None and hints.get("arxiv_id"):
        arxiv_fields = lookup_arxiv(hints["arxiv_id"])
        if arxiv_fields:
            matched_via = "arxiv"

    # 3) Fall back to a title search (only accepts a confident match)
    if item is None and arxiv_fields is None and hints.get("title"):
        item = search_by_title(hints["title"], hints.get("author"))
        if item:
            matched_via = "title"

    if item is not None:
        fields = crossref_to_entry_fields(item)
    elif arxiv_fields is not None:
        fields = arxiv_fields
    else:
        # 3) Pure PDF-derived minimal entry
        fields = {
            "title": hints.get("title") or fallback_title or "Untitled (PDF import)",
            "authors": [hints["author"]] if hints.get("author") else [],
            "institutions": [],
            "countries": [],
            "journal": None,
            "year": None,
            "volume": None,
            "issue": None,
            "pages": None,
            "doi": hints.get("doi"),
            "keywords": [],
            "abstract": None,
            "doc_type": "Other",
            "citation_count": 0,
            "url": None,
            "publisher": None,
        }

    # Abstract / keywords fallback from the PDF itself. Crossref often lacks an abstract
    # (publishers don't always deposit one), so extract from the PDF when missing — this is
    # what lets every imported paper feed its abstract into the annotation pipeline.
    abstract_source = "crossref" if fields.get("abstract") else None
    keywords_source = "crossref" if fields.get("keywords") else None
    if not fields.get("abstract") or not fields.get("keywords"):
        pdf_abstract, pdf_keywords = extract_abstract_keywords_from_pdf(pdf_bytes)
        if not fields.get("abstract") and pdf_abstract:
            fields["abstract"] = pdf_abstract
            abstract_source = "pdf"
        if not fields.get("keywords") and pdf_keywords:
            fields["keywords"] = pdf_keywords
            keywords_source = "pdf"

    raw_data = {
        "import_source": "paper_pdf",
        "matched_via": matched_via,
        "abstract_source": abstract_source,
        "keywords_source": keywords_source,
        "pdf_hints": hints,
    }
    # Keep publisher / canonical URL only in raw_data (not as entry columns) so paper-PDF
    # entries expose the same visible fields as WOS/CNKI entries.
    publisher = fields.pop("publisher", None)
    if publisher:
        raw_data["publisher"] = publisher
    url = fields.pop("url", None)
    if url:
        raw_data["url"] = url

    entry: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "library_id": library_id,
        "raw_data": raw_data,
        "relevance": 0,
        "tags": [],
        "notes": None,
        "unique_id": (f"DOI:{fields['doi']}" if fields.get("doi") else None),
    }
    entry.update(fields)
    return entry
