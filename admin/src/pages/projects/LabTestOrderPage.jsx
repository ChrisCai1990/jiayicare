import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'
import { useCategories, StatusBadge } from './_ProjectPage'

const EMPTY = { name: '', mnemonic: '', costPrice: 0, retailPrice: 0, unit: '次', categoryId: '', items: [] }

export default function LabTestOrderPage() {
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
  const [allLabItems, setAllLabItems] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const loadLabItems = () => {
    adminAPI.labTestItems({ limit: 200 }).then(r => setAllLabItems(r.data)).catch(() => {})
  }

  const load = (p = page) => {
    setLoading(true)
    adminAPI.labTestOrders({ q, page: p, limit: 20 }).then(r => {
      setList(r.data); setTotal(r.total || 0)
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { loadLabItems() }, [])
  useEffect(() => { setPage(1); load(1) }, [q])
  useEffect(() => { load() }, [page])

  const openCreate = () => { setEditId(null); setForm(EMPTY); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditId(item._id)
    setForm({
      name: item.name, mnemonic: item.mnemonic || '', costPrice: item.costPrice || 0,
      retailPrice: item.retailPrice || 0, unit: item.unit || '次',
      categoryId: item.categoryId?._id || item.categoryId || '',
      items: (item.items || []).map(i => i._id || i),
    })
    setError(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('名称不能为空'); return }
    setSaving(true); setError('')
    try {
      if (editId) { await adminAPI.updateLabTestOrder(editId, form); toast('已更新') }
      else { await adminAPI.createLabTestOrder(form); toast('已创建') }
      setShowModal(false); load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const toggleItem = id => {
    setForm(f => ({
      ...f,
      items: f.items.includes(id) ? f.items.filter(i => i !== id) : [...f.items, id],
    }))
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const totalPages = Math.ceil(total / 20)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>检验医嘱</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>一组检验项目的组合，如"血脂全套"</p>
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
                  {['名称', '助记码', '包含项目数', '零售价', '状态', '操作'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(item => (
                  <tr key={item._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#6B7280', fontSize: 12 }}>{item.mnemonic || '-'}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>{item.items?.length || 0} 项</td>
                    <td style={{ padding: '10px 14px' }}>¥{item.retailPrice?.toFixed?.(2) || '0.00'}</td>
                    <td style={{ padding: '10px 14px' }}><StatusBadge active={item.status === 'active'} /></td>
                    <td style={{ padding: '10px 14px' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)} style={{ marginRight: 4 }}>编辑</button>
                      <button className="btn btn-secondary btn-sm" onClick={async () => { try { await adminAPI.toggleLabTestOrder(item._id); load() } catch (e) { toast(e.message) } }} style={{ marginRight: 4 }}>
                        {item.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={async () => { if (!window.confirm(`确定删除「${item.name}」？`)) return; try { await adminAPI.deleteLabTestOrder(item._id); toast('已删除'); load() } catch (e) { toast(e.message) } }}>删除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderTop: '1px solid #E5E7EB', fontSize: 13 }}>
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
              <h3 className="modal-title">{editId ? '编辑检验医嘱' : '新增检验医嘱'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">医嘱名称 *</label>
                  <input className="form-input" value={form.name} onChange={set('name')} placeholder="如：血脂全套" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">助记码</label>
                  <input className="form-input" value={form.mnemonic} onChange={set('mnemonic')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">单位</label>
                  <input className="form-input" value={form.unit} onChange={set('unit')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">成本价（元）</label>
                  <input className="form-input" type="number" step="0.01" value={form.costPrice} onChange={set('costPrice')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">零售价（元）</label>
                  <input className="form-input" type="number" step="0.01" value={form.retailPrice} onChange={set('retailPrice')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">所属分类</label>
                  <select className="form-input" value={form.categoryId} onChange={set('categoryId')}>
                    <option value="">无</option>
                    {cats.map(c => <option key={c._id} value={c._id}>{'　'.repeat(c.depth)}{c.name}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 16 }}>
                <label className="form-label">包含检验项目（多选）</label>
                <div style={{ border: '1px solid #E5E7EB', borderRadius: 8, maxHeight: 200, overflowY: 'auto', padding: 8 }}>
                  {allLabItems.length === 0 ? (
                    <div style={{ color: '#aaa', fontSize: 13, padding: 8 }}>暂无检验项目</div>
                  ) : allLabItems.map(i => (
                    <label key={i._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', cursor: 'pointer', borderRadius: 4, ':hover': { background: '#F3F4F6' } }}>
                      <input type="checkbox" checked={form.items.includes(i._id)} onChange={() => toggleItem(i._id)} />
                      <span style={{ fontSize: 13 }}>{i.name}</span>
                      {i.unit && <span style={{ fontSize: 11, color: '#9CA3AF' }}>/{i.unit}</span>}
                    </label>
                  ))}
                </div>
                {form.items.length > 0 && (
                  <div style={{ fontSize: 12, color: '#1E6B50', marginTop: 4 }}>已选 {form.items.length} 项</div>
                )}
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
