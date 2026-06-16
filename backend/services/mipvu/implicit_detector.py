"""
Rule-based Implicit Metaphor Detector  (MIPVU §2.5)

Detects implicit metaphors (MRW, impl) without requiring word-sense or
coreference disambiguation.  Only two categories of implicit metaphor are
implemented — those where the antecedent is structurally or numerically
determined from the existing SpaCy + is_metaphor annotations:

  Category B — VP Ellipsis:
    Rule VPE-1  "so/neither/nor + AUX"
        A discourse marker (so/neither/nor) immediately followed by an
        auxiliary/modal verb in a clause with no following lexical main verb.
        Antecedent VP = most recent clause in the preceding context window
        that contains an is_metaphor=True VERB token.
        The discourse marker AND the auxiliary are both marked impl.
        Example: "The scheme *collapsed* and so did the committee."
                 → "so" and "did" are impl.

    Rule VPE-2  Bare auxiliary clause
        A short sentence (≤7 content tokens) whose ROOT is an auxiliary/
        modal verb, with a grammatical subject but no lexical main verb.
        Same antecedent look-back as VPE-1.
        Example: "as did the charity Clear"  → "did" is impl.

  Category A — Pronoun Substitution (same-sentence, single-antecedent):
    Rule SUB-1  Single-antecedent pronoun
        A non-expletive 3rd-person pronoun in a sentence that contains
        EXACTLY ONE token where is_metaphor=True AND pos ∈ {NOUN, PROPN}.
        Because there is only one candidate antecedent, no coreference
        resolution is needed.
        Example: "They took the first *step*. It proved decisive."
                 — handled if "it" and "*step*" are in the same sentence.
                 Cross-sentence cases require coreference and are excluded.

Reference: Steen et al. (2010) "A Method for Linguistic Metaphor
Identification", §2.5; gold-set distribution from VUAMC-SpaCy.
"""

import logging
from typing import Dict, List, Any, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# ── Candidate cohesive form sets (MIPVU §2.5, 36-type list) ─────────────────

# 3rd-person personal pronouns that can participate in substitution (Type A)
_PERSONAL_PRONOUNS: frozenset = frozenset({
    'it', 'its', 'itself',
    'they', 'them', 'their', 'theirs', 'themselves',
    'he', 'him', 'his', 'himself',
    'she', 'her', 'hers', 'herself',
})

# Auxiliary / modal word forms that can participate in VP ellipsis (Type B)
_VPE_AUXILIARIES: frozenset = frozenset({
    'do', 'does', 'did', 'doing', 'done',
    'have', 'has', 'had',
    'be', 'is', 'are', 'was', 'were', 'been', 'being',
    'will', 'would', 'shall', 'should',
    'may', 'might', 'can', 'could', 'must', 'need',
})

# Auxiliary lemmas (for identifying auxiliary-as-ROOT)
_AUX_LEMMAS: frozenset = frozenset({
    'do', 'be', 'have',
    'will', 'would', 'shall', 'should',
    'may', 'might', 'can', 'could', 'must', 'need',
})

# Penn POS tags for auxiliary / modal that can be an AUX ROOT in VPE clauses
_AUX_ROOT_TAGS: frozenset = frozenset({'MD', 'VBD', 'VBZ', 'VBP', 'VB'})

# Penn POS tags for ALL verb forms (lexical + aux)
_ALL_VERB_TAGS: frozenset = frozenset({'VB', 'VBD', 'VBG', 'VBN', 'VBP', 'VBZ', 'MD'})

# Discourse markers that introduce VP ellipsis constructions
_VPE_TRIGGERS: frozenset = frozenset({'so', 'neither', 'nor'})

# DEP labels that mark expletive / non-referential uses — never implicit
_EXPLETIVE_DEPS: frozenset = frozenset({'expl', 'det'})

# DEP labels indicating possessive-determiner use (e.g., "his car") — not impl
_POSSESSIVE_DET_DEPS: frozenset = frozenset({'poss'})

