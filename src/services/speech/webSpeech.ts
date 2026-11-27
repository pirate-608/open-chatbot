/** 浏览器 Web Speech API 兜底：第三方供应商无 ASR/TTS 时用本地识别。 */

interface RecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type RecognitionCtor = new () => RecognitionLike

const getCtor = (): RecognitionCtor | null => {
  if (typeof window === 'undefined') {
    return null
  }
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export const webSpeechSupported = (): boolean => getCtor() !== null

export interface WebSpeechSession {
  stop(): void
  cancel(): void
}

/** 启动一次性本地识别；结果交 onResult，结束/出错回调用于复位状态。不支持时返回 null。 */
export const startWebSpeech = (
  lang: string,
  onResult: (text: string) => void,
  onEnd: () => void,
  onError: () => void
): WebSpeechSession | null => {
  const Ctor = getCtor()
  if (!Ctor) {
    return null
  }
  const recognition = new Ctor()
  recognition.lang = lang
  recognition.interimResults = false
  recognition.continuous = false
  recognition.maxAlternatives = 1
  let cancelled = false
  recognition.onresult = (event) => {
    const text = event.results[0]?.[0]?.transcript ?? ''
    if (text) {
      onResult(text)
    }
  }
  recognition.onend = () => {
    if (!cancelled) {
      onEnd()
    }
  }
  recognition.onerror = () => {
    if (!cancelled) {
      onError()
    }
  }
  try {
    recognition.start()
  } catch {
    return null
  }
  return {
    stop: () => {
      try {
        recognition.stop()
      } catch {
        // 已结束
      }
    },
    cancel: () => {
      cancelled = true
      try {
        recognition.abort()
      } catch {
        // 已结束
      }
    },
  }
}
