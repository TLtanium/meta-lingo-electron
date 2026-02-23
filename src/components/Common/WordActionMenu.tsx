/**
 * WordActionMenu Component
 * Displays a menu with options to view word analysis in other modules
 */

import { useState, useRef } from 'react'
import {
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip
} from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import LinkIcon from '@mui/icons-material/Link'
import JoinInnerIcon from '@mui/icons-material/JoinInner'
import HubIcon from '@mui/icons-material/Hub'
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../stores/tabStore'
import type { CrossLinkParams, TabType, MatchMode, SourceModule } from '../../types'

// Mapping of Word Sketch relation names to CQL dependency patterns
// Format: { relationName: { deps, direction, collocatePos? } }
// collocatePos mirrors grammar_patterns.py collocate_pos to ensure CQL frequency matches Word Sketch
interface RelationDepInfo {
  deps: string[]
  direction: 'child' | 'parent'
  collocatePos?: string  // POS constraint for collocate token (pipe-separated for multi, e.g. "NOUN|PROPN")
  headPos?: string       // POS constraint for head token (direction='parent' only)
  bidirectional?: boolean // true for conj relations that match both child and parent directions
}

const RELATION_TO_DEP_MAP: Record<string, RelationDepInfo> = {
  // VERB relations (center=VERB)
  'object': { deps: ['dobj', 'obj'], direction: 'child', collocatePos: 'NOUN|PROPN|PRON' },
  'subject': { deps: ['nsubj', 'nsubjpass'], direction: 'child', collocatePos: 'NOUN|PROPN|PRON' },
  'modifier': { deps: ['advmod'], direction: 'child', collocatePos: 'ADV' },
  'and_or': { deps: ['conj'], direction: 'child', collocatePos: 'VERB', bidirectional: true },
  'prepositional_phrases': { deps: ['prep', 'obl'], direction: 'child', collocatePos: 'ADP' },
  'particles_intransitive': { deps: ['prt', 'compound:prt'], direction: 'child', collocatePos: 'PART|ADP' },
  'particles_transitive': { deps: ['prt', 'compound:prt'], direction: 'child', collocatePos: 'PART|ADP' },
  'pronominal_objects': { deps: ['dobj', 'obj'], direction: 'child', collocatePos: 'PRON' },
  'pronominal_subjects': { deps: ['nsubj'], direction: 'child', collocatePos: 'PRON' },
  'wh_words': { deps: ['ccomp', 'advcl'], direction: 'child', collocatePos: 'SCONJ|ADV|PRON' },
  'infinitive_objects': { deps: ['xcomp'], direction: 'child', collocatePos: 'VERB' },
  'ing_objects': { deps: ['xcomp', 'ccomp'], direction: 'child', collocatePos: 'VERB' },
  'that_clauses': { deps: ['ccomp', 'xcomp'], direction: 'child', collocatePos: 'VERB|NOUN|ADJ' },
  'passive_subjects': { deps: ['nsubjpass'], direction: 'child', collocatePos: 'NOUN|PROPN|PRON' },
  'adj_complement': { deps: ['acomp', 'xcomp'], direction: 'child', collocatePos: 'ADJ' },
  'verbs_before': { deps: ['xcomp', 'ccomp'], direction: 'parent' },
  // NOUN relations (center=NOUN)
  'nouns_modified_by': { deps: ['compound'], direction: 'parent', collocatePos: 'NOUN|PROPN' },
  'verbs_with_as_object': { deps: ['dobj', 'obj'], direction: 'parent', collocatePos: 'VERB' },
  'verbs_with_as_subject': { deps: ['nsubj', 'nsubjpass'], direction: 'parent', collocatePos: 'VERB' },
  'noun_and_or': { deps: ['conj'], direction: 'parent', collocatePos: 'NOUN|PROPN', bidirectional: true },
  'noun_prepositional_phrases': { deps: ['prep', 'nmod'], direction: 'child', collocatePos: 'ADP' },
  'adjective_predicates': { deps: ['nsubj'], direction: 'parent', headPos: 'ADJ', collocatePos: 'ADJ' },
  'possessive': { deps: ['poss'], direction: 'parent', collocatePos: 'NOUN|PROPN' },
  'possessors': { deps: ['poss'], direction: 'child', collocatePos: 'NOUN|PROPN' },
  'pronominal_possessors': { deps: ['poss'], direction: 'child', collocatePos: 'PRON' },
  'is_a_noun': { deps: ['attr'], direction: 'parent' },  // No collocatePos: head is verb "be", not noun
  'modifiers_of_noun': { deps: ['amod'], direction: 'child', collocatePos: 'ADJ' },
  'object_of': { deps: ['dobj', 'obj'], direction: 'parent', collocatePos: 'VERB' },
  'subject_of': { deps: ['nsubj', 'nsubjpass'], direction: 'parent', collocatePos: 'VERB' },
  'verbs_with_particle_object': { deps: ['dobj', 'obj'], direction: 'parent', collocatePos: 'VERB' },
  // Legacy names
  'noun_modifiers': { deps: ['compound', 'nmod'], direction: 'child' },
  'verb_object_of': { deps: ['dobj', 'obj'], direction: 'parent', collocatePos: 'VERB' },
  'verb_subject_of': { deps: ['nsubj'], direction: 'parent', collocatePos: 'VERB' },
  'noun_is': { deps: ['nsubj'], direction: 'parent' },
  'noun_is_a': { deps: ['attr', 'nsubj'], direction: 'parent' },
  'prep_of_noun': { deps: ['prep'], direction: 'child', collocatePos: 'ADP' },
  'noun_in_prep': { deps: ['pobj'], direction: 'parent' },
  // ADJ relations (center=ADJ)
  'adj_subjects': { deps: ['nsubj'], direction: 'child', collocatePos: 'NOUN|PROPN|PRON' },
  'adj_nouns': { deps: ['amod'], direction: 'parent', collocatePos: 'NOUN|PROPN' },
  'adj_modifiers': { deps: ['advmod'], direction: 'child', collocatePos: 'ADV' },
  'adj_and_or': { deps: ['conj'], direction: 'child', collocatePos: 'ADJ', bidirectional: true },
  'adj_verbs': { deps: ['acomp', 'xcomp'], direction: 'parent', collocatePos: 'VERB' },
  'adj_complements': { deps: ['prep', 'ccomp'], direction: 'child' },
  // ADV relations (center=ADV)
  'adv_verbs': { deps: ['advmod'], direction: 'parent', headPos: 'VERB', collocatePos: 'VERB' },
  'adv_adjs': { deps: ['advmod'], direction: 'parent', headPos: 'ADJ', collocatePos: 'ADJ' },
  'adv_advs': { deps: ['advmod'], direction: 'parent', headPos: 'ADV', collocatePos: 'ADV' },
  'adv_and_or': { deps: ['conj'], direction: 'child', bidirectional: true },
  // Additional ADJ relations (from grammar_patterns.py)
  'adj_modifies': { deps: ['amod'], direction: 'parent', collocatePos: 'NOUN|PROPN' },
  'adj_subject': { deps: ['nsubj'], direction: 'child', collocatePos: 'NOUN|PROPN|PRON' },
  'adj_comp_of': { deps: ['acomp', 'xcomp'], direction: 'parent', collocatePos: 'VERB' },
  'nouns_modified_by_adj': { deps: ['amod'], direction: 'parent', collocatePos: 'NOUN|PROPN' },
  'verbs_with_adj_complement': { deps: ['acomp', 'xcomp'], direction: 'parent', collocatePos: 'VERB' },
  // Additional ADV relations (from grammar_patterns.py)
  'modifiers_of_adv': { deps: ['advmod'], direction: 'child', collocatePos: 'ADV' },
  'verbs_modified_by_adv': { deps: ['advmod'], direction: 'parent', headPos: 'VERB', collocatePos: 'VERB' },
  'adverbs_modified_by_adv': { deps: ['advmod'], direction: 'parent', headPos: 'ADV', collocatePos: 'ADV' },
  'adjectives_modified_by_adv': { deps: ['advmod'], direction: 'parent', headPos: 'ADJ', collocatePos: 'ADJ' },
}

