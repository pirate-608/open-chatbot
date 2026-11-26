import type { Session, SessionSummary } from '../chat/types.js'

/** 本地附件原件：id 为附件本地标识，blob 为文件字节。 */
export type StoredFile = { id: string; blob: Blob }

/**
 * chatbot 依赖的存储端口。界面与 store 只认这个接口，不关心背后是本地
 * IndexedDB 还是 GitHub 同步——chatbot 与同步实现由此解耦，各自独立演进。
 */
export interface ChatStorage {
  loadSessionSummaries(): Promise<SessionSummary[]>
  loadSession(id: string): Promise<Session | undefined>
  saveSession(session: Session, files?: StoredFile[]): Promise<void>
  renameSession(id: string, title: string): Promise<void>
  deleteSession(id: string): Promise<void>
  saveFiles(files: StoredFile[]): Promise<void>
  loadFile(id: string): Promise<Blob | undefined>
  clearStaging(): Promise<void>
  addStagingSessions(sessions: Session[]): Promise<void>
  saveStagingFiles(files: StoredFile[]): Promise<void>
  updateStagingFileTypes(types: ReadonlyMap<string, string>, sessionIds: ReadonlySet<string>): Promise<void>
  commitStaging(): Promise<SessionSummary[]>
  reportStorageError(action: string): (error: unknown) => void
}
