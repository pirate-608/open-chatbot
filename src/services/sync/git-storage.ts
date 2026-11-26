import type { ChatStorage, StoredFile } from '../storage/port.js'
import { MAX_CONTENT_API_BYTES } from './engine.js'
import type { SyncEngine } from './engine.js'
import {
  MESSAGES,
  SESSIONS,
  assembleSession,
  messageFromDoc,
  messageToData,
  sessionToData,
  summaryFromDoc,
  type MessageDocData,
  type SessionDocData,
} from './codec.js'

const filePath = (id: string) => `files/${id}`

/**
 * GitHub 同步后端：实现 ChatStorage 端口，内部只用 engine + codec。
 * 本地读写走 gittersync 的离线优先 LocalDB，写入后 debounce 推送 GitHub。
 */
export const createGitStorage = (engine: SyncEngine): ChatStorage => {
  const db = engine.localDb

  const upsert = async <T>(collection: string, id: string, data: T): Promise<void> => {
    const updated = await db.updateFields<T>(collection, id, data)
    if (!updated) {
      await db.create<T>(collection, id, data)
    }
  }

  const uploadFiles = async (files: StoredFile[]): Promise<void> => {
    for (const file of files) {
      if (file.blob.size > MAX_CONTENT_API_BYTES) {
        // GitHub Contents API 单文件上限 1 MiB；超限原件暂不同步，仅留本地引用。
        // eslint-disable-next-line no-console
        console.warn(`[sync] file ${file.id} exceeds 1 MiB, skipped remote upload`)
        continue
      }
      try {
        await engine.uploadFile(filePath(file.id), file.blob, file.blob.type || undefined)
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`[sync] upload file ${file.id} failed`, error)
      }
    }
  }

  const unsupported = (): never => {
    throw new Error('历史导入在 GitHub 同步模式下暂不支持，请改用同步自带的备份导入')
  }

  return {
    async loadSessionSummaries() {
      const docs = await db.getAllDocuments<SessionDocData>(SESSIONS)
      return docs.map(summaryFromDoc).sort((a, b) => b.updatedAt - a.updatedAt)
    },

    async loadSession(id) {
      const meta = await db.getDocument<SessionDocData>(SESSIONS, id)
      if (!meta || meta.deleted_at) {
        return undefined
      }
      const docs = await db.queryDocuments<MessageDocData>(MESSAGES, (data) => data.sessionId === id)
      return assembleSession(meta, docs.map(messageFromDoc))
    },

    async saveSession(session, files) {
      await upsert(SESSIONS, session.id, sessionToData(session))
      for (const message of session.messages) {
        await upsert(MESSAGES, message.id, messageToData(session.id, message))
      }
      if (files?.length) {
        await uploadFiles(files)
      }
      engine.schedulePush()
    },

    async renameSession(id, title) {
      await db.updateFields<SessionDocData>(SESSIONS, id, { title, updatedAt: Date.now() })
      engine.schedulePush()
    },

    async deleteSession(id) {
      await db.deleteDocument(SESSIONS, id)
      const docs = await db.queryDocuments<MessageDocData>(MESSAGES, (data) => data.sessionId === id)
      for (const doc of docs) {
        await db.deleteDocument(MESSAGES, doc.id)
      }
      engine.schedulePush()
    },

    saveFiles: uploadFiles,

    async loadFile(id) {
      try {
        return await engine.downloadFile(filePath(id))
      } catch {
        return undefined
      }
    },

    // 暂存式历史导入是本地 IndexedDB 后端的语义；同步模式用 gittersync 自带备份。
    async clearStaging() {},
    async addStagingSessions() {
      unsupported()
    },
    async saveStagingFiles() {
      unsupported()
    },
    async updateStagingFileTypes() {
      unsupported()
    },
    async commitStaging() {
      return unsupported()
    },

    reportStorageError(action) {
      return (error: unknown) => {
        // eslint-disable-next-line no-console
        console.error(`[storage] ${action} failed`, error)
      }
    },
  }
}