/**
 * Generate CQL query for Word Sketch relation
 * 
 * Word Sketch uses dependency relations to find collocations, so the CQL should
 * match based on dependency constraints, not word distance.
 * 
 * Understanding SpaCy dependency parsing for "business model":
 * - "business" is the DEPENDENT (child) with dep="compound"
 * - "model" is the HEAD (parent) of "business"
 * - So: business.dep="compound", business.head="model"
 * 
 * Word Sketch direction convention:
 * - 'parent': mainWord is the DEPENDENT (child), search upward to find head (collocate)
 *   E.g., "business" (compound modifier) -> "model" (head)
 *   CQL matches mainWord: [lemma="business" & dep="compound" & headlemma="model"]
 * 
 * - 'child': mainWord is the HEAD (parent), search downward to find dependents (collocate)
 *   E.g., "run" (verb) <- "quickly" (advmod dependent)
 *   CQL matches collocate: [lemma="quickly" & dep="advmod" & headlemma="run"]
 * 
 * @param mainWord The main word from Word Sketch
 * @param collocateWord The collocate word clicked
 * @param relationName The grammar relation name from Word Sketch
 * @param matchMode Whether to match word or lemma
 * @returns Object with CQL query and which token should be the KWIC keyword
 */
export function generateCQLForRelation(
  mainWord: string,
  collocateWord: string,
  relationName: string,
  matchMode: MatchMode = 'lemma'
): { cql: string; kwicKeyword: string; kwicHighlight: string } {
  const attr = matchMode === 'lemma' ? 'lemma' : 'word'
  const relationInfo = RELATION_TO_DEP_MAP[relationName]
  
  // If we have dependency info, use dependency-based matching (no window needed)
  // This matches exactly how Word Sketch finds collocations
  if (relationInfo) {
    const depCondition = relationInfo.deps.length === 1
      ? `dep="${relationInfo.deps[0]}"`
      : `dep="${relationInfo.deps.join('|')}"`

    // Handle bidirectional relations (conj: and_or, noun_and_or, adj_and_or, adv_and_or)
    // SpaCy's conj relation only has one direction per pair, but Word Sketch grammar_patterns
    // searches both child and parent directions, so CQL needs OR to cover both cases
    if (relationInfo.bidirectional) {
      const posCond = relationInfo.collocatePos ? ` & pos="${relationInfo.collocatePos}"` : ''
      // Direction 1: collocate is child of mainWord
      const cql1 = `[${attr}="${collocateWord}" & ${depCondition} & head${attr}="${mainWord}"${posCond}]`
      // Direction 2: mainWord is child of collocate
      const cql2 = `[${attr}="${mainWord}" & ${depCondition} & head${attr}="${collocateWord}"]`
      return {
        cql: `${cql1} | ${cql2}`,
        kwicKeyword: mainWord,
        kwicHighlight: collocateWord
      }
    }

    if (relationInfo.direction === 'parent') {
      // direction='parent': mainWord is DEPENDENT (child), collocate is HEAD (parent)
      // CQL matches mainWord: [lemma="business" & dep="compound" & headlemma="model"]
      // collocatePos constrains the HEAD (collocate), so use headpos
      // headPos is an additional explicit headpos constraint (e.g. adjective_predicates)
      const headPosVal = relationInfo.headPos || relationInfo.collocatePos
      const headPosCond = headPosVal ? ` & headpos="${headPosVal}"` : ''
      return {
        cql: `[${attr}="${mainWord}" & ${depCondition} & head${attr}="${collocateWord}"${headPosCond}]`,
        kwicKeyword: mainWord,
        kwicHighlight: collocateWord
      }
    } else {
      // direction='child': mainWord is HEAD (parent), collocate is DEPENDENT (child)
      // CQL matches collocate: [lemma="digital" & dep="amod" & headlemma="technology" & pos="ADJ"]
      // collocatePos constrains the matched token (the collocate), so use pos
      const posCond = relationInfo.collocatePos ? ` & pos="${relationInfo.collocatePos}"` : ''
      return {
        cql: `[${attr}="${collocateWord}" & ${depCondition} & head${attr}="${mainWord}"${posCond}]`,
        kwicKeyword: mainWord,
        kwicHighlight: collocateWord
      }
    }
  }

  // Fallback: simple lemma matching without dependency constraint
  return {
    cql: `[${attr}="${collocateWord}"]`,
    kwicKeyword: mainWord,
    kwicHighlight: collocateWord
  }
}

