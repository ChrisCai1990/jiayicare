import React from 'react'
import { ChecklistAttachments } from './ServiceTaskChecklist'

export const medicalProxyStage = task => task?.sourceType === 'order' && String(task.workflowKey || '').startsWith('medical_proxy:')
  ? String(task.workflowKey).slice('medical_proxy:'.length) : ''

const fields = {
  advisor: [
    ['hospital', '代诊医院'], ['department', '科室'], ['expert', '专家'],
    ['proxyGoal', '代诊目标'], ['communicationContent', '与医生交流的内容'],
  ],
  execute: [['executionResult', '代诊结果、医生反馈和后续事项']],
}

const parseAppointmentRequirement = text => {
  const parts = String(text || '').split(/[；\n]/).map(item => item.trim()).filter(Boolean)
  const take = label => parts.find(item => item.startsWith(`${label}：`))?.slice(label.length + 1) || ''
  const baseParts = parts.filter(item => !/^(院区|门诊类型|费用与保险|保险公司|结算方式)：/.test(item))
  return {
    baseContent: baseParts.join('；'), campus: take('院区'),
    clinicType: ({ '普通门诊': 'general', '专家门诊': 'expert', '特需门诊': 'special', '国际门诊': 'international' })[take('门诊类型')] || '',
    insuranceUse: ({ '自费': 'self_pay', '医保': 'medical_insurance', '商保': 'commercial_insurance', '使用高端医疗险': 'high_end' })[take('费用与保险')] || '',
    insurerName: take('保险公司'),
    settlementMethod: ({ '直付': 'direct', '先付后报': 'reimbursement', '待核实': 'pending' })[take('结算方式')] || 'pending',
  }
}

const formatAppointmentRequirement = data => [
  data.baseContent,
  data.campus && `院区：${data.campus}`,
  data.clinicType && `门诊类型：${({ general: '普通门诊', expert: '专家门诊', special: '特需门诊', international: '国际门诊' })[data.clinicType] || '待核实'}`,
  data.insuranceUse && `费用与保险：${({ self_pay: '自费', medical_insurance: '医保', commercial_insurance: '商保', high_end: '使用高端医疗险' })[data.insuranceUse] || '待核实'}`,
  ['high_end', 'commercial_insurance'].includes(data.insuranceUse) && data.insurerName && `保险公司：${data.insurerName}`,
  ['high_end', 'commercial_insurance'].includes(data.insuranceUse) && `结算方式：${({ direct: '直付', reimbursement: '先付后报' })[data.settlementMethod] || '待核实'}`,
].filter(Boolean).join('；')

