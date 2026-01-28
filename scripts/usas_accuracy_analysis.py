#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
USAS 语义域标注准确度分析脚本

对比 Wmatrix 工具和 Meta-Lingo 应用产生的语义域分析数据，
计算准确度并分析差异原因。

Usage:
    conda activate meta-lingo-electron
    python scripts/usas_accuracy_analysis.py
"""

import os
import re
import csv
from collections import defaultdict
from typing import Dict, List, Tuple, Set


def parse_wmatrix_domain_freq(filepath: str) -> Dict[str, int]:
    """解析 Wmatrix 语义域频率文件"""
    domain_freq = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split('\t')
            if len(parts) == 2:
                tag, freq = parts
                try:
                    domain_freq[tag] = int(freq)
                except ValueError:
                    pass
    return domain_freq


def parse_wmatrix_word_freq(filepath: str) -> Dict[Tuple[str, str], int]:
    """解析 Wmatrix 词语-标签频率文件"""
    word_tag_freq = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split('\t')
            if len(parts) >= 3:
                word = parts[0].lower()
                tag = parts[1]
                try:
                    freq = int(parts[2])
                    word_tag_freq[(word, tag)] = freq
                except ValueError:
                    pass
    return word_tag_freq


def parse_app_domain_csv(filepath: str) -> Dict[str, int]:
    """解析应用生成的语义域 CSV 文件"""
    domain_freq = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            domain = row['Domain']
            freq = int(row['Frequency'])
            domain_freq[domain] = freq
    return domain_freq


def parse_app_word_csv(filepath: str) -> Dict[Tuple[str, str], int]:
    """解析应用生成的词语级 CSV 文件"""
    word_tag_freq = {}
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            word = row['Word'].lower()
            tag = row['Domain']
            freq = int(row['Frequency'])
            key = (word, tag)
            if key in word_tag_freq:
                word_tag_freq[key] += freq
            else:
                word_tag_freq[key] = freq
    return word_tag_freq


def normalize_tag(tag: str) -> str:
    """标准化标签以便比较"""
    # 移除 MWE 后缀
    if tag.endswith('_MWE'):
        tag = tag[:-4]
    # 移除末尾的单字符类型标记 (如 mf, mfn, c 等)
    # 但保留实际的语义标签 (如 Z1, A1.1.1)
    return tag


def get_base_tag(tag: str) -> str:
    """获取基础标签 (移除 MWE 和性别/类型后缀)"""
    tag = normalize_tag(tag)
    # 移除末尾的 mf, mfn, c, fn 等后缀
    for suffix in ['mfnc', 'mfn', 'mfc', 'mf', 'fn', 'm', 'f', 'n', 'c']:
        if tag.endswith(suffix) and len(tag) > len(suffix):
            base = tag[:-len(suffix)]
            # 确保移除后缀后还是有效标签格式
            if re.match(r'^[A-Z]\d*', base):
                tag = base
                break
    return tag


def is_z_category(tag: str) -> bool:
    """检查标签是否属于 Z 类（语法类）"""
    base_tag = get_base_tag(tag)
    # Z 类包括 Z1-Z99 等所有以 Z 开头的标签
    return base_tag.startswith('Z')


def calculate_domain_accuracy(
    wmatrix_domain: Dict[str, int],
    app_domain: Dict[str, int],
    exclude_z: bool = True
) -> Dict:
    """计算语义域级别的准确度
    
    Args:
        wmatrix_domain: Wmatrix 语义域频率
        app_domain: 应用语义域频率
        exclude_z: 是否排除 Z 开头的语义域（语法类）
    """
    
    # 获取所有标签
    wmatrix_tags = set(wmatrix_domain.keys())
    app_tags = set(app_domain.keys())
    
    # 标准化后的映射
    wmatrix_normalized = defaultdict(int)
    app_normalized = defaultdict(int)
    
    for tag, freq in wmatrix_domain.items():
        # 排除 Z 类标签
        if exclude_z and is_z_category(tag):
            continue
        base_tag = get_base_tag(tag)
        wmatrix_normalized[base_tag] += freq
    
    for tag, freq in app_domain.items():
        # 排除 Z 类标签
        if exclude_z and is_z_category(tag):
            continue
        base_tag = get_base_tag(tag)
        app_normalized[base_tag] += freq
    
    # 计算重叠
    common_tags = set(wmatrix_normalized.keys()) & set(app_normalized.keys())
    only_wmatrix = set(wmatrix_normalized.keys()) - set(app_normalized.keys())
    only_app = set(app_normalized.keys()) - set(wmatrix_normalized.keys())
    
    # 计算频率差异
    freq_diffs = []
    for tag in common_tags:
        w_freq = wmatrix_normalized[tag]
        a_freq = app_normalized[tag]
        if w_freq > 0:
            diff_percent = (a_freq - w_freq) / w_freq * 100
            freq_diffs.append({
                'tag': tag,
                'wmatrix_freq': w_freq,
                'app_freq': a_freq,
                'diff_percent': diff_percent
            })
    
    # 按差异百分比排序
    freq_diffs.sort(key=lambda x: abs(x['diff_percent']), reverse=True)
    
    # 计算总体匹配度
    total_wmatrix = sum(wmatrix_normalized.values())
    total_app = sum(app_normalized.values())
    
    # 计算共同标签的匹配频率
    matched_freq = sum(min(wmatrix_normalized[t], app_normalized[t]) for t in common_tags)
    coverage = matched_freq / total_wmatrix * 100 if total_wmatrix > 0 else 0
    
    return {
        'total_wmatrix_tags': len(wmatrix_normalized),
        'total_app_tags': len(app_normalized),
        'common_tags': len(common_tags),
        'only_wmatrix_tags': len(only_wmatrix),
        'only_app_tags': len(only_app),
        'only_wmatrix': sorted(only_wmatrix)[:20],
        'only_app': sorted(only_app)[:20],
        'total_wmatrix_freq': total_wmatrix,
        'total_app_freq': total_app,
        'matched_freq': matched_freq,
        'coverage_percent': coverage,
        'top_diff_tags': freq_diffs[:20],
        'wmatrix_normalized': dict(wmatrix_normalized),
        'app_normalized': dict(app_normalized)
    }


def calculate_word_accuracy(
    wmatrix_word: Dict[Tuple[str, str], int],
    app_word: Dict[Tuple[str, str], int],
    exclude_z: bool = True
) -> Dict:
    """计算词语级别的准确度
    
    Args:
        wmatrix_word: Wmatrix 词语-标签频率
        app_word: 应用词语-标签频率
        exclude_z: 是否排除 Z 开头的语义域（语法类）
    """
    
    # 标准化标签
    wmatrix_normalized = defaultdict(int)
    app_normalized = defaultdict(int)
    
    for (word, tag), freq in wmatrix_word.items():
        # 排除 Z 类标签
        if exclude_z and is_z_category(tag):
            continue
        base_tag = get_base_tag(tag)
        wmatrix_normalized[(word, base_tag)] += freq
    
    for (word, tag), freq in app_word.items():
        # 排除 Z 类标签
        if exclude_z and is_z_category(tag):
            continue
        base_tag = get_base_tag(tag)
        app_normalized[(word, base_tag)] += freq
    
    # 获取所有词语
    wmatrix_words = set(w for w, t in wmatrix_normalized.keys())
    app_words = set(w for w, t in app_normalized.keys())
    common_words = wmatrix_words & app_words
    
    # 完全匹配的 (word, tag) 对
    exact_matches = set(wmatrix_normalized.keys()) & set(app_normalized.keys())
    
    # 按词语统计匹配情况
    word_match_stats = {}
    for word in common_words:
        w_tags = {t for w, t in wmatrix_normalized.keys() if w == word}
        a_tags = {t for w, t in app_normalized.keys() if w == word}
        matched = w_tags & a_tags
        word_match_stats[word] = {
            'wmatrix_tags': w_tags,
            'app_tags': a_tags,
            'matched_tags': matched,
            'match_rate': len(matched) / len(w_tags) if w_tags else 0
        }
    
    # 计算总体准确率
    total_wmatrix = sum(wmatrix_normalized.values())
    total_matched = sum(
        min(wmatrix_normalized[k], app_normalized[k]) 
        for k in exact_matches
    )
    
    accuracy = total_matched / total_wmatrix * 100 if total_wmatrix > 0 else 0
    
    # 找出差异最大的词语
    diff_words = []
    for word in list(common_words)[:500]:  # 限制分析数量
        stats = word_match_stats[word]
        if stats['match_rate'] < 1.0:
            diff_words.append({
                'word': word,
                'wmatrix_tags': sorted(stats['wmatrix_tags']),
                'app_tags': sorted(stats['app_tags']),
                'matched': sorted(stats['matched_tags']),
                'match_rate': stats['match_rate']
            })
    
    diff_words.sort(key=lambda x: x['match_rate'])
    
    return {
        'total_wmatrix_pairs': len(wmatrix_normalized),
        'total_app_pairs': len(app_normalized),
        'exact_matches': len(exact_matches),
        'total_wmatrix_words': len(wmatrix_words),
        'total_app_words': len(app_words),
        'common_words': len(common_words),
        'total_wmatrix_freq': total_wmatrix,
        'total_matched_freq': total_matched,
        'accuracy_percent': accuracy,
        'diff_words_sample': diff_words[:30]
    }


def analyze_mismatch_reasons(
    wmatrix_word: Dict[Tuple[str, str], int],
    app_word: Dict[Tuple[str, str], int],
    exclude_z: bool = True
) -> Dict:
    """分析标注不匹配的原因
    
    Args:
        wmatrix_word: Wmatrix 词语-标签频率
        app_word: 应用词语-标签频率
        exclude_z: 是否排除 Z 开头的语义域（语法类）
    """
    
    # 统计不匹配类型
    mismatch_types = defaultdict(int)
    mismatch_examples = defaultdict(list)
    
    # 标准化标签
    wmatrix_normalized = {}
    app_normalized = {}
    
    for (word, tag), freq in wmatrix_word.items():
        # 排除 Z 类标签
        if exclude_z and is_z_category(tag):
            continue
        base_tag = get_base_tag(tag)
        key = (word, base_tag)
        if key not in wmatrix_normalized:
            wmatrix_normalized[key] = {'freq': 0, 'original_tags': []}
        wmatrix_normalized[key]['freq'] += freq
        wmatrix_normalized[key]['original_tags'].append(tag)
    
    for (word, tag), freq in app_word.items():
        # 排除 Z 类标签
        if exclude_z and is_z_category(tag):
            continue
        base_tag = get_base_tag(tag)
        key = (word, base_tag)
        if key not in app_normalized:
            app_normalized[key] = {'freq': 0, 'original_tags': []}
        app_normalized[key]['freq'] += freq
        app_normalized[key]['original_tags'].append(tag)
    
    # 按词语分组
    wmatrix_by_word = defaultdict(list)
    app_by_word = defaultdict(list)
    
    for (word, tag), data in wmatrix_normalized.items():
        wmatrix_by_word[word].append((tag, data['freq']))
    
    for (word, tag), data in app_normalized.items():
        app_by_word[word].append((tag, data['freq']))
    
    common_words = set(wmatrix_by_word.keys()) & set(app_by_word.keys())
    
    for word in common_words:
        w_tags = {t for t, f in wmatrix_by_word[word]}
        a_tags = {t for t, f in app_by_word[word]}
        
        if w_tags != a_tags:
            only_w = w_tags - a_tags
            only_a = a_tags - w_tags
            
            # 分类不匹配原因
            for tag in only_w:
                # Wmatrix 有但应用没有的标签
                mismatch_types['wmatrix_only'] += 1
                if len(mismatch_examples['wmatrix_only']) < 10:
                    mismatch_examples['wmatrix_only'].append(
                        f"{word}: Wmatrix={tag}, App={list(a_tags)}"
                    )
            
            for tag in only_a:
                # 应用有但 Wmatrix 没有的标签
                mismatch_types['app_only'] += 1
                if len(mismatch_examples['app_only']) < 10:
                    mismatch_examples['app_only'].append(
                        f"{word}: App={tag}, Wmatrix={list(w_tags)}"
                    )
    
    # 分析主要的标签差异模式
    tag_confusion = defaultdict(lambda: defaultdict(int))
    
    for word in list(common_words)[:1000]:
        w_primary = max(wmatrix_by_word[word], key=lambda x: x[1])[0] if wmatrix_by_word[word] else None
        a_primary = max(app_by_word[word], key=lambda x: x[1])[0] if app_by_word[word] else None
        
        if w_primary and a_primary and w_primary != a_primary:
            tag_confusion[w_primary][a_primary] += 1
    
    # 转换为可序列化格式
    tag_confusion_list = []
    for w_tag, app_tags in tag_confusion.items():
        for a_tag, count in app_tags.items():
            if count >= 3:  # 只显示至少出现3次的混淆
                tag_confusion_list.append({
                    'wmatrix_tag': w_tag,
                    'app_tag': a_tag,
                    'count': count
                })
    
    tag_confusion_list.sort(key=lambda x: x['count'], reverse=True)
    
    return {
        'mismatch_counts': dict(mismatch_types),
        'mismatch_examples': dict(mismatch_examples),
        'tag_confusion': tag_confusion_list[:30]
    }


def main():
    """主函数"""
    
    # 文件路径
    wmatrix_domain_path = '/Volumes/TL-TANIUM/examples/texts/Huawei/HW CAR/Semantic frequency.txt'
    wmatrix_word_path = '/Volumes/TL-TANIUM/examples/texts/Huawei/HW CAR/Word and USAS tag frequency list.txt'
    app_domain_path = '/Users/tommyleo/Downloads/semantic_analysis_domain_2026-01-11.csv'
    app_word_path = '/Users/tommyleo/Downloads/semantic_analysis_word_2026-01-11.csv'
    
    print("=" * 80)
    print("USAS 语义域标注准确度分析报告")
    print("=" * 80)
    print()
    
    # 1. 解析数据
    print("正在解析数据...")
    wmatrix_domain = parse_wmatrix_domain_freq(wmatrix_domain_path)
    wmatrix_word = parse_wmatrix_word_freq(wmatrix_word_path)
    app_domain = parse_app_domain_csv(app_domain_path)
    app_word = parse_app_word_csv(app_word_path)
    
    print(f"  Wmatrix 语义域数据: {len(wmatrix_domain)} 个标签")
    print(f"  Wmatrix 词语数据: {len(wmatrix_word)} 个(词,标签)对")
    print(f"  应用语义域数据: {len(app_domain)} 个标签")
    print(f"  应用词语数据: {len(app_word)} 个(词,标签)对")
    print()
    
    # 2. 语义域级别准确度（排除 Z 类）
    print("-" * 80)
    print("一、语义域级别分析（排除 Z 类语法标签）")
    print("-" * 80)
    
    domain_results = calculate_domain_accuracy(wmatrix_domain, app_domain, exclude_z=True)
    
    print(f"\n1. 标签覆盖情况:")
    print(f"   Wmatrix 标签数: {domain_results['total_wmatrix_tags']}")
    print(f"   应用标签数: {domain_results['total_app_tags']}")
    print(f"   共同标签数: {domain_results['common_tags']}")
    print(f"   仅 Wmatrix: {domain_results['only_wmatrix_tags']}")
    print(f"   仅应用: {domain_results['only_app_tags']}")
    
    print(f"\n2. 频率匹配:")
    print(f"   Wmatrix 总频率: {domain_results['total_wmatrix_freq']}")
    print(f"   应用总频率: {domain_results['total_app_freq']}")
    print(f"   匹配频率: {domain_results['matched_freq']}")
    print(f"   覆盖率: {domain_results['coverage_percent']:.2f}%")
    
    print(f"\n3. 仅在 Wmatrix 中出现的标签 (前20):")
    for tag in domain_results['only_wmatrix'][:20]:
        print(f"   - {tag}")
    
    print(f"\n4. 仅在应用中出现的标签 (前20):")
    for tag in domain_results['only_app'][:20]:
        print(f"   - {tag}")
    
    print(f"\n5. 频率差异最大的标签 (前15):")
    for item in domain_results['top_diff_tags'][:15]:
        print(f"   {item['tag']}: Wmatrix={item['wmatrix_freq']}, "
              f"App={item['app_freq']}, 差异={item['diff_percent']:.1f}%")
    
    # 3. 词语级别准确度（排除 Z 类）
    print()
    print("-" * 80)
    print("二、词语级别分析（排除 Z 类语法标签）")
    print("-" * 80)
    
    word_results = calculate_word_accuracy(wmatrix_word, app_word, exclude_z=True)
    
    print(f"\n1. 词语-标签对统计:")
    print(f"   Wmatrix (词,标签)对数: {word_results['total_wmatrix_pairs']}")
    print(f"   应用 (词,标签)对数: {word_results['total_app_pairs']}")
    print(f"   精确匹配对数: {word_results['exact_matches']}")
    
    print(f"\n2. 词语覆盖:")
    print(f"   Wmatrix 词语数: {word_results['total_wmatrix_words']}")
    print(f"   应用词语数: {word_results['total_app_words']}")
    print(f"   共同词语数: {word_results['common_words']}")
    
    print(f"\n3. 准确率:")
    print(f"   总频率匹配准确率: {word_results['accuracy_percent']:.2f}%")
    
    print(f"\n4. 标注差异示例 (匹配率最低的词语):")
    for item in word_results['diff_words_sample'][:15]:
        print(f"   '{item['word']}':")
        print(f"      Wmatrix: {item['wmatrix_tags']}")
        print(f"      App: {item['app_tags']}")
        print(f"      匹配率: {item['match_rate']:.1%}")
    
    # 4. 不匹配原因分析（排除 Z 类）
    print()
    print("-" * 80)
    print("三、不匹配原因分析（排除 Z 类语法标签）")
    print("-" * 80)
    
    mismatch_results = analyze_mismatch_reasons(wmatrix_word, app_word, exclude_z=True)
    
    print(f"\n1. 不匹配类型统计:")
    for mtype, count in mismatch_results['mismatch_counts'].items():
        print(f"   {mtype}: {count}")
    
    print(f"\n2. 不匹配示例:")
    for mtype, examples in mismatch_results['mismatch_examples'].items():
        print(f"\n   {mtype}:")
        for ex in examples[:5]:
            print(f"     - {ex}")
    
    print(f"\n3. 常见标签混淆模式 (Wmatrix -> App):")
    for item in mismatch_results['tag_confusion'][:20]:
        print(f"   {item['wmatrix_tag']} -> {item['app_tag']}: {item['count']}次")
    
    # 5. 总结
    print()
    print("=" * 80)
    print("四、分析总结")
    print("=" * 80)
    
    print("""
