import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const CYCLE_UNIT_LABEL = { day: '天', week: '周', month: '月' }
const EMPTY = { name: '', formId: '', cycleDuration: 30, cycleUnit: 'day', defaultRole: '', notes: '' }

export default function FollowUpPlanPage() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [forms, setForms] = useState([])
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
    ]).then(([planRes, formRes]) => {
      setList(planRes.data)
      setForms(formRes.data.filter(f => f.status === 'active'))
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { loadAll() }, [])

  const openCreate = () => { setEditId(null); setForm(EMPTY); setError(''); setShowModal(true) }
  const openEdit = p => {
    setEditId(p._id)
    setForm({
      name: p.name, formId: p.formId?._id || p.formId || '',
      cycleDuration: p.cycleDuration || 30, cycleUnit: p.cycleUnit || 'day',
      defaultRole: p.defaultRole || '', notes: p.notes || '',
    })
    setError(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('方案名称不能为空'); return }
    setSaving(true); setError('')
    try {
      if (editId) { await adminAPI.updateFollowupPlan(editId, form); toast('已更新') }
      else { await adminAPI.createFollowupPlan(form); toast('已创建') }
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

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

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
                {['方案名称', '关联表单', '随访周期', '默认角色', '状态', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map(item => (
                <tr key={item._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                  <td style={{ padding: '10px 14px', color: '#6B7280' }}>{item.formId?.name || '-'}</td>
                  <td style={{ padding: '10px 14px', color: '#6B7280' }}>
                    {item.cycleDuration} {CYCLE_UNIT_LABEL[item.cycleUnit] || item.cycleUnit}
                  </td>
                  <td style={{ padding: '10px 14px', color: '#6B7280' }}>{item.defaultRole || '-'}</td>
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
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑随访方案' : '新增随访方案'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">方案名称 *</label>
                <input className="form-input" value={form.name} onChange={set('name')} placeholder='如：高血压月度随访' autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">关联随访表单</label>
                <select className="form-input" value={form.formId} onChange={set('formId')}>
                  <option value="">不关联</option>
                  {forms.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">默认随访周期</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-input" type="number" min="1" style={{ width: 100 }} value={form.cycleDuration} onChange={e => setForm(f => ({ ...f, cycleDuration: Number(e.target.value) }))} />
                  <select className="form-input" value={form.cycleUnit} onChange={set('cycleUnit')}>
                    <option value="day">天</option>
                    <option value="week">周</option>
                    <option value="month">月</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">默认随访人员角色</label>
                <input className="form-input" value={form.defaultRole} onChange={set('defaultRole')} placeholder='如：健管专员' />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">备注</label>
                <textarea className="form-input" rows={3} value={form.notes} onChange={set('notes')} placeholder='方案用途、注意事项等，如：复查肺CT，安排胸外科专家会诊' style={{ resize: 'vertical' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : (editId ? '保存' : '创建')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
