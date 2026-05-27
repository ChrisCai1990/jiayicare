import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'
import { useCategories, StatusBadge } from './_ProjectPage'

const EXAM_TYPE_LABEL = {
  ultrasound: '超声',
  radiology:  '放射（X光/CT）',
  mri:        '磁共振',
  endoscopy:  '内镜',
  pathology:  '病理',
  other:      '其他',
}

const EMPTY = { name: '', mnemonic: '', examType: 'ultrasound', bodyPart: '', costPrice: 0, retailPrice: 0, unit: '次', referenceRange: '', categoryId: '', sortOrder: 0 }

export default function SpecialExamPage() {
  const toast = useToast()
  const cats = useCategories()
  const [list, setList] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filterType, setFilterType] = useState('')
  const [page, setPage] = useState(1)
  const [showModal, setShowModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = (p = page) => {
    setLoading(true)
    adminAPI.specialExams({ q, examType: filterType, page: p, limit: 20 }).then(r => {
      setList(r.data); setTotal(r.total || 0)
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { setPage(1); load(1) }, [q, filterType])
  useEffect(() => { load() }, [page])

  const openCreate = () => { setEditId(null); setForm(EMPTY); setError(''); setShowModal(true) }
  const openEdit = item => {
    setEditId(item._id)
    setForm({
      name: item.name, mnemonic: item.mnemonic || '', examType: item.examType,
      bodyPart: item.bodyPart || '', costPrice: item.costPrice || 0, retailPrice: item.retailPrice || 0,
      unit: item.unit || '次', referenceRange: item.referenceRange || '',
      categoryId: item.categoryId?._id || item.categoryId || '', sortOrder: item.sortOrder || 0,
    })
    setError(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('项目名称不能为空'); return }
    if (!form.examType) { setError('检查类型不能为空'); return }
    setSaving(true); setError('')
    try {
      if (editId) { await adminAPI.updateSpecialExam(editId, form); toast('已更新') }
      else { await adminAPI.createSpecialExam(form); toast('已创建') }
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
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>特殊检查项目</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>超声、影像、内镜、磁共振等非检验类检查项目</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="form-input" style={{ width: 180 }} placeholder="搜索名称/助记码" value={q} onChange={e => setQ(e.target.value)} />
          <select className="form-input" style={{ width: 150 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="">全部类型</option>
            {Object.entries(EXAM_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
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
                  {['名称', '检查类型', '检查部位', '零售价', '单位', '状态', '操作'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(item => (
                  <tr key={item._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, background: '#EEF2FF', color: '#4F46E5' }}>
                        {EXAM_TYPE_LABEL[item.examType] || item.examType}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>{item.bodyPart || '-'}</td>
                    <td style={{ padding: '10px 14px' }}>¥{item.retailPrice?.toFixed?.(2) || '0.00'}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>{item.unit || '-'}</td>
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
              <h3 className="modal-title">{editId ? '编辑特殊检查项目' : '新增特殊检查项目'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">项目名称 *</label>
                  <input className="form-input" value={form.name} onChange={set('name')} placeholder='如：颈动脉超声、胸部CT平扫' />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">检查类型 *</label>
                  <select className="form-input" value={form.examType} onChange={set('examType')}>
                    {Object.entries(EXAM_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">检查部位</label>
                  <input className="form-input" value={form.bodyPart} onChange={set('bodyPart')} placeholder='如：颈部、胸部、腹部' />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">助记码</label>
                  <input className="form-input" value={form.mnemonic} onChange={set('mnemonic')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">单位</label>
                  <input className="form-input" value={form.unit} onChange={set('unit')} placeholder='次、部位' />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">成本价（元）</label>
                  <input className="form-input" type="number" step="0.01" value={form.costPrice} onChange={set('costPrice')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">零售价（元） *</label>
                  <input className="form-input" type="number" step="0.01" value={form.retailPrice} onChange={set('retailPrice')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">参考范围</label>
                  <input className="form-input" value={form.referenceRange} onChange={set('referenceRange')} placeholder='如：未见明显异常' />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">排序权重</label>
                  <input className="form-input" type="number" value={form.sortOrder} onChange={set('sortOrder')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">所属分类</label>
                  <select className="form-input" value={form.categoryId} onChange={set('categoryId')}>
                    <option value="">无</option>
                    {cats.map(c => <option key={c._id} value={c._id}>{'　'.repeat(c.depth)}{c.name}</option>)}
                  </select>
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
