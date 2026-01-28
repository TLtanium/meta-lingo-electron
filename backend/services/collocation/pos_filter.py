"""
POS Filter Service
Provides POS tag filtering functionality using SpaCy Universal POS tags
"""

from typing import List, Dict, Any, Optional


# SpaCy Universal POS tags with descriptions
SPACY_POS_TAGS = {
    "ADJ": {"en": "Adjective", "zh": "形容词"},
    "ADP": {"en": "Adposition", "zh": "介词"},
    "ADV": {"en": "Adverb", "zh": "副词"},
    "AUX": {"en": "Auxiliary verb", "zh": "助动词"},
    "CCONJ": {"en": "Coordinating conjunction", "zh": "并列连词"},
    "DET": {"en": "Determiner", "zh": "限定词"},
    "INTJ": {"en": "Interjection", "zh": "感叹词"},
    "NOUN": {"en": "Noun", "zh": "名词"},
    "NUM": {"en": "Numeral", "zh": "数词"},
    "PART": {"en": "Particle", "zh": "助词"},
    "PRON": {"en": "Pronoun", "zh": "代词"},
    "PROPN": {"en": "Proper noun", "zh": "专有名词"},
    "PUNCT": {"en": "Punctuation", "zh": "标点"},
    "SCONJ": {"en": "Subordinating conjunction", "zh": "从属连词"},
    "SYM": {"en": "Symbol", "zh": "符号"},
    "VERB": {"en": "Verb", "zh": "动词"},
    "X": {"en": "Other", "zh": "其他"},
    "SPACE": {"en": "Space", "zh": "空格"}
}


# Penn Treebank POS tags (fine-grained) with descriptions
PENN_TREEBANK_TAGS = {
    # Nouns
    "NN": {"en": "Noun, singular or mass", "zh": "名词，单数或物质"},
    "NNS": {"en": "Noun, plural", "zh": "名词，复数"},
    "NNP": {"en": "Proper noun, singular", "zh": "专有名词，单数"},
    "NNPS": {"en": "Proper noun, plural", "zh": "专有名词，复数"},
    # Verbs
    "VB": {"en": "Verb, base form", "zh": "动词，原形"},
    "VBD": {"en": "Verb, past tense", "zh": "动词，过去式"},
    "VBG": {"en": "Verb, gerund/present participle", "zh": "动词，动名词/现在分词"},
    "VBN": {"en": "Verb, past participle", "zh": "动词，过去分词"},
    "VBP": {"en": "Verb, non-3rd person singular present", "zh": "动词，非第三人称单数现在时"},
    "VBZ": {"en": "Verb, 3rd person singular present", "zh": "动词，第三人称单数现在时"},
    # Adjectives
    "JJ": {"en": "Adjective", "zh": "形容词"},
    "JJR": {"en": "Adjective, comparative", "zh": "形容词，比较级"},
    "JJS": {"en": "Adjective, superlative", "zh": "形容词，最高级"},
    # Adverbs
    "RB": {"en": "Adverb", "zh": "副词"},
    "RBR": {"en": "Adverb, comparative", "zh": "副词，比较级"},
    "RBS": {"en": "Adverb, superlative", "zh": "副词，最高级"},
    # Pronouns
    "PRP": {"en": "Personal pronoun", "zh": "人称代词"},
    "PRP$": {"en": "Possessive pronoun", "zh": "物主代词"},
    "WP": {"en": "Wh-pronoun", "zh": "疑问代词"},
    "WP$": {"en": "Possessive wh-pronoun", "zh": "所有格疑问代词"},
    # Determiners
    "DT": {"en": "Determiner", "zh": "限定词"},
    "PDT": {"en": "Predeterminer", "zh": "前限定词"},
    "WDT": {"en": "Wh-determiner", "zh": "疑问限定词"},
    # Other
    "IN": {"en": "Preposition/subordinating conjunction", "zh": "介词/从属连词"},
    "CC": {"en": "Coordinating conjunction", "zh": "并列连词"},
    "CD": {"en": "Cardinal number", "zh": "基数词"},
    "EX": {"en": "Existential there", "zh": "存在句there"},
    "FW": {"en": "Foreign word", "zh": "外来词"},
    "MD": {"en": "Modal", "zh": "情态动词"},
    "POS": {"en": "Possessive ending", "zh": "所有格结尾"},
    "RP": {"en": "Particle", "zh": "小品词"},
    "TO": {"en": "to", "zh": "to"},
    "UH": {"en": "Interjection", "zh": "感叹词"},
    "WRB": {"en": "Wh-adverb", "zh": "疑问副词"},
    # Punctuation
    ".": {"en": "Sentence-final punctuation", "zh": "句末标点"},
    ",": {"en": "Comma", "zh": "逗号"},
    ":": {"en": "Colon, semi-colon", "zh": "冒号，分号"},
    "-LRB-": {"en": "Left bracket", "zh": "左括号"},
    "-RRB-": {"en": "Right bracket", "zh": "右括号"},
    "``": {"en": "Opening quotation mark", "zh": "开引号"},
    "''": {"en": "Closing quotation mark", "zh": "闭引号"},
    "#": {"en": "Pound sign", "zh": "井号"},
    "$": {"en": "Dollar sign", "zh": "美元符号"},
}


