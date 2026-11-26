import { setBackend } from '../storage/backend.js'
import { idbStorage } from '../storage/idb.js'
import { MESSAGES, SESSIONS } from './codec.js'
import { SyncEngine } from './engine.js'
import { createGitStorage } from './git-storage.js'
import { setSyncStatus, useSyncConfig } from './settings.js'

let started = false
let engine: SyncEngine | null = null

/**
 * 启动时选择存储后端：配置了 GitHub 且令牌可用 → 同步后端；否则本地 IndexedDB。
 * 同步初始化失败时静默回退本地，保证 chatbot 始终可用。幂等。
 */
export const initStorage = async (): Promise<void> => {
  if (started) {
    return
  }
  started = true

  const config = useSyncConfig.getState()
  if (!config.enabled || !config.token || !config.owner || !config.repo) {
    setBackend(idbStorage)
    return
  }

  try {
    engine = new SyncEngine({
      owner: config.owner,
      repo: config.repo,
      branch: config.branch,
      onStatus: setSyncStatus,
    })
    await engine.init(config.token, [SESSIONS, MESSAGES])
    await engine.pull()
    engine.startAutoSync(60_000)
    setBackend(createGitStorage(engine))
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        engine?.sync().catch((error: unknown) => {
          // eslint-disable-next-line no-console
          console.error('[sync] foreground sync failed', error)
        })
      }
    })
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[sync] init failed, falling back to local storage', error)
    engine = null
    setSyncStatus(null)
    setBackend(idbStorage)
  }
}

/** 手动触发一次同步（供设置界面「立即同步」按钮）。 */
export const syncNow = () => engine?.sync()
