/**
 * Word cloud for sentiment (reuses WordFrequency WordCloud with frequency-like data)
 */

import { useMemo } from 'react'
import WordCloud from '../WordFrequency/components/WordCloud'
import type { CorpusOrLibrarySelection } from '../../components/Corpus/CorpusOrLibrarySelector'
import type { WordFrequencyResult } from '../../types/wordFrequency'

interface Item {
  text: string
  value: number
}

interface SentimentWordCloudProps {
  data: Item[]
  corpusSelection: CorpusOrLibrarySelection | null
}

export default function SentimentWordCloud({ data, corpusSelection }: SentimentWordCloudProps) {
  const wordFreqData: WordFrequencyResult[] = useMemo(
    () =>
      data.map((d, i) => ({
        word: d.text,
        frequency: d.value,
        percentage: 0,
        rank: i + 1
      })),
    [data]
  )
  return (
    <WordCloud
      data={wordFreqData}
      maxItems={wordFreqData.length}
      config={{
        engine: 'd3',
        style: 'default',
        maxWords: 100,
        colormap: 'viridis'
      }}
      onWordClick={undefined}
    />
  )
}
