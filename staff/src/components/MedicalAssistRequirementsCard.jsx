import React from 'react'

const PRIMARY_LABELS = new Set(['医院', '科室', '医生', '服务时间'])
const IMPORTANT_LABELS = new Set(['服务要求', '体检执行要求'])

function parseRequirements(text = '') {
  const sections = []
  String(text).split(/\r?\n/).forEach(rawLine => {
    const line = rawLine.trim()
    if (!line) return
    const match = line.match(/^([^：]{1,10})：\s*(.*)$/)
    if (match) sections.push({ label: match[1], lines: match[2] ? [match[2]] : [] })
    else if (sections.length) sections[sections.length - 1].lines.push(line)
    else sections.push({ label: '事项', lines: [line] })
  })
  return sections
}

export default function MedicalAssistRequirementsCard({ text }) {
  const sections = parseRequirements(text)
  if (!sections.length) return null
  const basics = sections.filter(item => PRIMARY_LABELS.has(item.label))
  const details = sections.filter(item => !PRIMARY_LABELS.has(item.label))

  return (
    <div style={{ background: '#F4FAF7', border: '1px solid #B2D8C7', borderRadius: 10, padding: 14 }}>
      <div style={{ fontSize: 14, fontWeight: 750, color: '#1E6B50', marginBottom: 10 }}>本次事务要求</div>
      {basics.length > 0 && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 8, marginBottom: details.length ? 12 : 0 }}>
        {basics.map(item => <div key={item.label} style={{ background: '#fff', borderRadius: 8, padding: '8px 10px', border: '1px solid #DDEBE4' }}>
          <div style={{ fontSize: 11, color: '#789087' }}>{item.label}</div>
          <div style={{ marginTop: 3, fontSize: 13, color: '#1A2B24', fontWeight: 650, lineHeight: 1.6 }}>{item.lines.join('\n')}</div>
        </div>)}
      </div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {details.map(item => <div key={`${item.label}-${item.lines[0] || ''}`} style={{ background: IMPORTANT_LABELS.has(item.label) ? '#E8F5EF' : '#fff', borderRadius: 8, padding: '9px 11px', border: '1px solid #DDEBE4' }}>
          <div style={{ fontSize: 12, color: IMPORTANT_LABELS.has(item.label) ? '#1E6B50' : '#65776F', fontWeight: 700, marginBottom: 5 }}>{item.label}</div>
          {item.lines.length > 1 ? <div style={{ display: 'grid', gap: 5 }}>{item.lines.map((line, index) => <div key={index} style={{ display: 'flex', gap: 7, fontSize: 13, color: '#1A2B24', lineHeight: 1.65 }}><span style={{ color: '#1E6B50' }}>•</span><span>{line}</span></div>)}</div> : <div style={{ fontSize: 13, color: '#1A2B24', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{item.lines[0] || '—'}</div>}
        </div>)}
      </div>
    </div>
  )
}
