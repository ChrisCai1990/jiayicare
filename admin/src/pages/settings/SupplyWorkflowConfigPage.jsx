import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const FLOW_OPTIONS = [['', '尚未关联'], ['annual_management', '年度健康管理'], ['health_record_management', '健康档案管理'], ['health_assessment', '健康评估与复查'], ['nutrition_intervention', '营养干预'], ['checkup', '体检／检查管理'], ['medical_assist', '就医协助'], ['rehab', '运动复健'], ['tcm', '中医调理'], ['psychology', '心理支持'], ['medication_supply', '药品定期配取'], ['supplement_supply', '营养素定期补充'], ['generic_followup', '通用随访'], ['fulfillment_only', '单次履约／核销']]
const FLOW_CARDS = [
  ['年度健康管理', '评估建档 → 方案制定 → 周期服务 → 阶段复盘 → 年度总结', '/health-plan-templates', '管理方案模板'],
  ['健康档案管理', '资料收集 → 归档核验 → 持续更新 → 异常提示 → 授权输出', '/health-plan-templates', '管理方案模板'],
  ['健康评估与复查', '信息采集 → 风险评估 → 建议审核 → 复查提醒 → 结果复盘', '/health-plan-templates', '管理方案模板'],
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
// v2 intentionally ignores stale drafts created before saved/server comparison was fixed.
const DRAFT_KEY = 'jiayicare_service_workflow_drafts_v2'
const MODE_OPTIONS_BY_MODULE = [['fixed', '固定执行'], ['conditional', '条件触发'], ['manual', '人工可选']]
const TRIGGER_OPTIONS = [['', '请选择识别条件'], ['report_uploaded', '有报告上传'], ['abnormal_found', '发现异常'], ['exam_order_found', '取得检查单'], ['followup_instruction_found', '有复诊医嘱'], ['documents_incomplete', '资料不完整'], ['customer_request', '客户提出需求']]
const FLOW_STAGE_TEXT = Object.fromEntries(FLOW_CARDS.map(([title, desc]) => [title, desc]))
const FLOW_LABEL_BY_KEY = Object.fromEntries(FLOW_OPTIONS.map(([key, label]) => [key, label]))
const PRODUCT_STAGE_TEXT = {
  '体检一站式服务': '问卷采集 → 体检方案 → 机构预约 → 陪检 → 报告上传 → AI解析 → 健管审核 → 异常按需复查',
  '门诊一站式服务': '健康规划师总督办 → 健管收集资料 → 健康顾问评估并确定医院专家及预计检查 → 健管预约首次门诊 → 就医专员代诊开单 → 健管预约检查日专家号 → 就医专员陪诊并归档',
}
const normalizeModules = w => {
  if (w?.modules?.length) return w.modules.map((item, sequence) => ({ planId: String(typeof item.planId === 'object' ? item.planId?._id : item.planId), mode: item.mode || 'fixed', trigger: item.trigger || '', sequence: item.sequence ?? sequence }))
  return (w?.followUpPlanIds?.length ? w.followUpPlanIds : (w?.followUpPlanId ? [w.followUpPlanId] : [])).map((value, sequence) => ({ planId: String(typeof value === 'object' ? value._id : value), mode: 'fixed', trigger: '', sequence }))
}
const normalizedWorkflow = w => ({
  key: w?.key || '',
  questionnaireId: String(typeof w?.questionnaireId === 'object' ? w.questionnaireId?._id || '' : w?.questionnaireId || ''),
  followUpPlanIds: normalizeModules(w).map(item => item.planId),
  modules: normalizeModules(w),
  notes: w?.notes || '',
})

function SearchableSelect({ value, options, onChange, emptyLabel }) {
  const selected = options.find(([v]) => v === value)
  const [query, setQuery] = useState(selected?.[1] || '')
  const [open, setOpen] = useState(false)
  useEffect(() => { setQuery(selected?.[1] || '') }, [value, selected?.[1]])
  const filtered = options.filter(([, label]) => !query || label.toLowerCase().includes(query.toLowerCase()))
  const choose = (v, label) => { onChange(v); setQuery(label); setOpen(false) }
  return <div style={{ position: 'relative', minWidth: 190 }}>
    <input className="form-input" value={query} placeholder="输入关键词搜索" autoComplete="off"
      onFocus={() => { setOpen(true); setQuery('') }}
      onChange={e => { setQuery(e.target.value); setOpen(true) }}
      onBlur={() => setTimeout(() => { setOpen(false); setQuery(options.find(([v]) => v === value)?.[1] || '') }, 150)} />
    {open && <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: 'calc(100% + 4px)', maxHeight: 240, overflowY: 'auto', background: '#fff', border: '1px solid #D8E2DC', borderRadius: 9, boxShadow: '0 8px 24px rgba(26,43,36,.16)' }}>
      <div onMouseDown={() => choose('', emptyLabel)} style={{ padding: '10px 12px', cursor: 'pointer', color: '#6B7D74', borderBottom: '1px solid #EEF2EF' }}>{emptyLabel}</div>
      {filtered.filter(([v]) => v).map(([v, label]) => <div key={v} onMouseDown={() => choose(v, label)} style={{ padding: '10px 12px', cursor: 'pointer', background: v === value ? '#EEF7F2' : '#fff' }}>{label}</div>)}
      {!filtered.filter(([v]) => v).length && <div style={{ padding: 12, color: '#9AA8A1' }}>没有匹配项</div>}
    </div>}
  </div>
}