# DEP labels indicating referential (anaphoric) use of a pronoun
_REFERENTIAL_DEPS: frozenset = frozenset({
    'dobj', 'obj', 'nsubj', 'nsubjpass',
    'pobj', 'iobj', 'attr', 'conj', 'nmod',
})

# DEP labels for grammatical subjects
_SUBJECT_DEPS: frozenset = frozenset({'nsubj', 'nsubjpass', 'csubj', 'csubjpass'})

# Universal POS tags for nouns (antecedent candidates in substitution)
_NOUN_POS: frozenset = frozenset({'NOUN', 'PROPN'})

# Universal POS tags for verbs (antecedent candidates in ellipsis)
_VERB_POS: frozenset = frozenset({'VERB', 'AUX'})

# Look-back window (number of prior sentences to check for MRW antecedents)
_CONTEXT_WINDOW: int = 2


# ── Helper functions ─────────────────────────────────────────────────────────

def _is_expletive_it(tokens: List[Dict[str, Any]], idx: int) -> bool:
    """
    Return True when the token at `idx` is almost certainly a dummy/expletive "it".

    SpaCy marks genuine expletives with dep='expl', but the dep annotation is
    not always reliable for all parsers.  This heuristic additionally catches
    the most common expletive construction:  "it is/was/seems/appears + ADJ/that".

    Conservative: when uncertain, returns False (prefer false negatives to
    false positives for expletive detection).
    """
    token = tokens[idx]
    if token.get('dep', '') == 'expl':
        return True

    # Only apply the heuristic to singular "it" / "its"
    if token.get('word', '').lower() not in ('it', 'its'):
        return False

    # Pattern: nsubj position followed immediately by a copula / raising verb
    # followed by an adjective, "that"-clause, or infinitive
    if token.get('dep', '') != 'nsubj':
        return False

    # 'prove' intentionally omitted: "it proved decisive" is anaphoric, not expletive
    copula_lemmas = {'be', 'seem', 'appear', 'happen', 'occur', 'turn', 'look'}
    adj_tags = {'JJ', 'JJR', 'JJS'}

    j = idx + 1
    while j < len(tokens):
        t = tokens[j]
        if t.get('is_punct') or t.get('is_space'):
            j += 1
            continue
        lemma_j = t.get('lemma', '').lower()
        # Look for copula/raising verb
        if lemma_j in copula_lemmas or t.get('dep', '') in ('cop', 'aux'):
            # Look one step further for ADJ or "that"
            k = j + 1
            while k < len(tokens):
                t2 = tokens[k]
                if t2.get('is_punct') or t2.get('is_space'):
                    k += 1
                    continue
                tag_k = t2.get('tag', '')
                word_k = t2.get('word', '').lower()
                dep_k = t2.get('dep', '')
                if tag_k in adj_tags or word_k == 'that' or dep_k in ('ccomp', 'xcomp', 'advcl', 'csubj'):
                    return True
                break
        break  # only examine the first non-punct token after "it"

    return False


def _has_predicate_complement_after(tokens: List[Dict[str, Any]], start_idx: int) -> bool:
    """
    Return True if a predicate complement (copular NP or adjective) appears in
    tokens[start_idx:] before the next clause-boundary punctuation.

    Recognises:
      • dep ∈ {attr, acomp, oprd}  — SpaCy labels for predicative NPs/adjectives
      • tag ∈ {JJ, JJR, JJS}       — predicate adjective not used as a modifier

    Used to distinguish copular clauses ("wasn't ideal", "was a great year") from
    true VP-ellipsis clauses ("so did the team"), where no predicate complement
    follows the auxiliary.
    """
    clause_end_punct = {',', ';', ':', '.', '!', '?'}
    predicate_deps = {'attr', 'acomp', 'oprd'}
    adj_tags = {'JJ', 'JJR', 'JJS'}
    modifier_deps = {'amod', 'advmod', 'conj', 'ROOT'}

    for j in range(start_idx, len(tokens)):
        t = tokens[j]
        word = t.get('word', '')
        if word in clause_end_punct:
            break
        if t.get('is_punct') or t.get('is_space'):
            continue
        dep = t.get('dep', '')
        tag = t.get('tag', '')
        if dep in predicate_deps:
            return True
        # Predicate adjective: JJ* that is not a pre-nominal modifier
        if tag in adj_tags and dep not in modifier_deps:
            return True
    return False