export function validateMedicalProxyStage(stage, value) {
  if (stage === 'collect' && (!value.customerNeed?.trim() || !value.materialSummary?.trim() || !value.communicationDate?.trim() || !value.communicationTimeStart?.trim() || !value.communicationTimeEnd?.trim() || !value.reportIds?.length)) return '请填写诉求、预期沟通时段和资料清单，选定至少一份本次服务资料'
  if (stage === 'collect' && value.communicationTimeEnd <= value.communicationTimeStart) return '预期沟通结束时间必须晚于开始时间'
  if (stage === 'intake' && (!value.customerNeed?.trim() || !value.materialSummary?.trim() || !value.reportIds?.length)) return '请填写诉求和资料清单，选定至少一份已审核资料'
  if (stage === 'audit' && !value.auditSummary?.trim()) return '请完成所选资料审核并填写审核结论'
  if (stage === 'advisor' && value.medicalPlanning && ['problemAnalysis', 'expertRecommendation1', 'expertRecommendation2'].some(key => !value[key]?.trim())) return '请填写问题分析，并至少推荐两位专家（注明各自所在医院和科室）'
  if (stage === 'supervise' && value.medicalPlanning && (!value.customerCommunicationSummary?.trim() || !['no_additional_service', 'additional_service_needed'].includes(value.planningOutcome))) return '请记录客户沟通结果并确认是否需要其他就医协助服务'
  if (stage === 'supervise' && value.medicalPlanning && value.planningOutcome === 'additional_service_needed' && !value.additionalServiceNote?.trim()) return '请记录拟启用的服务及后续安排'
  if (stage === 'advisor' && !value.medicalPlanning && fields.advisor.some(([key]) => !value[key]?.trim())) return '请完整填写医院、科室、专家、代诊目标及交流内容'
  if (stage === 'advisor' && value.auditSnapshot?.collectionSnapshot?.annualMember && !value.selectedReportIds?.length) return '请从本次已审核资料中选择制定方案所用资料'
  if (stage === 'planner' && !value.medicalAssistantId) return '请指派就医专员'
  if (stage === 'booking' && ['preferredDateStart', 'preferredDateEnd', 'appointmentDate', 'appointmentTime'].some(key => !value[key]?.trim())) return '请完整填写客户期望日期区间和实际约诊日期时间'
  if (stage === 'booking' && (value.appointmentDate < value.preferredDateStart || value.appointmentDate > value.preferredDateEnd) && !value.dateDifferenceNote?.trim()) return '约诊日期不在客户期望区间内，请说明差异及客户确认情况'
  const supplementProxy = value.supplementProxy === true || /代配营养素/.test(`${value.planSnapshot?.serviceName || ''} ${value.planSnapshot?.serviceContent || ''}`)
  if (stage === 'booking' && (value.medicationProxy === true || /代配药|代取药/.test(`${value.planSnapshot?.serviceName || ''} ${value.planSnapshot?.serviceContent || ''}`)) && ['medicationName', 'medicationBrand', 'medicationSpecification', 'medicationQuantity'].some(key => !value[key]?.trim())) return '请先确认药品名、商品名/品牌、规格和配备数量'
  if (stage === 'booking' && supplementProxy && ['supplementName', 'supplementBrand', 'supplementSpecification', 'supplementQuantity'].some(key => !value[key]?.trim())) return '请先确认营养素名称、品牌、规格和购买数量'
  if (stage === 'booking' && (value.medicationProxy === true || supplementProxy || /代配药|代取药/.test(`${value.planSnapshot?.serviceName || ''} ${value.planSnapshot?.serviceContent || ''}`)) && !['self_pay', 'medical_insurance', 'commercial_insurance'].includes(value.paymentMethod)) return '请选择支付方式'
  if (stage === 'booking' && value.paymentMethod === 'medical_insurance' && !['electronic', 'physical'].includes(value.medicalInsuranceCardType)) return '请确认使用电子医保卡还是实体医保卡'
  if (stage === 'booking' && /(?:保险类型：高端险|费用与保险：(使用高端医疗险|商保))/.test(value.planSnapshot?.serviceContent || '') && !['direct_verified', 'reimbursement_verified', 'self_pay_confirmed'].includes(value.insuranceOutcome)) return '请核实商保结算方式，并记录最终办理结果'
  const appointmentRequirement = stage === 'appointment_review' ? { ...parseAppointmentRequirement(value.serviceContent), ...value } : null
  if (stage === 'appointment_review' && (!appointmentRequirement.baseContent?.trim() || ['clinicType', 'insuranceUse'].some(key => !appointmentRequirement[key]?.trim()) || !value.preferredDateStart || !value.preferredDateEnd || value.preferredDateEnd < value.preferredDateStart)) return '请保留原约诊需求，并完善门诊类型、费用与保险及期望日期区间'
  if (stage === 'post_visit_audit' && (!value.reportIds?.length && !value.noMaterialsConfirmed)) return '请选择就诊后资料，或确认本次无资料'
  if (stage === 'post_visit_audit' && !value.auditSummary?.trim()) return '请填写健管专员审核结论'
  if (stage === 'post_visit_review' && !value.reviewSummary?.trim()) return '请查看报告并填写健康顾问查看结论'
  const hasAttachment = key => value[key]?.some(file => file?.url)
  const executionFailed = value.executionOutcome === 'failed'
  const medicationProxy = value.medicationProxy === true || /代配药|代取药/.test(`${value.planSnapshot?.serviceName || ''} ${value.planSnapshot?.serviceContent || ''}`)
  const medicalEscort = value.medicalEscort === true || value.planSnapshot?.medicalEscort === true || /陪同就医|就医陪同|陪同看诊|陪同检查|陪同体检|陪同治疗/.test(`${value.planSnapshot?.serviceName || ''} ${value.planSnapshot?.serviceContent || ''}`)
  if (stage === 'execute' && !['success', 'failed'].includes(value.executionOutcome)) return '请选择本次服务是否执行成功'
  if (stage === 'execute' && !value.executionResult?.trim()) return executionFailed ? '请填写未执行成功的原因和后续处理说明' : '请填写执行结果'
  if (stage === 'execute' && !executionFailed && medicationProxy && !['medicationPhotoAttachments', 'medicationInstructionAttachments', 'medicalRecordAttachments', 'chargeReceiptAttachments'].every(hasAttachment)) return '执行成功时，请分别上传药品照片、药品服用单、病历和收费单'
  if (stage === 'execute' && !executionFailed && supplementProxy && !['supplementPhotoAttachments', 'chargeReceiptAttachments'].every(hasAttachment)) return '执行成功时，请上传产品照片和购买凭证'
  if (stage === 'execute' && !executionFailed && medicalEscort && !['medicalRecordAttachments', 'prescriptionAttachments', 'examReportAttachments'].some(hasAttachment)) return '执行成功时，请按资料类型上传至少一份陪同资料'
  if (stage === 'execute' && !executionFailed && !medicalEscort && !medicationProxy && !supplementProxy && !hasAttachment('medicalRecordAttachments')) return '执行成功时，请上传至少一份代诊病历'
  if (stage === 'resolution' && !['online', 'pharmacy', 'other_hospital', 'refund'].includes(value.resolutionType)) return '请选择异常解决方案'
  if (stage === 'resolution' && value.resolutionType !== 'refund' && !['customer', 'staff'].includes(value.purchaseActor)) return '请选择实际采购主体'
  if (stage === 'resolution' && value.resolutionType !== 'refund' && !value.purchaseChannel?.trim()) return '请填写实际采购渠道或平台'
  if (stage === 'resolution' && (!value.resolutionPlan?.trim() || !(value.resolutionResult || value.fulfillmentProof)?.trim())) return '请填写解决方案和实际处理结果及配药/采购凭据说明'
  if (stage === 'resolution' && !value.customerConfirmed) return '请确认客户已同意并确认处理结果'
  if (stage === 'resolution' && value.resolutionType !== 'refund' && !value.deliveryArrangement?.trim()) return '请填写配送或交付安排'
  return ''
}

