import { describe, expect, test } from 'bun:test'
import {
  buildGlobalSearchRequest,
  createGlobalTitleResults,
  mergeGlobalContentResults,
} from './global-search-results'

describe('全局搜索范围', () => {
  test('Given 未选择项目 When 构建搜索请求 Then 同时搜索 Chat 和全部 Agent 会话', () => {
    const request = buildGlobalSearchRequest([])

    expect(request).toEqual({
      includeChat: true,
      agentOptions: undefined,
    })
  })

  test('Given 选择多个项目 When 构建搜索请求和标题结果 Then 只搜索所选项目', () => {
    const request = buildGlobalSearchRequest(['workspace-b', 'workspace-a', 'workspace-b'])
    const results = createGlobalTitleResults({
      query: '方案',
      conversations: [{ id: 'chat-1', title: 'Chat 方案', updatedAt: 40 }],
      agentSessions: [
        { id: 'agent-a', title: 'A 方案', workspaceId: 'workspace-a', updatedAt: 20 },
        { id: 'agent-b', title: 'B 方案', workspaceId: 'workspace-b', updatedAt: 30 },
        { id: 'agent-c', title: 'C 方案', workspaceId: 'workspace-c', updatedAt: 50 },
      ],
      selectedWorkspaceIds: request.agentOptions?.workspaceIds ?? [],
    })

    expect(request).toEqual({
      includeChat: false,
      agentOptions: { workspaceIds: ['workspace-b', 'workspace-a'] },
    })
    expect(results.map((result) => result.id)).toEqual(['agent-b', 'agent-a'])
  })
})

describe('全局搜索结果排序', () => {
  test('Given Chat 和 Agent 内容命中 When 合并结果 Then 去除标题重复项并按会话更新时间统一排序', () => {
    const results = mergeGlobalContentResults({
      titleResultKeys: new Set(['agent:agent-title-match']),
      chatResults: [
        {
          conversationId: 'chat-old',
          conversationTitle: '较早 Chat',
          messageId: 'chat-message',
          role: 'user',
          snippet: '命中内容',
          matchStart: 0,
          matchLength: 2,
          updatedAt: 10,
        },
      ],
      agentResults: [
        {
          sessionId: 'agent-new',
          sessionTitle: '最近 Agent',
          messageId: 'agent-message',
          role: 'assistant',
          snippet: '这里命中',
          matchStart: 2,
          matchLength: 2,
          updatedAt: 30,
        },
        {
          sessionId: 'agent-title-match',
          sessionTitle: '标题已命中',
          messageId: 'duplicate-message',
          role: 'user',
          snippet: '命中',
          matchStart: 0,
          matchLength: 2,
          updatedAt: 50,
        },
      ],
    })

    expect(results.map((result) => result.id)).toEqual(['agent-new', 'chat-old'])
    expect(results.map((result) => result.updatedAt)).toEqual([30, 10])
  })
})
