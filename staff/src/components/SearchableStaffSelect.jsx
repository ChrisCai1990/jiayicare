import React, { useState } from 'react'

const roleNames = { specialist: '专科专家', familyDoctor: '健康顾问', healthManager: '健管专员', healthPlanner: '健康规划师',
  nutritionist: '营养师', rehabSpecialist: '运动复健师', psychologist: '心理咨询师', tcmDoctor: '中医师', medicalAssistant: '就医专员',
  superadmin: '管理员', manager: '管理员' }

export default function SearchableStaffSelect({ people = [], value = '', onChange, excludeId, label = '选择人员', required = false }) {
  const [search, setSearch] = useState('')
  const candidates = people.filter(person => String(person._id) !== String(excludeId || ''))
  const keyword = search.trim().toLocaleLowerCase()
  const matching = candidates.filter(person => !keyword || `${person.name || ''} ${roleNames[person.role] || person.role || ''}`.toLocaleLowerCase().includes(keyword))
  const selected = candidates.find(person => String(person._id) === String(value))
  const options = selected && !matching.some(person => String(person._id) === String(value)) ? [selected, ...matching] : matching

  return <div style={{ minWidth: 240 }}>
    <label style={{ display: 'block' }}>{label}
      <input className="form-input" type="search" value={search} onChange={event => setSearch(event.target.value)}
        placeholder="搜索姓名或岗位" aria-label={`${label}：搜索姓名或岗位`} style={{ display: 'block', width: '100%', marginTop: 8, marginBottom: 8 }} />
      <select className="form-input" value={value} onChange={event => onChange(event.target.value)} required={required} style={{ width: '100%' }}>
        <option value="">{keyword && !matching.length ? '未找到匹配人员' : '请选择岗位人员'}</option>
        {options.map(person => <option key={person._id} value={person._id}>{person.name} · {roleNames[person.role] || person.role}</option>)}
      </select>
    </label>
    {keyword && <div style={{ color: '#60776C', fontSize: 12, marginTop: 4 }}>匹配 {matching.length} 人</div>}
  </div>
}
