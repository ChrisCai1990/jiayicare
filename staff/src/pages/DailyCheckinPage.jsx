import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { staffAPI } from '../api'

const TYPE_COLOR = {
  bloodPressure: '#DC3545', bloodSugar: '#D97706', weight: '#1E6B50',
  heartRate: '#7C3AED', sleep: '#4F46E5', diet: '#B45309',
  exercise: '#0369A1', water: '#0EA5E9', bowel: '#92400E',
  smoking: '#6B7280', alcohol: '#9D174D', mood: '#059669',
  symptom: '#DC3545',
}

export default function DailyCheckinPage() {
  const nav = useNavigate()
  const location = useLocation()
  const focusedRecordId = new URLSearchParams(location.search).get('healthRecordId') || ''
  const [records, setRecords] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dateFilter, setDateFilter] = useState('')
  const [nameFilter, setNameFilter] = useState('')
  const [statusModal, setStatusModal] = useState(null)
  const [statusText, setStatusText] = useState('')
  const [statusSaving, setStatusSaving] = useState(false)
  const [symptomReview, setSymptomReview] = useState(null)
  const [symptomValue, setSymptomValue] = useState('')
  const [symptomNote, setSymptomNote] = useState('')
  const [symptomDecision, setSymptomDecision] = useState('')
  const [symptomSaving, setSymptomSaving] = useState(false)

  const todayStr = new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (focusedRecordId) params.healthRecordId = focusedRecordId
      if (dateFilter) params.date = dateFilter
      if (nameFilter) params.patientName = nameFilter
      const res = await staffAPI.getCheckinOverview(params)
      setRecords(res.data || [])
      setTotal(res.total || 0)
      if (focusedRecordId && res.focusedRecordId) {
        const patient = (res.data || []).find(p => p.doneItems?.some(item => item._id === res.focusedRecordId))
        const record = patient?.doneItems?.find(item => item._id === res.focusedRecordId)
        if (patient && record?.type === 'symptom'
          && ['pending_manager', 'pending_doctor'].includes(record.symptomWorkflow?.status)
          && !record.symptomWorkflow?.verifiedAt) {
          openSymptomReview(record, patient)
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [dateFilter, nameFilter, focusedRecordId])

  useEffect(() => { load() }, [load])

  const fmtTime = t => {
    if (!t) return '-'
    return new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const saveHealthStatus = async () => {
    if (!statusModal || !statusText.trim()) return
    setStatusSaving(true)
    try {
      await staffAPI.createPatientHealthRecord(statusModal.patientId, {
        type: 'symptom',
        value: statusText.trim(),
        note: '健管专员查看健康数据时记录',
        recordedAt: dateFilter || new Date().toISOString(),
      })
      setStatusModal(null)
      setStatusText('')
      await load()
    } finally {
      setStatusSaving(false)
    }
  }

  const openSymptomReview = (record, patient) => {
    setSymptomReview({ ...record, patientName: patient.patientName })
    setSymptomValue(record.value || '')
    setSymptomNote(record.note || '')
    setSymptomDecision('')
  }

  const verifySymptom = async action => {
    if (!symptomReview || !symptomValue.trim()) return
    setSymptomSaving(true)
    try {
      await staffAPI.verifySymptom(symptomReview._id, {
        action,
        value: symptomValue.trim(),
        note: symptomNote.trim(),
        decisionNote: symptomDecision.trim(),
      })
      setSymptomReview(null)
      await load()
    } catch (err) {
      window.alert(err.message || '处理失败，请稍后重试')
    } finally {
      setSymptomSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">日常健康监测</h1>
          <p className="page-subtitle">
            {dateFilter
              ? `${dateFilter} 共 ${total} 位客户有健康数据记录`
              : `今日（${todayStr}）共 ${total} 位客户有健康数据记录`}
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load}>刷新</button>
      </div>

      {/* 搜索栏 */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>客户姓名</label>
              <input className="form-control" placeholder="输入姓名搜索" value={nameFilter}
                onChange={e => setNameFilter(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && load()}
                style={{ width: 160 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>按日期筛选</label>
              <input className="form-control" type="date" value={dateFilter}
                onChange={e => setDateFilter(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={load}>搜索</button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setDateFilter(''); setNameFilter('') }}>重置</button>
          </div>
        </div>
      </div>

      {/* 列表 */}
      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>加载中...</div>
      ) : records.length === 0 ? (
        <div className="card">
          <div style={{ padding: 60, textAlign: 'center', color: '#aaa' }}>
            {dateFilter ? `${dateFilter} 暂无健康数据记录` : '今日暂无客户记录健康数据'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {records.map(r => (
            <div key={String(r.patientId)} className="card"
              style={{ cursor: 'pointer', transition: 'box-shadow .15s' }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 12px rgba(30,107,80,.12)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = ''}
              onClick={() => nav(`/patients/${r.patientId}?tab=monitoring`)}>
              <div className="card-body" style={{ padding: '14px 20px' }}>
                {/* 顶部：姓名 + 电话 + 时间 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#1A2B24' }}>{r.patientName}</span>
                    <span style={{ fontSize: 13, color: '#8AA89C' }}>{r.patientPhone}</span>
                    <span style={{ fontSize: 12, color: '#aaa' }}>最近记录 {fmtTime(r.latestRecordAt)}</span>
                  </div>
                  <button className="btn btn-secondary btn-sm"
                    onClick={e => { e.stopPropagation(); nav(`/patients/${r.patientId}?tab=monitoring`) }}>
                    健康监测
                  </button>
                  <button className="btn btn-primary btn-sm"
                    onClick={e => { e.stopPropagation(); setStatusModal(r); setStatusText('') }}>
                    ＋ 记录健康问题
                  </button>
                </div>

                {/* 已打卡 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {r.doneItems.filter(item => item.type !== 'symptom').map((item, idx) => (
                    <span key={`${item.type}-${item.recordedAt || idx}`} style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                      background: (TYPE_COLOR[item.type] || '#1E6B50') + '18',
                      color: TYPE_COLOR[item.type] || '#1E6B50',
                      border: `1px solid ${TYPE_COLOR[item.type] || '#1E6B50'}30`,
                    }}>
                      ✓ {item.label}{item.value ? `：${item.value}${item.unit}` : ''}
                      {item.extra?.sleepTime && item.extra?.wakeTime ? `（${item.extra.sleepTime}入睡→${item.extra.wakeTime}醒）` : ''}
                      {item.note ? `，${item.note}` : ''}
                    </span>
                  ))}
                </div>

                {/* 今日健康状态：客户自报或医护审核发现的问题，独立于普通打卡项展示 */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #F0EDE8' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1A2B24', marginBottom: 6 }}>今日健康状态</div>
                  {r.doneItems.filter(item => item.type === 'symptom').length === 0 ? (
                    <div style={{ fontSize: 12, color: '#8AA89C' }}>未记录不适主诉</div>
                  ) : r.doneItems.filter(item => item.type === 'symptom').map((item, idx) => (
                    <div key={item.recordedAt || idx} style={{ padding: '7px 10px', background: '#FFF5F5', borderRadius: 8, marginBottom: 5 }}>
                      <div style={{ fontSize: 13, color: '#991B1B' }}>{item.value}{item.note ? `；${item.note}` : ''}</div>
                      <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 3 }}>
                        {item.recordedBy?.source === 'staff' ? (item.recordedBy.staffName || '医护人员') : '客户记录'}
                        {' · '}{new Date(item.recordedAt).toLocaleString('zh-CN')}
                        {' · '}{item.symptomWorkflow?.status === 'pending_doctor' ? '待健康顾问处理' : '已处理'}
                      </div>
                      {(['pending_manager', 'pending_doctor'].includes(item.symptomWorkflow?.status)) && !item.symptomWorkflow?.verifiedAt && (
                        <button className="btn btn-primary btn-sm" style={{ marginTop: 7 }}
                          onClick={e => { e.stopPropagation(); openSymptomReview(item, r) }}>
                          待处理：核实并编辑
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {statusModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setStatusModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">记录今日健康状态 · {statusModal.patientName}</h3>
              <button className="modal-close" onClick={() => setStatusModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              <label className="form-label">发现的健康问题 / 不适主诉 *</label>
              <textarea className="form-input" rows={4} value={statusText}
                onChange={e => setStatusText(e.target.value)}
                placeholder="请描述症状、部位、持续时间及审核中发现的问题" />
              <div style={{ marginTop: 8, fontSize: 12, color: '#8AA89C' }}>
                保存后将记录录入人员和时间，并进入该客户健康顾问的待办任务。
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setStatusModal(null)}>取消</button>
              <button className="btn btn-primary" disabled={statusSaving || !statusText.trim()} onClick={saveHealthStatus}>
                {statusSaving ? '保存中...' : '保存并提交健康顾问'}
              </button>
            </div>
          </div>
        </div>
      )}

      {symptomReview && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setSymptomReview(null)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title">核实今日不适 · {symptomReview.patientName}</h3>
              <button className="modal-close" onClick={() => setSymptomReview(null)}>×</button>
            </div>
            <div className="modal-body">
              <label className="form-label">核实后的不适内容 *</label>
              <textarea className="form-input" rows={3} value={symptomValue}
                onChange={e => setSymptomValue(e.target.value)} />
              <label className="form-label" style={{ marginTop: 12 }}>补充说明</label>
              <textarea className="form-input" rows={2} value={symptomNote}
                onChange={e => setSymptomNote(e.target.value)} placeholder="部位、持续时间、程度等" />
              <label className="form-label" style={{ marginTop: 12 }}>核实意见</label>
              <textarea className="form-input" rows={2} value={symptomDecision}
                onChange={e => setSymptomDecision(e.target.value)} placeholder="记录与客户核实的结果" />
              <div style={{ marginTop: 8, fontSize: 12, color: '#8AA89C' }}>
                确认转交后，将同时出现在健康顾问工作台和用户端待办；健康顾问处理完成后，用户端待办自动结束。
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" disabled={symptomSaving}
                onClick={() => verifySymptom('dismiss')}>确认为误录</button>
              <button className="btn btn-primary" disabled={symptomSaving || !symptomValue.trim()}
                onClick={() => verifySymptom('refer_doctor')}>
                {symptomSaving ? '提交中...' : '确认并转健康顾问'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
