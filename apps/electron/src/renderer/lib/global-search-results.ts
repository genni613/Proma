import type {
  AgentMessageSearchOptions,
  AgentMessageSearchResult,
  MessageSearchResult,
} from '@proma/shared'
import { findBestSearchMatch } from '@proma/shared'

export interface SearchableConversation {
  id: string
  title: string
  updatedAt: number
  archived?: boolean
}

export interface SearchableAgentSession extends SearchableConversation {
  workspaceId?: string
}

export interface GlobalTitleResult {
  id: string
  title: string
  type: 'chat' | 'agent'
  archived?: boolean
  updatedAt: number
}

export interface GlobalContentResult extends GlobalTitleResult {
  messageId: string
  snippet: string
  matchStart: number
  matchLength: number
}

export interface GlobalSearchRequest {
  includeChat: boolean
  agentOptions?: AgentMessageSearchOptions
}

export interface CreateGlobalTitleResultsInput {
  query: string
  conversations: SearchableConversation[]
  agentSessions: SearchableAgentSession[]
  selectedWorkspaceIds: string[]
  limit?: number
}

export interface MergeGlobalContentResultsInput {
  titleResultKeys: ReadonlySet<string>
  chatResults: MessageSearchResult[]
  agentResults: AgentMessageSearchResult[]
}

export function getGlobalSearchResultKey(type: 'chat' | 'agent', id: string): string {
  return `${type}:${id}`
}

/** 将项目多选状态转换为 IPC 搜索范围；空选择代表搜索全部。 */
export function buildGlobalSearchRequest(selectedWorkspaceIds: string[]): GlobalSearchRequest {
  const workspaceIds = [...new Set(selectedWorkspaceIds.filter(Boolean))]
  if (workspaceIds.length === 0) {
    return { includeChat: true, agentOptions: undefined }
  }

  return {
    includeChat: false,
    agentOptions: { workspaceIds },
  }
}

/** 合并 Chat 与 Agent 标题匹配，并按会话更新时间统一排序。 */
export function createGlobalTitleResults(input: CreateGlobalTitleResultsInput): GlobalTitleResult[] {
  const selectedWorkspaceIds = new Set(input.selectedWorkspaceIds)
  const hasProjectScope = selectedWorkspaceIds.size > 0
  const matchesTitle = (title: string): boolean => findBestSearchMatch(title, input.query) !== null
  const chatResults: GlobalTitleResult[] = hasProjectScope
    ? []
    : input.conversations
      .filter((conversation) => matchesTitle(conversation.title))
      .map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        type: 'chat',
        archived: conversation.archived,
        updatedAt: conversation.updatedAt,
      }))
  const agentResults: GlobalTitleResult[] = input.agentSessions
    .filter((session) => !hasProjectScope || (session.workspaceId && selectedWorkspaceIds.has(session.workspaceId)))
    .filter((session) => matchesTitle(session.title))
    .map((session) => ({
      id: session.id,
      title: session.title,
      type: 'agent',
      archived: session.archived,
      updatedAt: session.updatedAt,
    }))

  return [...chatResults, ...agentResults]
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, input.limit ?? 20)
}

/** 将两种会话的正文命中映射为统一格式，并按会话更新时间排序。 */
export function mergeGlobalContentResults(input: MergeGlobalContentResultsInput): GlobalContentResult[] {
  const chatResults: GlobalContentResult[] = input.chatResults
    .filter((result) => !input.titleResultKeys.has(getGlobalSearchResultKey('chat', result.conversationId)))
    .map((result) => ({
      id: result.conversationId,
      title: result.conversationTitle,
      type: 'chat',
      messageId: result.messageId,
      snippet: result.snippet,
      matchStart: result.matchStart,
      matchLength: result.matchLength,
      archived: result.archived,
      updatedAt: result.updatedAt,
    }))
  const agentResults: GlobalContentResult[] = input.agentResults
    .filter((result) => !input.titleResultKeys.has(getGlobalSearchResultKey('agent', result.sessionId)))
    .map((result) => ({
      id: result.sessionId,
      title: result.sessionTitle,
      type: 'agent',
      messageId: result.messageId,
      snippet: result.snippet,
      matchStart: result.matchStart,
      matchLength: result.matchLength,
      archived: result.archived,
      updatedAt: result.updatedAt,
    }))

  return [...chatResults, ...agentResults]
    .sort((left, right) => right.updatedAt - left.updatedAt)
}
