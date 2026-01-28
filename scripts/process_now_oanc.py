#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
只处理NOW和OANC语料库
"""

import os
import csv
from collections import defaultdict
from pathlib import Path
import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

import nltk
from nltk.tokenize import word_tokenize
from nltk.stem import WordNetLemmatizer
from nltk.corpus import wordnet

lemmatizer = WordNetLemmatizer()

BASE_PATH = Path("/Volumes/TL-TANIUM/examples/corpus")
OUTPUT_PATH = Path("/Volumes/TL-TANIUM/Meta-Lingo-Electron/saves/corpus")


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
    wn_pos = get_wordnet_pos(pos_tag)
    return lemmatizer.lemmatize(word.lower(), pos=wn_pos)


class FreqCounter:
    """词频统计器"""
    def __init__(self):
        self.freq = defaultdict(int)
    
    def add(self, word, lemma, pos):
        key = (word.lower(), lemma.lower(), pos)
        self.freq[key] += 1
    
    def merge(self, other):
        for key, count in other.freq.items():
            self.freq[key] += count
    
    def to_csv(self, filepath):
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)
        sorted_items = sorted(self.freq.items(), key=lambda x: x[1], reverse=True)
        with open(filepath, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['word', 'lemma', 'pos', 'freq'])
            for (word, lemma, pos), freq in sorted_items:
                writer.writerow([word, lemma, pos, freq])
        logger.info(f"Saved {len(sorted_items)} items to {filepath}")


def parse_text_file(filepath, max_lines=10000):
    """解析文本文件"""
    counter = FreqCounter()
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            line_count = 0
            for line in f:
                if max_lines and line_count >= max_lines:
                    break
                line = line.strip()
                if not line:
                    continue
                try:
                    tokens = word_tokenize(line)
                    tagged = nltk.pos_tag(tokens)
                    for word, tag in tagged:
                        if len(word) < 2 or not word.isalpha():
                            continue
                        lemma = lemmatize_word(word, tag)
                        counter.add(word, lemma, tag)
                    line_count += 1
                except:
                    continue
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
    
    total_counter = FreqCounter()
    spoken_counter = FreqCounter()
    written_counter = FreqCounter()
    category_counters = defaultdict(FreqCounter)
    
    # 处理spoken目录
    spoken_path = oanc_path / "spoken"
    if spoken_path.exists():
        txt_files = list(spoken_path.rglob("*.txt"))
        logger.info(f"Found {len(txt_files)} spoken files")
        for i, txt_file in enumerate(txt_files):
            if (i + 1) % 100 == 0:
                logger.info(f"OANC spoken: {i + 1}/{len(txt_files)}")
            counter = parse_text_file(txt_file)
            total_counter.merge(counter)
            spoken_counter.merge(counter)
            if 'face-to-face' in str(txt_file):
                category_counters['face_to_face'].merge(counter)
            elif 'telephone' in str(txt_file):
                category_counters['telephone'].merge(counter)
    
    # 处理written_1目录
    written1_path = oanc_path / "written_1"
    if written1_path.exists():
        txt_files = list(written1_path.rglob("*.txt"))
        logger.info(f"Found {len(txt_files)} written_1 files")
        for i, txt_file in enumerate(txt_files):
            if (i + 1) % 100 == 0:
                logger.info(f"OANC written_1: {i + 1}/{len(txt_files)}")
            counter = parse_text_file(txt_file)
            total_counter.merge(counter)
            written_counter.merge(counter)
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
        txt_files = list(written2_path.rglob("*.txt"))
        logger.info(f"Found {len(txt_files)} written_2 files")
        for i, txt_file in enumerate(txt_files):
            if (i + 1) % 100 == 0:
                logger.info(f"OANC written_2: {i + 1}/{len(txt_files)}")
            counter = parse_text_file(txt_file)
            total_counter.merge(counter)
            written_counter.merge(counter)
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


def process_now():
    """处理NOW语料库"""
    logger.info("Processing NOW Corpus...")
    
    now_path = BASE_PATH / "NOW" / "2010-2024"
    if not now_path.exists():
        logger.error(f"NOW path not found: {now_path}")
        return
    
    total_counter = FreqCounter()
    country_counters = defaultdict(FreqCounter)
    
    country_names = {
        'AU': 'Australia', 'BD': 'Bangladesh', 'CA': 'Canada',
        'GB': 'UK', 'GH': 'Ghana', 'HK': 'HongKong',
        'IE': 'Ireland', 'IN': 'India', 'JM': 'Jamaica',
        'KE': 'Kenya', 'LK': 'SriLanka', 'MY': 'Malaysia',
        'NG': 'Nigeria', 'NZ': 'NewZealand', 'PH': 'Philippines',
        'PK': 'Pakistan', 'SG': 'Singapore', 'TZ': 'Tanzania',
        'US': 'USA', 'ZA': 'SouthAfrica',
    }
    
    txt_files = list(now_path.glob("*.txt"))
    total_files = len(txt_files)
    logger.info(f"Found {total_files} NOW files")
    
    for i, txt_file in enumerate(txt_files):
        logger.info(f"NOW: Processing {i + 1}/{total_files}: {txt_file.name}")
        
        filename = txt_file.stem
        parts = filename.split('-')
        country_code = parts[1].upper() if len(parts) >= 2 else 'OTHER'
        
        counter = parse_text_file(txt_file, max_lines=5000)  # 每个文件限制行数
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
    logger.info("Starting NOW and OANC processing...")
    OUTPUT_PATH.mkdir(parents=True, exist_ok=True)
    process_oanc()
    process_now()
    logger.info("All processing completed!")


if __name__ == "__main__":
    main()
