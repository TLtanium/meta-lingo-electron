"""
Biber (1988) linguistic feature tagger for Multidimensional Analysis.

Python port of the MAT v1.3.2 tagging algorithm (Nini, A. 2019. The
Multi-Dimensional Analysis Tagger), which replicates the tagger described in
the Appendix of Biber (1988) "Variation across Speech and Writing".

Input tokens come from stored SpaCy annotations (PTB tags via ``token.tag``),
which play the role of the Stanford Tagger output used by the original MAT.
All rules operate on (word, PTB tag) sequences; no re-parsing is required, so
tagging a full corpus is a fast linear scan.
"""

from typing import Any, Dict, List, Optional


# ---------------------------------------------------------------------------
# Word lists (from Tagger_MAT.pl)
# ---------------------------------------------------------------------------

HAVE_WORDS = {"have", "has", "had", "having", "hath", "ve"}
DO_WORDS = {"do", "does", "did", "doing", "done"}
BE_WORDS = {"be", "am", "is", "are", "was", "were", "been", "being", "m", "re"}

WHO_WORDS = {
    "what", "where", "when", "how", "whether", "why", "whoever", "whomever",
    "whichever", "wherever", "whenever", "whatever", "however",
}
WP_WORDS = {"who", "whom", "whose", "which"}

PREPOSITIONS = {
    "against", "amid", "amidst", "among", "amongst", "at", "besides",
    "between", "by", "despite", "during", "except", "for", "from", "in",
    "into", "minus", "notwithstanding", "of", "off", "on", "onto", "opposite",
    "out", "per", "plus", "pro", "than", "through", "throughout", "thru",
    "toward", "towards", "upon", "versus", "via", "with", "within", "without",
}

INDEFINITE_PRONOUNS = {
    "anybody", "anyone", "anything", "everybody", "everyone", "everything",
    "nobody", "none", "nothing", "nowhere", "somebody", "someone", "something",
}
QUANTIFIERS = {"each", "all", "every", "many", "much", "few", "several", "some", "any"}
QUANTIFIER_PRONOUNS = {
    "everybody", "somebody", "anybody", "everyone", "someone", "anyone",
    "everything", "something", "anything",
}

CONJUNCTS_SINGLE = {
    "alternatively", "consequently", "conversely", "eg", "e.g.", "furthermore",
    "hence", "however", "i.e.", "instead", "likewise", "moreover", "namely",
    "nevertheless", "nonetheless", "notwithstanding", "otherwise", "similarly",
    "therefore", "thus", "viz.",
}

TIME_ADVERBIALS = {
    "afterwards", "again", "earlier", "early", "eventually", "formerly",
    "immediately", "initially", "instantly", "late", "lately", "later",
    "momentarily", "now", "nowadays", "once", "originally", "presently",
    "previously", "recently", "shortly", "simultaneously", "subsequently",
    "today", "to-day", "tomorrow", "to-morrow", "tonight", "to-night",
    "yesterday",
}

PLACE_ADVERBIALS = {
    "aboard", "above", "abroad", "across", "ahead", "alongside", "around",
    "ashore", "astern", "away", "behind", "below", "beneath", "beside",
    "downhill", "downstairs", "downstream", "east", "far", "hereabouts",
    "indoors", "inland", "inshore", "inside", "locally", "near", "nearby",
    "north", "nowhere", "outdoors", "outside", "overboard", "overland",
    "overseas", "south", "underfoot", "underground", "underneath", "uphill",
    "upstairs", "upstream", "west",
}

AMPLIFIERS = {
    "absolutely", "altogether", "completely", "enormously", "entirely",
    "extremely", "fully", "greatly", "highly", "intensely", "perfectly",
    "strongly", "thoroughly", "totally", "utterly", "very",
}

DOWNTONERS = {
    "almost", "barely", "hardly", "merely", "mildly", "nearly", "only",
    "partially", "partly", "practically", "scarcely", "slightly", "somewhat",
}

FIRST_PERSON_PRONOUNS = {"i", "me", "we", "us", "my", "our", "myself", "ourselves"}
SECOND_PERSON_PRONOUNS = {
    "you", "your", "yourself", "yourselves", "thy", "thee", "thyself", "thou",
}
THIRD_PERSON_PRONOUNS = {
    "she", "he", "they", "her", "him", "them", "his", "their", "himself",
    "herself", "themselves",
}
PRONOUN_IT = {"it", "its", "itself"}

POSSIBILITY_MODALS = {"can", "may", "might", "could", "ca"}
NECESSITY_MODALS = {"ought", "should", "must"}
# 'll / 'd handled by tag check below (word normalised without apostrophe)
PREDICTIVE_MODALS = {"will", "wo", "would", "shall", "sha", "ll", "d"}

SEEM_APPEAR = {
    "seem", "seems", "seemed", "seeming", "appear", "appears", "appeared",
    "appearing",
}

