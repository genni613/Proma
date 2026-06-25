import type { ChannelTestErrorType, ChannelTestResult } from '@proma/shared'

const MAX_RAW_SUMMARY_LENGTH = 500
const MAX_ERROR_BODY_BYTES = 16 * 1024

interface ErrorDescriptor {
  message: string
  code: string
}

const ERROR_LABELS: Record<ChannelTestErrorType, string> = {
  auth: '认证失败',
  permission: '权限不足',
  not_found: '资源不存在',
  rate_limit: '请求频率受限',
  quota: '额度不足',
  bad_request: '请求无效',
  server: '供应商服务异常',
  network: '网络连接失败',
  timeout: '连接超时',
  unknown: '未知错误',
}

const RETRIABLE_ERROR_TYPES: ReadonlySet<ChannelTestErrorType> = new Set([
  'rate_limit',
  'server',
  'network',
  'timeout',
])

const QUOTA_PATTERN = /insufficient[_\s-]?quota|quota|billing|credit|payment[_\s-]?required|余额不足|额度不足|欠费|账户余额|充值/i
const AUTH_PATTERN = /authentication|unauthorized|invalid[_\s-]?(?:api[_\s-]?)?key|api key not valid|incorrect api key|invalid token|凭证无效|密钥无效|未认证/i
const PERMISSION_PATTERN = /permission|forbidden|access denied|not allowed|model access|无权限|权限不足|无权|访问受限/i
const NOT_FOUND_PATTERN = /not found|does not exist|unknown model|model.*不存在|不存在|未找到/i
const RATE_LIMIT_PATTERN = /rate[_\s-]?limit|too many requests|requests per|限流|请求过于频繁|频率限制/i
const BAD_REQUEST_PATTERN = /bad request|invalid request|validation|invalid parameter|unsupported|malformed|请求无效|参数错误|协议不兼容/i
const TIMEOUT_PATTERN = /timeout|timed out|etimedout|超时/i
const NETWORK_PATTERN = /fetch failed|network|econnreset|econnrefused|enotfound|eai_again|socket|connection|连接失败|网络错误/i
const INVALID_URL_PATTERN = /invalid url|failed to parse url|unsupported protocol|only absolute urls|invalid protocol|无效的 url/i
const SENSITIVE_VALUE_PATTERNS: ReadonlyArray<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, replacement: 'Bearer [REDACTED]' },
  { pattern: /\bsk-[A-Za-z0-9_-]{8,}\b/gi, replacement: '[REDACTED]' },
  {
    pattern: /(["']?(?:api[_-]?key|x-api-key|access[_-]?token|token|authorization|key)["']?\s*[:=]\s*["']?)[^"',&\s}]+/gi,
    replacement: '$1[REDACTED]',
  },
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function describeErrorBody(rawBody: string): ErrorDescriptor {
  const trimmed = rawBody.trim()
  if (!trimmed) return { message: '', code: '' }

  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (!isRecord(parsed)) return { message: trimmed, code: '' }

    const nestedError = isRecord(parsed.error) ? parsed.error : undefined
    const message = nestedError
      ? readString(nestedError, 'message')
      : readString(parsed, 'message')
    const code = nestedError
      ? readString(nestedError, 'code') || readString(nestedError, 'type') || readString(nestedError, 'status')
      : readString(parsed, 'code') || readString(parsed, 'type') || readString(parsed, 'status')

    return {
      message: message || trimmed,
      code,
    }
  } catch {
    return { message: trimmed, code: '' }
  }
}

async function readErrorBody(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''

  const decoder = new TextDecoder()
  let body = ''
  let bytesRead = 0

  try {
    while (bytesRead < MAX_ERROR_BODY_BYTES) {
      const { done, value } = await reader.read()
      if (done) break

      const remainingBytes = MAX_ERROR_BODY_BYTES - bytesRead
      const chunk = value.subarray(0, remainingBytes)
      body += decoder.decode(chunk, { stream: true })
      bytesRead += chunk.byteLength

      if (chunk.byteLength < value.byteLength || bytesRead >= MAX_ERROR_BODY_BYTES) {
        await reader.cancel()
        break
      }
    }
    return body + decoder.decode()
  } catch {
    return body
  } finally {
    reader.releaseLock()
  }
}