export default function MedicalProxyStageForm({ task, value = {}, onChange, reports = [], staffList = [], onOpenReport }) {
  const stage = medicalProxyStage(task)
  const appointmentRequirementText = value.planSnapshot?.serviceContent || task?.formData?.planSnapshot?.serviceContent || task?.sourceOrderId?.serviceRequirements || ''
  const appointmentRequirement = parseAppointmentRequirement(appointmentRequirementText)
  const isExpertAppointment = /专家约诊|专家门诊预约/.test(`${task?.theme || ''} ${task?.sourceOrderId?.serviceName || ''}`)
  const isHighEndInsurance = /(?:保险类型：高端险|费用与保险：(使用高端医疗险|商保))/.test(appointmentRequirementText)
  const isMedicationProxy = value.medicationProxy === true || /代配药|代取药/.test(`${task?.theme || ''} ${task?.sourceOrderId?.serviceName || ''}`)
  const isSupplementProxy = value.supplementProxy === true || /代配营养素/.test(`${task?.theme || ''} ${task?.sourceOrderId?.serviceName || ''}`)
  const isMedicalEscort = value.medicalEscort === true || value.planSnapshot?.medicalEscort === true || task?.formData?.medicalEscort === true || task?.sourceOrderId?.medicalProxyPlan?.medicalEscort === true || /陪同就医|就医陪同|陪同看诊|陪同检查|陪同体检|陪同治疗/.test(`${task?.theme || ''} ${task?.sourceOrderId?.serviceName || ''}`)
  const isSupplyProxy = isMedicationProxy || isSupplementProxy
  const set = (key, item) => onChange({ ...value, [key]: item })
  const input = (key, label, rows = 1, type = 'text') => <label key={key} style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
    {label}
    {rows > 1
      ? <textarea className="form-control" rows={rows} value={value[key] || ''} onChange={e => set(key, e.target.value)} />
      : <input className="form-control" type={type} value={value[key] || ''} onChange={e => set(key, e.target.value)} />}
  </label>
  const escortPlan = value.planSnapshot?.medicalEscort === true ? value.planSnapshot : value.medicalEscort === true ? value : task?.formData?.planSnapshot?.medicalEscort === true ? task.formData.planSnapshot : task?.sourceOrderId?.medicalProxyPlan || value.planSnapshot || {}
  const escortSummary = <div style={{ display: 'grid', gap: 7, background: '#F5F8F6', border: '1px solid #DCE8E1', borderRadius: 8, padding: 12, fontSize: 13 }}>
    <div style={{ fontWeight: 700, color: '#1E6B50' }}>{escortPlan.adHocConsultation ? '客户现场确认的临时加诊信息' : '健康顾问提交的陪同服务信息'}</div>
    <div>陪同类型：{({ consultation: '陪同看诊', exam: '陪同检查', checkup: '陪同体检', treatment: '陪同治疗' })[escortPlan.escortCategory] || escortPlan.escortCategory || '未填写'}</div>
    <div>服务时间：{escortPlan.escortDate || '未填写'} {escortPlan.escortTime || ''}</div>
    <div>医院：{escortPlan.hospital || '未填写'}{escortPlan.campus ? ` · ${escortPlan.campus}` : ''}</div>
    {escortPlan.escortCategory === 'exam' && Array.isArray(escortPlan.escortExams) && escortPlan.escortExams.length ? escortPlan.escortExams.map((exam, index) => <div key={index} style={{ padding: 8, border: '1px solid #DCE8E1', borderRadius: 6 }}><strong>检查 {index + 1}：{exam.item}</strong><div>检查科室/地点：{exam.department || '待确认'}{exam.expert ? ` · 专家：${exam.expert}` : ''}{exam.time ? ` · 时间：${exam.time}` : ''}</div><div>检查前注意事项：{exam.precautions || '待与检查机构核实'}</div></div>) : escortPlan.escortCategory === 'treatment' && Array.isArray(escortPlan.escortTreatments) && escortPlan.escortTreatments.length ? escortPlan.escortTreatments.map((item, index) => <div key={index} style={{ padding: 8, border: '1px solid #DCE8E1', borderRadius: 6 }}><strong>治疗 {index + 1}：{item.item}</strong><div>治疗科室/地点：{item.department || '待确认'}{item.time ? ` · 时间：${item.time}` : ''}{item.course ? ` · ${item.course}` : ''}</div><div>医嘱/治疗依据：{item.medicalOrder || '未填写'}</div><div>治疗前注意事项：{item.precautions || '待与治疗机构核实'}</div></div>) : Array.isArray(escortPlan.escortDepartments) && escortPlan.escortDepartments.length ? escortPlan.escortDepartments.map((item, index) => <div key={index}>就诊安排 {index + 1}：{item.department || '未填写科室'}{item.expert ? ` · 专家：${item.expert}` : ''}{item.time ? ` · 到诊：${item.time}` : ''}</div>) : <><div>科室：{escortPlan.department || '未填写'}</div>{escortPlan.expert && <div>专家：{escortPlan.expert}</div>}</>}
    {escortPlan.adHocConsultation && <div>费用告知：{escortPlan.costNotice || '未填写'}</div>}
    <div>具体服务事项：{escortPlan.escortGoal || '未填写'}</div>
    <div>交通接送：{escortPlan.transport || '未填写'}</div>
    <div>酒店安排：{escortPlan.hotel || '未填写'}</div>
    <div>备注：{escortPlan.notes || '无'}</div>
  </div>
  if (stage === 'appointment_review') {
    const requirement = { ...parseAppointmentRequirement(value.serviceContent), ...value }
    const setRequirement = (key, item) => {
      const next = { ...requirement, [key]: item }
      onChange({ ...value, ...next, serviceContent: formatAppointmentRequirement(next) })
    }
    const requirementInput = (key, label, placeholder = '') => <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>{label}<input className="form-control" value={requirement[key] || ''} placeholder={placeholder} onChange={e => setRequirement(key, e.target.value)} /></label>
    return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ fontSize: 12, color: '#8A6D3B' }}>本任务由原约诊环节回退。原来的医院、科室、专家和日期均已保留，只需完善新增类目；提交后重新流转给健管专员预约。</div>
    <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>原约诊需求（已自动带入，可修正）<textarea className="form-control" rows={3} value={requirement.baseContent || ''} onChange={e => setRequirement('baseContent', e.target.value)} /></label>
    {requirementInput('campus', '院区（新增）', '如：庆春院区')}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>门诊类型 *<select className="form-control" value={requirement.clinicType || ''} onChange={e => setRequirement('clinicType', e.target.value)}><option value="">请选择</option><option value="general">普通门诊</option><option value="expert">专家门诊</option><option value="special">特需门诊</option><option value="international">国际门诊</option></select></label>
      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>费用与保险 *<select className="form-control" value={requirement.insuranceUse || ''} onChange={e => setRequirement('insuranceUse', e.target.value)}><option value="">请选择</option><option value="self_pay">自费</option><option value="medical_insurance">医保</option><option value="commercial_insurance">商保</option>{requirement.insuranceUse === 'high_end' && <option value="high_end">高端医疗险（历史方案）</option>}</select></label>
    </div>
    {['high_end', 'commercial_insurance'].includes(requirement.insuranceUse) && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{requirementInput('insurerName', '保险公司')}<label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>结算方式<select className="form-control" value={requirement.settlementMethod || 'pending'} onChange={e => setRequirement('settlementMethod', e.target.value)}><option value="pending">待核实</option><option value="direct">直付</option><option value="reimbursement">先付后报</option></select></label></div>}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{input('preferredDateStart', '期望开始日期', 1, 'date')}{input('preferredDateEnd', '期望结束日期', 1, 'date')}</div>
  </div>
  }
  if (stage === 'post_visit_audit') {
    const submittedAttachments = ['medicalRecordAttachments', 'prescriptionAttachments', 'examReportAttachments'].flatMap(key => value.executionSnapshot?.[key] || [])
    const submittedReportIds = new Set((submittedAttachments.length ? value.reportIds || [] : []).map(String))
    const eligible = reports.filter(report => isMedicalEscort
      ? submittedReportIds.has(String(report._id))
      : (!value.appointmentAt || new Date(report.createdAt) >= new Date(value.appointmentAt)))
    return <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 13, color: '#63766D' }}>{isMedicalEscort ? '请审核就医专员上传的陪同资料，确认资料完整并完成归档后结束本次陪同服务。' : '等待客户就诊后上传病历和检查报告。请先在报告管理审核，再选定本次资料交健康顾问查看。'}</div>
      {isMedicalEscort && <div style={{ display: 'grid', gap: 7, background: '#F5F8F6', border: '1px solid #DCE8E1', borderRadius: 8, padding: 12, fontSize: 13 }}>
        <div style={{ fontWeight: 700, color: '#1E6B50' }}>就医专员本次提交内容</div>
        <div style={{ whiteSpace: 'pre-wrap' }}>陪同执行结果、现场情况和后续事项：{value.executionSnapshot?.executionResult || '未填写'}</div>
        <div>提交资料：{submittedAttachments.length} 份（病历、处方和检验检查报告已分类，请在下方逐份打开审核）</div>
      </div>}
      {!eligible.length && <div style={{ color: '#B45309', fontSize: 13 }}>暂无本次就诊后上传的报告。</div>}
      {eligible.map(report => <label key={report._id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={(value.reportIds || []).map(String).includes(String(report._id))} onChange={e => set('reportIds', e.target.checked ? [...new Set([...(value.reportIds || []), String(report._id)])] : (value.reportIds || []).filter(id => String(id) !== String(report._id)))} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenReport?.(report._id, report.title)}>{report.title || '报告'}</button>
        <span style={{ color: report.audit_status === 'audited' ? '#1E6B50' : '#B45309' }}>{report.audit_status === 'audited' ? '已审核' : '待审核'}</span>
      </label>)}
      <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!value.noMaterialsConfirmed} onChange={e => onChange({ ...value, noMaterialsConfirmed: e.target.checked, reportIds: e.target.checked ? [] : (value.reportIds || []) })} /> {isMedicalEscort ? '本次陪同确认没有报告、病历或其他资料需要归档' : '本次客户及健管专员确认没有检查资料或病历可上传'}</label>
      {input('auditSummary', '健管专员审核结论', 3)}
    </div>
  }
  if (stage === 'post_visit_review') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ fontSize: 13, color: '#63766D' }}>请逐份查看健管专员审核后的病历和检查报告，确认后结束本项服务。</div>
    {(value.auditSnapshot?.reportIds || []).map(id => { const report = reports.find(item => String(item._id) === String(id)); return <button key={id} type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenReport?.(id, report?.title)}>{report?.title || '查看本次报告'}</button> })}
    {value.auditSnapshot?.auditSummary && <div style={{ fontSize: 13 }}>健管审核结论：{value.auditSnapshot.auditSummary}</div>}
    {input('reviewSummary', '健康顾问查看结论', 3)}
  </div>
  if (stage === 'collect' || stage === 'intake') {
    const availableReports = reports.filter(report => stage !== 'intake' || report.audit_status === 'audited')
    const carriedIds = new Set((value.carriedReportIds || []).map(String))
    const carriedReports = availableReports.filter(report => carriedIds.has(String(report._id)))
    const otherReports = availableReports.filter(report => !carriedIds.has(String(report._id)))
    const reportOption = report => <label key={report._id} style={{ fontSize: 13 }}>
      <input type="checkbox" checked={(value.reportIds || []).map(String).includes(String(report._id))} onChange={e => set('reportIds', e.target.checked ? [...new Set([...(value.reportIds || []).map(String), String(report._id)])] : (value.reportIds || []).filter(id => String(id) !== String(report._id)))} /> {report.title || report.type || '资料'} · {report.checkDate || report.date || ''}
      <span style={{ color: report.audit_status === 'audited' ? '#1E6B50' : '#B45309', marginLeft: 6 }}>{report.audit_status === 'audited' ? '已审核' : '待健管审核'}</span>
    </label>
    return <div style={{ display: 'grid', gap: 12 }}>
    {input('customerNeed', '客户本次诉求', 3)}
    {stage === 'collect' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
      {input('communicationDate', '预期沟通日期', 1, 'date')}
      {input('communicationTimeStart', '可沟通开始时间', 1, 'time')}
      {input('communicationTimeEnd', '可沟通结束时间', 1, 'time')}
    </div>}
    {input('materialSummary', '本次需准备的病历、报告、用药、身份医保与问题清单；缺失项请写明', 4)}
    {!!carriedReports.length && <div style={{ display: 'grid', gap: 7, padding: 10, borderRadius: 8, background: '#EFF8F4', border: '1px solid #B2D8C7' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1E6B50' }}>已从最近一次关联服务自动带入</div>
      {carriedReports.map(reportOption)}
    </div>}
    <div style={{ fontSize: 13, fontWeight: 600 }}>{carriedReports.length ? '其他资料（按本次需求补选）' : '选定客户本次上传或已有的相关资料'}</div>
    {otherReports.map(reportOption)}
    {!reports.length && <div style={{ color: '#B45309', fontSize: 13 }}>请先指导客户上传资料，再返回本任务选定。</div>}
  </div>
  }
  if (stage === 'audit') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>客户诉求：{value.collectionSnapshot?.customerNeed}<br />预期沟通时段：{value.collectionSnapshot?.communicationDate || '待确认'} {value.collectionSnapshot?.communicationTimeStart || ''}–{value.collectionSnapshot?.communicationTimeEnd || ''}<br />资料清单：{value.collectionSnapshot?.materialSummary}</div>
    <div style={{ fontSize: 13, fontWeight: 700 }}>本次待审核资料</div>
    {(value.collectionSnapshot?.reportIds || []).map(id => {
      const report = reports.find(item => String(item._id) === String(id))
      return <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenReport?.(id, report?.title)}>{report?.title || '查看资料'}</button>
        <span style={{ fontSize: 12, color: report?.audit_status === 'audited' ? '#1E6B50' : '#B45309' }}>{report?.audit_status === 'audited' ? '已审核' : '请先审核'}</span></div>
    })}
    {input('auditSummary', '健管专员审核结论与待补事项', 3)}
  </div>
  if (stage === 'advisor' && value.medicalPlanning) return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>
      <div>本次服务内容：{value.serviceContent || '待确认'}</div>
      <div>客户诉求：{value.customerNeed || '待确认'}</div>
      <div>预期沟通时段：{value.communicationDate || '待确认'} {value.communicationTimeStart || ''}–{value.communicationTimeEnd || ''}</div>
    </div>
    <div style={{ color: '#B45309', fontSize: 12 }}>客户上传的报告须由健管专员审核后，才能作为已审核资料使用。</div>
    {input('problemAnalysis', '问题分析', 4)}
    {input('expertRecommendation1', '推荐专家 1（姓名及所在医院、科室）', 2)}
    {input('expertRecommendation2', '推荐专家 2（姓名及所在医院、科室）', 2)}
    {input('expertRecommendation3', '推荐专家 3（姓名及所在医院、科室；选填）', 2)}
    {input('planningRemarks', '备注（选填）', 3)}
  </div>
  if (stage === 'supervise' && /就医规划/.test(`${task?.theme || ''} ${task?.sourceOrderId?.serviceName || ''}`)) {
    const plan = value.advisorSnapshot || {}
    return <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>
        {plan.problemAnalysis ? <><div>问题分析：{plan.problemAnalysis}</div><div>推荐专家（含所在医院、科室）：{[plan.expertRecommendation1, plan.expertRecommendation2, plan.expertRecommendation3].filter(Boolean).join('；')}</div>{plan.planningRemarks && <div>备注：{plan.planningRemarks}</div>}</> : <div>等待健康顾问完成就医规划建议；当前督办任务保持进行中。</div>}
      </div>
      {input('customerCommunicationSummary', '与客户沟通规划建议的结果', 4)}
      <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>是否需要其他就医协助服务
        <select className="form-control" value={value.planningOutcome || ''} onChange={e => set('planningOutcome', e.target.value)}>
          <option value="">请选择</option><option value="no_additional_service">不需要，结束本次就医规划</option><option value="additional_service_needed">需要，后续另行启用服务</option>
        </select>
      </label>
      {value.planningOutcome === 'additional_service_needed' && input('additionalServiceNote', '拟启用的服务及后续安排（不会自动下单）', 3)}
    </div>
  }
  if (stage === 'advisor') return <div style={{ display: 'grid', gap: 12 }}>
    {(value.auditSnapshot?.collectionSnapshot?.materialSummary || value.intakeSnapshot?.materialSummary) && <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>客户诉求：{value.auditSnapshot?.collectionSnapshot?.customerNeed || value.intakeSnapshot?.customerNeed}<br />预期沟通时段：{value.auditSnapshot?.collectionSnapshot?.communicationDate || value.intakeSnapshot?.communicationDate || '待确认'} {value.auditSnapshot?.collectionSnapshot?.communicationTimeStart || value.intakeSnapshot?.communicationTimeStart || ''}–{value.auditSnapshot?.collectionSnapshot?.communicationTimeEnd || value.intakeSnapshot?.communicationTimeEnd || ''}<br />资料清单：{value.auditSnapshot?.collectionSnapshot?.materialSummary || value.intakeSnapshot?.materialSummary}<br />健管审核：{value.auditSnapshot?.auditSummary || '已审核'}</div>}
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 13, fontWeight: 700 }}>本次已审核资料{value.auditSnapshot?.collectionSnapshot?.annualMember ? '（年度会员：请选定制定方案所用资料）' : ''}</div>
      {(value.auditSnapshot?.collectionSnapshot?.reportIds || value.intakeSnapshot?.reportIds || []).map(id => {
        const report = reports.find(item => String(item._id) === String(id))
        return <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {value.auditSnapshot?.collectionSnapshot?.annualMember && <input type="checkbox" checked={(value.selectedReportIds || []).includes(id)} onChange={e => set('selectedReportIds', e.target.checked ? [...(value.selectedReportIds || []), id] : (value.selectedReportIds || []).filter(item => item !== id))} />}
          <button type="button" className="btn btn-secondary btn-sm" style={{ textAlign: 'left' }} onClick={() => onOpenReport?.(id, report?.title)}>查看 {report?.title || '已审核资料'} {report?.checkDate || report?.date || ''}</button>
        </div>
      })}
    </div>
    {fields.advisor.map(([key, label]) => input(key, label, key === 'proxyGoal' || key === 'communicationContent' ? 3 : 1))}
  </div>
  if (stage === 'planner') {
    const booking = { ...(task?.sourceOrderId?.medicalProxyPlan?.booking || {}), ...(value.bookingSnapshot?.planSnapshot?.booking || {}), ...(value.bookingSnapshot || {}) }
    const paymentLabel = ({ self_pay: '自费', medical_insurance: `医保（${({ electronic: '电子医保卡', physical: '实体医保卡' })[booking.medicalInsuranceCardType] || '未确认卡类型'}）`, commercial_insurance: '商保' })[booking.paymentMethod] || '未填写'
    return <div style={{ display: 'grid', gap: 12 }}>
    {isMedicalEscort ? escortSummary : <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>
      {isSupplyProxy ? <>
        <div>配药医院：{value.planSnapshot?.hospital || '待确认'} {booking.campus || value.planSnapshot?.campus || ''}</div>
        <div>配药科室：{value.planSnapshot?.department || '待确认'}；配药专家：{value.planSnapshot?.expert || '无'}</div>
        <div>{isSupplementProxy ? '营养素' : '配备药物'}：{isSupplementProxy ? (value.planSnapshot?.supplementName || booking.supplementName) : (value.planSnapshot?.medicationName || booking.medicationName) || '待确认'}；品牌：{isSupplementProxy ? (value.planSnapshot?.supplementBrand || booking.supplementBrand) : (value.planSnapshot?.medicationBrand || booking.medicationBrand) || '待确认'}</div>
        <div>规格：{isSupplementProxy ? (value.planSnapshot?.supplementSpecification || booking.supplementSpecification) : (value.planSnapshot?.medicationSpecification || booking.medicationSpecification) || '待确认'}；数量：{isSupplementProxy ? (value.planSnapshot?.supplementQuantity || booking.supplementQuantity) : (value.planSnapshot?.medicationQuantity || booking.medicationQuantity) || '待确认'}</div>
        <div>代办日期：{booking.appointmentDate || '未填写'} {booking.appointmentTime || ''}</div>
        <div>支付方式：{paymentLabel}</div>
      </> : ['hospital', 'department', 'expert', 'proxyGoal', 'communicationContent'].map((key, i) => <div key={key}>{['医院', '科室', '专家', '代诊目标', '交流内容'][i]}：{value.planSnapshot?.[key] || '待确认'}</div>)}
    </div>}
    {!isSupplyProxy && !isMedicalEscort && <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>
      <div>实际预约：{booking.appointmentDate || '待预约'} {booking.appointmentTime || ''}</div>
      <div>客户期望：{booking.preferredDateStart || '未记录'} 至 {booking.preferredDateEnd || '未记录'}</div>
      {booking.campus && <div>院区：{booking.campus}</div>}
      {booking.dateDifferenceNote && <div>日期差异确认：{booking.dateDifferenceNote}</div>}
      {booking.additionalNote && <div>预约备注：{booking.additionalNote}</div>}
      {(value.planSnapshot?.selectedReportIds || []).map(id => <button key={id} type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenReport?.(id, reports.find(report => String(report._id) === String(id))?.title)}>查看顾问选定资料</button>)}
    </div>}
    <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>{isMedicalEscort ? '安排陪同就医专员' : isSupplyProxy ? `安排${isSupplementProxy ? '营养素采购' : '配药'}执行人员` : '指派就医专员'}
      <select className="form-control" value={value.medicalAssistantId || ''} onChange={e => set('medicalAssistantId', e.target.value)}>
        <option value="">请选择</option>
        {staffList.filter(staff => staff.role === 'medicalAssistant' && staff.staffStatus !== 'inactive').map(staff => <option key={staff._id} value={staff._id}>{staff.name}</option>)}
      </select>
    </label>
  </div>
  }
  if (stage === 'booking') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>
      {appointmentRequirementText ? <div>约诊需求：{appointmentRequirementText}</div> : ['hospital', 'department', 'expert', 'proxyGoal', 'communicationContent'].map((key, i) => <div key={key}>{['医院', '科室', '专家', '代诊目标', '交流内容'][i]}：{value.planSnapshot?.[key] || '待确认'}</div>)}
    </div>
    {isExpertAppointment && input('campus', '院区 *')}
    {isSupplyProxy && <div style={{ display: 'grid', gap: 10, padding: 12, borderRadius: 8, background: '#FFF8ED', border: '1px solid #F2D4A7' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#8A4B08' }}>{isSupplementProxy ? '营养素采购' : '配药'}清单（流转前必须确认）</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {input(isSupplementProxy ? 'supplementName' : 'medicationName', isSupplementProxy ? '营养素名称 *' : '药品名/通用名 *')}
        {input(isSupplementProxy ? 'supplementBrand' : 'medicationBrand', '品牌 *')}
        {input(isSupplementProxy ? 'supplementSpecification' : 'medicationSpecification', '规格 *')}
        {input(isSupplementProxy ? 'supplementQuantity' : 'medicationQuantity', isSupplementProxy ? '购买数量 *' : '配备数量 *')}
      </div>
    </div>}
    {isSupplyProxy && <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>支付方式 *
      <select className="form-control" value={value.paymentMethod || ''} onChange={e => onChange({ ...value, paymentMethod: e.target.value, medicalInsuranceCardType: e.target.value === 'medical_insurance' ? value.medicalInsuranceCardType : '' })}>
        <option value="">请选择</option><option value="self_pay">自费</option>{!isSupplementProxy && <option value="medical_insurance">医保</option>}<option value="commercial_insurance">商保</option>
      </select>
    </label>}
    {isMedicationProxy && value.paymentMethod === 'medical_insurance' && <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>医保凭证类型 *
      <select className="form-control" value={value.medicalInsuranceCardType || ''} onChange={e => set('medicalInsuranceCardType', e.target.value)}>
        <option value="">请选择</option><option value="electronic">电子医保卡</option><option value="physical">实体医保卡</option>
      </select>
    </label>}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {input('preferredDateStart', '客户期望日期（开始）', 1, 'date')}
      {input('preferredDateEnd', '客户期望日期（结束）', 1, 'date')}
    </div>
    {input('appointmentDate', '专家实际出诊及约诊日期', 1, 'date')}
    {input('appointmentTime', '实际约诊时间', 1, 'time')}
    {value.appointmentDate && value.preferredDateStart && value.preferredDateEnd && (value.appointmentDate < value.preferredDateStart || value.appointmentDate > value.preferredDateEnd) && input('dateDifferenceNote', '超出期望区间说明及客户确认情况', 3)}
    {isHighEndInsurance && <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
      商保实际结算核实结果 *
      <span style={{ color: '#63766D', fontSize: 12, fontWeight: 400 }}>健康顾问记录的客户期望：{({ direct: '直付', reimbursement: '先付后报', pending: '待确认' })[appointmentRequirement.settlementMethod] || '待确认'}。请按医院或保险方的实际答复确认。</span>
      <select className="form-control" value={value.insuranceOutcome || ''} onChange={e => set('insuranceOutcome', e.target.value)}>
        <option value="">请选择核实结果</option><option value="direct_verified">已核实可直付</option><option value="reimbursement_verified">已核实先付后报</option><option value="self_pay_confirmed">保险不适用，客户确认自费</option>
      </select>
    </label>}
    {value.planSnapshot?.initiationSource === 'staff_direct' && !isSupplyProxy && !isExpertAppointment && !isMedicalEscort && <div style={{ fontSize: 13, color: '#63766D' }}>预约完成后自动交健康规划师核对资料并指派就医专员，无需健管专员重复派单。</div>}
  </div>
  if (stage === 'execute') {
    const booking = { ...(task?.sourceOrderId?.medicalProxyPlan?.booking || {}), ...(value.bookingSnapshot?.planSnapshot?.booking || {}), ...(value.bookingSnapshot || {}) }
    const paymentLabel = ({ self_pay: '自费', medical_insurance: `医保（${({ electronic: '电子医保卡', physical: '实体医保卡' })[booking.medicalInsuranceCardType] || '未确认卡类型'}）`, commercial_insurance: '商保' })[booking.paymentMethod] || '未填写'
    return <div style={{ display: 'grid', gap: 12 }}>
    {isMedicalEscort ? escortSummary : <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>
      {isSupplyProxy ? <>
        <div>配药医院：{value.planSnapshot?.hospital || '未填写'} {booking.campus || value.planSnapshot?.campus || ''}</div>
        <div>配药科室：{value.planSnapshot?.department || '未填写'}；配药专家：{value.planSnapshot?.expert || '无'}</div>
        <div>配备药物：{value.planSnapshot?.medicationName || booking.medicationName || '未填写'}；商品名/品牌：{value.planSnapshot?.medicationBrand || booking.medicationBrand || '未填写'}</div>
        <div>规格：{value.planSnapshot?.medicationSpecification || booking.medicationSpecification || '未填写'}；数量：{value.planSnapshot?.medicationQuantity || booking.medicationQuantity || '未填写'}</div>
        <div>配药代办日期：{booking.appointmentDate || '未填写'} {booking.appointmentTime || ''}</div>
        <div>支付方式：{paymentLabel}</div>
      </> : <>
        {['hospital', 'department', 'expert', 'proxyGoal', 'communicationContent'].map((key, i) => <div key={key}>{['代诊医院', '科室', '专家', '代诊目标', '与医生交流内容'][i]}：{value.planSnapshot?.[key] || '未填写'}</div>)}
        <div style={{ marginTop: 8 }}>客户期望日期区间：{booking.preferredDateStart || '未填写'} 至 {booking.preferredDateEnd || '未填写'}</div>
        <div>专家实际出诊及约诊时间：{booking.appointmentDate || '未填写'} {booking.appointmentTime || ''}</div>
        {booking.dateDifferenceNote && <div>日期差异确认：{booking.dateDifferenceNote}</div>}
        {booking.additionalNote && <div>预约补充说明：{booking.additionalNote}</div>}
      </>}
    </div>}
    <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>本次服务结果 *
      <select className="form-control" value={value.executionOutcome || ''} onChange={e => set('executionOutcome', e.target.value)}>
        <option value="">请选择</option><option value="success">执行成功</option><option value="failed">未执行成功</option>
      </select>
    </label>
    {value.executionOutcome === 'failed' && <div style={{ color: '#B45309', fontSize: 12 }}>未执行成功时附件不强制上传，请在执行结果中写明原因及后续处理。</div>}
    {input('executionResult', isMedicalEscort ? '陪同执行结果、现场情况和后续事项' : isSupplyProxy ? `${isSupplementProxy ? '购买' : '配药'}结果、数量核对与交付说明` : fields.execute[0][1], 5)}
    {(isMedicalEscort ? [
      ['medicalRecordAttachments', `门诊病历${value.executionOutcome === 'failed' ? '（未成功时选填）' : ''}`, '+ 上传门诊病历'],
      ['prescriptionAttachments', `处方/医嘱单${value.executionOutcome === 'failed' ? '（未成功时选填）' : ''}`, '+ 上传处方/医嘱单'],
      ['examReportAttachments', `检验检查报告${value.executionOutcome === 'failed' ? '（未成功时选填）' : ''}`, '+ 上传检验检查报告'],
    ] : isSupplementProxy ? [
      ['supplementPhotoAttachments', `营养素产品照片（须清晰展示品牌、规格和数量）${value.executionOutcome === 'failed' ? '（未成功时选填）' : ' *'}`, '+ 上传产品照片'],
      ['chargeReceiptAttachments', `购买凭证${value.executionOutcome === 'failed' ? '（未成功时选填）' : ' *'}`, '+ 上传购买凭证'],
    ] : isMedicationProxy ? [
      ['medicationPhotoAttachments', `药品照片（须清晰展示药盒和数量）${value.executionOutcome === 'failed' ? '（未成功时选填）' : ' *'}`, '+ 上传药盒与数量照片'],
      ['medicationInstructionAttachments', `药品服用单（服用方式和方法）${value.executionOutcome === 'failed' ? '（未成功时选填）' : ' *'}`, '+ 上传药品服用单'],
      ['medicalRecordAttachments', `病历${value.executionOutcome === 'failed' ? '（未成功时选填）' : ' *'}`, '+ 上传病历'],
      ['chargeReceiptAttachments', `收费单${value.executionOutcome === 'failed' ? '（未成功时选填）' : ' *'}`, '+ 上传收费单'],
    ] : [['medicalRecordAttachments', '代诊病历附件', '+ 上传代诊病历']]).map(([key, label, uploadLabel]) => <label key={key} style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>{label}
      <ChecklistAttachments item={{ attachments: value[key] || [] }} index={0} mode="executor" update={(_, patch) => set(key, patch.attachments || [])} uploadLabel={uploadLabel} errorLabel={`${label.replace(/ \*$/, '')}上传失败`} />
    </label>)}
  </div>
  }
  if (stage === 'resolution') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ padding: 12, borderRadius: 8, background: '#FFF8ED', border: '1px solid #F2D4A7', fontSize: 13, lineHeight: 1.7 }}><b>就医专员本次执行已结束，未成功代配</b><br />失败原因：{value.failureReason || value.executionSnapshot?.executionResult || '-'}<br />本任务用于直接制定和落实解决方案，不会重新走预约、规划师分配和就医专员执行流程。</div>
    <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>解决方案类型 *<select className="form-control" value={value.resolutionType || ''} onChange={e => set('resolutionType', e.target.value)}><option value="">请选择</option><option value="online">互联网配药/采购</option><option value="pharmacy">其他药房</option><option value="other_hospital">其他医院或门诊</option><option value="refund">无可行渠道，退费结案</option></select></label>
    {value.resolutionType !== 'refund' && <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>实际采购主体 *<select className="form-control" value={value.purchaseActor || ''} onChange={e => set('purchaseActor', e.target.value)}><option value="">请选择</option><option value="customer">指导客户自行采购</option><option value="staff">我方代配/代购</option></select></label>}
    {value.resolutionType !== 'refund' && input('purchaseChannel', value.resolutionType === 'online' ? '实际采购平台 *' : '实际采购渠道 *')}
    {input('resolutionPlan', '解决方案及执行步骤 *', 4)}
    <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>实际处理结果及配药/采购凭据说明 *
      <span style={{ color: '#65776F', fontSize: 12, fontWeight: 400 }}>随访链路中的标准结果会根据上方采购主体和渠道自动生成，此处只填写凭据及补充说明。</span>
      <textarea className="form-control" rows={5} value={value.resolutionResult || value.fulfillmentProof || ''} onChange={e => onChange({ ...value, resolutionResult: e.target.value, fulfillmentProof: '' })} />
    </label>
    {value.resolutionType !== 'refund' && input('deliveryArrangement', '配送或交付安排 *', 3)}
    <label><input type="checkbox" checked={!!value.customerConfirmed} onChange={e => set('customerConfirmed', e.target.checked)} /> 客户已同意该解决方案，并确认实际处理结果</label>
    <div style={{ fontSize: 12, color: '#65776F' }}>提交后结束健管异常解决任务，并同步结束健康规划师督办及本订单。</div>
  </div>
  return null
}
