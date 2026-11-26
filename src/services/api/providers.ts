import { create } from 'zustand'

/** 供应商能力开关：请求层据此降级，不发送对方不支持的字段/工具。 */
export interface ProviderCapabilities {
  /** 服务端联网搜索工具（deepseek_web_search） */
  search: boolean
  /** 服务端链接阅读工具（deepseek_read_url） */
  readUrl: boolean
  /** Files API 附件上传 */
  files: boolean
  /** 深度思考 */
  thinking: boolean
  /** ASR/TTS 语音 */
  voice: boolean
  /** 扩展模式 safety_check */
  safetyCheck: boolean
  /** latest_reminder 系统信息快照角色 */
  latestReminder: boolean
}

export interface Provider {
  id: string
  label: string
  apiOrigin: string
  model: string
  systemPrompt: string
  capabilities: ProviderCapabilities
}

/** DeepSeek 官方：Anthropic 兼容接口，全功能。apiOrigin 沿用构建期注入，支持自定义网关。 */
const DEEPSEEK: Provider = {
  id: 'deepseek',
  label: 'DeepSeek',
  apiOrigin: __API_ORIGIN__,
  model: 'deepseek-flash',
  systemPrompt: '该助手为DeepSeek，由深度求索公司创造。',
  capabilities: {
    search: true,
    readUrl: true,
    files: true,
    thinking: true,
    voice: true,
    safetyCheck: true,
    latestReminder: true,
  },
}

/** 阿里云百炼按量付费：复用 Anthropic 兼容端点（/apps/anthropic），富功能保守降级。 */
const BAILIAN: Provider = {
  id: 'bailian',
  label: '阿里云百炼（按量）',
  apiOrigin: 'https://dashscope.aliyuncs.com/apps',
  model: 'qwen-flash',
  systemPrompt: '该助手为通义千问，由阿里巴巴集团创造。',
  capabilities: {
    search: false,
    readUrl: false,
    files: false,
    thinking: true,
    voice: false,
    safetyCheck: false,
    latestReminder: false,
  },
}

export const PROVIDERS: Provider[] = [DEEPSEEK, BAILIAN]

const KEY = 'chat-demo:provider'

const readId = (): string => {
  try {
    return localStorage.getItem(KEY) ?? DEEPSEEK.id
  } catch {
    return DEEPSEEK.id
  }
}

export const useProvider = create<{ id: string }>(() => ({ id: readId() }))

/** 当前供应商；未知 id 回退 DeepSeek。请求层在发起请求时读取，运行时切换即时生效。 */
export const getProvider = (): Provider =>
  PROVIDERS.find((provider) => provider.id === useProvider.getState().id) ?? DEEPSEEK

export const setProvider = (id: string): void => {
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // 存储不可用时只在内存中生效
  }
  useProvider.setState({ id })
}