export interface WordActionMenuProps {
  /** The word to analyze */
  word: string
  /** Current corpus ID */
  corpusId: string
  /** Current text selection */
  textIds: string[] | 'all'
  /** Selection mode */
  selectionMode: 'all' | 'selected' | 'tags'
  /** Selected tags (when selectionMode is 'tags') */
  selectedTags?: string[]
  /** Whether to show collocation option (共现关系) */
  showCollocation?: boolean
  /** Whether to show collocation analysis option (搭配分析) */
  showCollocationAnalysis?: boolean
  /** Whether to show word sketch option (词图分析) */
  showWordSketch?: boolean
  /** Button size */
  size?: 'small' | 'medium'
  /** Custom tooltip */
  tooltip?: string
  /** Words to highlight in context when linking to collocation (e.g., main word from Word Sketch) */
  highlightWords?: string[]
  /** Words that must appear in context to filter results (e.g., collocate from Word Sketch) */
  contextFilterWords?: string[]
  /** Main word from Word Sketch (for CQL generation) */
  mainWord?: string
  /** Lemma of the main word (for CQL lemma matching; falls back to mainWord if not provided) */
  mainWordLemma?: string
  /** Lemma of the collocate word (for CQL lemma matching; falls back to word if not provided) */
  collocateLemma?: string
  /** Grammar relation name from Word Sketch */
  relationName?: string
  /** Match mode for CQL query (word or lemma) */
  matchMode?: MatchMode
  /** Source module for cross-link (affects default settings in target module) */
  sourceModule?: SourceModule
}

