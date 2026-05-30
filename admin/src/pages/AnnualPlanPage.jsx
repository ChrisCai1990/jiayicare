import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminAPI } from '../api'
import { useToast } from '../App'

const PLAN_TYPES = [
  { key: 'health_reshape',    name: '健康重塑方案', icon: '💪', color: '#1E6B50', bg: '#E8F5EF' },
  { key: 'young_state',       name: '年轻态方案',   icon: '✨', color: '#7C3AED', bg: '#F3E8FF' },
  { key: 'chronic_stable',    name: '慢病维稳方案', icon: '🩺', color: '#DC2626', bg: '#FEF2F2' },
  { key: 'health_prevention', name: '健康预防方案', icon: '🛡️', color: '#0077B6', bg: '#EFF6FF' },
]

const MODULES = [
  { key: 'medical_treatment', name: '医疗问题解决', icon: '🏥' },
  { key: 'specialist_collab', name: '全专联合',     icon: '👨‍⚕️' },
  { key: 'daily_monitoring',  name: '日常监测',     icon: '📊' },
  { key: 'vaccine',           name: '疫苗接种',     icon: '💉' },
  { key: 'lifestyle',         name: '生活方式',     icon: '🌿' },
  { key: 'checkup',           name: '体检方案',     icon: '🔬' },
]

const TIME_OPTIONS = ['每月一次', '每季度一次', '每半年一次', '每年一次', '按需安排', '待定']
const HOSPITAL_OPTIONS = ['省人民医院', '市第一人民医院', '市第二人民医院', '解放军总医院', '协和医院', '华西医院', '瑞金医院', '其他']
const VACCINE_ITEMS = [
  { key: 'flu',        label: '流感疫苗',     desc: '建议每年接种，保护期约6个月' },
  { key: 'pneumonia',  label: '肺炎球菌疫苗', desc: '适合≥65岁或有慢性病人群' },
  { key: 'hpv',        label: 'HPV疫苗',      desc: '适合9-45岁，预防宫颈癌等' },
  { key: 'hepatitisB', label: '乙肝疫苗',     desc: '未感染且抗体阴性者推荐' },
  { key: 'tetanus',    label: '破伤风疫苗',   desc: '外伤后及时接种' },
]
const MONITORING_ITEMS = [
  { key: 'dynamic_glucose', label: '动态血糖监测',      desc: '持续佩戴传感器，24小时血糖趋势' },
  { key: 'dynamic_bp',      label: '动态血压监测',      desc: '24小时血压记录，评估昼夜节律' },
  { key: 'daily_glucose',   label: '日常血糖监测',      desc: '餐前/餐后自测血糖，记录到健康档案' },
  { key: 'sleep',           label: '睡眠质量监测',      desc: '监测睡眠时长、深度及规律' },
  { key: 'bp_weight',       label: '血压/体重日常监测', desc: '定期记录基础指标，生成趋势报告' },
  { key: 'heart_rate',      label: '心率监测',          desc: '静息心率及运动后心率恢复' },
]
const LIFESTYLE_DIMENSIONS = [
  { key: 'diet',             label: '饮食习惯' },
  { key: 'exercise',         label: '运动状况' },
  { key: 'sleep',            label: '睡眠质量' },
  { key: 'smoking_drinking', label: '烟酒情况' },
  { key: 'stress',           label: '心理压力' },
]

function getModuleData(moduleData, key) { return moduleData?.[key] || {} }
function setModuleField(moduleData, moduleKey, field, value) {
  return { ...moduleData, [moduleKey]: { ...getModuleData(moduleData, moduleKey), [field]: value } }
}

