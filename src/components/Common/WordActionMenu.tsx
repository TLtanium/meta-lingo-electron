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
import HubIcon from '@mui/icons-material/Hub'
import { useTranslation } from 'react-i18next'
import { useTabStore } from '../../stores/tabStore'
import type { CrossLinkParams, TabType, MatchMode, SourceModule } from '../../types'

// Mapping of Word Sketch relation names to CQL dependency patterns
// Format: { relationName: { dep: string[], direction: 'child' | 'parent' } }
const RELATION_TO_DEP_MAP: Record<string, { deps: string[], direction: 'child' | 'parent' }> = {
  // VERB relations
  'object': { deps: ['dobj', 'obj'], direction: 'child' },
  'subject': { deps: ['nsubj', 'nsubjpass'], direction: 'child' },
  'modifier': { deps: ['advmod'], direction: 'child' },
  'and_or': { deps: ['conj'], direction: 'child' },
  'prepositional_phrases': { deps: ['prep', 'obl'], direction: 'child' },
  'particles_intransitive': { deps: ['prt', 'compound:prt'], direction: 'child' },
  'particles_transitive': { deps: ['prt', 'compound:prt'], direction: 'child' },
  'pronominal_objects': { deps: ['dobj', 'obj'], direction: 'child' },
  'pronominal_subjects': { deps: ['nsubj'], direction: 'child' },
  'wh_words': { deps: ['ccomp', 'advcl'], direction: 'child' },
  'infinitive_objects': { deps: ['xcomp'], direction: 'child' },
  'ing_objects': { deps: ['xcomp', 'ccomp'], direction: 'child' },
  'that_clauses': { deps: ['ccomp'], direction: 'child' },
  'passive_subjects': { deps: ['nsubjpass'], direction: 'child' },
  'verbs_before': { deps: ['xcomp', 'ccomp'], direction: 'parent' },
  // NOUN relations (from grammar_patterns.py)
  'nouns_modified_by': { deps: ['compound'], direction: 'parent' },  // "business model" - model has business as head
  'verbs_with_as_object': { deps: ['dobj', 'obj'], direction: 'parent' },
  'verbs_with_as_subject': { deps: ['nsubj', 'nsubjpass'], direction: 'parent' },
  'noun_and_or': { deps: ['conj'], direction: 'parent' },  // both directions in grammar_patterns
  'noun_prepositional_phrases': { deps: ['prep', 'nmod'], direction: 'child' },
  'adjective_predicates': { deps: ['nsubj'], direction: 'parent' },
  'possessive': { deps: ['poss'], direction: 'parent' },
  'possessors': { deps: ['poss'], direction: 'child' },
  'pronominal_possessors': { deps: ['poss'], direction: 'child' },  // "their business" - their.dep="poss", their.head="business"
  'is_a_noun': { deps: ['attr'], direction: 'parent' },
  'modifiers_of_noun': { deps: ['amod'], direction: 'child' },
  'object_of': { deps: ['dobj', 'obj'], direction: 'parent' },
  'subject_of': { deps: ['nsubj', 'nsubjpass'], direction: 'parent' },
  // Legacy names
  'noun_modifiers': { deps: ['compound', 'nmod'], direction: 'child' },
  'verb_object_of': { deps: ['dobj', 'obj'], direction: 'parent' },
  'verb_subject_of': { deps: ['nsubj'], direction: 'parent' },
  'noun_is': { deps: ['nsubj'], direction: 'parent' },
  'noun_is_a': { deps: ['attr', 'nsubj'], direction: 'parent' },
  'prep_of_noun': { deps: ['prep'], direction: 'child' },
  'noun_in_prep': { deps: ['pobj'], direction: 'parent' },
  // ADJ relations
  'adj_subjects': { deps: ['nsubj'], direction: 'child' },
  'adj_nouns': { deps: ['amod'], direction: 'parent' },
  'adj_modifiers': { deps: ['advmod'], direction: 'child' },
  'adj_and_or': { deps: ['conj'], direction: 'child' },
  'adj_verbs': { deps: ['acomp', 'xcomp'], direction: 'parent' },
  'adj_complements': { deps: ['prep', 'ccomp'], direction: 'child' },
  // ADV relations
  'adv_verbs': { deps: ['advmod'], direction: 'parent' },
  'adv_adjs': { deps: ['advmod'], direction: 'parent' },
  'adv_advs': { deps: ['advmod'], direction: 'parent' },
  'adv_and_or': { deps: ['conj'], direction: 'child' },
  // Additional ADJ relations (from grammar_patterns.py)
  'adj_modifies': { deps: ['amod'], direction: 'parent' },
  'adj_subject': { deps: ['nsubj'], direction: 'child' },
  'adj_comp_of': { deps: ['acomp', 'xcomp'], direction: 'parent' },
  'nouns_modified_by_adj': { deps: ['amod'], direction: 'parent' },
  'verbs_with_adj_complement': { deps: ['acomp', 'xcomp'], direction: 'parent' },
  // Additional ADV relations (from grammar_patterns.py)
  'modifiers_of_adv': { deps: ['advmod'], direction: 'child' },
  'verbs_modified_by_adv': { deps: ['advmod'], direction: 'parent' },
  'adverbs_modified_by_adv': { deps: ['advmod'], direction: 'parent' },
  'adjectives_modified_by_adv': { deps: ['advmod'], direction: 'parent' },
  // Additional NOUN relations
  'verbs_with_particle_object': { deps: ['dobj', 'obj'], direction: 'parent' },
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
    
    if (relationInfo.direction === 'parent') {
      // direction='parent': mainWord is DEPENDENT (child), collocate is HEAD (parent)
      // SpaCy example: "business model" -> business.dep="compound", business.head="model"
      // CQL matches mainWord (the dependent): [lemma="business" & dep="compound" & headlemma="model"]
      // KWIC keyword should be mainWord, highlight collocate in context
      return {
        cql: `[${attr}="${mainWord}" & ${depCondition} & head${attr}="${collocateWord}"]`,
        kwicKeyword: mainWord,
        kwicHighlight: collocateWord
      }
    } else {
      // direction='child': mainWord is HEAD (parent), collocate is DEPENDENT (child)
      // SpaCy example: "run quickly" -> quickly.dep="advmod", quickly.head="run"
      // CQL matches collocate (the dependent): [lemma="quickly" & dep="advmod" & headlemma="run"]
      // KWIC keyword should still be mainWord, but CQL matches collocate
      // Need post-processing to swap keyword
      return {
        cql: `[${attr}="${collocateWord}" & ${depCondition} & head${attr}="${mainWord}"]`,
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
  /** Whether to show collocation option */
  showCollocation?: boolean
  /** Whether to show word sketch option */
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
  showWordSketch = true,
  size = 'small',
  tooltip,
  highlightWords,
  contextFilterWords,
  mainWord,
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
      const result = generateCQLForRelation(mainWord, word, relationName, matchMode)
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

  const handleOpenWordSketch = (event: React.MouseEvent) => {
    event.stopPropagation()
    // Store action to execute after menu exit transition completes
    const crossLinkParams = createCrossLinkParams()
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
  if (!showCollocation && !showWordSketch) {
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
