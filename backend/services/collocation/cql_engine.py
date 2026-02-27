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
class TokenPattern:
    """Represents a pattern for matching a single token"""
    conditions: List[TokenCondition] = field(default_factory=list)  # AND conditions
    or_conditions: List[List[TokenCondition]] = None  # OR groups
    is_any: bool = False  # [] matches any token
    min_count: int = 1   # For repetition {n} or {min,max}
    max_count: int = 1
    optional: bool = False  # For []?


@dataclass
class CQLQuery:
    """Represents a parsed CQL query"""
    patterns: List[TokenPattern]
    raw_query: str
    or_groups: List[List[TokenPattern]] = field(default_factory=list)  # Top-level OR alternatives


class CQLEngine:
    """
    CQL Query Engine for SpaCy-annotated corpus

    Supported attributes: word, lemma, pos, tag, dep, headword, headlemma, headpos, headdep

    Basic attributes:
    - word      Token text
    - lemma     Token lemma
    - pos       Universal POS tag
    - tag       Fine-grained POS tag
    - dep       Dependency relation label

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

    # Supported attributes (including head-based, and usas for semantic domain)
    ATTRIBUTES = {'word', 'lemma', 'pos', 'tag', 'dep', 'headword', 'headlemma', 'headpos', 'headdep', 'usas'}

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
            else:
                raise CQLParseError(f"Unexpected character at position {pos}: {query[pos]}")

        if not segments:
            raise CQLParseError("No valid patterns found in query")

        # Phase 2: Check if there are top-level OR operators
        has_or = any(s[0] == 'or' for s in segments)

        if not has_or:
            # No top-level OR -- backward compatible
            patterns = [s[1] for s in segments if s[0] == 'pattern']
            if not patterns:
                raise CQLParseError("No valid patterns found in query")
            return CQLQuery(patterns=patterns, raw_query=query)

        # Has top-level OR -- split into alternative groups
        or_groups = []
        current_group = []
        for seg_type, seg_value in segments:
            if seg_type == 'or':
                if current_group:
                    or_groups.append(current_group)
                    current_group = []
                # else: leading | or consecutive || -- skip gracefully
            else:
                current_group.append(seg_value)
        if current_group:
            or_groups.append(current_group)

        if not or_groups:
            raise CQLParseError("No valid patterns found in query")

        # If only one group after splitting (e.g., trailing |), treat as simple query
        if len(or_groups) == 1:
            return CQLQuery(patterns=or_groups[0], raw_query=query)

        return CQLQuery(
            patterns=or_groups[0],  # First alternative as default patterns
            raw_query=query,
            or_groups=or_groups
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
        # Find matching ]
        bracket_count = 1
        pos = start_pos + 1
        while pos < len(query) and bracket_count > 0:
            if query[pos] == '[':
                bracket_count += 1
            elif query[pos] == ']':
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

        # Empty brackets [] match any token
        if not content:
            return TokenPattern(
                conditions=[],
                is_any=True,
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
        # Get token value for attribute (usas attribute reads from usas_tag)
        if condition.attribute == 'usas':
            token_value = token.get('usas_tag', '') or ''
        else:
            token_value = token.get(condition.attribute, '')
        if token_value is None:
            token_value = ''

        # For usas: normalize by stripping _MWE so A1.5.1_MWE matches A1.5.1
        if condition.attribute == 'usas':
            token_value = (token_value or '').replace('_MWE', '')
            if condition.operator == '==':
                match = token_value == condition.value
            elif condition.operator == '!==':
                match = token_value != condition.value
            elif condition.operator == '=':
                # Contains: normalized tag starts with value or equals value
                match = token_value == condition.value or (
                    len(condition.value) > 0 and token_value.startswith(condition.value)
                )
            elif condition.operator == '!=':
                match = token_value != condition.value and not (
                    len(condition.value) > 0 and token_value.startswith(condition.value)
                )
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

        pos = 0
        while pos < n_tokens:
            # Try to match sequence starting at pos
            match_result = self._try_match_sequence(tokens, query.patterns, pos)

            if match_result:
                start_pos, end_pos, matched_tokens = match_result

                # Skip if matched only space/punct tokens (optional patterns)
                if not matched_tokens or all(t.get('is_space') or t.get('is_punct') for t in matched_tokens):
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
        matched_tokens = []
        current_pos = start_pos

        for pattern in patterns:
            if current_pos >= n_tokens:
                # End of tokens
                if pattern.min_count == 0 or pattern.optional:
                    continue
                return None

            # Handle repetition
            match_count = 0
            pattern_matches = []

            while (
                current_pos < n_tokens and
                match_count < pattern.max_count and
                self.match_token(tokens[current_pos], pattern)
            ):
                pattern_matches.append(tokens[current_pos])
                match_count += 1
                current_pos += 1

            if match_count < pattern.min_count:
                return None

            matched_tokens.extend(pattern_matches)

        if not matched_tokens:
            return None

        return start_pos, current_pos, matched_tokens

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
            return {
                'valid': True,
                'error': None,
                'pattern_count': pattern_count
            }
        except CQLParseError as e:
            return {'valid': False, 'error': str(e)}
        except Exception as e:
            return {'valid': False, 'error': f"Unexpected error: {str(e)}"}