def _has_main_verb_after(tokens: List[Dict[str, Any]], start_idx: int) -> bool:
    """
    Return True if there is a lexical (non-auxiliary) verb in `tokens[start_idx:]`.

    Used to verify that an auxiliary is not followed by a main VP, which would
    mean this is a regular clause rather than a VP-ellipsis clause.

    Stops at clause-boundary punctuation (, ; : . ! ?) to stay within the clause.
    """
    clause_end_punct = {',', ';', ':', '.', '!', '?'}
    for j in range(start_idx, len(tokens)):
        t = tokens[j]
        word = t.get('word', '')
        if word in clause_end_punct:
            break  # clause boundary — stop
        tag = t.get('tag', '')
        lemma = t.get('lemma', '').lower()
        # A VERB-family tag whose lemma is NOT an auxiliary lemma → lexical verb
        if tag in _ALL_VERB_TAGS and lemma not in _AUX_LEMMAS and word.lower() not in _VPE_AUXILIARIES:
            return True
    return False


def _find_aux_in_window(tokens: List[Dict[str, Any]], start: int, max_look: int = 4) -> Optional[int]:
    """
    Return the index of the first AUX/modal found within `max_look` non-punct tokens
    starting at `start`, or None if not found.
    """
    count = 0
    for j in range(start, len(tokens)):
        t = tokens[j]
        if t.get('is_punct') or t.get('is_space'):
            continue
        count += 1
        if count > max_look:
            break
        word = t.get('word', '').lower()
        tag = t.get('tag', '')
        lemma = t.get('lemma', '').lower()
        if word in _VPE_AUXILIARIES or lemma in _AUX_LEMMAS or tag == 'MD':
            return j
        # If we hit a content word that is NOT an auxiliary, stop the search
        if tag in ('NN', 'NNS', 'NNP', 'NNPS', 'JJ', 'VBG', 'VBN') or \
                (tag in _ALL_VERB_TAGS and lemma not in _AUX_LEMMAS):
            break
    return None


def _has_mrw_verb_in_context(
    prior_sentences: List[List[Dict[str, Any]]],
    window: int = _CONTEXT_WINDOW
) -> bool:
    """
    Return True if any of the last `window` prior sentences contains at least
    one token with is_metaphor=True AND pos ∈ {VERB, AUX}.

    Also checks the same conditions on is_implicit_metaphor to avoid
    cascade-marking through already-marked implicit tokens; only genuine
    indirect metaphor verbs count.
    """
    for sent in prior_sentences[-window:]:
        for token in sent:
            if token.get('is_metaphor', False) and \
               token.get('pos', '').upper() in _VERB_POS:
                return True
    return False


def _find_vpe_antecedent_token(
    current_tokens: List[Dict[str, Any]],
    prior_sentences: List[List[Dict[str, Any]]],
    window: int = _CONTEXT_WINDOW,
) -> Optional[Dict[str, Any]]:
    """
    Find the most recent MRW verb token that serves as antecedent for a VPE
    implicit metaphor.

    Searches (in reverse order):
      1. The current sentence for an is_metaphor=True VERB/AUX.
      2. The last `window` prior sentences for the same.

    Returns the last such token dict (with 'start'/'end' offsets), or None.
    """
    # Search current sentence first (handles intra-sentence VPE)
    for token in reversed(current_tokens):
        if token.get('is_metaphor', False) and \
                token.get('pos', '').upper() in _VERB_POS:
            return token

    # Search prior sentences newest-first
    for sent in reversed(prior_sentences[-window:]):
        for token in reversed(sent):
            if token.get('is_metaphor', False) and \
                    token.get('pos', '').upper() in _VERB_POS:
                return token

    return None


