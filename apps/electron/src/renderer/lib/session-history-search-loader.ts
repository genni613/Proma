import { getScrollTopAfterHistoryPrepend } from './message-navigation-search'
import type { SessionHistoryScrollSnapshot } from './message-navigation-search'

interface SessionHistoryScrollContainer {
  scrollHeight: number
  scrollTop: number
}

export interface SessionHistoryLoadOptions {
  loadHistory: () => Promise<void>
  captureScrollSnapshot: () => SessionHistoryScrollSnapshot
  getScrollContainer: () => SessionHistoryScrollContainer | null
  getNavigationVersion: () => number
  scheduleAfterLayout: (callback: () => void) => void
}

export interface SessionHistorySearchLoader {
  load: (options: SessionHistoryLoadOptions) => Promise<void>
}

async function loadAndRestoreScroll(options: SessionHistoryLoadOptions): Promise<void> {
  const snapshot = options.captureScrollSnapshot()
  await options.loadHistory()

  options.scheduleAfterLayout(() => {
    const container = options.getScrollContainer()
    if (!container) return

    const nextScrollTop = getScrollTopAfterHistoryPrepend(
      snapshot,
      container.scrollHeight,
      options.getNavigationVersion(),
    )
    if (nextScrollTop !== null) container.scrollTop = nextScrollTop
  })
}

/** 同一时刻只补载一次完整 Session 历史；失败后允许重试。 */
export function createSessionHistorySearchLoader(): SessionHistorySearchLoader {
  let activeLoad: Promise<void> | null = null

  return {
    load(options) {
      if (activeLoad) return activeLoad

      const load = loadAndRestoreScroll(options)
      activeLoad = load.finally(() => {
        activeLoad = null
      })
      return activeLoad
    },
  }
}
