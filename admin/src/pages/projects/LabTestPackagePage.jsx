import React, { useEffect, useState } from 'react'
import { getPinyinInitials } from 'pinyin-pro'
import { adminAPI } from '../../api'
import { useToast } from '../../App'
import { useCategories, StatusBadge } from './_ProjectPage'

// orders = 检验医嘱 (LabTestOrder), specialExams = 检查医嘱 (SpecialExam)
const EMPTY = { name: '', mnemonic: '', remark: '', categoryId: '', orders: [], specialExams: [] }

function genMnemonic(name) {
  if (!name) return ''
  try { return getPinyinInitials(name, { toneType: 'none' }).toUpperCase().replace(/[^A-Z]/g, '') }
  catch { return '' }
}

export default function LabTestPackagePage() {
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
  const [mnemonicEdited, setMnemonicEdited] = useState(false)
  const [allOrders, setAllOrders] = useState([])
  const [allSpecialExams, setAllSpecialExams] = useState([])
  const [addOrderId, setAddOrderId] = useState('')
  const [addExamId, setAddExamId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    adminAPI.labTestOrders({ limit: 500, status: 'active' }).then(r => setAllOrders(r.data || [])).catch(() => {})
    adminAPI.specialExams({ limit: 500, status: 'active' }).then(r => setAllSpecialExams(r.data || [])).catch(() => {})
  }, [])

  const load = (p = page) => {
    setLoading(true)
    adminAPI.labTestPackages({ q, page: p, limit: 20 }).then(r => {
      setList(r.data); setTotal(r.total || 0)
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { setPage(1); load(1) }, [q])
  useEffect(() => { load() }, [page])

  const openCreate = () => { setEditId(null); setForm(EMPTY); setMnemonicEdited(false); setAddOrderId(''); setAddExamId(''); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditId(item._id)
    setForm({
      name: item.name, mnemonic: item.mnemonic || '', remark: item.remark || '',
      categoryId: item.categoryId?._id || item.categoryId || '',
      orders: (item.orders || []).map(i => i._id || i),
      specialExams: (item.specialExams || []).map(i => i._id || i),
    })
    setMnemonicEdited(true); setAddOrderId(''); setAddExamId(''); setError(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('套餐名称不能为空'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form }
      if (!payload.categoryId) payload.categoryId = null
      if (editId) { await adminAPI.updateLabTestPackage(editId, payload); toast('已更新') }
      else { await adminAPI.createLabTestPackage(payload); toast('已创建') }
      setShowModal(false); load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const addOrder = () => {
    if (!addOrderId || form.orders.includes(addOrderId)) return
    setForm(f => ({ ...f, orders: [...f.orders, addOrderId] }))
    setAddOrderId('')
  }
  const removeOrder = id => setForm(f => ({ ...f, orders: f.orders.filter(i => i !== id) }))

  const addExam = () => {
    if (!addExamId || form.specialExams.includes(addExamId)) return
    setForm(f => ({ ...f, specialExams: [...f.specialExams, addExamId] }))
    setAddExamId('')
  }
  const removeExam = id => setForm(f => ({ ...f, specialExams: f.specialExams.filter(i => i !== id) }))

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleNameChange = e => {
    const name = e.target.value
    setForm(f => ({ ...f, name, mnemonic: mnemonicEdited ? f.mnemonic : genMnemonic(name) }))
  }
  const handleMnemonicChange = e => { setMnemonicEdited(true); setForm(f => ({ ...f, mnemonic: e.target.value })) }

  const handleKeyDown = e => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
      e.preventDefault(); handleSave()
    }
  }

  const totalPages = Math.ceil(total / 20)

  const selectedOrders = form.orders.map(id => allOrders.find(i => i._id === id)).filter(Boolean)
  const selectedExams = form.specialExams.map(id => allSpecialExams.find(i => i._id === id)).filter(Boolean)
  const unselectedOrders = allOrders.filter(i => !form.orders.includes(i._id))
  const unselectedExams = allSpecialExams.filter(i => !form.specialExams.includes(i._id))

  const itemCount = item => (item.orders?.length || 0) + (item.specialExams?.length || 0)

  const ItemTable = ({ rows, onRemove }) => (
    rows.length === 0 ? null : (
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {['项目名称', '助记码', '成本价', '零售价', '备注', '操作'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB', fontSize: 12 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(i => (
            <tr key={i._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
              <td style={{ padding: '6px 10px', fontWeight: 500 }}>{i.name}</td>
              <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: '#6B7280' }}>{i.mnemonic || '-'}</td>
              <td style={{ padding: '6px 10px', color: '#6B7280' }}>¥{i.costPrice?.toFixed?.(2) || '0.00'}</td>
              <td style={{ padding: '6px 10px' }}>¥{i.retailPrice?.toFixed?.(2) || '0.00'}</td>
              <td style={{ padding: '6px 10px', color: '#6B7280', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.remark || '-'}</td>
              <td style={{ padding: '6px 10px' }}>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemove(i._id)}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  )

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>专项检查套餐</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>一组检验医嘱和检查医嘱的集合，如"高血压筛查套餐"</p>
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
                  {['名称', '助记码', '包含项目数', '状态', '操作'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(item => (
                  <tr key={item._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#6B7280', fontSize: 12 }}>{item.mnemonic || '-'}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>
                      {item.orders?.length > 0 && <span style={{ marginRight: 8 }}>检验 {item.orders.length}</span>}
                      {item.specialExams?.length > 0 && <span>检查 {item.specialExams.length}</span>}
                      {itemCount(item) === 0 && '-'}
                    </td>
                    <td style={{ padding: '10px 14px' }}><StatusBadge active={item.status === 'active'} /></td>
                    <td style={{ padding: '10px 14px' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)} style={{ marginRight: 4 }}>编辑</button>
                      <button className="btn btn-secondary btn-sm" onClick={async () => { try { await adminAPI.toggleLabTestPackage(item._id); load() } catch (e) { toast(e.message) } }} style={{ marginRight: 4 }}>
                        {item.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={async () => { if (!window.confirm(`确定删除「${item.name}」？`)) return; try { await adminAPI.deleteLabTestPackage(item._id); toast('已删除'); load() } catch (e) { toast(e.message) } }}>删除</button>
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
          <div className="modal" style={{ maxWidth: 680 }} onKeyDown={handleKeyDown}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑专项检查套餐' : '新增专项检查套餐'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">套餐名称 *</label>
                  <input className="form-input" value={form.name} onChange={handleNameChange} placeholder="如：高血压筛查套餐" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">助记码（拼音首字母）</label>
                  <input className="form-input" value={form.mnemonic} onChange={handleMnemonicChange} placeholder="输入名称后自动生成" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">所属分类</label>
                  <select className="form-input" value={form.categoryId} onChange={set('categoryId')}>
                    <option value="">无</option>
                    {cats.map(c => <option key={c._id} value={c._id}>{'　'.repeat(c.depth)}{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">备注</label>
                  <input className="form-input" value={form.remark} onChange={set('remark')} placeholder="选填" />
                </div>
              </div>

              {/* 关联检验医嘱 */}
              <div style={{ marginTop: 20 }}>
                <label className="form-label">关联检验医嘱</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <select className="form-input" style={{ flex: 1 }} value={addOrderId} onChange={e => setAddOrderId(e.target.value)}>
                    <option value="">— 选择检验医嘱 —</option>
                    {unselectedOrders.map(i => (
                      <option key={i._id} value={i._id}>{i.name}{i.mnemonic ? ` (${i.mnemonic})` : ''}</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-secondary" onClick={addOrder} disabled={!addOrderId}>添加</button>
                </div>
                {selectedOrders.length === 0
                  ? <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>暂未关联检验医嘱</div>
                  : <ItemTable rows={selectedOrders} onRemove={removeOrder} />
                }
              </div>

              {/* 关联检查医嘱 */}
              <div style={{ marginTop: 20 }}>
                <label className="form-label">关联检查医嘱</label>
                <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                  <select className="form-input" style={{ flex: 1 }} value={addExamId} onChange={e => setAddExamId(e.target.value)}>
                    <option value="">— 选择检查医嘱 —</option>
                    {unselectedExams.map(i => (
                      <option key={i._id} value={i._id}>{i.name}{i.mnemonic ? ` (${i.mnemonic})` : ''}</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-secondary" onClick={addExam} disabled={!addExamId}>添加</button>
                </div>
                {selectedExams.length === 0
                  ? <div style={{ color: '#aaa', fontSize: 13, padding: '8px 0' }}>暂未关联检查医嘱</div>
                  : <ItemTable rows={selectedExams} onRemove={removeExam} />
                }
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
