import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { SearchMatchHighlight } from './SearchMatchHighlight'

describe('Session 搜索结果匹配高亮', () => {
  test('Given Session 搜索命中 When 渲染结果 Then 使用统一的搜索语义色', () => {
    const html = renderToStaticMarkup(
      <SearchMatchHighlight before="前" match="命中" after="后" />,
    )

    expect(html).toContain('--search-highlight-background')
    expect(html).toContain('--search-highlight-foreground')
    expect(html).toContain('<mark')
  })

  test('Given Session 搜索仅传入命中文本 When 渲染结果 Then 仍保留黄色语义高亮', () => {
    const html = renderToStaticMarkup(
      <SearchMatchHighlight before="" match="命中" after="" />,
    )

    expect(html).toContain('命中')
    expect(html).toContain('--search-highlight-background')
    expect(html).toContain('--search-highlight-foreground')
  })
})
