/**
 * Shared constants for the BiblioVisualization module.
 * Extracted so UploadPanel (create), LibraryList (edit) and LibraryDetail (edit)
 * all offer the same language options instead of each hardcoding its own copy.
 */
export const LANGUAGE_OPTIONS: { value: string; labelKey: string }[] = [
  { value: 'english', labelKey: 'biblio.languageEnglish' },
  { value: 'chinese', labelKey: 'biblio.languageChinese' }
]
