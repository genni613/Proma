import { findBestSearchMatch } from '@proma/shared'

/** 页面上一条可定位的消息组锚点。 */
export interface MessageSearchAnchor {
  /** 页面实际渲染在 data-message-id 上的 ID。 */
  anchorId: string
  /** 该消息组包含的持久化消息 ID。 */
  messageIds: string[]
}

export interface MessageSearchNavigationRequest {
  sessionId: string
  messageId: string
  query: string
  snippet: string
  matchStart: number
  matchLength: number
}

export interface MessageSearchResultNavigationInput {
  type: 'chat' | 'agent'
  sessionId: string
  messageId: string
  query: string
  snippet: string
  matchStart: number
  matchLength: number
}

export interface TextMatchRange {
  matchStart: number
  matchLength: number
}

export interface MessageSearchNavigationState {
  pendingNavigation: MessageSearchNavigationRequest | null
  activeHighlight: MessageSearchNavigationRequest | null
}

export type MessageSearchNavigationAction =
  | { type: 'request'; navigation: MessageSearchNavigationRequest }
  | { type: 'activate'; navigation: MessageSearchNavigationRequest }
  | { type: 'clear' }
  | { type: 'leave-session'; sessionId: string }

export function createMessageSearchNavigationState(): MessageSearchNavigationState {
  return { pendingNavigation: null, activeHighlight: null }
}

/** 区分“导航已消费”和“显式清除”，避免请求置空时误删刚创建的关键词高亮。 */
export function reduceMessageSearchNavigationState(
  state: MessageSearchNavigationState,
  action: MessageSearchNavigationAction,
): MessageSearchNavigationState {
  if (action.type === 'request') {
    return { ...state, pendingNavigation: action.navigation }
  }
  if (action.type === 'activate') {
    return { pendingNavigation: null, activeHighlight: action.navigation }
  }
  if (action.type === 'clear') {
    if (!state.pendingNavigation && !state.activeHighlight) return state
    return createMessageSearchNavigationState()
  }

  const pendingNavigation = state.pendingNavigation?.sessionId === action.sessionId
    ? null
    : state.pendingNavigation
  const activeHighlight = state.activeHighlight?.sessionId === action.sessionId
    ? null
    : state.activeHighlight
  if (pendingNavigation === state.pendingNavigation && activeHighlight === state.activeHighlight) return state
  return { pendingNavigation, activeHighlight }
}

/** CSS Highlight registry 为窗口全局资源，只有拥有导航/高亮的会话离开时才能删除。 */
export function shouldClearMessageSearchHighlightOnSessionLeave(
  state: MessageSearchNavigationState,
  sessionId: string,
): boolean {
  return state.pendingNavigation?.sessionId === sessionId
    || state.activeHighlight?.sessionId === sessionId
}

/** 用户开始普通页面交互时，同时清理窗口级视觉高亮并返回对应状态动作。 */
export function dismissMessageSearchHighlight(
  state: MessageSearchNavigationState,
  clearVisualHighlight: () => void,
): MessageSearchNavigationAction | null {
  if (!state.pendingNavigation && !state.activeHighlight) return null
  clearVisualHighlight()
  return { type: 'clear' }
}

/** 仅项目内的 Agent 正文结果创建精确定位请求，避免扩大全局搜索行为。 */
export function createProjectMessageSearchNavigation(
  isProjectSearch: boolean,
  result: MessageSearchResultNavigationInput,
): MessageSearchNavigationRequest | null {
  if (!isProjectSearch || result.type !== 'agent') return null
  return {
    sessionId: result.sessionId,
    messageId: result.messageId,
    query: result.query,
    snippet: result.snippet,
    matchStart: result.matchStart,
    matchLength: result.matchLength,
  }
}

/**
 * 利用搜索结果携带的上下文，在合并渲染的助手 turn 中找到准确的那次命中。
 * 完整 snippet 因 Markdown 标记变化无法直接匹配时，使用左右上下文为同词候选打分。
 */
export function resolveMessageSearchTextRange(
  renderedText: string,
  navigation: Pick<MessageSearchNavigationRequest, 'query' | 'snippet' | 'matchStart' | 'matchLength'>,
): TextMatchRange | null {
  const { snippet, matchStart, matchLength, query } = navigation
  if (matchStart < 0 || matchLength <= 0 || matchStart + matchLength > snippet.length) {
    return findBestSearchMatch(renderedText, query)
  }

  const leadingEllipsisLength = snippet.startsWith('...') ? 3 : 0
  const trailingEllipsisLength = snippet.endsWith('...') ? 3 : 0
  const snippetBodyEnd = snippet.length - trailingEllipsisLength
  const snippetBody = snippet.slice(leadingEllipsisLength, snippetBodyEnd)
  const bodyMatchStart = matchStart - leadingEllipsisLength
  if (bodyMatchStart >= 0 && bodyMatchStart + matchLength <= snippetBody.length) {
    const bodyIndex = renderedText.indexOf(snippetBody)
    if (bodyIndex >= 0) {
      return { matchStart: bodyIndex + bodyMatchStart, matchLength }
    }
  }

  const matchedText = snippet.slice(matchStart, matchStart + matchLength)
  if (!matchedText) return findBestSearchMatch(renderedText, query)

  const leftContext = snippet.slice(leadingEllipsisLength, matchStart)
  const rightContext = snippet.slice(matchStart + matchLength, snippetBodyEnd)
  const lowerText = renderedText.toLocaleLowerCase()
  const lowerMatch = matchedText.toLocaleLowerCase()
  let best: { range: TextMatchRange; score: number } | null = null
  let candidateStart = lowerText.indexOf(lowerMatch)
  while (candidateStart >= 0) {
    const before = renderedText.slice(0, candidateStart)
    const after = renderedText.slice(candidateStart + matchedText.length)
    let leftScore = 0
    while (
      leftScore < leftContext.length
      && leftScore < before.length
      && leftContext[leftContext.length - 1 - leftScore] === before[before.length - 1 - leftScore]
    ) leftScore++
    let rightScore = 0
    while (
      rightScore < rightContext.length
      && rightScore < after.length
      && rightContext[rightScore] === after[rightScore]
    ) rightScore++
    const score = leftScore + rightScore
    if (!best || score > best.score) {
      best = { range: { matchStart: candidateStart, matchLength: matchedText.length }, score }
    }
    candidateStart = lowerText.indexOf(lowerMatch, candidateStart + Math.max(1, lowerMatch.length))
  }

  return best?.range ?? findBestSearchMatch(renderedText, query)
}

/**
 * 将搜索服务返回的持久化消息 ID 映射到页面实际渲染的消息组锚点。
 * 一次助手回复可能由多条消息快照组成，但页面只为整组渲染一个锚点。
 */
export function resolveMessageSearchAnchorId(
  anchors: MessageSearchAnchor[],
  messageId: string,
): string | null {
  return anchors.find((anchor) => anchor.messageIds.includes(messageId))?.anchorId ?? null
}
