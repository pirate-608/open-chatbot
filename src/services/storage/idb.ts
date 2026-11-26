import * as db from '../chat/db.js'
import type { ChatStorage } from './port.js'

/** 本地 IndexedDB 后端：直接复用既有 db.ts，作为无 GitHub 时的默认与兜底。 */
export const idbStorage: ChatStorage = {
  loadSessionSummaries: db.loadSessionSummaries,
  loadSession: db.loadSession,
  saveSession: db.saveSession,
  renameSession: db.renameSession,
  deleteSession: db.deleteSession,
  saveFiles: db.saveFiles,
  loadFile: db.loadFile,
  clearStaging: db.clearStaging,
  addStagingSessions: db.addStagingSessions,
  saveStagingFiles: db.saveStagingFiles,
  updateStagingFileTypes: db.updateStagingFileTypes,
  commitStaging: db.commitStaging,
  reportStorageError: db.reportStorageError,
}
