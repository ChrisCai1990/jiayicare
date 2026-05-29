import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'
import { useCategories, StatusBadge } from './_ProjectPage'

const EXAM_TYPES = [
  { value: 'ultrasound', label: '超声检查' },
  { value: 'radiology',  label: '放射检查（X光/CT）' },
  { value: 'mri',        label: 'MRI磁共振' },
  { value: 'endoscopy',  label: '内镜检查' },
  { value: 'pathology',  label: '病理检查' },
  { value: 'other',      label: '其他' },
]

const EMPTY = { name: '', mnemonic: '', examType: 'other', unit: '次', costPrice: 0, retailPrice: 0, participatesInDiscount: true, categoryId: '', description: '', conclusion: '' }

export default function SpecialExamPage() {
  const toast = useToast()
  const cats = useCategories()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = (p = page) => {
    setLoading(true)
    adminAPI.specialExams({ q, page: p, limit: 20 }).then(r => {
      setList(r.data); setTotal(r.total || 0)
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { setPage(1); load(1) }, [q])
  useEffect(() => { load() }, [page])

  const openCreate = () => { setEditId(null); setForm(EMPTY); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditId(item._id)
    setForm({
      name: item.name, mnemonic: item.mnemonic || '', examType: item.examType || 'other',
      unit: item.unit || '次', costPrice: item.costPrice || 0, retailPrice: item.retailPrice || 0,
      participatesInDiscount: item.participatesInDiscount !== false,
      categoryId: item.categoryId?._id || item.categoryId || '',
      description: item.description || '', conclusion: item.conclusion || '',
    })
    setError(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('检查名称不能为空'); return }
    if (!form.examType) { setError('请选择检查类型'); return }
    setSaving(true); setError('')
    try {
      if (editId) { await adminAPI.updateSpecialExam(editId, form); toast('已更新') }
      else { await adminAPI.createSpecialExam(form); toast('已创建') }
      setShowModal(false); load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const handleNameChange = e => {
    const name = e.target.value
    setForm(f => ({ ...f, name, mnemonic: f.mnemonic || '' }))
  }
  const totalPages = Math.ceil(total / 20)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>检查医嘱</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>非检验类检查项目，如"甲状腺超声""胸部CT"</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" style={{ width: 220 }} placeholder="搜索名称/助记码" value={q} onChange={e => setQ(e.target.value)} />
          <button className="btn btn-primary" onClick={openCreate}>＋ 新增</button>
        </div>
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
          : list.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无数据</div>
          : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['名称', '助记码', '单位', '零售价', '参与优惠', '状态', '操作'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(item => (
                  <tr key={item._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#6B7280', fontSize: 12 }}>{item.mnemonic || '-'}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>{item.unit || '-'}</td>
                    <td style={{ padding: '10px 14px' }}>¥{item.retailPrice?.toFixed?.(2) || '0.00'}</td>
                    <td style={{ padding: '10px 14px', color: item.participatesInDiscount !== false ? '#1E6B50' : '#6B7280', fontSize: 12 }}>
                      {item.participatesInDiscount !== false ? '是' : '否'}
                    </td>
                    <td style={{ padding: '10px 14px' }}><StatusBadge active={item.status === 'active'} /></td>
                    <td style={{ padding: '10px 14px' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)} style={{ marginRight: 4 }}>编辑</button>
                      <button className="btn btn-secondary btn-sm" onClick={async () => { try { await adminAPI.toggleSpecialExam(item._id); load() } catch (e) { toast(e.message) } }} style={{ marginRight: 4 }}>
                        {item.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={async () => { if (!window.confirm(`确定删除「${item.name}」？`)) return; try { await adminAPI.deleteSpecialExam(item._id); toast('已删除'); load() } catch (e) { toast(e.message) } }}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderTop: '1px solid #E5E7EB', fontSize: 13 }}>
                <span style={{ color: '#6B7280' }}>共 {total} 条</span>
                <button className="btn btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>上一页</button>
                <span>{page} / {totalPages}</span>
                <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
              </div>
            )}
          </>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑检查医嘱' : '新增检查医嘱'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">检查名称 *</label>
                  <input className="form-input" value={form.name} onChange={handleNameChange} placeholder="如：甲状腺超声、胸部CT" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">检查类型 *</label>
                  <select className="form-input" value={form.examType} onChange={set('examType')}>
                    {EXAM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">助记码（拼音首字母，可留空自动生成）</label>
                  <input className="form-input" value={form.mnemonic} onChange={set('mnemonic')} placeholder="如：JZXCS" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">单位</label>
                  <input className="form-input" value={form.unit} onChange={set('unit')} placeholder="如：次" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">成本价（元）</label>
                  <input className="form-input" type="number" step="0.01" value={form.costPrice} onChange={set('costPrice')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">零售价（元）</label>
                  <input className="form-input" type="number" step="0.01" value={form.retailPrice} onChange={set('retailPrice')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">所属分类</label>
                  <select className="form-input" value={form.categoryId} onChange={set('categoryId')}>
                    <option value="">无</option>
                    {cats.map(c => <option key={c._id} value={c._id}>{'　'.repeat(c.depth)}{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', paddingTop: 28 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={form.participatesInDiscount} onChange={e => setForm(f => ({ ...f, participatesInDiscount: e.target.checked }))} />
                    参与商城折扣活动
                  </label>
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">检查描述（给医生看的详细说明）</label>
                  <textarea className="form-input" rows={3} value={form.description} onChange={set('description')} placeholder="检查目的、适应症、注意事项等..." />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">诊断结论（模板/示例）</label>
                  <textarea className="form-input" rows={3} value={form.conclusion} onChange={set('conclusion')} placeholder="常见诊断结论模板，如：未见明显异常；建议进一步检查..." />
                </div>
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
