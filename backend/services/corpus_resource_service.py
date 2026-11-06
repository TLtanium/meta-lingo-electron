"""
Corpus Resource Service
Provides access to pre-built corpus frequency CSV files for reference corpus comparison
"""

import os
import re
import csv
import json
import logging
from typing import List, Dict, Any, Optional, Set, Tuple
from pathlib import Path
from functools import lru_cache

from services.usas.disambiguator import parse_compound_tag
from services.corpus_resource_csv import parse_frequency_csv

logger = logging.getLogger(__name__)

# Base codes starting with these uppercase letters are excluded from reference/study domain lists (per USAS spec)
USAS_EXCLUDED_BASE_PREFIXES = frozenset('DJRUV')


def normalize_usas_domain_to_base(tag: str) -> str:
    """
    Normalize a USAS domain tag to its base form for comparison with corpus resource reference data.
    All suffix variants (e.g. A2.1+, A2.1mf, A2.1_MWE) map to the same base (A2.1) so reference
    frequency is looked up against the aggregated reference count for that base.
    Suffixes stripped (and trailing lowercase ignored) include: _MWE, gender (m/f/n/c), idiom (i),
    polarity (+/-), slash (/), rarity (%, @), bracket [i]. Items whose base starts with D, J, R, U, V
    are filtered out (empty string returned).
    """
    if not tag or not tag.strip():
        return ''
    s = (tag or '').strip()
    # Strip _MWE
    s = s.replace('_MWE', '')
    # Take first segment if compound (e.g. F2/O2 -> F2)
    if '/' in s:
        s = s.split('/')[0].strip()
    # Strip trailing lowercase letters (all)
    s = re.sub(r'[a-z]+$', '', s)
    # Strip trailing polarity/rarity/slash: +, -, /, %, @ (any combination)
    s = re.sub(r'[-+\/%@]+$', '', s)
    # Strip trailing bracket tag e.g. [i]
    s = re.sub(r'\[[^\]]*\]$', '', s)
    s = s.strip()
    if not s:
        return ''
    # Filter out bases starting with D, J, R, U, V (uppercase)
    if s[0].upper() in USAS_EXCLUDED_BASE_PREFIXES:
        return ''
    return s


