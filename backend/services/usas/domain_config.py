"""
USAS Semantic Domain Configuration
Defines semantic domain categories and text type priority mappings
"""

import os
import sys
import re
import logging
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# Import config for path resolution
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
from config import is_packaged

logger = logging.getLogger(__name__)

# USAS Major Categories (21 categories)
USAS_MAJOR_CATEGORIES = {
    'A': 'General And Abstract Terms',
    'B': 'The Body And The Individual',
    'C': 'Arts And Crafts',
    'E': 'Emotional Actions, States And Processes',
    'F': 'Food And Farming',
    'G': 'Government And The Public Domain',
    'H': 'Architecture, Buildings, Houses And The Home',
    'I': 'Money And Commerce',
    'K': 'Entertainment, Sports And Games',
    'L': 'Life And Living Things',
    'M': 'Movement, Location, Travel And Transport',
    'N': 'Numbers And Measurement',
    'O': 'Substances, Materials, Objects And Equipment',
    'P': 'Education',
    'Q': 'Linguistic Actions, States And Processes',
    'S': 'Social Actions, States And Processes',
    'T': 'Time',
    'W': 'The World And Our Environment',
    'X': 'Psychological Actions, States And Processes',
    'Y': 'Science And Technology',
    'Z': 'Names And Grammatical Words'
}

# Text Type Priority Mappings (from PyMUSAS enhancement document)
# Maps text type codes to prioritized semantic domains
TEXT_TYPE_PRIORITY_MAP = {
    'MED': {
        'name': 'Medical Literature',
        'name_zh': '医学文献',
        'priority_domains': ['B1', 'B2', 'B3'],
        'description': 'Medical texts: anatomy, disease, treatment'
    },
    'LAW': {
        'name': 'Legal Document',
        'name_zh': '法律文档',
        'priority_domains': ['G2', 'G2.1'],
        'description': 'Legal texts: law and order'
    },
    'FIN': {
        'name': 'Finance/Economics',
        'name_zh': '金融/经济',
        'priority_domains': ['I1', 'I2', 'I1.1', 'I1.2', 'I1.3'],
        'description': 'Financial texts: money and commerce'
    },
    'POL': {
        'name': 'Political Discourse',
        'name_zh': '政治话语',
        'priority_domains': ['G1', 'G1.1', 'G1.2'],
        'description': 'Political texts: government and politics'
    },
    'MIL': {
        'name': 'Military Literature',
        'name_zh': '军事文献',
        'priority_domains': ['G3'],
        'description': 'Military texts: warfare and defense'
    },
    'SPT': {
        'name': 'Sports Report',
        'name_zh': '体育报道',
        'priority_domains': ['K5', 'K5.1', 'K5.2'],
        'description': 'Sports texts: sports and games'
    },
    'SCI': {
        'name': 'Natural Science',
        'name_zh': '自然科学',
        'priority_domains': ['Y1', 'X2.4'],
        'description': 'Science texts: research and investigation'
    },
    'IT': {
        'name': 'Information Technology',
        'name_zh': '信息技术',
        'priority_domains': ['Y2'],
        'description': 'IT texts: computing and technology'
    },
    'AGR': {
        'name': 'Agriculture Related',
        'name_zh': '农业相关',
        'priority_domains': ['F4', 'L3'],
        'description': 'Agriculture texts: farming and plants'
    },
    'REL': {
        'name': 'Religious Literature',
        'name_zh': '宗教文献',
        'priority_domains': ['S9'],
        'description': 'Religious texts: religion and supernatural'
    },
    'GEN': {
        'name': 'General Text',
        'name_zh': '通用文本',
        'priority_domains': [],
        'description': 'General texts: no priority (frequency-based)'
    }
}

# Text type name to code mapping (for UI text types)
TEXT_TYPE_NAME_TO_CODE = {
    'Medical Literature': 'MED',
    'Legal Document': 'LAW',
    'Finance/Economics': 'FIN',
    'Political Discourse': 'POL',
    'Military Literature': 'MIL',
    'Sports Report': 'SPT',
    'Natural Science': 'SCI',
    'Information Technology': 'IT',
    'Agriculture': 'AGR',
    'Religious Literature': 'REL',
    'General Text': 'GEN',
    'Academic Paper': 'SCI',
    'News Article': 'GEN',
    'Social Media': 'GEN',
    'Technical Document': 'IT',
    'Custom': 'GEN'
}

