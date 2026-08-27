import { describe, expect, test } from 'bun:test'
import {
  createProjectMessageSearchNavigation,
  createMessageSearchNavigationState,
  dismissMessageSearchHighlight,
  reduceMessageSearchNavigationState,
  resolveMessageSearchAnchorId,
  resolveMessageSearchTextRange,
  shouldClearMessageSearchHighlightOnSessionLeave,
} from './message-search-navigation'

describe('项目搜索结果消息定位', () => {
  test('Given 命中用户消息 When 解析渲染锚点 Then 返回该消息自己的锚点', () => {
    const anchorId = resolveMessageSearchAnchorId([
      { anchorId: 'user-message', messageIds: ['user-message'] },
      { anchorId: 'assistant-first', messageIds: ['assistant-first', 'assistant-later'] },
    ], 'user-message')

    expect(anchorId).toBe('user-message')
  })

  test('Given 命中同一助手回复中的后续消息 When 解析渲染锚点 Then 返回该回复首条消息锚点', () => {
    const anchorId = resolveMessageSearchAnchorId([
      { anchorId: 'user-message', messageIds: ['user-message'] },
      { anchorId: 'assistant-first', messageIds: ['assistant-first', 'assistant-later'] },
    ], 'assistant-later')

    expect(anchorId).toBe('assistant-first')
  })

  test('Given 消息尚未渲染 When 解析渲染锚点 Then 返回空值', () => {
    expect(resolveMessageSearchAnchorId([], 'missing-message')).toBeNull()
  })

  test('Given 项目内 Agent 正文结果 When 创建导航 Then 保留精确消息及摘要位置', () => {
    expect(createProjectMessageSearchNavigation(true, {
      type: 'agent',
      sessionId: 'session-1',
      messageId: 'message-2',
      query: '目标词',
      snippet: '第二段的目标词在这里',
      matchStart: 4,
      matchLength: 3,
    })).toEqual({
      sessionId: 'session-1',
      messageId: 'message-2',
      query: '目标词',
      snippet: '第二段的目标词在这里',
      matchStart: 4,
      matchLength: 3,
    })
  })

  test('Given 全局搜索或 Chat 结果 When 创建导航 Then 不扩大全局搜索行为', () => {
    const input = {
      type: 'agent' as const,
      sessionId: 'session-1',
      messageId: 'message-1',
      query: '目标词',
      snippet: '目标词',
      matchStart: 0,
      matchLength: 3,
    }

    expect(createProjectMessageSearchNavigation(false, input)).toBeNull()
    expect(createProjectMessageSearchNavigation(true, { ...input, type: 'chat' })).toBeNull()
  })

  test('Given 同一助手消息组多次出现关键词 When 定位 Then 使用摘要上下文选择对应位置', () => {
    const renderedText = '第一段的目标词不是它。第二段的目标词才是搜索结果。'

    const range = resolveMessageSearchTextRange(renderedText, {
      query: '目标词',
      snippet: '第二段的目标词才是搜索结果。',
      matchStart: 4,
      matchLength: 3,
    })

    expect(renderedText.slice(range!.matchStart, range!.matchStart + range!.matchLength)).toBe('目标词')
    expect(range!.matchStart).toBe(renderedText.lastIndexOf('目标词'))
  })

  test('Given 摘要位置无效且正文无匹配 When 定位 Then 返回空值', () => {
    expect(resolveMessageSearchTextRange('没有相关内容', {
      query: '目标词',
      snippet: '损坏摘要',
      matchStart: 99,
      matchLength: 3,
    })).toBeNull()
  })

  test('Given 关键词高亮已经应用 When 导航请求被消费 Then 保留当前高亮上下文', () => {
    const navigation = {
      sessionId: 'session-1',
      messageId: 'message-2',
      query: '新关键词',
      snippet: '命中新关键词',
      matchStart: 2,
      matchLength: 4,
    }
    const requested = reduceMessageSearchNavigationState(
      createMessageSearchNavigationState(),
      { type: 'request', navigation },
    )

    expect(reduceMessageSearchNavigationState(requested, {
      type: 'activate',
      navigation,
    })).toEqual({
      pendingNavigation: null,
      activeHighlight: navigation,
    })
  })

  test('Given 当前会话保留关键词高亮 When 显式清除或离开会话 Then 移除高亮上下文', () => {
    const navigation = {
      sessionId: 'session-1',
      messageId: 'message-2',
      query: '关键词',
      snippet: '命中关键词',
      matchStart: 2,
      matchLength: 3,
    }
    const activeState = {
      pendingNavigation: null,
      activeHighlight: navigation,
    }

    expect(reduceMessageSearchNavigationState(activeState, { type: 'clear' }))
      .toEqual(createMessageSearchNavigationState())
    expect(reduceMessageSearchNavigationState(activeState, {
      type: 'leave-session',
      sessionId: 'session-1',
    })).toEqual(createMessageSearchNavigationState())
  })

  test('Given 当前高亮来自其他会话 When 非目标会话卸载 Then 不清除目标高亮', () => {
    const activeState = {
      pendingNavigation: null,
      activeHighlight: {
        sessionId: 'session-2',
        messageId: 'message-2',
        query: '关键词',
        snippet: '命中关键词',
        matchStart: 2,
        matchLength: 3,
      },
    }

    expect(reduceMessageSearchNavigationState(activeState, {
      type: 'leave-session',
      sessionId: 'session-1',
    })).toEqual(activeState)
    expect(shouldClearMessageSearchHighlightOnSessionLeave(activeState, 'session-1')).toBe(false)
    expect(shouldClearMessageSearchHighlightOnSessionLeave(activeState, 'session-2')).toBe(true)
  })

  test('Given 跳转关键词仍在高亮 When 用户普通点击页面 Then 同时清除视觉高亮和导航状态', () => {
    const activeState = {
      pendingNavigation: null,
      activeHighlight: {
        sessionId: 'session-1',
        messageId: 'message-1',
        query: '关键词',
        snippet: '命中关键词',
        matchStart: 2,
        matchLength: 3,
      },
    }
    let visualHighlightCleared = false

    const action = dismissMessageSearchHighlight(activeState, () => {
      visualHighlightCleared = true
    })

    expect(visualHighlightCleared).toBe(true)
    expect(action).toEqual({ type: 'clear' })
    expect(reduceMessageSearchNavigationState(activeState, action!))
      .toEqual(createMessageSearchNavigationState())
  })

  test('Given 搜索结果点击先清除旧高亮 When 随后的 click 创建新请求 Then 新导航不受 pointerdown 影响', () => {
    const oldNavigation = {
      sessionId: 'session-1',
      messageId: 'old-message',
      query: '旧词',
      snippet: '旧词',
      matchStart: 0,
      matchLength: 2,
    }
    const newNavigation = {
      ...oldNavigation,
      messageId: 'new-message',
      query: '新词',
      snippet: '新词',
    }
    const activeState = { pendingNavigation: null, activeHighlight: oldNavigation }
    const dismissed = reduceMessageSearchNavigationState(
      activeState,
      dismissMessageSearchHighlight(activeState, () => {})!,
    )

    expect(reduceMessageSearchNavigationState(dismissed, {
      type: 'request',
      navigation: newNavigation,
    })).toEqual({
      pendingNavigation: newNavigation,
      activeHighlight: null,
    })
  })
})
