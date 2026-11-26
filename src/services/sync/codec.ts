import type { Message, Session, SessionSummary } from '../chat/types.js'
import type { SyncedDocument } from './engine.js'

/**
 * 映射层：chatbot 的 Session/Message 与 gittersync 文档之间的唯一桥梁。
 * 只有这里同时认识两侧类型——chatbot 改数据模型只动这里，同步库改动也不外溢。
 *
 * 关键决策：每条消息一个文档（而非整会话一个字段）。消息只追加、各自独立，
 * 多端并发追加天然无冲突；会话元数据单独成文档。
 */
export const SESSIONS = 'sessions'
export const MESSAGES = 'messages'

export interface SessionDocData {
  title: string
  createdAt: number
  updatedAt: number
  rootMessageId?: string | null
}

export interface MessageDocData {
  sessionId: string
  message: Message
}

export const sessionToData = (session: Session): SessionDocData => ({
  title: session.title,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  rootMessageId: session.rootMessageId,
})

export const summaryFromDoc = (doc: SyncedDocument<SessionDocData>): SessionSummary => ({
  id: doc.id,
  title: doc.data.title,
  createdAt: doc.data.createdAt,
  updatedAt: doc.data.updatedAt,
})

export const messageToData = (sessionId: string, message: Message): MessageDocData => ({
  sessionId,
  message,
})

export const messageFromDoc = (doc: SyncedDocument<MessageDocData>): Message => doc.data.message

export const assembleSession = (
  meta: SyncedDocument<SessionDocData>,
  messages: Message[]
): Session => ({
  id: meta.id,
  title: meta.data.title,
  createdAt: meta.data.createdAt,
  updatedAt: meta.data.updatedAt,
  rootMessageId: meta.data.rootMessageId,
  messages: [...messages].sort((a, b) => a.createdAt - b.createdAt),
})
