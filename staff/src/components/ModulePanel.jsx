import React, { useState, createContext, useContext } from 'react'

// 板块化方案编辑的通用UI组件，从 AnnualMgmtPlanPage.jsx 抽出（2026-07-13），
// 供年度管理方案/营养干预方案/就医协助方案共用同一套"板块折叠+多条记录行内展开+开关板块"交互，
// 保持三类AI方案呈现体验一致。

// ── 员工列表上下文：供 FieldInput 里的 staff-select 字段渲染下拉选项，避免逐层透传 props ──
export const StaffListContext = createContext([])

export function Toggle({ value, onChange }) {
  return (
    <div
      onClick={onChange ? () => onChange(!value) : undefined}
      style={{
        width: 40, height: 22, borderRadius: 11,
        background: value ? '#1E6B50' : '#ddd',
        position: 'relative', cursor: onChange ? 'pointer' : 'default',
        transition: 'background 0.2s', flexShrink: 0, display: 'inline-block',
      }}
    >
      <div style={{
        position: 'absolute', top: 3, left: value ? 21 : 3,
        width: 16, height: 16, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  )
}

export function FieldRow({ label, internal, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid #F5F2EC', gap: 12 }}>
      <span style={{ width: 140, flexShrink: 0, fontSize: 13, color: '#4A6558', paddingTop: 8, lineHeight: 1.4, display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        {label}
        {internal && (
          <span style={{ fontSize: 10, background: '#FEF9EC', color: '#D97706', border: '1px solid #F6D860', borderRadius: 4, padding: '1px 4px', flexShrink: 0, marginTop: 1 }}>
            仅内部
          </span>
        )}
      </span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

const inputStyle = { width: '100%', padding: '7px 10px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }

export function FieldInput({ field, value, onChange }) {
  if (field.type === 'textarea') {
    return (
      <textarea
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={field.placeholder || `请填写${field.label}`}
        rows={3}
        style={{ ...inputStyle, resize: 'vertical' }}
      />
    )
  }
  if (field.type === 'date') {
    return (
      <input type="date" value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle} />
    )
  }
  if (field.type === 'yesno') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 6 }}>
        <Toggle value={!!value} onChange={onChange} />
        <span style={{ fontSize: 13, color: value ? '#1E6B50' : '#aaa' }}>{value ? '是' : '否'}</span>
      </div>
    )
  }
  if (field.type === 'staff-select') {
    const staffList = useContext(StaffListContext)
    return (
      <select value={value || ''} onChange={e => onChange(e.target.value)} style={inputStyle}>
        <option value="">请选择{field.label}</option>
        {staffList.map(s => (
          <option key={s._id} value={s._id}>{s.name} · {s.roleLabel || s.role}</option>
        ))}
      </select>
    )
  }
  return (
    <input
      type="text"
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      placeholder={field.placeholder || `请填写${field.label}`}
      style={inputStyle}
    />
  )
}

// ── 单条记录编辑区（多条模块用）─────────────────────────────────────
export function RecordEditor({ def, record, onChange, onDelete, index, total }) {
  const [open, setOpen] = useState(index === 0 && total === 1)
  const summary = record[def.summaryKey] || `${def.summaryLabel} ${index + 1}`
  return (
    <div style={{ border: '1px solid #E8E3DC', borderRadius: 8, marginBottom: 8, background: '#FAFAF8' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '9px 12px', cursor: 'pointer' }} onClick={() => setOpen(v => !v)}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#1A2B24' }}>
          {summary}
        </span>
        <button
          onClick={e => { e.stopPropagation(); if (window.confirm('确定删除这条记录？')) onDelete() }}
          style={{ fontSize: 11, color: '#DC3545', background: 'none', border: 'none', cursor: 'pointer', marginRight: 8, padding: '0 4px' }}
        >删除</button>
        <span style={{ color: '#aaa', fontSize: 12, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
      </div>
      {open && (
        <div style={{ padding: '0 12px 12px', borderTop: '1px solid #F0EDE7' }}>
          {def.fields.map(field => (
            <FieldRow key={field.key} label={field.label} internal={field.internal}>
              <FieldInput field={field} value={record[field.key]} onChange={val => onChange({ ...record, [field.key]: val })} />
            </FieldRow>
          ))}
        </div>
      )}
    </div>
  )
}

// ── 板块折叠面板 ───────────────────────────────────────────────────────
export function ModulePanel({ moduleKey, def, data, onChange }) {
  const [open, setOpen] = useState(false)
  const enabled = data.enabled !== false

  const set = (fieldKey, val) => onChange(moduleKey, fieldKey, val)

  // 判断是否有已填写的字段（用于显示小圆点提示）
  const hasContent = def.multi
    ? (data.records || []).length > 0
    : def.fields.some(f => f.key !== 'notes' && data[f.key] !== undefined && data[f.key] !== '' && data[f.key] !== false)

  // 多条模块：records 数组操作
  const records = data.records || []
  const setRecords = (newRecords) => onChange(moduleKey, 'records', newRecords)
  const addRecord = () => {
    setRecords([...records, {}])
    if (!open) setOpen(true)
  }
  const updateRecord = (i, rec) => {
    const next = [...records]; next[i] = rec; setRecords(next)
  }
  const deleteRecord = (i) => {
    setRecords(records.filter((_, idx) => idx !== i))
  }

  return (
    <div style={{ border: '1px solid #E0D9CE', borderRadius: 12, marginBottom: 12, background: '#fff', overflow: 'hidden' }}>
      {/* 模块头 */}
      <div
        style={{
          display: 'flex', alignItems: 'center', padding: '14px 18px',
          cursor: 'pointer', userSelect: 'none',
          background: open ? '#F9F6F0' : '#fff',
        }}
        onClick={() => setOpen(v => !v)}
      >
        <span style={{ fontSize: 20, marginRight: 10 }}>{def.icon}</span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 15, color: '#1A2B24', display: 'flex', alignItems: 'center', gap: 8 }}>
          {def.name}
          {hasContent && <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#1E6B50', flexShrink: 0 }} title="已有内容" />}
          {def.multi && records.length > 0 && (
            <span style={{ fontSize: 11, color: '#8AA89C', fontWeight: 400 }}>{records.length} 条</span>
          )}
        </span>
        {def.multi && (
          <button
            onClick={e => { e.stopPropagation(); addRecord() }}
            style={{ fontSize: 12, color: '#1E6B50', background: '#E8F5EF', border: '1px solid #B2D8C7', borderRadius: 20, padding: '3px 10px', cursor: 'pointer', marginRight: 10, fontWeight: 600 }}
          >＋ 新增</button>
        )}
        {!def.multi && (
          <div style={{ marginRight: 14 }} onClick={e => { e.stopPropagation(); set('enabled', !enabled) }}>
            <Toggle value={enabled} onChange={() => set('enabled', !enabled)} />
          </div>
        )}
        <span style={{ color: '#aaa', fontSize: 13, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
      </div>

      {/* 板块内容 */}
      {open && (
        <div style={{ padding: '4px 18px 18px', borderTop: '1px solid #F0EDE7' }}>
          {def.multi ? (
            records.length === 0 ? (
              <div style={{ padding: '16px 0', color: '#aaa', fontSize: 13, textAlign: 'center' }}>
                暂无记录，点击「新增」添加
              </div>
            ) : (
              <div style={{ paddingTop: 8 }}>
                {records.map((rec, i) => (
                  <RecordEditor
                    key={i}
                    def={def}
                    record={rec}
                    index={i}
                    total={records.length}
                    onChange={newRec => updateRecord(i, newRec)}
                    onDelete={() => deleteRecord(i)}
                  />
                ))}
                <button
                  onClick={addRecord}
                  style={{ width: '100%', padding: '8px', background: 'none', border: '1px dashed #B2D8C7', borderRadius: 8, color: '#1E6B50', fontSize: 13, cursor: 'pointer', marginTop: 4 }}
                >＋ 继续新增</button>
              </div>
            )
          ) : !enabled ? (
            <div style={{ padding: '14px 0', color: '#aaa', fontSize: 13, textAlign: 'center' }}>此板块已停用，点击开关启用</div>
          ) : (
            def.fields.map(field => (
              <FieldRow key={field.key} label={field.label} internal={field.internal}>
                <FieldInput field={field} value={data[field.key]} onChange={val => set(field.key, val)} />
              </FieldRow>
            ))
          )}
        </div>
      )}
    </div>
  )
}
