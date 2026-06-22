"""
Reliability Tokenization
信度计算的 token 获取与"token→标签集合"构建

为什么需要 token：以字符为分析单位会被正字法词长隐式加权（长词错一个边界
≈基本一致，短词错一个边界≈基本不一致），n 也被虚高且相邻字符不独立。改以
token（"每词一票"）为默认单位后，重叠/边界分歧自然落成"逐 token 一致"，多标签
落成"token 上的标签集合距离"，由 reliability_distances 统一度量。

坐标系约定：本模块一律工作在**原始文本** offset 空间（与 annotation 的
startPosition/endPosition 以及 spaCy token 的 start/end 一致）。调用方负责保证
传入的 raw_text 是未经 normalize_text 折叠的原文。

token 获取链（首个通过 offset 校验者胜，永不硬失败）：
  ① 读 archive 内嵌 spacyAnnotation.tokens（零 I/O，最常见）
  ② 经 textId 解析同级 .spacy.json sidecar
  ③ 用 SpacyService 现场分词（处理非英语）
  ④ 正则兜底（按非空白串切词）
"""

import math
import re
from typing import Any, Dict, List, Optional, Tuple, FrozenSet

# Token: {text, start, end}（start/end 为原始文本字符 offset，end 不含）
Token = Dict[str, Any]


# ==================== offset 解析与校验 ====================

def _ann_span(ann: Dict[str, Any]) -> Tuple[Optional[int], Optional[int], str]:
    """从一条标注里稳健地取出 (start, end, label)，兼容多种字段名。

    注意 dict.get(key, default) 在 key 存在但值为 None 时返回 None，因此逐个回退。
    """
    start = ann.get('position')
    if start is None:
        start = ann.get('startPosition')
    if start is None:
        start = ann.get('start_position')

    text = ann.get('text', '') or ''
    label = ann.get('label', '') or ''

    end = ann.get('end_position')
    if end is None:
        end = ann.get('endPosition')
    if end is None and start is not None:
        end = start + len(text)

    if start is None or end is None:
        return None, None, label
    return int(start), int(end), label


