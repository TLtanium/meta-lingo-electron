"""
Dynamic Topic Service
Handles timestamp extraction and processing for dynamic topic analysis
"""

import logging
import json
import re
import datetime
from typing import Dict, List, Any, Optional, Tuple
from pathlib import Path

# Import paths from config module
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import DATA_DIR, CORPORA_DIR

logger = logging.getLogger(__name__)


class DynamicTopicService:
    """Service for handling dynamic topic analysis with timestamps"""
    
    def __init__(self):
        self.data_dir = DATA_DIR
        self.corpora_dir = CORPORA_DIR
    
    def smart_parse_timestamp(self, timestamp_str: str) -> Optional[int]:
        """
        Smart timestamp parsing supporting multiple formats
        
        Supported formats:
        - 2002-01-04
        - 2002/01/04  
        - 2002.01.04
        - 2002-1-4
        - 2002 (year only)
        - 20020104 (compact format)
        
        Returns:
            Days since 1970-01-01 (integer timestamp) or None if parsing fails
        """
        if not timestamp_str:
            return None
            
        timestamp_str = timestamp_str.strip()
        
        # Define supported date format patterns
        patterns = [
            # Standard format: YYYY-MM-DD
            (r'(\d{4})-(\d{1,2})-(\d{1,2})', 
             lambda m: datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))),
            # Slash format: YYYY/MM/DD
            (r'(\d{4})/(\d{1,2})/(\d{1,2})', 
             lambda m: datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))),
            # Dot format: YYYY.MM.DD
            (r'(\d{4})\.(\d{1,2})\.(\d{1,2})', 
             lambda m: datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))),
            # Compact format: YYYYMMDD
            (r'^(\d{4})(\d{2})(\d{2})$', 
             lambda m: datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3)))),
            # Year only: YYYY
            (r'^(\d{4})$', 
             lambda m: datetime.date(int(m.group(1)), 1, 1)),
        ]
        
        for pattern, parser in patterns:
            match = re.match(pattern, timestamp_str)
            if match:
                try:
                    parsed_date = parser(match)
                    # Convert to days since epoch (1970-01-01)
                    epoch = datetime.date(1970, 1, 1)
                    return (parsed_date - epoch).days
                except (ValueError, OverflowError) as e:
                    logger.warning(f"Date parsing error '{timestamp_str}': {str(e)}")
                    continue
        
        # If all patterns fail, try to convert directly to int (might already be a timestamp)
        try:
            return int(float(timestamp_str))
        except (ValueError, OverflowError):
            pass
        
        return None
    
    def format_timestamp_for_display(
        self, 
        days_since_epoch: int, 
        date_format: str = 'year_only'
    ) -> str:
        """
        Format a timestamp (days since epoch) for display
        
        Args:
            days_since_epoch: Integer days since 1970-01-01
            date_format: 'year_only' or 'full_date'
            
        Returns:
            Formatted date string
        """
        try:
            epoch = datetime.date(1970, 1, 1)
            date = epoch + datetime.timedelta(days=days_since_epoch)
            
            if date_format == 'year_only':
                return str(date.year)
            else:
                return date.strftime('%Y-%m-%d')
        except Exception as e:
            logger.error(f"Error formatting timestamp {days_since_epoch}: {e}")
            return str(days_since_epoch)
    
    def get_text_metadata(self, corpus_id: str, text_id: str) -> Optional[Dict[str, Any]]:
        """
        Get metadata for a specific text from database
        
        Args:
            corpus_id: Corpus identifier
            text_id: Text identifier
            
        Returns:
            Text metadata dictionary or None
        """
        try:
            # Get text from database
            db_path = self.data_dir / "database.sqlite"
            if not db_path.exists():
                return None
            
            import sqlite3
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            cursor.execute(
                "SELECT metadata FROM texts WHERE id = ? AND corpus_id = ?",
                (text_id, corpus_id)
            )
            row = cursor.fetchone()
            conn.close()
            
            if row and row['metadata']:
                return json.loads(row['metadata'])
            
            return None
            
        except Exception as e:
            logger.error(f"Error getting text metadata: {e}")
            return None
    
    def get_timestamps_from_corpus(
        self,
        corpus_id: str,
        text_ids: List[str],
        date_format: str = 'year_only'
    ) -> Tuple[List[int], List[str], Dict[str, Any]]:
        """
        Extract timestamps from corpus text metadata
        
        Args:
            corpus_id: Corpus identifier
            text_ids: List of text identifiers
            date_format: 'year_only' or 'full_date'
            
        Returns:
            Tuple of (timestamps_int, timestamps_display, stats)
            - timestamps_int: List of integer timestamps (days since epoch)
            - timestamps_display: List of display-formatted timestamps
            - stats: Statistics about extraction
        """
        timestamps_int = []
        timestamps_display = []
        stats = {
            'total': len(text_ids),
            'with_date': 0,
            'without_date': 0,
            'parse_errors': 0,
            'date_range': None
        }
        
        try:
            # Connect to database
            db_path = self.data_dir / "database.sqlite"
            if not db_path.exists():
                logger.error("Database not found")
                return timestamps_int, timestamps_display, stats
            
            import sqlite3
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            min_date = None
            max_date = None
            
            for text_id in text_ids:
                cursor.execute(
                    "SELECT metadata FROM texts WHERE id = ? AND corpus_id = ?",
                    (text_id, corpus_id)
                )
                row = cursor.fetchone()
                
                if row and row['metadata']:
                    try:
                        metadata = json.loads(row['metadata'])
                        date_str = metadata.get('date')
                        
                        if date_str:
                            timestamp = self.smart_parse_timestamp(date_str)
                            logger.info(f"Parsed date '{date_str}' -> days={timestamp}")
                            if timestamp is not None:
                                timestamps_int.append(timestamp)
                                display = self.format_timestamp_for_display(timestamp, date_format)
                                timestamps_display.append(display)
                                stats['with_date'] += 1
                                
                                # Track date range
                                if min_date is None or timestamp < min_date:
                                    min_date = timestamp
                                if max_date is None or timestamp > max_date:
                                    max_date = timestamp
                            else:
                                stats['parse_errors'] += 1
                                timestamps_int.append(0)
                                timestamps_display.append('')
                        else:
                            stats['without_date'] += 1
                            timestamps_int.append(0)
                            timestamps_display.append('')
                    except json.JSONDecodeError:
                        stats['without_date'] += 1
                        timestamps_int.append(0)
                        timestamps_display.append('')
                else:
                    stats['without_date'] += 1
                    timestamps_int.append(0)
                    timestamps_display.append('')
            
            conn.close()
            
            # Set date range in stats
            if min_date is not None and max_date is not None:
                stats['date_range'] = {
                    'min': self.format_timestamp_for_display(min_date, 'full_date'),
                    'max': self.format_timestamp_for_display(max_date, 'full_date')
                }
            
            logger.info(f"Extracted timestamps: {stats['with_date']}/{stats['total']} texts have dates")
            
        except Exception as e:
            logger.error(f"Error extracting timestamps: {e}")
        
        return timestamps_int, timestamps_display, stats
    
    def get_timestamps_for_chunks(
        self,
        corpus_id: str,
        chunk_text_ids: List[str],
        date_format: str = 'year_only'
    ) -> Tuple[List[int], List[str], Dict[str, Any]]:
        """
        Get timestamps for each chunk based on its corresponding text_id.
        Each chunk inherits the date metadata from its original text.
        
        Args:
            corpus_id: Corpus identifier
            chunk_text_ids: List of text_ids for each chunk (may have duplicates)
            date_format: 'year_only' or 'full_date'
            
        Returns:
            Tuple of (timestamps_int, timestamps_display, stats)
        """
        timestamps_int = []
        timestamps_display = []
        stats = {
            'total': len(chunk_text_ids),
            'with_date': 0,
            'without_date': 0,
            'parse_errors': 0,
            'unique_texts': len(set(chunk_text_ids)),
            'date_range': None
        }
        
        try:
            db_path = self.data_dir / "database.sqlite"
            if not db_path.exists():
                logger.error("Database not found")
                return timestamps_int, timestamps_display, stats
            
            import sqlite3
            conn = sqlite3.connect(str(db_path))
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Cache to avoid repeated database queries for the same text_id
            text_date_cache: Dict[str, Optional[int]] = {}
            min_date = None
            max_date = None
            
            for text_id in chunk_text_ids:
                # Check cache first
                if text_id in text_date_cache:
                    timestamp = text_date_cache[text_id]
                else:
                    # Query database
                    cursor.execute(
                        "SELECT metadata FROM texts WHERE id = ?",
                        (text_id,)
                    )
                    row = cursor.fetchone()
                    timestamp = None
                    
                    if row and row['metadata']:
                        try:
                            metadata = json.loads(row['metadata'])
                            date_str = metadata.get('date')
                            
                            if date_str:
                                timestamp = self.smart_parse_timestamp(date_str)
                        except json.JSONDecodeError:
                            pass
                    
                    text_date_cache[text_id] = timestamp
                
                # Add timestamp for this chunk
                if timestamp is not None:
                    timestamps_int.append(timestamp)
                    display = self.format_timestamp_for_display(timestamp, date_format)
                    timestamps_display.append(display)
                    stats['with_date'] += 1
                    
                    if min_date is None or timestamp < min_date:
                        min_date = timestamp
                    if max_date is None or timestamp > max_date:
                        max_date = timestamp
                else:
                    timestamps_int.append(0)
                    timestamps_display.append('')
                    stats['without_date'] += 1
            
            conn.close()
            
            if min_date is not None and max_date is not None:
                stats['date_range'] = {
                    'min': self.format_timestamp_for_display(min_date, 'full_date'),
                    'max': self.format_timestamp_for_display(max_date, 'full_date')
                }
            
            logger.info(f"Extracted timestamps for chunks: {stats['with_date']}/{stats['total']} chunks have dates "
                       f"(from {stats['unique_texts']} unique texts)")
            
        except Exception as e:
            logger.error(f"Error extracting timestamps for chunks: {e}")
        
        return timestamps_int, timestamps_display, stats
    
    def validate_timestamps(
        self, 
        timestamps: List[int], 
        document_count: int
    ) -> Tuple[bool, str]:
        """
        Validate timestamps for dynamic topic analysis
        
        Args:
            timestamps: List of integer timestamps
            document_count: Expected number of documents
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if len(timestamps) != document_count:
            return False, f"Timestamp count ({len(timestamps)}) does not match document count ({document_count})"
        
        valid_count = sum(1 for t in timestamps if t > 0)
        if valid_count < 2:
            return False, f"At least 2 valid timestamps required, got {valid_count}"
        
        # Check if there's enough variation in timestamps
        unique_timestamps = set(t for t in timestamps if t > 0)
        if len(unique_timestamps) < 2:
            return False, "Need at least 2 different dates for dynamic topic analysis"
        
        return True, ""


# Singleton instance
_dynamic_topic_service = None


def get_dynamic_topic_service() -> DynamicTopicService:
    """Get dynamic topic service singleton"""
    global _dynamic_topic_service
    if _dynamic_topic_service is None:
        _dynamic_topic_service = DynamicTopicService()
    return _dynamic_topic_service
