import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast } from '../App'
import FollowUpModal from '../components/FollowUpModal'

const TYPE_MAP = { phone: '电话', wechat: '微信', visit: '上门', video: '视频', other: '其他' }
const STATUS_MAP = { completed: '已完成', missed: '未接通', planned: '计划中' }
const STATUS_COLOR = { completed: '#22A06B', missed: '#DC3545', planned: '#D97706' }
const PLAN_TYPE_LABEL = { checkup:'体检方案', health:'健康管理方案', followup:'随访计划', nutrition:'营养干预', rehab:'运动康复', tcm:'中医方案' }
const PLAN_STATUS_COLOR = { draft:'#aaa', active:'#22A06B', completed:'#0077B6' }
const PLAN_STATUS_LABEL = { draft:'草稿', active:'进行中', completed:'已完成' }
const SR_TYPE_LABEL = { medical_escort:'就医协助', psychology:'心理咨询', rehab:'运动复健', tcm:'中医评估', specialist:'专科会诊' }

export default function PatientDetailPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('info')  // info | records | followups | plans | reports | serviceRecords
  const [followUps, setFollowUps] = useState([])
  const [plans, setPlans] = useState([])
  const [reports, setReports] = useState([])
  const [serviceRecords, setServiceRecords] = useState([])
  const [showFollowUpModal, setShowFollowUpModal] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})

  const load = async () => {
    try {
      const res = await staffAPI.getPatient(id)
      setData(res.data)
      setEditForm(buildEditForm(res.data.user))
    } catch (err) {
      toast(err.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  const loadFollowUps = async () => {
    try {
      const res = await staffAPI.getPatientFollowUps(id)
      setFollowUps(res.data.followUps)
    } catch {}
  }

  const loadPlans = async () => {
    try { const res = await staffAPI.getPatientPlans(id); setPlans(res.data) } catch {}
  }
  const loadReports = async () => {
    try { const res = await staffAPI.getPatientReports(id); setReports(res.data) } catch {}
  }
  const loadServiceRecords = async () => {
    try { const res = await staffAPI.getPatientServiceRecords(id); setServiceRecords(res.data) } catch {}
  }

  useEffect(() => { load() }, [id])
  useEffect(() => {
    if (tab === 'followups') loadFollowUps()
    else if (tab === 'plans') loadPlans()
    else if (tab === 'reports') loadReports()
    else if (tab === 'serviceRecords') loadServiceRecords()
  }, [tab])

  const buildEditForm = (u) => ({
    chronicDiseases: u.chronicDiseases || [],
    patientType: u.patientType || '',
    source: u.source || '',
    remark: u.remark || '',
    contactPhone: u.contactPhone || '',
    contactPhone2: u.contactPhone2 || '',
    deliveryAddress: u.deliveryAddress || '',
    assignedHealthManager: u.assignedHealthManager?._id || '',
    assignedFamilyDoctor: u.assignedFamilyDoctor?._id || '',
  })

  const handleSave = async () => {
    try {
      await staffAPI.updatePatient(id, editForm)
      toast('保存成功')
      setEditing(false)
      load()
    } catch (err) {
      toast(err.message || '保存失败')
    }
  }

  const handleFollowUpCreated = () => {
    setShowFollowUpModal(false)
    toast('随访记录已保存')
    loadFollowUps()
    load()
  }

  if (loading) return <div className="page-loading">加载中...</div>
  if (!data) return <div className="page">患者不存在</div>

  const { user, recentFollowUps, recentRecords } = data
  const age = user.age ? `${user.age}岁` : '-'
  const bmi = user.height && user.weight
    ? (user.weight / Math.pow(user.height / 100, 2)).toFixed(1)
    : null

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => nav('/patients')}>← 返回</button>
          <div>
            <h1 className="page-title" style={{ marginBottom: 2 }}>
              {user.name}
              {user.patientType === 'vip' && <span className="badge badge-warning" style={{ marginLeft: 8 }}>VIP</span>}
            </h1>
            <p className="page-subtitle">{user.phone} · {user.gender} · {age}</p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowFollowUpModal(true)}>
          ＋ 记录随访
        </button>
      </div>

      {/* 慢病标签 */}
      {user.chronicDiseases?.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {user.chronicDiseases.map(d => (
            <span key={d} className="badge badge-danger">{d}</span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="tabs" style={{ marginBottom: 20 }}>
        {[
          { key: 'info', label: '基本信息' },
          { key: 'records', label: '健康记录' },
          { key: 'followups', label: '随访记录' },
          { key: 'plans', label: '健康方案' },
          { key: 'reports', label: '体检报告' },
          { key: 'serviceRecords', label: '服务记录' },
        ].map(t => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Info Tab ── */}
      {tab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {/* 基本资料 */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">基本资料</div>
            </div>
            <div className="card-body">
              <InfoRow label="姓名" value={user.name} />
              <InfoRow label="手机号" value={user.phone} />
              <InfoRow label="性别" value={user.gender} />
              <InfoRow label="年龄" value={age} />
              <InfoRow label="身高" value={user.height ? `${user.height} cm` : '-'} />
              <InfoRow label="体重" value={user.weight ? `${user.weight} kg` : '-'} />
              {bmi && <InfoRow label="BMI" value={bmi} />}
              <InfoRow label="身份证" value={user.idNumber || '-'} />
              <InfoRow label="婚姻状况" value={user.maritalStatus || '-'} />
              <InfoRow label="民族" value={user.ethnicity || '-'} />
              <InfoRow label="工作单位" value={user.workplace || '-'} />
              <InfoRow label="职业" value={user.occupation || '-'} />
            </div>
          </div>

          {/* 管理信息（可编辑） */}
          <div className="card">
            <div className="card-header">
              <div className="card-title">管理信息</div>
              {!editing
                ? <button className="btn btn-secondary btn-sm" onClick={() => setEditing(true)}>编辑</button>
                : <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => { setEditing(false); setEditForm(buildEditForm(user)) }}>取消</button>
                    <button className="btn btn-primary btn-sm" onClick={handleSave}>保存</button>
                  </div>
              }
            </div>
            <div className="card-body">
              {editing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">联系电话</label>
                    <input className="form-input" value={editForm.contactPhone}
                      onChange={e => setEditForm(f => ({ ...f, contactPhone: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">紧急联系电话</label>
                    <input className="form-input" value={editForm.contactPhone2}
                      onChange={e => setEditForm(f => ({ ...f, contactPhone2: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">配送地址</label>
                    <input className="form-input" value={editForm.deliveryAddress}
                      onChange={e => setEditForm(f => ({ ...f, deliveryAddress: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">患者类型</label>
                    <select className="form-input" value={editForm.patientType}
                      onChange={e => setEditForm(f => ({ ...f, patientType: e.target.value }))}>
                      <option value="">普通</option>
                      <option value="vip">VIP</option>
                      <option value="trial">试用</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">患者来源</label>
                    <input className="form-input" value={editForm.source}
                      onChange={e => setEditForm(f => ({ ...f, source: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">备注</label>
                    <textarea className="form-input" rows={3} value={editForm.remark}
                      onChange={e => setEditForm(f => ({ ...f, remark: e.target.value }))} />
                  </div>
                </div>
              ) : (
                <>
                  <InfoRow label="联系电话" value={user.contactPhone || '-'} />
                  <InfoRow label="紧急联系" value={user.contactPhone2 || '-'} />
                  <InfoRow label="配送地址" value={user.deliveryAddress || '-'} />
                  <InfoRow label="健管专员" value={user.assignedHealthManager?.name || '-'} />
                  <InfoRow label="家庭医生" value={user.assignedFamilyDoctor?.name || '-'} />
                  <InfoRow label="患者来源" value={user.source || '-'} />
                  <InfoRow label="服务包" value={user.servicePackage || '-'} />
                  <InfoRow label="服务到期" value={user.serviceExpiry || '-'} />
                  <InfoRow label="健康评分" value={user.healthScore || '-'} />
                  {user.remark && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: '#f9f7f3', borderRadius: 8, fontSize: 13, color: '#4A6558' }}>
                      📝 {user.remark}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 最近随访 */}
          <div className="card" style={{ gridColumn: 'span 2' }}>
            <div className="card-header">
              <div className="card-title">最近随访</div>
              <button className="btn btn-secondary btn-sm" onClick={() => setTab('followups')}>查看全部</button>
            </div>
            <div className="card-body">
              {recentFollowUps?.length > 0 ? (
                recentFollowUps.map(f => (
                  <div key={f._id} style={{
                    padding: '12px 0', borderBottom: '1px solid #f0ece4',
                    display: 'flex', gap: 16, alignItems: 'flex-start'
                  }}>
                    <span style={{ color: STATUS_COLOR[f.status] || '#666', fontSize: 12, minWidth: 50 }}>
                      {STATUS_MAP[f.status]}
                    </span>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 80 }}>
                      {new Date(f.date).toLocaleDateString('zh-CN')}
                    </span>
                    <span style={{ fontSize: 12, color: '#4A6558' }}>[{TYPE_MAP[f.type]}]</span>
                    <span style={{ fontSize: 13, color: '#1A2B24', flex: 1 }}>{f.content || '无内容'}</span>
                    <span style={{ fontSize: 12, color: '#8AA89C' }}>{f.staffId?.name}</span>
                  </div>
                ))
              ) : (
                <div style={{ color: '#aaa', textAlign: 'center', padding: '16px 0', fontSize: 14 }}>
                  暂无随访记录，<span style={{ color: '#1E6B50', cursor: 'pointer' }} onClick={() => setShowFollowUpModal(true)}>立即记录</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Records Tab ── */}
      {tab === 'records' && (
        <div className="card">
          <div className="card-header"><div className="card-title">健康记录（最近10条）</div></div>
          {recentRecords?.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>类型</th>
                  <th>数值</th>
                  <th>记录时间</th>
                </tr>
              </thead>
              <tbody>
                {recentRecords.map(r => (
                  <tr key={r._id}>
                    <td><span className="badge badge-info">{RECORD_TYPE_LABEL[r.type] || r.type}</span></td>
                    <td>{formatRecordValue(r)}</td>
                    <td style={{ color: '#8AA89C', fontSize: 13 }}>
                      {new Date(r.recordedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无健康记录</div>
          )}
        </div>
      )}

      {/* ── Follow-ups Tab ── */}
      {tab === 'followups' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">随访记录</div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowFollowUpModal(true)}>＋ 新增随访</button>
          </div>
          {followUps.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>随访日期</th>
                  <th>方式</th>
                  <th>状态</th>
                  <th>内容</th>
                  <th>下次随访</th>
                  <th>随访人</th>
                </tr>
              </thead>
              <tbody>
                {followUps.map(f => (
                  <tr key={f._id}>
                    <td style={{ fontSize: 13 }}>{new Date(f.date).toLocaleDateString('zh-CN')}</td>
                    <td><span className="badge badge-info">{TYPE_MAP[f.type]}</span></td>
                    <td>
                      <span style={{ color: STATUS_COLOR[f.status], fontSize: 13, fontWeight: 500 }}>
                        {STATUS_MAP[f.status]}
                      </span>
                    </td>
                    <td style={{ maxWidth: 260, fontSize: 13 }}>{f.content || '-'}</td>
                    <td style={{ fontSize: 13, color: '#8AA89C' }}>
                      {f.nextFollowUpDate ? new Date(f.nextFollowUpDate).toLocaleDateString('zh-CN') : '-'}
                    </td>
                    <td style={{ fontSize: 13, color: '#666' }}>{f.staffId?.name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
              暂无随访记录，<span style={{ color: '#1E6B50', cursor: 'pointer' }} onClick={() => setShowFollowUpModal(true)}>立即添加</span>
            </div>
          )}
        </div>
      )}

      {/* ── Plans Tab ── */}
      {tab === 'plans' && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">健康方案</div>
          </div>
          {plans.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无健康方案</div>
          ) : (
            <table className="table">
              <thead><tr><th>方案名称</th><th>类型</th><th>状态</th><th>项目数</th><th>完成</th><th>负责人</th><th>创建时间</th></tr></thead>
              <tbody>
                {plans.map(p => {
                  const done = p.items?.filter(i => i.status === 'completed').length || 0
                  const total = p.items?.length || 0
                  return (
                    <tr key={p._id}>
                      <td style={{ fontWeight: 500 }}>{p.title}</td>
                      <td><span className="badge badge-info">{PLAN_TYPE_LABEL[p.type] || p.type}</span></td>
                      <td><span style={{ color: PLAN_STATUS_COLOR[p.status], fontWeight: 500, fontSize: 13 }}>{PLAN_STATUS_LABEL[p.status]}</span></td>
                      <td style={{ textAlign: 'center' }}>{total}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ width: 60, height: 6, background: '#f0f0f0', borderRadius: 3 }}>
                            <div style={{ width: total ? `${(done/total)*100}%` : '0%', height: '100%', background: '#22A06B', borderRadius: 3 }} />
                          </div>
                          <span style={{ fontSize: 12, color: '#666' }}>{done}/{total}</span>
                        </div>
                      </td>
                      <td style={{ fontSize: 13, color: '#666' }}>{p.staffId?.name || '-'}</td>
                      <td style={{ fontSize: 12, color: '#aaa' }}>{new Date(p.createdAt).toLocaleDateString('zh-CN')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Reports Tab ── */}
      {tab === 'reports' && (
        <div className="card">
          <div className="card-header"><div className="card-title">体检报告</div></div>
          {reports.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无体检报告</div>
          ) : (
            <table className="table">
              <thead><tr><th>报告标题</th><th>类型</th><th>医院</th><th>日期</th><th>审核状态</th><th>上传人</th></tr></thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r._id}>
                    <td style={{ fontWeight: 500 }}>{r.title}</td>
                    <td><span className="badge badge-info">{r.type}</span></td>
                    <td style={{ fontSize: 13, color: '#666' }}>{r.hospital || '-'}</td>
                    <td style={{ fontSize: 13, color: '#666' }}>{r.date || '-'}</td>
                    <td>
                      <span style={{ fontSize: 13, fontWeight: 500, color: r.audit_status === 'audited' ? '#22A06B' : r.audit_status === 'rejected' ? '#DC3545' : '#D97706' }}>
                        {r.audit_status === 'audited' ? '已审核' : r.audit_status === 'rejected' ? '已驳回' : '待审核'}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: '#666' }}>{r.uploadedBy?.name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Service Records Tab ── */}
      {tab === 'serviceRecords' && (
        <div className="card">
          <div className="card-header"><div className="card-title">服务记录</div></div>
          {serviceRecords.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>暂无服务记录</div>
          ) : (
            <table className="table">
              <thead><tr><th>服务类型</th><th>标题</th><th>内容摘要</th><th>负责人</th><th>服务日期</th></tr></thead>
              <tbody>
                {serviceRecords.map(r => (
                  <tr key={r._id}>
                    <td><span className="badge badge-success">{SR_TYPE_LABEL[r.type] || r.type}</span></td>
                    <td style={{ fontWeight: 500 }}>{r.title || '-'}</td>
                    <td style={{ fontSize: 13, color: '#666', maxWidth: 200 }}>{r.content ? (r.content.length > 60 ? r.content.slice(0, 60) + '...' : r.content) : '-'}</td>
                    <td style={{ fontSize: 13, color: '#666' }}>{r.staffId?.name || '-'}</td>
                    <td style={{ fontSize: 12, color: '#aaa' }}>{new Date(r.date).toLocaleDateString('zh-CN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* 随访记录弹窗 */}
      {showFollowUpModal && (
        <FollowUpModal
          patientId={id}
          patientName={user.name}
          onClose={() => setShowFollowUpModal(false)}
          onSaved={handleFollowUpCreated}
        />
      )}
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f2ec', fontSize: 14 }}>
      <span style={{ color: '#8AA89C' }}>{label}</span>
      <span style={{ color: '#1A2B24', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{value}</span>
    </div>
  )
}

const RECORD_TYPE_LABEL = {
  bloodPressure: '血压', bloodSugar: '血糖', heartRate: '心率',
  weight: '体重', sleep: '睡眠', mood: '情绪',
}

function formatRecordValue(r) {
  if (r.type === 'bloodPressure' && r.extra) {
    return `${r.extra.sys}/${r.extra.dia} mmHg`
  }
  if (r.type === 'bloodSugar') return `${r.value} mmol/L`
  if (r.type === 'heartRate') return `${r.value} 次/分`
  if (r.type === 'weight') return `${r.value} kg`
  if (r.type === 'sleep') return `${r.value} h`
  if (r.type === 'mood') return `${r.value} / 10`
  return r.value ?? '-'
}
