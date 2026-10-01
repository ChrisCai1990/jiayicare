import React from 'react'
import DateField from '../../../shared/DateField.jsx'
export default function DateInput({ value, onChange, label, ...props }) {
  return <DateField {...props} type="date" value={value || ''} aria-label={label} onChange={event => onChange(event.target.value)} />
}
