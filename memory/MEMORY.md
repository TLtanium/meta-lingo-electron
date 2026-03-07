# Meta-Lingo-Electron Project Memory

## Project Overview
- **Path**: /Volumes/TL-TANIUM/Meta-Lingo-Electron
- **Branch**: master
- **Current Version**: v3.9.56
- **Stack**: Electron + React + TypeScript frontend, Python FastAPI backend
- **Conda env**: meta-lingo-electron
- **Backend starts**: `cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload`

## Key Architecture
- All docs in each module folder as `mldoc.md`
- Version history in `PROJECT.md`
- i18n: `src/i18n/zh.json` and `src/i18n/en.json`
- Help docs: `help/zh.md` and `help/en.md`

## MIPVU Metaphor Analysis (v3.9.56)
- **Single model**: `deberta-v3-large-clause-metaphor` handles ALL tokens (no HiTZ)
- **Pipeline**: filter → rules → Clause model for all remaining
- **Source labels**: 'clause' (green, non-function words), 'finetuned' (orange, IN/DT/RB/RP)
- **Legacy**: old 'hitz' annotations still display as green in frontend
- **Max length**: 192 tokens (clause model training config)
- **Model path**: `models/metaphor_identification/deberta-v3-large-clause-metaphor`
- **Key files**: `backend/services/mipvu/models.py`, `annotator.py`
- **Frontend types**: `src/types/metaphorAnalysis.ts` has 'clause' added to MetaphorSource

## User Preferences
- Chinese + English bilingual throughout (check i18n for both languages)
- Document all changes in PROJECT.md with version bump
- Update mldoc.md for each modified module
