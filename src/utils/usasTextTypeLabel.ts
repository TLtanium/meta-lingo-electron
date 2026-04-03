/**
 * USAS 文本类型（简写代码）在界面上的显示名。
 * 存储与 API 仍使用简写（如 GEN）；在 /api/usas/text-types 尚未返回时，用 i18n 回退避免 Select 短暂显示原始代码。
 */
import type { TFunction } from 'i18next'
import type { i18n as I18n } from 'i18next'

export interface UsasTextTypeConfigLike {
  name: string
  name_zh?: string
}

export function getUsasTextTypeDisplayLabel(
  code: string,
  config: UsasTextTypeConfigLike | undefined,
  t: TFunction,
  i18n: I18n
): string {
  if (config?.name) {
    return i18n.language?.startsWith('zh')
      ? (config.name_zh || config.name)
      : config.name
  }
  const key = `corpus.textTypeCodes.${code}`
  return t(key, code) as string
}
