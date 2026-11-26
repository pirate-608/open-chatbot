import type { ChatStorage } from './port.js'
import { getBackend } from './backend.js'

export { setBackend, getBackend } from './backend.js'
export type { ChatStorage, StoredFile } from './port.js'
export { initStorage } from '../sync/bootstrap.js'

/**
 * 存储 facade：把端口函数转发给当前后端。store / backup 以 `import * as db`
 * 使用这里，切换后端无需改动它们。
 */
export const loadSessionSummaries: ChatStorage['loadSessionSummaries'] = () =>
  getBackend().loadSessionSummaries()
export const loadSession: ChatStorage['loadSession'] = (id) => getBackend().loadSession(id)
export const saveSession: ChatStorage['saveSession'] = (session, files) =>
  getBackend().saveSession(session, files)
export const renameSession: ChatStorage['renameSession'] = (id, title) =>
  getBackend().renameSession(id, title)
export const deleteSession: ChatStorage['deleteSession'] = (id) => getBackend().deleteSession(id)
export const saveFiles: ChatStorage['saveFiles'] = (files) => getBackend().saveFiles(files)
export const loadFile: ChatStorage['loadFile'] = (id) => getBackend().loadFile(id)
export const clearStaging: ChatStorage['clearStaging'] = () => getBackend().clearStaging()
export const addStagingSessions: ChatStorage['addStagingSessions'] = (sessions) =>
  getBackend().addStagingSessions(sessions)
export const saveStagingFiles: ChatStorage['saveStagingFiles'] = (files) =>
  getBackend().saveStagingFiles(files)
export const updateStagingFileTypes: ChatStorage['updateStagingFileTypes'] = (types, ids) =>
  getBackend().updateStagingFileTypes(types, ids)
export const commitStaging: ChatStorage['commitStaging'] = () => getBackend().commitStaging()
export const reportStorageError: ChatStorage['reportStorageError'] = (action) =>
  getBackend().reportStorageError(action)
