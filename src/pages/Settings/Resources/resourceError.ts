import type { TFunction } from 'i18next'
/** Translate actionable validation errors without hiding the failed row/field. */
export function resourceError(raw: string, t: TFunction): string {
  const row = raw.match(/^Row (\d+): (.*)$/)
  if (row) return t('resources.errors.row', { row: row[1], reason: resourceError(row[2], t) })
  const rules: [string, string][] = [
    ['CSV header must be:', 'header'], ['incorrect number of columns', 'columns'],
    ['empty required value', 'empty'], ['word must be the lowercase form of Word', 'lowercase'],
    ['freq must be a positive integer', 'frequency'], ['CSV must use UTF-8', 'encoding'],
    ['CSV has no frequency rows', 'noRows'], ['Malformed CSV', 'malformed'],
    ['A dictionary with this name already exists', 'duplicate'],
    ['Dictionary name must be', 'name'], ['Select exactly one MDX', 'mdx'],
    ['Select the extracted NRC', 'nrc'], ['Invalid NRC', 'nrc'],
    ['Import failed: unsupported', 'unsupported'], ['Import exceeds', 'size'],
    ['Could not remove resource.', 'remove'],
  ]
  const match = rules.find(([prefix]) => raw.startsWith(prefix))
  if (match) return t(`resources.errors.${match[1]}`)
  if (raw.startsWith('Required metadata: ')) {
    const field = raw.slice(19)
    return t('resources.errors.metadata', { field: t(`resources.fields.${field}`, field) })
  }
  return raw
}
