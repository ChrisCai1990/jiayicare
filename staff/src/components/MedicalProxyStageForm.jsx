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
  if (stage === 'booking' && /费用与保险：使用高端医疗险/.test(value.planSnapshot?.serviceContent || '') && !['direct_verified', 'reimbursement_verified', 'self_pay_confirmed'].includes(value.insuranceOutcome)) return '请核实高端医疗险结算方式，并记录最终办理结果'
  if (stage === 'appointment_review' && (!value.serviceContent?.trim() || !value.preferredDateStart || !value.preferredDateEnd || value.preferredDateEnd < value.preferredDateStart)) return '请核对约诊需求和期望日期区间'
  if (stage === 'post_visit_audit' && (!value.reportIds?.length && !value.noMaterialsConfirmed)) return '请选择就诊后资料，或确认本次无资料'
  if (stage === 'post_visit_audit' && !value.auditSummary?.trim()) return '请填写健管专员审核结论'
  if (stage === 'post_visit_review' && !value.reviewSummary?.trim()) return '请查看报告并填写健康顾问查看结论'
  if (stage === 'execute' && (!value.executionResult?.trim() || !value.medicalRecordAttachments?.length)) return '请填写代诊执行结果并上传至少一份代诊病历'
  return ''
}

export default function MedicalProxyStageForm({ task, value = {}, onChange, reports = [], staffList = [], onOpenReport }) {
  const stage = medicalProxyStage(task)
  const isExpertAppointment = /专家约诊/.test(`${task?.theme || ''} ${task?.sourceOrderId?.serviceName || ''}`)
  const set = (key, item) => onChange({ ...value, [key]: item })
  const input = (key, label, rows = 1, type = 'text') => <label key={key} style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>
    {label}
    {rows > 1
      ? <textarea className="form-control" rows={rows} value={value[key] || ''} onChange={e => set(key, e.target.value)} />
      : <input className="form-control" type={type} value={value[key] || ''} onChange={e => set(key, e.target.value)} />}
  </label>
  if (stage === 'appointment_review') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ fontSize: 12, color: '#8A6D3B' }}>原预约记录会保留；提交后退回健管专员重新确认预约。</div>
    {input('serviceContent', '重新核对约诊需求（含医院、院区、门诊类型及保险安排）', 3)}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{input('preferredDateStart', '期望开始日期', 1, 'date')}{input('preferredDateEnd', '期望结束日期', 1, 'date')}</div>
  </div>
  if (stage === 'post_visit_audit') {
    const eligible = reports.filter(report => !value.appointmentAt || new Date(report.createdAt) >= new Date(value.appointmentAt))
    return <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 13, color: '#63766D' }}>等待客户就诊后上传病历和检查报告。请先在报告管理审核，再选定本次资料交健康顾问查看。</div>
      {!eligible.length && <div style={{ color: '#B45309', fontSize: 13 }}>暂无本次就诊后上传的报告。</div>}
      {eligible.map(report => <label key={report._id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <input type="checkbox" checked={(value.reportIds || []).map(String).includes(String(report._id))} onChange={e => set('reportIds', e.target.checked ? [...new Set([...(value.reportIds || []), String(report._id)])] : (value.reportIds || []).filter(id => String(id) !== String(report._id)))} />
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenReport?.(report._id, report.title)}>{report.title || '报告'}</button>
        <span style={{ color: report.audit_status === 'audited' ? '#1E6B50' : '#B45309' }}>{report.audit_status === 'audited' ? '已审核' : '待审核'}</span>
      </label>)}
      <label style={{ fontSize: 13 }}><input type="checkbox" checked={!!value.noMaterialsConfirmed} onChange={e => onChange({ ...value, noMaterialsConfirmed: e.target.checked, reportIds: e.target.checked ? [] : (value.reportIds || []) })} /> 本次客户及健管专员确认没有检查资料或病历可上传</label>
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
  if (stage === 'planner') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>
      {['hospital', 'department', 'expert', 'proxyGoal', 'communicationContent'].map((key, i) => <div key={key}>{['医院', '科室', '专家', '代诊目标', '交流内容'][i]}：{value.planSnapshot?.[key] || '待确认'}</div>)}
    </div>
    <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>预指派就医专员
      <select className="form-control" value={value.medicalAssistantId || ''} onChange={e => set('medicalAssistantId', e.target.value)}>
        <option value="">请选择</option>
        {staffList.filter(staff => staff.role === 'medicalAssistant' && staff.staffStatus !== 'inactive').map(staff => <option key={staff._id} value={staff._id}>{staff.name}</option>)}
      </select>
    </label>
  </div>
  if (stage === 'booking') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>
      {value.planSnapshot?.serviceContent ? <div>约诊需求：{value.planSnapshot.serviceContent}</div> : ['hospital', 'department', 'expert', 'proxyGoal', 'communicationContent'].map((key, i) => <div key={key}>{['医院', '科室', '专家', '代诊目标', '交流内容'][i]}：{value.planSnapshot?.[key] || '待确认'}</div>)}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
      {input('preferredDateStart', '客户期望日期（开始）', 1, 'date')}
      {input('preferredDateEnd', '客户期望日期（结束）', 1, 'date')}
    </div>
    {input('appointmentDate', '专家实际出诊及约诊日期', 1, 'date')}
    {input('appointmentTime', '实际约诊时间', 1, 'time')}
    {value.appointmentDate && value.preferredDateStart && value.preferredDateEnd && (value.appointmentDate < value.preferredDateStart || value.appointmentDate > value.preferredDateEnd) && input('dateDifferenceNote', '超出期望区间说明及客户确认情况', 3)}
    {/费用与保险：使用高端医疗险/.test(value.planSnapshot?.serviceContent || '') && <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>高端险核实结果 *
      <select className="form-control" value={value.insuranceOutcome || ''} onChange={e => set('insuranceOutcome', e.target.value)}>
        <option value="">请选择核实结果</option><option value="direct_verified">已核实可直付</option><option value="reimbursement_verified">已核实先付后报</option><option value="self_pay_confirmed">保险不适用，客户确认自费</option>
      </select>
    </label>}
    {value.planSnapshot?.initiationSource === 'staff_direct' && !isExpertAppointment && <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>预约确定后指派就医专员
      <select className="form-control" value={value.medicalAssistantId || ''} onChange={e => set('medicalAssistantId', e.target.value)}>
        <option value="">请选择</option>
        {staffList.filter(staff => staff.role === 'medicalAssistant' && staff.staffStatus !== 'inactive').map(staff => <option key={staff._id} value={staff._id}>{staff.name}</option>)}
      </select>
    </label>}
  </div>
  if (stage === 'execute') return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ background: '#F5F8F6', padding: 10, whiteSpace: 'pre-wrap', fontSize: 13 }}>
      {['hospital', 'department', 'expert', 'proxyGoal', 'communicationContent'].map((key, i) => <div key={key}>{['代诊医院', '科室', '专家', '代诊目标', '与医生交流内容'][i]}：{value.planSnapshot?.[key] || '未填写'}</div>)}
      <div style={{ marginTop: 8 }}>客户期望日期区间：{value.bookingSnapshot?.preferredDateStart || '未填写'} 至 {value.bookingSnapshot?.preferredDateEnd || '未填写'}</div>
      <div>专家实际出诊及约诊时间：{value.bookingSnapshot?.appointmentDate || '未填写'} {value.bookingSnapshot?.appointmentTime || ''}</div>
      {value.bookingSnapshot?.dateDifferenceNote && <div>日期差异确认：{value.bookingSnapshot.dateDifferenceNote}</div>}
      {value.bookingSnapshot?.additionalNote && <div>预约补充说明：{value.bookingSnapshot.additionalNote}</div>}
    </div>
    {input('executionResult', fields.execute[0][1], 5)}
    <label style={{ display: 'grid', gap: 5, fontSize: 13, fontWeight: 600 }}>代诊病历附件
      <ChecklistAttachments
        item={{ attachments: value.medicalRecordAttachments || [] }}
        index={0}
        mode="executor"
        update={(_, patch) => set('medicalRecordAttachments', patch.attachments || [])}
        uploadLabel="+ 上传代诊病历"
        errorLabel="代诊病历上传失败"
      />
    </label>
  </div>
  return null
}
