import { create } from 'zustand'

/** 供应商能力开关：请求层据此降级，不发送对方不支持的字段/工具。 */
export interface ProviderCapabilities {
  /** 服务端联网搜索工具（deepseek_web_search） */
  search: boolean
  /** 服务端链接阅读工具（deepseek_read_url） */
  readUrl: boolean
  /** Files API 附件上传 */
  files: boolean
  /** 视觉理解（OpenAI 兼容 base64 image_url 图片输入） */
  vision: boolean
  /** 深度思考 */
  thinking: boolean
  /** ASR/TTS 语音 */
  voice: boolean
  /** 扩展模式 safety_check */
  safetyCheck: boolean
  /** latest_reminder 系统信息快照角色 */
  latestReminder: boolean
}

/** 协议接线选项：把供应商差异收敛为数据，适配器据此翻译，避免到处写 if。 */
export interface ProviderWire {
  /** OpenAI 协议思考控制方式；anthropic 协议用请求体 thinking，置 none。 */
  thinkingControl: 'enable_thinking' | 'reasoning_effort' | 'none'
  /** OpenAI 流式思考增量字段名 */
  reasoningField: 'reasoning_content' | 'reasoning'
  /** 附件编码策略 */
  attachment: 'files-api' | 'base64-image-url' | 'none'
  /** 自动标题策略 */
  title: 'extension' | 'separate-call' | 'none'
  /** 服务端搜索参数（dashscope enable_search） */
  searchParam?: 'enable_search'
  /** 兼容端点下支持 enable_search 的文本模型（多模态模型搜索需原生端点，浏览器不可用）。 */
  searchModel?: string
}

export interface Provider {
  id: string
  label: string
  /** 通信协议：anthropic 走现有 Messages 客户端；openai 走 chat/completions 适配器。 */
  protocol: 'anthropic' | 'openai'
  apiOrigin: string
  model: string
  systemPrompt: string
  wire: ProviderWire
  capabilities: ProviderCapabilities
}

/** DeepSeek 官方：Anthropic 兼容接口，全功能。apiOrigin 沿用构建期注入，支持自定义网关。 */
const DEEPSEEK: Provider = {
  id: 'deepseek',
  label: 'DeepSeek',
  protocol: 'anthropic',
  apiOrigin: __API_ORIGIN__,
  model: 'deepseek-flash',
  systemPrompt: '该助手为DeepSeek，由深度求索公司创造。',
  wire: {
    thinkingControl: 'none',
    reasoningField: 'reasoning_content',
    attachment: 'files-api',
    title: 'extension',
  },
  capabilities: {
    search: true,
    readUrl: true,
    files: true,
    vision: true,
    thinking: true,
    voice: true,
    safetyCheck: true,
    latestReminder: true,
  },
}

/** 阿里云百炼按量付费（dashscope）：Anthropic 端点拒绝浏览器跨域，故走 OpenAI 兼容端点。 */
const BAILIAN: Provider = {
  id: 'bailian',
  label: 'dashscope',
  protocol: 'openai',
  apiOrigin: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen3.6-flash',
  systemPrompt: '该助手为通义千问，由阿里巴巴集团创造。',
  wire: {
    thinkingControl: 'enable_thinking',
    reasoningField: 'reasoning_content',
    attachment: 'base64-image-url',
    title: 'separate-call',
    searchParam: 'enable_search',
    searchModel: 'qwen-flash',
  },
  capabilities: {
    search: true,
    readUrl: false,
    files: false,
    vision: true,
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