PUBLIC_VERBS = {
    "acknowledge", "acknowledged", "acknowledges", "acknowledging", "add",
    "adds", "adding", "added", "admit", "admits", "admitting", "admitted",
    "affirm", "affirms", "affirming", "affirmed", "agree", "agrees",
    "agreeing", "agreed", "allege", "alleges", "alleging", "alleged",
    "announce", "announces", "announcing", "announced", "argue", "argues",
    "arguing", "argued", "assert", "asserts", "asserting", "asserted", "bet",
    "bets", "betting", "boast", "boasts", "boasting", "boasted", "certify",
    "certifies", "certifying", "certified", "claim", "claims", "claiming",
    "claimed", "comment", "comments", "commenting", "commented", "complain",
    "complains", "complaining", "complained", "concede", "concedes",
    "conceding", "conceded", "confess", "confesses", "confessing",
    "confessed", "confide", "confides", "confiding", "confided", "confirm",
    "confirms", "confirming", "confirmed", "contend", "contends",
    "contending", "contended", "convey", "conveys", "conveying", "conveyed",
    "declare", "declares", "declaring", "declared", "deny", "denies",
    "denying", "denied", "disclose", "discloses", "disclosing", "disclosed",
    "exclaim", "exclaims", "exclaiming", "exclaimed", "explain", "explains",
    "explaining", "explained", "forecast", "forecasts", "forecasting",
    "forecasted", "foretell", "foretells", "foretelling", "foretold",
    "guarantee", "guarantees", "guaranteeing", "guaranteed", "hint", "hints",
    "hinting", "hinted", "insist", "insists", "insisting", "insisted",
    "maintain", "maintains", "maintaining", "maintained", "mention",
    "mentions", "mentioning", "mentioned", "object", "objects", "objecting",
    "objected", "predict", "predicts", "predicting", "predicted", "proclaim",
    "proclaims", "proclaiming", "proclaimed", "promise", "promises",
    "promising", "promised", "pronounce", "pronounces", "pronouncing",
    "pronounced", "prophesy", "prophesies", "prophesying", "prophesied",
    "protest", "protests", "protesting", "protested", "remark", "remarks",
    "remarking", "remarked", "repeat", "repeats", "repeating", "repeated",
    "reply", "replies", "replying", "replied", "report", "reports",
    "reporting", "reported", "say", "says", "saying", "said", "state",
    "states", "stating", "stated", "submit", "submits", "submitting",
    "submitted", "suggest", "suggests", "suggesting", "suggested", "swear",
    "swears", "swearing", "swore", "sworn", "testify", "testifies",
    "testifying", "testified", "vow", "vows", "vowing", "vowed", "warn",
    "warns", "warning", "warned", "write", "writes", "writing", "wrote",
    "written",
}

PRIVATE_VERBS = {
    "accept", "accepts", "accepting", "accepted", "anticipate", "anticipates",
    "anticipating", "anticipated", "ascertain", "ascertains", "ascertaining",
    "ascertained", "assume", "assumes", "assuming", "assumed", "believe",
    "believes", "believing", "believed", "calculate", "calculates",
    "calculating", "calculated", "check", "checks", "checking", "checked",
    "conclude", "concludes", "concluding", "concluded", "conjecture",
    "conjectures", "conjecturing", "conjectured", "consider", "considers",
    "considering", "considered", "decide", "decides", "deciding", "decided",
    "deduce", "deduces", "deducing", "deduced", "deem", "deems", "deeming",
    "deemed", "demonstrate", "demonstrates", "demonstrating", "demonstrated",
    "determine", "determines", "determining", "determined", "discern",
    "discerns", "discerning", "discerned", "discover", "discovers",
    "discovering", "discovered", "doubt", "doubts", "doubting", "doubted",
    "dream", "dreams", "dreaming", "dreamt", "dreamed", "ensure", "ensures",
    "ensuring", "ensured", "establish", "establishes", "establishing",
    "established", "estimate", "estimates", "estimating", "estimated",
    "expect", "expects", "expecting", "expected", "fancy", "fancies",
    "fancying", "fancied", "fear", "fears", "fearing", "feared", "feel",
    "feels", "feeling", "felt", "find", "finds", "finding", "found",
    "foresee", "foresees", "foreseeing", "foresaw", "forget", "forgets",
    "forgetting", "forgot", "forgotten", "gather", "gathers", "gathering",
    "gathered", "guess", "guesses", "guessing", "guessed", "hear", "hears",
    "hearing", "heard", "hold", "holds", "holding", "held", "hope", "hopes",
    "hoping", "hoped", "imagine", "imagines", "imagining", "imagined",
    "imply", "implies", "implying", "implied", "indicate", "indicates",
    "indicating", "indicated", "infer", "infers", "inferring", "inferred",
    "insure", "insures", "insuring", "insured", "judge", "judges", "judging",
    "judged", "know", "knows", "knowing", "knew", "known", "learn", "learns",
    "learning", "learnt", "learned", "mean", "means", "meaning", "meant",
    "note", "notes", "noting", "noted", "notice", "notices", "noticing",
    "noticed", "observe", "observes", "observing", "observed", "perceive",
    "perceives", "perceiving", "perceived", "presume", "presumes",
    "presuming", "presumed", "presuppose", "presupposes", "presupposing",
    "presupposed", "pretend", "pretending", "pretended", "prove", "proves",
    "proving", "proved", "realize", "realise", "realising", "realizing",
    "realises", "realizes", "realised", "realized", "reason", "reasons",
    "reasoning", "reasoned", "recall", "recalls", "recalling", "recalled",
    "reckon", "reckons", "reckoning", "reckoned", "recognize", "recognise",
    "recognizes", "recognises", "recognizing", "recognising", "recognized",
    "recognised", "reflect", "reflects", "reflecting", "reflected",
    "remember", "remembers", "remembering", "remembered", "reveal",
    "reveals", "revealing", "revealed", "see", "sees", "seeing", "saw",
    "seen", "sense", "senses", "sensing", "sensed", "show", "shows",
    "showing", "showed", "shown", "signify", "signifies", "signifying",
    "signified", "suppose", "supposes", "supposing", "supposed", "suspect",
    "suspects", "suspecting", "suspected", "think", "thinks", "thinking",
    "thought", "understand", "understands", "understanding", "understood",
}