export default function WordActionMenu({
  word,
  corpusId,
  textIds,
  selectionMode,
  selectedTags,
  showCollocation = true,
  showCollocationAnalysis = true,
  showWordSketch = true,
  size = 'small',
  tooltip,
  highlightWords,
  contextFilterWords,
  mainWord,
  mainWordLemma,
  collocateLemma,
  relationName,
  matchMode = 'lemma',
  sourceModule
}: WordActionMenuProps) {
  const { t } = useTranslation()
  const { openTab } = useTabStore()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)
  
  // Store pending action to execute after menu exit transition completes
  const pendingActionRef = useRef<(() => void) | null>(null)

  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation()
    setAnchorEl(event.currentTarget)
  }

  const handleClose = (event?: React.MouseEvent) => {
    event?.stopPropagation()
    setAnchorEl(null)
  }
  
  // Handle menu exit transition complete - execute pending action
  const handleMenuExited = () => {
    if (pendingActionRef.current) {
      pendingActionRef.current()
      pendingActionRef.current = null
    }
  }

  const createCrossLinkParams = (): CrossLinkParams => {
    // Generate CQL query if we have main word and relation info from Word Sketch
    // generateCQLForRelation returns { cql, kwicKeyword, kwicHighlight }
    let cqlQuery: string | undefined
    let kwicKeyword = mainWord || word
    let kwicHighlight: string | undefined = undefined

    // Only set highlight words when coming from Word Sketch (has mainWord and relationName)
    // or when explicitly provided via highlightWords prop
    const isFromWordSketch = !!(mainWord && relationName)

    if (isFromWordSketch) {
      // When matchMode='lemma', use actual lemma forms for CQL query so that
      // lemma="breakthrough" matches SpaCy lemma, not surface form "breakthroughs"
      const cqlMainWord = (matchMode === 'lemma' ? mainWordLemma : undefined) || mainWord
      const cqlCollocateWord = (matchMode === 'lemma' ? collocateLemma : undefined) || word
      const result = generateCQLForRelation(cqlMainWord, cqlCollocateWord, relationName, matchMode)
      cqlQuery = result.cql
      kwicKeyword = result.kwicKeyword
      kwicHighlight = result.kwicHighlight
    }
    
    const params: CrossLinkParams = {
      searchWord: kwicKeyword,
      corpusId,
      textIds,
      selectionMode,
      selectedTags,
      autoSearch: true,
      // Only highlight collocate words when from Word Sketch
      highlightWords: isFromWordSketch && kwicHighlight ? [kwicHighlight] : (highlightWords || undefined),
      contextFilterWords: isFromWordSketch ? contextFilterWords : undefined,
      // CQL-related fields
      cqlQuery,
      matchMode,
      relationName,
      forceSearchMode: cqlQuery ? 'cql' : undefined,
      // For post-processing CQL results:
      // - kwicKeywordLemma: token that should be KWIC keyword
      // - kwicHighlightLemma: token that should be highlighted in context
      kwicKeywordLemma: isFromWordSketch ? kwicKeyword : undefined,
      kwicHighlightLemma: isFromWordSketch ? kwicHighlight : undefined,
      // Source module for default settings
      sourceModule
    }
    return params
  }

  const handleOpenCollocation = (event: React.MouseEvent) => {
    event.stopPropagation()
    // Store action to execute after menu exit transition completes
    const crossLinkParams = createCrossLinkParams()
    const title = `${t('collocation.title')} - ${word}`
    pendingActionRef.current = () => {
      openTab({
        type: 'collocation' as TabType,
        title,
        props: { crossLinkParams }
      })
    }
    // Close menu - action will be executed when exit transition completes
    handleClose()
  }

  const handleOpenCollocationAnalysis = (event: React.MouseEvent) => {
    event.stopPropagation()
    const crossLinkParams = { ...createCrossLinkParams(), targetSubTab: 0 }
    const title = `${t('wordsketch.collocationAnalysisTab')} - ${word}`
    pendingActionRef.current = () => {
      openTab({
        type: 'wordsketch' as TabType,
        title,
        props: { crossLinkParams }
      })
    }
    handleClose()
  }

  const handleOpenWordSketch = (event: React.MouseEvent) => {
    event.stopPropagation()
    // Store action to execute after menu exit transition completes
    const crossLinkParams = { ...createCrossLinkParams(), targetSubTab: 1 }
    const title = `${t('wordsketch.title')} - ${word}`
    pendingActionRef.current = () => {
      openTab({
        type: 'wordsketch' as TabType,
        title,
        props: { crossLinkParams }
      })
    }
    // Close menu - action will be executed when exit transition completes
    handleClose()
  }

  // Don't render if no options to show
  if (!showCollocation && !showCollocationAnalysis && !showWordSketch) {
    return null
  }

  return (
    <>
      <Tooltip title={tooltip || t('crossLink.viewInOtherModules')}>
        <IconButton
          size={size}
          onClick={handleClick}
          sx={{ 
            opacity: 0.6,
            '&:hover': { opacity: 1 }
          }}
        >
          <MoreVertIcon fontSize={size} />
        </IconButton>
      </Tooltip>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={() => handleClose()}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'right',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        TransitionProps={{
          onExited: handleMenuExited
        }}
      >
        {showCollocation && (
          <MenuItem onClick={handleOpenCollocation}>
            <ListItemIcon>
              <LinkIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={t('crossLink.viewCollocation')} />
          </MenuItem>
        )}
        {showCollocationAnalysis && (
          <MenuItem onClick={handleOpenCollocationAnalysis}>
            <ListItemIcon>
              <JoinInnerIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={t('crossLink.viewCollocationAnalysis')} />
          </MenuItem>
        )}
        {showWordSketch && (
          <MenuItem onClick={handleOpenWordSketch}>
            <ListItemIcon>
              <HubIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={t('crossLink.viewWordSketch')} />
          </MenuItem>
        )}
      </Menu>
    </>
  )
}
