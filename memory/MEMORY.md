# Meta-Lingo-Electron Project Memory

## Project Overview
- **Path**: /Volumes/TL-TANIUM/Meta-Lingo-Electron
- **Branch**: master
- **Current Version**: v4.8.45
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

## MIPVU Metaphor Analysis (v4.8.41)
- **Single model**: `metalingo-deberta-metaphor` handles ALL tokens (two-stage KD, VUAMC NAACL FLP 2018)
- **Dev path**: `/Volumes/TL-TANIUM/Meta-Lingo-Electron/models/metaphor_identification/metalingo-deberta-metaphor`
- **ModelScope**: `TommyLeo/metalingo-deberta-metaphor`
- **Metrics**: F1=81.24, Precision=83.82%, Recall=78.81%, Accuracy=95.78%
- **Pipeline**: filter → rules → metalingo-deberta-metaphor for all remaining
- **Source labels**: 'clause' (green, non-function words), 'finetuned' (orange, IN/DT/RB/RP)
- **Legacy**: old 'hitz' annotations still display as green in frontend
- **Max length**: 192 tokens (clause model training config)
- **Model path**: `models/metaphor_identification/metalingo-deberta-metaphor`
- **Key files**: `backend/services/mipvu/models.py`, `annotator.py`
- **Frontend types**: `src/types/metaphorAnalysis.ts` has 'clause' added to MetaphorSource

## User Preferences
- Chinese + English bilingual throughout (check i18n for both languages)
- Document all changes in PROJECT.md with version bump
- Update mldoc.md for each modified module
