/**
 * 搜索 Dialog 状态 Atoms
 *
 * 管理全局搜索 Dialog 的开关、查询词和搜索结果。
 */

import { atom } from 'jotai'
import type { MessageSearchNavigationRequest } from '@/lib/message-search-navigation'

export interface GlobalSearchScope {
  kind: 'global'
}

export interface ProjectSearchScope {
  kind: 'project'
  workspaceId: string
  workspaceName: string
}

export type SearchScope = GlobalSearchScope | ProjectSearchScope

export const GLOBAL_SEARCH_SCOPE: GlobalSearchScope = { kind: 'global' }

/** 搜索 Dialog 是否打开 */
export const searchDialogOpenAtom = atom(false)

/** 搜索范围；从项目菜单打开时限定到对应项目。 */
export const searchScopeAtom = atom<SearchScope>(GLOBAL_SEARCH_SCOPE)

/** 跨 Session 搜索点击后待消费的消息定位请求。 */
export const messageSearchNavigationAtom = atom<MessageSearchNavigationRequest | null>(null)