1. 总体准确率（排除 Z 类语法标签）:
   - 语义域覆盖率: {:.2f}%
   - 词语标注准确率: {:.2f}%

2. 主要差异原因:
   
   a) MWE (多词表达) 处理差异:
      - Wmatrix 会为多词表达添加 _MWE 后缀
      - 应用的 MWE 检测算法可能与 Wmatrix 不同
      
   b) 性别/类型标记差异:
      - Wmatrix 使用 mf, mfn, c 等后缀标记名词性别/类型
      - 应用可能未完全实现这些细分标签
      
   c) 消歧算法差异:
      - Wmatrix 使用其特有的消歧规则
      - 应用使用 PyMUSAS 的消歧机制
      - 两者在歧义词处理上可能选择不同的标签
      
   d) 分词差异:
      - Wmatrix 和 SpaCy 的分词结果可能不同
      - 影响到标签分配的词语边界
      
   e) 标签粒度差异:
      - 某些标签的细分级别不同
      - 如 I2.1 vs I2.1c, S2 vs S2mf

3. 改进建议:
   - 完善 MWE 检测规则，参考 Wmatrix 的处理方式
   - 添加性别/类型标记支持
   - 优化消歧算法，特别是高频词的处理
   - 统一分词标准
""".format(
        domain_results['coverage_percent'],
        word_results['accuracy_percent']
    ))
    
    # 输出详细报告到文件
    report_path = '/Volumes/TL-TANIUM/Meta-Lingo-Electron/scripts/usas_accuracy_report.txt'
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("USAS 语义域标注准确度详细报告\n")
        f.write("=" * 80 + "\n\n")
        
        f.write("一、语义域频率对比 (标准化后)\n")
        f.write("-" * 80 + "\n")
        all_tags = sorted(set(domain_results['wmatrix_normalized'].keys()) | 
                         set(domain_results['app_normalized'].keys()))
        for tag in all_tags:
            w_freq = domain_results['wmatrix_normalized'].get(tag, 0)
            a_freq = domain_results['app_normalized'].get(tag, 0)
            diff = a_freq - w_freq
            diff_pct = diff / w_freq * 100 if w_freq > 0 else float('inf') if a_freq > 0 else 0
            f.write(f"{tag}\t{w_freq}\t{a_freq}\t{diff}\t{diff_pct:.1f}%\n")
    
    print(f"\n详细报告已保存到: {report_path}")


if __name__ == '__main__':
    main()
