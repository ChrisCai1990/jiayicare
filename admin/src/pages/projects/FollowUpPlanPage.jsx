import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const CYCLE_UNIT_LABEL = { day: '天', week: '周', month: '月' }

const ROLE_LABEL = {
  healthManager: '健管师', familyDoctor: '家庭医生', nurse: '护士',
  nutritionist: '营养师', psychologist: '心理师', tcmDoctor: '中医师',
  specialist: '专科医生', healthPlanner: '健康规划师',
}

const emptyCycle = () => ({ cycleType: 'duration', cycleDuration: 30, cycleUnit: 'day', cycleDate: '', notes: '' })
const EMPTY = { name: '', formId: '', cycles: [emptyCycle()], defaultEmployeeId: '' }

// 按钮样式
const btnStyle = (color, disabled) => ({
  width: 26, height: 26, borderRadius: 6, border: `1px solid ${disabled ? '#E0D9CE' : color}`,
  background: '#fff', color: disabled ? '#ccc' : color,
  cursor: disabled ? 'default' : 'pointer',
  fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0, padding: 0,
})

export default function FollowUpPlanPage() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [forms, setForms] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadAll = () => {
    setLoading(true)
    Promise.all([
      adminAPI.followupPlans(),
      adminAPI.followupForms(),
      adminAPI.employees({ limit: 200, staffStatus: 'active' }),
    ]).then(([planRes, formRes, empRes]) => {
      setList(planRes.data)
      setForms(formRes.data.filter(f => f.status === 'active'))
      setEmployees(empRes.data || [])
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { loadAll() }, [])

  const openCreate = () => { setEditId(null); setForm(EMPTY); setError(''); setShowModal(true) }

  const openEdit = p => {
    setEditId(p._id)
    const cycles = p.cycles?.length
      ? p.cycles.map(c => ({
          cycleType: c.cycleType || 'duration',
          cycleDuration: c.cycleDuration || 30,
          cycleUnit: c.cycleUnit || 'day',
          cycleDate: c.cycleDate ? c.cycleDate.slice(0, 10) : '',
          notes: c.notes || '',
        }))
      : [emptyCycle()]
    setForm({
      name: p.name,
      formId: p.formId?._id || p.formId || '',
      cycles,
      defaultEmployeeId: p.defaultEmployeeId?._id || p.defaultEmployeeId || '',
    })
    setError(''); setShowModal(true)
  }

  // 周期行操作
  const addCycle = () => setForm(f => ({ ...f, cycles: [...f.cycles, emptyCycle()] }))
  const removeCycle = idx => setForm(f => ({ ...f, cycles: f.cycles.filter((_, i) => i !== idx) }))
  const updateCycle = (idx, key, val) => setForm(f => ({
    ...f,
    cycles: f.cycles.map((c, i) => i === idx ? { ...c, [key]: val } : c),
  }))

  const handleSave = async () => {
    if (!form.name.trim()) { setError('方案名称不能为空'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        name: form.name,
        formId: form.formId || null,
        defaultEmployeeId: form.defaultEmployeeId || null,
        cycles: form.cycles.map(c => ({
          cycleType: c.cycleType,
          cycleDuration: c.cycleType === 'duration' ? Number(c.cycleDuration) : null,
          cycleUnit: c.cycleType === 'duration' ? c.cycleUnit : null,
          cycleDate: c.cycleType === 'date' ? (c.cycleDate || null) : null,
          notes: c.notes || '',
        })),
      }
      if (editId) { await adminAPI.updateFollowupPlan(editId, payload); toast('已更新') }
      else { await adminAPI.createFollowupPlan(payload); toast('已创建') }
      setShowModal(false); loadAll()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleToggle = async item => {
    try { await adminAPI.toggleFollowupPlan(item._id); loadAll() } catch (e) { toast(e.message) }
  }

  const handleDelete = async item => {
    if (!window.confirm(`确定删除「${item.name}」？`)) return
    try { await adminAPI.deleteFollowupPlan(item._id); toast('已删除'); loadAll() } catch (e) { toast(e.message) }
  }

  const cycleDisplay = item => {
    const cycles = item.cycles
    if (!cycles?.length) return '-'
    if (cycles.length === 1) {
      const c = cycles[0]
      if (c.cycleType === 'date' && c.cycleDate) return new Date(c.cycleDate).toLocaleDateString('zh-CN')
      return `${c.cycleDuration} ${CYCLE_UNIT_LABEL[c.cycleUnit] || c.cycleUnit}`
    }
    return `共 ${cycles.length} 个周期`
  }

  const employeeDisplay = item => {
    if (item.defaultEmployeeId?.name) {
      const roleLabel = ROLE_LABEL[item.defaultEmployeeId.role] || ''
      return `${item.defaultEmployeeId.name}${roleLabel ? `（${roleLabel}）` : ''}`
    }
    return '-'
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>随访方案</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>预定义随访计划模板，供医护端创建随访任务时选择</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>＋ 新增方案</button>
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
          : list.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无随访方案</div>
          : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['方案名称', '关联表单', '随访周期', '默认人员', '状态', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(item => (
                <tr key={item._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                  <td style={{ padding: '10px 14px', color: '#6B7280' }}>{item.formId?.name || '-'}</td>
                  <td style={{ padding: '10px 14px', color: '#6B7280' }}>{cycleDisplay(item)}</td>
                  <td style={{ padding: '10px 14px', color: '#6B7280' }}>{employeeDisplay(item)}</td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: item.status === 'active' ? '#E8F5EF' : '#FEF2F2', color: item.status === 'active' ? '#1E6B50' : '#DC2626' }}>
                      {item.status === 'active' ? '启用' : '停用'}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)} style={{ marginRight: 4 }}>编辑</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleToggle(item)} style={{ marginRight: 4 }}>{item.status === 'active' ? '停用' : '启用'}</button>
                    <button className="btn btn-danger btn-sm" onClick={() => handleDelete(item)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑随访方案' : '新增随访方案'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>

              {/* 方案名称 */}
              <div className="form-group">
                <label className="form-label">方案名称 *</label>
                <input className="form-input" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder='如：高血压月度随访' autoFocus />
              </div>

              {/* 关联随访表单 */}
              <div className="form-group">
                <label className="form-label">关联随访表单</label>
                <select className="form-input" value={form.formId}
                  onChange={e => setForm(f => ({ ...f, formId: e.target.value }))}>
                  <option value="">不关联</option>
                  {forms.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                </select>
              </div>

              {/* 随访周期（多行） */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">随访周期</label>

                {form.cycles.map((cycle, idx) => (
                  <div key={idx} style={{
                    padding: '10px 12px', marginBottom: 8,
                    border: '1px solid #E5E7EB', borderRadius: 8,
                    background: '#FAFAFA',
                  }}>
                    {/* 类型选择 */}
                    <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                      {[['duration', '按时间间隔'], ['date', '按固定日期']].map(([val, label]) => (
                        <label key={val} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                          <input type="radio" name={`cycleType_${idx}`} value={val}
                            checked={cycle.cycleType === val}
                            onChange={() => updateCycle(idx, 'cycleType', val)} />
                          {label}
                        </label>
                      ))}
                      {/* 删除按钮 */}
                      <div style={{ marginLeft: 'auto', visibility: form.cycles.length === 1 ? 'hidden' : 'visible' }}>
                        <button type="button" onClick={() => removeCycle(idx)}
                          style={btnStyle('#DC3545', false)}>−</button>
                      </div>
                    </div>

                    {/* 时间/日期输入 */}
                    {cycle.cycleType === 'duration' ? (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <input className="form-input" type="number" min="1" style={{ width: 90 }}
                          value={cycle.cycleDuration}
                          onChange={e => updateCycle(idx, 'cycleDuration', e.target.value)} />
                        <select className="form-input" value={cycle.cycleUnit}
                          onChange={e => updateCycle(idx, 'cycleUnit', e.target.value)}>
                          <option value="day">天</option>
                          <option value="week">周</option>
                          <option value="month">月</option>
                        </select>
                      </div>
                    ) : (
                      <div style={{ marginBottom: 8 }}>
                        <input className="form-input" type="date" value={cycle.cycleDate}
                          onChange={e => updateCycle(idx, 'cycleDate', e.target.value)} />
                      </div>
                    )}

                    {/* 备注 */}
                    <input className="form-input" placeholder="备注（可填写本次随访内容要点）"
                      value={cycle.notes}
                      onChange={e => updateCycle(idx, 'notes', e.target.value)}
                      style={{ fontSize: 13 }} />
                  </div>
                ))}

                {/* 新增周期按钮 */}
                <button type="button" onClick={addCycle}
                  style={{
                    width: '100%', padding: '7px 0', border: '1px dashed #1E6B50',
                    borderRadius: 8, background: 'none', color: '#1E6B50',
                    cursor: 'pointer', fontSize: 13, marginTop: 2,
                  }}>
                  ＋ 新增随访周期
                </button>
              </div>

              {/* 默认随访人员 */}
              <div className="form-group" style={{ marginTop: 16 }}>
                <label className="form-label">默认随访人员</label>
                <select className="form-input" value={form.defaultEmployeeId}
                  onChange={e => setForm(f => ({ ...f, defaultEmployeeId: e.target.value }))}>
                  <option value="">不指定</option>
                  {employees.map(e => (
                    <option key={e._id} value={e._id}>
                      {e.name}{e.role && ROLE_LABEL[e.role] ? `（${ROLE_LABEL[e.role]}）` : ''}
                    </option>
                  ))}
                </select>
              </div>

            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : (editId ? '保存' : '创建')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
