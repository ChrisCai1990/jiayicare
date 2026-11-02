import React, { useEffect, useId, useRef, useState } from 'react'

const roleNames = { specialist: '专科专家', familyDoctor: '健康顾问', healthManager: '健管专员', healthPlanner: '健康规划师',
  nutritionist: '营养师', rehabSpecialist: '运动复健师', psychologist: '心理咨询师', tcmDoctor: '中医师', medicalAssistant: '就医专员',
  superadmin: '管理员', manager: '管理员' }

const personLabel = person => `${person.name} · ${roleNames[person.role] || person.role}`

export default function SearchableStaffSelect({ people = [], value = '', onChange, excludeId, label = '选择人员', required = false }) {
  const rootRef = useRef(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const candidates = people.filter(person => String(person._id) !== String(excludeId || ''))
  const selected = candidates.find(person => String(person._id) === String(value))
  const keyword = query.trim().toLocaleLowerCase()
  const matches = candidates.filter(person => !keyword || personLabel(person).toLocaleLowerCase().includes(keyword))

  useEffect(() => {
    const closeOutside = event => {
      if (rootRef.current && !rootRef.current.contains(event.target)) { setOpen(false); setQuery('') }
    }
    document.addEventListener('mousedown', closeOutside)
    return () => document.removeEventListener('mousedown', closeOutside)
  }, [])

  function choose(person) {
    onChange(String(person._id))
    setOpen(false)
    setQuery('')
    setActive(0)
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') { setOpen(false); setQuery(''); return }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      setOpen(true)
      setActive(index => Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))))
    }
    if (event.key === 'Enter' && open) {
      event.preventDefault()
      if (matches[active]) choose(matches[active])
    }
  }

  return <div ref={rootRef} style={{ minWidth: 240, position: 'relative' }}>
    <label style={{ display: 'block' }}>{label}
      <input className="form-input" type="text" role="combobox" autoComplete="off" required={required}
        aria-label={label} aria-autocomplete="list" aria-expanded={open} aria-controls={open ? listId : undefined}
        value={open ? query : selected ? personLabel(selected) : ''}
        onFocus={() => { setQuery(''); setOpen(true); setActive(0) }}
        onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); if (value) onChange('') }}
        onKeyDown={handleKeyDown} placeholder="输入姓名或岗位，选择人员"
        style={{ display: 'block', width: '100%', marginTop: 8 }} />
    </label>
    {open && <div id={listId} role="listbox" style={{ position: 'absolute', zIndex: 1300, top: '100%', left: 0, right: 0, maxHeight: 260,
      overflowY: 'auto', background: '#fff', border: '1px solid #DCE8E1', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
      {matches.length ? matches.map((person, index) => <button key={person._id} type="button" role="option"
        aria-selected={String(person._id) === String(value)} onMouseDown={event => event.preventDefault()} onClick={() => choose(person)}
        style={{ display: 'block', width: '100%', padding: '10px 12px', textAlign: 'left', border: 0,
          background: index === active ? '#E8F5EF' : '#fff', cursor: 'pointer', color: '#183C2B' }}>{personLabel(person)}</button>)
        : <div style={{ padding: '12px', color: '#60776C' }}>未找到匹配人员</div>}
    </div>}
  </div>
}
