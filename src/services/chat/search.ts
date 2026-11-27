import Fuse from 'fuse.js'
import * as db from '../storage/index.js'
import type { Session, SessionSummary } from './types.js'

/** 历史对话搜索：Fuse.js 客户端模糊/子串匹配（ignoreLocation 适配长文本与中文），不手写搜索引擎。 */

export interface SearchHit {
  session: SessionSummary
  snippet: string
}

type Doc = { id: string; title: string; text: string }

let cache: { stamp: string; fuse: Fuse<Doc> } | null = null

const messageText = (session: Session): string =>
  session.messages
    .map((message) =>
      message.role === 'user'
        ? message.content
        : message.blocks.map((block) => (block.type === 'text' ? block.text : '')).join('')
    )
    .join('\n')

/** 索引按会话 updatedAt 指纹缓存，数据变化才重建。 */
const build = async (): Promise<Fuse<Doc>> => {
  const summaries = await db.loadSessionSummaries()
  const stamp = summaries.map((session) => `${session.id}:${session.updatedAt}`).join('|')
  if (cache && cache.stamp === stamp) {
    return cache.fuse
  }
  const docs: Doc[] = []
  for (const summary of summaries) {
    const session = await db.loadSession(summary.id)
    docs.push({ id: summary.id, title: summary.title, text: session ? messageText(session) : '' })
  }
  const fuse = new Fuse(docs, {
    keys: [
      { name: 'title', weight: 2 },
      { name: 'text', weight: 1 },
    ],
    ignoreLocation: true,
    threshold: 0.2,
    minMatchCharLength: 1,
    includeMatches: true,
  })
  cache = { stamp, fuse }
  return fuse
}

const snippetOf = (text: string, indices: readonly (readonly [number, number])[]): string => {
  const first = indices[0]
  if (!first) {
    return ''
  }
  const [start, end] = first
  const from = Math.max(0, start - 20)
  return (from > 0 ? '…' : '') + text.slice(from, Math.min(text.length, end + 40))
}

export const searchSessions = async (query: string): Promise<SearchHit[]> => {
  const q = query.trim()
  if (!q) {
    return []
  }
  const fuse = await build()
  const summaries = await db.loadSessionSummaries()
  const byId = new Map(summaries.map((session) => [session.id, session]))
  const hits: SearchHit[] = []
  for (const result of fuse.search(q)) {
    const session = byId.get(result.item.id)
    if (!session) {
      continue
    }
    const textMatch = result.matches?.find((match) => match.key === 'text')
    hits.push({
      session,
      snippet: textMatch ? snippetOf(result.item.text, textMatch.indices) : '',
    })
  }
  return hits
}
