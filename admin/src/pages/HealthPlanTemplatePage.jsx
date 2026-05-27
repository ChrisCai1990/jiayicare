import React, { useEffect, useState, useCallback } from 'react'
import { adminAPI } from '../api'
import { useToast } from '../App'

const PLAN_TYPES = [
  { key: 'annual_checkup',    label: '年度体检方案',  icon: '🔬' },
  { key: 'health_management', label: '健康管理方案',  icon: '📋' },
  { key: 'nutrition',         label: '营养干预方案',  icon: '🥗' },
  { key: 'medical_assist',    label: '就医协助方案',  icon: '🏥' },
  { key: 'rehab',             label: '运动复健方案',  icon: '🏃' },
  { key: 'tcm',               label: '中医养生方案',  icon: '🍃' },
  { key: 'psychology',        label: '心理咨询方案',  icon: '🧠' },
]

// ── 各类型的默认 content 结构 ─────────────────────────────────
const defaultContent = {
  annual_checkup: {
    packageName: '', packageDesc: '', checkItems: '', addons: '',
  },
  health_management: {
    applicableMemberTypes: '', modules: '',
    medicalIssue: '', dailyMonitoring: '', vaccination: '', lifestyle: '', examPlan: '',
  },
  nutrition: {
    applicablePopulation: '', breakfast: '', lunch: '', dinner: '', snack: '',
    mealTimes: '', dietPrinciple: '', dailyWater: '', cookingMethod: '',
    mealOrder: '', nutritionSupplements: '', exerciseSuggestion: '', allowedFoods: '', forbiddenFoods: '',
  },
  medical_assist: {
    serviceType: '代办挂号', name: '', datetime: '', staffName: '', tasks: '',
    hospital: '', department: '', expert: '', hotel: '', transport: '', notes: '',
  },
  rehab: {
    applicablePopulation: '', goal: '', exercises: '', weeklyFreq: '', duration: '',
    precautions: '', progression: '',
  },
  tcm: {
    constitution: '', chineseMedicine: '', acupuncture: '', diet: '', lifestyle: '', other: '',
  },
  psychology: {
    topic: '', frequency: '', sessionCount: '', duration: '', mode: '线上',
    homework: '', assessmentTools: '',
  },
}

const ADDON_OPTIONS = [
  '肿瘤风险筛查',
  '心脑血管病风险筛查',
  '慢性病风险筛查',
  '老年痴呆风险筛查',
  '骨质疏松风险筛查',
  '其他风险筛查',
  '功能医学检测',
]

// ── 表单字段行（必须定义在 PlanContentForm 外部，避免每次渲染产生新引用导致输入框失焦）──
function FieldRow({ label, fieldKey, placeholder, rows, half, content, set }) {
  return (
    <div className="form-group" style={half ? {} : { gridColumn: '1/-1' }}>
      <label className="form-label">{label}</label>
      {rows ? (
        <textarea className="form-input" rows={rows} value={content[fieldKey] || ''}
          onChange={e => set(fieldKey, e.target.value)} placeholder={placeholder} />
      ) : (
        <input className="form-input" value={content[fieldKey] || ''}
          onChange={e => set(fieldKey, e.target.value)} placeholder={placeholder} />
      )}
    </div>
  )
}

