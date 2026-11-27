import { ApiError, request } from './transport.js'
import type { Provider } from './providers.js'
import { readServerSentEvents } from './sse.js'
import type {
  CreateMessageRequest,
  MessageStreamEvent,
  MessageUsage,
  StopReason,
  TextBlockParam,
} from './types.js'

/**
 * OpenAI 兼容 chat/completions 适配器。
 *
 * 百炼等供应商的 Anthropic 端点拒绝浏览器跨域，只有 OpenAI 兼容端点开放 CORS，
 * 因此这些供应商走本协议。适配器把上游 SSE 增量翻译成 demo 的内部块事件
 * （message_start / content_block_* / message_delta / message_stop），
 * 上层 store / applyEvent / UI 完全复用，无需改动。
 */

interface OpenAIChunk {
  id?: string
  model?: string
  error?: { message?: string }
  usage?: { prompt_tokens?: number; completion_tokens?: number }
  search_info?: {
    search_results?: { title?: string; url?: string; icon?: string; site_name?: string }[]
  }
  choices?: {
    delta?: {
      content?: string | null
      reasoning_content?: string | null
      reasoning?: string | null
    }
    finish_reason?: string | null
  }[]
}

const toUsage = (usage: OpenAIChunk['usage']): MessageUsage | undefined =>
  usage
    ? {
        input_tokens: usage.prompt_tokens ?? 0,
        output_tokens: usage.completion_tokens ?? 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      }
    : undefined

const toStopReason = (finish: string | null | undefined): StopReason =>
  finish === 'length'
    ? 'max_tokens'
    : finish === 'tool_calls'
      ? 'tool_use'
      : finish === 'content_filter'
        ? 'refusal'
        : 'end_turn'

type OpenAIPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** 规范请求（Anthropic 形状）→ OpenAI messages：系统提示 + 用户文本/内联图片 + 助手文本。 */
const toOpenAIMessages = (
  body: CreateMessageRequest,
  multimodal: boolean
): { role: string; content: string | OpenAIPart[] }[] => {
  const messages: { role: string; content: string | OpenAIPart[] }[] = []
  if (body.system) {
    messages.push({ role: 'system', content: body.system })
  }
  for (const message of body.messages) {
    if (message.role === 'latest_reminder') {
      continue
    }
    if (typeof message.content === 'string') {
      // 多模态模型（qwen3.6 等）的联网搜索要求 content 为数组形态；字符串会走文本路径使 enable_search 失效。
      const content =
        message.role === 'user' && multimodal
          ? [{ type: 'text' as const, text: message.content }]
          : message.content
      messages.push({ role: message.role, content })
      continue
    }
    if (message.role === 'user') {
      const parts: OpenAIPart[] = []
      for (const block of message.content) {
        if (block.type === 'text') {
          parts.push({ type: 'text', text: block.text })
        } else if (block.type === 'image_base64') {
          parts.push({
            type: 'image_url',
            image_url: { url: `data:${block.media_type};base64,${block.data}` },
          })
        }
      }
      messages.push({
        role: 'user',
        content: parts.length ? parts : multimodal ? [{ type: 'text', text: '' }] : '',
      })
    } else {
      const text = message.content
        .filter((block): block is TextBlockParam => block.type === 'text')
        .map((block) => block.text)
        .join('')
      messages.push({ role: 'assistant', content: text })
    }
  }
  return messages
}

