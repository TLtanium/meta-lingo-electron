interface Metadata {
  name?: string; description?: string; tags?: string[] | string
  name_zh?: string; name_en?: string; description_zh?: string; description_en?: string
  tags_zh?: string[]; tags_en?: string[]
}
export function splitReferenceTags(value: string | string[]): string[] {
  return [...new Set((Array.isArray(value) ? value : [value]).flatMap(tag => tag.split(/[,，]/)).map(tag => tag.trim()).filter(Boolean))]
}
const firstText = (...values: Array<string | undefined>) => values.find(value => value?.trim())?.trim() || ''
export function referenceMetadata(resource: Metadata) {
  return {
    name: firstText(resource.name, resource.name_zh, resource.name_en),
    description: firstText(resource.description, resource.description_zh, resource.description_en),
    tags: splitReferenceTags(resource.tags ?? [...(resource.tags_zh || []), ...(resource.tags_en || [])]),
  }
}