# Dependency relation tags
DEP_TAGS = {
    "nsubj": {"en": "Nominal subject", "zh": "名词性主语"},
    "nsubjpass": {"en": "Passive nominal subject", "zh": "被动名词性主语"},
    "dobj": {"en": "Direct object", "zh": "直接宾语"},
    "iobj": {"en": "Indirect object", "zh": "间接宾语"},
    "pobj": {"en": "Object of preposition", "zh": "介词宾语"},
    "amod": {"en": "Adjectival modifier", "zh": "形容词修饰语"},
    "advmod": {"en": "Adverbial modifier", "zh": "副词修饰语"},
    "nmod": {"en": "Nominal modifier", "zh": "名词修饰语"},
    "prep": {"en": "Prepositional modifier", "zh": "介词修饰语"},
    "det": {"en": "Determiner", "zh": "限定词"},
    "aux": {"en": "Auxiliary", "zh": "助动词"},
    "auxpass": {"en": "Passive auxiliary", "zh": "被动助动词"},
    "conj": {"en": "Conjunct", "zh": "并列成分"},
    "cc": {"en": "Coordinating conjunction", "zh": "并列连词"},
    "compound": {"en": "Compound", "zh": "复合词"},
    "prt": {"en": "Particle", "zh": "小品词"},
    "xcomp": {"en": "Open clausal complement", "zh": "开放性从句补语"},
    "ccomp": {"en": "Clausal complement", "zh": "从句补语"},
    "acomp": {"en": "Adjectival complement", "zh": "形容词补语"},
    "attr": {"en": "Attribute", "zh": "属性"},
    "relcl": {"en": "Relative clause modifier", "zh": "关系从句修饰语"},
    "ROOT": {"en": "Root", "zh": "根节点"},
    "punct": {"en": "Punctuation", "zh": "标点"},
    "case": {"en": "Case marker", "zh": "格标记"},
    "mark": {"en": "Marker", "zh": "标记词"},
    "appos": {"en": "Appositional modifier", "zh": "同位语"},
    "nummod": {"en": "Numeric modifier", "zh": "数词修饰语"},
    "poss": {"en": "Possession modifier", "zh": "所有格修饰语"},
    "neg": {"en": "Negation modifier", "zh": "否定修饰语"},
}


def get_pos_tags_info() -> List[Dict[str, str]]:
    """
    Get available SpaCy POS tags with descriptions
    
    Returns:
        List of POS tag info dictionaries
    """
    return [
        {
            "tag": tag,
            "description_en": info["en"],
            "description_zh": info["zh"]
        }
        for tag, info in SPACY_POS_TAGS.items()
        if tag != "SPACE"  # Exclude space from UI
    ]


def get_penn_treebank_tags_info() -> List[Dict[str, str]]:
    """
    Get Penn Treebank POS tags with descriptions
    
    Returns:
        List of tag info dictionaries
    """
    return [
        {
            "tag": tag,
            "description_en": info["en"],
            "description_zh": info["zh"]
        }
        for tag, info in PENN_TREEBANK_TAGS.items()
    ]


def get_dep_tags_info() -> List[Dict[str, str]]:
    """
    Get dependency relation tags with descriptions
    
    Returns:
        List of dep tag info dictionaries
    """
    return [
        {
            "tag": tag,
            "description_en": info["en"],
            "description_zh": info["zh"]
        }
        for tag, info in DEP_TAGS.items()
    ]


class POSFilter:
    """POS Filter for KWIC results"""
    
    def __init__(
        self,
        selected_pos: List[str] = None,
        keep_mode: bool = True
    ):
        """
        Initialize POS filter
        
        Args:
            selected_pos: List of selected POS tags
            keep_mode: If True, keep only selected POS; if False, filter out selected POS
        """
        self.selected_pos = set(selected_pos) if selected_pos else set()
        self.keep_mode = keep_mode
    
    def should_include(self, pos: str) -> bool:
        """
        Check if a token with given POS should be included
        
        Args:
            pos: POS tag of the token
            
        Returns:
            True if token should be included, False otherwise
        """
        if not self.selected_pos:
            return True
        
        if self.keep_mode:
            # Keep mode: only include if POS is in selected list
            return pos in self.selected_pos
        else:
            # Filter mode: exclude if POS is in selected list
            return pos not in self.selected_pos
    
    def filter_tokens(self, tokens: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Filter a list of tokens based on POS
        
        Args:
            tokens: List of token dictionaries with 'pos' key
            
        Returns:
            Filtered list of tokens
        """
        if not self.selected_pos:
            return tokens
        
        return [
            token for token in tokens
            if self.should_include(token.get("pos", ""))
        ]
    
    @staticmethod
    def is_valid_pos(pos: str) -> bool:
        """Check if a POS tag is valid"""
        return pos in SPACY_POS_TAGS
    
    @staticmethod
    def is_valid_penn_tag(tag: str) -> bool:
        """Check if a Penn Treebank tag is valid"""
        return tag in PENN_TREEBANK_TAGS
    
    @staticmethod
    def is_valid_dep(dep: str) -> bool:
        """Check if a dependency tag is valid"""
        return dep in DEP_TAGS
