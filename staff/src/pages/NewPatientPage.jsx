import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'

const DISEASE_TAGS = ['高血压', '糖尿病', '高血脂', '高尿酸', '脂肪肝', '睡眠呼吸暂停', '冠心病', '慢性肾病', '慢阻肺', '骨质疏松', '痛风', '甲状腺疾病']
const SOURCE_OPTIONS = ['主动咨询', '健康讲座', '员工福利', '家属推荐', '医院转诊', '线上推广', '其他']

export default function NewPatientPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [staffList, setStaffList] = useState([])
  const [selectedDiseases, setSelectedDiseases] = useState([])
  const [patientCategory, setPatientCategory] = useState('adult') // 'adult' | 'child'

  const [form, setForm] = useState({
    // 基本
    name: '', phone: '', gender: '未知', birthDate: '', age: '',
    height: '', weight: '',
    // 身份
    idNumber: '', maritalStatus: '', ethnicity: '', belief: '', memberType: '',
    // 联系
    address: '', contactPhone: '', contactPhone2: '', contactName: '', contactPhone3: '',
    deliveryAddress: '',
    // 职业
    workplace: '', occupation: '',
    // 血型
    bloodTypeABO: '', bloodTypeRH: '',
    // 过敏史
    drugAllergy: '', foodAllergy: '',
    // 既往史
    traumaHistory: '', transfusionHistory: '', infectiousHistory: '', vaccinationHistory: '',
    // 生活史
    smoking: '', drinking: '', exercise: '',
    // 管理
    source: '', patientType: '', remark: '',
    assignedHealthManager: '', assignedFamilyDoctor: '',
    // 女性
    menstrualHistory: '', maritalHistory: '',
    // 儿童
    childProfile: {
      motherAge: '', gravida: '', para: '',
      motherPregnancyStatus: '', deliveryComplications: '',
      gestationalWeeks: '', birthWeight: '', birthLength: '',
      birthHeadCirc: '', birthChestCirc: '',
      deliveryMode: '', apgar1min: '', apgar5min: '',
      neonatalConditions: '', birthDefects: '',
      hearingScreening: '', eyeScreening: '',
      fatherHeight: '', motherHeight: '',
      familyAllergyHistory: '',
    },
  })

  useEffect(() => { staffAPI.getStaffList().then(r => setStaffList(r.data)).catch(() => {}) }, [])

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const setChild = k => e => setForm(f => ({ ...f, childProfile: { ...f.childProfile, [k]: e.target.value } }))
  const toggleDisease = d => setSelectedDiseases(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.phone) return toast('手机号不能为空')
    if (!/^1[3-9]\d{9}$/.test(form.phone)) return toast('手机号格式不正确')
    setSaving(true)
    try {
      const payload = {
        ...form,
        patientCategory,
        age: form.age ? Number(form.age) : undefined,
        height: form.height ? Number(form.height) : undefined,
        weight: form.weight ? Number(form.weight) : undefined,
        chronicDiseases: selectedDiseases,
        assignedHealthManager: form.assignedHealthManager || undefined,
        assignedFamilyDoctor: form.assignedFamilyDoctor || undefined,
      }
      if (patientCategory === 'child') {
        // 清理儿童档案数字字段
        const cp = { ...payload.childProfile }
        ;['motherAge','gravida','para','gestationalWeeks','birthWeight','birthLength','birthHeadCirc','birthChestCirc','apgar1min','apgar5min','fatherHeight','motherHeight'].forEach(k => {
          if (cp[k]) cp[k] = Number(cp[k])
          else delete cp[k]
        })
        payload.childProfile = cp
      } else {
        delete payload.childProfile
      }
      const res = await staffAPI.createPatient(payload)
      toast('患者创建成功')
      nav(`/patients/${res.data._id}`, { replace: true })
    } catch (err) { toast(err.message || '创建失败') }
    finally { setSaving(false) }
  }

  const healthManagers = staffList.filter(s => s.role === 'healthManager')
  const familyDoctors  = staffList.filter(s => s.role === 'familyDoctor')
  const isChild = patientCategory === 'child'
  const isFemale = form.gender === '女'

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">新增患者</h1><p className="page-subtitle">完整录入患者档案</p></div>
        <button className="btn btn-secondary" onClick={() => nav(-1)}>← 返回</button>
      </div>

      {/* 患者类型选择 */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>患者类型：</span>
          {[{ v: 'adult', l: '成人' }, { v: 'child', l: '儿童（0-18岁）' }].map(opt => (
            <button key={opt.v} type="button"
              onClick={() => setPatientCategory(opt.v)}
              style={{ padding: '8px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, border: `2px solid ${patientCategory === opt.v ? '#1E6B50' : '#E0D9CE'}`, background: patientCategory === opt.v ? '#E8F5EF' : '#fff', color: patientCategory === opt.v ? '#1E6B50' : '#4A6558' }}
            >{opt.l}</button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* 基本信息 */}
          <Section title="基本信息">
            <Grid>
              <F label="姓名 *" span={2}><input className="form-input" placeholder="真实姓名" value={form.name} onChange={set('name')} required /></F>
              <F label="手机号 *" span={2}><input className="form-input" placeholder={isChild ? '监护人手机号（作为登录账号）' : '手机号（登录账号）'} value={form.phone} onChange={set('phone')} required /></F>
              <F label="性别"><select className="form-input" value={form.gender} onChange={set('gender')}><option value="未知">未知</option><option value="男">男</option><option value="女">女</option></select></F>
              <F label="出生日期"><input className="form-input" type="date" value={form.birthDate} onChange={set('birthDate')} /></F>
              <F label="年龄"><input className="form-input" type="number" placeholder="岁" value={form.age} onChange={set('age')} min={0} max={150} /></F>
              <F label="身份证号"><input className="form-input" placeholder={isChild ? '可选' : '可选'} value={form.idNumber} onChange={set('idNumber')} /></F>
              <F label="身高(cm)"><input className="form-input" type="number" value={form.height} onChange={set('height')} /></F>
              <F label="体重(kg)"><input className="form-input" type="number" value={form.weight} onChange={set('weight')} /></F>
              {!isChild && <>
                <F label="婚姻状况"><select className="form-input" value={form.maritalStatus} onChange={set('maritalStatus')}><option value="">未填写</option><option>未婚</option><option>已婚</option><option>离异</option><option>丧偶</option></select></F>
                <F label="民族"><input className="form-input" placeholder="如：汉族" value={form.ethnicity} onChange={set('ethnicity')} /></F>
                <F label="信仰"><input className="form-input" placeholder="宗教信仰" value={form.belief} onChange={set('belief')} /></F>
                <F label="会员类型"><input className="form-input" placeholder="如：年度会员" value={form.memberType} onChange={set('memberType')} /></F>
                <F label="工作单位" span={2}><input className="form-input" value={form.workplace} onChange={set('workplace')} /></F>
                <F label="工作岗位"><input className="form-input" value={form.occupation} onChange={set('occupation')} /></F>
              </>}
            </Grid>
          </Section>

          {/* 联系信息 */}
          <Section title="联系信息">
            <Grid>
              <F label="联系电话" span={2}><input className="form-input" placeholder="与登录手机号可不同" value={form.contactPhone} onChange={set('contactPhone')} /></F>
              <F label="联系地址" span={2}><input className="form-input" value={form.address} onChange={set('address')} /></F>
              <F label="联系人"><input className="form-input" value={form.contactName} onChange={set('contactName')} /></F>
              <F label="联系人电话"><input className="form-input" value={form.contactPhone3} onChange={set('contactPhone3')} /></F>
              <F label="紧急联系电话" span={2}><input className="form-input" value={form.contactPhone2} onChange={set('contactPhone2')} /></F>
              <F label="配送地址（快递）" span={2}><input className="form-input" value={form.deliveryAddress} onChange={set('deliveryAddress')} /></F>
            </Grid>
          </Section>

          {/* 血型 & 过敏 */}
          <Section title="血型与过敏史">
            <Grid>
              <F label="ABO血型"><select className="form-input" value={form.bloodTypeABO} onChange={set('bloodTypeABO')}><option value="">未知</option><option>A</option><option>B</option><option>O</option><option>AB</option></select></F>
              <F label="RH血型"><select className="form-input" value={form.bloodTypeRH} onChange={set('bloodTypeRH')}><option value="">未知</option><option>阳性</option><option>阴性</option></select></F>
              <F label="药物过敏史" span={2}><textarea className="form-input" rows={2} value={form.drugAllergy} onChange={set('drugAllergy')} /></F>
              <F label="食物过敏史" span={2}><textarea className="form-input" rows={2} value={form.foodAllergy} onChange={set('foodAllergy')} /></F>
            </Grid>
          </Section>

          {/* 慢病标签 */}
          <Section title="慢病标签">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {DISEASE_TAGS.map(d => (
                <button key={d} type="button" onClick={() => toggleDisease(d)} style={{ padding: '4px 14px', borderRadius: 99, fontSize: 13, cursor: 'pointer', border: `1px solid ${selectedDiseases.includes(d) ? '#e74c3c' : '#E0D9CE'}`, background: selectedDiseases.includes(d) ? '#e74c3c' : '#f9f7f3', color: selectedDiseases.includes(d) ? '#fff' : '#4A6558' }}>{d}</button>
              ))}
            </div>
          </Section>

          {!isChild && (
            <Section title="既往史">
              <Grid>
                <F label="外伤史" span={2}><textarea className="form-input" rows={2} value={form.traumaHistory} onChange={set('traumaHistory')} /></F>
                <F label="输血史" span={2}><textarea className="form-input" rows={2} value={form.transfusionHistory} onChange={set('transfusionHistory')} /></F>
                <F label="传染病史" span={2}><textarea className="form-input" rows={2} value={form.infectiousHistory} onChange={set('infectiousHistory')} /></F>
                <F label="预防接种史" span={2}><textarea className="form-input" rows={2} value={form.vaccinationHistory} onChange={set('vaccinationHistory')} /></F>
              </Grid>
            </Section>
          )}

          {!isChild && (
            <Section title="生活方式">
              <Grid>
                <F label="吸烟史" span={2}><input className="form-input" placeholder="如：不吸烟 / 每天10支" value={form.smoking} onChange={set('smoking')} /></F>
                <F label="饮酒史" span={2}><input className="form-input" placeholder="如：偶尔饮酒" value={form.drinking} onChange={set('drinking')} /></F>
                <F label="运动习惯" span={2}><input className="form-input" placeholder="如：每周跑步3次" value={form.exercise} onChange={set('exercise')} /></F>
              </Grid>
            </Section>
          )}

          {!isChild && isFemale && (
            <Section title="女性健康（仅女性）">
              <Grid>
                <F label="月经史" span={2}><textarea className="form-input" rows={2} placeholder="初潮、周期、经期、末次月经等" value={form.menstrualHistory} onChange={set('menstrualHistory')} /></F>
                <F label="婚育史" span={2}><textarea className="form-input" rows={2} placeholder="孕产次、分娩方式、流产史等" value={form.maritalHistory} onChange={set('maritalHistory')} /></F>
              </Grid>
            </Section>
          )}

          {/* 儿童专属：围产情况 */}
          {isChild && (
            <Section title="围产情况（儿童专属）" span={2}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                  { label:'母亲孕龄（岁）', key:'motherAge', type:'number' },
                  { label:'胎次', key:'gravida', type:'number' },
                  { label:'产次', key:'para', type:'number' },
                  { label:'出生孕周（周）', key:'gestationalWeeks', type:'number' },
                  { label:'出生体重（g）', key:'birthWeight', type:'number' },
                  { label:'出生身长（cm）', key:'birthLength', type:'number' },
                  { label:'出生头围（cm）', key:'birthHeadCirc', type:'number' },
                  { label:'出生胸围（cm）', key:'birthChestCirc', type:'number' },
                  { label:'Apgar 1分钟', key:'apgar1min', type:'number' },
                  { label:'Apgar 5分钟', key:'apgar5min', type:'number' },
                  { label:'父亲身高（cm）', key:'fatherHeight', type:'number' },
                  { label:'母亲身高（cm）', key:'motherHeight', type:'number' },
                ].map(f => (
                  <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>{f.label}</label>
                    <input className="form-input" type={f.type} value={form.childProfile[f.key]} onChange={setChild(f.key)} />
                  </div>
                ))}
                {[
                  { label:'分娩方式', key:'deliveryMode', placeholder:'顺产/剖宫产/产钳' },
                  { label:'母亲妊娠期健康', key:'motherPregnancyStatus', placeholder:'正常/并发症描述' },
                  { label:'产时并发症', key:'deliveryComplications', placeholder:'有/无，具体' },
                  { label:'新生儿期患病', key:'neonatalConditions', placeholder:'黄疸/感染等' },
                  { label:'出生缺陷', key:'birthDefects', placeholder:'有/无，具体' },
                  { label:'家族过敏史', key:'familyAllergyHistory', placeholder:'有/无，具体' },
                ].map(f => (
                  <div key={f.key} className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>{f.label}</label>
                    <input className="form-input" placeholder={f.placeholder} value={form.childProfile[f.key]} onChange={setChild(f.key)} />
                  </div>
                ))}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>听力筛查</label>
                  <select className="form-input" value={form.childProfile.hearingScreening} onChange={setChild('hearingScreening')}>
                    <option value="">未填写</option><option>通过</option><option>未通过</option><option>未查</option>
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>眼底筛查</label>
                  <input className="form-input" value={form.childProfile.eyeScreening} onChange={setChild('eyeScreening')} placeholder="正常/异常" />
                </div>
              </div>
            </Section>
          )}

          {/* 管理信息 */}
          <Section title="管理信息">
            <Grid>
              <F label="健管专员" span={2}><select className="form-input" value={form.assignedHealthManager} onChange={set('assignedHealthManager')}><option value="">-- 未分配 --</option>{healthManagers.map(s => <option key={s._id} value={s._id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}</select></F>
              <F label="家庭医生" span={2}><select className="form-input" value={form.assignedFamilyDoctor} onChange={set('assignedFamilyDoctor')}><option value="">-- 未分配 --</option>{familyDoctors.map(s => <option key={s._id} value={s._id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}</select></F>
              <F label="患者来源"><select className="form-input" value={form.source} onChange={set('source')}><option value="">未填写</option>{SOURCE_OPTIONS.map(s => <option key={s}>{s}</option>)}</select></F>
              <F label="患者类型"><select className="form-input" value={form.patientType} onChange={set('patientType')}><option value="">普通</option><option value="vip">VIP</option><option value="trial">试用</option></select></F>
              <F label="备注" span={2}><textarea className="form-input" rows={3} value={form.remark} onChange={set('remark')} style={{ resize: 'vertical' }} /></F>
            </Grid>
          </Section>

        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={() => nav(-1)}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '保存中...' : '保存患者'}</button>
        </div>
      </form>
    </div>
  )
}

// ── 辅助组件 ─────────────────────────────────────────────
function Section({ title, children, span }) {
  return (
    <div className="card" style={{ gridColumn: span ? `span ${span}` : undefined }}>
      <div className="card-header"><div className="card-title">{title}</div></div>
      <div className="card-body">{children}</div>
    </div>
  )
}

function Grid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>{children}</div>
}

function F({ label, children, span }) {
  return (
    <div className="form-group" style={{ gridColumn: span > 1 ? `span ${span}` : undefined, marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      {children}
    </div>
  )
}