# ── Detection rules ──────────────────────────────────────────────────────────

def _detect_vpe_trigger_rule(
    tokens: List[Dict[str, Any]],
    has_prior_mrw_verb: bool,
) -> List[int]:
    """
    Rule VPE-1: Discourse-marker + AUX VP ellipsis.

    Detects: so/neither/nor (RB/CC) followed within 1-3 tokens by an
    auxiliary/modal, with no lexical main verb following in the same clause.

    Returns list of token indices to mark as is_implicit_metaphor.
    """
    if not has_prior_mrw_verb:
        return []

    result: List[int] = []

    for i, token in enumerate(tokens):
        word = token.get('word', '').lower()
        if word not in _VPE_TRIGGERS:
            continue

        tag = token.get('tag', '')

        # "so" must be used as an adverb, not as a degree modifier ("so large")
        if word == 'so' and tag not in ('RB', 'CC'):
            continue

        # "neither" / "nor" can be CC, RB, or DT
        if word in ('neither', 'nor') and tag not in ('CC', 'RB', 'DT'):
            continue

        # Find the following auxiliary/modal
        aux_idx = _find_aux_in_window(tokens, i + 1, max_look=4)
        if aux_idx is None:
            continue

        # Verify: no lexical main verb follows the auxiliary in the same clause
        if _has_main_verb_after(tokens, aux_idx + 1):
            continue

        # Verify: the auxiliary is not a copula followed by a predicate
        # complement (e.g. "so it wasn't ideal" / "so was the case").
        # Those are real predications, not VP ellipsis.
        if _has_predicate_complement_after(tokens, aux_idx + 1):
            continue

        result.append(i)       # the discourse marker ("so", "neither", "nor")
        result.append(aux_idx)  # the auxiliary / modal

    return result


def _detect_bare_vpe_rule(
    tokens: List[Dict[str, Any]],
    has_prior_mrw_verb: bool,
) -> List[int]:
    """
    Rule VPE-2: Bare auxiliary VP ellipsis clause.

    Detects a SHORT sentence (≤7 content tokens) where:
      • The ROOT token is an auxiliary / modal (tag ∈ MD/VBD/VBZ/VBP)
      • There is a grammatical subject (dep ∈ nsubj*)
      • There is NO following lexical main verb

    Returns list of token indices to mark as is_implicit_metaphor.
    """
    if not has_prior_mrw_verb:
        return []

    content: List[Tuple[int, Dict[str, Any]]] = [
        (i, t) for i, t in enumerate(tokens)
        if not t.get('is_punct') and not t.get('is_space')
    ]

    # Only applies to short clauses
    if len(content) > 7:
        return []

    root_idx: Optional[int] = None
    root_tag: str = ''
    root_lemma: str = ''
    has_subject: bool = False
    has_lexical_verb: bool = False
    has_predicate_complement: bool = False

    for i, t in content:
        dep = t.get('dep', '')
        tag = t.get('tag', '')
        lemma = t.get('lemma', '').lower()
        word_lower = t.get('word', '').lower()

        if dep == 'ROOT':
            root_idx = i
            root_tag = tag
            root_lemma = lemma

        if dep in _SUBJECT_DEPS:
            has_subject = True

        # Any lexical verb anywhere in the sentence means NOT bare VPE
        if tag in _ALL_VERB_TAGS and lemma not in _AUX_LEMMAS and \
                word_lower not in _VPE_AUXILIARIES:
            has_lexical_verb = True

        # Predicate NP (attr) or predicate adjective (acomp/oprd) means this is
        # a copular sentence, not VP ellipsis — e.g. "1997 was an incredible year"
        if dep in {'attr', 'acomp', 'oprd'}:
            has_predicate_complement = True
        if tag in ('JJ', 'JJR', 'JJS') and dep not in {'amod', 'advmod', 'conj', 'ROOT'}:
            has_predicate_complement = True

    # ROOT must be an auxiliary or modal with an aux lemma
    if root_idx is None or has_lexical_verb or not has_subject or has_predicate_complement:
        return []

    if root_tag not in _AUX_ROOT_TAGS:
        return []

    if root_lemma not in _AUX_LEMMAS and \
            tokens[root_idx].get('word', '').lower() not in _VPE_AUXILIARIES:
        return []

    # If a VPE-1 trigger word is present, let that rule handle it
    for _, t in content:
        if t.get('word', '').lower() in _VPE_TRIGGERS:
            return []

    return [root_idx]


