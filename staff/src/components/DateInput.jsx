import React, { useId } from 'react'
import { calendarDate } from '../utils/calendarDate'

// Keep the editable string in the parent, including incomplete input: saving must
// never silently reuse an earlier valid date or turn a mistyped date into blank.
export default function DateInput({ value, onChange, label, style }) {
  const errorId = useId()
  const raw = String(value || '')
  const valid = calendarDate(raw)
  const invalid = Boolean(raw && !valid)
  return <div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input type="text" inputMode="numeric" aria-label={label} placeholder="YYYY-MM-DD（如 20261001）"
        value={raw} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined}
        onChange={event => {
          const next = event.target.value
          onChange(/^\d{8}$/.test(next) ? calendarDate(next) || next : next)
        }}
        onBlur={() => { if (valid && valid !== raw) onChange(valid) }}
        style={{ ...style, flex: 1, minWidth: 0 }} />
      <label style={{ position: 'relative', flexShrink: 0, padding: '7px 10px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
        选日期
        <input type="date" aria-label={`${label}：日历选择`} value={valid} min="0001-01-01" max="9999-12-31"
          onChange={event => onChange(event.target.value)}
          onClick={event => { try { event.currentTarget.showPicker?.() } catch { /* Native control remains available. */ } }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
      </label>
    </div>
    {invalid && <div id={errorId} role="status" style={{ color: '#B42318', fontSize: 12, marginTop: 5 }}>请输入完整有效日期，如 2026-10-01 或 20261001</div>}
  </div>
}
