import React, { useEffect, useRef, useState } from 'react'
import { staffAPI } from '../api'
import { orderConversationMessages } from '../utils/orderConversation'

export const medicationProxyStage = task => task?.sourceType === 'order' && String(task.workflowKey || '').startsWith('medication_proxy:') ? task.workflowKey.split(':')[1] : ''
const FIELDS = [
  ['brandName', '药物商品名'], ['chemicalName', '化学名'], ['specification', '规格'],
  ['singleDose', '单次服用剂量'], ['dailyFrequency', '每日服用次数'], ['totalQuantity', '配备总量'],
  ['department', '配药科室'], ['expert', '配药专家'],
]
const label = { display: 'grid', gap: 5, fontSize: 12, color: '#4A6558' }

export default function MedicationProxyStageForm({ task, value, onChange, staffList = [] }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const autoRequested = useRef(false)
  const stage = medicationProxyStage(task)
  const data = value || {}
  const update = patch => {
    const next = { ...data, ...patch }
    next.missingFields = []
    onChange(next)
  }
  const order = task.sourceOrderId || {}
  const orderId = order._id || order
  const missingLabels = (() => {
    if (stage !== 'intake') return []
    const required = FIELDS.slice(0, 6).concat([['institutionType', '配药类型'], ['paymentMethod', '支付方式']])
    if (data.institutionType === 'hospital') required.push(['hospitalName', '医院名称'], ['campus', '院区'])
    if (data.institutionType === 'pharmacy') required.push(['pharmacyName', '药房名称'])
    if (data.institutionType === 'online') required.push(['platformName', '平台名称'])
    if (data.institutionType === 'hospital' && !data.needsAdvisor) required.push(['department', '配药科室'])
    if (data.institutionType === 'hospital' && !data.needsAdvisor && data.expertRequired) required.push(['expert', '配药专家'])
    required.push(['medicalAssistantId', '本单就医专员'])
    return required.filter(([key]) => !String(data[key] ?? '').trim()).map(([, title]) => title)
  })()
  const extract = async () => {
    setLoading(true); setError('')
    try {
      const thread = await staffAPI.getChatThread(task.patientId?._id || task.patientId, 'planner')
      const messages = orderConversationMessages(thread.data || [], orderId, order.createdAt)
        .filter(item => !item.recalled).map(item => item.content || item.text || item.userMessage || '').filter(Boolean)
      const result = await staffAPI.getMedicationProxyDraft(orderId, { messages })
      update({ ...result.data, intakeSnapshot: data.intakeSnapshot })
    } catch (err) { setError(err.message || '提取失败，请手工填写') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    if (stage === 'intake' && !autoRequested.current && !data.brandName && orderId) {
      autoRequested.current = true
      extract()
    }
  }, [stage, orderId])
  const field = (key, title, disabled = false) => <label key={key} style={label}>{title}<input className="form-control" value={data[key] || ''} disabled={disabled} onChange={e => update({ [key]: e.target.value })} /></label>
  const assistantField = <label style={label}>本单就医专员 *<select className="form-control" value={data.medicalAssistantId || ''} onChange={e => { const selected = staffList.find(item => String(item._id) === e.target.value); update({ medicalAssistantId: e.target.value, medicalAssistantName: selected?.name || '' }) }}><option value="">请选择</option>{staffList.filter(item => item.role === 'medicalAssistant' && item.staffStatus !== 'inactive').map(item => <option key={item._id} value={item._id}>{item.name}{item.title ? ` · ${item.title}` : ''}</option>)}</select></label>
  return <div style={{ display: 'grid', gap: 12 }}>
    <div style={{ padding: 10, borderRadius: 8, background: '#EFF8F4', fontSize: 12 }}>药品与预约信息均须人工核对；AI仅从本订单对话和持续用药档案整理草稿，不代替处方核验。</div>
    {stage === 'intake' && <button type="button" className="btn btn-secondary btn-sm" disabled={loading} onClick={extract}>{loading ? '正在整理…' : '从对话和用药档案提取'}</button>}
    {error && <div role="alert" style={{ color: '#B42318' }}>{error}</div>}
    {stage === 'intake' ? <>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{FIELDS.slice(0, 6).map(([key, title]) => field(key, title))}</div>
      <div style={{ padding: '8px 10px', background: '#F2F8F5', borderRadius: 8, fontSize: 12 }}>系统将结合药品规格、单次剂量、每日次数和配备总量，自动换算每日用量与可服用天数。</div>
      <label style={label}>配药类型<select className="form-control" value={data.institutionType || ''} onChange={e => update({ institutionType: e.target.value, hospitalName: '', campus: '', pharmacyName: '', platformName: '' })}><option value="">请选择</option><option value="hospital">医院配药</option><option value="pharmacy">线下药房</option><option value="online">线上采购</option></select></label>
      {data.institutionType === 'hospital' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{field('hospitalName', '医院名称')}{field('campus', '院区')}</div>}
      {data.institutionType === 'pharmacy' && field('pharmacyName', '药房名称')}
      {data.institutionType === 'online' && field('platformName', '平台名称')}
      <label style={label}>支付方式<select className="form-control" value={data.paymentMethod || ''} onChange={e => update({ paymentMethod: e.target.value })}><option value="">请选择</option><option value="self_pay">自费</option><option value="medical_insurance">医保</option><option value="commercial_insurance">商保</option></select></label>
      {assistantField}
      {data.institutionType === 'hospital' && <><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{FIELDS.slice(6).map(([key, title]) => field(key, title))}</div><label><input type="checkbox" checked={!!data.expertRequired} onChange={e => update({ expertRequired: e.target.checked })} /> 该药需要专家开方</label><label><input type="checkbox" checked={!!data.needsAdvisor} onChange={e => update({ needsAdvisor: e.target.checked })} /> 客户不确定科室或专家，先转健康顾问评估</label></>}
      <label><input type="checkbox" checked={!!data.regularSupply} onChange={e => update({ regularSupply: e.target.checked })} /> 需定期配药；完成后按配备总量和每日服用总量生成下次计划</label>
      {!!missingLabels.length && <div style={{ color: '#D97706', fontSize: 12 }}>仍需核对：{missingLabels.join('、')}</div>}
    </> : <>
      <div style={{ fontSize: 13, lineHeight: 1.8 }}>药品：{data.intakeSnapshot?.brandName || data.brandName}（{data.intakeSnapshot?.chemicalName || data.chemicalName}）　规格：{data.intakeSnapshot?.specification || data.specification}<br />剂量：{data.intakeSnapshot?.singleDose || data.singleDose}　总量：{data.intakeSnapshot?.totalQuantity || data.totalQuantity}　机构：{data.intakeSnapshot?.institution || data.institution}<br />本单就医专员：{data.intakeSnapshot?.medicalAssistantName || data.medicalAssistantName || '未指定'}</div>
      {['review', 'booking', 'execute'].includes(stage) && <div style={{ padding: '10px 12px', borderRadius: 8, background: '#FFF8ED', border: '1px solid #F2D4A7', fontSize: 13, lineHeight: 1.7 }}><b>健康顾问评估结论</b><div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{data.advisorAssessment || data.assessment || '暂无评估结论，请返回上一环节补充'}</div></div>}
      {['advisor', 'review', 'booking'].includes(stage) && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{FIELDS.slice(6).map(([key, title]) => field(key, title))}</div>}
      {stage === 'advisor' && <label style={label}>评估结论<textarea className="form-control" rows={2} value={data.assessment || ''} onChange={e => update({ assessment: e.target.value })} /></label>}
      {stage === 'review' && <label><input type="checkbox" checked={!!data.plannerConfirmed} onChange={e => update({ plannerConfirmed: e.target.checked })} /> 已确认顾问建议，流转健管专员预约</label>}
      {stage === 'booking' && <><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label style={label}>预约日期<input type="date" className="form-control" value={data.appointmentDate || ''} onChange={e => update({ appointmentDate: e.target.value })} /></label><label style={label}>预约时间<input type="time" className="form-control" value={data.appointmentTime || ''} onChange={e => update({ appointmentTime: e.target.value })} /></label></div>{assistantField}</>}
      {stage === 'execute' && <>{data.intakeSnapshot?.institutionType === 'online' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{field('purchaseChannel', '线上购买渠道')}{field('purchasePrice', '实际价格')}{field('paymentConfirmation', '支付确认或凭据编号')}</div>}<label style={label}>采购/配药结果<textarea className="form-control" rows={2} value={data.dispensingResult || ''} onChange={e => update({ dispensingResult: e.target.value })} /></label><label><input type="checkbox" checked={!!data.customerConfirmed} onChange={e => update({ customerConfirmed: e.target.checked })} /> 已与客户核对药品、规格、数量和费用无误</label><label style={label}>配送安排<textarea className="form-control" rows={2} value={data.deliveryArrangement || ''} onChange={e => update({ deliveryArrangement: e.target.value })} /></label><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}><label style={label}>预计首次送达日期 *<input type="date" className="form-control" value={data.expectedDeliveryDate || ''} onChange={e => update({ expectedDeliveryDate: e.target.value })} /></label><label style={label}>下次配药预留配送天数<input type="number" min="3" className="form-control" value={data.deliveryLeadDays || 3} onChange={e => update({ deliveryLeadDays: e.target.value })} /></label></div></>}
    </>}
  </div>
}
