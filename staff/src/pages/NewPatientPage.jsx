import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'

const DISEASE_TAGS = ['高血压', '糖尿病', '高血脂', '高尿酸', '脂肪肝', '睡眠呼吸暂停', '冠心病', '慢性肾病', '慢阻肺', '骨质疏松', '痛风', '甲状腺疾病']
const SOURCE_OPTIONS = ['主动咨询', '健康讲座', '员工福利', '家属推荐', '医院转诊', '线上推广', '其他']
const MEMBER_TYPE_OPTIONS = ['优享', '悦享', '尊享', '卓越']

// 中国56个民族
const ETHNICITY_LIST = [
  '汉族','壮族','满族','回族','苗族','维吾尔族','土家族','彝族','蒙古族','藏族',
  '布依族','侗族','瑶族','朝鲜族','白族','哈尼族','哈萨克族','黎族','傣族','畲族',
  '傈僳族','仡佬族','东乡族','高山族','拉祜族','水族','佤族','纳西族','羌族','土族',
  '仫佬族','锡伯族','柯尔克孜族','达斡尔族','景颇族','毛南族','撒拉族','布朗族','塔吉克族',
  '阿昌族','普米族','鄂温克族','怒族','京族','基诺族','德昂族','保安族','俄罗斯族',
  '裕固族','乌孜别克族','门巴族','鄂伦春族','独龙族','塔塔尔族','赫哲族','珞巴族','其他',
]

// 身份证号解析：返回 { birthDate, gender } 或 null
function parseIdCard(id) {
  id = id.trim()
  if (id.length === 18) {
    const birthDate = `${id.slice(6,10)}-${id.slice(10,12)}-${id.slice(12,14)}`
    const gender = parseInt(id[16]) % 2 === 1 ? '男' : '女'
    return { birthDate, gender }
  }
  if (id.length === 15) {
    const birthDate = `19${id.slice(6,8)}-${id.slice(8,10)}-${id.slice(10,12)}`
    const gender = parseInt(id[14]) % 2 === 1 ? '男' : '女'
    return { birthDate, gender }
  }
  return null
}

// 校验身份证格式
function validateIdCard(id) {
  if (!id) return true // 非必填
  id = id.trim()
  if (id.length === 15) return /^\d{15}$/.test(id)
  if (id.length !== 18) return false
  if (!/^\d{17}[\dXx]$/.test(id)) return false
  // 校验码
  const w = [7,9,10,5,8,4,2,1,6,3,7,9,10,5,8,4,2]
  const c = '10X98765432'
  const sum = Array.from(id.slice(0,17)).reduce((s, d, i) => s + d * w[i], 0)
  return c[sum % 11] === id[17].toUpperCase()
}

// 根据出生日期计算周岁
function calcAge(birthDate) {
  if (!birthDate) return ''
  const today = new Date()
  const birth = new Date(birthDate)
  if (isNaN(birth)) return ''
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age >= 0 ? String(age) : ''
}

