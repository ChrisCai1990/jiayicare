import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'

const DISEASE_TAGS = ['高血压', '糖尿病', '高血脂', '冠心病', '慢阻肺', '骨质疏松', '痛风', '甲状腺疾病', '脂肪肝', '肾病']
const SOURCE_OPTIONS = ['主动咨询', '健康讲座', '员工福利', '家属推荐', '医院转诊', '线上推广', '其他']

export default function NewPatientPage() {
  const nav = useNavigate()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const [staffList, setStaffList] = useState([])
  const [selectedDiseases, setSelectedDiseases] = useState([])

  const [form, setForm] = useState({
    name: '', phone: '', gender: '未知', age: '',
    height: '', weight: '',
    idNumber: '', maritalStatus: '', ethnicity: '',
    workplace: '', occupation: '',
    contactPhone: '', contactPhone2: '', deliveryAddress: '',
    source: '', patientType: '', remark: '',
    assignedHealthManager: '', assignedFamilyDoctor: '',
  })

  useEffect(() => {
    staffAPI.getStaffList().then(r => setStaffList(r.data)).catch(() => {})
  }, [])

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const toggleDisease = (d) => {
    setSelectedDiseases(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]
    )
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.phone) return toast('手机号不能为空')
    if (!/^1[3-9]\d{9}$/.test(form.phone)) return toast('手机号格式不正确')
    setSaving(true)
    try {
      const payload = {
        ...form,
        age: form.age ? Number(form.age) : undefined,
        height: form.height ? Number(form.height) : undefined,
        weight: form.weight ? Number(form.weight) : undefined,
        chronicDiseases: selectedDiseases,
        assignedHealthManager: form.assignedHealthManager || undefined,
        assignedFamilyDoctor: form.assignedFamilyDoctor || undefined,
      }
      const res = await staffAPI.createPatient(payload)
      toast('患者创建成功')
      nav(`/patients/${res.data._id}`, { replace: true })
    } catch (err) {
      toast(err.message || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  const healthManagers = staffList.filter(s => s.role === 'healthManager')
  const familyDoctors  = staffList.filter(s => s.role === 'familyDoctor')

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">新增患者</h1>
          <p className="page-subtitle">录入患者基本信息</p>
        </div>
        <button className="btn btn-secondary" onClick={() => nav(-1)}>← 返回</button>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* 基本信息 */}
          <div className="card">
            <div className="card-header"><div className="card-title">基本信息</div></div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FormField label="姓名 *" span={2}>
                <input className="form-input" placeholder="请输入姓名" value={form.name} onChange={set('name')} required />
              </FormField>
              <FormField label="手机号 *" span={2}>
                <input className="form-input" placeholder="请输入手机号（登录账号）" value={form.phone} onChange={set('phone')} required />
              </FormField>
              <FormField label="性别">
                <select className="form-input" value={form.gender} onChange={set('gender')}>
                  <option value="未知">未知</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
              </FormField>
              <FormField label="年龄">
                <input className="form-input" type="number" placeholder="岁" value={form.age} onChange={set('age')} min={0} max={150} />
              </FormField>
              <FormField label="身高(cm)">
                <input className="form-input" type="number" placeholder="cm" value={form.height} onChange={set('height')} />
              </FormField>
              <FormField label="体重(kg)">
                <input className="form-input" type="number" placeholder="kg" value={form.weight} onChange={set('weight')} />
              </FormField>
              <FormField label="身份证号" span={2}>
                <input className="form-input" placeholder="可选" value={form.idNumber} onChange={set('idNumber')} />
              </FormField>
              <FormField label="婚姻状况">
                <select className="form-input" value={form.maritalStatus} onChange={set('maritalStatus')}>
                  <option value="">未填写</option>
                  <option value="未婚">未婚</option>
                  <option value="已婚">已婚</option>
                  <option value="离异">离异</option>
                  <option value="丧偶">丧偶</option>
                </select>
              </FormField>
              <FormField label="民族">
                <input className="form-input" placeholder="如：汉族" value={form.ethnicity} onChange={set('ethnicity')} />
              </FormField>
              <FormField label="工作单位" span={2}>
                <input className="form-input" placeholder="可选" value={form.workplace} onChange={set('workplace')} />
              </FormField>
              <FormField label="职业" span={2}>
                <input className="form-input" placeholder="可选" value={form.occupation} onChange={set('occupation')} />
              </FormField>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* 慢病标签 */}
            <div className="card">
              <div className="card-header"><div className="card-title">慢病标签</div></div>
              <div className="card-body">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {DISEASE_TAGS.map(d => (
                    <button
                      key={d} type="button"
                      onClick={() => toggleDisease(d)}
                      style={{
                        padding: '4px 14px', borderRadius: 99, fontSize: 13, cursor: 'pointer',
                        border: `1px solid ${selectedDiseases.includes(d) ? '#e74c3c' : '#E0D9CE'}`,
                        background: selectedDiseases.includes(d) ? '#e74c3c' : '#f9f7f3',
                        color: selectedDiseases.includes(d) ? '#fff' : '#4A6558',
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 联系信息 */}
            <div className="card">
              <div className="card-header"><div className="card-title">联系信息</div></div>
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormField label="联系电话" span={2}>
                  <input className="form-input" placeholder="与登录手机号可不同" value={form.contactPhone} onChange={set('contactPhone')} />
                </FormField>
                <FormField label="紧急联系电话" span={2}>
                  <input className="form-input" placeholder="可选" value={form.contactPhone2} onChange={set('contactPhone2')} />
                </FormField>
                <FormField label="配送地址" span={2}>
                  <input className="form-input" placeholder="快递收货地址" value={form.deliveryAddress} onChange={set('deliveryAddress')} />
                </FormField>
              </div>
            </div>

            {/* 管理信息 */}
            <div className="card">
              <div className="card-header"><div className="card-title">管理信息</div></div>
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <FormField label="健管专员" span={2}>
                  <select className="form-input" value={form.assignedHealthManager} onChange={set('assignedHealthManager')}>
                    <option value="">-- 未分配 --</option>
                    {healthManagers.map(s => <option key={s._id} value={s._id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}
                  </select>
                </FormField>
                <FormField label="家庭医生" span={2}>
                  <select className="form-input" value={form.assignedFamilyDoctor} onChange={set('assignedFamilyDoctor')}>
                    <option value="">-- 未分配 --</option>
                    {familyDoctors.map(s => <option key={s._id} value={s._id}>{s.name}{s.title ? ` · ${s.title}` : ''}</option>)}
                  </select>
                </FormField>
                <FormField label="患者类型">
                  <select className="form-input" value={form.patientType} onChange={set('patientType')}>
                    <option value="">普通</option>
                    <option value="vip">VIP</option>
                    <option value="trial">试用</option>
                  </select>
                </FormField>
                <FormField label="患者来源">
                  <select className="form-input" value={form.source} onChange={set('source')}>
                    <option value="">未填写</option>
                    {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </FormField>
                <FormField label="备注" span={2}>
                  <textarea className="form-input" placeholder="可选" value={form.remark} onChange={set('remark')} rows={3} style={{ resize: 'vertical' }} />
                </FormField>
              </div>
            </div>
          </div>
        </div>

        {/* 提交 */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
          <button type="button" className="btn btn-secondary" onClick={() => nav(-1)}>取消</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? '保存中...' : '保存患者'}
          </button>
        </div>
      </form>
    </div>
  )
}

function FormField({ label, children, span = 1 }) {
  return (
    <div className="form-group" style={{ gridColumn: span > 1 ? `span ${span}` : undefined, marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      {children}
    </div>
  )
}
