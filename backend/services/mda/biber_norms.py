"""
Biber (1988) reference statistics for Multidimensional Analysis.

All values are taken from the MAT v1.3.2 implementation, which reproduces
Biber (1988: 77) feature means/standard deviations, Biber (1988: 172) genre
dimension statistics and Biber (1989) text type centroids.

Feature codes follow MAT: plain codes are counted from the token's main tag,
bracketed codes (e.g. ``[PASS]``) are supplementary tags a token can carry in
addition to its main tag. AWL and TTR are text-level measures.
"""

# Mean frequencies per 100 tokens in Biber's (1988) corpus (AWL in characters,
# TTR = types in the first 400 tokens / 4)
BIBER_MEANS = {
    "VBD": 4.01, "[PEAS]": 0.86, "VPRT": 7.77, "PLACE": 0.31, "TIME": 0.52,
    "FPP1": 2.72, "SPP2": 0.99, "TPP3": 2.99, "PIT": 1.03, "DEMP": 0.46,
    "INPR": 0.14, "[PROD]": 0.30, "[WHQU]": 0.02, "NOMZ": 1.99, "GER": 0.7,
    "NN": 18.05, "[PASS]": 0.96, "[BYPA]": 0.08, "[BEMA]": 2.83, "EX": 0.22,
    "THVC": 0.33, "THAC": 0.03, "[WHCL]": 0.06, "TO": 1.49, "[PRESP]": 0.1,
    "[PASTP]": 0.01, "[WZPAST]": 0.25, "[WZPRES]": 0.16, "TSUB": 0.04,
    "TOBJ": 0.08, "[WHSUB]": 0.21, "[WHOBJ]": 0.14, "[PIRE]": 0.07,
    "[SERE]": 0.01, "CAUS": 0.11, "CONC": 0.05, "COND": 0.25, "OSUB": 0.1,
    "PIN": 11.05, "JJ": 6.07, "PRED": 0.47, "RB": 6.56, "TTR": 51.1,
    "AWL": 4.5, "CONJ": 0.12, "DWNT": 0.2, "HDG": 0.06, "AMP": 0.27,
    "EMPH": 0.63, "DPAR": 0.12, "DEMO": 0.99, "POMD": 0.58, "NEMD": 0.21,
    "PRMD": 0.56, "[PUBV]": 0.77, "[PRIV]": 1.80, "[SUAV]": 0.29,
    "[SMP]": 0.08, "[CONT]": 1.35, "[THATD]": 0.31, "[STPR]": 0.2,
    "[SPIN]": 0.0, "[SPAU]": 0.55, "PHC": 0.34, "ANDC": 0.45, "SYNE": 0.17,
    "XX0": 0.85,
}

BIBER_SDS = {
    "VBD": 3.04, "[PEAS]": 0.52, "VPRT": 3.43, "PLACE": 0.34, "TIME": 0.35,
    "FPP1": 2.61, "SPP2": 1.38, "TPP3": 2.25, "PIT": 0.71, "DEMP": 0.48,
    "INPR": 0.20, "[PROD]": 0.35, "[WHQU]": 0.06, "NOMZ": 1.44, "GER": 0.38,
    "NN": 3.56, "[PASS]": 0.66, "[BYPA]": 0.13, "[BEMA]": 0.95, "EX": 0.18,
    "THVC": 0.29, "THAC": 0.06, "[WHCL]": 0.1, "TO": 0.56, "[PRESP]": 0.17,
    "[PASTP]": 0.04, "[WZPAST]": 0.31, "[WZPRES]": 0.18, "TSUB": 0.08,
    "TOBJ": 0.11, "[WHSUB]": 0.20, "[WHOBJ]": 0.17, "[PIRE]": 0.11,
    "[SERE]": 0.04, "CAUS": 0.17, "CONC": 0.08, "COND": 0.22, "OSUB": 0.11,
    "PIN": 2.54, "JJ": 1.88, "PRED": 0.26, "RB": 1.76, "TTR": 5.2,
    "AWL": 0.4, "CONJ": 0.16, "DWNT": 0.16, "HDG": 0.13, "AMP": 0.26,
    "EMPH": 0.42, "DPAR": 0.23, "DEMO": 0.42, "POMD": 0.35, "NEMD": 0.21,
    "PRMD": 0.42, "[PUBV]": 0.54, "[PRIV]": 1.04, "[SUAV]": 0.31,
    "[SMP]": 0.1, "[CONT]": 1.86, "[THATD]": 0.41, "[STPR]": 0.27,
    "[SPIN]": 0.00001, "[SPAU]": 0.25, "PHC": 0.27, "ANDC": 0.48,
    "SYNE": 0.16, "XX0": 0.61,
}