// ── 各类型的表单字段定义 ──────────────────────────────────────
function PlanContentForm({ type, content, onChange }) {
  const set = (k, v) => onChange({ ...content, [k]: v })
  const T = (props) => <FieldRow {...props} content={content} set={set} />

  if (type === 'annual_checkup') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <T label="套餐名称" fieldKey="packageName" placeholder="如：基础体检套餐" half />
      <T label="状态说明" fieldKey="packageDesc" placeholder="套餐描述" half />
      <T label="包含检查项目" fieldKey="checkItems" rows={4} placeholder="每行一项，如：颈动脉超声&#10;血脂全套&#10;心脏彩超" />
      <div className="form-group" style={{ gridColumn: '1/-1' }}>
        <label className="form-label">可选加项库</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', padding: '10px 12px', border: '1px solid #d0c9be', borderRadius: 8, background: '#faf8f5' }}>
          {ADDON_OPTIONS.map(opt => {
            const selected = (content.addons || '').split(',').map(s => s.trim()).filter(Boolean)
            const checked = selected.includes(opt)
            return (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: '#333' }}>
                <input type="checkbox" checked={checked} onChange={() => {
                  const next = checked ? selected.filter(s => s !== opt) : [...selected, opt]
                  set('addons', next.join(', '))
                }} style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#1E6B50' }} />
                {opt}
              </label>
            )
          })}
        </div>
      </div>
    </div>
  )

  if (type === 'health_management') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <T label="适用会员类型" fieldKey="applicableMemberTypes" placeholder="如：年度会员, 半年会员" half />
      <T label="医疗问题解决" fieldKey="medicalIssue" placeholder="医院、科室、解决目标等" half />
      <T label="日常监测计划" fieldKey="dailyMonitoring" placeholder="血压/血糖/心率，每日频率" half />
      <T label="疫苗接种计划" fieldKey="vaccination" placeholder="疫苗名称、接种时间" half />
      <T label="生活方式建议" fieldKey="lifestyle" placeholder="关联科普文章/健康知识推送" rows={3} />
      <T label="体检方案引用" fieldKey="examPlan" placeholder="引用已有年度体检套餐名称" rows={3} />
      <T label="其他备注" fieldKey="modules" placeholder="补充说明..." rows={2} />
    </div>
  )

  if (type === 'nutrition') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <T label="适用人群" fieldKey="applicablePopulation" placeholder="如：糖尿病、减重、孕期" half />
      <T label="每日饮水量（毫升）" fieldKey="dailyWater" placeholder="如：2000" half />
      <T label="早餐建议" fieldKey="breakfast" rows={3} placeholder="食物种类、份量描述" />
      <T label="午餐建议" fieldKey="lunch" rows={3} placeholder="食物种类、份量描述" />
      <T label="晚餐建议" fieldKey="dinner" rows={3} placeholder="食物种类、份量描述" />
      <T label="加餐建议" fieldKey="snack" rows={2} placeholder="时间、食物、份量" />
      <T label="进餐时间节点" fieldKey="mealTimes" placeholder="如：7:00早餐 / 12:30午餐 / 18:30晚餐" half />
      <T label="烹饪方式" fieldKey="cookingMethod" placeholder="推荐：蒸煮炖；避免：油炸" half />
      <T label="进餐顺序" fieldKey="mealOrder" placeholder="如：汤→蔬菜→肉→主食" half />
      <T label="膳食总原则" fieldKey="dietPrinciple" placeholder="如：低盐低脂、高纤维" half />
      <T label="营养素补充建议" fieldKey="nutritionSupplements" rows={3} placeholder="营养素名称、剂量、用法" />
      <T label="运动建议" fieldKey="exerciseSuggestion" rows={3} placeholder="运动类型、频率、时长、强度" />
      <T label="推荐食物" fieldKey="allowedFoods" rows={2} placeholder="逗号分隔" />
      <T label="禁忌食物" fieldKey="forbiddenFoods" rows={2} placeholder="逗号分隔" />
    </div>
  )

  if (type === 'medical_assist') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div className="form-group" style={{ gridColumn: '1/-1' }}>
        <label className="form-label">服务类型</label>
        <select className="form-input" value={content.serviceType || '代办挂号'} onChange={e => set('serviceType', e.target.value)}>
          {['代办挂号', '代诊', '陪诊', '体检一站式', '门诊一站式', '住院一站式'].map(s => <option key={s}>{s}</option>)}
        </select>
      </div>
      <T label="医院" fieldKey="hospital" placeholder="医院名称" half />
      <T label="科室" fieldKey="department" placeholder="科室名称" half />
      <T label="专家" fieldKey="expert" placeholder="专家姓名（可选）" half />
      <T label="就医专员" fieldKey="staffName" placeholder="专员姓名（可选）" half />
      <T label="服务时间" fieldKey="datetime" placeholder="日期和时间段" half />
      <T label="交通接送安排" fieldKey="transport" placeholder="是否专车、集合地点" half />
      <T label="具体服务事项" fieldKey="tasks" rows={3} placeholder="如：代取报告、陪同检查" />
      <T label="酒店安排" fieldKey="hotel" rows={2} placeholder="是否需要住宿及酒店信息" />
      <T label="备注" fieldKey="notes" rows={2} placeholder="其他注意事项" />
    </div>
  )

  if (type === 'rehab') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <T label="适用人群/病症" fieldKey="applicablePopulation" placeholder="如：膝关节术后" half />
      <T label="复健目标" fieldKey="goal" placeholder="文字描述" half />
      <T label="每周频次" fieldKey="weeklyFreq" placeholder="如：每周3次" half />
      <T label="每次时长（分钟）" fieldKey="duration" placeholder="如：45" half />
      <T label="运动项目" fieldKey="exercises" rows={4} placeholder="具体动作/器械/活动，每行一项" />
      <T label="注意事项" fieldKey="precautions" rows={3} placeholder="禁忌、需监护事项等" />
      <T label="进阶计划" fieldKey="progression" rows={2} placeholder="如：每两周增加强度" />
    </div>
  )

  if (type === 'tcm') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <div className="form-group" style={{ gridColumn: '1/-1' }}>
        <label className="form-label">体质类型</label>
        <select className="form-input" value={content.constitution || ''} onChange={e => set('constitution', e.target.value)}>
          <option value="">请选择</option>
          {['平和质', '气虚质', '阳虚质', '阴虚质', '痰湿质', '湿热质', '血瘀质', '气郁质', '特禀质'].map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <T label="中药调理（方剂/中成药）" fieldKey="chineseMedicine" rows={3} placeholder="方剂或中成药建议" />
      <T label="针灸/推拿" fieldKey="acupuncture" rows={3} placeholder="建议频次、主要穴位" />
      <T label="饮食宜忌" fieldKey="diet" rows={3} placeholder="推荐食物、禁忌食物" />
      <T label="起居建议" fieldKey="lifestyle" rows={3} placeholder="作息、睡眠、情绪调节" />
      <T label="其他（八段锦/太极等）" fieldKey="other" rows={2} placeholder="其他养生建议" />
    </div>
  )

  if (type === 'psychology') return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      <T label="咨询主题" fieldKey="topic" placeholder="如：压力管理、失眠干预" half />
      <T label="咨询频次" fieldKey="frequency" placeholder="如：每周一次，共8次" half />
      <T label="每次时长（分钟）" fieldKey="duration" placeholder="如：50" half />
      <div className="form-group">
        <label className="form-label">咨询方式</label>
        <select className="form-input" value={content.mode || '线上'} onChange={e => set('mode', e.target.value)}>
          {['线上', '线下', '电话'].map(m => <option key={m}>{m}</option>)}
        </select>
      </div>
      <T label="作业建议（日常练习）" fieldKey="homework" rows={3} placeholder="如：正念冥想、情绪日记" />
      <T label="评估工具/量表" fieldKey="assessmentTools" rows={3} placeholder="如：GAD-7（焦虑）、PHQ-9（抑郁）" />
    </div>
  )

  return null
}

