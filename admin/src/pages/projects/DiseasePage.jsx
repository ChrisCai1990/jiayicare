import React, { useEffect, useState, useRef } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const EMPTY = { name: '', icdCode: '', category: '', remark: '' }

export default function DiseasePage() {
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
  const importRef = useRef()

  const load = (p = page) => {
    setLoading(true)
    adminAPI.diseases({ q, page: p, limit: 20 }).then(r => {
      setList(r.data); setTotal(r.total)
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { setPage(1); load(1) }, [q])
  useEffect(() => { load() }, [page])

  const openCreate = () => { setEditId(null); setForm(EMPTY); setError(''); setShowModal(true) }
  const openEdit = d => { setEditId(d._id); setForm({ name: d.name, icdCode: d.icdCode || '', category: d.category || '', remark: d.remark || '' }); setError(''); setShowModal(true) }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('疾病名称不能为空'); return }
    setSaving(true); setError('')
    try {
      if (editId) { await adminAPI.updateDisease(editId, form); toast('已更新') }
      else { await adminAPI.createDisease(form); toast('已添加') }
      setShowModal(false); load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const handleDelete = async d => {
    if (!window.confirm(`确定删除「${d.name}」？`)) return
    try { await adminAPI.deleteDisease(d._id); toast('已删除'); load() } catch (e) { toast(e.message) }
  }

  const handleImport = async e => {
    const file = e.target.files[0]
    if (!file) return
    const text = await file.text()
    // 解析 CSV: 第一行为表头 name,icdCode,category,remark
    const lines = text.split('\n').filter(l => l.trim())
    const headers = lines[0].split(',').map(h => h.trim())
    const items = lines.slice(1).map(l => {
      const parts = l.split(',')
      const obj = {}
      headers.forEach((h, i) => { obj[h] = (parts[i] || '').trim() })
      return obj
    }).filter(i => i.name)
    if (!items.length) { toast('未解析到有效数据'); return }
    try {
      const r = await adminAPI.importDiseases(items)
      toast(r.message || '导入完成'); load()
    } catch (e) { toast(e.message) }
    e.target.value = ''
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const totalPages = Math.ceil(total / 20)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>疾病名称库</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>存储疾病诊断标准名称，支持 ICD 编码</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" style={{ width: 220 }} placeholder="搜索名称或 ICD 编码" value={q} onChange={e => setQ(e.target.value)} />
          <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
            批量导入 CSV
            <input type="file" accept=".csv,.txt" style={{ display: 'none' }} ref={importRef} onChange={handleImport} />
          </label>
          <button className="btn btn-primary" onClick={openCreate}>＋ 手动新增</button>
        </div>
      </div>

      <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 8 }}>
        CSV 格式：首行为表头 <code>name,icdCode,category,remark</code>
      </div>

      <div className="card">
        {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>加载中...</div>
          : list.length === 0 ? <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无数据</div>
          : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['ICD 编码', '疾病名称', '分类', '备注', '操作'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(d => (
                  <tr key={d._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#6B7280' }}>{d.icdCode || '-'}</td>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{d.name}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>{d.category || '-'}</td>
                    <td style={{ padding: '10px 14px', color: '#9CA3AF', fontSize: 12 }}>{d.remark || '-'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(d)} style={{ marginRight: 6 }}>编辑</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d)}>删除</button>
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
          <div className="modal" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑疾病' : '新增疾病'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">疾病名称 *</label>
                <input className="form-input" value={form.name} onChange={set('name')} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">ICD 编码</label>
                <input className="form-input" value={form.icdCode} onChange={set('icdCode')} placeholder="如：E11.9" />
              </div>
              <div className="form-group">
                <label className="form-label">分类</label>
                <input className="form-input" value={form.category} onChange={set('category')} placeholder="如：内分泌疾病" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">备注</label>
                <textarea className="form-input" rows={2} value={form.remark} onChange={set('remark')} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>取消</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : (editId ? '保存' : '添加')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
