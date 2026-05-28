import React, { useEffect, useRef, useState } from 'react'
import { pinyin } from 'pinyin-pro'
import { adminAPI } from '../../api'
import { useToast } from '../../App'
import { useCategories, StatusBadge } from './_ProjectPage'

const DATA_TYPE_LABEL = { quantitative: '定量', qualitative: '定性', custom: '自定义' }
const QUALITATIVE_PRESETS = ['阴性-', '弱阳性±', '阳性+', '多量++', '大量+++', '无-']

const EMPTY = {
  name: '', mnemonic: '', costPrice: 0, retailPrice: 0, unit: '',
  specimenType: '', tubeColor: '', reportTime: '',
  participatesInDiscount: true,
  dataType: 'quantitative',
  referenceMin: '', referenceMax: '',
  referenceValue: '',
  criticalValue: '', abnormalValue: '', clinicalSuggestion: '',
  categoryId: '',
}

function genMnemonic(name) {
  if (!name) return ''
  try {
    return pinyin(name, { pattern: 'initial', toneType: 'none', type: 'array' })
      .map(s => s[0]?.toUpperCase() || '').join('').replace(/[^A-Z]/g, '')
  } catch { return '' }
}

function splitRefValue(val) {
  if (!val) return { min: '', max: '' }
  const m = val.match(/^([^-~～]*)[-~～](.*)$/)
  if (m) return { min: m[1].trim(), max: m[2].trim() }
  return { min: val, max: '' }
}