// ── 模板新增/编辑 Modal ──────────────────────────────────────
function TemplateModal({ template, planType, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!template?._id
  const [name, setName] = useState(template?.name || '')
  const [status, setStatus] = useState(template?.status || 'active')
  const [content, setContent] = useState(template?.content || defaultContent[planType] || {})
  const [loading, setLoading] = useState(false)

  const typeLabel = PLAN_TYPES.find(t => t.key === planType)?.label || planType

  const save = async () => {
    if (!name.trim()) { toast('❌ 模板名称不能为空'); return }
    setLoading(true)
    try {
      if (isEdit) {
        await adminAPI.updatePlanTemplate(template._id, { name, status, content })
      } else {
        await adminAPI.createPlanTemplate({ type: planType, name, status, content })
      }
      toast(`✅ 模板${isEdit ? '更新' : '创建'}成功`)
      onSaved()
      onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720, width: '96%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? '✏️ 编辑' : '➕ 新增'}{typeLabel}模板</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div className="form-group" style={{ gridColumn: '1/-1' }}>
              <label className="form-label">模板名称 *</label>
              <input className="form-input" value={name} onChange={e => setName(e.target.value)}
                placeholder={`如：${planType === 'annual_checkup' ? '心脑血管深度筛查套餐' : planType === 'nutrition' ? '糖尿病饮食管理方案' : '方案模板名称'}`} />
            </div>
            <div className="form-group">
              <label className="form-label">状态</label>
              <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="active">启用</option>
                <option value="inactive">停用</option>
              </select>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e0d9ce', paddingTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#333', marginBottom: 12 }}>模板内容</div>
            <PlanContentForm type={planType} content={content} onChange={setContent} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={loading}>
            {loading ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 主页面 ──────────────────────────────────────────────────────
export default function HealthPlanTemplatePage() {
  const toast = useToast()
  const [activeType, setActiveType] = useState('annual_checkup')
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminAPI.planTemplates(activeType)
      setTemplates(res.data || [])
    } catch (err) {
      toast('❌ 加载失败：' + err.message)
    } finally {
      setLoading(false)
    }
  }, [activeType])

  useEffect(() => { load() }, [load])

  const toggle = async (tpl) => {
    try {
      await adminAPI.togglePlanTemplate(tpl._id)
      load()
    } catch (err) { toast('❌ ' + err.message) }
  }

  const copy = async (tpl) => {
    try {
      await adminAPI.copyPlanTemplate(tpl._id)
      toast('✅ 模板已复制')
      load()
    } catch (err) { toast('❌ ' + err.message) }
  }

  const del = async (tpl) => {
    if (!window.confirm(`确定删除「${tpl.name}」？`)) return
    try {
      await adminAPI.deletePlanTemplate(tpl._id)
      toast('✅ 已删除')
      load()
    } catch (err) { toast('❌ ' + err.message) }
  }

  const activeTypeMeta = PLAN_TYPES.find(t => t.key === activeType)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">📚 健康方案模板管理</div>
          <div className="page-subtitle">配置七类健康方案的标准模板，医护人员可快速选用并为客户生成个性化方案</div>
        </div>
      </div>

      {/* 方案类型标签页 */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid #e0d9ce', overflowX: 'auto' }}>
        {PLAN_TYPES.map(t => (
          <button key={t.key} type="button" onClick={() => setActiveType(t.key)} style={{
            padding: '10px 16px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: activeType === t.key ? 600 : 400, whiteSpace: 'nowrap',
            color: activeType === t.key ? '#1E6B50' : '#666',
            borderBottom: activeType === t.key ? '2px solid #1E6B50' : '2px solid transparent',
            marginBottom: -1,
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <span style={{ fontWeight: 600 }}>{activeTypeMeta?.icon} {activeTypeMeta?.label}</span>
          <span style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>共 {templates.length} 个模板</span>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true) }}>
          ＋ 新增模板
        </button>
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr>
                <th>模板名称</th>
                <th>状态</th>
                <th>创建时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center', color: '#888', padding: 32 }}>
                  暂无{activeTypeMeta?.label}模板，点击「新增模板」添加
                </td></tr>
              )}
              {templates.map(tpl => (
                <tr key={tpl._id}>
                  <td style={{ fontWeight: 600 }}>{tpl.name}</td>
                  <td>
                    <span className={`badge ${tpl.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                      {tpl.status === 'active' ? '启用' : '停用'}
                    </span>
                  </td>
                  <td style={{ color: '#888', fontSize: 12 }}>
                    {new Date(tpl.createdAt).toLocaleDateString('zh-CN')}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => { setEditing(tpl); setShowModal(true) }}>编辑</button>
                      <button className="btn btn-sm btn-ghost" onClick={() => toggle(tpl)}>
                        {tpl.status === 'active' ? '停用' : '启用'}
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => copy(tpl)}>复制</button>
                      <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => del(tpl)}>删除</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <TemplateModal
          template={editing}
          planType={activeType}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
    </div>
  )
}
