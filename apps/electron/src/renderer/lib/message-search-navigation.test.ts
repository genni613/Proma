import { describe, expect, test } from 'bun:test'
import {
  createProjectMessageSearchNavigation,
  resolveMessageSearchAnchorId,
  resolveMessageSearchTextRange,
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
})