# Global domain dictionary (populated from file)
USAS_DOMAINS: Dict[str, str] = {}


def parse_usas_domains_file(file_path: Optional[str] = None) -> Dict[str, str]:
    """
    Parse USAS semantic domains from text file
    
    Args:
        file_path: Path to usas_semantic_domains.txt
        
    Returns:
        Dictionary mapping domain codes to descriptions
    """
    global USAS_DOMAINS
    
    if file_path is None:
        # In packaged mode, look in _MEIPASS; in dev mode, use project root
        if is_packaged():
            base_path = Path(sys._MEIPASS)
        else:
            base_path = Path(__file__).parent.parent.parent.parent
        file_path = base_path / 'usas_semantic_domains.txt'
    
    domains = {}
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                
                # Parse line format: "A1.1.1\tGeneral actions / making"
                parts = line.split('\t')
                if len(parts) >= 2:
                    code = parts[0].strip()
                    description = parts[1].strip()
                    domains[code] = description
        
        USAS_DOMAINS = domains
        logger.info(f"Loaded {len(domains)} USAS semantic domains from {file_path}")
        
    except FileNotFoundError:
        logger.warning(f"USAS domains file not found: {file_path}")
    except Exception as e:
        logger.error(f"Error parsing USAS domains file: {e}")
    
    return domains


def get_domain_description(code: str) -> str:
    """
    Get description for a semantic domain code
    
    Args:
        code: Domain code like 'A1.1.1' or 'I1.1+'
        
    Returns:
        Domain description or empty string if not found
    """
    # Handle MWE format (e.g., 'I1.1_MWE')
    if '_MWE' in code:
        base_code = code.replace('_MWE', '')
        return USAS_DOMAINS.get(base_code, '')
    
    # Handle polarity markers (+/-)
    clean_code = code.rstrip('+-')
    
    # Try exact match first
    if code in USAS_DOMAINS:
        return USAS_DOMAINS[code]
    
    # Try without polarity
    if clean_code in USAS_DOMAINS:
        return USAS_DOMAINS[clean_code]
    
    return ''


def get_major_category(code: str) -> Tuple[str, str]:
    """
    Get major category for a semantic domain code
    
    Args:
        code: Domain code like 'A1.1.1' or 'I1.1'
        
    Returns:
        Tuple of (category letter, category name)
    """
    if not code:
        return ('', '')
    
    # Extract first letter (major category)
    first_char = code[0].upper()
    
    if first_char in USAS_MAJOR_CATEGORIES:
        return (first_char, USAS_MAJOR_CATEGORIES[first_char])
    
    return ('', '')


def get_text_type_priority(text_type: str) -> List[str]:
    """
    Get priority domains for a text type
    
    Args:
        text_type: Text type name or code
        
    Returns:
        List of priority domain codes
    """
    # Try direct code lookup
    if text_type in TEXT_TYPE_PRIORITY_MAP:
        return TEXT_TYPE_PRIORITY_MAP[text_type]['priority_domains']
    
    # Try name to code mapping
    code = TEXT_TYPE_NAME_TO_CODE.get(text_type, 'GEN')
    if code in TEXT_TYPE_PRIORITY_MAP:
        return TEXT_TYPE_PRIORITY_MAP[code]['priority_domains']
    
    return []


def get_domains_by_category() -> Dict[str, List[Dict[str, str]]]:
    """
    Get all domains grouped by major category
    
    Returns:
        Dictionary with category letters as keys and lists of domain info
    """
    if not USAS_DOMAINS:
        parse_usas_domains_file()
    
    result = {cat: [] for cat in USAS_MAJOR_CATEGORIES.keys()}
    
    for code, description in USAS_DOMAINS.items():
        category, _ = get_major_category(code)
        if category:
            result[category].append({
                'code': code,
                'description': description
            })
    
    # Sort domains within each category
    for cat in result:
        result[cat].sort(key=lambda x: x['code'])
    
    return result


# Initialize domains on module load
parse_usas_domains_file()
