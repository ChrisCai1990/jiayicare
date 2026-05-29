import React, { useEffect, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const DEFAULT = {
  base: 60,
  perRecord: 2,
  maxRecordBonus: 20,
  taskRateWeight: 0.1,
  dangerPenalty: 10,
  warningPenalty: 5,
}

const FIELDS = [
  { key: 'base',           label: '基础分',                    desc: '所有用户的初始健康基础分',                         unit: '分',  min: 0, max: 100, step: 1  },
  { key: 'perRecord',      label: '每条健康记录加分',           desc: '每新增一条健康记录（血压/血糖等）获得的加分',       unit: '分',  min: 0, max: 10,  step: 0.5 },
  { key: 'maxRecordBonus', label: '记录加分上限',               desc: '健康记录带来的加分最多不超过此值',                 unit: '分',  min: 0, max: 50,  step: 1  },
  { key: 'taskRateWeight', label: '任务完成率权重',             desc: '任务完成率（%） × 权重 = 加分，如完成率90%、权重0.1则加9分', unit: '', min: 0, max: 1, step: 0.01 },
  { key: 'dangerPenalty',  label: '危险指标每项扣分',           desc: '每个"危险"状态的健康指标扣分',                     unit: '分',  min: 0, max: 30,  step: 1  },
  { key: 'warningPenalty', label: '预警指标每项扣分',           desc: '每个"预警"状态的健康指标扣分',                     unit: '分',  min: 0, max: 20,  step: 1  },
]

export default function ScoringConfigPage() {
  const toast = useToast()
  const [form, setForm] = useState(DEFAULT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    adminAPI.getScoringConfig()
      .then(r => setForm({ ...DEFAULT, ...r.data }))
      .catch(e => toast(e.message))
      .finally(() => setLoading(false))
  }, [])

  const set = key => e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await adminAPI.updateScoringConfig(form)
      toast('评分配置已保存')
    } catch (err) { toast(err.message) }
    finally { setSaving(false) }
  }

  const handleReset = () => { if (window.confirm('重置为默认配置？')) setForm(DEFAULT) }

  // 预览：假设 3 条记录、任务完成率 80%、1 个预警指标
  const preview = (() => {
    const recordBonus = Math.min(3 * form.perRecord, form.maxRecordBonus)
    const taskBonus   = Math.round(80 * form.taskRateWeight)
    const deduct      = 1 * form.warningPenalty
    const total       = Math.max(0, Math.min(100, form.base + recordBonus + taskBonus - deduct))
    return { recordBonus, taskBonus, deduct, total }
  })()

  if (loading) return <div className="page-loading">加载中...</div>

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">健康评分配置</h1>
          <p className="page-subtitle">配置会员健康评分的计算权重，实时生效</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleReset}>重置默认</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存配置'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        {/* 配置表单 */}
        <div className="card">
          <div className="card-body">
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20, color: '#1A2B24' }}>评分权重参数</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {FIELDS.map(f => (
                <div key={f.key} style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 16, alignItems: 'start', paddingBottom: 16, borderBottom: '1px solid #F3F4F6' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14, color: '#1A2B24', marginBottom: 4 }}>{f.label}</div>
                    <div style={{ fontSize: 12, color: '#8AA89C', lineHeight: 1.5 }}>{f.desc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="number"
                      className="form-input"
                      style={{ flex: 1, textAlign: 'center' }}
                      value={form[f.key]}
                      min={f.min}
                      max={f.max}
                      step={f.step}
                      onChange={set(f.key)}
                    />
                    {f.unit && <span style={{ fontSize: 13, color: '#8AA89C', whiteSpace: 'nowrap' }}>{f.unit}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 预览面板 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-body">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: '#1A2B24' }}>📊 评分公式预览</h3>
              <div style={{ background: '#f9f7f3', borderRadius: 8, padding: 14, fontFamily: 'monospace', fontSize: 13, lineHeight: 2, color: '#4A6558' }}>
                <div>基础分　　= <strong>{form.base}</strong></div>
                <div>+ 记录加分 = min(条数×{form.perRecord}, {form.maxRecordBonus})</div>
                <div>+ 任务加分 = 完成率%×{form.taskRateWeight}</div>
                <div>- 危险扣分 = 危险数×{form.dangerPenalty}</div>
                <div>- 预警扣分 = 预警数×{form.warningPenalty}</div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#1A2B24' }}>🧪 示例计算</h3>
              <p style={{ fontSize: 12, color: '#8AA89C', marginBottom: 12 }}>
                假设：3条健康记录、任务完成率80%、1个预警指标
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#4A6558' }}>基础分</span>
                  <span style={{ fontWeight: 600 }}>+{form.base}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#4A6558' }}>记录加分</span>
                  <span style={{ fontWeight: 600, color: '#22A06B' }}>+{preview.recordBonus}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#4A6558' }}>任务加分</span>
                  <span style={{ fontWeight: 600, color: '#22A06B' }}>+{preview.taskBonus}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#4A6558' }}>预警扣分</span>
                  <span style={{ fontWeight: 600, color: '#DC3545' }}>-{preview.deduct}</span>
                </div>
                <div style={{ height: 1, background: '#E0D9CE', margin: '4px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15 }}>
                  <span style={{ fontWeight: 700 }}>最终得分</span>
                  <span style={{ fontWeight: 700, color: '#1E6B50', fontSize: 18 }}>{preview.total}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
