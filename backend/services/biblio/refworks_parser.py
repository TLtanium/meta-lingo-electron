"""
Refworks Format Parser for WOS and CNKI

Parses Refworks plain text export files from Web of Science and CNKI databases.
"""

import re
import uuid
from typing import List, Dict, Any, Optional, Tuple
from enum import Enum


class SourceType(str, Enum):
    WOS = "WOS"
    CNKI = "CNKI"


# CNKI Refworks field mappings
CNKI_FIELD_MAP = {
    'RT': 'doc_type',
    'SR': 'serial_number',
    'A1': 'authors',
    'A3': 'advisor',  # For dissertations
    'AD': 'institutions',
    'T1': 'title',
    'JF': 'journal',
    'YR': 'year',
    'IS': 'issue',
    'VO': 'volume',
    'OP': 'pages',
    'K1': 'keywords',
    'AB': 'abstract',
    'SN': 'issn',
    'CN': 'cn_number',
    'LA': 'language',
    'DS': 'database',
    'LK': 'source_url',
    'DO': 'doi',
    'PB': 'publisher',
    'CL': 'degree_level',  # For dissertations
}

# WOS Refworks field mappings
WOS_FIELD_MAP = {
    'PT': 'doc_type',
    'AU': 'authors',
    'AF': 'authors_full',
    'TI': 'title',
    'SO': 'journal',
    'VL': 'volume',
    'IS': 'issue',
    'BP': 'page_start',
    'EP': 'page_end',
    'DI': 'doi',
    'DT': 'doc_type_detail',
    'PD': 'pub_date',
    'PY': 'year',
    'AB': 'abstract',
    'TC': 'citation_count',
    'Z9': 'total_citations',
    'U1': 'usage_180',
    'U2': 'usage_since_2013',
    'SN': 'issn',
    'EI': 'eissn',
    'DA': 'date_added',
    'UT': 'unique_id',
    'C1': 'addresses',
    'RP': 'reprint_address',
    'EM': 'email',
    'FU': 'funding',
    'FX': 'funding_text',
    'CR': 'cited_references',
    'NR': 'cited_ref_count',
    'SC': 'subject_category',
    'WC': 'wos_category',
    'GA': 'document_delivery',
    'PM': 'pubmed_id',
    'OI': 'orcid',
    'RI': 'researcher_id',
    'LA': 'language',
    'DE': 'author_keywords',
    'ID': 'keywords_plus',
    'Z1': 'title_native',
    'S1': 'source_native',
    'AK': 'abstract_korean',
}

# Document type mappings
DOC_TYPE_MAP = {
    # CNKI types
    'Journal Article': 'Journal Article',
    'Dissertation/Thesis': 'Dissertation/Thesis',
    'Conference Paper': 'Conference Paper',
    # WOS types
    'J': 'Journal Article',
    'C': 'Conference Paper',
    'B': 'Book',
    'S': 'Book Chapter',
    'P': 'Patent',
    'Article': 'Journal Article',
    'Review': 'Review',
    'research-article': 'Journal Article',
}


