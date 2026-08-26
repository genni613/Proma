import { describe, expect, test } from 'bun:test'
import { filterMessageNavigationItems } from './message-navigation-search'
import {
  createSessionHistorySearchLoader,
  type SessionHistoryLoadOptions,
} from './session-history-search-loader'

function createOptions(overrides: Partial<SessionHistoryLoadOptions> = {}): SessionHistoryLoadOptions {
  return {
    loadHistory: async () => {},
    captureScrollSnapshot: () => ({
      scrollHeight: 1_000,
      scrollTop: 600,
      navigationVersion: 2,
    }),
    getScrollContainer: () => ({ scrollHeight: 1_800, scrollTop: 600 }),
    getNavigationVersion: () => 2,
    scheduleAfterLayout: (callback) => callback(),
    ...overrides,
  }
}

describe('当前 Session 完整历史补载', () => {
  test('Given Chat 首次只有最近消息 When 打开会话搜索 Then 补载旧消息并可命中其完整正文', async () => {
    const keyword = 'ONLY_IN_OLDER_SESSION_MESSAGE'
    let items = [{ preview: '最近消息', searchText: '最近消息' }]
    const loader = createSessionHistorySearchLoader()

    await loader.load(createOptions({
      loadHistory: async () => {
        items = [
          { preview: '旧消息摘要', searchText: `${'旧消息正文'.repeat(60)} ${keyword}` },
          ...items,
        ]
      },
    }))

    expect(filterMessageNavigationItems(items, keyword)).toHaveLength(1)
  })

  test('Given 完整历史正在补载 When 搜索输入再次触发加载 Then 复用同一次请求', async () => {
    let finishLoad: (() => void) | undefined
    let loadCount = 0
    const pendingLoad = new Promise<void>((resolve) => {
      finishLoad = resolve
    })
    const loader = createSessionHistorySearchLoader()
    const options = createOptions({
      loadHistory: () => {
        loadCount += 1
        return pendingLoad
      },
    })

    const firstLoad = loader.load(options)
    const repeatedLoad = loader.load(options)

    expect(repeatedLoad).toBe(firstLoad)
    expect(loadCount).toBe(1)
    finishLoad?.()
    await firstLoad
  })

  test('Given 完整历史补载失败 When 用户重试 Then 可以重新发起加载', async () => {
    let loadCount = 0
    const loader = createSessionHistorySearchLoader()
    const failedOptions = createOptions({
      loadHistory: async () => {
        loadCount += 1
        throw new Error('历史读取失败')
      },
    })

    await expect(loader.load(failedOptions)).rejects.toThrow('历史读取失败')
    await loader.load(createOptions({
      loadHistory: async () => {
        loadCount += 1
      },
    }))

    expect(loadCount).toBe(2)
  })
})
