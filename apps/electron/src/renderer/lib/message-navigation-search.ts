import { parseQuotedSelectionRefs } from './quoted-selection'

/** 当前 Session 消息搜索所需的最小数据契约。 */
export interface MessageNavigationSearchItem {
  /** 导航列表默认展示的轻量摘要。 */
  preview: string
  /** 当前消息或 turn 的完整可见正文。 */
  searchText: string
}

export interface SessionHistoryScrollSnapshot {
  scrollHeight: number
  scrollTop: number
  navigationVersion: number
}

export interface MessageNavigationPreviewItem {
  id: string
  role: 'user' | 'assistant' | 'status'
  preview: string
  avatar?: string
  model?: string
}

const SEARCH_RESULT_PREVIEW_LENGTH = 200
const SEARCH_RESULT_CONTEXT_BEFORE = 80

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase()
}

/**
 * 在当前 Session 的完整消息正文中做字面子串搜索。
 * preview 只用于展示，不能参与是否命中的判断。
 */
export function filterMessageNavigationItems<T extends MessageNavigationSearchItem>(
  items: T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return items

  return items.filter((item) => item.searchText.toLowerCase().includes(normalizedQuery))
}

/** Chat 用户消息只搜索界面实际展示的正文与引用标签，不搜索隐藏的引用原文。 */
export function getChatMessageSearchText(content: string, role: 'user' | 'assistant' | 'status'): string {
  if (role !== 'user') return content

  const { quotes, text } = parseQuotedSelectionRefs(content)
  const quoteLabels = quotes.map((quote) => quote.label ?? quote.filename)
  return [...quoteLabels, text].filter(Boolean).join('\n')
}

/** 生成 Tab 悬浮预览缓存，明确丢弃仅供当前 Session 使用的完整搜索正文。 */
export function toMessageNavigationPreviewItems<T extends MessageNavigationPreviewItem>(
  items: T[],
): MessageNavigationPreviewItem[] {
  return items.map((item) => ({
    id: item.id,
    role: item.role,
    preview: item.preview,
    avatar: item.avatar,
    model: item.model,
  }))
}

/**
 * 无查询时展示固定摘要；搜索时展示首次命中附近的上下文。
 */
export function getMessageNavigationDisplayText(
  item: MessageNavigationSearchItem,
  query: string,
): string {
  const normalizedQuery = normalizeQuery(query)
  if (!normalizedQuery) return item.preview

  const searchTextLower = item.searchText.toLowerCase()
  const matchIndex = searchTextLower.indexOf(normalizedQuery)
  if (matchIndex === -1) return item.preview

  const start = Math.max(0, matchIndex - SEARCH_RESULT_CONTEXT_BEFORE)
  const prefix = start > 0 ? '…' : ''
  const initialEnd = Math.min(
    item.searchText.length,
    start + SEARCH_RESULT_PREVIEW_LENGTH - prefix.length,
  )
  const hasSuffix = initialEnd < item.searchText.length
  const end = hasSuffix ? Math.max(start, initialEnd - 1) : initialEnd
  const suffix = hasSuffix ? '…' : ''

  return `${prefix}${item.searchText.slice(start, end)}${suffix}`
}

/** 只要当前 Session 有消息，就应允许打开消息查找。 */
export function isMessageNavigationAvailable(itemCount: number): boolean {
  return itemCount > 0
}

/**
 * 历史消息插入顶部后保持原阅读位置；加载期间发生消息跳转时，不覆盖用户的新位置。
 */
export function getScrollTopAfterHistoryPrepend(
  snapshot: SessionHistoryScrollSnapshot,
  currentScrollHeight: number,
  currentNavigationVersion: number,
): number | null {
  if (currentNavigationVersion !== snapshot.navigationVersion) return null

  const addedHeight = Math.max(0, currentScrollHeight - snapshot.scrollHeight)
  return snapshot.scrollTop + addedHeight
}
