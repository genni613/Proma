import * as React from 'react'
import { cn } from '@/lib/utils'

interface SearchMatchHighlightProps {
  before: string
  match: string
  after: string
  projectSearch?: boolean
}

/** 搜索结果中的实际命中文本；项目搜索使用与消息跳转一致的语义色。 */
export function SearchMatchHighlight({
  before,
  match,
  after,
  projectSearch = false,
}: SearchMatchHighlightProps): React.ReactElement {
  return (
    <>
      {before}
      <mark className={cn(
        'rounded-sm px-0.5',
        projectSearch
          ? 'bg-[hsl(var(--search-highlight-background))] text-[hsl(var(--search-highlight-foreground))]'
          : 'bg-primary/20 text-foreground',
      )}>
        {match}
      </mark>
      {after}
    </>
  )
}
