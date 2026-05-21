import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'

const TYPE_LABEL = { checkup:'体检方案', health:'健康管理方案', followup:'随访计划', nutrition:'营养干预方案', rehab:'运动康复方案', tcm:'中医方案' }
const STATUS_LABEL = { draft:'草稿', active:'推送中', completed:'已完成', cancelled:'已取消' }
const ITEM_STATUS = { pending:'待完成', completed:'已完成', skipped:'已跳过' }
const ITEM_STATUS_COLOR = { pending:'#D97706', completed:'#22A06B', skipped:'#aaa' }

export default function PlanDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showAddItem, setShowAddItem] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', category: '', scheduledDate: '', notes: '' })

  const load = async () => {
    try { const r = await staffAPI.getPlan(id); setPlan(r.data) }
    catch { toast('加载失败') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  const handlePush = async () => {
    if (!window.confirm('确认推送此方案给患者？')) return
    try { await staffAPI.pushPlan(id); toast('方案已推送'); load() }
    catch (err) { toast(err.message) }
  }

  const handleItemStatus = async (itemId, status) => {
    try { await staffAPI.updatePlanItem(id, itemId, { status }); load() }
    catch (err) { toast(err.message) }
  }

  const handleAddItem = async () => {
    if (!newItem.name) { toast('项目名称不能为空'); return }
    try {
      await staffAPI.updatePlan(id, { items: [...(plan.items || []), newItem] })
      setNewItem({ name: '', category: '', scheduledDate: '', notes: '' })
      setShowAddItem(false); load(); toast('已添加')
    } catch (err) { toast(err.message) }
  }

  const handleDelete = async () => {
    if (!window.confirm('确定删除此方案？')) return
    try { await staffAPI.deletePlan(id); toast('已删除'); nav('/plans') }
    catch (err) { toast(err.message) }
  }

  if (loading) return <div className="page-loading">加载中...</div>
  if (!plan) return <div className="page">方案不存在</div>

  const completedCount = plan.items?.filter(i => i.status === 'completed').length || 0
  const progress = plan.items?.length ? Math.round((completedCount / plan.items.length) * 100) : 0

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => nav('/plans')}>← 返回</button>
          <div>
            <h1 className="page-title">{plan.title}</h1>
            <p className="page-subtitle">{TYPE_LABEL[plan.type]} · {plan.patientId?.name} · {plan.year}年</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {plan.status === 'draft' && (
            <button className="btn btn-primary" onClick={handlePush}>📤 推送给患者</button>
          )}
          <button className="btn btn-secondary" onClick={handleDelete}>删除</button>
        </div>
      </div>

      {/* 基本信息 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">方案信息</div></div>
          <div className="card-body">
            {[
              ['患者', plan.patientId?.name + ' · ' + plan.patientId?.phone],
              ['类型', TYPE_LABEL[plan.type]],
              ['状态', STATUS_LABEL[plan.status]],
              ['年度', plan.year + ' 年'],
              ['制定人', plan.staffId?.name],
              ['推送时间', plan.pushedAt ? new Date(plan.pushedAt).toLocaleDateString('zh-CN') : '未推送'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f5f2ec', fontSize: 14 }}>
                <span style={{ color: '#8AA89C' }}>{k}</span>
                <span style={{ fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">执行进度</div></div>
          <div className="card-body">
            <div style={{ fontSize: 36, fontWeight: 800, color: '#1E6B50', marginBottom: 8 }}>{progress}%</div>
            <div style={{ height: 8, background: '#f0f0f0', borderRadius: 4, marginBottom: 12 }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#1E6B50', borderRadius: 4, transition: 'width 0.3s' }} />
            </div>
            <div style={{ fontSize: 14, color: '#666' }}>{completedCount} / {plan.items?.length || 0} 项已完成</div>
            {plan.description && <p style={{ marginTop: 12, fontSize: 13, color: '#4A6558', lineHeight: 1.6 }}>{plan.description}</p>}
          </div>
        </div>
      </div>

      {/* 方案项目列表 */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">方案项目</div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddItem(!showAddItem)}>＋ 添加项目</button>
        </div>

        {showAddItem && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0ece4', background: '#f9f7f3' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 10, alignItems: 'flex-end' }}>
              {[
                { label: '项目名称*', key: 'name', placeholder: '如：颈动脉超声' },
                { label: '分类', key: 'category', placeholder: '如：影像检查' },
                { label: '计划日期', key: 'scheduledDate', type: 'date' },
                { label: '注意事项', key: 'notes', placeholder: '可选' },
              ].map(f => (
                <div key={f.key}>
                  <label className="form-label" style={{ fontSize: 11 }}>{f.label}</label>
                  <input className="form-input" type={f.type || 'text'} placeholder={f.placeholder}
                    value={newItem[f.key]} onChange={e => setNewItem(n => ({ ...n, [f.key]: e.target.value }))} />
                </div>
              ))}
              <button className="btn btn-primary btn-sm" onClick={handleAddItem} style={{ height: 38 }}>添加</button>
            </div>
          </div>
        )}

        {!plan.items?.length ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#aaa', fontSize: 14 }}>暂无项目，点击"添加项目"开始</div>
        ) : (
          <table className="table">
            <thead><tr>
              <th>#</th><th>项目名称</th><th>分类</th><th>计划日期</th><th>注意事项</th><th>状态</th><th>操作</th>
            </tr></thead>
            <tbody>
              {plan.items.map((item, idx) => (
                <tr key={item._id}>
                  <td style={{ color: '#aaa' }}>{idx + 1}</td>
                  <td><strong>{item.name}</strong></td>
                  <td style={{ color: '#666' }}>{item.category || '-'}</td>
                  <td style={{ fontSize: 13, color: '#666' }}>{item.scheduledDate ? new Date(item.scheduledDate).toLocaleDateString('zh-CN') : '-'}</td>
                  <td style={{ maxWidth: 180, fontSize: 12, color: '#8AA89C' }}>{item.notes || '-'}</td>
                  <td>
                    <span style={{ color: ITEM_STATUS_COLOR[item.status], fontWeight: 500, fontSize: 13 }}>
                      {ITEM_STATUS[item.status]}
                    </span>
                    {item.completedAt && <div style={{ fontSize: 11, color: '#aaa' }}>{new Date(item.completedAt).toLocaleDateString('zh-CN')}</div>}
                  </td>
                  <td>
                    {item.status === 'pending' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => handleItemStatus(item._id, 'completed')}>✓ 完成</button>
                    )}
                    {item.status === 'completed' && (
                      <button className="btn btn-secondary btn-sm" onClick={() => handleItemStatus(item._id, 'pending')}>撤销</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
