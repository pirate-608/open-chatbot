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

/** 规范请求（Anthropic 形状）→ OpenAI messages：系统提示 + 用户/助手文本；思考与工具块按约定不进入历史。 */
const toOpenAIMessages = (body: CreateMessageRequest): { role: string; content: string }[] => {
  const messages: { role: string; content: string }[] = []
  if (body.system) {
    messages.push({ role: 'system', content: body.system })
  }
  for (const message of body.messages) {
    if (message.role === 'latest_reminder') {
      continue
    }
    const content =
      typeof message.content === 'string'
        ? message.content
        : message.content
            .filter((block): block is TextBlockParam => block.type === 'text')
            .map((block) => block.text)
            .join('')
    messages.push({ role: message.role, content })
  }
  return messages
}

export async function* streamOpenAI(
  apiKey: string,
  body: CreateMessageRequest,
  signal: AbortSignal,
  provider: Provider
): AsyncGenerator<MessageStreamEvent> {
  const requestBody: Record<string, unknown> = {
    model: body.model,
    messages: toOpenAIMessages(body),
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
