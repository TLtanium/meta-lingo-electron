"""
Corpus Resource Service
Provides access to pre-built corpus frequency CSV files for reference corpus comparison
"""

import os
import csv
import logging
from typing import List, Dict, Any, Optional, Set, Tuple
from pathlib import Path
from functools import lru_cache

logger = logging.getLogger(__name__)


class CorpusResourceService:
    """Service for managing and accessing corpus resource CSV files"""
    
    # Name mapping: corpus prefix -> display name template
    CORPUS_PREFIX_NAMES = {
        'bnc': 'BNC',
        'brown': 'Brown',
        'now': 'NOW',
        'oanc': 'OANC'
    }
    
    # Display name mappings (Chinese)
    CORPUS_PREFIX_NAMES_ZH = {
        'bnc': 'BNC',
        'brown': 'Brown',
        'now': 'NOW',
        'oanc': 'OANC'
    }
    
    # Tag mappings for special cases
    SPECIAL_TAGS = {
        'now': ['NOW', 'news'],  # All NOW corpora get 'news' tag
    }
    
    # Category display names (for name formatting)
    CATEGORY_NAMES = {
        # BNC categories
        'applied_science': 'Applied Science',
        'arts': 'Arts',
        'belief_thought': 'Belief & Thought',
        'commerce_finance': 'Commerce & Finance',
        'imaginative': 'Imaginative',
        'leisure': 'Leisure',
        'natural_science': 'Natural Science',
        'social_science': 'Social Science',
        'spoken': 'Spoken',
        'written': 'Written',
        'world_affairs': 'World Affairs',
        'total': '',  # Empty for total
        # Brown categories
        'adventure': 'Adventure',
        'belles_lettres': 'Belles Lettres',
        'editorial': 'Editorial',
        'fiction': 'Fiction',
        'government': 'Government',
        'hobbies': 'Hobbies',
        'humor': 'Humor',
        'informative': 'Informative',
        'learned': 'Learned',
        'lore': 'Lore',
        'mystery': 'Mystery',
        'news': 'News',
        'religion': 'Religion',
        'reviews': 'Reviews',
        'romance': 'Romance',
        'science_fiction': 'Science Fiction',
        # OANC categories
        '911report': '911 Report',
        'biomed': 'Biomedical',
        'face_to_face': 'Face-to-Face',
        'journal': 'Journal',
        'letters': 'Letters',
        'non_fiction': 'Non-Fiction',
        'plos': 'PLOS',
        'telephone': 'Telephone',
        'travel_guides': 'Travel Guides',
    }
    
    # Category display names (Chinese)
    CATEGORY_NAMES_ZH = {
        # BNC categories
        'applied_science': '应用科学',
        'arts': '艺术',
        'belief_thought': '信仰与思想',
        'commerce_finance': '商业与金融',
        'imaginative': '虚构类',
        'leisure': '休闲',
        'natural_science': '自然科学',
        'social_science': '社会科学',
        'spoken': '口语',
        'written': '书面语',
        'world_affairs': '世界事务',
        'total': '',
        # Brown categories
        'adventure': '冒险',
        'belles_lettres': '美文',
        'editorial': '社论',
        'fiction': '小说',
        'government': '政府',
        'hobbies': '爱好',
        'humor': '幽默',
        'informative': '信息类',
        'learned': '学术',
        'lore': '民间传说',
        'mystery': '悬疑',
        'news': '新闻',
        'religion': '宗教',
        'reviews': '评论',
        'romance': '浪漫',
        'science_fiction': '科幻',
        # OANC categories
        '911report': '911报告',
        'biomed': '生物医学',
        'face_to_face': '面对面',
        'journal': '期刊',
        'letters': '信件',
        'non_fiction': '非虚构',
        'plos': 'PLOS',
        'telephone': '电话',
        'travel_guides': '旅游指南',
    }
    
    # Country names for NOW corpus
    NOW_COUNTRIES = {
        'Australia': 'Australia',
        'Bangladesh': 'Bangladesh',
        'Canada': 'Canada',
        'Ghana': 'Ghana',
        'HongKong': 'Hong Kong',
        'India': 'India',
        'Ireland': 'Ireland',
        'Jamaica': 'Jamaica',
        'Kenya': 'Kenya',
        'Malaysia': 'Malaysia',
        'NewZealand': 'New Zealand',
        'Nigeria': 'Nigeria',
        'Pakistan': 'Pakistan',
        'Philippines': 'Philippines',
        'Singapore': 'Singapore',
        'SouthAfrica': 'South Africa',
        'SriLanka': 'Sri Lanka',
        'Tanzania': 'Tanzania',
        'UK': 'UK',
        'USA': 'USA',
    }
    
    NOW_COUNTRIES_ZH = {
        'Australia': '澳大利亚',
        'Bangladesh': '孟加拉国',
        'Canada': '加拿大',
        'Ghana': '加纳',
        'HongKong': '香港',
        'India': '印度',
        'Ireland': '爱尔兰',
        'Jamaica': '牙买加',
        'Kenya': '肯尼亚',
        'Malaysia': '马来西亚',
        'NewZealand': '新西兰',
        'Nigeria': '尼日利亚',
        'Pakistan': '巴基斯坦',
        'Philippines': '菲律宾',
        'Singapore': '新加坡',
        'SouthAfrica': '南非',
        'SriLanka': '斯里兰卡',
        'Tanzania': '坦桑尼亚',
        'UK': '英国',
        'USA': '美国',
    }
    
    def __init__(self, corpus_dir: Optional[Path] = None):
        """
        Initialize corpus resource service
        
        Args:
            corpus_dir: Path to corpus resource directory (default: saves/corpus)
        """
        if corpus_dir is None:
            # Default to saves/corpus relative to backend
            backend_dir = Path(__file__).parent.parent
            corpus_dir = backend_dir.parent / "saves" / "corpus"
        
        self.corpus_dir = Path(corpus_dir)
        self._frequency_cache: Dict[str, Dict[str, int]] = {}
        logger.info(f"CorpusResourceService initialized with directory: {self.corpus_dir}")
    
    def _parse_csv_filename(self, filename: str) -> Tuple[str, str]:
        """
        Parse CSV filename to extract prefix and category
        
        Args:
            filename: CSV filename (e.g., 'bnc_commerce_finance.csv')
            
        Returns:
            Tuple of (prefix, category)
        """
        name = filename.replace('.csv', '')
        parts = name.split('_', 1)
        
        if len(parts) == 1:
            return parts[0], 'total'
        
        prefix = parts[0]
        category = parts[1]
        
        return prefix, category
    
    def _get_display_name(self, prefix: str, category: str, lang: str = 'en') -> str:
        """
        Get display name for a corpus resource
        
        Args:
            prefix: Corpus prefix (e.g., 'bnc')
            category: Category name (e.g., 'commerce_finance')
            lang: Language ('en' or 'zh')
            
        Returns:
            Display name (e.g., 'BNC - Commerce & Finance')
        """
        prefix_names = self.CORPUS_PREFIX_NAMES_ZH if lang == 'zh' else self.CORPUS_PREFIX_NAMES
        category_names = self.CATEGORY_NAMES_ZH if lang == 'zh' else self.CATEGORY_NAMES
        
        base_name = prefix_names.get(prefix, prefix.upper())
        
        # Special handling for NOW countries
        if prefix == 'now' and category != 'total':
            country_names = self.NOW_COUNTRIES_ZH if lang == 'zh' else self.NOW_COUNTRIES
            country_display = country_names.get(category, category)
            if lang == 'zh':
                return f"NOW - {country_display}新闻"
            return f"NOW - {country_display} News"
        
        # Handle total case
        if category == 'total':
            if lang == 'zh':
                return f"{base_name} 完整语料库"
            return f"{base_name} Complete"
        
        # Get category display name
        cat_display = category_names.get(category, category.replace('_', ' ').title())
        
        return f"{base_name} - {cat_display}"
    
    def _get_tags(self, prefix: str, category: str) -> List[str]:
        """
        Get tags for a corpus resource
        
        Args:
            prefix: Corpus prefix (e.g., 'bnc')
            category: Category name (e.g., 'commerce_finance')
            
        Returns:
            List of tags
        """
        tags = []
        
        # Add base prefix tag
        base_tag = self.CORPUS_PREFIX_NAMES.get(prefix, prefix.upper())
        tags.append(base_tag)
        
        # Special handling for NOW - add 'news' tag for all
        if prefix == 'now':
            tags.append('news')
            # Don't add country as tag per requirement
        else:
            # Add category parts as tags (if not 'total')
            if category != 'total':
                # Split category by underscore and add each part
                for part in category.split('_'):
                    if part and part not in tags:
                        tags.append(part)
        
        return tags
    
    def _get_tags_zh(self, prefix: str, category: str) -> List[str]:
        """
        Get Chinese tags for a corpus resource
        """
        tags = []
        
        # Add base prefix tag (keep English for prefix)
        base_tag = self.CORPUS_PREFIX_NAMES.get(prefix, prefix.upper())
        tags.append(base_tag)
        
        # Special handling for NOW
        if prefix == 'now':
            tags.append('新闻')
        else:
            if category != 'total':
                # Use Chinese category names if available
                cat_zh = self.CATEGORY_NAMES_ZH.get(category)
                if cat_zh:
                    tags.append(cat_zh)
                else:
                    for part in category.split('_'):
                        if part and part not in tags:
                            tags.append(part)
        
        return tags
    
    def _generate_description(self, prefix: str, category: str, word_count: int, lang: str = 'en') -> str:
        """
        Generate a descriptive text for a corpus resource
        
        Args:
            prefix: Corpus prefix (e.g., 'bnc')
            category: Category name (e.g., 'commerce_finance')
            word_count: Number of unique words
            lang: Language ('en' or 'zh')
            
        Returns:
            Description string
        """
        # Corpus full names
        corpus_names_en = {
            'bnc': 'British National Corpus',
            'brown': 'Brown Corpus',
            'now': 'News on the Web Corpus',
            'oanc': 'Open American National Corpus'
        }
        corpus_names_zh = {
            'bnc': '英国国家语料库',
            'brown': 'Brown语料库',
            'now': '网络新闻语料库',
            'oanc': '开放美国国家语料库'
        }
        
        corpus_name = corpus_names_zh.get(prefix, prefix.upper()) if lang == 'zh' else corpus_names_en.get(prefix, prefix.upper())
        category_names = self.CATEGORY_NAMES_ZH if lang == 'zh' else self.CATEGORY_NAMES
        
        # Format word count
        if word_count >= 1000000:
            word_count_str = f"{word_count / 1000000:.1f}M"
        elif word_count >= 1000:
            word_count_str = f"{word_count / 1000:.1f}K"
        else:
            word_count_str = str(word_count)
        
        if category == 'total':
            if lang == 'zh':
                return f"{corpus_name}完整词频数据，包含 {word_count_str} 个独立词条"
            else:
                return f"Complete {corpus_name} frequency data with {word_count_str} unique words"
        
        # Handle NOW countries
        if prefix == 'now':
            country_names = self.NOW_COUNTRIES_ZH if lang == 'zh' else self.NOW_COUNTRIES
            country = country_names.get(category, category)
            if lang == 'zh':
                return f"来自{country}的网络新闻词频数据，{word_count_str} 词条"
            else:
                return f"News frequency data from {country}, {word_count_str} words"
        
        # General case
        cat_display = category_names.get(category, category.replace('_', ' ').title())
        if lang == 'zh':
            return f"{corpus_name}{cat_display}类词频数据，{word_count_str} 词条"
        else:
            return f"{corpus_name} {cat_display} frequency data, {word_count_str} words"
    
    def list_resources(self, lang: str = 'en') -> List[Dict[str, Any]]:
        """
        List all available corpus resources
        
        Args:
            lang: Language for display names ('en' or 'zh')
            
        Returns:
            List of corpus resource metadata
        """
        resources = []
        
        if not self.corpus_dir.exists():
            logger.warning(f"Corpus directory not found: {self.corpus_dir}")
            return resources
        
        # Scan subdirectories
        for subdir in sorted(self.corpus_dir.iterdir()):
            if not subdir.is_dir() or subdir.name.startswith('.'):
                continue
            
            # Scan CSV files in subdirectory
            for csv_file in sorted(subdir.glob('*.csv')):
                if csv_file.name.startswith('.'):
                    continue
                
                prefix, category = self._parse_csv_filename(csv_file.name)
                resource_id = f"{prefix}_{category}"
                
                # Get file info
                try:
                    file_size = csv_file.stat().st_size
                    # Count lines (approximate word count)
                    with open(csv_file, 'r', encoding='utf-8') as f:
                        word_count = sum(1 for _ in f) - 1  # Subtract header
                except Exception as e:
                    logger.error(f"Error reading {csv_file}: {e}")
                    file_size = 0
                    word_count = 0
                
                tags_en = self._get_tags(prefix, category)
                tags_zh = self._get_tags_zh(prefix, category)
                
                # Generate better descriptions
                name_en = self._get_display_name(prefix, category, 'en')
                name_zh = self._get_display_name(prefix, category, 'zh')
                
                desc_en = self._generate_description(prefix, category, word_count, 'en')
                desc_zh = self._generate_description(prefix, category, word_count, 'zh')
                
                resources.append({
                    'id': resource_id,
                    'name_en': name_en,
                    'name_zh': name_zh,
                    'prefix': prefix,
                    'category': category,
                    'tags_en': tags_en,
                    'tags_zh': tags_zh,
                    'file_size': file_size,
                    'word_count': word_count,
                    'description_en': desc_en,
                    'description_zh': desc_zh
                })
        
        return resources
    
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
    
    def get_all_tags(self, lang: str = 'en') -> List[str]:
        """
        Get all unique tags across all resources
        
        Args:
            lang: Language for tags ('en' or 'zh')
            
        Returns:
            List of unique tags
        """
        resources = self.list_resources(lang)
        tags = set()
        tag_key = 'tags_zh' if lang == 'zh' else 'tags_en'
        
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
        
        name_key = 'name_zh' if lang == 'zh' else 'name_en'
        tag_key = 'tags_zh' if lang == 'zh' else 'tags_en'
        
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
        """
        Get the CSV file path for a resource ID
        
        Args:
            resource_id: Resource ID (e.g., 'bnc_commerce_finance')
            
        Returns:
            Path to CSV file or None if not found
        """
        # Parse resource_id to get prefix and construct path
        parts = resource_id.split('_', 1)
        if len(parts) < 1:
            return None
        
        prefix = parts[0]
        csv_filename = f"{resource_id}.csv"
        
        # Look in the prefix subdirectory
        csv_path = self.corpus_dir / prefix / csv_filename
        if csv_path.exists():
            return csv_path
        
        # Fallback: search in all subdirectories
        for subdir in self.corpus_dir.iterdir():
            if subdir.is_dir():
                potential_path = subdir / csv_filename
                if potential_path.exists():
                    return potential_path
        
        return None
    
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
        if use_cache and resource_id in self._frequency_cache:
            return self._frequency_cache[resource_id]
        
        # Get file path from resource_id
        file_path = self._get_csv_path(resource_id)
        if not file_path:
            logger.error(f"CSV file not found for resource: {resource_id}")
            return {}
        
        frequency_data = {}
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    word = row.get('word', '').strip()
                    if not word:
                        continue
                    
                    lemma = row.get('lemma', word).strip()
                    pos = row.get('pos', '').strip()
                    try:
                        freq = int(row.get('freq', 0))
                    except (ValueError, TypeError):
                        freq = 0
                    
                    # Use word as key, store all data
                    # If same word appears multiple times with different POS, sum freq
                    if word in frequency_data:
                        frequency_data[word]['freq'] += freq
                    else:
                        frequency_data[word] = {
                            'word': word,
                            'lemma': lemma,
                            'pos': pos,
                            'freq': freq
                        }
            
            # Cache the result
            if use_cache:
                self._frequency_cache[resource_id] = frequency_data
            
            logger.info(f"Loaded {len(frequency_data)} words from {resource_id}")
            
        except Exception as e:
            logger.error(f"Error loading frequency data from {file_path}: {e}")
            return {}
        
        return frequency_data
    
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
    
    def build_frequency_table(
        self,
        resource_id: str,
        lowercase: bool = True
    ) -> Dict[str, int]:
        """
        Build a simple word -> frequency table for keyness analysis
        
        Args:
            resource_id: Resource ID
            lowercase: Whether to convert to lowercase
            
        Returns:
            Dictionary mapping words to frequencies
        """
        data = self.load_frequency_data(resource_id)
        
        freq_table = {}
        for word, info in data.items():
            key = word.lower() if lowercase else word
            if key in freq_table:
                freq_table[key] += info['freq']
            else:
                freq_table[key] = info['freq']
        
        return freq_table
    
    def clear_cache(self, resource_id: Optional[str] = None):
        """
        Clear frequency data cache
        
        Args:
            resource_id: Specific resource to clear (or None for all)
        """
        if resource_id:
            self._frequency_cache.pop(resource_id, None)
        else:
            self._frequency_cache.clear()
        logger.info(f"Cache cleared: {resource_id or 'all'}")


# Singleton instance
_corpus_resource_service: Optional[CorpusResourceService] = None


def get_corpus_resource_service() -> CorpusResourceService:
    """Get or create corpus resource service singleton"""
    global _corpus_resource_service
    if _corpus_resource_service is None:
        _corpus_resource_service = CorpusResourceService()
    return _corpus_resource_service