def _validate_token_offsets(tokens: List[Token], raw_text: str, sample: int = 300) -> bool:
    """抽样校验 token 的 (start,end) 是否对齐 raw_text。

    允许 <=1% 的不匹配（容忍极少数空白/特殊字符差异）。空 token 列表视为不通过。
    """
    if not tokens:
        return False
    n = len(tokens)
    step = max(1, n // sample)
    checked = 0
    mismatched = 0
    for i in range(0, n, step):
        t = tokens[i]
        s, e = t.get('start'), t.get('end')
        if s is None or e is None or s < 0 or e > len(raw_text) or s >= e:
            mismatched += 1
            checked += 1
            continue
        if raw_text[s:e] != t.get('text', ''):
            mismatched += 1
        checked += 1
    if checked == 0:
        return False
    return (mismatched / checked) <= 0.01


def _clean_tokens(raw_tokens: List[Dict[str, Any]]) -> List[Token]:
    """从 spaCy 风格 token 列表里抽取 {text,start,end}，丢弃纯空白 token。"""
    out: List[Token] = []
    for t in raw_tokens or []:
        if t.get('is_space'):
            continue
        s, e = t.get('start'), t.get('end')
        if s is None or e is None:
            continue
        out.append({'text': t.get('text', ''), 'start': int(s), 'end': int(e)})
    return out


# ==================== token 获取链各环节 ====================

def _tokens_from_embedded(archive_content: Dict[str, Any], raw_text: str) -> Optional[List[Token]]:
    """① archive 内嵌 spacyAnnotation.tokens（最常见，offset 本就基于原文）。"""
    spacy = archive_content.get('spacyAnnotation') or archive_content.get('spacy_annotation')
    if not isinstance(spacy, dict):
        return None
    toks = _clean_tokens(spacy.get('tokens', []))
    return toks if _validate_token_offsets(toks, raw_text) else None


def _tokens_from_sidecar(archive_content: Dict[str, Any], raw_text: str) -> Optional[List[Token]]:
    """② 经 textId 解析同级 .spacy.json sidecar。"""
    text_id = archive_content.get('textId') or archive_content.get('text_id')
    if not text_id:
        return None
    try:
        from pathlib import Path
        import json as _json
        from models.database import TextDB  # 延迟导入，避免拉起重依赖链
        text = TextDB.get_by_id(text_id)
        if not text:
            return None
        content_path = text.get('content_path')
        if not content_path:
            return None
        content_path = Path(content_path)
        sidecar = content_path.parent / f"{content_path.stem}.spacy.json"
        if not sidecar.is_file():
            return None
        with open(sidecar, 'r', encoding='utf-8') as f:
            data = _json.load(f)
        toks = _clean_tokens(data.get('tokens', []))
        # sidecar 是针对语料文件的；只有当 offset 仍对齐当前 raw_text 才采用
        return toks if _validate_token_offsets(toks, raw_text) else None
    except Exception:
        return None


def _tokens_from_spacy(raw_text: str, language: Optional[str]) -> Optional[List[Token]]:
    """③ 现场用 SpacyService 分词（语言相关；未知语言内部回退英语）。"""
    try:
        from services.spacy_service import get_spacy_service  # 延迟导入
        svc = get_spacy_service()
        result = svc.annotate_text(raw_text, language=language or 'english')
        if not result or not result.get('success'):
            return None
        toks = _clean_tokens(result.get('tokens', []))
        return toks if _validate_token_offsets(toks, raw_text) else None
    except Exception:
        return None


def _tokens_from_regex(raw_text: str) -> List[Token]:
    """④ 正则兜底：按非空白串切词，offset 天然对齐原文。永不返回空（除非空文本）。"""
    return [
        {'text': m.group(0), 'start': m.start(), 'end': m.end()}
        for m in re.finditer(r'\S+', raw_text)
    ]


def resolve_language(archive_content: Dict[str, Any], corpus_name: Optional[str] = None) -> str:
    """解析语料语言；archive 常无 language 字段，回退语料元数据，再回退英语。"""
    lang = archive_content.get('language') or archive_content.get('corpusLanguage')
    if lang:
        return lang
    name = corpus_name or archive_content.get('corpusName')
    if name:
        try:
            from models.database import CorpusDB  # 延迟导入
            corpora = CorpusDB.get_all() if hasattr(CorpusDB, 'get_all') else []
            for c in corpora:
                if c.get('name') == name and c.get('language'):
                    return c['language']
        except Exception:
            pass
    return 'english'


def acquire_tokens(
    archives_content: List[Dict[str, Any]],
    raw_text: str,
    language: Optional[str] = None,
) -> Tuple[List[Token], str]:
    """为信度计算的共同文本获取一条 token 链（所有编码者共享）。

    Args:
        archives_content: 各编码者 archive 的已解析 dict 列表（用于尝试内嵌/sidecar）
        raw_text: 原始共同文本（未归一化）
        language: 可选语言；None 时自动解析

    Returns:
        (tokens, source)，source ∈ {'embedded','sidecar','spacy','regex'}。
        永不抛异常，永不返回空 token（除非 raw_text 本身无非空白字符）。
    """
    archives_content = archives_content or []

    # ① 内嵌：任一编码者 archive 带可用内嵌 token 即采用
    for ac in archives_content:
        if isinstance(ac, dict):
            toks = _tokens_from_embedded(ac, raw_text)
            if toks:
                return toks, 'embedded'

    # ② sidecar：任一编码者 archive 能解析出对齐的 sidecar 即采用
    for ac in archives_content:
        if isinstance(ac, dict):
            toks = _tokens_from_sidecar(ac, raw_text)
            if toks:
                return toks, 'sidecar'

    # ③ 现场 spaCy
    if language is None and archives_content:
        first = next((a for a in archives_content if isinstance(a, dict)), {})
        language = resolve_language(first)
    toks = _tokens_from_spacy(raw_text, language)
    if toks:
        return toks, 'spacy'

    # ④ 正则兜底
    return _tokens_from_regex(raw_text), 'regex'


# ==================== token → 标签集合 ====================

def _coverage_ok(overlap_len: int, token_len: int, coverage: str) -> bool:
    """判断某标注是否覆盖该 token。

    'any'      : 任意重叠（overlap>0），IoU 风格宽松视图
    'majority' : 重叠 >= ceil(50% token 长度)，标准 span→token 投影规则（推荐）
    """
    if overlap_len <= 0 or token_len <= 0:
        return False
    if coverage == 'any':
        return overlap_len > 0
    return overlap_len >= math.ceil(0.5 * token_len)


def build_token_label_sets(
    tokens: List[Token],
    annotation_data: List[Dict[str, Any]],
    coverage: str = 'majority',
    include_empty: bool = False,
    included_labels: Optional[set] = None,
) -> Tuple[List[List[FrozenSet[str]]], List[int]]:
    """把每个编码者的标注投影到 token 网格上的标签集合。

    Args:
        tokens: 共享 token 链（{text,start,end}，原文 offset）
        annotation_data: 编码者列表，每个 dict 含 'annotations'（标注列表）
        coverage: 覆盖规则 'majority'(默认) | 'any'
        include_empty: True 时把所有 token 都作为候选单位（含 O 类别）；
                       False(默认) 只保留"≥1 编码者非空"的候选 token
        included_labels: 仅考虑这些标签（None=全部）；被忽略的标签不参与计算，
                         只含被忽略标签的 token 也随之退出候选

    Returns:
        (label_sets, candidate_indices)
        - label_sets: 每个编码者一份、长度等于 token 数的 frozenset 列表
          （未覆盖处为空 frozenset；保留全长以便 KWIC 等按 token 索引对齐）
        - candidate_indices: 参与系数计算的 token 索引列表
    """
    n_tokens = len(tokens)
    n_coders = len(annotation_data)

    # 先收集每个 (coder, token) 的可变集合
    sets: List[List[set]] = [[set() for _ in range(n_tokens)] for _ in range(n_coders)]

    for ci, coder in enumerate(annotation_data):
        for ann in coder.get('annotations', []):
            s, e, label = _ann_span(ann)
            if s is None or e is None or not label or e <= s:
                continue
            if included_labels is not None and label not in included_labels:
                continue
            # 找出与 [s,e) 重叠的 token，按覆盖规则赋标签
            for ti, t in enumerate(tokens):
                ts, te = t['start'], t['end']
                if te <= s:
                    continue
                if ts >= e:
                    break  # token 已按 start 升序，越过区间即可停止
                overlap = min(te, e) - max(ts, s)
                if _coverage_ok(overlap, te - ts, coverage):
                    sets[ci][ti].add(label)

    label_sets: List[List[FrozenSet[str]]] = [
        [frozenset(sets[ci][ti]) for ti in range(n_tokens)] for ci in range(n_coders)
    ]

    if include_empty:
        # 全部"词单位"为候选（排除纯标点）：未标注的词隐含为负类。
        # 这是"只标正例"型稀疏标注（如隐喻 MIPVU）的标准信度口径——
        # "两人都认为非隐喻"的一致也要计入，否则 kappa 悖论会让结果失真。
        candidate_indices = [
            ti for ti in range(n_tokens)
            if _is_lexical(tokens[ti].get('text', ''))
            or any(label_sets[ci][ti] for ci in range(n_coders))
        ]
    else:
        candidate_indices = [
            ti for ti in range(n_tokens)
            if any(label_sets[ci][ti] for ci in range(n_coders))
        ]

    return label_sets, candidate_indices


def _is_lexical(text: str) -> bool:
    """词单位判定：含至少一个字母/数字字符（排除纯标点/符号）。"""
    return any(c.isalnum() for c in (text or ''))


def build_char_label_sets(
    annotation_data: List[Dict[str, Any]],
    text_length: int,
    include_empty: bool = False,
    included_labels: Optional[set] = None,
) -> Tuple[List[List[FrozenSet[str]]], List[int]]:
    """字符级单位：每个字符位置一个标签集合（unit='char' 的 IoU 风格视图）。

    与 token 路径返回同样的 (label_sets, candidate_indices) 结构，因此两种单位
    都能复用同一套集合系数计算；候选过滤同样默认只保留"≥1 编码者非空"的位置，
    从而修正旧字符路径"空-空也算一致"的虚高问题。
    included_labels=None 时考虑全部标签，否则只考虑指定标签。
    """
    n_coders = len(annotation_data)
    sets: List[List[set]] = [[set() for _ in range(text_length)] for _ in range(n_coders)]

    for ci, coder in enumerate(annotation_data):
        for ann in coder.get('annotations', []):
            s, e, label = _ann_span(ann)
            if s is None or e is None or not label:
                continue
            if included_labels is not None and label not in included_labels:
                continue
            s = max(0, s)
            e = min(text_length, e)
            for pos in range(s, e):
                sets[ci][pos].add(label)

    label_sets: List[List[FrozenSet[str]]] = [
        [frozenset(sets[ci][p]) for p in range(text_length)] for ci in range(n_coders)
    ]

    if include_empty:
        candidate_indices = list(range(text_length))
    else:
        candidate_indices = [
            p for p in range(text_length)
            if any(label_sets[ci][p] for ci in range(n_coders))
        ]

    return label_sets, candidate_indices
