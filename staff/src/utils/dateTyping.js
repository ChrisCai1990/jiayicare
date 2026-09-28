// 日期字段必须保留浏览器原生 date 控件：既可手动输入，也可通过日历选择。
// 过去为解决连续输入而把全部 date 改成 text，导致所有业务日期都失去选择器。
export function normalizeDateTyping(value) {
  const source = String(value || '').trim()
  const digits = source.replace(/\D/g, '')
  if (!digits) return ''
  const clipped = digits.slice(0, 8)
  if (clipped.length <= 4) return clipped
  if (clipped.length <= 6) return `${clipped.slice(0, 4)}-${clipped.slice(4)}`
  return `${clipped.slice(0, 4)}-${clipped.slice(4, 6)}-${clipped.slice(6)}`
}

function syncValidity(input) {
  const value = input.value
  const complete = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const parsed = complete ? new Date(`${value}T00:00:00`) : null
  const invalidDate = complete && (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
  const outsideRange = complete && ((input.min && value < input.min) || (input.max && value > input.max))
  const incomplete = value !== '' && !complete
  input.setCustomValidity(incomplete ? '请输入完整日期（YYYY-MM-DD）' : invalidDate ? '请输入有效日期（YYYY-MM-DD）' : outsideRange ? '日期不在允许范围内' : '')
}

function prepareDateInput(input) {
  if (!(input instanceof HTMLInputElement) || input.dataset.continuousDate === 'true') return
  if (input.type !== 'date' && input.getAttribute('type') !== 'date') return
  const initialValue = input.value
  input.type = 'text'
  input.dataset.continuousDate = 'true'
  input.inputMode = 'numeric'
  if (input.maxLength < 0) input.maxLength = 10
  input.placeholder ||= 'YYYY-MM-DD'
  input.title ||= '可连续输入 20250705 或 2025-07-05'
  input.value = normalizeDateTyping(initialValue)
  syncValidity(input)
}

export function installContinuousDateTyping() {
  // 保留调用点，避免其他入口改动；不再篡改 input[type=date] 的类型。
}