function truncateSummary(value: string): string | undefined {
  const redacted = SENSITIVE_VALUE_PATTERNS.reduce(
    (result, { pattern, replacement }) => result.replace(pattern, replacement),
    value,
  )
  const normalized = redacted.replace(/\s+/g, ' ').trim()
  if (!normalized) return undefined
  return normalized.length > MAX_RAW_SUMMARY_LENGTH
    ? `${normalized.slice(0, MAX_RAW_SUMMARY_LENGTH)}...`
    : normalized
}

function classifyHttpError(statusCode: number, descriptor: ErrorDescriptor): ChannelTestErrorType {
  const semanticText = `${descriptor.code} ${descriptor.message}`

  if (statusCode >= 500) return 'server'
  if (statusCode === 408) return 'timeout'
  if (statusCode === 402) return 'quota'

  if (QUOTA_PATTERN.test(semanticText)) return 'quota'
  if (AUTH_PATTERN.test(semanticText)) return 'auth'
  if (statusCode === 401) return 'auth'
  if (PERMISSION_PATTERN.test(semanticText)) return 'permission'
  if (NOT_FOUND_PATTERN.test(semanticText)) return 'not_found'
  if (RATE_LIMIT_PATTERN.test(semanticText)) return 'rate_limit'
  if (BAD_REQUEST_PATTERN.test(semanticText)) return 'bad_request'

  if (statusCode === 403) return 'permission'
  if (statusCode === 404) return 'not_found'
  if (statusCode === 429) return 'rate_limit'
  if ([400, 405, 409, 413, 415, 422].includes(statusCode)) return 'bad_request'
  return 'unknown'
}

function buildFailureResult(
  errorType: ChannelTestErrorType,
  detail: string,
  statusCode?: number,
): ChannelTestResult {
  const rawSummary = truncateSummary(detail)
  const statusLabel = statusCode == null ? '' : ` (${statusCode})`
  const detailLabel = rawSummary ? `：${rawSummary}` : ''

  return {
    success: false,
    message: `${ERROR_LABELS[errorType]}${statusLabel}${detailLabel}`,
    errorType,
    ...(statusCode == null ? {} : { statusCode }),
    ...(rawSummary ? { rawSummary } : {}),
    retriable: RETRIABLE_ERROR_TYPES.has(errorType),
  }
}

function collectErrorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error)

  const parts = [error.name, error.message]
  if (error.cause instanceof Error) {
    parts.push(error.cause.name, error.cause.message)
  } else if (error.cause != null) {
    parts.push(String(error.cause))
  }
  return parts.filter(Boolean).join(': ')
}

export async function normalizeChannelTestResponse(response: Response): Promise<ChannelTestResult> {
  if (response.ok) {
    return { success: true, message: '连接成功' }
  }

  const rawBody = await readErrorBody(response)
  const descriptor = describeErrorBody(rawBody)
  const errorType = classifyHttpError(response.status, descriptor)
  const detail = descriptor.message || response.statusText
  return buildFailureResult(errorType, detail, response.status)
}

export function normalizeChannelTestException(error: unknown): ChannelTestResult {
  const detail = collectErrorText(error)

  if (
    (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError'))
    || TIMEOUT_PATTERN.test(detail)
  ) {
    return buildFailureResult('timeout', detail)
  }

  if (INVALID_URL_PATTERN.test(detail)) {
    return buildFailureResult('bad_request', detail)
  }

  if (NETWORK_PATTERN.test(detail)) {
    return buildFailureResult('network', detail)
  }

  return buildFailureResult('unknown', detail)
}