def _detect_single_antecedent_pronoun_rule(
    tokens: List[Dict[str, Any]],
) -> Tuple[List[int], Optional[int]]:
    """
    Rule SUB-1: Same-sentence pronoun with a single MRW-indirect noun antecedent.

    Conditions:
      1. The sentence contains EXACTLY ONE token where is_metaphor=True AND
         pos ∈ {NOUN, PROPN}  (the unique MRW-indirect antecedent).
      2. A non-expletive 3rd-person pronoun appears AFTER that noun in the
         same sentence, in a referential syntactic position (dobj/obj/nsubj/…).

    Because there is only one plausible antecedent, no disambiguation is needed.
    Returns (implicit_indices, antecedent_token_idx): list of token indices to
    mark as is_implicit_metaphor, plus the index of the antecedent noun (or None).
    """
    # Collect MRW-indirect noun positions
    mrw_noun_indices: List[int] = [
        i for i, t in enumerate(tokens)
        if t.get('is_metaphor', False) and t.get('pos', '').upper() in _NOUN_POS
    ]

    # Must be exactly one to remain disambiguation-free
    if len(mrw_noun_indices) != 1:
        return [], None

    mrw_noun_idx = mrw_noun_indices[0]
    result: List[int] = []

    for i, token in enumerate(tokens):
        # Pronoun must be ANAPHORIC → appears after the antecedent
        if i <= mrw_noun_idx:
            continue

        word = token.get('word', '').lower()
        if word not in _PERSONAL_PRONOUNS:
            continue

        dep = token.get('dep', '')

        # Exclude tokens already marked as expletive by the parser
        if dep in _EXPLETIVE_DEPS:
            continue

        # Exclude possessive determiners ("his plan", "their policy")
        if dep in _POSSESSIVE_DET_DEPS:
            continue

        # Apply heuristic expletive check for "it / its"
        if word in ('it', 'its') and _is_expletive_it(tokens, i):
            continue

        # Require a referential syntactic role
        if dep not in _REFERENTIAL_DEPS:
            continue

        # Exclude pronouns that are the pobj of a preposition whose head IS
        # the MRW-noun antecedent — e.g. "a substantial *portion* of it".
        # In that pattern "it" refers to something OTHER than "portion"; marking
        # it as implicit would link it to the wrong antecedent.
        if dep == 'pobj':
            head_idx = token.get('head', -1)
            if isinstance(head_idx, int) and 0 <= head_idx < len(tokens):
                prep_token = tokens[head_idx]
                prep_head_idx = prep_token.get('head', -1)
                if isinstance(prep_head_idx, int) and prep_head_idx == mrw_noun_idx:
                    continue

        result.append(i)

    return result, (mrw_noun_idx if result else None)


# ── Main post-processing function ────────────────────────────────────────────