class CorpusResourceService:
    """Service for managing and accessing corpus resource CSV files"""

    def __init__(self, corpus_dir: Optional[Path] = None):
        from services.user_resource_store import resource_root
        self.corpus_dir = Path(corpus_dir) if corpus_dir else resource_root("reference")
        self._frequency_cache = {}
        self._lemma_cache = {}
        self._list_resources_cache = None
        self._list_resources_cache_key = None

    def list_resources(self, lang: str = 'en', refresh: bool = False) -> List[Dict[str, Any]]:
        # Only imported metadata is authoritative. Never reuse legacy saves/.cache.
        result = []
        for path in sorted(self.corpus_dir.glob("*/meta.json")):
            if path.parent.name.startswith("."):
                continue
            try:
                meta = json.loads(path.read_text(encoding="utf-8"))
                if meta.get("id") == path.parent.name and (path.parent / "data.csv").is_file():
                    from services.reference_metadata import present_reference
                    result.append(present_reference(meta))
            except (OSError, ValueError):
                continue
        from services.reference_group_colors import group_colors
        colors = group_colors(item['prefix'] for item in result)
        return [dict(item, color=colors[item['prefix']]) for item in result]

    def get_resource(self, resource_id: str, lang: str = 'en') -> Optional[Dict[str, Any]]:
        """
        Get a specific corpus resource by ID
        
        Args:
            resource_id: Resource ID (e.g., 'bnc_commerce_finance')
            lang: Language for display names
            
        Returns:
            Resource metadata or None if not found
        """
        resources = self.list_resources(lang)
        for resource in resources:
            if resource['id'] == resource_id:
                return resource
        return None
    
    def get_all_tags(self, lang: str = 'en', refresh: bool = False) -> List[str]:
        """
        Get all unique tags across all resources
        
        Args:
            lang: Language for tags ('en' or 'zh')
            
        Returns:
            List of unique tags
        """
        resources = self.list_resources(lang, refresh=refresh)
        tags = set()
        tag_key = 'tags'
        
        for resource in resources:
            tags.update(resource.get(tag_key, []))
        
        return sorted(list(tags))
    
    def search_resources(
        self,
        query: str = '',
        tags: Optional[List[str]] = None,
        lang: str = 'en'
    ) -> List[Dict[str, Any]]:
        """
        Search corpus resources by name or tags
        
        Args:
            query: Search query (searches name)
            tags: List of tags to filter by (AND logic - must match all)
            lang: Language for display names and tags
            
        Returns:
            List of matching resources
        """
        resources = self.list_resources(lang)
        results = []
        
        name_key = 'name'
        tag_key = 'tags'
        
        for resource in resources:
            # Query match (case-insensitive)
            if query:
                name = resource.get(name_key, '').lower()
                if query.lower() not in name:
                    # Also check ID
                    if query.lower() not in resource['id'].lower():
                        continue
            
            # Tag match (must match ALL tags)
            if tags:
                resource_tags = set(t.lower() for t in resource.get(tag_key, []))
                search_tags = set(t.lower() for t in tags)
                if not search_tags.issubset(resource_tags):
                    continue
            
            results.append(resource)
        
        return results
    
    def _get_csv_path(self, resource_id: str) -> Optional[Path]:
        if not re.fullmatch(r"[a-f0-9]{32}", resource_id):
            return None
        path = self.corpus_dir / resource_id / "data.csv"
        return path if path.is_file() else None

    def load_frequency_data(
        self,
        resource_id: str,
        use_cache: bool = True
    ) -> Dict[str, Dict[str, Any]]:
        """
        Load word frequency data from a corpus resource
        
        Args:
            resource_id: Resource ID
            use_cache: Whether to use cached data
            
        Returns:
            Dictionary mapping words to {lemma, pos, freq} data
        """
        # Check cache
        if use_cache and self._get_csv_path(resource_id) and resource_id in self._frequency_cache:
            return self._frequency_cache[resource_id]
        
        # Get file path from resource_id
        file_path = self._get_csv_path(resource_id)
        if not file_path:
            logger.error(f"CSV file not found for resource: {resource_id}")
            return {}

        try:
            # Reference CSVs are top-1 (one count per token); see corpus_resource_csv.py.
            frequency_data, lemma_freq = parse_frequency_csv(file_path)

            if use_cache:
                self._frequency_cache[resource_id] = frequency_data
                self._lemma_cache[resource_id] = lemma_freq
            
            logger.info(f"Loaded {len(frequency_data)} words from {resource_id}")
            
        except Exception as e:
            logger.error(f"Error loading frequency data from {file_path}: {e}")
            return {}
        
        return frequency_data

    def load_lemma_frequencies(self, resource_id: str) -> Dict[str, int]:
        """Token-accurate lemma -> frequency table for a resource (original-case lemmas)."""
        if resource_id not in self._lemma_cache:
            # Populates both caches; fall back to a direct parse when caching is bypassed.
            self.load_frequency_data(resource_id)
        if self._get_csv_path(resource_id) and resource_id in self._lemma_cache:
            return self._lemma_cache[resource_id]
        file_path = self._get_csv_path(resource_id)
        if not file_path:
            return {}
        try:
            return parse_frequency_csv(file_path)[1]
        except Exception as e:
            logger.error(f"Error loading lemma frequencies from {file_path}: {e}")
            return {}
    
    def get_word_frequency(
        self,
        resource_id: str,
        word: str,
        lowercase: bool = True
    ) -> Optional[int]:
        """
        Get frequency of a specific word in a corpus resource
        
        Args:
            resource_id: Resource ID
            word: Word to look up
            lowercase: Whether to convert to lowercase
            
        Returns:
            Word frequency or None if not found
        """
        data = self.load_frequency_data(resource_id)
        
        lookup_word = word.lower() if lowercase else word
        
        if lookup_word in data:
            return data[lookup_word]['freq']
        
        # Try case-insensitive search if not found
        if not lowercase:
            for w, d in data.items():
                if w.lower() == lookup_word.lower():
                    return d['freq']
        
        return None
    
    def get_total_frequency(self, resource_id: str) -> int:
        """
        Get total word frequency (corpus size) for a resource
        
        Args:
            resource_id: Resource ID
            
        Returns:
            Total frequency count
        """
        data = self.load_frequency_data(resource_id)
        return sum(d['freq'] for d in data.values())
    
    def _build_domain_frequency_table(self, resource_id: str) -> Dict[str, int]:
        """
        Build a USAS domain -> frequency table from a corpus resource.
        
        Expects CSV 'usas' column with tags like A1.5.1, N3.8+_MWE, A2.1mf.
        Domains are normalized to base form (strip _MWE and all listed suffixes / trailing
        lowercase) so that A2.1, A2.1+, A2.1mf all aggregate under A2.1. Bases starting
        with D, J, R, U, V are excluded.
        """
        csv_path = self._get_csv_path(resource_id)
        if not csv_path:
            logger.error(f"CSV file not found for resource (domain mode): {resource_id}")
            return {}
        
        domain_freq: Dict[str, int] = {}
        
        try:
            with open(csv_path, 'r', encoding='utf-8-sig') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    usas_tag = (row.get('usas') or '').strip()
                    if not usas_tag:
                        continue
                    try:
                        freq = int(row.get('freq', 0))
                    except (TypeError, ValueError):
                        freq = 0
                    if freq <= 0:
                        continue
                    domains = parse_compound_tag(usas_tag)
                    for d in domains:
                        base = normalize_usas_domain_to_base(d)
                        if not base:
                            continue
                        domain_freq[base] = domain_freq.get(base, 0) + freq
        except Exception as e:
            logger.error(f"Error building domain frequency table from {csv_path}: {e}")
            return {}
        
        return domain_freq
    
    def build_frequency_table(
        self,
        resource_id: str,
        lowercase: bool = True,
        mode: str = "word"
    ) -> Dict[str, int]:
        """
        Build a simple frequency table for keyness analysis.
        
        Args:
            resource_id: Resource ID
            lowercase: Whether to convert to lowercase (word/lemma modes)
            mode: Aggregation mode: 'word' | 'lemma' | 'domain'
            
        Returns:
            Dictionary mapping tokens/lemmas/domains to frequencies
        """
        mode = (mode or "word").lower()
        
        # Domain mode: aggregate by USAS semantic domain codes
        if mode == "domain":
            return self._build_domain_frequency_table(resource_id)
        
        data = self.load_frequency_data(resource_id)
        freq_table: Dict[str, int] = {}
        
        if mode == "lemma":
            for lemma, freq in self.load_lemma_frequencies(resource_id).items():
                if not lemma:
                    continue
                key = lemma.lower() if lowercase else lemma
                freq_table[key] = freq_table.get(key, 0) + freq
            return freq_table
        
        # Default: aggregate by surface word form
        for word, info in data.items():
            key = word.lower() if lowercase else word
            if key in freq_table:
                freq_table[key] += info['freq']
            else:
                freq_table[key] = info['freq']
        
        return freq_table
    
    def clear_cache(self, resource_id: Optional[str] = None):
        """
        Clear frequency data cache and list_resources cache (when resource_id is None).
        
        Args:
            resource_id: Specific resource to clear (or None for all)
        """
        if resource_id:
            self._frequency_cache.pop(resource_id, None)
            self._lemma_cache.pop(resource_id, None)
        else:
            self._frequency_cache.clear()
            self._lemma_cache.clear()
            self._list_resources_cache = None
            self._list_resources_cache_key = None
        logger.info(f"Cache cleared: {resource_id or 'all'}")


# Singleton instance
_corpus_resource_service: Optional[CorpusResourceService] = None


def get_corpus_resource_service() -> CorpusResourceService:
    """Get or create corpus resource service singleton"""
    global _corpus_resource_service
    if _corpus_resource_service is None:
        _corpus_resource_service = CorpusResourceService()
    return _corpus_resource_service
