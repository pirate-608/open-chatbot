import { idbStorage } from './idb.js'
import type { ChatStorage } from './port.js'

/** 当前生效的存储后端。单独成模块，避免 facade 与 bootstrap 互相 import 成环。 */
let active: ChatStorage = idbStorage

export const setBackend = (backend: ChatStorage): void => {
  active = backend
}

export const getBackend = (): ChatStorage => active