function Toggle({ value, onChange, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {label && <span style={{ fontSize: 13, color: '#666' }}>{label}</span>}
      <div
        onClick={onChange ? (e => { e.stopPropagation(); onChange(!value) }) : undefined}
        style={{
          width: 40, height: 22, borderRadius: 11,
          background: value ? '#1E6B50' : '#ddd',
          position: 'relative', cursor: onChange ? 'pointer' : 'default',
          transition: 'background 0.2s', flexShrink: 0,
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: value ? 21 : 3,
          width: 16, height: 16, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </div>
    </div>
  )
}

function FieldRow({ label, children, required }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid #F5F2EC', gap: 12 }}>
      <span style={{ width: 110, flexShrink: 0, fontSize: 13, color: '#4A6558', paddingTop: 8, lineHeight: 1.4 }}>
        {required && <span style={{ color: '#DC2626', marginRight: 2 }}>*</span>}
        {label}
      </span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}

function TextInput({ value, onChange, placeholder, multiline }) {
  const style = { width: '100%', padding: '7px 10px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' }
  if (multiline) return <textarea value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={{ ...style, resize: 'vertical' }} />
  return <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={style} />
}

function SelectInput({ value, onChange, options, placeholder }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)}
      style={{ width: '100%', padding: '7px 10px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, background: '#fff', boxSizing: 'border-box' }}>
      <option value="">{placeholder || '请选择'}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function DateInput({ value, onChange }) {
  return <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
    style={{ width: '100%', padding: '7px 10px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' }} />
}

function MedicalTreatmentFields({ data, set }) {
  return (
    <div style={{ paddingTop: 8 }}>
      <FieldRow label="就医频率"><SelectInput value={data.time} onChange={v => set('time', v)} options={TIME_OPTIONS} placeholder="请选择频率" /></FieldRow>
      <FieldRow label="就诊医院"><SelectInput value={data.hospital} onChange={v => set('hospital', v)} options={HOSPITAL_OPTIONS} placeholder="请选择医院" /></FieldRow>
      <FieldRow label="就诊科室"><TextInput value={data.department} onChange={v => set('department', v)} placeholder="如：心内科、内分泌科" /></FieldRow>
      <FieldRow label="主治医生"><TextInput value={data.doctor} onChange={v => set('doctor', v)} placeholder="医生姓名" /></FieldRow>
      <FieldRow label="就医原因"><TextInput value={data.reason} onChange={v => set('reason', v)} placeholder="主要诊疗需求或问题" multiline /></FieldRow>
      <FieldRow label="协调专员"><TextInput value={data.coordinator} onChange={v => set('coordinator', v)} placeholder="负责协调的健管专员姓名" /></FieldRow>
      <FieldRow label="备注"><TextInput value={data.notes} onChange={v => set('notes', v)} placeholder="其他说明" multiline /></FieldRow>
    </div>
  )
}

function SpecialistCollabFields({ data, set }) {
  return (
    <div style={{ paddingTop: 8 }}>
      <FieldRow label="会诊计划日期"><DateInput value={data.date} onChange={v => set('date', v)} /></FieldRow>
      <FieldRow label="会诊医院"><TextInput value={data.hospital} onChange={v => set('hospital', v)} placeholder="医院名称" /></FieldRow>
      <FieldRow label="科室/专业"><TextInput value={data.department} onChange={v => set('department', v)} placeholder="如：多学科联合门诊（MDT）" /></FieldRow>
      <FieldRow label="专家姓名"><TextInput value={data.doctor} onChange={v => set('doctor', v)} placeholder="参与会诊的专家姓名" /></FieldRow>
      <FieldRow label="会诊目的"><TextInput value={data.reason} onChange={v => set('reason', v)} placeholder="会诊解决的核心问题" multiline /></FieldRow>
      <FieldRow label="协调专员"><TextInput value={data.coordinator} onChange={v => set('coordinator', v)} placeholder="负责协调的健管专员" /></FieldRow>
      <FieldRow label="备注"><TextInput value={data.notes} onChange={v => set('notes', v)} placeholder="其他说明" multiline /></FieldRow>
    </div>
  )
}

function DailyMonitoringFields({ data, set }) {
  return (
    <div style={{ paddingTop: 8 }}>
      {MONITORING_ITEMS.map(item => (
        <FieldRow key={item.key} label={item.label}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Toggle value={!!data[item.key]} onChange={v => set(item.key, v)} />
            <span style={{ fontSize: 12, color: '#8AA89C', flex: 1 }}>{item.desc}</span>
          </div>
        </FieldRow>
      ))}
      <FieldRow label="监测频率"><SelectInput value={data.frequency} onChange={v => set('frequency', v)} options={TIME_OPTIONS} placeholder="请选择频率" /></FieldRow>
      <FieldRow label="其他监测项目"><TextInput value={data.other} onChange={v => set('other', v)} placeholder="自定义监测项目说明" /></FieldRow>
      <FieldRow label="备注"><TextInput value={data.notes} onChange={v => set('notes', v)} placeholder="监测执行说明或特殊要求" multiline /></FieldRow>
    </div>
  )
}

function VaccineFields({ data, set }) {
  return (
    <div style={{ paddingTop: 8 }}>
      {VACCINE_ITEMS.map(item => (
        <FieldRow key={item.key} label={item.label}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Toggle value={!!data[item.key]} onChange={v => set(item.key, v)} />
            <span style={{ fontSize: 12, color: '#8AA89C', flex: 1 }}>{item.desc}</span>
          </div>
          {!!data[item.key] && (
            <div style={{ marginTop: 8, paddingLeft: 46, display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#4A6558', width: 70, flexShrink: 0 }}>计划接种日期</span>
              <div style={{ flex: 1 }}><DateInput value={data[`${item.key}_date`]} onChange={v => set(`${item.key}_date`, v)} /></div>
            </div>
          )}
        </FieldRow>
      ))}
      <FieldRow label="其他疫苗"><TextInput value={data.other} onChange={v => set('other', v)} placeholder="其他需接种的疫苗" /></FieldRow>
      <FieldRow label="备注"><TextInput value={data.notes} onChange={v => set('notes', v)} placeholder="接种禁忌或注意事项" multiline /></FieldRow>
    </div>
  )
}

function LifestyleFields({ data, set }) {
  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ background: '#EFF6FF', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#0077B6' }}>
        💡 通过问卷评估会员当前生活方式，结果将同步到健康档案
      </div>
      {LIFESTYLE_DIMENSIONS.map(dim => (
        <FieldRow key={dim.key} label={dim.label}>
          <Toggle value={!!data[`${dim.key}_assessed`]} onChange={v => set(`${dim.key}_assessed`, v)} label="纳入评估" />
          {data[`${dim.key}_score`] && (
            <span style={{ fontSize: 12, background: '#E8F5EF', color: '#1E6B50', padding: '2px 8px', borderRadius: 10, marginLeft: 12 }}>
              评分：{data[`${dim.key}_score`]}
            </span>
          )}
        </FieldRow>
      ))}
      <FieldRow label="干预目标"><TextInput value={data.goal} onChange={v => set('goal', v)} placeholder="期望改善的生活方式目标" multiline /></FieldRow>
      <FieldRow label="干预计划"><TextInput value={data.plan} onChange={v => set('plan', v)} placeholder="具体干预措施和时间安排" multiline /></FieldRow>
      <FieldRow label="备注"><TextInput value={data.notes} onChange={v => set('notes', v)} placeholder="其他说明" multiline /></FieldRow>
    </div>
  )
}

function CheckupFields({ data, set }) {
  return (
    <div style={{ paddingTop: 8 }}>
      <FieldRow label="功能医学检测">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Toggle value={!!data.functional_medicine} onChange={v => set('functional_medicine', v)} />
          <span style={{ fontSize: 12, color: '#8AA89C', flex: 1 }}>涵盖肠道菌群、氧化应激、激素水平、营养素等深层检测</span>
        </div>
        {!!data.functional_medicine && (
          <div style={{ marginTop: 8 }}><TextInput value={data.functional_medicine_items} onChange={v => set('functional_medicine_items', v)} placeholder="具体检测项目（可多项）" /></div>
        )}
      </FieldRow>
      <FieldRow label="年度体检套餐">
        <Toggle value={!!data.annual_checkup} onChange={v => set('annual_checkup', v)} />
        {!!data.annual_checkup && (
          <div style={{ marginTop: 8 }}><TextInput value={data.checkup_package} onChange={v => set('checkup_package', v)} placeholder="体检套餐名称或内容描述" /></div>
        )}
      </FieldRow>
      <FieldRow label="计划体检日期"><DateInput value={data.checkup_date} onChange={v => set('checkup_date', v)} /></FieldRow>
      <FieldRow label="体检机构"><SelectInput value={data.checkup_hospital} onChange={v => set('checkup_hospital', v)} options={HOSPITAL_OPTIONS} placeholder="请选择体检机构" /></FieldRow>
      <FieldRow label="体检项目"><TextInput value={data.checkup_items} onChange={v => set('checkup_items', v)} placeholder="重点关注的体检项目（如：肿瘤标志物、心血管等）" multiline /></FieldRow>
      <FieldRow label="备注"><TextInput value={data.notes} onChange={v => set('notes', v)} placeholder="其他说明或特殊要求" multiline /></FieldRow>
    </div>
  )
}

function ModulePanel({ module: mod, moduleData, onChange }) {
  const [open, setOpen] = useState(false)
  const data = getModuleData(moduleData, mod.key)
  const enabled = data.enabled !== false
  const set = (field, value) => onChange(mod.key, field, value)

  return (
    <div style={{ border: '1px solid #E0D9CE', borderRadius: 12, overflow: 'visible', marginBottom: 12, background: '#fff' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', cursor: 'pointer', userSelect: 'none', background: open ? '#F9F6F0' : '#fff', borderRadius: open ? '12px 12px 0 0' : 12 }}
        onClick={() => setOpen(v => !v)}
      >
        <span style={{ fontSize: 20, marginRight: 10 }}>{mod.icon}</span>
        <span style={{ flex: 1, fontWeight: 600, fontSize: 15, color: '#1A2B24' }}>{mod.name}</span>
        <div style={{ marginRight: 12 }} onClick={e => { e.stopPropagation(); set('enabled', !enabled) }}>
          <Toggle value={enabled} />
        </div>
        <span style={{ color: '#aaa', fontSize: 13, transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'none' }}>▼</span>
      </div>
      {open && enabled && (
        <div style={{ padding: '0 18px 18px', borderTop: '1px solid #F0EDE7' }}>
          {mod.key === 'medical_treatment' && <MedicalTreatmentFields data={data} set={set} />}
          {mod.key === 'specialist_collab' && <SpecialistCollabFields data={data} set={set} />}
          {mod.key === 'daily_monitoring'  && <DailyMonitoringFields data={data} set={set} />}
          {mod.key === 'vaccine'           && <VaccineFields data={data} set={set} />}
          {mod.key === 'lifestyle'         && <LifestyleFields data={data} set={set} />}
          {mod.key === 'checkup'           && <CheckupFields data={data} set={set} />}
        </div>
      )}
      {open && !enabled && (
        <div style={{ padding: '16px 18px', borderTop: '1px solid #F0EDE7', color: '#aaa', fontSize: 13, textAlign: 'center' }}>
          此模块已停用，点击开关启用
        </div>
      )}
    </div>
  )
}

export default function AnnualPlanPage({ templateMode }) {
  const { id, templateId } = useParams()
  const nav = useNavigate()
  const toast = useToast()

  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [patient, setPatient] = useState(null)
  const [templateName, setTemplateName] = useState('年度管理方案模板')
  const [planType, setPlanType] = useState('')
  const [moduleData, setModuleData] = useState({})
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const loadAll = async () => {
      setLoading(true)
      try {
        if (templateMode) {
          const res = await adminAPI.getAnnualPlanTemplate(templateId)
          if (res.data) {
            setPlanType(res.data.planType || '')
            setModuleData(res.data.moduleData || {})
            setNotes(res.data.notes || '')
            setTemplateName(res.data.name || '年度管理方案模板')
            setYear(res.data.year || currentYear)
          }
        } else {
          const [patRes, planRes] = await Promise.all([
            adminAPI.patientDetail(id),
            adminAPI.getAnnualPlan(id, year),
          ])
          setPatient(patRes.data?.user || patRes.data)
          if (planRes.data) {
            setPlanType(planRes.data.planType || '')
            setModuleData(planRes.data.moduleData || {})
            setNotes(planRes.data.notes || '')
          } else {
            setPlanType(''); setModuleData({}); setNotes('')
          }
        }
        setDirty(false)
      } catch (err) {
        toast('加载失败：' + (err.message || '未知错误'))
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  }, [id, templateId, year, templateMode])

  const handleModuleChange = useCallback((moduleKey, field, value) => {
    setModuleData(prev => setModuleField(prev, moduleKey, field, value))
    setDirty(true)
  }, [])

  const handleSave = async () => {
    if (!planType) { toast('请先选择方案类型'); return }
    setSaving(true)
    try {
      if (templateMode) {
        await adminAPI.saveAnnualPlanTemplate(templateId, { name: templateName, planType, moduleData, notes, year })
        toast('模板已保存')
      } else {
        await adminAPI.saveAnnualPlan(id, { planType, moduleData, notes, year })
        toast('年度方案已保存')
      }
      setDirty(false)
    } catch (err) {
      toast('保存失败：' + (err.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }

  const backPath = templateMode ? '/health-plan-templates' : `/patients/${id}`
  const patientName = patient?.name || '会员'

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '24px 20px 80px' }}>
      {/* 顶部导航 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => nav(backPath)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#4A6558', padding: 4 }}>
          ←
        </button>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#1A2B24' }}>年度健康管理方案</div>
          {templateMode ? (
            <input
              value={templateName}
              onChange={e => { setTemplateName(e.target.value); setDirty(true) }}
              style={{ fontSize: 13, color: '#8AA89C', marginTop: 2, border: 'none', outline: 'none', background: 'transparent', width: 220, padding: 0 }}
              placeholder="模板名称"
            />
          ) : (
            <div style={{ fontSize: 13, color: '#8AA89C', marginTop: 2 }}>{patientName}</div>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ padding: '6px 10px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, background: '#fff' }}>
            {[currentYear - 1, currentYear, currentYear + 1].map(y => (
              <option key={y} value={y}>{y}年</option>
            ))}
          </select>
          {dirty && <span style={{ fontSize: 12, color: '#D97706', background: '#FEF9EC', padding: '4px 8px', borderRadius: 20 }}>有未保存更改</span>}
          <button onClick={handleSave} disabled={saving}
            style={{ background: '#1E6B50', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? '保存中...' : '保存方案'}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>加载中...</div>
      ) : (
        <>
          {/* 方案类型选择 */}
          <div style={{ background: '#fff', borderRadius: 12, padding: '20px', marginBottom: 20, border: '1px solid #E0D9CE' }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24', marginBottom: 14 }}>选择方案类型</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {PLAN_TYPES.map(pt => (
                <div key={pt.key} onClick={() => { setPlanType(pt.key); setDirty(true) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                    border: `2px solid ${planType === pt.key ? pt.color : '#E0D9CE'}`,
                    background: planType === pt.key ? pt.bg : '#fff',
                    transition: 'all 0.15s',
                  }}>
                  <span style={{ fontSize: 22 }}>{pt.icon}</span>
                  <div style={{ fontWeight: 600, fontSize: 14, color: planType === pt.key ? pt.color : '#1A2B24' }}>{pt.name}</div>
                  {planType === pt.key && <span style={{ marginLeft: 'auto', color: pt.color, fontSize: 18 }}>✓</span>}
                </div>
              ))}
            </div>
          </div>

          {/* 六大模块 */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24', marginBottom: 12 }}>配置管理模块</div>
            {MODULES.map(mod => (
              <ModulePanel key={mod.key} module={mod} moduleData={moduleData} onChange={handleModuleChange} />
            ))}
          </div>

          {/* 整体备注 */}
          <div style={{ background: '#fff', borderRadius: 12, padding: '20px', border: '1px solid #E0D9CE', marginBottom: 20 }}>
            <div style={{ fontWeight: 600, fontSize: 15, color: '#1A2B24', marginBottom: 12 }}>整体备注</div>
            <textarea value={notes} onChange={e => { setNotes(e.target.value); setDirty(true) }}
              placeholder="年度方案的整体说明、注意事项或特别叮嘱..."
              rows={4}
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #E0D9CE', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          </div>

          {/* 底部保存 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button onClick={() => nav(backPath)}
              style={{ background: '#fff', color: '#666', border: '1px solid #ddd', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
              {templateMode ? '返回方案列表' : '返回会员详情'}
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ background: '#1E6B50', color: '#fff', border: 'none', padding: '10px 28px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
              {saving ? '保存中...' : '保存年度方案'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
