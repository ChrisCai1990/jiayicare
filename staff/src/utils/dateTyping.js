// Native <input type="date"> uses browser-specific segmented editing. On some
// Windows browsers typing a year never advances to the month segment, so a
// normal continuous entry such as 20250705 becomes unusable. Convert every
// web date input to a numeric-friendly text field while keeping its YYYY-MM-DD
// value contract for existing React forms and APIs.
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
  const prepareAll = root => root.querySelectorAll?.('input[type="date"], input[data-continuous-date="true"]').forEach(prepareDateInput)
  prepareAll(document)
  document.addEventListener('focusin', event => prepareDateInput(event.target), true)
  document.addEventListener('input', event => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || input.dataset.continuousDate !== 'true') return
    const normalized = normalizeDateTyping(input.value)
    if (normalized !== input.value) input.value = normalized
    syncValidity(input)
  }, true)
  document.addEventListener('blur', event => {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || input.dataset.continuousDate !== 'true') return
    const normalized = normalizeDateTyping(input.value)
    if (normalized !== input.value) {
      input.value = normalized
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    if (input.value && !/^\d{4}-\d{2}-\d{2}$/.test(input.value)) {
      input.value = ''
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    syncValidity(input)
  }, true)
  new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      prepareDateInput(node)
      prepareAll(node)
    }
  }))).observe(document.body, { childList: true, subtree: true })
}
