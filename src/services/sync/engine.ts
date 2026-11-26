import { GitHubSyncService, MAX_CONTENT_API_BYTES } from 'gittersync'
import type { SyncStatus } from 'gittersync'

export type { SyncStatus, SyncedDocument, FileRef, LocalDB } from 'gittersync'
export { MAX_CONTENT_API_BYTES }

export interface EngineConfig {
  owner: string
  repo: string
  branch?: string
  onStatus?: (status: SyncStatus) => void
}

/**
 * 通用 GitHub 同步引擎：只依赖 gittersync，不认识 chatbot 的任何类型。
 * 换同步库或改 GitHub 交互细节只动这里，不牵连 chatbot。
 */
export class SyncEngine {
  private readonly service: GitHubSyncService
  private pushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(config: EngineConfig) {
    this.service = new GitHubSyncService({
      owner: config.owner,
      repo: config.repo,
      branch: config.branch ?? 'main',
      useRawContent: true,
      onSyncStatusChange: config.onStatus,
    })
  }

  async init(token: string, collections: string[]): Promise<void> {
    await this.service.init(token)
    await this.service.registerCollections(collections)
  }

  get localDb() {
    return this.service.getLocalDb()
  }

  pull() {
    return this.service.pull()
  }

  push() {
    return this.service.push()
  }

  sync() {
    return this.service.sync()
  }

  compact() {
    return this.service.compact()
  }

  startAutoSync(intervalMs?: number) {
    this.service.startAutoSync(intervalMs)
  }

  stopAutoSync() {
    this.service.stopAutoSync()
  }

  getStatus(): SyncStatus {
    return this.service.getStatus()
  }

  /** 合并短时间内的多次本地写入为一次 push，避免频繁提交触发 GitHub 二级限流。 */
  schedulePush(delayMs = 1500): void {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer)
    }
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null
      this.service.push().catch((error: unknown) => {
        // eslint-disable-next-line no-console
        console.error('[sync] push failed', error)
      })
    }, delayMs)
  }

  uploadFile(path: string, content: Blob, mimeType?: string) {
    return this.service.uploadFile(path, content, undefined, mimeType)
  }

  downloadFile(path: string) {
    return this.service.downloadFile(path)
  }

  deleteFile(path: string) {
    return this.service.deleteFile(path)
  }

  exportData() {
    return this.service.exportData()
  }

  importData(file: File | Blob) {
    return this.service.importData(file)
  }

  destroy() {
    if (this.pushTimer) {
      clearTimeout(this.pushTimer)
    }
    return this.service.destroy()
  }
}
