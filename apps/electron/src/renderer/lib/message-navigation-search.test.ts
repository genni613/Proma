import { describe, expect, test } from 'bun:test'
import {
  filterMessageNavigationItems,
  getChatMessageSearchText,
  getMessageNavigationDisplayText,
  getScrollTopAfterHistoryPrepend,
  isMessageNavigationAvailable,
  toMessageNavigationPreviewItems,
  type MessageNavigationSearchItem,
} from './message-navigation-search'

function createItem(overrides: Partial<MessageNavigationSearchItem> = {}): MessageNavigationSearchItem {
  return {
    preview: '这是消息开头的两百字摘要',
    searchText: '这是消息开头的两百字摘要',
    ...overrides,
  }
}

describe('当前 Session 消息搜索', () => {
  test('Given 关键词位于两百字之后 When 搜索当前 Session Then 返回该消息并展示命中附近摘要', () => {
    const keyword = 'PROMA_LONG_HIT_AFTER_200'
    const item = createItem({
      searchText: `${'前置正文'.repeat(60)} ${keyword} 后续正文`,
    })

    const results = filterMessageNavigationItems([item], keyword)

    expect(results).toEqual([item])
    expect(getMessageNavigationDisplayText(item, keyword)).toContain(keyword)
  })

  test('Given 没有查询词 When 展示消息导航 Then 继续使用两百字摘要', () => {
    const item = createItem({
      preview: '固定展示摘要',
      searchText: `${'完整正文'.repeat(100)} PROMA_LONG_HIT_AFTER_200`,
    })

    expect(getMessageNavigationDisplayText(item, '')).toBe('固定展示摘要')
  })

  test('Given 查询词包含首尾空格和大小写差异 When 搜索 Then 仍按完整正文匹配', () => {
    const item = createItem({ searchText: '在完整正文中包含 PromaSessionSearch' })

    expect(filterMessageNavigationItems([item], '  promasessionsearch  ')).toEqual([item])
  })

  test('Given 当前 Session 有消息 When 消息不足以滚动 Then 消息查找仍然可用', () => {
    expect(isMessageNavigationAvailable(1)).toBe(true)
    expect(isMessageNavigationAvailable(0)).toBe(false)
  })

  test('Given Chat 消息引用了其他内容 When 搜索当前 Session Then 只搜索可见引用标签和消息正文', () => {
    const searchText = getChatMessageSearchText(
      '<quoted_context source="agent-history" label="Agent 历史" message_id="m1" role="assistant">\n隐藏引用关键词\n</quoted_context>\n\n可见消息正文',
      'user',
    )

    expect(searchText).toBe('Agent 历史\n可见消息正文')
    expect(searchText).not.toContain('隐藏引用关键词')
  })

  test('Given 当前 Session 导航项包含完整正文 When 写入 Tab 预览缓存 Then 只保留轻量摘要', () => {
    const previewItems = toMessageNavigationPreviewItems([{
      id: 'message-1',
      role: 'user' as const,
      preview: '两百字摘要',
      searchText: '当前 Session 的完整消息正文',
      avatar: 'avatar.png',
    }])

    expect(previewItems).toEqual([{
      id: 'message-1',
      role: 'user',
      preview: '两百字摘要',
      avatar: 'avatar.png',
      model: undefined,
    }])
    expect('searchText' in previewItems[0]!).toBe(false)
  })

  test('Given 完整历史插入到顶部 When 用户没有跳转 Then 保持原消息的阅读位置', () => {
    const scrollTop = getScrollTopAfterHistoryPrepend(
      { scrollHeight: 1_000, scrollTop: 600, navigationVersion: 2 },
      1_800,
      2,
    )

    expect(scrollTop).toBe(1_400)
  })

  test('Given 完整历史正在加载 When 用户先点击搜索结果 Then 不覆盖新的跳转位置', () => {
    const scrollTop = getScrollTopAfterHistoryPrepend(
      { scrollHeight: 1_000, scrollTop: 600, navigationVersion: 2 },
      1_800,
      3,
    )

    expect(scrollTop).toBeNull()
  })
})
