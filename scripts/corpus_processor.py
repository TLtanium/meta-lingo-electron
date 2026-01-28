#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
语料库词频统计处理脚本
处理 BNC, OANC, NOW, Brown Corpus 四个语料库
生成包含 word/lemma/pos/freq 的CSV文件
"""

import os
import re
import csv
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
import logging

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 尝试导入NLTK
try:
    import nltk
    from nltk.tokenize import word_tokenize
    from nltk.stem import WordNetLemmatizer
    from nltk.corpus import wordnet
    nltk.download('punkt', quiet=True)
    nltk.download('averaged_perceptron_tagger', quiet=True)
    nltk.download('wordnet', quiet=True)
    nltk.download('punkt_tab', quiet=True)
    nltk.download('averaged_perceptron_tagger_eng', quiet=True)
    NLTK_AVAILABLE = True
    lemmatizer = WordNetLemmatizer()
except ImportError:
    NLTK_AVAILABLE = False
    logger.warning("NLTK not available, some features will be limited")

# 路径配置
BASE_PATH = Path("/Volumes/TL-TANIUM/examples/corpus")
OUTPUT_PATH = Path("/Volumes/TL-TANIUM/Meta-Lingo-Electron/saves/corpus")

# CLAWS5 到 Penn Treebank 映射
CLAWS5_TO_PENN = {
    # 名词
    'NN0': 'NN', 'NN1': 'NN', 'NN2': 'NNS',
    'NP0': 'NNP', 'NP1': 'NNP', 'NP2': 'NNPS',
    # 动词
    'VBB': 'VBP', 'VBD': 'VBD', 'VBG': 'VBG', 'VBI': 'VB', 'VBN': 'VBN', 'VBZ': 'VBZ',
    'VDB': 'VBP', 'VDD': 'VBD', 'VDG': 'VBG', 'VDI': 'VB', 'VDN': 'VBN', 'VDZ': 'VBZ',
    'VHB': 'VBP', 'VHD': 'VBD', 'VHG': 'VBG', 'VHI': 'VB', 'VHN': 'VBN', 'VHZ': 'VBZ',
    'VVB': 'VBP', 'VVD': 'VBD', 'VVG': 'VBG', 'VVI': 'VB', 'VVN': 'VBN', 'VVZ': 'VBZ',
    'VM0': 'MD',
    # 形容词
    'AJ0': 'JJ', 'AJC': 'JJR', 'AJS': 'JJS',
    # 副词
    'AV0': 'RB', 'AVP': 'RB', 'AVQ': 'WRB',
    # 限定词/冠词
    'AT0': 'DT', 'DT0': 'DT', 'DPS': 'PRP$', 'DTQ': 'WDT',
    # 代词
    'PNP': 'PRP', 'PNI': 'PRP', 'PNQ': 'WP', 'PNX': 'PRP',
    # 介词
    'PRP': 'IN', 'PRF': 'IN',
    # 连词
    'CJC': 'CC', 'CJS': 'IN', 'CJT': 'IN',
    # 数词
    'CRD': 'CD', 'ORD': 'JJ',
    # 标点
    'PUN': '.', 'PUL': '(', 'PUR': ')', 'PUQ': "''",
    # 其他
    'TO0': 'TO', 'XX0': 'RB', 'ZZ0': 'SYM', 'UNC': 'NN',
    'ITJ': 'UH', 'EX0': 'EX', 'POS': 'POS',
}

# Brown Tagset 到 Penn Treebank 映射
BROWN_TO_PENN = {
    # 名词
    'nn': 'NN', 'nns': 'NNS', 'np': 'NNP', 'nps': 'NNPS',
    'nn$': 'NN', 'nns$': 'NNS', 'np$': 'NNP', 'nps$': 'NNPS',
    'nn-tl': 'NNP', 'nns-tl': 'NNPS', 'np-tl': 'NNP',
    'nn-hl': 'NN', 'nns-hl': 'NNS',
    # 动词
    'vb': 'VB', 'vbd': 'VBD', 'vbg': 'VBG', 'vbn': 'VBN', 'vbz': 'VBZ',
    'vb-hl': 'VB', 'vbd-hl': 'VBD', 'vbg-hl': 'VBG', 'vbn-hl': 'VBN',
    'hv': 'VB', 'hvd': 'VBD', 'hvg': 'VBG', 'hvn': 'VBN', 'hvz': 'VBZ',
    'be': 'VB', 'bed': 'VBD', 'bedz': 'VBD', 'beg': 'VBG', 'bem': 'VBP',
    'ben': 'VBN', 'ber': 'VBP', 'bez': 'VBZ',
    'do': 'VB', 'dod': 'VBD', 'doz': 'VBZ',
    'md': 'MD',
    # 形容词
    'jj': 'JJ', 'jjr': 'JJR', 'jjs': 'JJS', 'jjt': 'JJS',
    'jj-tl': 'JJ', 'jj-hl': 'JJ',
    # 副词
    'rb': 'RB', 'rbr': 'RBR', 'rbt': 'RBS', 'rp': 'RP',
    'rb-hl': 'RB', 'wrb': 'WRB', 'ql': 'RB',
    # 限定词
    'at': 'DT', 'dt': 'DT', 'dti': 'DT', 'dts': 'DT', 'dtx': 'DT',
    'ap': 'DT', 'abn': 'DT', 'abx': 'DT',
    # 代词
    'pp$': 'PRP$', 'pps': 'PRP', 'ppss': 'PRP', 'ppo': 'PRP',
    'ppl': 'PRP', 'ppls': 'PRP',
    'wdt': 'WDT', 'wp$': 'WP$', 'wps': 'WP', 'wpo': 'WP',
    'pn': 'PRP', 'pn$': 'PRP$',
    # 介词
    'in': 'IN', 'in-tl': 'IN', 'in-hl': 'IN',
    # 连词
    'cc': 'CC', 'cs': 'IN',
    # 数词
    'cd': 'CD', 'cd-tl': 'CD', 'cd-hl': 'CD', 'od': 'JJ',
    # 标点
    '.': '.', ',': ',', ':': ':', '(': '(', ')': ')', "''": "''", '``': '``',
    '--': ':', '*': 'SYM', "'": "''", '"': "''",
    # 其他
    'to': 'TO', 'ex': 'EX', 'uh': 'UH', 'fw': 'FW', 'nil': 'NN',
    'nr': 'NN', 'nr-tl': 'NNP', 'nr-hl': 'NN',
}


def convert_claws5_to_penn(tag):
    """将CLAWS5标签转换为Penn Treebank标签"""
    if not tag:
        return 'NN'
    # 处理复合标签如 'VVN-AJ0'
    tag = tag.split('-')[0] if '-' in tag else tag
    return CLAWS5_TO_PENN.get(tag.upper(), 'NN')


def convert_brown_to_penn(tag):
    """将Brown标签转换为Penn Treebank标签"""
    if not tag:
        return 'NN'
    tag_lower = tag.lower()
    # 处理复合标签
    if '$' in tag_lower:
        base_tag = tag_lower.replace('$', '')
        if base_tag in BROWN_TO_PENN:
            return BROWN_TO_PENN.get(tag_lower, BROWN_TO_PENN.get(base_tag, 'NN'))
    return BROWN_TO_PENN.get(tag_lower, 'NN')


def get_wordnet_pos(penn_tag):
    """将Penn Treebank标签转换为WordNet词性"""
    if penn_tag.startswith('J'):
        return wordnet.ADJ
    elif penn_tag.startswith('V'):
        return wordnet.VERB
    elif penn_tag.startswith('N'):
        return wordnet.NOUN
    elif penn_tag.startswith('R'):
        return wordnet.ADV
    else:
        return wordnet.NOUN


def lemmatize_word(word, pos_tag):
    """词形还原"""
    if not NLTK_AVAILABLE:
        return word.lower()
    wn_pos = get_wordnet_pos(pos_tag)
    return lemmatizer.lemmatize(word.lower(), pos=wn_pos)


class FreqCounter:
    """词频统计器"""
    def __init__(self):
        self.freq = defaultdict(int)  # (word, lemma, pos) -> count
    
    def add(self, word, lemma, pos):
        """添加一个词"""
        key = (word.lower(), lemma.lower(), pos)
        self.freq[key] += 1
    
    def merge(self, other):
        """合并另一个计数器"""
        for key, count in other.freq.items():
            self.freq[key] += count
    
    def to_csv(self, filepath):
        """导出为CSV文件"""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        
        # 按频率降序排序
        sorted_items = sorted(self.freq.items(), key=lambda x: x[1], reverse=True)
        
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['word', 'lemma', 'pos', 'freq'])
            for (word, lemma, pos), freq in sorted_items:
                writer.writerow([word, lemma, pos, freq])
        
        logger.info(f"Saved {len(sorted_items)} items to {filepath}")


# ========== BNC 处理 ==========

def parse_bnc_xml(filepath):
    """解析BNC XML文件"""
    counter = FreqCounter()
    text_type = None  # 'spoken' or 'written'
    domain = None
    
    try:
        tree = ET.parse(filepath)
        root = tree.getroot()
        
        # 判断文本类型
        wtext = root.find('.//wtext')
        stext = root.find('.//stext')
        
        if wtext is not None:
            text_type = 'written'
            type_attr = wtext.get('type', '').upper()
            # 映射到领域
            domain_map = {
                'FICTION': 'imaginative',
                'NONAC': 'informative',
                'ACPROSE': 'informative',
                'NEWS': 'informative',
                'OTHERPUB': 'informative',
                'UNPUB': 'informative',
            }
            domain = domain_map.get(type_attr, 'other')
        elif stext is not None:
            text_type = 'spoken'
            domain = 'spoken'
        
        # 解析所有w元素
        for w in root.iter('w'):
            word = ''.join(w.itertext()).strip()
            if not word:
                continue
            
            c5_tag = w.get('c5', '')
            hw = w.get('hw', word.lower())
            
            penn_tag = convert_claws5_to_penn(c5_tag)
            lemma = hw if hw else lemmatize_word(word, penn_tag)
            
            counter.add(word, lemma, penn_tag)
    
    except ET.ParseError as e:
        logger.warning(f"XML parse error in {filepath}: {e}")
    except Exception as e:
        logger.warning(f"Error processing {filepath}: {e}")
    
    return counter, text_type, domain


def process_bnc():
    """处理BNC语料库"""
    logger.info("Processing BNC...")
    
    bnc_path = BASE_PATH / "British National Corpus 1994" / "Texts"
    if not bnc_path.exists():
        logger.error(f"BNC path not found: {bnc_path}")
        return
    
    # 总计数器
    total_counter = FreqCounter()
    spoken_counter = FreqCounter()
    written_counter = FreqCounter()
    domain_counters = defaultdict(FreqCounter)
    
    # BNC领域分类（基于文件夹）
    written_domains = {
        'A': 'world_affairs',       # 世界事务
        'B': 'arts',                # 艺术
        'C': 'commerce_finance',    # 商业金融
        'D': 'social_science',      # 社会科学
        'E': 'natural_science',     # 自然科学
        'F': 'applied_science',     # 应用科学
        'G': 'belief_thought',      # 信仰思想
        'H': 'leisure',             # 休闲
        'J': 'imaginative',         # 虚构文学
        'K': 'spoken',              # 口语
    }
    
    # 遍历所有XML文件
    xml_files = list(bnc_path.rglob("*.xml"))
    total_files = len(xml_files)
    
    for i, xml_file in enumerate(xml_files):
        if (i + 1) % 100 == 0:
            logger.info(f"BNC: Processing {i + 1}/{total_files}")
        
        counter, text_type, domain = parse_bnc_xml(xml_file)
        total_counter.merge(counter)
        
        # 根据文件路径判断分类
        rel_path = xml_file.relative_to(bnc_path)
        folder = str(rel_path.parts[0]) if rel_path.parts else ''
        
        if folder.startswith('K') or text_type == 'spoken':
            spoken_counter.merge(counter)
            domain_counters['spoken'].merge(counter)
        else:
            written_counter.merge(counter)
            # 根据文件夹确定领域
            domain_name = written_domains.get(folder[0] if folder else '', 'other')
            domain_counters[domain_name].merge(counter)
    
    # 保存结果
    output_dir = OUTPUT_PATH / "bnc"
    total_counter.to_csv(output_dir / "bnc_total.csv")
    spoken_counter.to_csv(output_dir / "bnc_spoken.csv")
    written_counter.to_csv(output_dir / "bnc_written.csv")
    
    for domain, counter in domain_counters.items():
        counter.to_csv(output_dir / f"bnc_{domain}.csv")
    
    logger.info("BNC processing completed")


# ========== Brown Corpus 处理 ==========

def parse_brown_file(filepath):
    """解析Brown Corpus文件"""
    counter = FreqCounter()
    
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        # 匹配 word/tag 模式
        pattern = r'(\S+)/(\S+)'
        matches = re.findall(pattern, content)
        
        for word, tag in matches:
            # 清理词
            word = word.strip()
            if not word or word in ['``', "''", '--']:
                continue
            
            penn_tag = convert_brown_to_penn(tag)
            lemma = lemmatize_word(word, penn_tag)
            
            counter.add(word, lemma, penn_tag)
    
    except Exception as e:
        logger.warning(f"Error processing {filepath}: {e}")
    
    return counter


def process_brown():
    """处理Brown Corpus"""
    logger.info("Processing Brown Corpus...")
    
    brown_path = BASE_PATH / "Brown Corpus"
    if not brown_path.exists():
        logger.error(f"Brown path not found: {brown_path}")
        return
    
    # 分类定义
    categories = {
        'ca': ('news', 'informative'),
        'cb': ('editorial', 'informative'),
        'cc': ('reviews', 'informative'),
        'cd': ('religion', 'informative'),
        'ce': ('hobbies', 'informative'),
        'cf': ('lore', 'informative'),
        'cg': ('belles_lettres', 'informative'),
        'ch': ('government', 'informative'),
        'cj': ('learned', 'informative'),
        'ck': ('fiction', 'imaginative'),
        'cl': ('mystery', 'imaginative'),
        'cm': ('science_fiction', 'imaginative'),
        'cn': ('adventure', 'imaginative'),
        'cp': ('romance', 'imaginative'),
        'cr': ('humor', 'imaginative'),
    }
    
    # 计数器
    total_counter = FreqCounter()
    informative_counter = FreqCounter()
    imaginative_counter = FreqCounter()
    category_counters = defaultdict(FreqCounter)
    
    # 遍历所有文件
    for filename in os.listdir(brown_path):
        if filename.startswith('.') or filename in ['cats.txt', 'CONTENTS', 'README']:
            continue
        
        filepath = brown_path / filename
        if not filepath.is_file():
            continue
        
        # 获取分类
        prefix = filename[:2].lower()
        if prefix not in categories:
            continue
        
        cat_name, cat_type = categories[prefix]
        
        counter = parse_brown_file(filepath)
        total_counter.merge(counter)
        category_counters[cat_name].merge(counter)
        
        if cat_type == 'informative':
            informative_counter.merge(counter)
        else:
            imaginative_counter.merge(counter)
    
    # 保存结果
    output_dir = OUTPUT_PATH / "brown"
    total_counter.to_csv(output_dir / "brown_total.csv")
    informative_counter.to_csv(output_dir / "brown_informative.csv")
    imaginative_counter.to_csv(output_dir / "brown_imaginative.csv")
    
    for cat_name, counter in category_counters.items():
        counter.to_csv(output_dir / f"brown_{cat_name}.csv")
    
    logger.info("Brown Corpus processing completed")


# ========== OANC 处理 ==========

def parse_oanc_txt(filepath):
    """解析OANC文本文件"""
    counter = FreqCounter()
    
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        if NLTK_AVAILABLE:
            tokens = word_tokenize(content)
            tagged = nltk.pos_tag(tokens)
            
            for word, tag in tagged:
                if not word.isalpha():
                    continue
                lemma = lemmatize_word(word, tag)
                counter.add(word, lemma, tag)
    
    except Exception as e:
        logger.warning(f"Error processing {filepath}: {e}")
    
    return counter


def parse_oanc_xml(filepath):
    """解析OANC XML文件 (带标注的)"""
    counter = FreqCounter()
    
    try:
        # OANC的XML可能有多种格式
        tree = ET.parse(filepath)
        root = tree.getroot()
        
        # 尝试查找带POS标注的元素
        for elem in root.iter():
            if elem.tag in ['tok', 'token', 'word', 'w']:
                word = elem.text or ''
                word = word.strip()
                if not word:
                    continue
                
                # 获取POS标签
                pos = elem.get('pos', elem.get('type', ''))
                if not pos:
                    pos = 'NN'
                
                lemma = elem.get('lemma', lemmatize_word(word, pos))
                counter.add(word, lemma, pos)
    
    except ET.ParseError:
        # 如果XML解析失败，尝试作为文本处理
        pass
    except Exception as e:
        logger.warning(f"Error processing {filepath}: {e}")
    
    return counter


def process_oanc():
    """处理OANC语料库"""
    logger.info("Processing OANC...")
    
    oanc_path = BASE_PATH / "OANC" / "data"
    if not oanc_path.exists():
        logger.error(f"OANC path not found: {oanc_path}")
        return
    
    # 计数器
    total_counter = FreqCounter()
    spoken_counter = FreqCounter()
    written_counter = FreqCounter()
    category_counters = defaultdict(FreqCounter)
    
    # 处理spoken目录
    spoken_path = oanc_path / "spoken"
    if spoken_path.exists():
        for txt_file in spoken_path.rglob("*.txt"):
            counter = parse_oanc_txt(txt_file)
            total_counter.merge(counter)
            spoken_counter.merge(counter)
            
            # 细分类
            if 'face-to-face' in str(txt_file):
                category_counters['face_to_face'].merge(counter)
            elif 'telephone' in str(txt_file):
                category_counters['telephone'].merge(counter)
    
    # 处理written_1目录
    written1_path = oanc_path / "written_1"
    if written1_path.exists():
        for txt_file in written1_path.rglob("*.txt"):
            counter = parse_oanc_txt(txt_file)
            total_counter.merge(counter)
            written_counter.merge(counter)
            
            # 细分类
            rel_path = str(txt_file.relative_to(written1_path))
            if 'fiction' in rel_path:
                category_counters['fiction'].merge(counter)
            elif 'journal' in rel_path or 'slate' in rel_path:
                category_counters['journal'].merge(counter)
            elif 'letters' in rel_path:
                category_counters['letters'].merge(counter)
    
    # 处理written_2目录
    written2_path = oanc_path / "written_2"
    if written2_path.exists():
        for txt_file in written2_path.rglob("*.txt"):
            counter = parse_oanc_txt(txt_file)
            total_counter.merge(counter)
            written_counter.merge(counter)
            
            # 细分类
            rel_path = str(txt_file.relative_to(written2_path))
            if 'non-fiction' in rel_path:
                category_counters['non_fiction'].merge(counter)
            elif 'technical' in rel_path:
                if 'biomed' in rel_path:
                    category_counters['biomed'].merge(counter)
                elif 'government' in rel_path:
                    category_counters['government'].merge(counter)
                elif '911report' in rel_path:
                    category_counters['911report'].merge(counter)
                elif 'plos' in rel_path:
                    category_counters['plos'].merge(counter)
                else:
                    category_counters['technical'].merge(counter)
            elif 'travel' in rel_path:
                category_counters['travel_guides'].merge(counter)
    
    # 保存结果
    output_dir = OUTPUT_PATH / "oanc"
    total_counter.to_csv(output_dir / "oanc_total.csv")
    spoken_counter.to_csv(output_dir / "oanc_spoken.csv")
    written_counter.to_csv(output_dir / "oanc_written.csv")
    
    for cat_name, counter in category_counters.items():
        counter.to_csv(output_dir / f"oanc_{cat_name}.csv")
    
    logger.info("OANC processing completed")


# ========== NOW 处理 ==========

def parse_now_file(filepath):
    """解析NOW文件"""
    counter = FreqCounter()
    
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            # NOW文件可能很大，逐行处理
            for line in f:
                line = line.strip()
                if not line:
                    continue
                
                if NLTK_AVAILABLE:
                    try:
                        tokens = word_tokenize(line)
                        tagged = nltk.pos_tag(tokens)
                        
                        for word, tag in tagged:
                            if len(word) < 2 or not word.isalpha():
                                continue
                            lemma = lemmatize_word(word, tag)
                            counter.add(word, lemma, tag)
                    except:
                        continue
    
    except Exception as e:
        logger.warning(f"Error processing {filepath}: {e}")
    
    return counter


def process_now():
    """处理NOW语料库"""
    logger.info("Processing NOW Corpus...")
    
    now_path = BASE_PATH / "NOW" / "2010-2024"
    if not now_path.exists():
        logger.error(f"NOW path not found: {now_path}")
        return
    
    # 计数器
    total_counter = FreqCounter()
    country_counters = defaultdict(FreqCounter)
    
    # 国家代码映射
    country_names = {
        'AU': 'Australia', 'BD': 'Bangladesh', 'CA': 'Canada',
        'GB': 'UK', 'GH': 'Ghana', 'HK': 'HongKong',
        'IE': 'Ireland', 'IN': 'India', 'JM': 'Jamaica',
        'KE': 'Kenya', 'LK': 'SriLanka', 'MY': 'Malaysia',
        'NG': 'Nigeria', 'NZ': 'NewZealand', 'PH': 'Philippines',
        'PK': 'Pakistan', 'SG': 'Singapore', 'TZ': 'Tanzania',
        'US': 'USA', 'ZA': 'SouthAfrica',
    }
    
    # 遍历所有txt文件
    txt_files = list(now_path.glob("*.txt"))
    total_files = len(txt_files)
    
    for i, txt_file in enumerate(txt_files):
        if (i + 1) % 10 == 0:
            logger.info(f"NOW: Processing {i + 1}/{total_files}")
        
        # 从文件名提取国家代码
        filename = txt_file.stem  # e.g., "10-AU"
        parts = filename.split('-')
        if len(parts) >= 2:
            country_code = parts[1].upper()
        else:
            country_code = 'OTHER'
        
        counter = parse_now_file(txt_file)
        total_counter.merge(counter)
        country_counters[country_code].merge(counter)
    
    # 保存结果
    output_dir = OUTPUT_PATH / "now"
    total_counter.to_csv(output_dir / "now_total.csv")
    
    for country_code, counter in country_counters.items():
        country_name = country_names.get(country_code, country_code)
        counter.to_csv(output_dir / f"now_{country_name}.csv")
    
    logger.info("NOW Corpus processing completed")


def main():
    """主函数"""
    logger.info("Starting corpus processing...")
    logger.info(f"Output directory: {OUTPUT_PATH}")
    
    # 创建输出目录
    OUTPUT_PATH.mkdir(parents=True, exist_ok=True)
    
    # 处理各个语料库
    process_bnc()
    process_brown()
    process_oanc()
    process_now()
    
    logger.info("All corpus processing completed!")


if __name__ == "__main__":
    main()
