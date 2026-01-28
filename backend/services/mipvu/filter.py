"""
MIPVU Word Form Filter

Filters words based on metaphor_filter.json containing high-frequency non-metaphor words.
"""

import json
import os
import logging
from typing import Set, Optional

logger = logging.getLogger(__name__)


class MetaphorFilter:
    """
    Word form filter for non-metaphor words.
    Uses metaphor_filter.json which contains words that are almost always literal.
    """
    
    def __init__(self, filter_path: Optional[str] = None):
        """
        Initialize the filter with the given filter file path.
        
        Args:
            filter_path: Path to metaphor_filter.json. If None, uses default location.
        """
        self.non_metaphor_words: Set[str] = set()
        self._loaded = False
        
        if filter_path is None:
            import sys
            # Try to find the filter file in default locations
            # Check if running in PyInstaller bundle
            if getattr(sys, 'frozen', False):
                base_path = sys._MEIPASS
            else:
                base_path = os.path.dirname(__file__)
            
            possible_paths = [
                os.path.join(base_path, '..', '..', '..', 'saves', 'metaphor', 'metaphor_filter.json'),
                os.path.join(base_path, '..', '..', 'saves', 'metaphor', 'metaphor_filter.json'),
                os.path.join(base_path, 'saves', 'metaphor', 'metaphor_filter.json'),
                'saves/metaphor/metaphor_filter.json',
                '/Volumes/TL-TANIUM/Meta-Lingo-Electron/saves/metaphor/metaphor_filter.json',
            ]
            
            for path in possible_paths:
                abs_path = os.path.abspath(path)
                if os.path.exists(abs_path):
                    filter_path = abs_path
                    break
        
        if filter_path and os.path.exists(filter_path):
            self._load_filter(filter_path)
        else:
            logger.warning("metaphor_filter.json not found, filter will be empty")
    
    def _load_filter(self, filter_path: str) -> None:
        """Load the filter file."""
        try:
            with open(filter_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            words = data.get('words', [])
            # Convert all words to lowercase for case-insensitive matching
            self.non_metaphor_words = set(w.lower() for w in words)
            self._loaded = True
            logger.info(f"Loaded metaphor filter with {len(self.non_metaphor_words)} words from {filter_path}")
        except Exception as e:
            logger.error(f"Failed to load metaphor filter: {e}")
            self.non_metaphor_words = set()
    
    def is_non_metaphor(self, word: str) -> bool:
        """
        Check if a word is in the non-metaphor filter list.
        
        Args:
            word: The word to check (will be lowercased)
            
        Returns:
            True if the word is in the non-metaphor list, False otherwise
        """
        return word.lower() in self.non_metaphor_words
    
    def is_loaded(self) -> bool:
        """Check if the filter was successfully loaded."""
        return self._loaded
    
    def get_word_count(self) -> int:
        """Get the number of words in the filter."""
        return len(self.non_metaphor_words)
