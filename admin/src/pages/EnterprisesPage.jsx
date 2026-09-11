import React, { useEffect, useState } from 'react'
import { adminAPI, API_ORIGIN } from '../api'
import { useToast } from '../App'

// 上传接口返回相对路径(/api/uploads/xxx)，admin域名与后端API域名不同，需拼上API_ORIGIN才能正常打开
function safeFileSrc(url) {
  if (!url) return url
  if (url.startsWith('/')) return API_ORIGIN + url
  if (typeof window !== 'undefined' && window.location.protocol === 'https:' && url.startsWith('http://')) {
    return url.replace(/^http:\/\//, 'https://')
  }
  return url
}

const EMPTY_ENTERPRISE = {
  name: '', creditCode: '', contactName: '', contactPhone: '', contactEmail: '',
  contractStartAt: '', contractEndAt: '', seatsTotal: 0, packageType: '', status: 'active', note: '',
  healthFundPaymentRule: { enabled:false, deductionType:'unlimited', deductionValue:0, minOrderAmount:0, eligibleCategories:[], note:'' },
}

const INSURANCE_SCENES = ['普通门诊', '住院', '急诊', '特殊检查/治疗', '特药/院外药', '事后报销']
const INSURANCE_SCENARIO_LABELS = { outpatient:'普通门诊', inpatient:'住院', emergency:'急诊', special_drug:'特药/院外药', reimbursement:'事后报销', dispute:'争议处理' }
const SERVICE_MANUAL_FIELDS = [
  ['国际/高端门诊预约', 'internationalOutpatientBooking', '预约入口、服务时间、预约提前量、医院与医生选择步骤'],
  ['预约所需信息', 'appointmentRequiredInfo', '会员号、证件、症状、科室、期望时间等'],
  ['医院网络核验', 'providerNetworkCheck', '如何确认网络内医院、高昂医疗机构限制及书面确认方式'],
  ['直付适用条件', 'directBillingEligibility', '何时可直付、担保函/预授权条件、不适用情形'],
  ['自费后可报销条件', 'selfPayReimbursementEligibility', '允许先自费的场景、网络外/紧急情形、免赔与比例、不可报销情形'],
  ['报销资料清单', 'claimMaterials', '申请表、发票、费用清单、病历、处方、检查报告、支付凭证等'],
  ['报销办理流程', 'claimProcess', '就诊前确认、留存资料、提交、补件、审核、赔付的顺序与责任人'],
  ['报案/提交时限', 'claimDeadline', '报案、申请和补件截止时间及逾期处理'],
  ['提交渠道', 'claimSubmissionChannels', 'App、邮件、线上门户、邮寄地址及所需表单'],
  ['进度查询与补件', 'claimFollowUp', '查询入口、预计审核时长、补件通知与回传方式'],
  ['紧急就医流程', 'emergencyProcedure', '无法事先授权时的联系电话、补报时限及材料'],
  ['改期/取消规则', 'cancellationPolicy', '预约变更、爽约费用及通知方式'],
  ['异常升级联系人', 'escalationContact', '拒赔、直付失败、紧急协调时的升级路径'],
  ['手册依据', 'sourceReference', '服务手册/理赔指南名称、版本、页码或附件'],
]
const BOOKING_ROUTE_OPTIONS = [
  ['confirm', '预约前需核实'],
  ['insurer_vendor', '保司指定服务商预约'],
  ['platform_assisted', '嘉医健管直接预约医院'],
  ['customer_self', '客户自行预约'],
]

function InsurancePolicyModal({ enterprise, employees, onClose, toast }) {
  const [policies, setPolicies] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [selectedUsers, setSelectedUsers] = useState(new Set())
  const [enrollmentDetails, setEnrollmentDetails] = useState({})
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [saving, setSaving] = useState(false)
  const [operations, setOperations] = useState(null)
  const [form, setForm] = useState({ year: new Date().getFullYear(), name: `${new Date().getFullYear()}年度高端医疗险`, insurerName: '', policyNumber: '', startAt: '', endAt: '', servicePhone: '', claimContact: '', status: 'draft', note: '', rules: [] })
  const selectedPolicy = policies.find(p => p._id === selectedId)
  const load = async () => {
    const [res, summary] = await Promise.all([
      adminAPI.enterpriseInsurancePolicies(enterprise._id),
      adminAPI.enterpriseInsuranceOperationsSummary(enterprise._id),
    ])
    setPolicies(res.data || [])
    setOperations(summary.data || null)
    if (!selectedId && res.data?.[0]) selectPolicy(res.data[0])
  }
  const selectPolicy = async policy => {
    setSelectedId(policy._id)
    setForm({ ...policy, startAt: policy.startAt?.slice(0, 10) || '', endAt: policy.endAt?.slice(0, 10) || '' })
    const res = await adminAPI.insuranceEnrollments(enterprise._id, policy._id)
    setSelectedUsers(new Set((res.data || []).filter(x => x.status !== 'terminated').map(x => String(x.userId?._id || x.userId))))
    setEnrollmentDetails(Object.fromEntries((res.data || []).map(x => [String(x.userId?._id || x.userId), { relation: x.relation || 'employee', planLevel: x.planLevel || '', memberNumber: x.memberNumber || '', exclusions: x.exclusions || '', specialTerms: x.specialTerms || '' }])))
  }
  useEffect(() => { load().catch(err => toast('❌ ' + err.message)) }, [])
  const setRule = (scene, key, value) => setForm(current => {
    const rules = [...(current.rules || [])]
    const index = rules.findIndex(r => r.scene === scene)
    if (index >= 0) rules[index] = { ...rules[index], [key]: value }
    else rules.push({ scene, covered: 'confirm', preAuthorization: 'confirm', directBilling: 'confirm', [key]: value })
    return { ...current, rules }
  })
  const setManual = (key, value) => setForm(current => ({ ...current, serviceManual: { ...(current.serviceManual || {}), [key]: value } }))
  const addHospitalBookingRule = () => setForm(current => ({ ...current, hospitalBookingRules: [...(current.hospitalBookingRules || []), { hospitalName: '', campus: '', bookingRoute: 'confirm', vendorName: '', contact: '', bookingEntry: '', serviceHours: '', leadTime: '', requiredInfo: '', notes: '', verificationStatus: 'missing', verifiedAt: null, sourceReference: '' }] }))
  const setHospitalBookingRule = (index, key, value) => setForm(current => ({ ...current, hospitalBookingRules: (current.hospitalBookingRules || []).map((item, i) => i === index ? { ...item, [key]: value } : item) }))
  const removeHospitalBookingRule = index => setForm(current => ({ ...current, hospitalBookingRules: (current.hospitalBookingRules || []).filter((_, i) => i !== index) }))
  const save = async () => {
    if ((form.hospitalBookingRules || []).some(item => !item.hospitalName?.trim())) {
      toast('❌ 医院预约路径规则必须填写医院名称')
      return
    }
    setSaving(true)
    try {
      const policy = selectedId
        ? (await adminAPI.updateEnterpriseInsurancePolicy(enterprise._id, selectedId, form)).data
        : (await adminAPI.createEnterpriseInsurancePolicy(enterprise._id, form)).data
      const enrollments = [...selectedUsers].map(userId => ({ userId, relation: 'employee', status: 'active', ...(enrollmentDetails[userId] || {}) }))
      await adminAPI.saveInsuranceEnrollments(enterprise._id, policy._id, enrollments, true)
      toast('✅ 保险方案和参保人员已保存')
      await load()
      await selectPolicy(policy)
    } catch (err) { toast('❌ ' + err.message) } finally { setSaving(false) }
  }
  const rule = scene => (form.rules || []).find(r => r.scene === scene) || {}
  const visibleEmployees = employees.filter(u => {
    if (selectedOnly && !selectedUsers.has(String(u._id))) return false
    const keyword = memberSearch.trim().toLowerCase()
    return !keyword || `${u.name || ''} ${u.phone || ''}`.toLowerCase().includes(keyword)
  })
  return <div className="modal-overlay"><div className="modal" style={{ width: 'min(1100px, 96vw)', maxHeight: '92vh', overflow: 'auto' }}>
    <div className="modal-header"><div className="modal-title">🛡️ {enterprise.name} · 高端医疗险</div><button className="modal-close" onClick={onClose}>×</button></div>
    <div className="modal-body">
      {operations && <div style={{ marginBottom: 16, padding: 12, border: '1px solid #D8E7DF', borderRadius: 10, background: '#F7FBF9' }}>
        <div style={{ fontWeight: 700, color: '#173B2E' }}>保险运营效果</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginTop: 9 }}>
          {[
            ['有效参保', `${operations.enrolledMembers || 0}人`],
            ['服务案件', `${operations.totalCases || 0}件`],
            ['已提交理赔', `${operations.submittedClaims || 0}件`],
            ['理赔赔付率', operations.submittedClaims ? `${((operations.claimPaidRate || 0) * 100).toFixed(1)}%` : '-'],
            ['平均处理时长', operations.averageResolutionHours ? `${(operations.averageResolutionHours / 24).toFixed(1)}天` : '-'],
            ['保险直付', `¥${Number(operations.financials?.totalDirectBilling || 0).toLocaleString()}`],
            ['个人垫付', `¥${Number(operations.financials?.totalMemberPaid || 0).toLocaleString()}`],
            ['保险赔付', `¥${Number(operations.financials?.totalInsurancePaid || 0).toLocaleString()}`],
          ].map(([label, value]) => <div key={label} style={{ padding: 9, background: '#fff', borderRadius: 7 }}><div style={{ color: '#65776F', fontSize: 11 }}>{label}</div><div style={{ marginTop: 2, fontWeight: 750, color: '#173B2E' }}>{value}</div></div>)}
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: '#65776F' }}>{operations.totalCases
          ? `场景分布：${Object.entries(operations.byScenario || {}).map(([key, count]) => `${INSURANCE_SCENARIO_LABELS[key] || key} ${count}件`).join(' · ')}`
          : '暂无保险服务案件；指标将在医护端产生真实服务记录后自动累计。'}</div>
      </div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {policies.map(p => <button key={p._id} className={`btn btn-sm ${selectedId === p._id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => selectPolicy(p)}>{p.name}（{p.enrolledCount || 0}人）</button>)}
        <button className="btn btn-sm btn-secondary" onClick={() => { setSelectedId(''); setSelectedUsers(new Set()); setEnrollmentDetails({}); setForm({ year: new Date().getFullYear(), name: `${new Date().getFullYear()}年度高端医疗险`, insurerName: '', policyNumber: '', startAt: '', endAt: '', servicePhone: '', claimContact: '', status: 'draft', note: '', rules: [] }) }}>＋新方案</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[['方案名称','name'],['保险年度','year'],['保险公司','insurerName'],['保单/团险编号','policyNumber'],['保障开始','startAt'],['保障结束','endAt'],['服务电话','servicePhone'],['理赔联系人','claimContact']].map(([label,key]) => <label key={key} className="form-group"><span className="form-label">{label}</span><input className="form-input" type={key === 'year' ? 'number' : key.endsWith('At') ? 'date' : 'text'} value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /></label>)}
        <label className="form-group"><span className="form-label">状态</span><select className="form-input" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}><option value="draft">整理中</option><option value="review">待复核</option><option value="active">生效中</option><option value="expired">已到期</option></select></label>
      </div>
      <div style={{ marginTop: 18, fontWeight: 700 }}>场景化保障规则</div>
      <div style={{ overflowX: 'auto', marginTop: 8 }}><table className="data-table"><thead><tr><th>场景</th><th>是否保障</th><th>预授权</th><th>直付</th><th>免赔/比例/限额</th><th>医院限制、材料与注意事项</th><th>条款依据</th></tr></thead><tbody>
        {INSURANCE_SCENES.map(scene => <tr key={scene}><td>{scene}</td><td><select value={rule(scene).covered || 'confirm'} onChange={e => setRule(scene,'covered',e.target.value)}><option value="confirm">需确认</option><option value="yes">保障</option><option value="no">不保障</option></select></td><td><select value={rule(scene).preAuthorization || 'confirm'} onChange={e => setRule(scene,'preAuthorization',e.target.value)}><option value="confirm">需确认</option><option value="required">必须</option><option value="not_required">不需要</option></select></td><td><select value={rule(scene).directBilling || 'confirm'} onChange={e => setRule(scene,'directBilling',e.target.value)}><option value="confirm">需确认</option><option value="yes">支持</option><option value="no">不支持</option></select></td><td><textarea rows={3} value={rule(scene).limit || ''} onChange={e => setRule(scene,'limit',e.target.value)} placeholder="免赔额、比例、限额" /></td><td><textarea rows={3} value={rule(scene).notes || ''} onChange={e => setRule(scene,'notes',e.target.value)} /></td><td><input value={rule(scene).sourceReference || ''} onChange={e => setRule(scene,'sourceReference',e.target.value)} placeholder="附件名/P12" /></td></tr>)}
      </tbody></table></div>
      <div style={{ marginTop: 22, fontWeight: 700 }}>保险服务手册</div>
      <div style={{ marginTop: 5, fontSize: 12, color: '#65776F' }}>用于医护人员实际协助预约、直付和理赔。没有正式资料的项目请留空或写“待保险方书面确认”，不要凭经验推断。</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 10 }}>
        {[['直付操作方式','directBillingMethod'],['预授权操作方式','preAuthorizationMethod'],['理赔提交总说明','claimSubmissionMethod']].map(([label,key]) => <label key={key} className="form-group"><span className="form-label">{label}</span><textarea className="form-input" rows={3} value={form[key] || ''} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} /></label>)}
        {SERVICE_MANUAL_FIELDS.map(([label,key,placeholder]) => <label key={key} className="form-group"><span className="form-label">{label}</span><textarea className="form-input" rows={4} value={form.serviceManual?.[key] || ''} onChange={e => setManual(key, e.target.value)} placeholder={placeholder} /></label>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 10 }}>
        <label className="form-group"><span className="form-label">手册核实状态</span><select className="form-input" value={form.serviceManual?.verificationStatus || 'missing'} onChange={e => setManual('verificationStatus', e.target.value)}><option value="missing">资料待补</option><option value="review">待复核</option><option value="verified">已按正式资料核实</option></select></label>
        <label className="form-group"><span className="form-label">最后核实日期</span><input className="form-input" type="date" value={form.serviceManual?.verifiedAt?.slice?.(0, 10) || form.serviceManual?.verifiedAt || ''} onChange={e => setManual('verifiedAt', e.target.value || null)} /></label>
        <label className="form-group"><span className="form-label">核实人</span><input className="form-input" value={form.serviceManual?.verifiedByName || ''} onChange={e => setManual('verifiedByName', e.target.value)} /></label>
      </div>
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ fontWeight: 700 }}>医院预约路径规则</div><button type="button" className="btn btn-sm btn-secondary" onClick={addHospitalBookingRule}>＋ 添加医院规则</button></div>
      <div style={{ marginTop: 5, fontSize: 12, color: '#65776F' }}>按医院和院区记录正确预约入口。若必须通过保司指定服务商，请填写服务商及联系方式；尚未正式核实的规则保持“预约前需核实”。</div>
      <div style={{ display: 'grid', gap: 10, marginTop: 10 }}>
        {(form.hospitalBookingRules || []).map((item, index) => <div key={item._id || index} style={{ border: '1px solid #D8E7DF', borderRadius: 9, padding: 11, background: '#F8FBF9' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1.3fr auto', gap: 8, alignItems: 'center' }}>
            <input className="form-input" value={item.hospitalName || ''} onChange={e => setHospitalBookingRule(index, 'hospitalName', e.target.value)} placeholder="医院名称 *" />
            <input className="form-input" value={item.campus || ''} onChange={e => setHospitalBookingRule(index, 'campus', e.target.value)} placeholder="院区（可选）" />
            <select className="form-input" value={item.bookingRoute || 'confirm'} onChange={e => setHospitalBookingRule(index, 'bookingRoute', e.target.value)}>{BOOKING_ROUTE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            <button type="button" className="btn btn-sm btn-secondary" onClick={() => removeHospitalBookingRule(index)}>删除</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 8 }}>
            <input className="form-input" value={item.vendorName || ''} onChange={e => setHospitalBookingRule(index, 'vendorName', e.target.value)} placeholder="指定服务商/受理方" />
            <input className="form-input" value={item.contact || ''} onChange={e => setHospitalBookingRule(index, 'contact', e.target.value)} placeholder="预约联系电话" />
            <input className="form-input" value={item.bookingEntry || ''} onChange={e => setHospitalBookingRule(index, 'bookingEntry', e.target.value)} placeholder="公众号、App或预约入口" />
            <input className="form-input" value={item.serviceHours || ''} onChange={e => setHospitalBookingRule(index, 'serviceHours', e.target.value)} placeholder="服务时间" />
            <input className="form-input" value={item.leadTime || ''} onChange={e => setHospitalBookingRule(index, 'leadTime', e.target.value)} placeholder="提前预约要求，如提前2个工作日" />
            <input className="form-input" value={item.requiredInfo || ''} onChange={e => setHospitalBookingRule(index, 'requiredInfo', e.target.value)} placeholder="预约所需信息" />
            <select className="form-input" value={item.verificationStatus || 'missing'} onChange={e => setHospitalBookingRule(index, 'verificationStatus', e.target.value)}><option value="missing">资料待补</option><option value="review">待复核</option><option value="verified">已核实</option></select>
            <input className="form-input" type="date" value={item.verifiedAt?.slice?.(0, 10) || item.verifiedAt || ''} onChange={e => setHospitalBookingRule(index, 'verifiedAt', e.target.value || null)} />
            <input className="form-input" value={item.sourceReference || ''} onChange={e => setHospitalBookingRule(index, 'sourceReference', e.target.value)} placeholder="依据：手册/邮件/联系人" />
          </div>
          <textarea className="form-input" rows={2} style={{ marginTop: 8 }} value={item.notes || ''} onChange={e => setHospitalBookingRule(index, 'notes', e.target.value)} placeholder="特殊限制或操作说明" />
        </div>)}
        {(form.hospitalBookingRules || []).length === 0 && <div style={{ padding: 14, color: '#8AA89C', background: '#FAFAF8', borderRadius: 8 }}>尚未配置具体医院的预约路径。</div>}
      </div>
      <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, marginRight: 'auto' }}>参保人员（已选 {selectedUsers.size} 人，共 {employees.length} 人）</div>
        <input className="form-input" style={{ width: 260 }} value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="搜索姓名或手机号" />
        <label style={{ fontSize: 13, whiteSpace: 'nowrap' }}><input type="checkbox" checked={selectedOnly} onChange={e => setSelectedOnly(e.target.checked)} /> 仅看已选</label>
        {(memberSearch || selectedOnly) && <button type="button" className="btn btn-sm btn-secondary" onClick={() => { setMemberSearch(''); setSelectedOnly(false) }}>清除筛选</button>}
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: '#8AA89C' }}>当前显示 {visibleEmployees.length} 人；搜索不会改变已勾选人员。</div>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>{visibleEmployees.map(u => <label key={u._id} style={{ border: '1px solid #E6E1D8', borderRadius: 8, padding: 9 }}><input type="checkbox" checked={selectedUsers.has(String(u._id))} onChange={e => setSelectedUsers(current => { const next = new Set(current); e.target.checked ? next.add(String(u._id)) : next.delete(String(u._id)); return next })} /> <b>{u.name}</b> <span style={{ color: '#888', fontSize: 12 }}>{u.phone}</span></label>)}</div>
      {visibleEmployees.length === 0 && <div style={{ padding: 20, textAlign: 'center', color: '#8AA89C' }}>没有匹配的企业会员</div>}
      {employees.filter(u => selectedUsers.has(String(u._id))).map(u => { const key = String(u._id); const detail = enrollmentDetails[key] || {}; const setDetail = (field, value) => setEnrollmentDetails(all => ({ ...all, [key]: { ...(all[key] || {}), [field]: value } })); return <details key={key} style={{ marginTop: 8, border: '1px solid #E6E1D8', borderRadius: 8, padding: 10 }}><summary style={{ cursor: 'pointer', fontWeight: 650 }}>{u.name} · 个人参保信息/特别约定</summary><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 10 }}><input className="form-input" placeholder="方案等级" value={detail.planLevel || ''} onChange={e => setDetail('planLevel', e.target.value)} /><input className="form-input" placeholder="保险会员号" value={detail.memberNumber || ''} onChange={e => setDetail('memberNumber', e.target.value)} /><select className="form-input" value={detail.relation || 'employee'} onChange={e => setDetail('relation', e.target.value)}><option value="employee">员工本人</option><option value="spouse">配偶</option><option value="child">子女</option><option value="other">其他</option></select><textarea className="form-input" rows={2} placeholder="个人除外责任" value={detail.exclusions || ''} onChange={e => setDetail('exclusions', e.target.value)} /><textarea className="form-input" rows={2} placeholder="特别约定" value={detail.specialTerms || ''} onChange={e => setDetail('specialTerms', e.target.value)} /></div></details> })}
      {selectedPolicy?.attachments?.length > 0 && <div style={{ marginTop: 14, fontSize: 12, color: '#65776F' }}>已继承现有保险附件：{selectedPolicy.attachments.map(a => a.name).join('、')}</div>}
      <div style={{ marginTop: 12, color: '#8A5A00', background: '#FFF8E7', padding: 10, borderRadius: 8 }}>“需确认”是安全默认值；生效前请按上传合同核对并填写条款依据。</div>
    </div>
    <div className="modal-footer"><button className="btn btn-secondary" onClick={onClose}>关闭</button><button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? '保存中…' : '保存方案与参保人员'}</button></div>
  </div></div>
}

// ── 企业信息表单 Modal ─────────────────────────────────────────────
function EnterpriseModal({ enterprise, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = !!enterprise?._id
  const [form, setForm] = useState(isEdit ? {
    ...enterprise,
    contractStartAt: enterprise.contractStartAt ? enterprise.contractStartAt.slice(0, 10) : '',
    contractEndAt: enterprise.contractEndAt ? enterprise.contractEndAt.slice(0, 10) : '',
  } : EMPTY_ENTERPRISE)
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const setFundRule = (k, v) => setForm(f => ({ ...f, healthFundPaymentRule:{ ...EMPTY_ENTERPRISE.healthFundPaymentRule, ...(f.healthFundPaymentRule || {}), [k]:v } }))

  const save = async () => {
    if (!form.name) { toast('❌ 企业名称为必填项'); return }
    setLoading(true)
    try {
      if (isEdit) await adminAPI.updateEnterprise(enterprise._id, form)
      else await adminAPI.createEnterprise(form)
      toast(`✅ 企业客户${isEdit ? '更新' : '创建'}成功`)
      onSaved(); onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally { setLoading(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600, width: '96%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">{isEdit ? '✏️ 编辑企业客户' : '➕ 新增企业客户'}</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">企业名称 *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">统一社会信用代码</label>
            <input className="form-input" value={form.creditCode} onChange={e => set('creditCode', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">状态</label>
            <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
              <option value="active">合作中</option>
              <option value="expired">已到期</option>
              <option value="suspended">已暂停</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">对接人姓名</label>
            <input className="form-input" value={form.contactName} onChange={e => set('contactName', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">对接人电话</label>
            <input className="form-input" value={form.contactPhone} onChange={e => set('contactPhone', e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">对接人邮箱</label>
            <input className="form-input" value={form.contactEmail} onChange={e => set('contactEmail', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">合同开始日期</label>
            <input className="form-input" type="date" value={form.contractStartAt} onChange={e => set('contractStartAt', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">合同结束日期</label>
            <input className="form-input" type="date" value={form.contractEndAt} onChange={e => set('contractEndAt', e.target.value)} />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">采购服务包类型</label>
            <input className="form-input" value={form.packageType} onChange={e => set('packageType', e.target.value)} placeholder="如 pkg_1y" />
          </div>
          <div className="form-group" style={{ gridColumn: '1/-1' }}>
            <label className="form-label">备注</label>
            <textarea className="form-input" rows={3} value={form.note} onChange={e => set('note', e.target.value)} />
          </div>
          <div style={{gridColumn:'1/-1',borderTop:'1px solid #e5e7eb',paddingTop:12,fontWeight:700,color:'#1E6B50'}}>企业健康基金支付抵扣规则</div>
          <label style={{gridColumn:'1/-1',display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={!!form.healthFundPaymentRule?.enabled} onChange={e=>setFundRule('enabled',e.target.checked)}/>启用企业赠送健康基金支付抵扣</label>
          <div className="form-group"><label className="form-label">抵扣方式</label><select className="form-input" value={form.healthFundPaymentRule?.deductionType || 'unlimited'} onChange={e=>setFundRule('deductionType',e.target.value)}><option value="unlimited">余额内不限额</option><option value="percentage">按订单比例上限</option><option value="fixedAmount">每单固定金额上限</option></select></div>
          <div className="form-group"><label className="form-label">比例（%）/金额（元）</label><input className="form-input" type="number" min="0" value={form.healthFundPaymentRule?.deductionValue || 0} onChange={e=>setFundRule('deductionValue',Number(e.target.value)||0)}/></div>
          <div className="form-group"><label className="form-label">最低订单金额</label><input className="form-input" type="number" min="0" value={form.healthFundPaymentRule?.minOrderAmount || 0} onChange={e=>setFundRule('minOrderAmount',Number(e.target.value)||0)}/></div>
          <div className="form-group"><label className="form-label">适用产品分类（逗号分隔，留空为全部）</label><input className="form-input" value={(form.healthFundPaymentRule?.eligibleCategories || []).join(',')} onChange={e=>setFundRule('eligibleCategories',e.target.value.split(',').map(v=>v.trim()).filter(Boolean))}/></div>
          <div className="form-group" style={{gridColumn:'1/-1'}}><label className="form-label">客户可见的使用规则说明</label><textarea className="form-input" rows={3} value={form.healthFundPaymentRule?.note || ''} onChange={e=>setFundRule('note',e.target.value)} placeholder="例如：自有基金优先抵扣；企业基金限指定服务使用，退款审核通过后按原来源退回。留空则由系统根据上方规则自动生成。"/></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={loading}>{loading ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 关联员工 Modal（搜索会员并加入企业）────────────────────────────
function LinkEmployeesModal({ enterprise, onClose, onSaved }) {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [associationType, setAssociationType] = useState('employee')

  const search = async () => {
    if (!q.trim()) { toast('请输入姓名或手机号搜索'); return }
    setSearching(true)
    try {
      const res = await adminAPI.patients({ q })
      setResults(res.data || [])
    } catch (err) {
      toast('❌ ' + err.message)
    } finally { setSearching(false) }
  }

  const toggle = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const save = async () => {
    if (selected.length === 0) { toast('请至少选择一名员工'); return }
    setSaving(true)
    try {
      await adminAPI.linkEnterpriseEmployees(enterprise._id, selected, associationType)
      toast(associationType === 'dependent' ? `✅ 已关联 ${selected.length} 名高管家属，不占员工名额` : `✅ 已关联 ${selected.length} 名员工`)
      onSaved(); onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560, width: '96%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">🔗 关联成员到「{enterprise.name}」</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 16, marginBottom: 12, padding: 10, background: '#F7F8F6', borderRadius: 8 }}>
            <label><input type="radio" name="associationType" checked={associationType === 'employee'} onChange={() => setAssociationType('employee')} /> 企业员工（占采购名额）</label>
            <label><input type="radio" name="associationType" checked={associationType === 'dependent'} onChange={() => setAssociationType('dependent')} /> 高管家属（不占员工名额）</label>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
            <input className="form-input" style={{ flex: 1 }} value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), search())} placeholder="按姓名或手机号搜索会员" />
            <button className="btn btn-ghost" onClick={search} disabled={searching}>{searching ? '搜索中...' : '搜索'}</button>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {results.map(u => (
              <label key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px dashed #f0ede7', cursor: 'pointer' }}>
                <input type="checkbox" checked={selected.includes(u._id)} onChange={() => toggle(u._id)} />
                <div>
                  <div style={{ fontWeight: 500 }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>{u.phone}</div>
                </div>
              </label>
            ))}
            {results.length === 0 && <div style={{ fontSize: 12, color: '#aaa', padding: '8px 0' }}>暂无搜索结果</div>}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '保存中...' : `关联已选 ${selected.length} 人`}</button>
        </div>
      </div>
    </div>
  )
}

// ── HR账号创建 Modal ──────────────────────────────────────────────
function HrAccountModal({ enterprise, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState({ username: '', password: '', name: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name || !form.password) { toast('❌ 姓名、密码为必填项'); return }
    setSaving(true)
    try {
      await adminAPI.createEnterpriseHr(enterprise._id, form)
      toast('✅ HR账号已创建')
      onSaved(); onClose()
    } catch (err) {
      toast('❌ ' + (err.message || '操作失败'))
    } finally { setSaving(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420, width: '96%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">👤 为「{enterprise.name}」创建HR账号</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">姓名 *</label>
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">登录用户名（留空自动生成）</label>
            <input className="form-input" value={form.username} onChange={e => set('username', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">登录密码 *</label>
            <input className="form-input" type="text" value={form.password} onChange={e => set('password', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">联系电话</label>
            <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '创建中...' : '创建'}</button>
        </div>
      </div>
    </div>
  )
}

const STATUS_LABEL = { active: '合作中', expired: '已到期', suspended: '已暂停' }
const STATUS_BADGE = { active: 'badge-green', expired: 'badge-gray', suspended: 'badge-gray' }

export default function EnterprisesPage() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showEditModal, setShowEditModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [employeesByEnt, setEmployeesByEnt] = useState({})
  const [hrByEnt, setHrByEnt] = useState({})
  const [showLinkModal, setShowLinkModal] = useState(false)
  const [showHrModal, setShowHrModal] = useState(false)
  const [hrDataEnt, setHrDataEnt] = useState(null)   // 正在录入HR看板数据的企业
  const [insuranceEnt, setInsuranceEnt] = useState(null)

  const load = async (name) => {
    setLoading(true)
    try {
      const res = await adminAPI.enterprises(name ? { name } : {})
      setList(res.data || [])
    } catch (err) {
      toast('❌ 加载失败：' + err.message)
    } finally { setLoading(false) }
  }

  useEffect(() => { load(q) }, [q])

  const loadDetail = async (id) => {
    try {
      const [empRes, hrRes] = await Promise.all([adminAPI.enterpriseEmployees(id), adminAPI.enterpriseHrAccounts(id)])
      setEmployeesByEnt(m => ({ ...m, [id]: empRes.data || [] }))
      setHrByEnt(m => ({ ...m, [id]: hrRes.data || [] }))
    } catch (err) {
      toast('❌ 加载详情失败：' + err.message)
    }
  }

  const toggleExpand = (id) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (!employeesByEnt[id]) loadDetail(id)
  }

  const del = async (e) => {
    if (!window.confirm(`确定删除「${e.name}」？`)) return
    try { await adminAPI.deleteEnterprise(e._id); toast('✅ 已删除'); load(q) }
    catch (err) { toast('❌ ' + err.message) }
  }

  const unlinkEmployee = async (entId, userId) => {
    if (!window.confirm('确定解除该员工与企业的关联？')) return
    try { await adminAPI.unlinkEnterpriseEmployee(entId, userId); toast('✅ 已解除'); loadDetail(entId) }
    catch (err) { toast('❌ ' + err.message) }
  }

  const deleteHr = async (entId, hrId) => {
    if (!window.confirm('确定删除该HR账号？')) return
    try { await adminAPI.deleteEnterpriseHr(hrId); toast('✅ 已删除'); loadDetail(entId) }
    catch (err) { toast('❌ ' + err.message) }
  }

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('zh-CN') : '-'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-title">🏢 企业客户管理</div>
          <div className="page-subtitle">管理B2B2C企业客户、员工名额分配、HR账号</div>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditing(null); setShowEditModal(true) }}>＋ 新增企业客户</button>
      </div>

      <div className="search-bar" style={{ marginBottom: 12 }}>
        <input
          className="search-input"
          placeholder="🔍  搜索企业名称..."
          value={q}
          onChange={e => setQ(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="loading">加载中...</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {list.length === 0 && (
            <div className="card" style={{ textAlign: 'center', color: '#888', padding: 32 }}>暂无企业客户，点击「新增企业客户」添加</div>
          )}
          {list.map(e => (
            <div key={e._id} className="card" style={{ padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', cursor: 'pointer' }} onClick={() => toggleExpand(e._id)}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{e.name}</div>
                  <div style={{ fontSize: 12, color: '#888' }}>
                    对接人：{e.contactName || '-'} {e.contactPhone} · 合同：{fmtDate(e.contractStartAt)} ~ {fmtDate(e.contractEndAt)}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#4A6558' }}>员工名额 {e.seatsUsed}/{e.seatsTotal || '不限'}{e.dependentsCount > 0 ? ` · 家属 ${e.dependentsCount}` : ''}</div>
                <span className={`badge ${STATUS_BADGE[e.status]}`}>{STATUS_LABEL[e.status]}</span>
                <div style={{ display: 'flex', gap: 6 }} onClick={ev => ev.stopPropagation()}>
                  <button className="btn btn-sm btn-primary" onClick={() => toggleExpand(e._id)}>
                    {expandedId === e._id ? '收起' : '管理员工/HR账号'}
                  </button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { setEditing(e); setShowEditModal(true) }}>编辑</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => setHrDataEnt(e)}>📊 HR数据</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => { if (!employeesByEnt[e._id]) loadDetail(e._id); setInsuranceEnt(e) }}>🛡️ 高端医疗险</button>
                  <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => del(e)}>删除</button>
                </div>
              </div>

              {expandedId === e._id && (
                <div style={{ borderTop: '1px solid #f0ede7', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* 员工列表 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#4A6558' }}>已关联企业成员</div>
                      <button className="btn btn-sm btn-primary" onClick={() => setShowLinkModal(true)}>＋ 关联员工</button>
                    </div>
                    {(employeesByEnt[e._id] || []).length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>暂无关联员工</div>}
                    {(employeesByEnt[e._id] || []).map(u => (
                      <div key={u._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px dashed #f0ede7' }}>
                        <div style={{ flex: 1 }}>{u.name} <span style={{ fontSize: 12, color: '#888' }}>{u.phone}</span> {u.enterpriseAssociationType === 'dependent' && <span className="badge badge-blue">高管家属</span>}</div>
                        <span className={`badge ${u.onboardingCompleted ? 'badge-green' : 'badge-gray'}`}>{u.onboardingCompleted ? '已激活' : '未激活'}</span>
                        <button className="btn btn-sm btn-ghost" onClick={() => unlinkEmployee(e._id, u._id)}>解除</button>
                      </div>
                    ))}
                  </div>

                  {/* HR账号 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#4A6558' }}>HR账号</div>
                      <button className="btn btn-sm btn-primary" onClick={() => setShowHrModal(true)}>＋ 创建HR账号</button>
                    </div>
                    {(hrByEnt[e._id] || []).length === 0 && <div style={{ fontSize: 12, color: '#aaa' }}>暂无HR账号</div>}
                    {(hrByEnt[e._id] || []).map(hr => (
                      <div key={hr._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px dashed #f0ede7' }}>
                        <div style={{ flex: 1 }}>{hr.name} <span style={{ fontSize: 12, color: '#888' }}>@{hr.username}</span></div>
                        <button className="btn btn-sm" style={{ background: '#fee', color: '#c00', border: '1px solid #fcc' }} onClick={() => deleteHr(e._id, hr._id)}>删除</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showEditModal && (
        <EnterpriseModal enterprise={editing} onClose={() => setShowEditModal(false)} onSaved={() => load(q)} />
      )}
      {showLinkModal && expandedId && (
        <LinkEmployeesModal enterprise={list.find(e => e._id === expandedId)} onClose={() => setShowLinkModal(false)} onSaved={() => { loadDetail(expandedId); load(q) }} />
      )}
      {showHrModal && expandedId && (
        <HrAccountModal enterprise={list.find(e => e._id === expandedId)} onClose={() => setShowHrModal(false)} onSaved={() => loadDetail(expandedId)} />
      )}
      {hrDataEnt && (
        <HrDataModal enterprise={hrDataEnt} onClose={() => setHrDataEnt(null)} onSaved={() => load(q)} toast={toast} />
      )}
      {insuranceEnt && <InsurancePolicyModal enterprise={insuranceEnt} employees={employeesByEnt[insuranceEnt._id] || []} onClose={() => setInsuranceEnt(null)} toast={toast} />}
    </div>
  )
}

// ── 企业HR看板数据录入（超管手工，按年度）────────────────────────────
function HrDataModal({ enterprise, onClose, onSaved, toast }) {
  const yearNow = new Date().getFullYear()
  const byYear = enterprise.hrDataByYear || {}
  // 已录入过的年份（快捷切换用），倒序
  const savedYears = Object.keys(byYear).sort((a, b) => Number(b) - Number(a))
  const [year, setYear] = useState(String(yearNow))
  const blankFund = { transactions: [], used: '' }
  const blank = { seatsTotal: '', examOrg: '', examCount: '', examUnitPrice: '', examUnitPriceMale: '', examUnitPriceMarriedFemale: '', examUnitPriceSingleFemale: '', examTotal: '', insurerName: '', insuredCount: '', insuredExecCount: '', insuredFamilyCount: '', insuredChildCount: '', insuredAmount: '', healthMgmtFee: '', healthMgmtCount: '', otherServices: [], healthFund: { ...blankFund }, examAttachments: [], insuredAttachments: [], healthMgmtAttachments: [] }
  // 载入已有年度数据时，确保 healthFund 结构完整（旧数据可能没有这个字段）
  const withDefaults = (d) => ({ ...blank, ...d, healthFund: { ...blankFund, ...(d?.healthFund || {}) } })
  const [form, setForm] = useState(() => withDefaults(byYear[String(yearNow)]))
  const [saving, setSaving] = useState(false)

  const switchYear = (y) => { setYear(y); setForm(withDefaults(byYear[y])) }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  // 付费服务清单（含启动状态）
  const setOther = (i, k, v) => setForm(f => ({ ...f, otherServices: f.otherServices.map((o, idx) => idx === i ? { ...o, [k]: v } : o) }))
  const addOther = () => setForm(f => ({ ...f, otherServices: [...(f.otherServices || []), { name: '', frequency: '', detail: '' }] }))
  const rmOther = (i) => setForm(f => ({ ...f, otherServices: f.otherServices.filter((_, idx) => idx !== i) }))
  // 健康基金充值明细
  const setFund = (k, v) => setForm(f => ({ ...f, healthFund: { ...f.healthFund, [k]: v } }))
  const setFundTx = (i, k, v) => setForm(f => ({ ...f, healthFund: { ...f.healthFund, transactions: f.healthFund.transactions.map((t, idx) => idx === i ? { ...t, [k]: v } : t) } }))
  const addFundTx = () => setForm(f => ({ ...f, healthFund: { ...f.healthFund, transactions: [...(f.healthFund.transactions || []), { source: '企业自有', amount: '', date: '', note: '' }] } }))
  const rmFundTx = (i) => setForm(f => ({ ...f, healthFund: { ...f.healthFund, transactions: f.healthFund.transactions.filter((_, idx) => idx !== i) } }))
  // 基金总额/余额实时预览（与后端算法一致）
  const fundTotal = (form.healthFund?.transactions || []).reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const fundBalance = fundTotal - (Number(form.healthFund?.used) || 0)

  // 附件（服务合约等），三个维度各自一份列表：[{ name, url }]
  const [uploadingKey, setUploadingKey] = useState('')
  const addAttachment = async (key, file) => {
    if (!file) return
    setUploadingKey(key)
    try {
      const res = await adminAPI.uploadImage(file)
      setForm(f => ({ ...f, [key]: [...(f[key] || []), { name: file.name, url: res.data.url }] }))
    } catch (err) { toast('❌ ' + (err.message || '上传失败')) } finally { setUploadingKey('') }
  }
  const rmAttachment = (key, i) => setForm(f => ({ ...f, [key]: f[key].filter((_, idx) => idx !== i) }))

  const save = async () => {
    setSaving(true)
    try {
      await adminAPI.saveEnterpriseHrData(enterprise._id, year, form)
      toast(`✅ ${year}年度数据已保存`)
      onSaved(); onClose()
    } catch (err) { toast('❌ ' + (err.message || '保存失败')) } finally { setSaving(false) }
  }

  const numField = (label, key, unit) => (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input className="form-input" type="number" value={form[key]} onChange={e => set(key, e.target.value)} placeholder="0" />
        {unit && <span style={{ fontSize: 12, color: '#888' }}>{unit}</span>}
      </div>
    </div>
  )

  // 附件列表（服务合约等，每个维度独立存储，支持多文件）
  const attachmentList = (key, label) => (
    <div style={{ gridColumn: 'span 2', marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <label className="form-label" style={{ marginBottom: 0 }}>{label}</label>
        <label className="btn btn-sm btn-secondary" style={{ cursor: 'pointer', margin: 0 }}>
          {uploadingKey === key ? '上传中...' : '+ 上传附件'}
          <input
            type="file"
            accept="image/*,.pdf"
            style={{ display: 'none' }}
            disabled={uploadingKey === key}
            onChange={e => { addAttachment(key, e.target.files[0]); e.target.value = '' }}
          />
        </label>
      </div>
      {(form[key] || []).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {form[key].map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, background: '#f8faf9', borderRadius: 6, padding: '6px 10px' }}>
              <span>📎</span>
              <a href={safeFileSrc(a.url)} target="_blank" rel="noreferrer" style={{ flex: 1, color: '#1E6B50', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</a>
              <button type="button" onClick={() => rmAttachment(key, i)} style={{ color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // 服务起止日期（三维度各一对，时间可能都不同）
  const dateRange = (startKey, endKey) => (
    <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
      <label className="form-label">服务起止</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input className="form-input" type="date" value={form[startKey] || ''} onChange={e => set(startKey, e.target.value)} />
        <span style={{ color: '#888' }}>至</span>
        <input className="form-input" type="date" value={form[endKey] || ''} onChange={e => set(endKey, e.target.value)} />
      </div>
    </div>
  )

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <div className="modal-title">📊 「{enterprise.name}」HR看板数据</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <div className="form-group">
            <label className="form-label">年度</label>
            {/* 年份可直接输入任意年（不写死，2027年之后也能录）；已录年份点标签快捷切换 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                className="form-input"
                type="number"
                style={{ maxWidth: 120 }}
                value={year}
                min="2020"
                max="2099"
                onChange={e => switchYear(e.target.value)}
                placeholder="如 2026"
              />
              <span style={{ fontSize: 12, color: '#888' }}>年{byYear[year] ? '（已录，可修改）' : '（新建）'}</span>
            </div>
            {savedYears.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {savedYears.map(y => (
                  <button
                    key={y}
                    type="button"
                    onClick={() => switchYear(y)}
                    style={{
                      fontSize: 12, padding: '3px 12px', borderRadius: 999, cursor: 'pointer',
                      border: y === year ? '1px solid #1E6B50' : '1px solid #E0D9CE',
                      background: y === year ? '#EAF5EF' : '#fff',
                      color: y === year ? '#1E6B50' : '#4A6558', fontWeight: y === year ? 700 : 400,
                    }}
                  >{y} 年</button>
                ))}
              </div>
            )}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50', margin: '12px 0 8px' }}>服务名额</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {numField('该年度采购名额', 'seatsTotal', '人')}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50', margin: '16px 0 8px' }}>体检</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
              <label className="form-label">体检机构</label>
              <input className="form-input" value={form.examOrg} onChange={e => set('examOrg', e.target.value)} placeholder="如：美年大健康 / 慈铭体检" />
            </div>
            {numField('当年体检人数', 'examCount', '人')}
            {/* 2026-07-09：去掉"客单价（总体）"录入——体检按类别计价，无统一总体客单价 */}
            {numField('客单价·男性', 'examUnitPriceMale', '¥')}
            {numField('客单价·已婚女性', 'examUnitPriceMarriedFemale', '¥')}
            {numField('客单价·未婚女性', 'examUnitPriceSingleFemale', '¥')}
            {numField('体检总额', 'examTotal', '¥')}
            {dateRange('examStartAt', 'examEndAt')}
            {attachmentList('examAttachments', '体检服务合约附件')}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50', margin: '16px 0 8px' }}>保险（如为高管购买高端医疗险）</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
              <label className="form-label">保险公司</label>
              <input className="form-input" value={form.insurerName} onChange={e => set('insurerName', e.target.value)} placeholder="如：中国平安 / 友邦" />
            </div>
            {numField('参保人数（总体）', 'insuredCount', '人')}
            {numField('参保·高管', 'insuredExecCount', '人')}
            {numField('参保·配偶', 'insuredFamilyCount', '人')}
            {numField('参保·孩子', 'insuredChildCount', '人')}
            {numField('保险金额', 'insuredAmount', '¥')}
            {dateRange('insuredStartAt', 'insuredEndAt')}
            {attachmentList('insuredAttachments', '保险服务合约附件')}
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50', margin: '16px 0 8px' }}>健康管理</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {numField('服务人数', 'healthMgmtCount', '人')}
            {numField('健康管理费', 'healthMgmtFee', '¥')}
            {dateRange('healthMgmtStartAt', 'healthMgmtEndAt')}
            {attachmentList('healthMgmtAttachments', '健康管理服务合约附件')}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50' }}>付费健康管理服务清单</div>
            <button type="button" className="btn btn-sm btn-secondary" onClick={addOther}>+ 添加</button>
          </div>
          {(form.otherServices || []).map((o, i) => (
            <div key={i} style={{ border: '1px solid #EEE9E0', borderRadius: 8, padding: 10, marginBottom: 8, background: '#fcfbf9' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr auto', gap: 8, alignItems: 'center' }}>
                <input className="form-input" value={o.name} onChange={e => setOther(i, 'name', e.target.value)} placeholder="服务名称，如：健康讲座" />
                <input className="form-input" value={o.frequency || ''} onChange={e => setOther(i, 'frequency', e.target.value)} placeholder="频次，如：每季度1次" />
                <button type="button" onClick={() => rmOther(i)} style={{ color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
              <textarea
                className="form-input"
                style={{ marginTop: 8, minHeight: 52, resize: 'vertical', width: '100%' }}
                value={o.detail || ''}
                onChange={e => setOther(i, 'detail', e.target.value)}
                placeholder="具体服务内容 / 启动情况，如：全年组织4场，主题涵盖三高防治、颈椎健康，累计参与320人次"
              />
            </div>
          ))}

          {/* ── 健康基金账户 ────────────────────────────────────── */}
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50', margin: '18px 0 8px' }}>健康基金账户</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, color: '#888' }}>充值明细（区分企业自有 / 平台赠送）</div>
            <button type="button" className="btn btn-sm btn-secondary" onClick={addFundTx}>+ 添加充值</button>
          </div>
          {(form.healthFund?.transactions || []).map((t, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.2fr auto', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <select className="form-input" value={t.source || '企业自有'} onChange={e => setFundTx(i, 'source', e.target.value)}>
                <option value="企业自有">企业自有</option>
                <option value="平台赠送">平台赠送</option>
              </select>
              <input className="form-input" type="number" value={t.amount} onChange={e => setFundTx(i, 'amount', e.target.value)} placeholder="金额 ¥" />
              <input className="form-input" type="date" value={t.date} onChange={e => setFundTx(i, 'date', e.target.value)} />
              <input className="form-input" value={t.note} onChange={e => setFundTx(i, 'note', e.target.value)} placeholder="备注" />
              <button type="button" onClick={() => rmFundTx(i)} style={{ color: '#c0392b', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
            </div>
          ))}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 8, alignItems: 'end' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">已使用金额</label>
              <input className="form-input" type="number" value={form.healthFund?.used} onChange={e => setFund('used', e.target.value)} placeholder="0" />
            </div>
            <div style={{ fontSize: 13, color: '#888', paddingBottom: 8 }}>基金总额：<b style={{ color: '#1A2B24' }}>¥{fundTotal.toLocaleString()}</b></div>
            <div style={{ fontSize: 13, color: '#888', paddingBottom: 8 }}>可用余额：<b style={{ color: fundBalance < 0 ? '#c0392b' : '#1E6B50' }}>¥{fundBalance.toLocaleString()}</b></div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
        </div>
      </div>
    </div>
  )
}