SUASIVE_VERBS = {
    "agree", "agrees", "agreeing", "agreed", "allow", "allows", "allowing",
    "allowed", "arrange", "arranges", "arranging", "arranged", "ask", "asks",
    "asking", "asked", "beg", "begs", "begging", "begged", "command",
    "commands", "commanding", "commanded", "concede", "concedes",
    "conceding", "conceded", "decide", "decides", "deciding", "decided",
    "decree", "decrees", "decreeing", "decreed", "demand", "demands",
    "demanding", "demanded", "desire", "desires", "desiring", "desired",
    "determine", "determines", "determining", "determined", "enjoin",
    "enjoins", "enjoining", "enjoined", "ensure", "ensures", "ensuring",
    "ensured", "entreat", "entreats", "entreating", "entreated", "grant",
    "grants", "granting", "granted", "insist", "insists", "insisting",
    "insisted", "instruct", "instructs", "instructing", "instructed",
    "intend", "intends", "intending", "intended", "move", "moves", "moving",
    "moved", "ordain", "ordains", "ordaining", "ordained", "order", "orders",
    "ordering", "ordered", "pledge", "pledges", "pledging", "pledged",
    "pray", "prays", "praying", "prayed", "prefer", "prefers", "preferring",
    "preferred", "pronounce", "pronounces", "pronouncing", "pronounced",
    "propose", "proposes", "proposing", "proposed", "recommend",
    "recommends", "recommending", "recommended", "request", "requests",
    "requesting", "requested", "require", "requires", "requiring",
    "required", "resolve", "resolves", "resolving", "resolved", "rule",
    "rules", "ruling", "ruled", "stipulate", "stipulates", "stipulating",
    "stipulated", "suggest", "suggests", "suggesting", "suggested", "urge",
    "urges", "urging", "urged", "vote", "votes", "voting", "voted",
}


# ---------------------------------------------------------------------------
# Token model
# ---------------------------------------------------------------------------

class Tok:
    """Mutable token used during rule application."""

    __slots__ = ("w", "lw", "norm", "tag", "extra", "is_punct")

    def __init__(self, word: str, tag: str, is_punct: bool):
        self.w = word
        self.lw = word.lower()
        # Strip leading apostrophes so clitics ('s, 've, 'll, n't …) match the
        # word lists the same way Perl's \b boundary did.
        self.norm = self.lw.lstrip("'’")
        self.tag = tag
        self.extra: List[str] = []
        self.is_punct = is_punct


# Boundary sentinel: behaves like "no token" (never matches anything).
_NONE = Tok("", "", False)
_NONE.norm = "\x00"
_NONE.lw = "\x00"


class _Seq:
    """Token sequence with safe out-of-range access (mirrors Perl undef)."""

    def __init__(self, toks: List[Tok]):
        self.toks = toks

    def __len__(self) -> int:
        return len(self.toks)

    def __getitem__(self, i: int) -> Tok:
        if 0 <= i < len(self.toks):
            return self.toks[i]
        return _NONE


# ---------------------------------------------------------------------------
# Predicates
# ---------------------------------------------------------------------------

def _is_be(t: Tok) -> bool:
    if t.norm == "s":
        return t.tag == "VBZ"
    return t.norm in BE_WORDS


def _is_have(t: Tok) -> bool:
    return t.norm in HAVE_WORDS


def _is_do(t: Tok) -> bool:
    return t.norm in DO_WORDS


def _is_aux(t: Tok) -> bool:
    """MD or a form of DO/HAVE/BE (common auxiliary disjunction in the rules)."""
    return t.tag == "MD" or _is_do(t) or _is_have(t) or _is_be(t)


def _is_verb_list(t: Tok, words: set) -> bool:
    """Word-list verbs require a verbal PTB tag (…_V in the Perl source)."""
    return t.norm in words and t.tag.startswith("V")


def _is_pub_priv_sua(t: Tok) -> bool:
    return (
        _is_verb_list(t, PUBLIC_VERBS)
        or _is_verb_list(t, PRIVATE_VERBS)
        or _is_verb_list(t, SUASIVE_VERBS)
    )


def _p(t: Tok) -> bool:
    """Punctuation token (Perl: tag matching _\\W)."""
    return t.is_punct or (bool(t.tag) and not t.tag[:1].isalnum())


def _v(t: Tok) -> bool:
    """Any verbal tag (Perl: /_V/ substring on the main tag)."""
    return t.tag.startswith("V")