function SearchableMultiSelect({ values, options, onChange }) {
  const [query, setQuery] = useState(''), [open, setOpen] = useState(false)
  const selected = new Set(values || [])
  const filtered = options.filter(([v, label]) => !selected.has(v) && (!query || label.toLowerCase().includes(query.toLowerCase())))
  const remove = value => onChange((values || []).filter(v => v !== value))
  return <div style={{ position: 'relative', minWidth: 250 }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: selected.size ? 6 : 0 }}>{(values || []).map(value => { const label = options.find(([v]) => v === value)?.[1] || '未知方案'; return <span key={value} style={{ padding: '4px 7px', borderRadius: 7, background: '#EAF5EF', color: '#28624A', fontSize: 12 }}>{label}<button type="button" onClick={() => remove(value)} style={{ border: 0, background: 'none', cursor: 'pointer', marginLeft: 5, color: '#28624A' }}>×</button></span> })}</div>
    <input className="form-input" value={query} placeholder={selected.size ? '继续搜索并添加' : '输入关键词搜索，可多选'} autoComplete="off" onFocus={() => setOpen(true)} onChange={e => { setQuery(e.target.value); setOpen(true) }} onBlur={() => setTimeout(() => setOpen(false), 150)} />
    {open && <div style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, top: 'calc(100% + 4px)', maxHeight: 240, overflowY: 'auto', background: '#fff', border: '1px solid #D8E2DC', borderRadius: 9, boxShadow: '0 8px 24px rgba(26,43,36,.16)' }}>{filtered.map(([v, label]) => <div key={v} onMouseDown={() => { onChange([...(values || []), v]); setQuery(''); setOpen(true) }} style={{ padding: '10px 12px', cursor: 'pointer' }}>{label}</div>)}{!filtered.length && <div style={{ padding: 12, color: '#9AA8A1' }}>{selected.size === options.length ? '已选择全部方案' : '没有匹配项'}</div>}</div>}
  </div>
}

function ModuleRules({ modules, options, onChange }) {
  const update = (index, patch) => onChange(modules.map((item, i) => i === index ? { ...item, ...patch } : item))
  return <div style={{ display: 'grid', gap: 6, marginTop: 7 }}>{modules.map((item, index) => <div key={item.planId} style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 6, padding: 7, borderRadius: 8, background: '#F7FAF8' }}>
    <div style={{ gridColumn: '1/-1', fontSize: 11, color: '#4A6558' }}>{index + 1}. {options.find(([id]) => id === item.planId)?.[1] || '未知方案'}</div>
    <select className="form-input" style={{ fontSize: 12, padding: 6 }} value={item.mode || 'fixed'} onChange={e => update(index, { mode: e.target.value, trigger: e.target.value === 'conditional' ? item.trigger : '' })}>{MODE_OPTIONS_BY_MODULE.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>
    <select className="form-input" style={{ fontSize: 12, padding: 6 }} disabled={item.mode !== 'conditional'} value={item.trigger || ''} onChange={e => update(index, { trigger: e.target.value })}>{TRIGGER_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select>
  </div>)}</div>
}