class RefworksParser:
    """Parser for Refworks format files"""
    
    def __init__(self, source_type: SourceType):
        self.source_type = source_type
        self.field_map = WOS_FIELD_MAP if source_type == SourceType.WOS else CNKI_FIELD_MAP
    
    def parse_file(self, content: str) -> Tuple[List[Dict[str, Any]], List[str]]:
        """
        Parse Refworks file content
        
        Returns:
            Tuple of (entries list, errors list)
        """
        if self.source_type == SourceType.WOS:
            return self._parse_wos(content)
        else:
            return self._parse_cnki(content)
    
    def _parse_wos(self, content: str) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Parse WOS Refworks format"""
        entries = []
        errors = []
        
        # Split into records by ER (End of Record)
        # WOS format uses ER to mark end of each record
        records = re.split(r'\nER\s*\n', content)
        
        for i, record in enumerate(records):
            record = record.strip()
            if not record:
                continue
            
            # Skip header lines
            if record.startswith('FN ') or record.startswith('VR '):
                continue
            
            try:
                entry = self._parse_wos_record(record)
                if entry and entry.get('title'):
                    entries.append(entry)
            except Exception as e:
                errors.append(f"Record {i+1}: {str(e)}")
        
        return entries, errors
    
    def _parse_wos_record(self, record: str) -> Optional[Dict[str, Any]]:
        """Parse a single WOS record"""
        raw_data = {}
        current_field = None
        current_value = []
        
        lines = record.split('\n')
        
        for line in lines:
            # Check if line starts with a field tag (2 uppercase letters followed by space)
            match = re.match(r'^([A-Z][A-Z0-9])\s+(.*)$', line)
            if match:
                # Save previous field
                if current_field:
                    raw_data[current_field] = '\n'.join(current_value).strip()
                
                current_field = match.group(1)
                current_value = [match.group(2)]
            elif line.startswith('   ') and current_field:
                # Continuation line (starts with 3 spaces)
                current_value.append(line.strip())
        
        # Save last field
        if current_field:
            raw_data[current_field] = '\n'.join(current_value).strip()
        
        if not raw_data:
            return None
        
        # Convert to standard format
        entry = self._convert_wos_entry(raw_data)
        entry['raw_data'] = raw_data
        
        return entry
    
    def _convert_wos_entry(self, raw: Dict[str, str]) -> Dict[str, Any]:
        """Convert WOS raw data to standard entry format"""
        entry = {
            'id': str(uuid.uuid4()),
            'title': raw.get('TI', '').strip(),
            'authors': [],
            'institutions': [],
            'countries': [],
            'journal': raw.get('SO', '').strip(),
            'year': None,
            'volume': raw.get('VL', '').strip() or None,
            'issue': raw.get('IS', '').strip() or None,
            'pages': None,
            'doi': raw.get('DI', '').strip() or None,
            'keywords': [],
            'abstract': raw.get('AB', '').strip() or None,
            'doc_type': None,
            'language': raw.get('LA', '').strip() or None,
            'citation_count': 0,
            'source_url': None,
            'unique_id': raw.get('UT', '').strip() or None,
        }
        
        # Parse year
        year_str = raw.get('PY', '').strip()
        if year_str:
            try:
                entry['year'] = int(year_str)
            except ValueError:
                pass
        
        # Parse pages
        bp = raw.get('BP', '').strip()
        ep = raw.get('EP', '').strip()
        if bp and ep:
            entry['pages'] = f"{bp}-{ep}"
        elif bp:
            entry['pages'] = bp
        
        # Parse authors (try multiple fields)
        authors_str = raw.get('AU', '') or raw.get('AF', '')
        if authors_str:
            # Authors are separated by newlines in WOS
            authors = [a.strip() for a in authors_str.split('\n') if a.strip()]
            # Clean up author names (remove trailing commas)
            entry['authors'] = [re.sub(r',+$', '', a).strip() for a in authors if a.strip()]
        
        # Parse institutions and countries from C1 (addresses)
        addresses = raw.get('C1', '')
        if addresses:
            institutions, countries = self._parse_wos_addresses(addresses)
            entry['institutions'] = institutions
            entry['countries'] = countries
        
        # Also try RP (reprint address) for additional institution info
        if not entry['institutions']:
            rp = raw.get('RP', '')
            if rp:
                # RP format: "Author (reprint author), Institution, Address"
                rp_parts = rp.split(',')
                if len(rp_parts) >= 2:
                    # Second part is usually institution
                    inst = rp_parts[1].strip() if len(rp_parts) > 1 else ''
                    if inst and len(inst) > 3:
                        entry['institutions'] = [inst]
        
        # Parse keywords (combine DE and ID fields)
        keywords = []
        
        # DE = Author Keywords
        de_str = raw.get('DE', '')
        if de_str:
            # Keywords are separated by semicolons
            kws = [k.strip() for k in de_str.split(';') if k.strip()]
            keywords.extend(kws)
        
        # ID = Keywords Plus (WOS generated)
        id_str = raw.get('ID', '')
        if id_str:
            kws = [k.strip() for k in id_str.split(';') if k.strip()]
            keywords.extend(kws)
        
        # If no keywords from DE/ID, try to extract from title
        if not keywords:
            title = entry.get('title', '')
            if title:
                # Extract significant words from title (simple approach)
                stop_words = {'the', 'a', 'an', 'of', 'in', 'on', 'for', 'to', 'and', 'or', 'by', 
                              'from', 'with', 'as', 'at', 'is', 'are', 'was', 'were', 'be', 'been',
                              'its', 'this', 'that', 'these', 'those', 'using', 'based'}
                words = re.findall(r'\b[a-zA-Z]{4,}\b', title.lower())
                title_keywords = [w for w in words if w not in stop_words][:5]
                keywords.extend(title_keywords)
        
        entry['keywords'] = list(set(keywords))  # Remove duplicates
        
        # Parse citation count (try multiple fields)
        for tc_field in ['TC', 'Z9', 'U1']:
            tc = raw.get(tc_field, '').strip()
            if tc:
                try:
                    entry['citation_count'] = int(tc)
                    break
                except ValueError:
                    pass
        
        # Parse document type
        dt = raw.get('DT', '') or raw.get('PT', '')
        entry['doc_type'] = DOC_TYPE_MAP.get(dt.strip(), 'Other')
        
        return entry
    
    def _parse_wos_addresses(self, addresses: str) -> Tuple[List[str], List[str]]:
        """Parse WOS C1 field to extract institutions and countries"""
        institutions = []
        countries = set()
        
        # C1 format: [Author1; Author2] Institution, City, Country
        # Multiple addresses separated by newlines
        for line in addresses.split('\n'):
            line = line.strip()
            if not line:
                continue
            
            # Remove author names in brackets
            line = re.sub(r'\[.*?\]', '', line).strip()
            
            if line:
                # The last part after comma is usually the country
                parts = line.split(',')
                if len(parts) >= 2:
                    country = parts[-1].strip().rstrip('.')
                    # Clean up country name
                    country = re.sub(r'\s+\d+$', '', country)  # Remove postal codes
                    if country and len(country) < 50:  # Sanity check
                        countries.add(country)
                
                # Institution is usually the first part
                if parts:
                    inst = parts[0].strip()
                    if inst and inst not in institutions:
                        institutions.append(inst)
        
        return institutions, list(countries)
    
    def _parse_cnki(self, content: str) -> Tuple[List[Dict[str, Any]], List[str]]:
        """Parse CNKI Refworks format"""
        entries = []
        errors = []
        
        # CNKI format: records separated by blank lines
        # Each field is on its own line with format: TAG value
        records = re.split(r'\n\s*\n', content)
        
        for i, record in enumerate(records):
            record = record.strip()
            if not record:
                continue
            
            try:
                entry = self._parse_cnki_record(record)
                if entry and entry.get('title'):
                    entries.append(entry)
            except Exception as e:
                errors.append(f"Record {i+1}: {str(e)}")
        
        return entries, errors
    
    def _parse_cnki_record(self, record: str) -> Optional[Dict[str, Any]]:
        """Parse a single CNKI record"""
        raw_data = {}
        
        lines = record.split('\n')
        current_field = None
        current_value = []
        
        for line in lines:
            # CNKI format: TAG value (TAG is 2 uppercase letters)
            match = re.match(r'^([A-Z][A-Z0-9])\s+(.*)$', line)
            if match:
                # Save previous field
                if current_field:
                    raw_data[current_field] = ' '.join(current_value).strip()
                
                current_field = match.group(1)
                current_value = [match.group(2)]
            elif current_field:
                # Continuation line
                current_value.append(line.strip())
        
        # Save last field
        if current_field:
            raw_data[current_field] = ' '.join(current_value).strip()
        
        if not raw_data:
            return None
        
        # Convert to standard format
        entry = self._convert_cnki_entry(raw_data)
        entry['raw_data'] = raw_data
        
        return entry
    
    def _convert_cnki_entry(self, raw: Dict[str, str]) -> Dict[str, Any]:
        """Convert CNKI raw data to standard entry format"""
        entry = {
            'id': str(uuid.uuid4()),
            'title': raw.get('T1', '').strip(),
            'authors': [],
            'institutions': [],
            'countries': ['China'],  # CNKI is primarily Chinese sources
            'journal': raw.get('JF', '').strip() or None,
            'year': None,
            'volume': raw.get('VO', '').strip() or None,
            'issue': raw.get('IS', '').strip() or None,
            'pages': raw.get('OP', '').strip() or None,
            'doi': raw.get('DO', '').strip() or None,
            'keywords': [],
            'abstract': raw.get('AB', '').strip() or None,
            'doc_type': None,
            'language': raw.get('LA', '').strip() or None,
            'citation_count': 0,
            'source_url': raw.get('LK', '').strip() or None,
            'unique_id': None,
        }
        
        # Parse year
        year_str = raw.get('YR', '').strip()
        if year_str:
            try:
                entry['year'] = int(year_str)
            except ValueError:
                pass
        
        # Parse authors (semicolon separated in CNKI)
        authors_str = raw.get('A1', '')
        if authors_str:
            # Authors are separated by semicolons
            authors = [a.strip() for a in authors_str.split(';') if a.strip()]
            entry['authors'] = authors
        
        # Add advisor for dissertations
        advisor = raw.get('A3', '').strip()
        if advisor:
            entry['authors'].append(f"Advisor: {advisor}")
        
        # Parse institutions (semicolon separated)
        inst_str = raw.get('AD', '')
        if inst_str:
            institutions = [i.strip() for i in inst_str.split(';') if i.strip()]
            entry['institutions'] = institutions
        
        # Parse keywords (semicolon separated)
        kw_str = raw.get('K1', '')
        if kw_str:
            keywords = [k.strip() for k in kw_str.split(';') if k.strip()]
            entry['keywords'] = keywords
        
        # Parse document type
        rt = raw.get('RT', '').strip()
        entry['doc_type'] = DOC_TYPE_MAP.get(rt, 'Other')
        
        # Generate unique ID from DOI or URL
        if entry['doi']:
            entry['unique_id'] = f"CNKI:{entry['doi']}"
        elif entry['source_url']:
            entry['unique_id'] = f"CNKI:{hash(entry['source_url'])}"
        
        return entry


def parse_refworks_file(content: str, source_type: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parse a Refworks file
    
    Args:
        content: File content as string
        source_type: Either 'WOS' or 'CNKI'
    
    Returns:
        Tuple of (entries list, errors list)
    """
    st = SourceType(source_type)
    parser = RefworksParser(st)
    return parser.parse_file(content)


def detect_source_type(content: str) -> Optional[str]:
    """
    Auto-detect the source type from file content
    
    Returns:
        'WOS', 'CNKI', or None if cannot determine
    """
    # WOS files typically start with "FN Clarivate Analytics Web of Science"
    if 'Clarivate Analytics Web of Science' in content[:500]:
        return 'WOS'
    
    # WOS uses ER to end records
    if '\nER\n' in content or content.strip().endswith('ER'):
        return 'WOS'
    
    # CNKI files typically have DS CNKI field
    if '\nDS CNKI' in content:
        return 'CNKI'
    
    # Check for CNKI-specific fields
    if '\nCN ' in content:  # CN number is CNKI-specific
        return 'CNKI'
    
    # Check for WOS-specific fields
    if '\nUT WOS:' in content or '\nUT KJD:' in content:
        return 'WOS'
    
    return None


def validate_source_type(content: str, expected_type: str) -> Tuple[bool, str]:
    """
    Validate that file content matches expected source type
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    detected = detect_source_type(content)
    
    if detected is None:
        return False, "Cannot detect file format. Please ensure you are uploading a valid Refworks export file."
    
    if detected != expected_type:
        return False, f"File appears to be {detected} format, but library expects {expected_type} format."
    
    return True, ""