export default function NewPatientPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [staffList, setStaffList] = useState([])
  const [selectedDiseases, setSelectedDiseases] = useState([])
  const [patientCategory, setPatientCategory] = useState('adult')
  const [idError, setIdError] = useState('')
  const [birthDateError, setBirthDateError] = useState('')
  const [ethnicitySearch, setEthnicitySearch] = useState('')
  const [showEthnicityList, setShowEthnicityList] = useState(false)

  const [form, setForm] = useState({
    // 基本
    name: '', phone: '', gender: '未知', birthDate: '', age: '',
    height: '', weight: '',
    // 身份
    idNumber: '', maritalStatus: '', ethnicity: '', belief: '', memberType: '',
    // 联系
    address: '', contactPhone: '', contactPhone2: '', contactName: '', contactPhone3: '',
    deliveryAddress: '',
    // 职业与教育
    workplace: '', occupation: '', education: '', hasAnnualCheckup: '',
    // 血型
    bloodTypeABO: '', bloodTypeRH: '',
    // 过敏史
    drugAllergy: '', foodAllergy: '',
    // 既往史
    pastHistory: '', medicHistory: '', surgeryHistory: '',
    traumaHistory: '', transfusionHistory: '', poisoningHistory: '',
    infectiousHistory: '', vaccinationHistory: '', otherDiseaseHistory: '',
    supplementHistory: '',
    // 生活史
    lifestyle: { diet: '', exercise: '', sleep: '', water: '', alcohol: '', smoking: '', bowel: '', mood: '' },
    // 管理
    source: '', remark: '',
    assignedHealthManager: '', assignedFamilyDoctor: '', assignedNutritionist: '',
    servicePackage: '', serviceStartDate: '', serviceExpiry: '',
    // 初始健康数据（建档时预填，用户首次登录即可见）
    initialBloodPressure: '', initialHeartRate: '', initialWeight: '', initialSleepHours: '', initialMoodScore: '',
    // 家族史
    familyHistoryNote: '',
    // 女性
    menstrualHistory: '', maritalHistory: '', sexualHistory: '',
    // 其他健康信息（近期状态）
    recentSymptoms: [], recentMedication: '', recentSupplement: '',
    // 健康需求
    healthConcern: '', healthConcernFor: '', expectedService: '',
    hasHomeMonitor: '', hasMedicineCabinet: '',
    // 医疗保障
    basic_insurance: '', commercial_medical: '', critical_illness: '',
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
  const setLifestyle = k => e => setForm(f => ({ ...f, lifestyle: { ...f.lifestyle, [k]: e.target.value } }))
  const toggleDisease = d => setSelectedDiseases(p => p.includes(d) ? p.filter(x => x !== d) : [...p, d])
  const toggleCommercial = v => setForm(f => {
    const arr = f.commercial_medical.includes(v) ? f.commercial_medical.filter(x => x !== v) : [...f.commercial_medical, v]
    return { ...f, commercial_medical: arr }
  })

  // 出生日期变化 → 自动计算年龄 + 校验
  const handleBirthDateChange = e => {
    const val = e.target.value
    setBirthDateError('')
    if (val) {
      const year = parseInt(val.split('-')[0])
      const now = new Date().getFullYear()
      if (isNaN(year) || year < 1900 || year > now) {
        setBirthDateError(`年份须在 1900–${now} 之间`)
      }
    }
    setForm(f => ({ ...f, birthDate: val, age: calcAge(val) }))
  }

  // 身份证号输入 → 校验 + 自动填充
  const handleIdNumberChange = e => {
    const val = e.target.value
    setForm(f => ({ ...f, idNumber: val }))
    setIdError('')
    if (val.length === 15 || val.length === 18) {
      if (!validateIdCard(val)) {
        setIdError('身份证号格式或校验码不正确')
        return
      }
      const parsed = parseIdCard(val)
      if (parsed) {
        const age = calcAge(parsed.birthDate)
        setForm(f => ({
          ...f,
          idNumber: val,
          birthDate: parsed.birthDate,
          age,
          gender: parsed.gender,
        }))
      }
    }
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.phone) return toast('手机号不能为空')
    if (!/^1[3-9]\d{9}$/.test(form.phone)) return toast('手机号格式不正确')
    if (form.idNumber && !validateIdCard(form.idNumber)) return toast('身份证号格式不正确')
    if (form.birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.birthDate)) return toast('出生日期格式须为 YYYY-MM-DD')
    setSaving(true)
    try {
      const payload = {
        ...form,
        patientCategory,
        age: form.age ? Number(form.age) : undefined,
        height: form.height ? Number(form.height) : undefined,
        weight: form.weight ? Number(form.weight) : undefined,
        chronicDiseases: selectedDiseases,
        commercial_medical: form.commercial_medical,
        assignedHealthManager: form.assignedHealthManager || undefined,
        assignedFamilyDoctor:  form.assignedFamilyDoctor  || undefined,
        assignedNutritionist:  form.assignedNutritionist  || undefined,
        // 健康档案字段上移到 healthProfile
        healthProfile: {
          drugAllergy: form.drugAllergy,
          foodAllergy: form.foodAllergy,
          menstrualHistory: form.menstrualHistory,
          maritalHistory: form.maritalHistory,
          sexualHistory: form.sexualHistory,
          pastHistory: form.pastHistory,
          medicHistory: form.medicHistory,
          surgeryHistory: form.surgeryHistory,
          familyHistoryNote: form.familyHistoryNote,
          supplementHistory: form.supplementHistory,
          recentSymptoms: form.recentSymptoms,
          recentMedication: form.recentMedication,
          recentSupplement: form.recentSupplement,
        },
      }
      // 清理不再单独传的字段（避免重复）
      delete payload.drugAllergy
      delete payload.foodAllergy
      delete payload.menstrualHistory
      delete payload.maritalHistory
      delete payload.sexualHistory
      delete payload.pastHistory
      delete payload.medicHistory
      delete payload.surgeryHistory
      delete payload.supplementHistory
      delete payload.recentSymptoms
      delete payload.recentMedication
      delete payload.recentSupplement

      if (patientCategory === 'child') {
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
      toast('会员创建成功')
      nav(`/patients/${res.data._id}`, { replace: true })
    } catch (err) { toast(err.message || '创建失败') }
    finally { setSaving(false) }
  }

  const healthManagers = staffList.filter(s => s.role === 'healthManager')
  const familyDoctors  = staffList.filter(s => s.role === 'familyDoctor')
  const nutritionists  = staffList.filter(s => s.role === 'nutritionist')
  const isChild = patientCategory === 'child'
  const isFemale = form.gender === '女'

  const filteredEthnicities = ethnicitySearch
    ? ETHNICITY_LIST.filter(e => e.includes(ethnicitySearch))
    : ETHNICITY_LIST

  return (
    <div className="page">
      <div className="page-header">
        <div><h1 className="page-title">新增会员</h1><p className="page-subtitle">完整录入会员档案</p></div>
        <button className="btn btn-secondary" onClick={() => nav(-1)}>← 返回</button>
      </div>

      {/* 会员类型选择（成人/儿童） */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>档案类型：</span>
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
              <F label="出生日期">
                <input className="form-input" type="date" value={form.birthDate}
                  onChange={handleBirthDateChange}
                  max={new Date().toISOString().slice(0, 10)}
                  min="1900-01-01" />
                {birthDateError && <div style={{ color: '#DC3545', fontSize: 12, marginTop: 4 }}>{birthDateError}</div>}
              </F>
              <F label="年龄（岁）"><input className="form-input" type="number" placeholder="自动计算" value={form.age} onChange={set('age')} min={0} max={150} readOnly={!!form.birthDate} style={{ background: form.birthDate ? '#f5f5f5' : undefined }} /></F>
              <F label="身份证号">
                <input className="form-input" placeholder="输入后自动识别性别和出生日期" value={form.idNumber} onChange={handleIdNumberChange} maxLength={18} />
                {idError && <div style={{ color: '#DC3545', fontSize: 12, marginTop: 4 }}>{idError}</div>}
              </F>
              <F label="身高(cm)"><input className="form-input" type="number" value={form.height} onChange={set('height')} /></F>
              <F label="体重(kg)"><input className="form-input" type="number" value={form.weight} onChange={set('weight')} /></F>
              {!isChild && <>
                <F label="婚姻状况"><select className="form-input" value={form.maritalStatus} onChange={set('maritalStatus')}><option value="">未填写</option><option>未婚</option><option>已婚</option><option>离异</option><option>丧偶</option></select></F>
                {/* 民族：可搜索下拉 */}
                <F label="民族">
                  <div style={{ position: 'relative' }}>
                    <input
                      className="form-input"
                      placeholder="搜索或选择民族"
                      value={form.ethnicity}
                      onChange={e => { setForm(f => ({ ...f, ethnicity: e.target.value })); setEthnicitySearch(e.target.value); setShowEthnicityList(true) }}
                      onFocus={() => setShowEthnicityList(true)}
                      onBlur={() => setTimeout(() => setShowEthnicityList(false), 150)}
                      autoComplete="off"
                    />
                    {showEthnicityList && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #E0D9CE', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', maxHeight: 180, overflowY: 'auto', marginTop: 2 }}>
                        {filteredEthnicities.map(eth => (
                          <div key={eth} onMouseDown={() => { setForm(f => ({ ...f, ethnicity: eth })); setEthnicitySearch(''); setShowEthnicityList(false) }}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f5f5f5' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f9f7f3'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                            {eth}
                          </div>
                        ))}
                        {filteredEthnicities.length === 0 && (
                          <div style={{ padding: '8px 12px', color: '#aaa', fontSize: 13 }}>未找到，可直接输入</div>
                        )}
                      </div>
                    )}
                  </div>
                </F>
                <F label="信仰"><input className="form-input" placeholder="宗教信仰" value={form.belief} onChange={set('belief')} /></F>
                <F label="所在企业" span={2}><input className="form-input" value={form.workplace} onChange={set('workplace')} /></F>
                <F label="所在行业"><input className="form-input" value={form.occupation} onChange={set('occupation')} /></F>
                <F label="学历">
                  <select className="form-input" value={form.education} onChange={set('education')}>
                    <option value="">未填写</option>
                    {['小学','初中','高中','大专','本科','硕士','博士'].map(v => <option key={v}>{v}</option>)}
                  </select>
                </F>
                <F label="是否每年健康体检" span={2}>
                  <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                    {['是','否'].map(v => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                        <input type="radio" name="hasAnnualCheckup" value={v} checked={form.hasAnnualCheckup === v} onChange={() => setForm(f => ({ ...f, hasAnnualCheckup: v }))} />{v}
                      </label>
                    ))}
                  </div>
                </F>
              </>}
            </Grid>
          </Section>

          {/* 联系信息 */}
          <Section title="联系信息">
            <Grid>
              <F label="联系电话" span={2}><input className="form-input" placeholder="与登录手机号可不同" value={form.contactPhone} onChange={set('contactPhone')} /></F>
              <F label="联系地址" span={2}><input className="form-input" value={form.address} onChange={set('address')} /></F>
              <F label="紧急联系人"><input className="form-input" placeholder="紧急联系人姓名" value={form.contactName} onChange={set('contactName')} /></F>
              <F label="紧急联系人电话"><input className="form-input" value={form.contactPhone2} onChange={set('contactPhone2')} /></F>
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
            <Section title="既往史" span={2}>
              <Grid>
                <F label="既往史" span={2}><textarea className="form-input" rows={2} placeholder="如：高血压病史10年" value={form.pastHistory} onChange={set('pastHistory')} /></F>
                <F label="是否长期服用中药或西药" span={2}><textarea className="form-input" rows={2} placeholder="是/否，是则填写具体药物名称" value={form.medicHistory} onChange={set('medicHistory')} /></F>
                <F label="是否有长期服用营养补剂" span={2}><textarea className="form-input" rows={2} placeholder="是/否，是则填写具体补剂名称" value={form.supplementHistory} onChange={set('supplementHistory')} /></F>
                <F label="手术史" span={2}><textarea className="form-input" rows={2} placeholder="如：2010年阑尾切除术" value={form.surgeryHistory} onChange={set('surgeryHistory')} /></F>
                <F label="家族史" span={2}><textarea className="form-input" rows={2} placeholder="如：父亲有高血压、糖尿病，母亲有乳腺癌" value={form.familyHistoryNote} onChange={set('familyHistoryNote')} /></F>
                <F label="外伤史" span={2}><textarea className="form-input" rows={2} value={form.traumaHistory} onChange={set('traumaHistory')} /></F>
                <F label="输血史" span={2}><textarea className="form-input" rows={2} value={form.transfusionHistory} onChange={set('transfusionHistory')} /></F>
                <F label="中毒史" span={2}><textarea className="form-input" rows={2} value={form.poisoningHistory} onChange={set('poisoningHistory')} /></F>
                <F label="传染病史" span={2}><textarea className="form-input" rows={2} value={form.infectiousHistory} onChange={set('infectiousHistory')} /></F>
                <F label="预防接种史" span={2}><textarea className="form-input" rows={2} value={form.vaccinationHistory} onChange={set('vaccinationHistory')} /></F>
                <F label="其他特殊疾病史" span={2}><textarea className="form-input" rows={2} placeholder="如：自身免疫病、罕见病等" value={form.otherDiseaseHistory} onChange={set('otherDiseaseHistory')} /></F>
              </Grid>
            </Section>
          )}

          {!isChild && (
            <Section title="生活方式">
              <Grid>
                <F label="饮食习惯" span={2}><input className="form-input" placeholder="如：清淡为主" value={form.lifestyle.diet} onChange={setLifestyle('diet')} /></F>
                <F label="运动习惯" span={2}><input className="form-input" placeholder="如：每周跑步3次" value={form.lifestyle.exercise} onChange={setLifestyle('exercise')} /></F>
                <F label="睡眠习惯" span={2}><input className="form-input" placeholder="如：23:00入睡，7小时" value={form.lifestyle.sleep} onChange={setLifestyle('sleep')} /></F>
                <F label="饮水情况"><input className="form-input" placeholder="如：每日2000ml" value={form.lifestyle.water} onChange={setLifestyle('water')} /></F>
                <F label="吸烟情况"><input className="form-input" placeholder="如：不吸烟" value={form.lifestyle.smoking} onChange={setLifestyle('smoking')} /></F>
                <F label="饮酒情况"><input className="form-input" placeholder="如：偶尔饮酒" value={form.lifestyle.alcohol} onChange={setLifestyle('alcohol')} /></F>
                <F label="排便情况"><input className="form-input" placeholder="如：每日1次，成形" value={form.lifestyle.bowel} onChange={setLifestyle('bowel')} /></F>
                <F label="情绪状态（初始记录）" span={2}><input className="form-input" placeholder="如：情绪稳定，偶有焦虑" value={form.lifestyle.mood} onChange={setLifestyle('mood')} /></F>
              </Grid>
            </Section>
          )}

          {!isChild && isFemale && (
            <Section title="女性健康（仅女性）">
              <Grid>
                <F label="是否有性生活史" span={2}>
                  <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                    {['是','否'].map(v => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                        <input type="radio" name="sexualHistory" value={v} checked={form.sexualHistory === v} onChange={() => setForm(f => ({ ...f, sexualHistory: v }))} />{v}
                      </label>
                    ))}
                  </div>
                </F>
                <F label="月经史" span={2}><textarea className="form-input" rows={2} placeholder="初潮、周期、经期、末次月经等" value={form.menstrualHistory} onChange={set('menstrualHistory')} /></F>
                <F label="生育史" span={2}><textarea className="form-input" rows={2} placeholder="孕产次、分娩方式、流产史等" value={form.maritalHistory} onChange={set('maritalHistory')} /></F>
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

          {/* 其他健康信息（仅成人） */}
          {!isChild && (
            <Section title="其他健康信息" span={2}>
              <Grid>
                <F label="最近3个月是否有以下躯体症状" span={2}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                    {(() => {
                      const symptoms = form.recentSymptoms || []
                      const noSymptom = symptoms.includes('无躯体症状')
                      const otherEntry = symptoms.find(s => s.startsWith('其他'))
                      const otherText = otherEntry ? otherEntry.replace(/^其他[:：]?/, '') : ''
                      const OPTS = ['头痛','头晕','胸闷','乏力','失眠','焦虑/抑郁','消化不良','关节疼痛','皮肤问题']
                      const updateSymptoms = next => setForm(f => ({ ...f, recentSymptoms: next }))
                      return (
                        <>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 20, border: `1px solid ${noSymptom ? '#1E6B50' : '#E0D9CE'}`, background: noSymptom ? '#E8F5EF' : '#fff', color: noSymptom ? '#1E6B50' : '#4A6558' }}>
                            <input type="checkbox" style={{ display: 'none' }} checked={noSymptom}
                              onChange={e => updateSymptoms(e.target.checked ? ['无躯体症状'] : [])} />
                            无躯体症状
                          </label>
                          {OPTS.map(s => {
                            const checked = !noSymptom && symptoms.includes(s)
                            return (
                              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 20, border: `1px solid ${checked ? '#1E6B50' : '#E0D9CE'}`, background: checked ? '#E8F5EF' : '#fff', color: checked ? '#1E6B50' : '#4A6558' }}>
                                <input type="checkbox" style={{ display: 'none' }} checked={checked}
                                  onChange={e => {
                                    const cur = symptoms.filter(x => x !== '无躯体症状')
                                    updateSymptoms(e.target.checked ? [...cur, s] : cur.filter(x => x !== s))
                                  }} />{s}
                              </label>
                            )
                          })}
                          {(() => {
                            const otherChecked = !noSymptom && symptoms.some(s => s.startsWith('其他'))
                            return (
                              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 20, border: `1px solid ${otherChecked ? '#1E6B50' : '#E0D9CE'}`, background: otherChecked ? '#E8F5EF' : '#fff', color: otherChecked ? '#1E6B50' : '#4A6558' }}>
                                <input type="checkbox" style={{ display: 'none' }} checked={otherChecked}
                                  onChange={e => {
                                    const cur = symptoms.filter(x => x !== '无躯体症状' && !x.startsWith('其他'))
                                    updateSymptoms(e.target.checked ? [...cur, '其他'] : cur)
                                  }} />
                                其他
                                {otherChecked && (
                                  <input
                                    type="text"
                                    placeholder="请说明"
                                    value={otherText}
                                    onClick={e => e.preventDefault()}
                                    onChange={e => {
                                      const cur = symptoms.filter(x => x !== '无躯体症状' && !x.startsWith('其他'))
                                      const text = e.target.value
                                      updateSymptoms([...cur, text ? `其他：${text}` : '其他'])
                                    }}
                                    style={{ marginLeft: 4, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: 100, color: '#1A2B24' }}
                                  />
                                )}
                              </label>
                            )
                          })()}
                        </>
                      )
                    })()}
                  </div>
                </F>
                <F label="最近1个月是否有服用中药或西药" span={2}><textarea className="form-input" rows={2} placeholder="是/否，是则填写具体" value={form.recentMedication} onChange={set('recentMedication')} /></F>
                <F label="最近1个月是否有服用营养补剂" span={2}><textarea className="form-input" rows={2} placeholder="是/否，是则填写具体" value={form.recentSupplement} onChange={set('recentSupplement')} /></F>
              </Grid>
            </Section>
          )}

          {/* 健康需求（仅成人） */}
          {!isChild && (
            <Section title="健康需求" span={2}>
              <Grid>
                <F label="本人比较关注的健康问题" span={2}><textarea className="form-input" rows={2} placeholder="如：血糖控制、体重管理、睡眠改善" value={form.healthConcern} onChange={set('healthConcern')} /></F>
                <F label="更关注谁的健康问题" span={2}><input className="form-input" placeholder="如：自己、父母、子女" value={form.healthConcernFor} onChange={set('healthConcernFor')} /></F>
                <F label="期望得到怎样的家庭医生服务" span={2}><textarea className="form-input" rows={2} placeholder="如：定期随访、慢病管理、就医协助" value={form.expectedService} onChange={set('expectedService')} /></F>
                <F label="是否配备居家检测设备" span={2}><textarea className="form-input" rows={2} placeholder="是/否，是则填写设备类型（如血压计、血糖仪）" value={form.hasHomeMonitor} onChange={set('hasHomeMonitor')} /></F>
                <F label="是否配备居家小药箱" span={2}>
                  <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                    {['是','否'].map(v => (
                      <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                        <input type="radio" name="hasMedicineCabinet" value={v} checked={form.hasMedicineCabinet === v} onChange={() => setForm(f => ({ ...f, hasMedicineCabinet: v }))} />{v}
                      </label>
                    ))}
                  </div>
                </F>
              </Grid>
            </Section>
          )}

          {/* 医疗保障信息（仅成人） */}
          {!isChild && (
            <Section title="医疗保障信息" span={2}>
              <Grid>
                <F label="基础医疗保障" span={2}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                    {['城镇医疗保险', '居民医疗保险', '自费'].map(opt => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#1A2B24' }}>
                        <input type="radio" name="basic_insurance" value={opt} checked={form.basic_insurance === opt} onChange={() => setForm(f => ({ ...f, basic_insurance: opt }))} />
                        {opt}
                      </label>
                    ))}
                  </div>
                </F>
                <F label="商业医疗险（四选一）" span={2}>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 4 }}>
                    {['百万医疗险', '高端医疗险（亚洲版）', '高端医疗险（全球版）', '未购买'].map(opt => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#1A2B24' }}>
                        <input type="radio" name="commercial_medical" value={opt} checked={form.commercial_medical === opt} onChange={() => setForm(f => ({ ...f, commercial_medical: opt }))} />
                        {opt}
                      </label>
                    ))}
                  </div>
                </F>
                <F label="重疾险（三选一）" span={2}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                    {['大陆险', '港险', '未购买'].map(opt => (
                      <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: '#1A2B24' }}>
                        <input type="radio" name="critical_illness" value={opt} checked={form.critical_illness === opt} onChange={() => setForm(f => ({ ...f, critical_illness: opt }))} />
                        {opt}
                      </label>
                    ))}
                  </div>
                </F>
              </Grid>
            </Section>
          )}

          {/* 管理信息 */}
          <Section title="管理信息">
            <Grid>
              <F label="家庭医师" span={2}><select className="form-input" value={form.assignedFamilyDoctor} onChange={set('assignedFamilyDoctor')}><option value="">-- 未分配 --</option>{familyDoctors.map(s => <option key={s._id} value={s._id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}</select></F>
              <F label="营养师" span={2}><select className="form-input" value={form.assignedNutritionist} onChange={set('assignedNutritionist')}><option value="">-- 未分配 --</option>{nutritionists.map(s => <option key={s._id} value={s._id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}</select></F>
              <F label="健管专员" span={2}><select className="form-input" value={form.assignedHealthManager} onChange={set('assignedHealthManager')}><option value="">-- 未分配 --</option>{healthManagers.map(s => <option key={s._id} value={s._id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}</select></F>
              <F label="会员类型" span={2}>
                <select className="form-input" value={form.memberType} onChange={set('memberType')}>
                  <option value="">-- 未设置 --</option>
                  {MEMBER_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </F>
              <F label="服务包类型" span={2}>
                <select className="form-input" value={form.servicePackage} onChange={set('servicePackage')}>
                  <option value="">-- 未设置 --</option>
                  <option value="health_prevention">健康预防计划</option>
                  <option value="chronic_stable">慢病维稳计划</option>
                  <option value="young_state">健康年轻态计划</option>
                  <option value="health_reshape">健康重塑计划</option>
                </select>
              </F>
              <F label="服务开始日期"><input className="form-input" type="date" value={form.serviceStartDate} onChange={set('serviceStartDate')} /></F>
              <F label="服务到期日期"><input className="form-input" type="date" value={form.serviceExpiry} onChange={set('serviceExpiry')} /></F>
              <F label="会员来源"><select className="form-input" value={form.source} onChange={set('source')}><option value="">未填写</option>{SOURCE_OPTIONS.map(s => <option key={s}>{s}</option>)}</select></F>
              <F label="备注" span={2}><textarea className="form-input" rows={3} value={form.remark} onChange={set('remark')} style={{ resize: 'vertical' }} /></F>
            </Grid>
          </Section>

          {/* 初始健康数据 */}
          <Section title="初始健康数据（可选）">
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#8AA89C' }}>
              建档时预填，用户首次登录后可直接看到，无需二次录入。
            </p>
            <Grid>
              <F label="血压（收缩压/舒张压）" span={2}>
                <input className="form-input" placeholder="如：120/80" value={form.initialBloodPressure} onChange={set('initialBloodPressure')} />
              </F>
              <F label="心率（次/分）" span={2}>
                <input className="form-input" type="number" placeholder="如：72" value={form.initialHeartRate} onChange={set('initialHeartRate')} />
              </F>
              <F label="体重（kg）" span={2}>
                <input className="form-input" type="number" placeholder="如：65.5" value={form.initialWeight} onChange={set('initialWeight')} />
              </F>
              <F label="睡眠时长（小时）" span={2}>
                <input className="form-input" type="number" step="0.5" placeholder="如：7.5" value={form.initialSleepHours} onChange={set('initialSleepHours')} />
              </F>
              <F label="情绪评分（1-10分）" span={2}>
                <input className="form-input" type="number" min="1" max="10" placeholder="如：7" value={form.initialMoodScore} onChange={set('initialMoodScore')} />
              </F>
            </Grid>
          </Section>

        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={() => nav(-1)}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? '保存中...' : '保存会员'}</button>
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