export default function SupplyWorkflowConfigPage() {
  const toast = useToast(), navigate = useNavigate()
  const autoSaveTimers = useRef({})
  const [config, setConfig] = useState(null), [products, setProducts] = useState([]), [plans, setPlans] = useState([]), [questionnaires, setQuestionnaires] = useState([])
  const [search, setSearch] = useState(''), [savingConfig, setSavingConfig] = useState(false), [savingProduct, setSavingProduct] = useState(''), [savingAll, setSavingAll] = useState(false), [dirtyIds, setDirtyIds] = useState([]), [savedIds, setSavedIds] = useState([]), [failedIds, setFailedIds] = useState([])
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(10), [supplyOpen, setSupplyOpen] = useState(false)
  useEffect(() => { Promise.all([adminAPI.getSupplyWorkflowConfig(), adminAPI.products(), adminAPI.followUpPlans(), adminAPI.questionnaires()]).then(([c, p, f, q]) => { let drafts = {}; try { drafts = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') } catch {} const serverRows = p.data || [], changedDrafts = {}; serverRows.forEach(product => { if (drafts[product._id] && JSON.stringify(normalizedWorkflow(drafts[product._id])) !== JSON.stringify(normalizedWorkflow(product.serviceWorkflow))) changedDrafts[product._id] = drafts[product._id] }); localStorage.setItem(DRAFT_KEY, JSON.stringify(changedDrafts)); const rows = serverRows.map(product => changedDrafts[product._id] ? { ...product, serviceWorkflow: changedDrafts[product._id] } : product); setConfig(c.data); setProducts(rows); setPlans(f.data || []); setQuestionnaires((q.data || []).filter(item => item.status === 'active')); setDirtyIds(Object.keys(changedDrafts)) }).catch(e => toast(e.message)) }, [])
  useEffect(() => { if (!products.length) return; const drafts = {}; products.forEach(p => { if (dirtyIds.includes(p._id)) drafts[p._id] = p.serviceWorkflow }); localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)) }, [products, dirtyIds])
  const assigned = useMemo(() => products.filter(p => p.serviceWorkflow?.key).length, [products])
  const visibleProducts = useMemo(() => products.filter(p => !search || `${p.name} ${p.category}`.toLowerCase().includes(search.toLowerCase())), [products, search])
  const totalPages = Math.max(1, Math.ceil(visibleProducts.length / pageSize))
  const pagedProducts = visibleProducts.slice((Math.min(page, totalPages) - 1) * pageSize, Math.min(page, totalPages) * pageSize)
  const patchProduct = (id, patch, markDirty = true) => { const current = products.find(p => p._id === id); const nextWorkflow = { key: '', followUpPlanId: null, followUpPlanIds: [], notes: '', ...(current?.serviceWorkflow || {}), ...patch }; setProducts(prev => prev.map(p => p._id === id ? { ...p, serviceWorkflow: nextWorkflow } : p)); if (markDirty) { setDirtyIds(prev => prev.includes(id) ? prev : [...prev, id]); setSavedIds(prev => prev.filter(v => v !== id)); setFailedIds(prev => prev.filter(v => v !== id)); clearTimeout(autoSaveTimers.current[id]); autoSaveTimers.current[id] = setTimeout(() => autoSaveWorkflow(id, nextWorkflow), 700) } }
  const workflowPayload = product => normalizedWorkflow(product.serviceWorkflow)
  const clearDraft = id => { let drafts = {}; try { drafts = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') } catch {} delete drafts[id]; localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts)) }
  const autoSaveWorkflow = async (id, workflow) => { setSavingProduct(id); try { const r = await adminAPI.updateProductServiceWorkflow(id, normalizedWorkflow(workflow)); setProducts(prev => prev.map(p => p._id === id ? { ...p, serviceWorkflow: r.data } : p)); clearDraft(id); setDirtyIds(prev => prev.filter(v => v !== id)); setFailedIds(prev => prev.filter(v => v !== id)); setSavedIds(prev => prev.includes(id) ? prev : [...prev, id]); setTimeout(() => setSavedIds(prev => prev.filter(v => v !== id)), 1800) } catch (e) { setFailedIds(prev => prev.includes(id) ? prev : [...prev, id]); toast(`自动保存失败：${e.message}`) } finally { setSavingProduct(current => current === id ? '' : current) } }
  const saveProduct = async (product, silent = false) => { setSavingProduct(product._id); try { const r = await adminAPI.updateProductServiceWorkflow(product._id, workflowPayload(product)); patchProduct(product._id, r.data, false); clearDraft(product._id); setDirtyIds(prev => prev.filter(id => id !== product._id)); if (!silent) toast(`${product.name}：${r.message}`); return true } catch (e) { if (!silent) toast(e.message); return false } finally { setSavingProduct('') } }
  const saveAll = async () => { const rows = products; if (!rows.length) return toast('没有可保存的产品'); setSavingAll(true); let saved = 0; for (const product of rows) if (await saveProduct(product, true)) saved += 1; setSavingAll(false); toast(`已强制保存 ${saved} 个产品的流程关联`) }
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
    <div className="page-header"><div><h1 className="page-title">服务流程管理</h1><p className="page-subtitle">统一查看服务流程，并把每个服务产品关联到实际执行流程和随访方案。</p></div><button className="btn btn-primary" disabled={savingAll} onClick={saveAll}>{savingAll ? '保存中...' : '保存当前全部关联'}</button></div>
    <div style={{ ...card, marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}><div><div style={{ fontSize: 13, color: '#64766D' }}>产品流程覆盖</div><div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{assigned} / {products.length}</div><div style={{ fontSize: 12, color: '#8AA89C' }}>未关联产品继续按原履约逻辑运行，但不会获得专属流程标识。</div></div><button className="btn btn-secondary" onClick={() => navigate('/products')}>管理服务产品</button></div>
    <h2 style={{ fontSize: 18, margin: '26px 0 12px' }}>已接入的流程</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: 14 }}>{FLOW_CARDS.map(([title, desc, path, action]) => <div key={title} style={card}><h3 style={{ margin: 0, fontSize: 16 }}>{title}</h3><p style={{ color: '#6B7D74', fontSize: 13, lineHeight: 1.7, minHeight: 44 }}>{desc}</p><button className="btn btn-secondary" onClick={() => navigate(path)}>{action}</button></div>)}</div>
    <h2 style={{ fontSize: 18, margin: '28px 0 12px' }}>产品与流程关联</h2><div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}><div style={{ color: '#6B7D74', fontSize: 13 }}>主流程、随访方案和备注修改后会自动保存；页面上方“保存全部关联”用于重试尚未保存的项目。</div><input className="form-input" style={{ width: 220 }} value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} placeholder="搜索产品" /></div>
      <div style={{ padding: '10px 12px', marginBottom: 12, borderRadius: 10, background: '#F4F8F6', color: '#4A6558', fontSize: 12, lineHeight: 1.7 }}><strong>主流程阶段</strong>说明整项服务怎样完成；<strong>工作台任务模块</strong>只列需要分配给岗位并跟踪完成的任务。固定任务购买后执行，按需任务仅在识别到条件并经人工审核后执行。</div>
      <div style={{ overflowX: 'auto' }}><table className="data-table" style={{ minWidth: 1450 }}><thead><tr><th>服务产品／操作</th><th>状态</th><th>主流程阶段（可搜索／可选）</th><th>下单自动问卷</th><th>工作台任务模块（可搜索／可多选）</th><th>执行备注</th><th>保存状态</th></tr></thead><tbody>{pagedProducts.map(product => { const w = product.serviceWorkflow || {}, modules = normalizeModules(w), selectedIds = modules.map(item => item.planId), planOptions = plans.map(plan => [plan._id, plan.name]); const stageText = PRODUCT_STAGE_TEXT[product.name] || FLOW_STAGE_TEXT[FLOW_LABEL_BY_KEY[w.key]] || ''; return <tr key={product._id}><td><strong>{product.name}</strong><div style={{ fontSize: 11, color: '#8AA89C', marginBottom: 7 }}>{product.category || '未分类'}</div><button className="btn btn-primary btn-sm" disabled={savingProduct === product._id} onClick={() => { clearTimeout(autoSaveTimers.current[product._id]); saveProduct(product) }}>{savingProduct === product._id ? '保存中' : '保存本行'}</button></td><td>{product.status === 'on' ? '上架' : '下架'}</td><td><SearchableSelect value={w.key || ''} options={FLOW_OPTIONS} emptyLabel="尚未关联" onChange={key => patchProduct(product._id, { key })} />{stageText && <div style={{ maxWidth: 260, marginTop: 7, fontSize: 11, lineHeight: 1.6, color: '#6B7D74' }}>{stageText}</div>}</td><td><select className="form-input" disabled={w.key !== 'checkup'} value={String(typeof w.questionnaireId === 'object' ? w.questionnaireId?._id || '' : w.questionnaireId || '')} onChange={e => patchProduct(product._id, { questionnaireId: e.target.value || null })}><option value="">不自动推送</option>{questionnaires.map(q => <option key={q._id} value={q._id}>{q.title}</option>)}</select><div style={{ marginTop: 5, fontSize: 11, color: '#8AA89C' }}>{w.key === 'checkup' ? '每笔订单独立生成一次' : '仅体检流程可配置'}</div></td><td><SearchableMultiSelect values={selectedIds} options={planOptions} onChange={followUpPlanIds => { const old = new Map(modules.map(item => [item.planId, item])); const nextModules = followUpPlanIds.map((planId, sequence) => ({ ...(old.get(planId) || { planId, mode: 'fixed', trigger: '' }), sequence })); patchProduct(product._id, { followUpPlanIds, followUpPlanId: followUpPlanIds[0] || null, modules: nextModules }) }} /><ModuleRules modules={modules} options={planOptions} onChange={nextModules => patchProduct(product._id, { modules: nextModules, followUpPlanIds: nextModules.map(item => item.planId), followUpPlanId: nextModules[0]?.planId || null })} /></td><td><input className="form-input" value={w.notes || ''} onChange={e => patchProduct(product._id, { notes: e.target.value })} placeholder="例：购买后1日建档" /></td><td style={{ whiteSpace: 'nowrap' }}>{savingProduct === product._id ? <span style={{ color: '#D78515' }}>保存中...</span> : savedIds.includes(product._id) ? <span style={{ color: '#17845B' }}>✓ 已保存</span> : failedIds.includes(product._id) ? <span style={{ color: '#C0392B' }}>保存失败</span> : dirtyIds.includes(product._id) ? <span style={{ color: '#D78515' }}>等待保存</span> : <span style={{ color: '#8AA89C' }}>已保存</span>}</td></tr> })}{!visibleProducts.length && <tr><td colSpan="7" style={{ textAlign: 'center', color: '#8AA89C', padding: 30 }}>没有匹配的产品</td></tr>}</tbody></table></div>
      {!!visibleProducts.length && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 16 }}><div style={{ color: '#6B7D74', fontSize: 13 }}>共 {visibleProducts.length} 个，第 {Math.min(page, totalPages)} / {totalPages} 页</div><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontSize: 13 }}>每页</span><select className="form-input" style={{ width: 76 }} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1) }}><option value="10">10</option><option value="20">20</option><option value="50">50</option></select><button className="btn btn-secondary" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</button><button className="btn btn-secondary" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一页</button></div></div>}
    </div>
    <div style={{ ...card, marginTop: 24 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}><div><h2 style={{ fontSize: 18, margin: 0 }}>专项规则：药品与营养素定期补充</h2><div style={{ color: '#6B7D74', fontSize: 13, marginTop: 6 }}>因涉及提前补充、专业风险审核和采购履约方式，保留独立安全参数；默认收起。</div></div><button className="btn btn-secondary" onClick={() => setSupplyOpen(v => !v)}>{supplyOpen ? '收起' : '展开配置'}</button></div>
    {supplyOpen && <><div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}><button className="btn btn-primary" disabled={savingConfig} onClick={saveConfig}>{savingConfig ? '保存中...' : '保存专项配置'}</button></div><div style={{ padding: 13, borderRadius: 12, background: '#FFF8E8', color: '#765B18', fontSize: 13, lineHeight: 1.7, margin: '14px 0' }}>固定闭环：信息采集 → AI风险草稿 → 专业人员审核 → 安排／执行 → 客户购买或签收确认。AI不能直接通过审核，医院配药必须预约。</div><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(330px,1fr))', gap: 16 }}>{supplyCard('medication', '药品定期配取', '健康顾问')}{supplyCard('supplement', '营养素定期补充', '营养师')}</div><div style={{ ...card, marginTop: 16 }}><label style={{ fontWeight: 700 }}><input type="checkbox" checked={config.customerNotificationEnabled} onChange={e => setConfig(prev => ({ ...prev, customerNotificationEnabled: e.target.checked }))} /> 启动周期时通知客户</label><label style={{ display: 'block', marginTop: 18, fontSize: 13, fontWeight: 700 }}>自研营养产品名称关键词</label><textarea rows="3" value={(config.internalProductKeywords || []).join('\n')} onChange={e => setConfig(prev => ({ ...prev, internalProductKeywords: e.target.value.split('\n') }))} style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, border: '1px solid #D8E2DC', borderRadius: 9, padding: 11 }} /><div style={{ color: '#8AA89C', fontSize: 12, marginTop: 6 }}>只有名称命中关键词的自研营养代餐可走内部履约，其他营养素均按线上第三方采购。</div></div></>}
    </div>
  </div>
}
