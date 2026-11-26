import { create } from 'zustand'
import type { SyncStatus } from './engine.js'

/** GitHub 同步配置。PAT 与 API Key 同一模型：每台设备本地填写，存 localStorage，不进代码。 */
export interface SyncConfig {
  enabled: boolean
  owner: string
  repo: string
  branch: string
  token: string
}

const KEY = 'chat-demo:sync-config'

const readConfig = (): SyncConfig => {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SyncConfig>
      return {
        enabled: parsed.enabled === true,
        owner: parsed.owner ?? '',
        repo: parsed.repo ?? '',
        branch: parsed.branch ?? 'main',
        token: parsed.token ?? '',
      }
    }
  } catch {
    // 存储不可用时用默认值
  }
  return { enabled: false, owner: '', repo: '', branch: 'main', token: '' }
}

export const useSyncConfig = create<SyncConfig>(() => readConfig())

export const setSyncConfig = (patch: Partial<SyncConfig>): void => {
  const next = { ...useSyncConfig.getState(), ...patch }
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // 存储不可用时只在内存中生效
  }
  useSyncConfig.setState(next)
}

/** 同步状态，供 UI 徽标渲染。 */
export const useSyncStatus = create<{ status: SyncStatus | null }>(() => ({ status: null }))

export const setSyncStatus = (status: SyncStatus | null): void => {
  useSyncStatus.setState({ status })
}
