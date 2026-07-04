"""
CQL (Corpus Query Language) Engine
Implements CQL syntax for querying SpaCy-annotated corpus data
Based on Sketch Engine CQL documentation

Supported syntax:
- [attribute="value"]    Basic match (value is regex)
- [attribute=="value"]   Exact match (value is literal)
- [attribute!="value"]   Regex not match
- [attribute!=="value"]  Exact not match
- [pos="NOUN" & lemma="test"]  AND logic
- [pos="NOUN" | pos="VERB"]    OR logic (within token)
- [token1] | [token2]          OR logic (between tokens/sequences)
- [!pos="PUNCT"]         NOT prefix
- []                     Any token
- []{n}                  Exactly n any tokens
- []{min,max}            min to max any tokens
- []?                    Optional token (0 or 1)
- "word"                 Default attribute match

Quantifier semantics (2026-03, refined 2026-07):
- []{min,max}            Distance: skip min..max arbitrary tokens (sequence gap), same as before
- [x]{min,max} inside a multi-pattern sequence: consecutive repetition (standard CQL),
  e.g. [pos="ADJ"]{2}[pos="NOUN"] = exactly two adjectives then a noun; ? * + also work
- [x]{min,max} as the ONLY pattern (alone / within <s/> / containing): frequency filter —
  the token must occur min..max times in the document/span (kwic_service applies the count)
- <s/>{min,max}          Sentence span must repeat min..max times in the document (exact sentence string match)

Extended dependency syntax (2026-01):
- [dep="dobj"]           Match token with specific dependency relation
- [headword="make"]      Match token whose head has specific word
- [headlemma="make"]     Match token whose head has specific lemma
- [headpos="VERB"]       Match token whose head has specific POS
- [headdep="ROOT"]       Match token whose head has specific dep
"""

import re
import logging
from typing import List, Dict, Any, Optional, Tuple, Generator
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


class CQLParseError(Exception):
    """Exception raised for CQL parsing errors"""
    pass


@dataclass
class TokenCondition:
    """Represents a condition for a single token"""
    attribute: str  # word, lemma, pos, tag, dep
    value: str      # The value to match (can be regex)
    operator: str   # =, !=, ==, !==
    negated: bool = False  # For ! prefix


@dataclass
class WSCondition:
    """Word Sketch condition: ws(headword, relation, collocation)"""
    headword: str = ''
    relation: str = ''
    collocation: str = ''  # empty = any collocate


@dataclass
class TokenPattern:
    """Represents a pattern for matching a single token"""
    conditions: List[TokenCondition] = field(default_factory=list)  # AND conditions
    or_conditions: List[List[TokenCondition]] = None  # OR groups
    is_any: bool = False  # [] matches any token
    min_count: int = 1   # For repetition {n} or {min,max}
    max_count: int = 1
    optional: bool = False  # For []?
    ws_condition: Optional[WSCondition] = None  # ws() attribute


@dataclass
class CQLQuery:
    """Represents a parsed CQL query"""
    patterns: List[TokenPattern]
    raw_query: str
    or_groups: List[List[TokenPattern]] = field(default_factory=list)  # Top-level OR alternatives
    within_query: Optional['WithinQuery'] = None
    containing_query: Optional['ContainingQuery'] = None
    meet_query: Optional['MeetQuery'] = None
    structural_patterns: List = field(default_factory=list)  # StructuralPattern items
    # For standard query: order of 'pattern' and 'structural' segments (used for [lemma="make"] <s> vs <s> [lemma="make"])
    ordered_segments: List[Tuple[str, Any]] = field(default_factory=list)


@dataclass
class StructuralPattern:
    """Structural context marker: <s>, </s>, <s/>, <p>, <doc attr="..."> with optional {min,max} frequency filter."""
    tag: str                 # 's', 'p', 'doc'
    closing: bool = False    # True for </s>
    self_closing: bool = False  # True for <s/>
    attributes: str = ''     # raw attr string for <doc date="2010">
    min_count: int = 1       # for <s/>{min,max}: structure span repeats in doc within [min_count, max_count]
    max_count: int = 1


@dataclass
class WithinQuery:
    """P within Q: pattern P occurs within a span matched by Q"""
    left_patterns: List       # List of TokenPattern / StructuralPattern (before within)
    right_patterns: List      # List of TokenPattern / StructuralPattern (after within)
    negated: bool = False


@dataclass
class ContainingQuery:
    """C containing P: context C contains pattern P"""
    container_patterns: List  # before containing (often StructuralPattern)
    content_patterns: List    # after containing
    negated: bool = False


@dataclass
class MeetQuery:
    """(meet P Q -n m): P co-occurs with Q within left_dist..right_dist tokens"""
    pattern1: TokenPattern
    pattern2: TokenPattern
    left_dist: int    # negative, e.g. -3
    right_dist: int   # positive, e.g. 3
    min_count: int = 1  # frequency filter on meet matches within a document
    max_count: int = 1