# The 67 features in canonical (MAT Statistics CSV) order
BIBER_FEATURES = [
    "AWL", "TTR", "AMP", "ANDC", "[BEMA]", "[BYPA]", "CAUS", "CONC", "COND",
    "CONJ", "[CONT]", "DEMO", "DEMP", "DPAR", "DWNT", "EMPH", "EX", "FPP1",
    "GER", "HDG", "INPR", "JJ", "NEMD", "NN", "NOMZ", "OSUB", "[PASS]",
    "[PASTP]", "[PEAS]", "PHC", "PIN", "[PIRE]", "PIT", "PLACE", "POMD",
    "PRED", "[PRESP]", "[PRIV]", "PRMD", "[PROD]", "[PUBV]", "RB", "[SERE]",
    "[SMP]", "[SPAU]", "[SPIN]", "SPP2", "[STPR]", "[SUAV]", "SYNE", "THAC",
    "[THATD]", "THVC", "TIME", "TO", "TOBJ", "TPP3", "TSUB", "VBD", "VPRT",
    "[WHCL]", "[WHOBJ]", "[WHQU]", "[WHSUB]", "[WZPAST]", "[WZPRES]", "XX0",
]

# Dimension formulas: feature → +1 / -1 loading (MAT calc_dimensions.pl)
DIMENSION_FEATURES = {
    1: {
        "[PRIV]": 1, "[THATD]": 1, "[CONT]": 1, "VPRT": 1, "SPP2": 1,
        "[PROD]": 1, "XX0": 1, "DEMP": 1, "EMPH": 1, "FPP1": 1, "PIT": 1,
        "[BEMA]": 1, "CAUS": 1, "DPAR": 1, "INPR": 1, "AMP": 1, "POMD": 1,
        "ANDC": 1, "[STPR]": 1,
        "NN": -1, "AWL": -1, "PIN": -1, "TTR": -1, "JJ": -1,
    },
    2: {"VBD": 1, "TPP3": 1, "[PEAS]": 1, "[PUBV]": 1, "SYNE": 1, "[PRESP]": 1},
    3: {
        "[WHOBJ]": 1, "[WHSUB]": 1, "PHC": 1, "NOMZ": 1,
        "TIME": -1, "PLACE": -1, "RB": -1,
    },
    4: {"TO": 1, "PRMD": 1, "[SUAV]": 1, "COND": 1, "NEMD": 1, "[SPAU]": 1},
    5: {"CONJ": 1, "[PASS]": 1, "[WZPAST]": 1, "OSUB": 1},
    6: {"THVC": 1, "DEMO": 1},
}

# Genre statistics per dimension: (mean, low, high) — Biber (1988: 172),
# ranges as plotted by MAT dimensions_graph.pl
GENRES = [
    "Conversations", "Broadcasts", "Prepared speeches", "Personal letters",
    "General fiction", "Press reportage", "Academic prose", "Official documents",
]

GENRE_DIMENSION_STATS = {
    1: [
        (35.3, 17.7, 54.1), (-4.3, -19.6, 16.9), (2.2, -7.3, 14.8),
        (19.5, 13.8, 27.0), (-0.8, -19.6, 22.3), (-15.1, -24.1, -3.1),
        (-14.9, -26.5, 7.1), (-18.1, -26.3, -9.1),
    ],
    2: [
        (-0.6, -4.4, 4.0), (-3.3, -5.2, -0.6), (0.7, -4.9, 6.1),
        (0.3, -0.9, 1.7), (5.9, 1.2, 15.6), (0.4, -3.2, 7.7),
        (-2.6, -6.2, 5.3), (-2.9, -5.4, -1.5),
    ],
    3: [
        (-3.9, -10.5, 1.6), (-9.0, -15.8, -2.2), (0.3, -5.6, 6.1),
        (-3.6, -6.6, -1.3), (-3.1, -8.2, 1.0), (-0.3, -6.2, 6.5),
        (4.2, -5.8, 18.6), (7.3, 2.1, 13.4),
    ],
    4: [
        (-0.3, -5.2, 6.5), (-4.4, -6.9, -0.3), (0.4, -4.4, 11.2),
        (1.5, -1.6, 6.4), (0.9, -3.2, 7.2), (-0.7, -6.0, 5.7),
        (-0.5, -7.1, 17.5), (-0.2, -8.4, 8.7),
    ],
    5: [
        (-3.2, -4.5, 0.1), (-1.7, -4.7, 5.4), (-1.9, -3.9, 1.0),
        (-2.8, -4.8, 0.5), (-2.5, -4.8, 1.5), (0.6, -4.4, 5.5),
        (5.5, -2.4, 16.8), (4.7, 0.6, 8.7),
    ],
    6: [
        (0.3, -3.6, 6.5), (-1.3, -3.6, 1.7), (3.4, -0.8, 7.5),
        (-1.4, -3.7, 0.3), (-1.6, -4.3, 2.7), (-0.9, -4.0, 3.9),
        (0.5, -3.3, 9.2), (-0.9, -3.8, 2.7),
    ],
}

