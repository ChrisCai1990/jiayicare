import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const FLOW_OPTIONS = [['', '尚未关联'], ['annual_management', '年度健康管理'], ['nutrition_intervention', '营养干预'], ['checkup', '体检／检查管理'], ['medical_assist', '就医协助'], ['rehab', '运动复健'], ['tcm', '中医调理'], ['psychology', '心理支持'], ['medication_supply', '药品定期配取'], ['supplement_supply', '营养素定期补充'], ['generic_followup', '通用随访'], ['fulfillment_only', '单次履约／核销']]
const FLOW_CARDS = [
  ['年度健康管理', '评估建档 → 方案制定 → 周期服务 → 阶段复盘 → 年度总结', '/health-plan-templates', '管理方案模板'],
  ['营养干预', '营养评估 → 目标与方案 → 执行跟踪 → 指标复评 → 调整方案', '/health-plan-templates', '管理方案模板'],
  ['体检／检查管理', '需求确认 → 预约 → 检查提醒 → 报告解读 → 异常跟进', '/health-plan-templates', '管理方案模板'],
  ['就医协助', '需求与风险评估 → 预约协调 → 就医执行 → 医嘱整理 → 后续随访', '/projects/followup-plans', '管理随访方案'],
  ['运动复健', '能力评估 → 计划制定 → 训练执行 → 风险监测 → 阶段复评', '/health-plan-templates', '管理方案模板'],
  ['中医调理', '需求采集 → 专业辨识 → 方案审核 → 服务执行 → 效果随访', '/health-plan-templates', '管理方案模板'],
  ['心理支持', '初筛 → 专业评估 → 服务安排 → 风险升级 → 效果随访', '/health-plan-templates', '管理方案模板'],
  ['通用随访', '按方案生成任务 → 到期提醒 → 执行记录 → 主管复核 → 闭环', '/projects/followup-plans', '管理随访方案'],
]
const MODE_OPTIONS = { medication: [['customer_self', '客户自行购买'], ['online_assisted', '线上协助购买与配送'], ['hospital_assisted', '医院预约配药']], supplement: [['customer_self', '客户自行购买'], ['online_assisted', '线上协助购买与配送'], ['internal_product', '自研营养代餐内部履约']] }
const card = { background: '#fff', border: '1px solid #E3EAE6', borderRadius: 16, padding: 20, boxShadow: '0 5px 18px rgba(26,43,36,.05)' }

