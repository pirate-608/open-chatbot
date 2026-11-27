import { useEffect, useState, type ReactNode } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { selectSession } from '../../services/chat/store.js'
import { searchSessions, type SearchHit } from '../../services/chat/search.js'
import { useSettings } from '../../services/settings.js'
import { Modal } from '../base/Modal.js'
import { IconSearchOutline16 } from '../base/icons.js'
import styles from './SearchDialog.module.css'

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** 片段中把命中词加粗，对齐官方搜索的高亮展示。 */
const highlight = (text: string, query: string): ReactNode => {
  const q = query.trim()
  if (!q) {
    return text
  }
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'ig'))
  return parts.map((part, index) =>
    part.toLowerCase() === q.toLowerCase() ? <strong key={index}>{part}</strong> : part
  )
}

/** 居中弹层搜索：标题栏为输入框，结果行=标题+日期+高亮片段，点击跳转并关闭。 */
export const SearchDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useTranslate()
  const locale = useSettings((state) => state.locale)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[] | null>(null)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setHits(null)
      return
    }
    let alive = true
    const timer = setTimeout(() => {
      void searchSessions(q).then((result) => {
        if (alive) {
          setHits(result)
        }
      })
    }, 200)
    return () => {
      alive = false
      clearTimeout(timer)
    }
  }, [query])

  const rowDate = (ts: number): string => {
    const date = new Date(ts)
    const now = new Date()
    const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const days = Math.round((dayStart(now) - dayStart(date)) / 86400000)
    if (days === 0) {
      return t('sessionHistoryTimelineLabelToday')
    }
    if (days === 1) {
      return t('sessionHistoryTimelineLabelYesterday')
    }
    return locale === 'zh-CN'
      ? `${date.getMonth() + 1}月${date.getDate()}日`
      : date.toLocaleDateString(locale, { month: 'short', day: 'numeric' })
  }

  return (
    <Modal
      closable
      onClose={onClose}
      className={styles.dialog}
      mainClassName={styles.main}
      title={
        <div className={styles.titleRow}>
          <IconSearchOutline16 />
          <input
            className={styles.input}
            value={query}
            autoFocus
            placeholder={t('searchSessionsPlaceholder')}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      }
    >
      <div className={styles.results}>
        {hits === null ? null : hits.length === 0 ? (
          <div className={styles.empty}>{t('searchNoResults')}</div>
        ) : (
          hits.map((hit) => (
            <button
              key={hit.session.id}
              type="button"
              className={styles.row}
              onClick={() => {
                selectSession(hit.session.id)
                onClose()
              }}
            >
              <div className={styles.rowHead}>
                <span className={styles.rowTitle}>{hit.session.title || t('untitledChat')}</span>
                <span className={styles.rowDate}>{rowDate(hit.session.updatedAt)}</span>
              </div>
              {hit.snippet ? (
                <div className={styles.rowSnippet}>{highlight(hit.snippet, query)}</div>
              ) : null}
            </button>
          ))
        )}
      </div>
    </Modal>
  )
}
