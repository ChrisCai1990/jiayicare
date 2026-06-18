import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'
import { StatusBadge } from './_ProjectPage'

const EMPTY = { name: '', categoryId: '', testResult: '', indicatorAnalysis: '', managementAdvice: '', testTiming: '', institution: '' }

export default function FunctionalMedicinePage() {
  const toast = useToast()
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
  const [l2Cats, setL2Cats] = useState([])

  useEffect(() => {
    adminAPI.categories().then(r => {
      const flat = []
      const walk = (nodes, depth = 0) => nodes.forEach(n => { flat.push({ ...n, depth }); walk(n.children || [], depth + 1) })
      walk(r.data || [])
      setL2Cats(flat.filter(n => n.depth === 1))
    }).catch(() => {})
  }, [])

  const load = (p = page) => {
    setLoading(true)
    adminAPI.functionalMedicineTests({ q, page: p, limit: 20 }).then(r => {
      setList(r.data); setTotal(r.total || 0)
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { setPage(1); load(1) }, [q])
  useEffect(() => { load() }, [page])

  const openCreate = () => { setEditId(null); setForm(EMPTY); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditId(item._id)
    setForm({
      name: item.name,
      categoryId: item.categoryId ? String(item.categoryId._id || item.categoryId) : '',
      testResult: item.testResult || '',
      indicatorAnalysis: item.indicatorAnalysis || '',
      managementAdvice: item.managementAdvice || '',
      testTiming: item.testTiming || '',
      institution: item.institution || '',
    })
    setError(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('检测名称不能为空'); return }
    setSaving(true); setError('')
    try {
      if (editId) { await adminAPI.updateFunctionalMedicineTest(editId, form); toast('已更新') }
      else { await adminAPI.createFunctionalMedicineTest(form); toast('已创建') }
      setShowModal(false); load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const totalPages = Math.ceil(total / 20)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>功能医学检测</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>功能性检测项目，如重金属检测、肠道菌群分析等</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" style={{ width: 220 }} placeholder="搜索检测名称" value={q} onChange={e => setQ(e.target.value)} />
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
                  {['检测名称', '所属筛查分类', '检测机构', '检测时间', '状态', '操作'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(item => (
                  <tr key={item._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>{item.categoryId?.name || '-'}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>{item.institution || '-'}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>{item.testTiming || '-'}</td>
                    <td style={{ padding: '10px 14px' }}><StatusBadge active={item.status === 'active'} /></td>
                    <td style={{ padding: '10px 14px' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)} style={{ marginRight: 4 }}>编辑</button>
                      <button className="btn btn-secondary btn-sm" onClick={async () => {
                        try { await adminAPI.toggleFunctionalMedicineTest(item._id); load() } catch (e) { toast(e.message) }
                      }} style={{ marginRight: 4 }}>
                        {item.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={async () => {
                        if (!window.confirm(`确定删除「${item.name}」？`)) return
                        try { await adminAPI.deleteFunctionalMedicineTest(item._id); toast('已删除'); load() } catch (e) { toast(e.message) }
                      }}>删除</button>
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
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑功能医学检测' : '新增功能医学检测'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">检测名称 *</label>
                  <input className="form-input" value={form.name} onChange={set('name')} placeholder="如：重金属检测、肠道菌群分析" />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">所属筛查分类（关联后在医护端录入时自动显示）</label>
                  <select className="form-input" value={form.categoryId} onChange={set('categoryId')}>
                    <option value="">-- 不绑定分类 --</option>
                    {l2Cats.map(c => <option key={c._id} value={String(c._id)}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">检测时间</label>
                  <input className="form-input" value={form.testTiming} onChange={set('testTiming')} placeholder="如：空腹、餐后2小时" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">检测机构</label>
                  <input className="form-input" value={form.institution} onChange={set('institution')} placeholder="如：第三方检测机构名称" />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">检测结果（描述/解读模板）</label>
                  <textarea className="form-input" rows={3} value={form.testResult} onChange={set('testResult')} placeholder="检测结果说明或解读模板..." />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">指标分析</label>
                  <textarea className="form-input" rows={3} value={form.indicatorAnalysis} onChange={set('indicatorAnalysis')} placeholder="各指标正常范围及意义说明..." />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">管理建议</label>
                  <textarea className="form-input" rows={3} value={form.managementAdvice} onChange={set('managementAdvice')} placeholder="基于检测结果的健康管理建议..." />
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