# Text type centroids on Dimensions 1-5 — Biber (1989), as used by MAT for
# Euclidean-distance classification (calc_dimensions.pl)
TEXT_TYPES = {
    "Intimate interpersonal interaction": (45.0, -1.0, -6.0, 1.0, -4.0),
    "Informational interaction": (30.0, -1.0, -4.0, 1.0, -3.0),
    "Scientific exposition": (-15.0, -2.5, 4.0, -2.0, 9.0),
    "Learned exposition": (-20.0, -2.0, 5.0, -3.0, 2.0),
    "Imaginative narrative": (5.0, 7.0, -4.0, 1.0, -2.0),
    "General narrative exposition": (-10.0, 2.0, 0.0, -1.0, 0.0),
    "Situated reportage": (0.0, -3.0, -13.0, -4.5, -3.0),
    "Involved persuasion": (5.0, -2.0, 2.0, 4.0, -1.0),
}

# Raw tags that MAT drops when counting Biber features (count_only.pl).
# startswith-style prefixes are expanded explicitly.
EXCLUDED_COUNT_TAGS = {
    "NULL", "CC", "CD", "DT", "FW", "IN", "LS", "NNP", "NNPS", "PDT", "POS",
    "PRP", "PRPS", "QUAN", "QUPR", "RP", "SYM", "UH", "WDT", "WRB", "MD",
    "VB", "VBN", "VBG", "WP", "WPS",
}

DIMENSION_LABELS = {
    1: {"en": "Involved vs. Informational Production", "zh": "参与性 vs 信息性表达"},
    2: {"en": "Narrative vs. Non-Narrative Concerns", "zh": "叙事性 vs 非叙事性"},
    3: {"en": "Explicit vs. Situation-Dependent Reference", "zh": "明晰指称 vs 情境依赖指称"},
    4: {"en": "Overt Expression of Persuasion", "zh": "显性劝说表达"},
    5: {"en": "Abstract vs. Non-Abstract Information", "zh": "抽象 vs 非抽象信息"},
    6: {"en": "On-Line Informational Elaboration", "zh": "即时信息扩展"},
}