class CQLEngine:
    """
    CQL Query Engine for SpaCy-annotated corpus

    Supported attributes: word, lemma, pos, tag, dep, headword, headlemma, headpos, headdep, usas, nrc, mipvu

    Basic attributes:
    - word      Token text
    - lemma     Token lemma
    - pos       Universal POS tag
    - tag       Fine-grained POS tag
    - dep       Dependency relation label
    - nrc       NRC emotion/sentiment labels (space-joined, e.g. "positive joy trust")
    - mipvu     MIPVU metaphor labels (space-joined subset of {indirect, direct, mflag}, or "none")

    Head-based attributes (for dependency constraints):
    - headword  Word text of the token's head
    - headlemma Lemma of the token's head
    - headpos   POS of the token's head
    - headdep   Dep relation of the token's head

    Operators:
    - =     Regex match (value treated as regex)
    - ==    Exact match (value treated as literal)
    - !=    Regex not match
    - !==   Exact not match

    Logic:
    - &     AND (all conditions must match)
    - |     OR (any condition must match, within or between tokens)
    - !     NOT prefix

    Repetition:
    - []        Any single token
    - []{n}     Exactly n tokens
    - []{m,n}   m to n tokens
    - []?       Optional (0 or 1)
    """

    # Supported attributes (including head-based, usas, nrc, mipvu, ws)
    ATTRIBUTES = {'word', 'lemma', 'pos', 'tag', 'dep', 'headword', 'headlemma', 'headpos', 'headdep', 'usas', 'nrc', 'mipvu', 'ws'}

    # Token pattern regex - matches [...] with optional {n} or {n,m} or ?
    TOKEN_PATTERN = re.compile(
        r'\[([^\]]*)\](\{(\d+)(?:,(\d+))?\}|\?)?|"([^"]+)"'
    )

    # Condition pattern regex - matches attribute operator "value"
    # Supports: word="value", word=="value", word!="value", word!=="value"
    CONDITION_PATTERN = re.compile(
        r'(!?)(\w+)\s*(===?|!==?|=)\s*"([^"]*)"'
    )

    def __init__(self, default_attribute: str = 'word'):
        """
        Initialize CQL engine

        Args:
            default_attribute: Default attribute for unqualified queries (e.g., "word" in "word")
        """
        self.default_attribute = default_attribute

    def parse(self, query: str) -> CQLQuery:
        """
        Parse a CQL query string, supporting top-level OR (|) between token sequences.

        Examples:
            [word=="make" & pos="VERB"] | [lemma="good"]
            [pos="NOUN"] [pos="VERB"] | [pos="ADJ"] [pos="NOUN"]

        Args:
            query: CQL query string

        Returns:
            Parsed CQL query object

        Raises:
            CQLParseError: If query is invalid
        """
        query = query.strip()
        if not query:
            raise CQLParseError("Empty query")

        # Phase 1: Parse all tokens and OR separators into a flat sequence
        segments = []  # List of ('pattern', TokenPattern) or ('or', None)
        pos = 0

        while pos < len(query):
            # Skip whitespace
            while pos < len(query) and query[pos].isspace():
                pos += 1

            if pos >= len(query):
                break

            if query[pos] == '[':
                pattern, end_pos = self._parse_token_pattern(query, pos)
                segments.append(('pattern', pattern))
                pos = end_pos
            elif query[pos] == '"':
                # Simple quoted string - default to word match
                try:
                    end_quote = query.index('"', pos + 1)
                except ValueError:
                    raise CQLParseError(f"Unclosed quote at position {pos}")

                word = query[pos + 1:end_quote]
                pattern = TokenPattern(
                    conditions=[TokenCondition(
                        attribute=self.default_attribute,
                        value=word,
                        operator='='
                    )]
                )
                segments.append(('pattern', pattern))
                pos = end_quote + 1
            elif query[pos] == '|':
                segments.append(('or', None))
                pos += 1
            elif query[pos] == '<':
                # Structural marker: <s>, </s>, <s/>, <p>, <doc ...>
                sp, end_pos = self._parse_structural_marker(query, pos)
                segments.append(('structural', sp))
                pos = end_pos
            elif query[pos] == '(':
                # Meet expression: (meet P Q -n m)
                rest = query[pos:]
                if rest.startswith('(meet ') or rest.startswith('(meet\t'):
                    mq, end_pos = self._parse_meet_expression(query, pos)
                    segments.append(('meet', mq))
                    pos = end_pos
                else:
                    raise CQLParseError(f"Unexpected '(' at position {pos}")
            elif query[pos] == '!':
                # !within or !containing
                rest = query[pos:]
                if rest.startswith('!within'):
                    segments.append(('not_within', None))
                    pos += len('!within')
                elif rest.startswith('!containing'):
                    segments.append(('not_containing', None))
                    pos += len('!containing')
                else:
                    raise CQLParseError(f"Unexpected '!' at position {pos}")
            elif query[pos:pos+7] == 'within ' or query[pos:pos+7] == 'within\t' or query[pos:] == 'within':
                segments.append(('within', None))
                pos += len('within')
            elif query[pos:pos+11] == 'containing ' or query[pos:pos+11] == 'containing\t' or query[pos:] == 'containing':
                segments.append(('containing', None))
                pos += len('containing')
            else:
                raise CQLParseError(f"Unexpected character at position {pos}: {query[pos]}")

        if not segments:
            raise CQLParseError("No valid patterns found in query")

        # Phase 2: Build the appropriate query object from segments
        seg_types = [s[0] for s in segments]

        # --- Meet query: single (meet P Q -n m) segment ---
        if len(segments) == 1 and seg_types[0] == 'meet':
            return CQLQuery(
                patterns=[],
                raw_query=query,
                meet_query=segments[0][1]
            )

        # --- Within / !Within query ---
        within_idx = next((i for i, t in enumerate(seg_types) if t in ('within', 'not_within')), -1)
        if within_idx >= 0:
            negated = seg_types[within_idx] == 'not_within'
            left = [v for _, v in segments[:within_idx] if v is not None]
            right = [v for _, v in segments[within_idx + 1:] if v is not None]
            token_patterns = [v for t, v in segments if t == 'pattern']
            struct_patterns = [v for t, v in segments if t == 'structural']
            return CQLQuery(
                patterns=token_patterns,
                raw_query=query,
                within_query=WithinQuery(left_patterns=left, right_patterns=right, negated=negated),
                structural_patterns=struct_patterns
            )

        # --- Containing / !Containing query ---
        cont_idx = next((i for i, t in enumerate(seg_types) if t in ('containing', 'not_containing')), -1)
        if cont_idx >= 0:
            negated = seg_types[cont_idx] == 'not_containing'
            container = [v for _, v in segments[:cont_idx] if v is not None]
            content = [v for _, v in segments[cont_idx + 1:] if v is not None]
            token_patterns = [v for t, v in segments if t == 'pattern']
            struct_patterns = [v for t, v in segments if t == 'structural']
            return CQLQuery(
                patterns=token_patterns,
                raw_query=query,
                containing_query=ContainingQuery(
                    container_patterns=container, content_patterns=content, negated=negated
                ),
                structural_patterns=struct_patterns
            )

        # --- Standard query (OR or plain) ---
        has_or = 'or' in seg_types
        struct_patterns = [v for t, v in segments if t == 'structural']
        ordered_segments = [(t, v) for t, v in segments if t in ('pattern', 'structural')]

        if not has_or:
            patterns = [v for t, v in segments if t == 'pattern']
            if not patterns and not struct_patterns:
                raise CQLParseError("No valid patterns found in query")
            return CQLQuery(
                patterns=patterns,
                raw_query=query,
                structural_patterns=struct_patterns,
                ordered_segments=ordered_segments
            )

        # Has top-level OR -- split into alternative groups
        or_groups = []
        current_group = []
        for seg_type, seg_value in segments:
            if seg_type == 'or':
                if current_group:
                    or_groups.append(current_group)
                    current_group = []
            elif seg_type == 'pattern':
                current_group.append(seg_value)
        if current_group:
            or_groups.append(current_group)

        if not or_groups:
            raise CQLParseError("No valid patterns found in query")

        if len(or_groups) == 1:
            return CQLQuery(
                patterns=or_groups[0],
                raw_query=query,
                structural_patterns=struct_patterns,
                ordered_segments=ordered_segments
            )

        return CQLQuery(
            patterns=or_groups[0],
            raw_query=query,
            or_groups=or_groups,
            structural_patterns=struct_patterns,
            ordered_segments=ordered_segments
        )

    def _parse_token_pattern(self, query: str, start_pos: int) -> Tuple[TokenPattern, int]:
        """
        Parse a single token pattern [...]

        Args:
            query: Full query string
            start_pos: Starting position (at '[')

        Returns:
            Tuple of (TokenPattern, end_position)
        """
        # Find matching ] (quote-aware: brackets inside "..." values, e.g. regex
        # character classes like [word="[A-Z].*"] or literal "]"s, are ignored)
        bracket_count = 1
        pos = start_pos + 1
        in_quotes = False
        while pos < len(query) and bracket_count > 0:
            char = query[pos]
            if char == '"':
                in_quotes = not in_quotes
            elif not in_quotes:
                if char == '[':
                    bracket_count += 1
                elif char == ']':
                    bracket_count -= 1
            pos += 1

        if bracket_count != 0:
            raise CQLParseError(f"Unmatched bracket at position {start_pos}")

        content = query[start_pos + 1:pos - 1].strip()
        end_pos = pos

        # Check for repetition modifier {n} or {min,max} or ?
        min_count = 1
        max_count = 1
        optional = False

        if end_pos < len(query):
            if query[end_pos] == '{':
                # Parse repetition
                try:
                    rep_end = query.index('}', end_pos)
                    rep_content = query[end_pos + 1:rep_end]
                    if ',' in rep_content:
                        parts = rep_content.split(',')
                        min_count = int(parts[0].strip()) if parts[0].strip() else 0
                        max_count = int(parts[1].strip()) if parts[1].strip() else 100
                    else:
                        min_count = max_count = int(rep_content.strip())
                    end_pos = rep_end + 1
                except (ValueError, IndexError) as e:
                    raise CQLParseError(f"Invalid repetition syntax at position {end_pos}")
            elif query[end_pos] == '?':
                optional = True
                min_count = 0
                max_count = 1
                end_pos += 1
            elif query[end_pos] == '*':
                min_count = 0
                max_count = 100
                end_pos += 1
            elif query[end_pos] == '+':
                min_count = 1
                max_count = 100
                end_pos += 1

        # Empty brackets [] match any token
        if not content:
            return TokenPattern(
                conditions=[],
                is_any=True,
                min_count=min_count,
                max_count=max_count,
                optional=optional
            ), end_pos

        # ws() attribute: [ws(headword,relation,collocation)]
        if content.startswith('ws(') and content.endswith(')'):
            inner = content[3:-1]
            parts = inner.split(',', 2)
            headword = parts[0].strip() if len(parts) > 0 else ''
            relation = parts[1].strip() if len(parts) > 1 else ''
            collocation = parts[2].strip() if len(parts) > 2 else ''
            return TokenPattern(
                ws_condition=WSCondition(headword=headword, relation=relation, collocation=collocation),
                min_count=min_count,
                max_count=max_count,
                optional=optional
            ), end_pos

        # Parse conditions
        conditions, or_conditions = self._parse_conditions(content)

        return TokenPattern(
            conditions=conditions,
            or_conditions=or_conditions,
            min_count=min_count,
            max_count=max_count,
            optional=optional
        ), end_pos

    def _parse_conditions(self, content: str) -> Tuple[List[TokenCondition], List[List[TokenCondition]]]:
        """
        Parse conditions inside brackets

        Args:
            content: Content between brackets

        Returns:
            Tuple of (AND conditions, OR condition groups)
        """
        and_conditions = []
        or_groups = []

        # Split by | for OR (but not inside quotes)
        or_parts = self._split_by_operator(content, '|')

        if len(or_parts) > 1:
            # Has OR conditions
            for part in or_parts:
                part_conditions = self._parse_and_conditions(part.strip())
                if part_conditions:
                    or_groups.append(part_conditions)
            return [], or_groups
        else:
            # Only AND conditions
            and_conditions = self._parse_and_conditions(content)
            return and_conditions, None

    def _parse_and_conditions(self, content: str) -> List[TokenCondition]:
        """
        Parse AND conditions (separated by &)

        Args:
            content: Content with AND conditions

        Returns:
            List of TokenCondition objects
        """
        conditions = []
        parts = self._split_by_operator(content, '&')

        for part in parts:
            part = part.strip()
            if not part:
                continue

            # Check for negation prefix
            negated = False
            if part.startswith('!') and not part.startswith('!=') and not part.startswith('!=='):
                negated = True
                part = part[1:].strip()
                # Remove parentheses if present
                if part.startswith('(') and part.endswith(')'):
                    part = part[1:-1].strip()

            # Parse condition
            condition = self._parse_single_condition(part, negated)
            if condition:
                conditions.append(condition)

        return conditions

    def _parse_single_condition(self, part: str, negated: bool = False) -> Optional[TokenCondition]:
        """
        Parse a single condition like pos="NOUN"

        Args:
            part: Condition string
            negated: Whether condition is negated

        Returns:
            TokenCondition object or None
        """
        # Match pattern: attribute operator "value"
        match = self.CONDITION_PATTERN.match(part)
        if not match:
            # Try simple value (no attribute)
            if part.startswith('"') and part.endswith('"'):
                value = part[1:-1]
                return TokenCondition(
                    attribute=self.default_attribute,
                    value=value,
                    operator='=',
                    negated=negated
                )
            raise CQLParseError(f"Invalid condition: {part}")

        # Strict: the condition must consume the whole part. Otherwise e.g.
        # [word="dog" pos="NOUN"] (missing &) would silently drop pos="NOUN".
        if part[match.end():].strip():
            raise CQLParseError(
                f"Invalid condition: {part} "
                f"(unexpected trailing content: {part[match.end():].strip()!r}; "
                f"did you forget '&' or '|' between conditions?)"
            )

        prefix_neg, attribute, operator, value = match.groups()

        # Combine negation from prefix and from operator
        if prefix_neg == '!':
            negated = not negated

        # Validate attribute
        if attribute not in self.ATTRIBUTES:
            raise CQLParseError(f"Unknown attribute: {attribute}. Valid attributes: {', '.join(self.ATTRIBUTES)}")

        return TokenCondition(
            attribute=attribute,
            value=value,
            operator=operator,
            negated=negated
        )

    def _split_by_operator(self, content: str, operator: str) -> List[str]:
        """
        Split content by operator, respecting quotes

        Args:
            content: Content to split
            operator: Operator character

        Returns:
            List of parts
        """
        parts = []
        current = []
        in_quotes = False
        paren_depth = 0

        for char in content:
            if char == '"':
                in_quotes = not in_quotes
                current.append(char)
            elif char == '(':
                paren_depth += 1
                current.append(char)
            elif char == ')':
                paren_depth -= 1
                current.append(char)
            elif char == operator and not in_quotes and paren_depth == 0:
                parts.append(''.join(current))
                current = []
            else:
                current.append(char)

        if current:
            parts.append(''.join(current))

        return parts

    def match_token(self, token: Dict[str, Any], pattern: TokenPattern) -> bool:
        """
        Check if a token matches a pattern

        Args:
            token: Token dictionary with word, lemma, pos, tag, dep keys
            pattern: Pattern to match against

        Returns:
            True if token matches pattern
        """
        if pattern.is_any:
            return True

        # Check ws() condition
        if pattern.ws_condition is not None:
            return self._match_ws_condition(token, pattern.ws_condition)

        # Check OR conditions first
        if pattern.or_conditions:
            for or_group in pattern.or_conditions:
                if self._match_all_conditions(token, or_group):
                    return True
            return False

        # Check AND conditions
        result = self._match_all_conditions(token, pattern.conditions)

        return result

    def _match_all_conditions(self, token: Dict[str, Any], conditions: List[TokenCondition]) -> bool:
        """
        Check if token matches all conditions (AND logic)

        Args:
            token: Token dictionary
            conditions: List of conditions

        Returns:
            True if all conditions match
        """
        for condition in conditions:
            if not self._match_condition(token, condition):
                return False
        return True

    def _match_condition(self, token: Dict[str, Any], condition: TokenCondition) -> bool:
        """
        Check if token matches a single condition

        Args:
            token: Token dictionary
            condition: Condition to check

        Returns:
            True if condition matches
        """
        # Get token value for attribute
        # usas reads from usas_tag; nrc reads from nrc_tag; mipvu reads from mipvu_tag
        if condition.attribute == 'usas':
            token_value = token.get('usas_tag', '') or ''
        elif condition.attribute == 'nrc':
            token_value = token.get('nrc_tag', '') or ''
        elif condition.attribute == 'mipvu':
            token_value = token.get('mipvu_tag', 'none') or 'none'
        else:
            token_value = token.get(condition.attribute, '')
        if token_value is None:
            token_value = ''

        # For mipvu: match against space-separated MIPVU labels {indirect, direct, mflag, none}
        if condition.attribute == 'mipvu':
            mipvu_labels = set(token_value.split()) if token_value else {'none'}
            if condition.operator in ('==', '='):
                match = condition.value.lower() in mipvu_labels
            elif condition.operator in ('!==', '!='):
                match = condition.value.lower() not in mipvu_labels
            else:
                match = False
            if condition.negated:
                match = not match
            return match

        # For nrc: match against space-separated emotion/polarity labels
        if condition.attribute == 'nrc':
            nrc_labels = set(token_value.split()) if token_value else set()
            if condition.operator == '==':
                match = condition.value in nrc_labels
            elif condition.operator == '!==':
                match = condition.value not in nrc_labels
            elif condition.operator == '=':
                try:
                    match = any(bool(re.fullmatch(condition.value, lbl, re.IGNORECASE)) for lbl in nrc_labels)
                except re.error:
                    match = condition.value in nrc_labels
            elif condition.operator == '!=':
                try:
                    match = not any(bool(re.fullmatch(condition.value, lbl, re.IGNORECASE)) for lbl in nrc_labels)
                except re.error:
                    match = condition.value not in nrc_labels
            else:
                match = False
            if condition.negated:
                match = not match
            return match

        # For usas: normalize by stripping _MWE so A1.5.1_MWE matches A1.5.1
        # When disambiguation is off, tokens have multiple tags in usas_tags; check ALL
        if condition.attribute == 'usas':
            # Build list of tags to check (all tags for multi-tag tokens)
            usas_tags = token.get('usas_tags', [])
            primary_tag = (token_value or '').replace('_MWE', '')
            if usas_tags and len(usas_tags) > 1:
                tags_to_check = [(t or '').replace('_MWE', '') for t in usas_tags]
            else:
                tags_to_check = [primary_tag]

            def _usas_tag_matches(tv: str, val: str, exact: bool) -> bool:
                """
                Check whether a single normalised USAS tag `tv` matches `val`.

                exact=True  (== / !==): strict string equality only.
                exact=False (=  / != ):
                  1. Try re.fullmatch(val, tv) so that patterns like "A.*", "E[0-9].*"
                     or "A.*|E.*" work as expected.
                  2. Fall back to str.startswith(val) so bare prefixes like "A1"
                     still match "A1.1", "A1.5+", etc. (backward-compatible behaviour).
                """
                if exact:
                    return tv == val
                # --- regex attempt ---
                try:
                    if re.fullmatch(val, tv):
                        return True
                except re.error:
                    pass
                # --- prefix fallback ---
                return len(val) > 0 and tv.startswith(val)

            if condition.operator in ('==', '='):
                # Positive match: ANY tag matches -> True
                exact = condition.operator == '=='
                match = any(_usas_tag_matches(tv, condition.value, exact) for tv in tags_to_check)
            elif condition.operator in ('!==', '!='):
                # Negative match: ALL tags must fail -> True (token does NOT belong to domain)
                exact = condition.operator == '!=='
                match = not any(_usas_tag_matches(tv, condition.value, exact) for tv in tags_to_check)
            else:
                match = False
        else:
            # Handle different operators for other attributes
            if condition.operator == '==':
                match = token_value.lower() == condition.value.lower()
            elif condition.operator == '!==':
                match = token_value.lower() != condition.value.lower()
            elif condition.operator == '=':
                try:
                    match = bool(re.fullmatch(condition.value, token_value, re.IGNORECASE))
                except re.error:
                    match = token_value.lower() == condition.value.lower()
            elif condition.operator == '!=':
                try:
                    match = not bool(re.fullmatch(condition.value, token_value, re.IGNORECASE))
                except re.error:
                    match = token_value.lower() != condition.value.lower()
            else:
                match = False

        # Apply negation
        if condition.negated:
            match = not match

        return match

    def find_matches(
        self,
        tokens: List[Dict[str, Any]],
        query: CQLQuery,
        context_size: int = 5
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Find all matches of a CQL query in a token list.
        Supports top-level OR: tries each alternative and deduplicates by position.

        Args:
            tokens: List of token dictionaries
            query: Parsed CQL query
            context_size: Number of context tokens on each side

        Yields:
            Match dictionaries with position, matched_tokens, left_context, right_context
        """
        if query.or_groups:
            # OR query: try each alternative, deduplicate by position
            seen_positions = set()
            for alt_patterns in query.or_groups:
                alt_query = CQLQuery(patterns=alt_patterns, raw_query=query.raw_query)
                for match in self._find_matches_simple(tokens, alt_query, context_size):
                    pos_key = (match['position'], match['end_position'])
                    if pos_key not in seen_positions:
                        seen_positions.add(pos_key)
                        yield match
        else:
            yield from self._find_matches_simple(tokens, query, context_size)

    def _find_matches_simple(
        self,
        tokens: List[Dict[str, Any]],
        query: CQLQuery,
        context_size: int = 5
    ) -> Generator[Dict[str, Any], None, None]:
        """
        Find all matches of a simple (non-OR) CQL query in a token list.

        Args:
            tokens: List of token dictionaries
            query: Parsed CQL query (without top-level OR)
            context_size: Number of context tokens on each side

        Yields:
            Match dictionaries with position, matched_tokens, left_context, right_context
        """
        n_tokens = len(tokens)

        # Punct-only matches are noise when every pattern is an any-token []
        # (e.g. optional fillers landing on stray punctuation), but they are the
        # whole point of explicit queries like [pos="PUNCT"] or [word=","] —
        # only discard them for all-any pattern sequences.
        all_any = all(p.is_any for p in query.patterns)

        pos = 0
        while pos < n_tokens:
            # Try to match sequence starting at pos
            match_result = self._try_match_sequence(tokens, query.patterns, pos)

            if match_result:
                start_pos, end_pos, matched_tokens = match_result

                # Skip empty / all-space matches; punct-only only for all-any queries
                if not matched_tokens or all(t.get('is_space') for t in matched_tokens):
                    pos += 1
                    continue
                if all_any and all(t.get('is_space') or t.get('is_punct') for t in matched_tokens):
                    pos += 1
                    continue

                # Extract context (skip space tokens in context)
                left_context = []
                for i in range(start_pos - 1, max(0, start_pos - context_size * 2) - 1, -1):
                    if i < 0:
                        break
                    if not tokens[i].get('is_space'):
                        left_context.insert(0, tokens[i])
                    if len(left_context) >= context_size:
                        break

                right_context = []
                for i in range(end_pos, min(n_tokens, end_pos + context_size * 2)):
                    if not tokens[i].get('is_space'):
                        right_context.append(tokens[i])
                    if len(right_context) >= context_size:
                        break

                yield {
                    'position': start_pos,
                    'end_position': end_pos,
                    'matched_tokens': matched_tokens,
                    'left_context': left_context,
                    'right_context': right_context
                }

                pos = start_pos + 1  # Move to next position for overlapping matches
            else:
                pos += 1

    def _try_match_sequence(
        self,
        tokens: List[Dict[str, Any]],
        patterns: List[TokenPattern],
        start_pos: int
    ) -> Optional[Tuple[int, int, List[Dict[str, Any]]]]:
        """
        Try to match a sequence of patterns starting at position

        Args:
            tokens: Token list
            patterns: Pattern list
            start_pos: Starting position

        Returns:
            Tuple of (start_pos, end_pos, matched_tokens) or None
        """
        n_tokens = len(tokens)

        if not patterns:
            return (start_pos, start_pos, [])

        # Unified backtracking matcher: every pattern (any-token [] or
        # conditioned [pos="ADJ"]) honours its own {min,max} / ? / * / +
        # quantifier. Ordering convention:
        #   - patterns follow → try minimal first (non-greedy), so e.g.
        #     <s> []{1,2} [lemma="make"] takes 1 filler then "make";
        #   - last pattern → try maximal first (greedy), so e.g.
        #     []{1,2} </s> consumes 2 tokens ending at the span boundary.
        pattern = patterns[0]
        rest_patterns = patterns[1:]
        eff_min, eff_max = pattern.min_count, pattern.max_count

        hi = min(eff_max, n_tokens - start_pos)
        if hi < 0:
            hi = 0
        if eff_min > hi:
            return None

        order = range(eff_min, hi + 1) if rest_patterns else range(hi, eff_min - 1, -1)
        for target_count in order:
            take = tokens[start_pos:start_pos + target_count]
            if not all(self.match_token(t, pattern) for t in take):
                continue
            rest = self._try_match_sequence(tokens, rest_patterns, start_pos + target_count)
            if rest is not None:
                # Empty totals are filtered by callers (_find_matches_simple);
                # rejecting here would break suffixes like [pos="NOUN"] []? at text end.
                return (start_pos, rest[1], take + rest[2])
        return None

    def _pattern_sequence_length_range(self, patterns: List[TokenPattern]) -> Tuple[int, int]:
        """Return (min_total, max_total) token length for the pattern sequence.
        Quantifiers apply to conditioned tokens too, matching _try_match_sequence."""
        min_total, max_total = 0, 0
        for p in patterns:
            min_total += p.min_count
            max_total += p.max_count
        return (min_total, max_total)

    def try_match_sequence_ending_at(
        self,
        tokens: List[Dict[str, Any]],
        patterns: List[TokenPattern],
        end_pos: int
    ) -> Optional[Tuple[int, int, List[Dict[str, Any]]]]:
        """Try to match the pattern sequence so that the match ends at end_pos (exclusive).
        Tries start positions from end_pos - max_len to end_pos - min_len.
        Returns (start_pos, end_pos, matched_tokens) or None.
        """
        min_len, max_len = self._pattern_sequence_length_range(patterns)
        for start in range(end_pos - max_len, end_pos - min_len + 1):
            if start < 0:
                continue
            res = self._try_match_sequence(tokens, patterns, start)
            if res is not None and res[1] == end_pos:
                return res
        return None

    def _match_ws_condition(self, token: Dict[str, Any], ws: WSCondition) -> bool:
        """
        Match a ws(headword, relation, collocation) condition using dependency info.

        - headword: center word (lemma of head or of token depending on direction)
        - collocation: collocate word (lemma of the other side)
        - relation: grammar relation name; we look up dep_patterns with direction.

        direction=child: matched token is the collocate (child of headword).
          token.lemma==collocation, token.headlemma==headword, token.dep in child_deps.
        direction=parent: matched token is the headword (child of collocate).
          token.lemma==headword, token.headlemma==collocation, token.dep in parent_deps.
        If relation has both directions (e.g. and_or), either match is accepted.
        """
        child_deps, parent_deps, collocate_pos = self._get_ws_relation_deps(ws.relation)
        token_lemma = (token.get('lemma') or '').lower()
        head_lemma = (token.get('headlemma') or token.get('head_lemma') or '').lower()
        dep = (token.get('dep') or '').lower()
        token_pos = (token.get('pos') or '').strip()

        # direction=child: token is collocate, head is headword
        def match_child() -> bool:
            if ws.collocation and token_lemma != ws.collocation.lower():
                return False
            if ws.headword and head_lemma != ws.headword.lower():
                return False
            if child_deps and dep not in child_deps:
                return False
            # When collocation is empty, treat ws(...,relation,) as \"all collocates\" and
            # do not restrict by collocate_pos. POS filter only applies when a specific
            # collocation lemma is requested.
            if ws.collocation and collocate_pos and token_pos and token_pos not in collocate_pos:
                return False
            return True

        # direction=parent: token is headword, head is collocate
        def match_parent() -> bool:
            if ws.headword and token_lemma != ws.headword.lower():
                return False
            if ws.collocation and head_lemma != ws.collocation.lower():
                return False
            if parent_deps and dep not in parent_deps:
                return False
            return True

        if ws.relation and not child_deps and not parent_deps:
            # Unknown relation: fallback to direct dep string match (single interpretation)
            if dep != ws.relation.lower():
                return False
            if ws.collocation and token_lemma != ws.collocation.lower():
                return False
            if ws.headword and head_lemma != ws.headword.lower():
                return False
            return True

        # If no headword/collocation given, require at least dep match from one direction
        if not ws.headword and not ws.collocation:
            if child_deps and dep in child_deps:
                return True
            if parent_deps and dep in parent_deps:
                return True
            return False

        if child_deps and match_child():
            return True
        if parent_deps and match_parent():
            return True
        return False

    def _get_ws_relation_deps(
        self, relation: str
    ) -> Tuple[List[str], List[str], List[str]]:
        """
        Look up dep_patterns for a Word Sketch relation name.
        Returns (child_dep_list, parent_dep_list, collocate_pos_list).
        child: center is head, collocate is child → match token with headlemma=center.
        parent: center is child, collocate is head → match token with lemma=center, headlemma=collocate.
        """
        child_deps: List[str] = []
        parent_deps: List[str] = []
        collocate_pos: List[str] = []
        try:
            try:
                from backend.services.sketch_grammar.grammar_patterns import (
                    VERB_RELATIONS,
                    NOUN_RELATIONS,
                    ADJECTIVE_RELATIONS,
                    ADVERB_RELATIONS,
                )
            except ImportError:
                from services.sketch_grammar.grammar_patterns import (
                    VERB_RELATIONS,
                    NOUN_RELATIONS,
                    ADJECTIVE_RELATIONS,
                    ADVERB_RELATIONS,
                )
            all_patterns = (
                VERB_RELATIONS
                + NOUN_RELATIONS
                + ADJECTIVE_RELATIONS
                + ADVERB_RELATIONS
            )
            for gp in all_patterns:
                if gp.name != relation:
                    continue
                for p in gp.dep_patterns:
                    if isinstance(p, dict):
                        d = (p.get("dep") or "").strip().lower()
                        direction = (p.get("direction") or "").strip().lower()
                        if d:
                            if direction == "child":
                                child_deps.append(d)
                            else:
                                parent_deps.append(d)
                if gp.collocate_pos:
                    collocate_pos = [str(x).strip() for x in gp.collocate_pos if x]
                break
        except ImportError:
            pass
        return (child_deps, parent_deps, collocate_pos)

    def _parse_structural_marker(self, query: str, start_pos: int) -> Tuple[StructuralPattern, int]:
        """
        Parse a structural marker: <s>, </s>, <s/>, <p>, <doc attr="...">
        """
        pos = start_pos + 1  # skip <

        closing = False
        if pos < len(query) and query[pos] == '/':
            closing = True
            pos += 1

        # Read tag name
        tag_start = pos
        while pos < len(query) and query[pos].isalpha():
            pos += 1
        tag = query[tag_start:pos]
        if not tag:
            raise CQLParseError(f"Empty structural tag at position {start_pos}")

        # Skip whitespace
        while pos < len(query) and query[pos].isspace():
            pos += 1

        self_closing = False
        attributes = ''

        if pos < len(query) and query[pos] == '/':
            # Self-closing: <s/>
            self_closing = True
            pos += 1
        elif pos < len(query) and query[pos] != '>':
            # Attributes: read until >
            attr_start = pos
            while pos < len(query) and query[pos] != '>':
                pos += 1
            attributes = query[attr_start:pos].strip()

        if pos >= len(query) or query[pos] != '>':
            raise CQLParseError(f"Unclosed structural marker at position {start_pos}")
        pos += 1  # skip >

        # Optional quantifier: <s>{n} or <s>{min,max}
        min_count, max_count = 1, 1
        while pos < len(query) and query[pos].isspace():
            pos += 1
        if pos < len(query) and query[pos] == '{':
            try:
                rep_end = query.index('}', pos)
                rep_content = query[pos + 1:rep_end].strip()
                if ',' in rep_content:
                    parts = rep_content.split(',', 1)
                    min_count = int(parts[0].strip()) if parts[0].strip() else 1
                    max_count = int(parts[1].strip()) if parts[1].strip() else 100
                else:
                    min_count = max_count = int(rep_content.strip())
                pos = rep_end + 1
            except (ValueError, IndexError):
                raise CQLParseError(f"Invalid structural quantifier at position {pos}")

        return StructuralPattern(
            tag=tag, closing=closing, self_closing=self_closing, attributes=attributes,
            min_count=min_count, max_count=max_count
        ), pos

    def _parse_meet_expression(self, query: str, start_pos: int) -> Tuple[MeetQuery, int]:
        """
        Parse a meet expression: (meet P Q -n m)
        """
        pos = start_pos + 1  # skip (

        # Skip 'meet' keyword
        pos += 4  # len('meet')

        # Skip whitespace
        while pos < len(query) and query[pos].isspace():
            pos += 1

        # Parse pattern 1
        if pos >= len(query) or query[pos] != '[':
            raise CQLParseError(f"Expected '[' for meet pattern 1 at position {pos}")
        p1, pos = self._parse_token_pattern(query, pos)

        # Skip whitespace
        while pos < len(query) and query[pos].isspace():
            pos += 1

        # Parse pattern 2
        if pos >= len(query) or query[pos] != '[':
            raise CQLParseError(f"Expected '[' for meet pattern 2 at position {pos}")
        p2, pos = self._parse_token_pattern(query, pos)

        # Skip whitespace
        while pos < len(query) and query[pos].isspace():
            pos += 1

        # Parse left distance (may be negative)
        num_start = pos
        if pos < len(query) and query[pos] == '-':
            pos += 1
        while pos < len(query) and query[pos].isdigit():
            pos += 1
        try:
            left_dist = int(query[num_start:pos])
        except ValueError:
            raise CQLParseError(f"Invalid left distance in meet expression at position {num_start}")

        # Skip whitespace
        while pos < len(query) and query[pos].isspace():
            pos += 1

        # Parse right distance (positive)
        num_start = pos
        while pos < len(query) and query[pos].isdigit():
            pos += 1
        try:
            right_dist = int(query[num_start:pos])
        except ValueError:
            raise CQLParseError(f"Invalid right distance in meet expression at position {num_start}")

        # Skip whitespace and expect )
        while pos < len(query) and query[pos].isspace():
            pos += 1

        if pos >= len(query) or query[pos] != ')':
            raise CQLParseError(f"Expected ')' to close meet expression at position {pos}")
        pos += 1

        # Optional quantifier suffix: (meet ...){n} or {min,max}
        min_count, max_count = 1, 1
        while pos < len(query) and query[pos].isspace():
            pos += 1
        if pos < len(query) and query[pos] == '{':
            try:
                rep_end = query.index('}', pos)
                rep_content = query[pos + 1:rep_end].strip()
                if ',' in rep_content:
                    parts = rep_content.split(',', 1)
                    min_count = int(parts[0].strip()) if parts[0].strip() else 0
                    max_count = int(parts[1].strip()) if parts[1].strip() else 100
                else:
                    min_count = max_count = int(rep_content.strip())
                pos = rep_end + 1
            except (ValueError, IndexError):
                raise CQLParseError(f"Invalid meet quantifier at position {pos}")

        return MeetQuery(
            pattern1=p1, pattern2=p2, left_dist=left_dist, right_dist=right_dist,
            min_count=min_count, max_count=max_count
        ), pos

    def validate_query(self, query: str) -> Dict[str, Any]:
        """
        Validate a CQL query without executing it

        Args:
            query: CQL query string

        Returns:
            Dictionary with 'valid' boolean and 'error' message if invalid
        """
        try:
            parsed = self.parse(query)
            # Return some info about the parsed query
            pattern_count = len(parsed.patterns)
            if parsed.or_groups:
                pattern_count = sum(len(g) for g in parsed.or_groups)
            if parsed.meet_query:
                pattern_count = 2
            query_type = (
                'within' if parsed.within_query and not parsed.within_query.negated else
                'not_within' if parsed.within_query else
                'containing' if parsed.containing_query and not parsed.containing_query.negated else
                'not_containing' if parsed.containing_query else
                'meet' if parsed.meet_query else
                'or' if parsed.or_groups else
                'standard'
            )
            return {
                'valid': True,
                'error': None,
                'pattern_count': pattern_count,
                'query_type': query_type
            }
        except CQLParseError as e:
            return {'valid': False, 'error': str(e)}
        except Exception as e:
            return {'valid': False, 'error': f"Unexpected error: {str(e)}"}
