import React, { forwardRef, useId, useLayoutEffect, useRef } from 'react'
import { calendarDate } from './calendarDate.mjs'

export function normalizeCalendarValue(value, type = 'date') {
  if (type === 'date') return calendarDate(value)
  const match = String(value || '').trim().match(/^(.*?)[T ](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!match || +match[2] > 23 || +match[3] > 59 || +(match[4] || 0) > 59) return ''
  const date = calendarDate(match[1])
  return date ? `${date}T${match[2]}:${match[3]}${match[4] ? ':' + match[4] : ''}` : ''
}

const CalendarField = forwardRef(function CalendarField(props, forwardedRef) {
  const { type, value, defaultValue, onChange, onBlur, style, className, min, max, step, disabled, readOnly, ...rest } = props
  const input = useRef(null)
  const picker = useRef(null)
  const errorId = useId()
  const [draft, setDraft] = React.useState(defaultValue || '')
  const raw = String(value ?? draft)
  const normalized = normalizeCalendarValue(raw, type)
  const error = raw && !normalized ? '请输入完整有效日期，如 2026-10-01' :
    normalized && ((min && normalized < min) || (max && normalized > max)) ? '日期不在允许范围内' : ''
  useLayoutEffect(() => { input.current?.setCustomValidity(error) }, [error])
  const update = event => {
    const next = event.target.value
    // Do not pad a one-digit day while typing: 2026-10-1 may become 2026-10-10.
    const complete = /^\d{8}$/.test(next) && type === 'date' ? calendarDate(next) : ''
    if (complete) event.target.value = complete
    setDraft(event.target.value)
    onChange?.(event)
  }
  const select = event => {
    const next = event.target.value
    // Dispatch from the original named text field, preserving existing handlers,
    // refs, form serialization and target/currentTarget semantics.
    const setter = Object.getOwnPropertyDescriptor(input.current.ownerDocument.defaultView.HTMLInputElement.prototype, 'value').set
    setter.call(input.current, next)
    input.current.dispatchEvent(new input.current.ownerDocument.defaultView.Event('input', { bubbles: true }))
  }
  return <span style={{ display: 'inline-flex', flexDirection: 'column', verticalAlign: 'middle', minWidth: 0, maxWidth: '100%', width: style?.width || '100%', flex: style?.flex, margin: style?.margin, marginTop: style?.marginTop, marginBottom: style?.marginBottom }}>
    <span style={{ display: 'flex', alignItems: 'stretch', minWidth: 0, gap: 4 }}>
      <input {...rest} ref={node => { input.current = node; if (typeof forwardedRef === 'function') forwardedRef(node); else if (forwardedRef) forwardedRef.current = node }}
        type="text" inputMode={type === 'date' ? 'numeric' : 'text'} value={raw} onChange={update}
        onBlur={event => {
          if (normalized && normalized !== raw) { event.target.value = normalized; setDraft(normalized); onChange?.(event) }
          onBlur?.(event)
        }}
        disabled={disabled} readOnly={readOnly} className={className}
        placeholder={props.placeholder || (type === 'date' ? 'YYYY-MM-DD / 20261001' : 'YYYY-MM-DD HH:mm')}
        aria-invalid={Boolean(error)} aria-describedby={[props['aria-describedby'], error ? errorId : ''].filter(Boolean).join(' ') || undefined}
        data-calendar-entry="true" style={{ ...style, flex: 1, minWidth: 0, width: '100%', margin: 0 }} />
      <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', border: '1px solid #E0D9CE', borderRadius: 6, padding: '0 7px', flexShrink: 0, opacity: disabled ? 0.5 : 1 }}>
        <span aria-hidden="true">▦</span>
        <input ref={picker} type={type} value={normalized} min={min || '0001-01-01'} max={max || (type === 'date' ? '9999-12-31' : '9999-12-31T23:59:59')} step={step}
          disabled={disabled || readOnly} onChange={select} aria-label={`${props['aria-label'] || '日期'}：日历选择`}
          onClick={event => { try { event.currentTarget.showPicker?.() } catch { /* Use the native fallback. */ } }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
      </span>
    </span>
    {error && <span id={errorId} role="status" style={{ color: '#B42318', fontSize: 12, marginTop: 4 }}>{error}</span>}
  </span>
})

// Dynamic field definitions may also render text, number, time or checkbox.
export default forwardRef(function DateField(props, ref) {
  return ['date', 'datetime-local'].includes(props.type)
    ? <CalendarField {...props} ref={ref} /> : <input {...props} ref={ref} />
})