# Feature metadata: full names (EN/ZH) for tables and tooltips
FEATURE_INFO = {
    "AWL": {"en": "Average word length", "zh": "平均词长"},
    "TTR": {"en": "Type-token ratio (first 400 tokens)", "zh": "类符形符比（前400词）"},
    "AMP": {"en": "Amplifiers", "zh": "增强语"},
    "ANDC": {"en": "Independent clause coordination (and)", "zh": "独立小句并列 (and)"},
    "[BEMA]": {"en": "Be as main verb", "zh": "be 作主要动词"},
    "[BYPA]": {"en": "By-passives", "zh": "by 被动式"},
    "CAUS": {"en": "Causative subordinator (because)", "zh": "原因从属连词 (because)"},
    "CONC": {"en": "Concessive subordinators (although/though)", "zh": "让步从属连词"},
    "COND": {"en": "Conditional subordinators (if/unless)", "zh": "条件从属连词"},
    "CONJ": {"en": "Conjuncts", "zh": "连接副词"},
    "[CONT]": {"en": "Contractions", "zh": "缩略形式"},
    "DEMO": {"en": "Demonstratives", "zh": "指示限定词"},
    "DEMP": {"en": "Demonstrative pronouns", "zh": "指示代词"},
    "DPAR": {"en": "Discourse particles", "zh": "话语小品词"},
    "DWNT": {"en": "Downtoners", "zh": "弱化语"},
    "EMPH": {"en": "Emphatics", "zh": "强调语"},
    "EX": {"en": "Existential there", "zh": "存在句 there"},
    "FPP1": {"en": "First person pronouns", "zh": "第一人称代词"},
    "GER": {"en": "Gerunds", "zh": "动名词"},
    "HDG": {"en": "Hedges", "zh": "模糊限制语"},
    "INPR": {"en": "Indefinite pronouns", "zh": "不定代词"},
    "JJ": {"en": "Attributive adjectives", "zh": "定语形容词"},
    "NEMD": {"en": "Necessity modals", "zh": "必要性情态动词"},
    "NN": {"en": "Total other nouns", "zh": "其他名词总量"},
    "NOMZ": {"en": "Nominalizations", "zh": "名物化"},
    "OSUB": {"en": "Other adverbial subordinators", "zh": "其他状语从属连词"},
    "[PASS]": {"en": "Agentless passives", "zh": "无施事被动式"},
    "[PASTP]": {"en": "Past participial clauses", "zh": "过去分词小句"},
    "[PEAS]": {"en": "Perfect aspect", "zh": "完成体"},
    "PHC": {"en": "Phrasal coordination", "zh": "短语并列"},
    "PIN": {"en": "Total prepositional phrases", "zh": "介词短语总量"},
    "[PIRE]": {"en": "Pied-piping relative clauses", "zh": "介词提前关系从句"},
    "PIT": {"en": "Pronoun it", "zh": "代词 it"},
    "PLACE": {"en": "Place adverbials", "zh": "地点状语"},
    "POMD": {"en": "Possibility modals", "zh": "可能性情态动词"},
    "PRED": {"en": "Predicative adjectives", "zh": "表语形容词"},
    "[PRESP]": {"en": "Present participial clauses", "zh": "现在分词小句"},
    "[PRIV]": {"en": "Private verbs", "zh": "私有动词"},
    "PRMD": {"en": "Predictive modals", "zh": "预测性情态动词"},
    "[PROD]": {"en": "Pro-verb do", "zh": "代动词 do"},
    "[PUBV]": {"en": "Public verbs", "zh": "公开动词"},
    "RB": {"en": "Total adverbs", "zh": "副词总量"},
    "[SERE]": {"en": "Sentence relatives", "zh": "句子关系从句"},
    "[SMP]": {"en": "Seem / appear", "zh": "seem/appear"},
    "[SPAU]": {"en": "Split auxiliaries", "zh": "分裂助动词"},
    "[SPIN]": {"en": "Split infinitives", "zh": "分裂不定式"},
    "SPP2": {"en": "Second person pronouns", "zh": "第二人称代词"},
    "[STPR]": {"en": "Stranded prepositions", "zh": "悬空介词"},
    "[SUAV]": {"en": "Suasive verbs", "zh": "劝说动词"},
    "SYNE": {"en": "Synthetic negation", "zh": "综合否定"},
    "THAC": {"en": "That adjective complements", "zh": "that 形容词补语"},
    "[THATD]": {"en": "Subordinator-that deletion", "zh": "that 省略"},
    "THVC": {"en": "That verb complements", "zh": "that 动词补语"},
    "TIME": {"en": "Time adverbials", "zh": "时间状语"},
    "TO": {"en": "Infinitives", "zh": "不定式"},
    "TOBJ": {"en": "That relative clauses (object)", "zh": "that 关系从句（宾语位）"},
    "TPP3": {"en": "Third person pronouns", "zh": "第三人称代词"},
    "TSUB": {"en": "That relative clauses (subject)", "zh": "that 关系从句（主语位）"},
    "VBD": {"en": "Past tense", "zh": "过去时"},
    "VPRT": {"en": "Present tense", "zh": "现在时"},
    "[WHCL]": {"en": "Wh-clauses", "zh": "WH 小句"},
    "[WHOBJ]": {"en": "Wh relative clauses (object)", "zh": "WH 关系从句（宾语位）"},
    "[WHQU]": {"en": "Direct wh-questions", "zh": "WH 疑问句"},
    "[WHSUB]": {"en": "Wh relative clauses (subject)", "zh": "WH 关系从句（主语位）"},
    "[WZPAST]": {"en": "Past participial WHIZ deletions", "zh": "过去分词后置定语"},
    "[WZPRES]": {"en": "Present participial WHIZ deletions", "zh": "现在分词后置定语"},
    "XX0": {"en": "Analytic negation (not)", "zh": "分析否定 (not)"},
}
