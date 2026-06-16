# Meta-Lingo-Electron Project Memory

## Project Overview
- **Path**: /Volumes/TL-TANIUM/Meta-Lingo-Electron
- **Branch**: master
- **Current Version**: v4.8.53
- **Stack**: Electron + React + TypeScript frontend, Python FastAPI backend
- **Conda env**: meta-lingo-electron
- **Backend starts**: `cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload`

## Key Architecture
- All docs in each module folder as `mldoc.md`
- Version history in `PROJECT.md`
- i18n: `src/i18n/zh.json` and `src/i18n/en.json`
- Help docs: `help/zh.md` and `help/en.md`

## Regex Exclusion Words (v4.8.44)
- Shared utility: `backend/utils/exclusion_utils.py` — `compile_exclusion_patterns()`, `matches_exclusion()`, `normalize_exclusion_words()`
- Uses `re.compile(entry, IGNORECASE)` with `re.fullmatch()`; invalid patterns fall back to `re.escape()` (exact match)
- Applied to: word_frequency, semantic_analysis, metaphor_analysis, keyword (×2), ngram, collocation_analysis, sketch (search_collocations)
- LDA/LSA/NMF: added `exclusion_words: List[str] = []` to preprocess configs (router + TypeScript types + UI panels)
- Frontend: all exclude-words helperText updated to mention regex support in both en.json and zh.json

## MIPVU Metaphor Analysis (v4.8.59)
- **Indirect model**: `metalingo-indirect-metaphor` handles all tokens for indirect metaphor (two-stage KD, VUAMC NAACL FLP 2018)
- **Dev path**: `/Volumes/TL-TANIUM/Meta-Lingo-Electron/models/metaphor_identification/metalingo-indirect-metaphor`
- **ModelScope**: `TommyLeo/metalingo-indirect-metaphor` (URL: https://www.modelscope.cn/models/TommyLeo/metalingo-indirect-metaphor)
- **Indirect metrics**: F1=82.29, Precision=85.26%, Recall=79.53%, Accuracy=96.04%
- **Direct model**: `metalingo-direct-metaphor` (3-class O/mFlag/mrw_lit, BE06+OANC w/ DeepSeek-V4-Flash MIPVU annotations)
- **Direct dev path**: `/Volumes/TL-TANIUM/Meta-Lingo-Electron/models/metaphor_identification/metalingo-direct-metaphor`
- **Direct ModelScope**: `TommyLeo/metalingo-direct-metaphor` (URL: https://www.modelscope.cn/models/TommyLeo/metalingo-direct-metaphor)
- **Direct metrics**: sentence-level F1=88.03% (P=83.06%, R=93.64%); token-level mFlag F1=73.76%, mrw_lit F1=77.48%, combined F1=76.52%
- **Pipeline** (5 steps): filter → rules → metalingo-indirect-metaphor (indirect) → metalingo-direct-metaphor (direct/mflag, optional) → implicit_detector (rule-based post-processing)
- **Source labels**: 'clause' (non-function words), 'finetuned' (IN/DT/RB/RP)
- **Token fields**: `is_metaphor`, `metaphor_confidence`, `metaphor_source`, `is_direct_metaphor`, `is_mflag`, `direct_confidence`, `is_implicit_metaphor`, `implicit_rule` ('VPE-1'/'VPE-2'/'SUB-1'/'')
- **Auto-annotation remarks** (v4.8.53): indirect → `confidence: X% [clause model]`; direct → `confidence: X%`; mflag → `confidence: X%`; implicit → `rule desc [VPE-1/VPE-2/SUB-1]`
- **FRAMEWORK_LABELS.MIPVU**: indirect `79ee0895-…`, direct `67d591b5-…`, mflag `621b899e-…`, implicit `42d5860a-…` (color #8a96af)
- **Legacy**: old 'hitz' annotations still display as green in frontend
- **Max length**: 192 tokens (clause model training config)
- **Key files**: `backend/services/mipvu/models.py`, `annotator.py`, `implicit_detector.py`, `src/utils/autoAnnotation.ts`
- **Frontend types**: `src/types/metaphorAnalysis.ts` (`MIPVUToken`, `MetaphorStatistics`)

## User Preferences
- Chinese + English bilingual throughout (check i18n for both languages)
- Document all changes in PROJECT.md with version bump
- Update mldoc.md for each modified module