export default function SupplyWorkflowConfigPage() {
  const toast = useToast(), navigate = useNavigate()
  const [config, setConfig] = useState(null), [products, setProducts] = useState([]), [plans, setPlans] = useState([])
  const [search, setSearch] = useState(''), [savingConfig, setSavingConfig] = useState(false), [savingProduct, setSavingProduct] = useState('')
  useEffect(() => { Promise.all([adminAPI.getSupplyWorkflowConfig(), adminAPI.products(), adminAPI.followUpPlans()]).then(([c, p, f]) => { setConfig(c.data); setProducts(p.data || []); setPlans(f.data || []) }).catch(e => toast(e.message)) }, [])
  const assigned = useMemo(() => products.filter(p => p.serviceWorkflow?.key).length, [products])
  const visibleProducts = useMemo(() => products.filter(p => !search || `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase())), [products, search])
  const patchProduct = (id, patch) => setProducts(prev => prev.map(p => p._id === id ? { ...p, serviceWorkflow: { key: '', followUpPlanId: null, notes: '', ...(p.serviceWorkflow || {}), ...patch } } : p))
  const saveProduct = async product => { setSavingProduct(product._id); try { const w = product.serviceWorkflow || {}; const r = await adminAPI.updateProductServiceWorkflow(product._id, { key: w.key || '', followUpPlanId: w.followUpPlanId || null, notes: w.notes || '' }); patchProduct(product._id, r.data); toast(`${product.name}：${r.message}`) } catch (e) { toast(e.message) } finally { setSavingProduct('') } }
  const setType = (type, key, value) => setConfig(prev => ({ ...prev, [type]: { ...prev[type], [key]: value } }))
  const toggleMode = (type, mode) => { const a = config[type].allowedModes || []; setType(type, 'allowedModes', a.includes(mode) ? a.filter(v => v !== mode) : [...a, mode]) }
  const saveConfig = async () => { setSavingConfig(true); try { const r = await adminAPI.updateSupplyWorkflowConfig(config); setConfig(r.data); toast(r.message) } catch (e) { toast(e.message) } finally { setSavingConfig(false) } }
  if (!config) return <div className="page-loading">加载中...</div>
  const supplyCard = (type, title, reviewer) => <div style={card}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><div><h3 style={{ margin: 0 }}>{title}</h3><div style={{ color: '#6B7D74', fontSize: 13, marginTop: 6 }}>风险审核：{reviewer}（固定安全门禁）</div></div><label style={{ fontSize: 13, fontWeight: 700 }}><input type="checkbox" checked={config[type].enabled} onChange={e => setType(type, 'enabled', e.target.checked)} /> 启用</label></div>
    <div style={{ marginTop: 18, fontSize: 13, fontWeight: 700 }}>提前启动</div><input type="number" min="3" max="30" value={config[type].leadDays} onChange={e => setType(type, 'leadDays', e.target.value)} style={{ marginTop: 7, width: 110, border: '1px solid #D8E2DC', borderRadius: 8, padding: '9px 11px' }} /><span style={{ color: '#8AA89C', fontSize: 12, marginLeft: 8 }}>天（最低3天）</span>
    <div style={{ marginTop: 18, fontSize: 13, fontWeight: 700 }}>履约方式</div><div style={{ display: 'grid', gap: 9, marginTop: 9 }}>{MODE_OPTIONS[type].map(([mode, label]) => <label key={mode} style={{ fontSize: 13 }}><input type="checkbox" checked={config[type].allowedModes.includes(mode)} onChange={() => toggleMode(type, mode)} /> {label}</label>)}</div>
  </div>
  return <div className="page" style={{ maxWidth: 1220, margin: '0 auto' }}>
    <div className="page-header"><div><h1 className="page-title">服务流程管理</h1><p className="page-subtitle">统一查看服务流程，并把每个服务产品关联到实际执行流程和随访方案。</p></div></div>
    <div style={{ ...card, marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}><div><div style={{ fontSize: 13, color: '#64766D' }}>产品流程覆盖</div><div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{assigned} / {products.length}</div><div style={{ fontSize: 12, color: '#8AA89C' }}>未关联产品继续按原履约逻辑运行，但不会获得专属流程标识。</div></div><button className="btn btn-secondary" onClick={() => navigate('/products')}>管理服务产品</button></div>
    <h2 style={{ fontSize: 18, margin: '26px 0 12px' }}>已接入的流程</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 14 }}>{FLOW_CARDS.map(([title, desc, path, action]) => <div key={title} style={card}><h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3><p style={{ color: '#6B7D74', fontSize: 13, lineHeight: 1.7, minHeight: 44 }}>{desc}</p><button className="btn btn-secondary" onClick={() => navigate(path)}>{action}</button></div>)}</div>
    <h2 style={{ fontSize: 18, margin: '28px 0 12px' }}>产品与流程关联</h2><div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}><div style={{ color: '#6B7D74', fontSize: 13 }}>选择主流程；需要周期任务时再关联随访方案。后续调整只影响新订单，历史订单保留当时的流程快照。</div><input className="form-input" style={{ width: 220 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索产品" /></div>
      <div style={{ overflowX: 'auto' }}><table className="data-table" style={{ minWidth: 900 }}><thead><tr><th>服务产品</th><th>状态</th><th>主流程</th><th>随访方案（可选）</th><th>执行备注</th><th>操作</th></tr></thead><tbody>{visibleProducts.map(product => { const w = product.serviceWorkflow || {}, planId = typeof w.followUpPlanId === 'object' ? w.followUpPlanId?._id : w.followUpPlanId; return <tr key={product._id}><td><strong>{product.name}</strong><div style={{ fontSize: 11, color: '#8AA89C' }}>{product.category || '未分类'}</div></td><td>{product.status === 'on' ? '上架' : '下架'}</td><td><select className="form-input" value={w.key || ''} onChange={e => patchProduct(product._id, { key: e.target.value })}>{FLOW_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></td><td><select className="form-input" value={planId || ''} onChange={e => patchProduct(product._id, { followUpPlanId: e.target.value || null })}><option value="">不关联周期随访</option>{plans.map(plan => <option key={plan._id} value={plan._id}>{plan.name}</option>)}</select></td><td><input className="form-input" value={w.notes || ''} onChange={e => patchProduct(product._id, { notes: e.target.value })} placeholder="例：购买后1日建档" /></td><td><button className="btn btn-primary" disabled={savingProduct === product._id} onClick={() => saveProduct(product)}>{savingProduct === product._id ? '保存中' : '保存'}</button></td></tr> })}{!visibleProducts.length && <tr><td colSpan="6" style={{ textAlign: 'center', color: '#8AA89C', padding: 30 }}>没有匹配的产品</td></tr>}</tbody></table></div>
    </div>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '30px 0 12px' }}><div><h2 style={{ fontSize: 18, margin: 0 }}>专项流程：定期补充</h2><div style={{ color: '#6B7D74', fontSize: 13, marginTop: 6 }}>药品和营养素仅是全部服务流程中的一个专项分支。</div></div><button className="btn btn-primary" disabled={savingConfig} onClick={saveConfig}>{savingConfig ? '保存中...' : '保存专项配置'}</button></div>
    <div style={{ padding: 13, borderRadius: 12, background: '#FFF8E8', color: '#765B18', fontSize: 13, lineHeight: 1.7, marginBottom: 14 }}>固定闭环：信息采集 → AI风险草稿 → 专业人员审核 → 安排／执行 → 客户购买或签收确认。AI不能直接通过审核，医院配药必须预约。</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 16 }}>{supplyCard('medication', '药品定期配取', '健康顾问')}{supplyCard('supplement', '营养素定期补充', '营养师')}</div>
    <div style={{ ...card, marginTop: 16 }}><label style={{ fontWeight: 700 }}><input type="checkbox" checked={config.customerNotificationEnabled} onChange={e => setConfig(prev => ({ ...prev, customerNotificationEnabled: e.target.checked }))} /> 启动周期时通知客户</label><label style={{ display: 'block', marginTop: 18, fontSize: 13, fontWeight: 700 }}>自研营养产品名称关键词</label><textarea rows="3" value={(config.internalProductKeywords || []).join('\n')} onChange={e => setConfig(prev => ({ ...prev, internalProductKeywords: e.target.value.split('\n') }))} style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, border: '1px solid #D8E2DC', borderRadius: 9, padding: 11 }} /><div style={{ color: '#8AA89C', fontSize: 12, marginTop: 6 }}>只有名称命中关键词的自研营养代餐可走内部履约，其他营养素均按线上第三方采购。</div></div>
  </div>
}
