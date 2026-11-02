import React from 'react'
import qualifications from '../../../shared/expertQualifications.cjs'
export default function ExpertLanguageFields({ value = [], onChange, disabled = false }) {
  const update = (index, fields) => onChange(value.map((item, i) => i === index ? { ...item, ...fields } : item))
  return <div>
    <p>请选择服务语言及能力，便于安排海外来华客户服务和翻译支持。</p>
    {value.map((item, i) => <div key={i} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
      <input className="form-input" aria-label={`语言${i + 1}`} placeholder="如普通话、英语、日语" maxLength={40} value={item.language} disabled={disabled} onChange={e => update(i, { language: e.target.value })} style={{ flex: '1 1 140px', padding: 10 }} />
      <select className="form-input" aria-label={`语言${i + 1}能力`} value={item.level} disabled={disabled} onChange={e => update(i, { level: e.target.value })} style={{ flex: '2 1 240px', padding: 10 }}>
        <option value="">请选择能力</option>{Object.entries(qualifications.languageLevels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
      <button type="button" disabled={disabled} onClick={() => onChange(value.filter((_, index) => index !== i))}>移除</button>
    </div>)}
    <button type="button" disabled={disabled || value.length >= 12} onClick={() => onChange([...value, { language: '', level: '' }])}>＋ 添加语言</button>
  </div>
}
