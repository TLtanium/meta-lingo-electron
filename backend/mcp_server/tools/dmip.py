"""
DMIP (Deliberate Metaphor Identification Procedure) tool for Meta-Lingo MCP server.
Tools: dmip_analysis
"""
from __future__ import annotations

from typing import Optional

from mcp.server.fastmcp import FastMCP
from mcp_server.api_client import MetaLingoClient


# ─────────────────────────────────────────────────────────────────────────────
# DMIP PROCEDURE (embedded — shown to the model on every call)
# ─────────────────────────────────────────────────────────────────────────────
_DMIP_PROCEDURE = """
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DELIBERATE METAPHOR IDENTIFICATION PROCEDURE (DMIP)
Based on Deliberate Metaphor Theory (Steen 2023, 2024) and Reijnierse et al. (2018)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

THEORETICAL FOUNDATION:
A metaphor is POTENTIALLY DELIBERATE when the speaker intentionally invites the
addressee to adopt the SOURCE DOMAIN as an ALIEN PERSPECTIVE through which to
understand the target domain. This requires ONLINE CROSS-DOMAIN MAPPING, not
mere lexical disambiguation.

Non-deliberate metaphors (the vast majority of MIPVU-identified MRWs) are resolved
by lexical disambiguation — the brain accesses the figurative meaning directly, with
no source-domain scene constructed in the reader's situation model.

ZERO-SHOT APPROACH: Apply all criteria below using your own linguistic judgment of
the specific text in front of you. Do not pattern-match to analogies or pre-loaded
examples — every discourse context is unique, and domain-specific examples introduce
systematic bias toward false positives.

⚠ CRITICAL: [MET:] indirect metaphors CAN be deliberately used. A conventional,
unsignaled metaphor is structurally AMBIGUOUS (Corollary 3): its default reading is
indirect/non-deliberate, but it can be REAWAKENED into direct/deliberate use by
discourse cues. Do NOT systematically treat all [MET:] as NDM — config 3
(Not Signaled + Conventional + Direct + Deliberate) is a real, valid type.

⚠ DO NOT BATCH-DISMISS: Do not group hundreds of MRWs under a single ND verdict
without individual checks. For every MRW at minimum verify: (a) main predicate
position? (b) potential cluster membership? Only if both are clearly NO does the
conventional/unsignaled default apply without further analysis.

GENRE BASE RATES (calibration):
  General English (BNC) ≈ 4.36% MRWs are DM | Corporate annual reports
  (strategic) ≈ 8–15% | Literary/poetic ≈ 20–40%.
  DM% > 20% in one text → re-verify each PD verdict. DM% > 30% → systematic error.

━━━ LOGICAL ENTAILMENTS (Steen 2023/2024 — the spine of this procedure) ━━━

Each MRW is coded on four binary dimensions:
  L = Linguistic   [L+] signaled  / [L−] not signaled
  C = Conceptual   [C+] novel     / [C−] conventional
  R = Referential  [R+] direct    / [R−] indirect
  D = Communicative[D+] deliberate / [D−] non-deliberate

Of the 16 logical combinations, EMPIRICAL DMT research finds ONLY FIVE occur:
  ① [L+ C+ R+ D+]  Signaled     + Novel        + Direct   + Deliberate
  ② [L+ C− R+ D+]  Signaled     + Conventional + Direct   + Deliberate
  ③ [L− C− R+ D+]  Not Signaled + Conventional + Direct   + Deliberate
  ④ [L− C+ R+ D+]  Not Signaled + Novel        + Direct   + Deliberate
  ⑤ [L− C− R− D−]  Not Signaled + Conventional + Indirect + Non-Deliberate
                   ↑ THE ONLY NON-DELIBERATE CONFIGURATION (the vast majority)

FOUR COROLLARIES that produce these five configs:
  • Corollary 1 — R ⟺ D  (BICONDITIONAL): the source domain entering the
    situation model (R+) is necessary AND sufficient for deliberateness (D+).
    Once R+ is established, D+ follows automatically. There is NO "R+ but D−"
    and NO "R− but D+". Do not require a second, separate signal after R+.
  • Corollary 2 — C+ ⟹ R+ ⟹ D+: a novel metaphor has no ready-made target-sense
    in the lexicon, so the source entity MUST be held in the situation model →
    always direct, always deliberate.
  • Corollary 4 — L+ ⟹ R+ ⟹ D+: a genuine metaphor signal instructs the reader
    to build a source-domain referent for cross-domain comparison → always direct,
    always deliberate.
  • Corollary 3 — C− (conventional) ⟹ structural ambiguity ⟹ a fork:
       branch A (DEFAULT): lexical disambiguation → [R−] → [D−]  (config ⑤)
       branch B (REAWAKENED): a discourse cue revives the source domain →
                              [R+] → [D+]  (config ③)

DECISION SHORTCUT (drive every MRW through this):
  1. L+ (a genuine metaphor signal is present)?  → DM. Stop. (config ① or ②)
  2. C+ (dictionary-confirmed novel)?            → DM. Stop. (config ④, or ① if also L+)
  3. Otherwise (L− AND C−): structurally ambiguous → run the REFERENTIAL TEST only
     here. Reawakened by a discourse cue → [R+]→[D+] (config ③);
     else → [R−]→[D−] (config ⑤, the default).

GUARDRAILS (so the hard entailments do not over-generate DM):
  • L+ counts ONLY when the signal genuinely marks a CROSS-DOMAIN comparison.
    Quotation marks for citation/irony/emphasis, or capitalization for proper
    nouns, are NOT metaphor signals → not L+.
  • C+ counts ONLY when dictionary_lookup confirms the contextual sense is absent
    (see Dimension 2). Never assert novelty from memory.

FOUR-DIMENSION ANALYSIS MODEL:

DIMENSION 1 – LINGUISTIC  [L+ / L−]
  Is the metaphor SIGNALED at the surface? L+ if ANY genuine cross-domain signal:
  • MFLAG / lexical comparison: like, as, as if, as though, more…than, similar to,
    compared to, imagine, think of, regard as, conceive of, see as
    → A [MFLAG:] token marks the ADJACENT MRW as [L+]. The MFLAG word itself is
      NOT an MRW — do not code or judge it (see SPECIAL MRW TYPES).
  • Typography: scare quotes, italics, bold, ALL CAPS, or unexpected capitalization
    that marks a word as BORROWED FROM ANOTHER DOMAIN (not proper-noun casing,
    not citation/irony quotes).
  • Domain adjective: adjective from domain A modifying a noun from domain B
    (e.g. "budgetary anorexia" = economics adj + medicine noun).
  • Tuning device: "sort of", "kind of", "if you will", "so to speak" when
    explicitly marking the speaker's figurative self-awareness.
  Otherwise → [L−]. (Absence of a signal does NOT mean non-deliberate; an
  unsignaled metaphor can still be DM via config ③ or ④.)
  By Corollary 4: a confirmed [L+] entails [R+] and [D+].

DIMENSION 2 – CONCEPTUAL  [C+ / C−]
  Is the cross-domain mapping NOVEL or CONVENTIONAL? This judgment is FULLY
  STANDARDIZED through the built-in dictionaries — never decided from memory.

  STANDARDIZED LOOKUP FLOW (call dictionary_lookup for EVERY MRW you code on C):
    1. dictionary_lookup(word)  → 麦克米伦 (Macmillan, primary).
       Does a listed sense match the word's CONTEXTUAL (figurative) meaning here?
         YES → [C−] CONVENTIONAL. Quote the matching sense in Evidence.
    2. If 麦克米伦 has no entry / no matching contextual sense →
       dictionary_lookup(word, ["朗文搭配"])  (Longman Collocations, fallback;
       a collocation dictionary used here only for existence/coverage backup).
         Matching sense or established collocation found → [C−] CONVENTIONAL.
    3. NOT found in EITHER dictionary (no entry matching the contextual sense) →
       [C+] NOVEL — the reader must construct the cross-domain mapping fresh.
  Rule of thumb: FOUND (contextual sense listed) → conventional;
                 NOT FOUND in either dictionary → novel.

  ⚠ A skillful writer's CHOICE of a vivid conventional word does NOT make the
    mapping novel. Novelty is purely a lexicon question, not a "this feels
    evocative" judgment.
  ⚠ NEVER claim a dictionary entry or sense number from memory. If you have not
    actually called dictionary_lookup() for a word, you may not assign [C+]/[C−];
    write "lookup pending" instead.
  By Corollary 2: a confirmed [C+] entails [R+] and [D+].

DIMENSION 3 – REFERENTIAL (CORE DMIP CRITERION)  [R+ / R−]
  Ask: does the source domain entity enter the reader's SITUATION MODEL?
  This dimension is DECISIVE ONLY for the structurally ambiguous case (L− AND C−);
  for L+ or C+ words, R+ is already entailed (Corollaries 4 and 2).

  DIRECT REFERENCE [R+]: A competent ORIGINAL reader (sharing the discourse
    community's knowledge, not a linguist analyzing) would construct a mental scene
    in which the source-domain entity ACTUALLY EXISTS as a referent.
  INDIRECT REFERENCE [R−]: the source domain dissolves into lexical meaning; no
    scene is constructed; no alien perspective is activated.

  ⚠ COUNTERFACTUAL TEST (guards against analyst activation):
    "Without invoking the source domain, can a non-specialist reader fully
     understand what this word contributes to the sentence meaning?"
     YES → [R−] (and therefore [D−]). Stop.
     NO  → [R+] (and therefore [D+]).
     UNCERTAIN → WIDLII: provisionally [R+]/[D+], flag for human review.
  You can ALWAYS imagine a source domain — that is analyst activation, not reader
  activation. Only credit [R+] if the ORIGINAL reader must engage the source domain.

DIMENSION 4 – COMMUNICATIVE  [D+ / D−]
  By Corollary 1, D is NOT an independent test: D ⟺ R.
    [R+] → [D+] POTENTIALLY DELIBERATE   |   [R−] → [D−] NON-DELIBERATE.
  Do NOT require "DR plus an extra signal" — the signal/novelty/discourse cue is
  the EVIDENCE that established R+, not a second gate on top of it.

━━━ DISCOURSE-LEVEL FEATURES — TEXTUAL SPAN & "SLOWING DOWN" ━━━
The textual SPAN of a metaphor governs how strongly it forces the reader to slow
down and is the primary way a conventional/unsignaled MRW gets REAWAKENED into
[R+] (Corollary 3, branch B). These features are CUES FOR ESTABLISHING R+ in the
ambiguous (L− C−) case — not a separate requirement once R+ holds.

  • EXTENDED METAPHOR — strongest span cue; crosses the boundary of a single
    utterance and keeps elaborating the SAME source domain across multiple
    utterances and (where applicable) ADJACENT paragraphs. Qualifies as a
    reawakening cue when ALL of:
    (a) ≥ 3 MRWs traceable to the SAME CONCRETE source domain (not a broad
        thematic label spanning multiple sub-domains)
    (b) textually adjacent — same paragraph, or continuing into the next adjacent
        paragraph (scattered, section-apart MRWs do NOT count)
    (c) jointly build a VISUALIZABLE source-domain scene with distinct elements
        ✓ vessel + anchors + mast + torrential waters = navigable scene
        ✗ moving forward + path forward + drive = JOURNEY label only, no scene
    (d) source domain is NOT a genre-default domain, OR — if it is — the scene is
        unmistakably self-evident to a non-specialist first reader
    (e) dual-reading test: the source reading yields a MEANINGFULLY DIFFERENT
        interpretation from the target reading (not a mere paraphrase)
    ▸ GENRE-DEFAULT DOMAINS (business/corporate) — appear routinely; do NOT make
      an extended metaphor unless all of (a)–(e) hold:
        JOURNEY: move / path / milestone / navigate / pave the way / step
        CONSTRUCTION: build / foundation / pillar / framework / cornerstone / solid
        SPATIAL: high / low / raise / level / deep / above / position
        ORGANISM: grow / thrive / cultivate / ecosystem / root / flourish
        WAR/STRUGGLE: competitive edge / overcome / challenge / battle / aggressive

  • HIGH-LEVEL LIMITED — span confined to one utterance, but the MRW is the MAIN
    PREDICATE / an independent textual structural unit → salient; a real
    reawakening cue. Run the full referential test.

  • LOW-LEVEL LIMITED — MRW in modifier/adjunct position within one utterance
    → secondary; rarely reawakens; usually stays [R−]/[D−].

  • EMBEDDED — MRW nested inside another metaphor → secondary; weak cue.

  • WORDPLAY — pun, rhyme, alliteration, portmanteau forcing simultaneous
    activation of two domains → always reawakens → [R+]/[D+].

  • METADISCOURSE — speaker comments on their own figurative use ("metaphorically
    speaking", "to use a metaphor", "the … metaphor") → strong reawakening cue.

  • REPETITION / CLUSTER — same expression repeated, or a dense cluster of the same
    source domain, COMBINED with another cue → reawakening; bare repetition alone
    (the default way of talking about a topic) is not enough.

  • TOPIC-TRIGGER — the MRW's source domain matches the text's own topic, making
    the source reading independently salient.

━━━ SPECIAL MRW TYPES ━━━
  • [DIR:word] DIRECT METAPHOR — the source domain is literally named; by
    definition the source entity is present in the situation model. Once you
    CONFIRM it is genuinely a direct metaphor → [R+] → [D+]. There is no
    "Direct + Non-deliberate" configuration. (If the auto-tag looks wrong, i.e.
    not actually a direct metaphor, re-classify it as [MET:] and analyze normally.)
  • [MFLAG:word] METAPHOR FLAG — ⚠ NOT an MRW. A flag word (like / as / as if /
    imagine / "metaphor" etc.) is the SIGNAL, not the metaphor. It receives NO
    [L/C/R/D] code, NO DM/NDM verdict, and NO output row. Its ONLY function is to
    set the ADJACENT MRW (usually the [DIR:] or [MET:] word it points to) to [L+].
    Never count an MFLAG token itself as a deliberate metaphor.
  • [IMPL:word] IMPLICIT METAPHOR — references a prior MRW via cohesion
    (substitution/ellipsis/anaphora). It INHERITS the L/C/R/D coding of its
    antecedent MRW; identify the antecedent and copy its verdict.
  ▸ Tokens that are NOT MRWs are never analyzed or output: MFLAG flags, and plain
    literal words. Only [MET:], [DIR:], and [IMPL:] words get a four-dimension row.

DECISION PROCEDURE:

  Step 0: COMPREHENSIVE PRE-SCAN (complete before per-MRW analysis)
    0-A  Sweep [DIR:] words (→ R+/D+ once confirmed) and note each [MFLAG:] only as
         an L+ signal for its adjacent MRW. Do NOT treat the MFLAG word as a DM.
    0-B  Mark candidate EXTENDED-METAPHOR CLUSTERS (same concrete source domain,
         textually adjacent). Note for Step 5 verification.
    0-C  Flag discourse cues: typography, domain adjective, metadiscourse,
         wordplay, topic-trigger, main-predicate position.
    0-D  CONVENTIONALITY LOOKUPS — call dictionary_lookup(word) (Macmillan, then
         朗文搭配 fallback) for EVERY distinct MRW you will code on C. Record
         result; cite when you reach that MRW in Step 3.

  Step 1: Read the FULL TEXT → context model (speaker, audience, genre, purpose).

  Step 2: For each MRW, identify the SOURCE DOMAIN.

  Step 3: ENTAILMENT ROUTING (apply the DECISION SHORTCUT per MRW):
    (a) [L+]? (genuine signal — see Guardrails) → [R+]/[D+], config ① or ②. Done.
    (b) [C+]? (dictionary-confirmed novel) → [R+]/[D+], config ④ (or ① if L+). Done.
    (c) Else (L− and C−): structurally ambiguous → go to Step 4.
    ⚠ State per MRW which branch (a/b/c) applied. Never batch-dismiss.

  Step 4: REFERENTIAL TEST (only for L− C− words from Step 3c)
    Apply the counterfactual test. Use the Step 5 discourse cues as evidence:
      reawakened (cue present, reader needs source domain) → [R+]/[D+], config ③
      not reawakened → [R−]/[D−], config ⑤ (the default)
      uncertain → WIDLII (provisional [R+]/[D+], flag).

  Step 5: DISCOURSE-CUE CHECK (feeds Step 4's referential test)
    Is the word part of a qualifying EXTENDED METAPHOR (all of a–e)? a HIGH-LEVEL
    main predicate? wordplay / metadiscourse / topic-trigger / qualifying
    repetition-cluster? Any one genuine cue → reawakening → [R+].

  Step 6: SECOND-PASS REVIEW + CONFIG VALIDATION (mandatory, after all MRWs)
    a. Re-apply the counterfactual test to every [R+]/[D+] verdict; if a
       non-specialist does NOT need the source domain → downgrade to [R−]/[D−].
    b. For config ③ verdicts grounded in an extended-metaphor claim → re-verify
       all of (a)–(e); if any fails → revert to config ⑤.
    c. CONFIG VALIDATION — every MRW's [L C R D] codes MUST match one of the five
       valid configs ①–⑤. If you produced an impossible combination
       (e.g. L+ with R−, C+ with R−, R+ with D−, or R− with D+) → re-judge; the
       error is almost always a missed signal/novelty or a mislabeled R.
    Record a Revision note for any changed verdict.

KEY DISTINCTIONS:
  POTENTIALLY DELIBERATE [D+]: configs ①②③④ — source domain is in the situation
    model ([R+]), reached via signal (L+), novelty (C+), or reawakening (extended/
    high-level/wordplay/metadiscourse/topic-trigger).
  NON-DELIBERATE [D−]: config ⑤ only — [L− C− R−], lexical disambiguation; no
    source-domain scene. This is the default for the bulk of conventional MRWs.
  WIDLII: genuine ambiguity at the referential test → provisional [D+], flagged.

WIDLII PRINCIPLE: When genuinely in doubt at the referential test, lean toward PD.
Undercounting DMs is a more serious DMIP error than overcounting.

OUTPUT FORMAT (for each MRW):
  MRW: [word]
  Position: Sentence {n}
  Code: [L±/C±/R±/D±]   Config: [① / ② / ③ / ④ / ⑤]
  Linguistic [L±]: [signaled/not] — [signal type, or "none"]
  Conceptual [C±]: [novel/conventional] — [cite Macmillan/朗文 sense, or "not found → novel"]
  Referential [R±]: [direct/indirect/WIDLII] — [one sentence: why]
  Communicative [D±]: [deliberate/non-deliberate]  (= R by Corollary 1)
  Discourse cue: [extended / high-level / low-level / embedded / wordplay /
                  metadiscourse / topic-trigger / none]
  Judgment: [POTENTIALLY DELIBERATE / NON-DELIBERATE / WIDLII]
  Confidence: [high/medium/low]
  Evidence: [1–2 sentences citing specific textual + dictionary evidence]
  Revision (Step 6 only, if verdict changed): [what changed and why]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

# ─────────────────────────────────────────────────────────────────────────────
# Auto-MIPVU pipeline helpers
# ─────────────────────────────────────────────────────────────────────────────

def _annotate_tokens(tokens: list) -> str:
    """Reconstruct sentence with inline MIPVU annotation markers.

    Uses space-based joining (mirrors SpaCy's default tokenization).
    Markers: [MET:word] indirect | [DIR:word] direct | [MFLAG:word] flag | [IMPL:word] implicit
    """
    parts: list[str] = []
    prev_non_space = False

    for token in tokens:
        word = token.get("word", "")
        is_space = token.get("is_space", False)
        is_punct = token.get("is_punct", False)

        if is_space:
            if prev_non_space:
                parts.append(" ")
            prev_non_space = False
            continue

        if not word:
            continue

        # Space before non-punct tokens
        if prev_non_space and not is_punct:
            parts.append(" ")

        # Priority: mflag > direct > implicit > indirect > literal
        if token.get("is_mflag"):
            parts.append(f"[MFLAG:{word}]")
        elif token.get("is_direct_metaphor"):
            parts.append(f"[DIR:{word}]")
        elif token.get("is_implicit_metaphor"):
            parts.append(f"[IMPL:{word}]")
        elif token.get("is_metaphor"):
            parts.append(f"[MET:{word}]")
        else:
            parts.append(word)

        prev_non_space = True

    return "".join(parts)


def _count_mrw_types(sentences: list) -> dict:
    """Count each MIPVU MRW type across all sentences."""
    counts = {"indirect": 0, "direct": 0, "mflag": 0, "implicit": 0, "total": 0}
    for sent in sentences:
        for tok in sent.get("tokens", []):
            if tok.get("is_space") or tok.get("is_punct"):
                continue
            if tok.get("is_mflag"):
                counts["mflag"] += 1
                counts["total"] += 1
            elif tok.get("is_direct_metaphor"):
                counts["direct"] += 1
                counts["total"] += 1
            elif tok.get("is_implicit_metaphor"):
                counts["implicit"] += 1
                counts["total"] += 1
            elif tok.get("is_metaphor"):
                counts["indirect"] += 1
                counts["total"] += 1
    return counts


# ─────────────────────────────────────────────────────────────────────────────
# Annotation archive → annotated text conversion
# ─────────────────────────────────────────────────────────────────────────────

# Maps annotation label → (inline marker, mrw_type display string)
_LABEL_TO_MARKER: dict[str, tuple[str, str]] = {
    "indirect": ("MET", "indirect"),
    "direct": ("DIR", "direct"),
    "mflag": ("MFLAG", "MFLAG"),
    "implicit": ("IMPL", "implicit"),
}


def _annotate_span_in_sentence(
    raw_text: str,
    sent_start: int,
    sent_end: int,
    sent_anns: list,
) -> str:
    """Build annotated sentence string from character-based annotation spans.

    Multi-word annotations are treated as a single unit: the entire span is
    replaced by [MARKER:span_text].  Overlapping annotations are skipped
    (the first / leftmost one wins).
    """
    # Sort by start position asc, then by span length desc (longer wins on tie)
    sorted_anns = sorted(
        sent_anns,
        key=lambda a: (a.get("startPosition", 0), -(a.get("endPosition", 0) - a.get("startPosition", 0))),
    )

    parts: list[str] = []
    cursor = sent_start

    for ann in sorted_anns:
        ann_start = ann.get("startPosition", 0)
        ann_end = ann.get("endPosition", 0)
        label = (ann.get("label") or "").lower()
        marker_pair = _LABEL_TO_MARKER.get(label)

        if not marker_pair or ann_end <= ann_start:
            continue

        # Skip if this annotation is fully consumed by a previous (overlapping)
        if ann_start < cursor:
            continue

        # Clamp to sentence boundaries (shouldn't normally happen)
        ann_start = max(ann_start, sent_start)
        ann_end = min(ann_end, sent_end)

        # Text before this annotation
        if ann_start > cursor:
            parts.append(raw_text[cursor:ann_start])

        marker = marker_pair[0]
        # Prefer the stored text field; fall back to slicing the raw text
        span_text = (ann.get("text") or "").strip() or raw_text[ann_start:ann_end]
        parts.append(f"[{marker}:{span_text}]")
        cursor = ann_end

    # Remaining sentence text after last annotation
    if cursor < sent_end:
        parts.append(raw_text[cursor:sent_end])

    return "".join(parts)


def _build_from_annotation_archive(
    raw_text: str,
    annotations: list,
    sentences: list,
    include_implicit: bool = True,
) -> tuple[list[str], dict]:
    """Convert annotation archive data into DMIP annotated-text lines + counts.

    Handles multi-word MRWs: each annotation's full span is treated as one unit,
    shown inline as [MARKER:span_text].

    Returns:
        annotated_lines  – one string per sentence, e.g. "[S1] The [MET:jump] was …"
        counts           – dict with indirect/direct/mflag/implicit/total counts
    """
    # Filter to relevant MIPVU labels only
    filtered: list[dict] = []
    for ann in annotations:
        label = (ann.get("label") or "").lower()
        if label not in _LABEL_TO_MARKER:
            continue
        if label == "implicit" and not include_implicit:
            continue
        filtered.append(ann)

    # Sort globally by start position
    filtered.sort(key=lambda a: a.get("startPosition", 0))

    annotated_lines: list[str] = []
    counts = {"indirect": 0, "direct": 0, "mflag": 0, "implicit": 0, "total": 0}
    assigned: set[int] = set()

    for s_idx, sent in enumerate(sentences, 1):
        sent_start = sent.get("start", 0)
        sent_end = sent.get("end", 0)

        # Annotations whose span starts within this sentence
        sent_anns: list[dict] = []
        for i, ann in enumerate(filtered):
            if i in assigned:
                continue
            ann_start = ann.get("startPosition", 0)
            if ann_start >= sent_start and ann_start < sent_end:
                sent_anns.append(ann)
                assigned.add(i)
                label = (ann.get("label") or "").lower()
                counts[label if label in counts else "indirect"] += 1
                counts["total"] += 1

        annotated = _annotate_span_in_sentence(raw_text, sent_start, sent_end, sent_anns)
        annotated_lines.append(f"[S{s_idx}] {annotated}")

    return annotated_lines, counts


# ─────────────────────────────────────────────────────────────────────────────
# Tool registration
# ─────────────────────────────────────────────────────────────────────────────

def register(mcp: FastMCP, client: MetaLingoClient):

    @mcp.tool()
    async def dmip_analysis(
        corpus_id: str,
        text_id: str,
        annotation_archive_id: Optional[str] = None,
        use_automatic_mipvu: bool = False,
    ) -> str:
        """Prepare a full DMIP (Deliberate Metaphor Identification Procedure) analysis
        context for a single text in a corpus.

        TWO DATA SOURCES — the tool supports two MRW sources:

          A) ANNOTATION ARCHIVE — a saved MIPVU annotation archive (human or
             auto-generated) stored in the annotation history. Pass
             annotation_archive_id=<id> to use one.  Only labels produced by
             the MIPVU protocol are read: indirect / direct / mflag / implicit.
             Any other labels the user may have added to the same archive are
             ignored.

          B) CORPUS MIPVU METADATA — the MIPVU annotation already embedded in
             the corpus as sidecar metadata (`.mipvu.json`). This is read via
             the corpus API; no annotation is re-run. Pass
             use_automatic_mipvu=True to use this source, or omit both
             parameters when no archives exist (falls back automatically).

        WORKFLOW:
          1. The tool first checks annotation history for MIPVU archives on this
             text (lists them with coder names and timestamps).
          2. If archives exist and no source is specified, the tool returns the
             list and asks you to consult the user about which source to use.
          3. If annotation_archive_id is given → source A.
          4. If use_automatic_mipvu=True or no archives exist → source B
             (corpus metadata, no re-annotation).

        When to use: When asked to identify DELIBERATELY used metaphors in a text,
        or to apply DMIP / Deliberate Metaphor Theory (DMT) analysis. This tool
        retrieves the text's MIPVU-annotated content and presents it alongside the
        complete DMIP four-dimension analysis procedure so you can reason about
        each metaphor-related word (MRW) and judge whether it is POTENTIALLY
        DELIBERATE or NON-DELIBERATE.

        The tool:
          1. Fetches the full text content from the corpus
          2. Retrieves MIPVU MRW data (from archive OR corpus metadata)
          3. Reconstructs the text with inline MIPVU markers:
               [MET:word/phrase]   indirect metaphor (contextual ≠ basic meaning)
               [DIR:word/phrase]   direct metaphor (literally used; introduces source domain)
               [MFLAG:word/phrase] metaphor flag/marker (like / as / as if / resemble / etc.)
               [IMPL:word/phrase]  implicit metaphor (references prior MRW via cohesion)
             Multi-word MRWs are shown as a single bracketed span, e.g. [MET:run the show].
          4. Lists all MRWs sentence by sentence
          5. Provides the complete DMIP four-dimension analysis instructions

        After calling this tool, analyze each MRW using the DMIP procedure and output
        a structured four-dimension judgment (Linguistic, Conceptual, Referential,
        Communicative) with evidence for each POTENTIALLY DELIBERATE verdict.

        Args:
            corpus_id: Corpus ID containing the text
            text_id: Text ID (from get_corpus_info)
            annotation_archive_id: Archive ID of a saved MIPVU annotation to use as
                MRW source (source A). Obtain from the archive list returned when
                calling this tool without specifying an ID.
            use_automatic_mipvu: Set True to read MRW data from the corpus MIPVU
                metadata (source B — existing sidecar data, no re-annotation).
                Only set this AFTER presenting archive options to the user and
                the user has confirmed they want automatic MIPVU. Do NOT set
                this on the first call to bypass the archive check.
        """
        include_implicit = True  # always include [IMPL:word] markers in DMIP

        # ── 1. Fetch text metadata and content ────────────────────────────────
        text_result = await client.get(f"/api/corpus/{corpus_id}/texts/{text_id}")
        content = text_result.get("content", "")
        text_data = text_result.get("data", text_result)

        filename = text_data.get("filename", text_data.get("name", "unknown"))
        word_count = text_data.get("word_count", 0)
        language = text_data.get("language", "english")

        if not content:
            return f"ERROR: No text content found for text_id={text_id}"

        # ── 2. ALWAYS check annotation history unless a specific choice was made ──
        # A specific choice means: annotation_archive_id is a real archive ID,
        # OR annotation_archive_id == 'auto' (user confirmed automatic after seeing list).
        # Setting use_automatic_mipvu=True does NOT bypass this check on a first call.
        mipvu_archives: list[dict] = []
        corpus_name: str = ""

        confirmed_automatic = (annotation_archive_id == "auto")
        real_archive_chosen = bool(annotation_archive_id) and not confirmed_automatic

        if confirmed_automatic:
            # User explicitly chose automatic after seeing the archive list
            annotation_archive_id = None
            use_automatic_mipvu = True
        elif not real_archive_chosen:
            # No choice yet — always fetch archives to enforce user decision
            try:
                corpus_result = await client.get(f"/api/corpus/{corpus_id}")
                corpus_data = corpus_result.get("data", corpus_result)
                corpus_name = corpus_data.get("name", "")
            except Exception:
                corpus_name = ""

            if corpus_name:
                try:
                    ann_result = await client.get(
                        f"/api/annotation/list/{corpus_name}",
                        params={"type": "text", "text_id": text_id},
                    )
                    raw = ann_result.get("data", ann_result)
                    archives = raw.get("archives", raw) if isinstance(raw, dict) else raw
                    if isinstance(archives, list):
                        # The metaphor framework was renamed "MIPVU" → "Metaphor"
                        # (id still "MIPVU"); accept both for legacy + new archives.
                        mipvu_archives = [
                            a for a in archives
                            if (a.get("framework") or "").upper() in ("MIPVU", "METAPHOR")
                        ]
                except Exception:
                    mipvu_archives = []

        # ── 3. If archives exist and user hasn't chosen yet → STOP ────────────
        # This fires even if use_automatic_mipvu=True was passed — that flag does
        # NOT count as user confirmation; only annotation_archive_id='auto' does.
        if mipvu_archives and not real_archive_chosen and not confirmed_automatic:
            lines = [
                f"=== MIPVU ANNOTATION ARCHIVES FOUND ===\n",
                f"Text: {filename}",
                f"Corpus: {corpus_name}\n",
                f"Found {len(mipvu_archives)} MIPVU annotation archive(s) for this text.",
                "You MUST ask the user which data source to use before proceeding.\n",
            ]
            for i, arch in enumerate(mipvu_archives, 1):
                aid = arch.get("id", "?")
                coder = (
                    arch.get("coderName")
                    or arch.get("annotator")
                    or arch.get("coder_name")
                    or "(unknown)"
                )
                ann_count = arch.get("annotationCount", arch.get("annotation_count", "?"))
                ts = (arch.get("timestamp") or "")[:19]
                lines += [
                    f"Archive {i}:",
                    f"  ID:          {aid}",
                    f"  Coder:       {coder}",
                    f"  Annotations: {ann_count} MRW spans",
                    f"  Saved:       {ts}",
                    "",
                ]

            lines += [
                "",
                "─" * 80,
                "⚠ STOP — DO NOT call dmip_analysis again until the user answers.",
                "Present the archive list above to the user and ask which source to use.",
                "Do NOT choose a source on behalf of the user.",
                "",
                "After the user replies, make the next call as follows:",
                "  A) User chose a specific archive:",
                "       dmip_analysis(corpus_id=..., text_id=...,",
                f"                    annotation_archive_id='<archive_id_from_list>')",
                "  B) User chose automatic MIPVU (corpus metadata, no re-annotation):",
                "       dmip_analysis(corpus_id=..., text_id=...,",
                "                    annotation_archive_id='auto')",
                "     ← pass the literal string 'auto' as annotation_archive_id.",
                "       Do NOT pass use_automatic_mipvu=True on a first or re-call",
                "       without this 'auto' sentinel — it will trigger this STOP again.",
                "",
                "Wait for the user's answer. Do NOT proceed autonomously.",
            ]
            return "\n".join(lines)

        # ── 4. Determine MRW source ────────────────────────────────────────────
        use_archive = bool(annotation_archive_id) and not use_automatic_mipvu

        if use_archive:
            # Load the specified annotation archive
            if not corpus_name:
                try:
                    corpus_result = await client.get(f"/api/corpus/{corpus_id}")
                    corpus_data = corpus_result.get("data", corpus_result)
                    corpus_name = corpus_data.get("name", "")
                except Exception:
                    corpus_name = ""

            if not corpus_name:
                return f"ERROR: Cannot resolve corpus name for corpus_id={corpus_id}. Cannot load archive."

            try:
                archive_result = await client.get(
                    f"/api/annotation/load/{corpus_name}/{annotation_archive_id}"
                )
                archive_data = archive_result.get("data", archive_result)
            except Exception as exc:
                return f"ERROR: Failed to load archive {annotation_archive_id}: {exc}"

            if not archive_data:
                return f"ERROR: Archive not found: {annotation_archive_id}"

            # Verify framework (renamed "MIPVU" → "Metaphor"; accept both)
            archive_framework = (archive_data.get("framework") or "").upper()
            if archive_framework not in ("MIPVU", "METAPHOR"):
                return (
                    f"ERROR: Archive {annotation_archive_id} uses framework "
                    f"'{archive_data.get('framework')}', not the Metaphor/MIPVU "
                    "framework. Please specify a Metaphor (MIPVU) annotation archive."
                )

            archive_annotations = archive_data.get("annotations", [])
            archive_coder = (
                archive_data.get("coderName")
                or archive_data.get("annotator")
                or "(unknown)"
            )
            archive_ts = (archive_data.get("timestamp") or "")[:19]

            # Fetch sentence boundaries from SpaCy for structuring the output
            sentences: list[dict] = []
            try:
                spacy_result = await client.get(
                    f"/api/corpus/{corpus_id}/texts/{text_id}/spacy"
                )
                spacy_data = spacy_result.get("data", spacy_result)
                sentences = spacy_data.get("sentences", [])
            except Exception:
                sentences = []

            # Fall back to treating the whole text as one sentence
            if not sentences:
                sentences = [{"start": 0, "end": len(content), "text": content}]

            annotated_lines, counts = _build_from_annotation_archive(
                raw_text=content,
                annotations=archive_annotations,
                sentences=sentences,
                include_implicit=include_implicit,
            )

            # ── Assemble archive-based output ──────────────────────────────────
            data_source_note = (
                f"Data source: MIPVU annotation archive\n"
                f"Archive ID:  {annotation_archive_id}\n"
                f"Coder:       {archive_coder}\n"
                f"Saved:       {archive_ts}\n"
                f"Annotations: {len(archive_annotations)} spans "
                f"(indirect={counts['indirect']}  direct={counts['direct']}  "
                f"mflag={counts['mflag']}  implicit={counts['implicit']}  "
                f"total={counts['total']})\n"
            )

            header = (
                f"=== DMIP ANALYSIS CONTEXT ===\n\n"
                f"Text:     {filename}\n"
                f"Language: {language}\n"
                f"Tokens:   {word_count}\n"
                f"{data_source_note}"
            )

            legend = (
                "\nANNOTATION KEY:\n"
                "  [MET:word/phrase]   = indirect MRW — contextual meaning ≠ basic meaning\n"
                "  [DIR:word/phrase]   = direct MRW — word used literally; introduces source domain\n"
                "  [MFLAG:word/phrase] = metaphor FLAG (like / as / as if …) — NOT an MRW;\n"
                "                        signals the adjacent MRW as [L+]; not coded/judged itself\n"
                "  [IMPL:word/phrase]  = implicit MRW — cohesive reference to a prior MRW\n"
                "  Multi-word MRWs: the entire annotated phrase appears inside the brackets.\n"
            )

            annotated_section = (
                "\n━━━ MIPVU-ANNOTATED TEXT (annotation archive) ━━━\n\n"
                + "\n".join(annotated_lines)
            )

            return (
                header
                + legend
                + annotated_section
                + "\n"
                + _DMIP_PROCEDURE
            )

        # ── 5. Corpus MIPVU metadata path (reads existing sidecar, no re-annotation) ──
        mipvu_result = await client.get(
            f"/api/corpus/{corpus_id}/texts/{text_id}/mipvu"
        )
        mipvu_data = mipvu_result.get("data", mipvu_result)
        sentences = mipvu_data.get("sentences", [])

        if not sentences:
            # Build a helpful error that also mentions any available archives
            archive_hint = ""
            if mipvu_archives:
                ids = ", ".join(a.get("id", "?") for a in mipvu_archives[:3])
                archive_hint = (
                    f"\nHowever, {len(mipvu_archives)} MIPVU annotation archive(s) exist "
                    f"for this text.  You can use one via:\n"
                    f"  dmip_analysis(corpus_id='{corpus_id}', text_id='{text_id}',\n"
                    f"               annotation_archive_id='<id>')\n"
                    f"Available archive IDs: {ids}"
                )
            return (
                f"ERROR: No MIPVU annotation metadata found for text_id={text_id}.\n"
                "Ensure the text has been processed through MIPVU annotation. "
                "In Meta-Lingo, open the Metaphor Analysis page and verify "
                "that annotation is complete for this text."
                + archive_hint
            )

        # ── 6. Build annotated text from corpus MIPVU metadata ────────────────
        annotated_lines: list[str] = []

        for s_idx, sent in enumerate(sentences, 1):
            tokens = sent.get("tokens", [])
            annotated = _annotate_tokens(tokens)
            annotated_lines.append(f"[S{s_idx}] {annotated}")

        # ── 7. Summary statistics ──────────────────────────────────────────────
        counts = _count_mrw_types(sentences)
        stats = mipvu_data.get("statistics", {})
        total_tokens = stats.get("total_tokens", word_count)
        metaphor_rate = stats.get("metaphor_rate", 0.0)
        if isinstance(metaphor_rate, float) and metaphor_rate <= 1.0:
            metaphor_rate_pct = metaphor_rate * 100
        else:
            metaphor_rate_pct = float(metaphor_rate)

        # If archives exist, mention them in the header as an alternative source
        archive_note = ""
        if mipvu_archives:
            archive_note = (
                f"\nNote: {len(mipvu_archives)} MIPVU annotation archive(s) also exist "
                "for this text. To use one instead, re-call with annotation_archive_id=<id>.\n"
            )

        # ── 8. Assemble output ─────────────────────────────────────────────────
        header = (
            f"=== DMIP ANALYSIS CONTEXT ===\n\n"
            f"Text:     {filename}\n"
            f"Language: {language}\n"
            f"Tokens:   {total_tokens}  |  Metaphor rate: {metaphor_rate_pct:.1f}%\n"
            f"Data source: corpus MIPVU metadata (existing sidecar annotation)\n"
            f"MRW breakdown: indirect={counts['indirect']}  direct={counts['direct']}  "
            f"mflag={counts['mflag']}  implicit={counts['implicit']}  "
            f"total={counts['total']}\n"
            + archive_note
        )

        legend = (
            "\nANNOTATION KEY:\n"
            "  [MET:word]   = indirect MRW — contextual meaning ≠ basic meaning\n"
            "  [DIR:word]   = direct MRW — word used literally; introduces source domain\n"
            "  [MFLAG:word] = metaphor FLAG (like / as / as if …) — NOT an MRW;\n"
            "                 signals the adjacent MRW as [L+]; not coded/judged itself\n"
            "  [IMPL:word]  = implicit MRW — cohesive reference to a prior MRW\n"
        )

        annotated_section = (
            "\n━━━ MIPVU-ANNOTATED TEXT (corpus metadata) ━━━\n\n"
            + "\n".join(annotated_lines)
        )

        return (
            header
            + legend
            + annotated_section
            + "\n"
            + _DMIP_PROCEDURE
        )