def _n(t: Tok) -> bool:
    """Perl /_N/: any tag starting with N (NN/NNS/NNP/NNPS, incl. NULL)."""
    return t.tag.startswith("N")


def _nn(t: Tok) -> bool:
    """Perl /_NN/: noun tags."""
    return t.tag.startswith("NN")


def _jj(t: Tok) -> bool:
    return t.tag.startswith("JJ")


def _rb(t: Tok) -> bool:
    return t.tag.startswith("RB")


def _bema_next(t: Tok) -> bool:
    """Continuation pattern for be-as-main-verb (_CD|_DT|_PDT|_PRPS|_PRP|_JJ|_PRED|_PIN|_QUAN)."""
    return (
        t.tag in ("CD", "DT", "PDT", "PRED", "PIN", "QUAN")
        or t.tag.startswith("PRP")
        or t.tag.startswith("JJ")
    )


def _who(t: Tok) -> bool:
    return t.norm in WHO_WORDS


def _wp(t: Tok) -> bool:
    return t.norm in WP_WORDS


# ---------------------------------------------------------------------------
# Tagger
# ---------------------------------------------------------------------------

def tag_tokens(spacy_tokens: List[Dict[str, Any]]) -> List[Tok]:
    """Run the full MAT rule cascade over a list of SpaCy token dicts."""
    toks: List[Tok] = []
    for st in spacy_tokens:
        if st.get("is_space"):
            continue
        tag = st.get("tag") or ""
        if tag == "_SP":
            continue
        # Symbol correction: PRP$ → PRPS, WP$ → WPS
        if tag == "PRP$":
            tag = "PRPS"
        elif tag == "WP$":
            tag = "WPS"
        toks.append(Tok(st.get("text", ""), tag, bool(st.get("is_punct"))))

    w = _Seq(toks)
    n = len(toks)

    # ---- Correction of "to" as preposition -------------------------------
    _TO_NEXT = ("IN", "CD", "DT", "JJ", "PRPS", "WPS", "NN", "NNP", "PDT",
                "PRP", "WDT", "WRB")
    for j in range(n):
        if w[j].norm == "to":
            nx = w[j + 1]
            if any(nx.tag.startswith(p) for p in _TO_NEXT) or _wp(nx):
                w[j].tag = "PIN"

    # ---- Basic tags needed for complex tags ------------------------------
    for t in toks:
        if (t.lw == "not" or t.norm == "n't") and t.tag.startswith("RB"):
            t.tag = "XX0"
        if t.norm in PREPOSITIONS:
            t.tag = "PIN"
        if t.norm in INDEFINITE_PRONOUNS:
            t.tag = "INPR"
        if t.norm in QUANTIFIERS:
            t.tag = "QUAN"
        if t.norm in QUANTIFIER_PRONOUNS:
            t.tag = "QUPR"

    # ---- Complex tags -----------------------------------------------------
    for j in range(n):
        t = w[j]

        # adverbial subordinators (OSUB)
        if t.norm in ("since", "while", "whilst", "whereupon", "whereas", "whereby"):
            t.tag = "OSUB"
        if (
            (t.norm == "such" and w[j + 1].norm == "that")
            or (t.norm in ("inasmuch", "forasmuch", "insofar", "insomuch")
                and w[j + 1].norm == "as")
            or (t.norm == "so" and w[j + 1].norm == "that"
                and not (_nn(w[j + 2]) or _jj(w[j + 2])))
        ):
            t.tag = "OSUB"
            w[j + 1].tag = "NULL"
        if t.norm == "as" and w[j + 1].norm in ("long", "soon") and w[j + 2].norm == "as":
            t.tag = "OSUB"
            w[j + 1].tag = "NULL"
            w[j + 2].tag = "NULL"

        # predicative adjectives (PRED)
        if _is_be(t) and _jj(w[j + 1]) and not (
            _jj(w[j + 2]) or _rb(w[j + 2]) or _nn(w[j + 2])
        ):
            w[j + 1].tag = "PRED"
        if _is_be(t) and _rb(w[j + 1]) and _jj(w[j + 2]) and not (
            _jj(w[j + 3]) or _rb(w[j + 3]) or _nn(w[j + 3])
        ):
            w[j + 2].tag = "PRED"
        if _is_be(t) and w[j + 1].tag == "XX0" and _jj(w[j + 2]) and not (
            _jj(w[j + 3]) or _rb(w[j + 3]) or _nn(w[j + 3])
        ):
            w[j + 2].tag = "PRED"
        if _is_be(t) and w[j + 1].tag == "XX0" and _rb(w[j + 2]) and _jj(w[j + 3]) and not (
            _jj(w[j + 4]) or _rb(w[j + 4]) or _nn(w[j + 4])
        ):
            w[j + 3].tag = "PRED"
        if w[j - 2].tag == "PRED" and w[j - 1].tag == "PHC" and _jj(t):
            t.tag = "PRED"

        # conjuncts (CONJ)
        if _p(t) and w[j + 1].norm in ("else", "altogether", "rather"):
            w[j + 1].tag = "CONJ"
        if t.norm in CONJUNCTS_SINGLE:
            t.tag = "CONJ"
        if (
            (t.norm == "in" and w[j + 1].norm in (
                "comparison", "contrast", "particular", "addition",
                "conclusion", "consequence", "sum", "summary"))
            or (t.norm == "for" and w[j + 1].norm in ("example", "instance"))
            or (t.norm == "instead" and w[j + 1].norm == "of")
            or (t.norm == "by" and w[j + 1].norm in ("contrast", "comparison"))
        ):
            t.tag = "CONJ"
            w[j + 1].tag = "NULL"
        if (
            (t.norm == "in" and w[j + 1].norm == "any" and w[j + 2].norm in ("event", "case"))
            or (t.norm == "in" and w[j + 1].norm == "other" and w[j + 2].norm == "words")
            or (t.norm == "as" and w[j + 1].norm == "a" and w[j + 2].norm in ("result", "consequence"))
            or (t.norm == "on" and w[j + 1].norm == "the" and w[j + 2].norm == "contrary")
        ):
            t.tag = "CONJ"
            w[j + 1].tag = "NULL"
            w[j + 2].tag = "NULL"
        if (t.norm == "on" and w[j + 1].norm == "the" and w[j + 2].norm == "other"
                and w[j + 3].norm == "hand"):
            t.tag = "CONJ"
            w[j + 1].tag = "NULL"
            w[j + 2].tag = "NULL"
            w[j + 3].tag = "NULL"

        # emphatics (EMPH)
        if t.norm in ("just", "really", "most", "more"):
            t.tag = "EMPH"
        if (
            (t.norm == "real" and (_jj(w[j + 1]) or w[j + 1].tag == "PRED"))
            or (t.norm == "so" and (_jj(w[j + 1]) or w[j + 1].tag == "PRED"))
            or (_is_do(t) and _v(w[j + 1]))
        ):
            t.tag = "EMPH"
        if (
            (t.norm == "for" and w[j + 1].norm == "sure")
            or (t.norm == "a" and w[j + 1].norm == "lot")
            or (t.norm == "such" and w[j + 1].norm == "a")
        ):
            t.tag = "EMPH"
            w[j + 1].tag = "NULL"

        # phrasal "and" coordination (PHC)
        if t.norm == "and" and (
            (_rb(w[j - 1]) and _rb(w[j + 1]))
            or ((_jj(w[j - 1]) or w[j - 1].tag == "PRED")
                and (_jj(w[j + 1]) or w[j + 1].tag == "PRED"))
            or (_v(w[j - 1]) and _v(w[j + 1]))
            or (_nn(w[j - 1]) and _nn(w[j + 1]))
        ):
            t.tag = "PHC"

        # pro-verb do (PROD) — literal port of the MAT conjunction
        if _is_do(t):
            adv1 = _rb(w[j + 1]) or w[j + 1].tag == "XX0"
            if (
                not _v(w[j + 1])
                and w[j + 1].tag != "XX0"
                and (not adv1 and not _v(w[j + 2]))
                and (not adv1 and not _rb(w[j + 2]) and not _v(w[j + 3]))
                and not _p(w[j - 1])
                and not (_wp(w[j - 1]) or _who(w[j - 1]))
            ):
                t.extra.append("PROD")

        # direct WH-questions (WHQU)
        if _p(t) and t.tag != ",":
            nx = w[j + 1]
            if (
                _who(nx) and nx.norm not in ("however", "whatever")
                and (w[j + 2].tag == "MD" or _is_do(w[j + 2]) or _is_have(w[j + 2]) or _is_be(w[j + 2]))
            ):
                nx.extra.append("WHQU")
            elif (
                _who(w[j + 2]) and w[j + 2].norm not in ("however", "whatever")
                and _is_be(w[j + 3])
            ):
                # MAT appends the tag to the token after the punctuation mark
                nx.extra.append("WHQU")

        # sentence relatives (SERE)
        if _p(t) and w[j + 1].norm == "which":
            w[j + 1].extra.append("SERE")

        # perfect aspect (PEAS)
        if _is_have(t):
            if (
                w[j + 1].tag in ("VBD", "VBN")
                or ((_rb(w[j + 1]) or w[j + 1].tag == "XX0") and w[j + 2].tag in ("VBD", "VBN"))
                or ((_rb(w[j + 1]) or w[j + 1].tag == "XX0")
                    and (_rb(w[j + 2]) or w[j + 2].tag == "XX0")
                    and w[j + 3].tag in ("VBD", "VBN"))
                or ((_nn(w[j + 1]) or w[j + 1].tag.startswith("PRP"))
                    and w[j + 2].tag in ("VBD", "VBN"))
                or (w[j + 1].tag == "XX0"
                    and (_nn(w[j + 2]) or w[j + 2].tag.startswith("PRP"))
                    and w[j + 3].tag in ("VBD", "VBN"))
            ):
                t.extra.append("PEAS")

        # passives (PASS) and by-passives (BYPA)
        if _is_be(t):
            matched = None
            if w[j + 1].tag in ("VBD", "VBN"):
                matched = j + 2
            elif (_rb(w[j + 1]) or w[j + 1].tag == "XX0") and w[j + 2].tag in ("VBD", "VBN"):
                matched = j + 3
            elif ((_rb(w[j + 1]) or w[j + 1].tag == "XX0")
                    and (_rb(w[j + 2]) or w[j + 2].tag == "XX0")
                    and w[j + 3].tag in ("VBD", "VBN")):
                matched = j + 4
            elif ((_nn(w[j + 1]) or w[j + 1].tag.startswith("PRP"))
                    and w[j + 2].tag in ("VBD", "VBN")):
                matched = j + 3
            elif (w[j + 1].tag == "XX0"
                    and (_nn(w[j + 2]) or w[j + 2].tag.startswith("PRP"))
                    and w[j + 3].tag in ("VBD", "VBN")):
                matched = j + 4
            if matched is not None:
                if w[matched].norm == "by":
                    t.extra.append("BYPA")
                else:
                    t.extra.append("PASS")

        # be as main verb (BEMA)
        if w[j - 2].tag != "EX" and w[j - 1].tag != "EX" and _is_be(t):
            if _bema_next(w[j + 1]) or (
                (_rb(w[j + 1]) or w[j + 1].tag == "XX0") and _bema_next(w[j + 2])
            ):
                t.extra.append("BEMA")

        # WH clauses (WHCL)
        if (
            _is_pub_priv_sua(t)
            and (_wp(w[j + 1]) or _who(w[j + 1]))
            and not (w[j + 2].tag == "MD" or _is_do(w[j + 2]) or _is_have(w[j + 2]) or _is_be(w[j + 2]))
        ):
            w[j + 1].extra.append("WHCL")

        # pied-piping relative clauses (PIRE)
        if t.tag == "PIN" and w[j + 1].lw in ("who", "whom", "whose", "which"):
            w[j + 1].extra.append("PIRE")

        # stranded prepositions (STPR)
        if t.tag == "PIN" and t.norm != "besides" and w[j + 1].tag in (".", ","):
            t.extra.append("STPR")

        # split infinitives (SPIN)
        if t.norm == "to" and (
            (_rb(w[j + 1]) or w[j + 1].norm in ("just", "really", "most", "more"))
            and (_v(w[j + 2]) or (_rb(w[j + 2]) and _v(w[j + 3])))
        ):
            t.extra.append("SPIN")

        # split auxiliaries (SPAU)
        if (t.tag == "MD" or _is_do(t) or _is_have(t) or _is_be(t)) and (
            (_rb(w[j + 1]) or w[j + 1].norm in ("just", "really", "most", "more"))
            and (_v(w[j + 2]) or (_rb(w[j + 2]) and _v(w[j + 3])))
        ):
            t.extra.append("SPAU")

        # synthetic negation (SYNE)
        if (
            (t.norm == "no" and (_jj(w[j + 1]) or w[j + 1].tag == "PRED" or _nn(w[j + 1])))
            or t.norm == "neither"
            or t.norm == "nor"
        ):
            t.tag = "SYNE"

        # time adverbials (TIME)
        if t.norm in TIME_ADVERBIALS:
            t.tag = "TIME"
        if t.norm == "soon" and w[j + 1].norm != "as":
            t.tag = "TIME"

        # place adverbials (PLACE)
        if t.norm in PLACE_ADVERBIALS and not t.tag.startswith("NNP"):
            t.tag = "PLACE"

        # 'that' verb complements (THVC)
        if t.norm == "that":
            prev = w[j - 1]
            nxt = w[j + 1]
            if (
                (prev.norm in ("and", "nor", "but", "or", "also") or _p(prev))
                and (nxt.tag in ("DT", "QUAN", "CD", "NNS", "NNP", "NNPS")
                     or nxt.tag.startswith("PRP") or nxt.lw == "there")
            ):
                t.tag = "THVC"
            elif (
                (_is_pub_priv_sua(prev) or _is_verb_list(prev, SEEM_APPEAR))
                and not (_v(nxt) or nxt.tag == "MD" or _is_do(nxt) or _is_have(nxt)
                         or _is_be(nxt) or nxt.norm == "and" or _p(nxt))
            ):
                t.tag = "THVC"
            elif (
                _is_pub_priv_sua(w[j - 4]) and w[j - 3].tag == "PIN"
                and not _n(w[j - 2]) and _n(w[j - 1])
            ):
                t.tag = "THVC"
            elif (
                _is_pub_priv_sua(w[j - 5]) and w[j - 4].tag == "PIN"
                and not _n(w[j - 3]) and not _n(w[j - 2]) and _n(w[j - 1])
            ):
                t.tag = "THVC"
            elif (
                _is_pub_priv_sua(w[j - 6]) and w[j - 5].tag == "PIN"
                and not _n(w[j - 4]) and not _n(w[j - 3]) and not _n(w[j - 2])
                and _n(w[j - 1])
            ):
                t.tag = "THVC"

        # 'that' adjective complements (THAC)
        if (_jj(w[j - 1]) or w[j - 1].tag == "PRED") and t.norm == "that":
            t.tag = "THAC"

        # present participial clauses (PRESP)
        if _p(w[j - 1]) and t.tag == "VBG" and (
            w[j + 1].tag in ("PIN", "DT", "QUAN", "CD", "WPS")
            or w[j + 1].tag.startswith("PRP")
            or _wp(w[j + 1]) or _who(w[j + 1]) or _rb(w[j + 1])
        ):
            t.extra.append("PRESP")

        # past participial clauses (PASTP)
        if _p(w[j - 1]) and t.tag == "VBN" and (w[j + 1].tag == "PIN" or _rb(w[j + 1])):
            t.extra.append("PASTP")

        # past participial WHIZ deletion relatives (WZPAST)
        if (
            (_n(w[j - 1]) or w[j - 1].tag == "QUPR") and t.tag == "VBN"
            and (w[j + 1].tag == "PIN" or _rb(w[j + 1]) or _is_be(w[j + 1]))
        ):
            t.extra.append("WZPAST")

        # present participial WHIZ deletion relatives (WZPRES)
        if _n(w[j - 1]) and t.tag == "VBG":
            t.extra.append("WZPRES")

        # 'that' relative clauses on subject position (TSUB)
        if _n(w[j - 1]) and t.norm == "that":
            if (
                (w[j + 1].tag == "MD" or _is_aux(w[j + 1]) or _v(w[j + 1]))
                or ((_rb(w[j + 1]) or w[j + 1].tag == "XX0")
                    and (w[j + 2].tag == "MD" or _is_aux(w[j + 2]) or _v(w[j + 2])))
                or ((_rb(w[j + 1]) or w[j + 1].tag == "XX0")
                    and (_rb(w[j + 2]) or w[j + 2].tag == "XX0")
                    and (w[j + 3].tag == "MD" or _is_aux(w[j + 3]) or _v(w[j + 3])))
            ):
                t.tag = "TSUB"

        # 'that' relative clauses on object position (TOBJ)
        if _n(w[j - 1]) and t.norm == "that":
            nxt = w[j + 1]
            if (
                nxt.tag in ("DT", "QUAN", "CD", "NNS", "NNP", "NNPS", "PRPS")
                or _jj(nxt)
                or nxt.lw == "it"
                or nxt.norm in ("i", "we", "he", "she", "they")
            ):
                t.tag = "TOBJ"
            elif _n(nxt) and w[j + 2].tag == "POS":
                t.tag = "TOBJ"

        # WH relative clauses (WHSUB / WHOBJ)
        _ASK_TELL = ("ask", "asks", "asked", "asking", "tell", "tells", "told", "telling")
        if w[j - 3].norm not in _ASK_TELL and _n(w[j - 1]) and _wp(t):
            if (
                (w[j + 1].tag == "MD" or _is_aux(w[j + 1]) or _v(w[j + 1]))
                or ((_rb(w[j + 1]) or w[j + 1].tag == "XX0")
                    and (w[j + 2].tag == "MD" or _is_aux(w[j + 2]) or _v(w[j + 2])))
                or ((_rb(w[j + 1]) or w[j + 1].tag == "XX0")
                    and (_rb(w[j + 2]) or w[j + 2].tag == "XX0")
                    and (w[j + 3].tag == "MD" or _is_aux(w[j + 3]) or _v(w[j + 3])))
            ):
                t.extra.append("WHSUB")
            elif not (
                _rb(w[j + 1]) or w[j + 1].tag == "XX0" or w[j + 1].tag == "MD"
                or _is_aux(w[j + 1]) or _v(w[j + 1])
            ):
                t.extra.append("WHOBJ")

        # hedges (HDG)
        if t.norm == "maybe":
            t.tag = "HDG"
        if (t.norm == "at" and w[j + 1].norm == "about") or (
            t.norm == "something" and w[j + 1].norm == "like"
        ):
            t.tag = "HDG"
            w[j + 1].tag = "NULL"
        if t.norm == "more" and w[j + 1].norm == "or" and w[j + 2].norm == "less":
            t.tag = "HDG"
            w[j + 1].tag = "NULL"
            w[j + 2].tag = "NULL"
        if (
            w[j - 1].norm in ("sort", "kind") and t.norm == "of"
            and not (
                w[j - 2].tag in ("DT", "QUAN", "CD", "PRPS") or _jj(w[j - 2])
                or w[j - 2].tag == "PRED" or _who(w[j - 2])
            )
        ):
            t.tag = "HDG"
            w[j - 1].tag = "NULL"

        # discourse particles (DPAR)
        if _p(w[j - 1]) and t.norm in ("well", "now", "anyhow", "anyways"):
            t.tag = "DPAR"

    # ---- Demonstrative pronouns (DEMP) ------------------------------------
    for j in range(n):
        t = w[j]
        if (
            t.norm in ("that", "this", "these", "those")
            and t.tag not in ("NULL", "TOBJ", "TSUB", "THAC", "THVC")
        ):
            nxt = w[j + 1]
            if (
                _v(nxt) or nxt.tag == "MD" or _is_do(nxt) or _is_have(nxt)
                or _is_be(nxt) or _p(nxt) or _wp(nxt) or nxt.norm == "and"
            ):
                t.tag = "DEMP"
        if t.norm == "that" and (w[j + 1].lw in ("'s", "’s") or w[j + 1].lw == "is"):
            t.tag = "DEMP"

    # ---- Demonstratives (DEMO) --------------------------------------------
    for t in toks:
        if t.norm in ("that", "this", "these", "those") and t.tag not in (
            "DEMP", "TOBJ", "TSUB", "THAC", "THVC", "NULL"
        ):
            t.tag = "DEMO"

    # ---- Subordinator-that deletion (THATD) --------------------------------
    for j in range(n):
        t = w[j]
        if not _is_pub_priv_sua(t):
            continue
        n1, n2, n3, n4 = w[j + 1], w[j + 2], w[j + 3], w[j + 4]
        if n1.tag == "DEMP" or n1.norm in ("i", "we", "he", "she", "they"):
            t.extra.append("THATD")
        elif (n1.tag == "PRP" or _n(n1)) and (n2.tag == "MD" or _is_aux(n2) or _v(n2)):
            t.extra.append("THATD")
        elif (
            (_jj(n1) or n1.tag in ("PRED", "DT", "QUAN", "CD", "PRPS") or _rb(n1))
            and _n(n2)
            and (n3.tag == "MD" or _is_aux(n3) or _v(n3))
        ):
            t.extra.append("THATD")
        elif (
            (_jj(n1) or n1.tag in ("PRED", "DT", "QUAN", "CD", "PRPS") or _rb(n1))
            and (_jj(n2) or n2.tag == "PRED")
            and _n(n3)
            and (n4.tag == "MD" or _is_aux(n4) or _v(n4))
        ):
            t.extra.append("THATD")

    # ---- Independent clause coordination (ANDC) ----------------------------
    for j in range(n):
        t = w[j]
        if t.norm != "and":
            continue
        if w[j - 1].tag == "," and (
            w[j + 1].norm in ("it", "so", "then", "you", "i", "we", "he", "she", "they")
            or w[j + 1].tag == "DEMP"
        ):
            t.tag = "ANDC"
        elif w[j - 1].tag == "," and w[j + 1].lw == "there" and _is_be(w[j + 2]):
            t.tag = "ANDC"
        elif _p(w[j - 1]):
            t.tag = "ANDC"
        elif (
            _wp(w[j + 1]) or _who(w[j + 1])
            or w[j + 1].norm in ("because", "although", "though", "tho", "if", "unless")
            or w[j + 1].tag in ("OSUB", "DPAR", "CONJ")
        ):
            t.tag = "ANDC"

    # ---- Final basic tags ---------------------------------------------------
    for t in toks:
        if t.norm in AMPLIFIERS:
            t.tag = "AMP"
        if t.norm in DOWNTONERS:
            t.tag = "DWNT"

        # nominalisations (before NN merge; matches NN/NNS)
        if t.tag.startswith("NN") and (
            t.norm.endswith(("tion", "tions", "ment", "ments", "ness", "nesses"))
            or t.norm.endswith(("ity", "ities"))
        ):
            t.tag = "NOMZ"

        # gerunds (length threshold counts word + '_' + tag, as in MAT)
        if t.tag.startswith("NN"):
            total_len = len(t.lw) + 1 + len(t.tag)
            if (t.norm.endswith("ings") and total_len >= 11) or (
                t.norm.endswith("ing") and total_len >= 10
            ):
                t.tag = "GER"

        # merge noun/adjective/adverb/present-tense tags
        if t.tag in ("NNS", "NNP", "NNPS"):
            t.tag = "NN"
        if t.tag in ("JJS", "JJR"):
            t.tag = "JJ"
        if t.tag in ("RBS", "RBR", "WRB"):
            t.tag = "RB"
        if t.tag in ("VBP", "VBZ"):
            t.tag = "VPRT"

        # personal pronouns
        if t.norm in FIRST_PERSON_PRONOUNS:
            t.tag = "FPP1"
        if t.norm in SECOND_PERSON_PRONOUNS:
            t.tag = "SPP2"
        if t.norm in THIRD_PERSON_PRONOUNS:
            t.tag = "TPP3"
        if t.norm in PRONOUN_IT:
            t.tag = "PIT"

        # subordinators
        if t.norm == "because":
            t.tag = "CAUS"
        if t.norm in ("although", "though", "tho"):
            t.tag = "CONC"
        if t.norm in ("if", "unless"):
            t.tag = "COND"

        # modals
        if t.norm in ("can", "may", "might", "could") or (t.norm == "ca" and t.tag == "MD"):
            t.tag = "POMD"
        if t.norm in NECESSITY_MODALS:
            t.tag = "NEMD"
        if (
            t.norm in ("would", "shall")
            or (t.norm in ("will", "wo", "sha", "ll", "d") and t.tag == "MD")
        ):
            t.tag = "PRMD"

        # verb classes (bracket tags — a verb can be in more than one class)
        if _is_verb_list(t, PUBLIC_VERBS):
            t.extra.append("PUBV")
        if _is_verb_list(t, PRIVATE_VERBS):
            t.extra.append("PRIV")
        if _is_verb_list(t, SUASIVE_VERBS):
            t.extra.append("SUAV")
        if _is_verb_list(t, SEEM_APPEAR):
            t.extra.append("SMP")

        # contractions ('<verb form>, n't, 'll, 'd)
        if (
            (t.lw.startswith(("'", "’")) and (t.tag.startswith("V") or t.tag == "VPRT"))
            or (t.norm == "n't" and t.tag == "XX0")
            or (t.norm in ("ll", "d") and t.lw.startswith(("'", "’")))
        ):
            t.extra.append("CONT")

    return toks
