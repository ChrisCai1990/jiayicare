import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const ROLE_LABEL = {
  healthManager: '健管师', familyDoctor: '健康顾问', nurse: '护士',
  nutritionist: '营养师', psychologist: '心理师', tcmDoctor: '中医师',
  specialist: '专科医生', healthPlanner: '健康规划师',
}

const ROLE_OPTIONS = [
  ['', '不限定'], ['healthManager', '健管专员'], ['healthPlanner', '就医专员/健康规划师'],
  ['familyDoctor', '健康顾问'], ['nutritionist', '营养师'], ['nurse', '护士'],
]
const CATEGORY_OPTIONS = [
  ['general', '通用随访'], ['medical_assist', '就医协助'], ['recheck', '定期复查'],
  ['checkup', '体检安排'], ['vaccine', '疫苗接种'], ['monitoring', '健康监测'],
]

const emptyCycle = () => ({ cycleType: 'duration', cycleDuration: 30, cycleUnit: 'day', cycleDate: '', notes: '' })
const EMPTY = { name: '', formId: '', cycles: [emptyCycle()], defaultEmployeeId: '', default_content: {}, category: 'general', executorRole: '', supervisorRole: '', remindDaysBefore: 3, executorDueOffsetDays: -1, supervisorDueOffsetDays: 1, fixedToServiceDate: false, requiresCoordination: false, completionStandard: '' }

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
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)

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
      default_content: p.default_content || {},
      category: p.category || 'general', executorRole: p.executorRole || '', supervisorRole: p.supervisorRole || '',
      remindDaysBefore: p.remindDaysBefore ?? 3, executorDueOffsetDays: p.executorDueOffsetDays ?? -1,
      supervisorDueOffsetDays: p.supervisorDueOffsetDays ?? 1, requiresCoordination: !!p.requiresCoordination,
      fixedToServiceDate: !!p.fixedToServiceDate,
      completionStandard: p.completionStandard || '',
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
        default_content: form.default_content || {},
        category: form.category, executorRole: form.executorRole, supervisorRole: form.supervisorRole,
        remindDaysBefore: Number(form.remindDaysBefore), executorDueOffsetDays: Number(form.executorDueOffsetDays),
        supervisorDueOffsetDays: Number(form.supervisorDueOffsetDays), requiresCoordination: form.requiresCoordination,
        fixedToServiceDate: form.fixedToServiceDate,
        completionStandard: form.completionStandard,
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

  // 找到当前选中的表单对象（含 fields）
  const selectedForm = forms.find(f => f._id === form.formId)

  const setDefaultContent = (fieldLabel, val) =>
    setForm(f => ({ ...f, default_content: { ...f.default_content, [fieldLabel]: val } }))

  const handleToggle = async item => {
    try { await adminAPI.toggleFollowupPlan(item._id); loadAll() } catch (e) { toast(e.message) }
  }

  const handleDelete = async item => {
    if (!window.confirm(`确定删除「${item.name}」？`)) return
    try { await adminAPI.deleteFollowupPlan(item._id); toast('已删除'); loadAll() } catch (e) { toast(e.message) }
  }

  const filteredPlans = list.filter(item => !search || item.name?.includes(search))
  const totalPlanPages = Math.ceil(filteredPlans.length / pageSize)
  const pagedPlans = filteredPlans.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>随访方案</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>预定义随访计划模板，供医护端创建随访任务时选择</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>＋ 新增方案</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input style={{ flex: 1, maxWidth: 280, padding: '6px 12px', borderRadius: 8, border: '1.5px solid #E5E7EB', fontSize: 13 }}
          placeholder="搜索方案名称..." value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }} />
        <select style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #E5E7EB', fontSize: 13 }}
          value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}>
          <option value={10}>10条/页</option>
          <option value={20}>20条/页</option>
          <option value={30}>30条/页</option>
        </select>
        <span style={{ fontSize: 12, color: '#6B7280' }}>共 {filteredPlans.length} 条</span>
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
          : pagedPlans.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无随访方案</div>
          : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['方案名称', '分类', '协作角色', '提前提醒', '状态', '操作'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedPlans.map(item => (
                <tr key={item._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                  <td style={{ padding: '10px 14px', color: '#6B7280' }}>{CATEGORY_OPTIONS.find(x => x[0] === item.category)?.[1] || '通用随访'}</td>
                  <td style={{ padding: '10px 14px', color: '#6B7280', fontSize: 12 }}>{ROLE_LABEL[item.executorRole] || item.executorRole || '-'}{item.supervisorRole ? ` → ${ROLE_LABEL[item.supervisorRole] || item.supervisorRole}督办` : ''}</td>
                  <td style={{ padding: '10px 14px', color: '#6B7280' }}>提前 {item.remindDaysBefore ?? 3} 天</td>
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

      {totalPlanPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
          <span style={{ lineHeight: '32px', fontSize: 13, color: '#6B7280' }}>第 {page} / {totalPlanPages} 页</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPlanPages} onClick={() => setPage(p => p + 1)}>下一页</button>
        </div>
      )}

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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label className="form-label">方案分类</label><select className="form-input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>{CATEGORY_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div className="form-group"><label className="form-label">提前推送（天）</label><input className="form-input" type="number" min="0" max="90" value={form.remindDaysBefore} onChange={e => setForm(f => ({ ...f, remindDaysBefore: e.target.value }))} /></div>
                <div className="form-group"><label className="form-label">执行角色</label><select className="form-input" value={form.executorRole} onChange={e => setForm(f => ({ ...f, executorRole: e.target.value }))}>{ROLE_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div className="form-group"><label className="form-label">督办角色</label><select className="form-input" value={form.supervisorRole} onChange={e => setForm(f => ({ ...f, supervisorRole: e.target.value }))}>{ROLE_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div className="form-group"><label className="form-label">执行截止（相对服务日）</label><input className="form-input" type="number" min="-90" max="90" disabled={form.fixedToServiceDate} value={form.fixedToServiceDate ? 0 : form.executorDueOffsetDays} onChange={e => setForm(f => ({ ...f, executorDueOffsetDays: e.target.value }))} /><div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>{form.fixedToServiceDate ? '已锁定为服务当天' : '例如 -1 表示服务日前1天'}</div></div>
                <div className="form-group"><label className="form-label">督办截止（相对服务日）</label><input className="form-input" type="number" min="-90" max="90" value={form.supervisorDueOffsetDays} onChange={e => setForm(f => ({ ...f, supervisorDueOffsetDays: e.target.value }))} /><div style={{ fontSize: 11, color: '#6B7280', marginTop: 4 }}>例如 1 表示服务后1天</div></div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13 }}><input type="checkbox" checked={form.fixedToServiceDate} onChange={e => setForm(f => ({ ...f, fixedToServiceDate: e.target.checked, executorDueOffsetDays: e.target.checked ? 0 : f.executorDueOffsetDays }))} />执行任务固定在主服务日期当天（陪诊、当日体检等）</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 13 }}><input type="checkbox" checked={form.requiresCoordination} onChange={e => setForm(f => ({ ...f, requiresCoordination: e.target.checked }))} />需要执行人和督办人双人协作</label>
              <div className="form-group"><label className="form-label">完成标准</label><textarea className="form-input" rows={2} value={form.completionStandard} onChange={e => setForm(f => ({ ...f, completionStandard: e.target.value }))} placeholder="如：预约信息确认、服务完成、结果资料归档" /></div>

              {/* 关联随访表单 */}
              <div className="form-group">
                <label className="form-label">关联随访表单</label>
                <select className="form-input" value={form.formId}
                  onChange={e => setForm(f => ({ ...f, formId: e.target.value, default_content: {} }))}>
                  <option value="">不关联</option>
                  {forms.map(f => <option key={f._id} value={f._id}>{f.name}</option>)}
                </select>
              </div>

              {/* 预设内容（基于关联表单的字段动态生成） */}
              {selectedForm?.fields?.length > 0 && (
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ marginBottom: 6 }}>
                    预设内容
                    <span style={{ fontSize: 11, color: '#6B7280', fontWeight: 400, marginLeft: 6 }}>
                      医护创建随访计划时自动填充这些默认值
                    </span>
                  </label>
                  <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selectedForm.fields.map((field, fi) => (
                      <div key={fi} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 12, color: '#374151', fontWeight: 500 }}>
                          {field.label}
                          {field.required && <span style={{ color: '#DC2626' }}> *</span>}
                          <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 4 }}>（{field.type}）</span>
                        </label>
                        {field.type === 'textarea' ? (
                          <textarea
                            className="form-input"
                            rows={2}
                            style={{ fontSize: 13 }}
                            placeholder={`${field.label}的预设内容...`}
                            value={form.default_content[field.label] || ''}
                            onChange={e => setDefaultContent(field.label, e.target.value)}
                          />
                        ) : field.type === 'radio' && field.options?.length > 0 ? (
                          <select
                            className="form-input"
                            style={{ fontSize: 13 }}
                            value={form.default_content[field.label] || ''}
                            onChange={e => setDefaultContent(field.label, e.target.value)}
                          >
                            <option value="">-- 不预设 --</option>
                            {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                        ) : field.type === 'checkbox' && field.options?.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {field.options.map(opt => {
                              const checked = (form.default_content[field.label] || []).includes(opt)
                              return (
                                <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, cursor: 'pointer' }}>
                                  <input type="checkbox" checked={checked}
                                    onChange={e => {
                                      const cur = form.default_content[field.label] || []
                                      setDefaultContent(field.label, e.target.checked ? [...cur, opt] : cur.filter(v => v !== opt))
                                    }} />
                                  {opt}
                                </label>
                              )
                            })}
                          </div>
                        ) : field.type === 'date' ? (
                          <input
                            className="form-input"
                            type="date"
                            style={{ fontSize: 13 }}
                            value={form.default_content[field.label] || ''}
                            onChange={e => setDefaultContent(field.label, e.target.value)}
                          />
                        ) : (
                          <input
                            className="form-input"
                            type={field.type === 'number' ? 'number' : 'text'}
                            style={{ fontSize: 13 }}
                            placeholder={`${field.label}的预设值...`}
                            value={form.default_content[field.label] || ''}
                            onChange={e => setDefaultContent(field.label, e.target.value)}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

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

              <div style={{ marginTop: 16, padding: '9px 11px', borderRadius: 8, background: '#EEF7F2', color: '#426457', fontSize: 12 }}>
                此处只配置岗位角色；具体执行人和督办人在客户专业子方案中从员工库选择。
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
