/**
 * 搜索 Dialog 状态 Atoms
 *
 * 管理全局搜索 Dialog 的开关、查询词和搜索结果。
 */

import { atom } from 'jotai'
import {
  createMessageSearchNavigationState,
  reduceMessageSearchNavigationState,
  type MessageSearchNavigationAction,
  type MessageSearchNavigationState,
} from '@/lib/message-search-navigation'

/** 搜索 Dialog 是否打开 */
export const searchDialogOpenAtom = atom(false)

/** 跨会话搜索结果的待定位请求和当前高亮归属。 */
export const messageSearchNavigationStateAtom = atom<MessageSearchNavigationState>(
  createMessageSearchNavigationState(),
)

export const updateMessageSearchNavigationAtom = atom(
  null,
  (get, set, action: MessageSearchNavigationAction) => {
    set(
      messageSearchNavigationStateAtom,
      reduceMessageSearchNavigationState(get(messageSearchNavigationStateAtom), action),
    )
  },
)