export default function LabTestItemPage() {
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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = (p = page) => {
    setLoading(true)
    adminAPI.labTestItems({ q, page: p, limit: 20 }).then(r => {
      setList(r.data); setTotal(r.total || 0)
    }).catch(e => toast(e.message)).finally(() => setLoading(false))
  }

  useEffect(() => { setPage(1); load(1) }, [q])
  useEffect(() => { load() }, [page])

  const openCreate = () => {
    setEditId(null); setForm(EMPTY); setMnemonicEdited(false); setError(''); setShowModal(true)
  }
  const openEdit = item => {
    setEditId(item._id)
    const rv = item.referenceValue || item.referenceRange || ''
    const { min, max } = splitRefValue(rv)
    setForm({
      name: item.name || '', mnemonic: item.mnemonic || '',
      costPrice: item.costPrice || 0, retailPrice: item.retailPrice || 0, unit: item.unit || '',
      specimenType: item.specimenType || '', tubeColor: item.tubeColor || '', reportTime: item.reportTime || '',
      participatesInDiscount: item.participatesInDiscount !== false,
      dataType: item.dataType || 'quantitative',
      referenceMin: min, referenceMax: max,
      referenceValue: rv,
      criticalValue: item.criticalValue || '', abnormalValue: item.abnormalValue || '',
      clinicalSuggestion: item.clinicalSuggestion || '',
      categoryId: item.categoryId?._id || item.categoryId || '',
    })
    setMnemonicEdited(true); setError(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { setError('项目名称不能为空'); return }
    if (!form.retailPrice && form.retailPrice !== 0) { setError('零售价不能为空'); return }
    setSaving(true); setError('')
    try {
      const payload = { ...form }
      if (payload.dataType === 'quantitative') {
        const min = payload.referenceMin?.trim() || ''
        const max = payload.referenceMax?.trim() || ''
        payload.referenceValue = min && max ? `${min}-${max}` : (min || max)
      }
      delete payload.referenceMin
      delete payload.referenceMax
      if (!payload.categoryId) payload.categoryId = null

      if (editId) { await adminAPI.updateLabTestItem(editId, payload); toast('已更新') }
      else { await adminAPI.createLabTestItem(payload); toast('已创建') }
      setShowModal(false); load()
    } catch (e) { setError(e.message) }
    finally { setSaving(false) }
  }

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setCheck = k => e => setForm(f => ({ ...f, [k]: e.target.checked }))

  const handleNameChange = e => {
    const name = e.target.value
    setForm(f => ({ ...f, name, mnemonic: mnemonicEdited ? f.mnemonic : genMnemonic(name) }))
  }
  const handleMnemonicChange = e => {
    setMnemonicEdited(true)
    setForm(f => ({ ...f, mnemonic: e.target.value }))
  }

  const handleKeyDown = e => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
      e.preventDefault(); handleSave()
    }
  }

  const totalPages = Math.ceil(total / 20)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>检验项目</h2>
          <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>单个检验指标，如"空腹血糖""血红蛋白"</p>
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
                  {['名称', '助记码', '数据类型', '单位', '零售价', '参与优惠', '状态', '操作'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map(item => (
                  <tr key={item._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 500 }}>{item.name}</td>
                    <td style={{ padding: '10px 14px', fontFamily: 'monospace', color: '#6B7280', fontSize: 12 }}>{item.mnemonic || '-'}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280', fontSize: 12 }}>{DATA_TYPE_LABEL[item.dataType] || '-'}</td>
                    <td style={{ padding: '10px 14px', color: '#6B7280' }}>{item.unit || '-'}</td>
                    <td style={{ padding: '10px 14px' }}>¥{item.retailPrice?.toFixed?.(2) || '0.00'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 12, color: item.participatesInDiscount !== false ? '#1E6B50' : '#6B7280' }}>
                        {item.participatesInDiscount !== false ? '是' : '否'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}><StatusBadge active={item.status === 'active'} /></td>
                    <td style={{ padding: '10px 14px' }}>
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(item)} style={{ marginRight: 4 }}>编辑</button>
                      <button className="btn btn-secondary btn-sm" onClick={async () => { try { await adminAPI.toggleLabTestItem(item._id); load() } catch (e) { toast(e.message) } }} style={{ marginRight: 4 }}>
                        {item.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={async () => { if (!window.confirm(`确定删除「${item.name}」？`)) return; try { await adminAPI.deleteLabTestItem(item._id); toast('已删除'); load() } catch (e) { toast(e.message) } }}>删除</button>
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
          <div className="modal" style={{ maxWidth: 600 }} onKeyDown={handleKeyDown}>
            <div className="modal-header">
              <h3 className="modal-title">{editId ? '编辑检验项目' : '新增检验项目'}</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            {error && <div className="login-err" style={{ margin: '0 20px 12px' }}>⚠️ {error}</div>}
            <div className="modal-body" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">项目名称 *</label>
                  <input className="form-input" value={form.name} onChange={handleNameChange} placeholder="如：空腹血糖" />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">助记码（拼音首字母）</label>
                  <input className="form-input" value={form.mnemonic} onChange={handleMnemonicChange} placeholder="输入名称后自动生成" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">单位</label>
                  <input className="form-input" value={form.unit} onChange={set('unit')} placeholder="如：mmol/L" />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">成本价（元）</label>
                  <input className="form-input" type="number" step="0.01" value={form.costPrice} onChange={set('costPrice')} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">零售价（元） *</label>
                  <input className="form-input" type="number" step="0.01" value={form.retailPrice} onChange={set('retailPrice')} />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">标本种类</label>
                  <input className="form-input" value={form.specimenType} onChange={set('specimenType')} placeholder="如：血清、全血" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">试管颜色</label>
                  <input className="form-input" value={form.tubeColor} onChange={set('tubeColor')} placeholder="如：紫色管" />
                </div>

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">报告时间</label>
                  <input className="form-input" value={form.reportTime} onChange={set('reportTime')} placeholder="如：2小时" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">数据类型 *</label>
                  <select className="form-input" value={form.dataType} onChange={set('dataType')}>
                    <option value="quantitative">定量</option>
                    <option value="qualitative">定性</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>

                {form.dataType === 'quantitative' && (
                  <>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">参考值下限</label>
                      <input className="form-input" value={form.referenceMin} onChange={set('referenceMin')} placeholder="如：3.9" />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label">参考值上限</label>
                      <input className="form-input" value={form.referenceMax} onChange={set('referenceMax')} placeholder="如：6.1" />
                    </div>
                  </>
                )}
                {form.dataType === 'qualitative' && (
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                    <label className="form-label">参考值</label>
                    <select className="form-input" value={form.referenceValue} onChange={set('referenceValue')}>
                      <option value="">请选择</option>
                      {QUALITATIVE_PRESETS.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </div>
                )}
                {form.dataType === 'custom' && (
                  <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                    <label className="form-label">参考值</label>
                    <input className="form-input" value={form.referenceValue} onChange={set('referenceValue')} placeholder="自定义文本" />
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">危急值</label>
                  <input className="form-input" value={form.criticalValue} onChange={set('criticalValue')} placeholder="如：>20.0" />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">异常值</label>
                  <input className="form-input" value={form.abnormalValue} onChange={set('abnormalValue')} placeholder="自定义异常描述" />
                </div>

                <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                  <label className="form-label">结论建议</label>
                  <textarea className="form-input" rows={2} value={form.clinicalSuggestion} onChange={set('clinicalSuggestion')} placeholder="异常时的建议文案" />
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
                    <input type="checkbox" checked={form.participatesInDiscount} onChange={setCheck('participatesInDiscount')} />
                    参与商城折扣活动
                  </label>
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