def detect_implicit_metaphors(
    annotated_sentences: List[List[Dict[str, Any]]],
) -> List[List[Dict[str, Any]]]:
    """
    Post-processing pass: apply rule-based implicit metaphor detection across
    all annotated sentences.

    Must be called AFTER the full MIPVU indirect + direct annotation pipeline
    (Steps 1-4 in MIPVUAnnotator), because it relies on `is_metaphor` flags
    that are set by those steps.

    Args:
        annotated_sentences: List of sentences; each sentence is a flat list
            of token dicts with at least the following keys:
                word, lemma, pos, tag, dep,
                is_metaphor (bool), is_punct (bool), is_space (bool).

    Returns:
        Same structure with `is_implicit_metaphor: bool` added to every token.
        Tokens that meet the rules get True; all others get False.
        The original token dicts are NOT mutated — new dicts are returned.
    """
    result: List[List[Dict[str, Any]]] = []

    for sent_idx, tokens in enumerate(annotated_sentences):
        # Copy tokens, initialising is_implicit_metaphor to False and implicit_rule to ''
        updated: List[Dict[str, Any]] = [
            {
                **t,
                'is_implicit_metaphor': t.get('is_implicit_metaphor', False),
                'implicit_rule': t.get('implicit_rule', ''),
                'implicit_antecedent_start': None,
                'implicit_antecedent_end': None,
            }
            for t in tokens
        ]

        # Check whether any of the preceding `_CONTEXT_WINDOW` sentences
        # contain an is_metaphor=True VERB — needed for VPE rules.
        prior_token_lists = [s for s in result]  # already-processed sentences
        has_prior_mrw_verb = _has_mrw_verb_in_context(prior_token_lists)

        # Also allow the CURRENT sentence itself to supply the MRW verb
        # (handles intra-sentence "X *collapsed*, and so did Y").
        if not has_prior_mrw_verb:
            has_prior_mrw_verb = any(
                t.get('is_metaphor', False) and t.get('pos', '').upper() in _VERB_POS
                for t in tokens
            )

        # ── Apply rules and build rule→index map ─────────────────────────────
        vpe1 = set(_detect_vpe_trigger_rule(tokens, has_prior_mrw_verb))
        vpe2 = set(_detect_bare_vpe_rule(tokens, has_prior_mrw_verb))
        sub1_indices, sub1_antecedent_idx = _detect_single_antecedent_pronoun_rule(tokens)
        sub1 = set(sub1_indices)

        # Pre-compute VPE antecedent token (shared for all VPE-1 and VPE-2 tokens)
        vpe_antecedent: Optional[Dict[str, Any]] = None
        if vpe1 or vpe2:
            vpe_antecedent = _find_vpe_antecedent_token(tokens, prior_token_lists)

        # SUB-1 antecedent token
        sub1_antecedent: Optional[Dict[str, Any]] = None
        if sub1_antecedent_idx is not None and 0 <= sub1_antecedent_idx < len(tokens):
            sub1_antecedent = tokens[sub1_antecedent_idx]

        # Assign rule names (VPE-1 takes priority if a token is hit by both)
        rule_map: Dict[int, str] = {}
        for i in sub1:
            rule_map[i] = 'SUB-1'
        for i in vpe2:
            rule_map[i] = 'VPE-2'
        for i in vpe1:
            rule_map[i] = 'VPE-1'  # overrides VPE-2 if overlap

        for i, rule_name in rule_map.items():
            if 0 <= i < len(updated):
                updated[i]['is_implicit_metaphor'] = True
                updated[i]['implicit_rule'] = rule_name
                # Store antecedent character offsets for frontend relation arrows
                if rule_name in ('VPE-1', 'VPE-2') and vpe_antecedent:
                    updated[i]['implicit_antecedent_start'] = vpe_antecedent.get('start')
                    updated[i]['implicit_antecedent_end'] = vpe_antecedent.get('end')
                elif rule_name == 'SUB-1' and sub1_antecedent:
                    updated[i]['implicit_antecedent_start'] = sub1_antecedent.get('start')
                    updated[i]['implicit_antecedent_end'] = sub1_antecedent.get('end')

        result.append(updated)

    return result