export async function* streamOpenAI(
  apiKey: string,
  body: CreateMessageRequest,
  signal: AbortSignal,
  provider: Provider
): AsyncGenerator<MessageStreamEvent> {
  // 兼容端点的 enable_search 仅文本模型生效；带图时用视觉模型（不搜索），纯文本搜索时切文本搜索模型。
  const hasImages = body.messages.some(
    (message) =>
      message.role === 'user' &&
      Array.isArray(message.content) &&
      message.content.some((block) => block.type === 'image_base64')
  )
  const useSearch = !!body.enableSearch && !hasImages
  const model =
    useSearch && provider.wire.searchModel ? provider.wire.searchModel : body.model
  const requestBody: Record<string, unknown> = {
    model,
    messages: toOpenAIMessages(body, provider.wire.attachment === 'base64-image-url'),
    stream: true,
    stream_options: { include_usage: true },
  }
  // 思考控制按供应商接线：enable_thinking（千问）/ reasoning_effort（o 系）/ none。
  const thinkingEnabled = body.thinking.type === 'enabled'
  if (provider.wire.thinkingControl === 'enable_thinking') {
    requestBody.enable_thinking = thinkingEnabled
  } else if (provider.wire.thinkingControl === 'reasoning_effort' && thinkingEnabled) {
    requestBody.reasoning_effort = 'medium'
  }
  // dashscope 联网搜索：enable_search + enable_source 返回来源列表。
  if (provider.wire.searchParam === 'enable_search' && useSearch) {
    requestBody.enable_search = true
    requestBody.search_options = { enable_source: true }
  }

  const response = await request(`${provider.apiOrigin}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(requestBody),
    signal,
  })
  const contentType = response.headers.get('Content-Type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    throw new ApiError('protocol', await response.text().catch(() => ''))
  }

  let started = false
  let finished = false
  let nextIndex = 0
  let thinkingIndex: number | null = null
  let textIndex: number | null = null
  let usage: MessageUsage | undefined
  let searchEmitted = false

  for await (const { data } of readServerSentEvents(response.body, signal)) {
    if (data === '[DONE]') {
      break
    }
    let chunk: OpenAIChunk
    try {
      chunk = JSON.parse(data) as OpenAIChunk
    } catch {
      continue
    }
    if (chunk.error) {
      throw new ApiError('stream', chunk.error.message ?? data)
    }

    const out: MessageStreamEvent[] = []
    if (!started) {
      started = true
      out.push({
        type: 'message_start',
        message: { id: chunk.id ?? '', model: chunk.model ?? body.model },
      })
    }
    if (chunk.usage) {
      usage = toUsage(chunk.usage)
    }
    const results = chunk.search_info?.search_results
    if (results?.length && !searchEmitted) {
      searchEmitted = true
      const toolId = `srvtoolu_s_0_${'0'.repeat(32)}`
      // 视图的「已阅读/来源面板」由 server_tool_use 调用块驱动，需与结果块配对。
      out.push({
        type: 'content_block_start',
        index: nextIndex++,
        content_block: {
          type: 'server_tool_use',
          id: toolId,
          name: 'deepseek_web_search',
          input: { action: 'search', queries: [] },
          caller: { type: 'direct' },
          kind: 'search',
        },
      })
      out.push({
        type: 'content_block_start',
        index: nextIndex++,
        content_block: {
          type: 'web_search_tool_result',
          tool_use_id: toolId,
          content: results.map((result) => ({
            type: 'web_search_result',
            title: result.title ?? '',
            url: result.url ?? '',
            snippet: '',
            site_icon: result.icon || null,
            site_name: result.site_name || null,
            encrypted_content: '',
            page_age: null,
          })),
          kind: 'search',
        },
      })
    }
    const choice = chunk.choices?.[0]
    const delta = choice?.delta

    const reasoning =
      provider.wire.reasoningField === 'reasoning' ? delta?.reasoning : delta?.reasoning_content
    if (reasoning) {
      if (thinkingIndex === null) {
        thinkingIndex = nextIndex++
        out.push({
          type: 'content_block_start',
          index: thinkingIndex,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        })
      }
      out.push({
        type: 'content_block_delta',
        index: thinkingIndex,
        delta: { type: 'thinking_delta', thinking: reasoning },
      })
    }
    if (delta?.content) {
      if (thinkingIndex !== null) {
        out.push({ type: 'content_block_stop', index: thinkingIndex })
        thinkingIndex = null
      }
      if (textIndex === null) {
        textIndex = nextIndex++
        out.push({
          type: 'content_block_start',
          index: textIndex,
          content_block: { type: 'text', text: '' },
        })
      }
      out.push({
        type: 'content_block_delta',
        index: textIndex,
        delta: { type: 'text_delta', text: delta.content },
      })
    }
    if (choice?.finish_reason) {
      if (thinkingIndex !== null) {
        out.push({ type: 'content_block_stop', index: thinkingIndex })
        thinkingIndex = null
      }
      if (textIndex !== null) {
        out.push({ type: 'content_block_stop', index: textIndex })
        textIndex = null
      }
      out.push({
        type: 'message_delta',
        delta: { stop_reason: toStopReason(choice.finish_reason), stop_sequence: null },
        usage,
      })
      out.push({ type: 'message_stop' })
      finished = true
    }
    yield* out
    if (finished) {
      return
    }
  }

  // 流提前结束（无 finish_reason / [DONE]）：收尾已开块并按正常结束处理。
  if (!finished) {
    const out: MessageStreamEvent[] = []
    if (thinkingIndex !== null) {
      out.push({ type: 'content_block_stop', index: thinkingIndex })
    }
    if (textIndex !== null) {
      out.push({ type: 'content_block_stop', index: textIndex })
    }
    out.push({
      type: 'message_delta',
      delta: { stop_reason: 'end_turn', stop_sequence: null },
      usage,
    })
    out.push({ type: 'message_stop' })
    yield* out
  }
}

/** 单独一次非流式请求生成会话标题（OpenAI 兼容供应商无 title 扩展）。 */
export const generateTitle = async (
  apiKey: string,
  provider: Provider,
  question: string,
  answer: string,
  signal?: AbortSignal
): Promise<string> => {
  const response = await request(`${provider.apiOrigin}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: provider.model,
      stream: false,
      messages: [
        {
          role: 'system',
          content: '为给定对话生成一个简短标题（不超过8个字），只输出标题本身，不要引号与解释。',
        },
        { role: 'user', content: `用户：${question}\n助手：${answer}`.slice(0, 2000) },
      ],
    }),
    signal,
  })
  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] }
  return (data.choices?.[0]?.message?.content ?? '').trim()
}
