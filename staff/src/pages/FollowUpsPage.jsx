import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { staffAPI } from '../api'
import { useToast, useStaff } from '../App'
import FollowUpModal from '../components/FollowUpModal'

const TYPE_MAP   = { phone: '鐢佃瘽', wechat: '寰俊', visit: '涓婇棬', video: '瑙嗛', other: '鍏朵粬' }
const STATUS_MAP = { planned: '寰呴殢璁?, in_progress: '闅忚涓?, missed: '闅忚涓?, completed: '宸查殢璁?, cancelled: '宸插彇娑? }
const CHECKIN_LABEL = { diet: '楗', exercise: '杩愬姩', sleep: '鐫＄湢', alcohol: '鐑熼厭', weight: '浣撻噸', bloodPressure: '琛€鍘?, bloodSugar: '琛€绯?, heartRate: '蹇冪巼', water: '楗按' }
const STATUS_COLOR = { planned: '#D97706', in_progress: '#0077B6', missed: '#0077B6', completed: '#22A06B', cancelled: '#8AA89C' }

const STATUS_TABS = [
  { v: '',            l: '鍏ㄩ儴' },
  { v: 'planned',     l: '寰呴殢璁? },
  { v: 'in_progress', l: '闅忚涓? },
  { v: 'completed',   l: '宸查殢璁? },
  { v: 'cancelled',   l: '宸插彇娑? },
]

const TYPE_OPTIONS = [
  { v: 'phone',  l: '鐢佃瘽' },
  { v: 'wechat', l: '寰俊' },
  { v: 'visit',  l: '涓婇棬' },
  { v: 'video',  l: '瑙嗛' },
  { v: 'other',  l: '鍏朵粬' },
]

function DetailModal({ item, onClose }) {
  if (!item) return null
  const FOLLOWUP_TYPE = { phone: '鐢佃瘽闅忚', wechat: '寰俊闅忚', visit: '涓婇棬闅忚', video: '瑙嗛闅忚', other: '鍏朵粬闅忚' }
  const ROUTINE_PERIOD = { 鍙屽懆: '鍙屽懆闅忚', 鏈堝害: '鏈堝害闅忚', 瀛ｅ害: '瀛ｅ害闅忚' }

  const Row = ({ label, value }) => value ? (
    <div style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #f0ece4' }}>
      <span style={{ minWidth: 90, fontSize: 12, color: '#8AA89C', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: '#1A2B24', whiteSpace: 'pre-line', flex: 1 }}>{value}</span>
    </div>
  ) : null

  return (
    <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal" style={{ maxWidth: 600, width: '96%' }}>
        <div className="modal-header">
          <h3 className="modal-title">闅忚璇︽儏 路 {item.patientId?.name}</h3>
          <button className="modal-close" onClick={onClose}>鉁?/button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <Row label="浼氬憳" value={`${item.patientId?.name}  ${item.patientId?.phone || ''}`} />
          <Row label="璁″垝鏃ユ湡" value={new Date(item.date).toLocaleDateString('zh-CN')} />
          <Row label="闅忚涓婚" value={item.theme} />
          <Row label="闅忚鏂瑰紡" value={FOLLOWUP_TYPE[item.type] || item.type} />
          {item.routinePeriod && <Row label="鍛ㄦ湡绫诲瀷" value={ROUTINE_PERIOD[item.routinePeriod] || item.routinePeriod} />}
          <Row label="璐熻矗浜哄憳" value={item.assignedTo?.name} />
          <Row label="鐘舵€? value={STATUS_MAP[item.status] || item.status} />
          {item.checkInItems?.length > 0 && <Row label="鎵撳崱椤圭洰" value={item.checkInItems.map(k => CHECKIN_LABEL[k] || k).join('銆?)} />}
          <Row label="璁″垝鍐呭" value={item.content} />
          {item.status === 'completed' && (
            <>
              <div style={{ margin: '12px 0 6px', fontSize: 12, color: '#1E6B50', fontWeight: 700, borderTop: '2px solid #E8F5EF', paddingTop: 12 }}>闅忚缁撴灉</div>
              <Row label="鎵ц鏂瑰紡" value={FOLLOWUP_TYPE[item.executedType] || item.executedType} />
              <Row label="闅忚璁板綍" value={item.executedContent} />
              <Row label="瀹屾垚鏃堕棿" value={item.completedAt ? new Date(item.completedAt).toLocaleString('zh-CN') : ''} />
            </>
          )}
          {item.status === 'cancelled' && <Row label="鍙栨秷鍘熷洜" value={item.cancelReason} />}
          {/* 闅忚琛ㄥ崟瀹屾暣鏁版嵁锛坒ormData锛?*/}
          {item.formData && Object.keys(item.formData).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: '#1E6B50', fontWeight: 700, marginBottom: 8, borderTop: '2px solid #E8F5EF', paddingTop: 12 }}>闅忚琛ㄥ崟瀹屾暣鍐呭</div>
              {Object.entries(item.formData).map(([k, v]) => {
                if (v === null || v === undefined || v === '') return null
                if (Array.isArray(v)) {
                  return v.length > 0 ? <Row key={k} label={k} value={v.join('銆?)} /> : null
                }
                if (typeof v === 'object') {
                  const sub = Object.entries(v).filter(([, sv]) => sv !== null && sv !== undefined && sv !== '').map(([sk, sv]) => `${sk}: ${sv}`).join('锛?)
                  return sub ? <Row key={k} label={k} value={sub} /> : null
                }
                return <Row key={k} label={k} value={String(v)} />
              })}
            </div>
          )}
          {/* 鎵╁睍瀛楁锛堥殢璁胯〃鍗?extras锛?*/}
          {item.extras && Object.keys(item.extras).length > 0 && (
            <div style={{ marginTop: 8 }}>
              {Object.entries(item.extras).map(([k, v]) => (
                typeof v === 'object' ? null :
                <Row key={k} label={k} value={String(v)} />
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>鍏抽棴</button>
          <button className="btn btn-ghost" onClick={() => { onClose(); }}>
            璺宠浆浼氬憳璇︽儏
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FollowUpsPage() {
  const nav   = useNavigate()
  const toast = useToast()
  const { staff } = useStaff()

  const [followUps,    setFollowUps]    = useState([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(1)
  const todayStr = new Date().toISOString().slice(0, 10)
  const [statusTab,    setStatusTab]    = useState('planned')
  const [patientName,  setPatientName]  = useState('')
  const [dateFrom,     setDateFrom]     = useState(todayStr)
  const [dateTo,       setDateTo]       = useState('')
  const [loading,      setLoading]      = useState(true)
  const [showModal,    setShowModal]    = useState(false)  // 淇濈暀鐘舵€佷絾涓嶅啀浣跨敤鏂板缓鍏ュ彛
  // 娉細dateFrom 榛樿浠婂ぉ寮€濮嬶紝dateTo 榛樿绌猴紙涓嶉檺缁撴潫锛夛紝鏄剧ず鎵€鏈夊緟闅忚璁板綍

  // 鎵ц闅忚 modal
  const [execItem,     setExecItem]     = useState(null)
  const [execForm,     setExecForm]     = useState({ type: 'phone', content: '', status: 'completed' })
  const [execSaving,   setExecSaving]   = useState(false)

  // 鍙栨秷闅忚 modal
  const [cancelItem,   setCancelItem]   = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelSaving, setCancelSaving] = useState(false)

  // 鏌ョ湅璇︽儏
  const [detailItem, setDetailItem] = useState(null)

  // 缂栬緫闅忚
  const [editItem, setEditItem] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editSaving, setEditSaving] = useState(false)

  const openEdit = (f) => {
    setEditItem(f)
    setEditForm({
      date: f.date ? f.date.slice(0, 10) : '',
      theme: f.theme || '',
      type: f.type || 'phone',
      content: f.content || '',
      assignedTo: f.assignedTo?._id || '',
    })
  }

  const handleEdit = async () => {
    setEditSaving(true)
    try {
      await staffAPI.updateFollowUp(editItem._id, editForm)
      toast('闅忚璁″垝宸叉洿鏂?)
      setEditItem(null)
      load()
    } catch (err) { toast(err.message || '淇濆瓨澶辫触') }
    finally { setEditSaving(false) }
  }

  const [staffList, setStaffList] = useState([])
  useEffect(() => { staffAPI.getStaffList().then(r => setStaffList(r.data || [])).catch(() => {}) }, [])

  const limit = 20

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await staffAPI.getFollowUps({ page, limit, status: statusTab, patientName, dateFrom, dateTo })
      setFollowUps(res.data.followUps)
      setTotal(res.data.total)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [page, statusTab, patientName, dateFrom, dateTo])

  useEffect(() => { load() }, [load])

  const handleSearch = (e) => { e.preventDefault(); setPage(1); load() }

  const openExec = (f) => {
    setExecItem(f)
    setExecForm({ type: f.type || 'phone', content: '', status: 'completed' })
  }

  const handleExec = async () => {
    if (!execForm.content.trim()) { toast('璇峰～鍐欓殢璁跨粨鏋?); return }
    setExecSaving(true)
    try {
      await staffAPI.updateFollowUp(execItem._id, {
        type: execForm.type,
        content: execForm.content,
        status: execForm.status,
      })
      toast('闅忚璁板綍宸叉洿鏂?)
      setExecItem(null)
      load()
    } catch (err) { toast(err.message || '淇濆瓨澶辫触') }
    finally { setExecSaving(false) }
  }

  const openCancel = (f) => { setCancelItem(f); setCancelReason('') }

  const handleCancel = async () => {
    if (!cancelReason.trim()) { toast('璇峰～鍐欏彇娑堝師鍥?); return }
    setCancelSaving(true)
    try {
      await staffAPI.updateFollowUp(cancelItem._id, { status: 'cancelled', cancelReason })
      toast('宸插彇娑堥殢璁?)
      setCancelItem(null)
      load()
    } catch (err) { toast(err.message || '鎿嶄綔澶辫触') }
    finally { setCancelSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('纭畾瑕佸垹闄よ繖鏉￠殢璁胯褰曞悧锛?)) return
    try {
      await staffAPI.deleteFollowUp(id)
      toast('宸插垹闄?)
      load()
    } catch (err) { toast(err.message || '鍒犻櫎澶辫触') }
  }

  const isPendingExec = (f) => f.status === 'planned' || f.status === 'in_progress' || f.status === 'missed'

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">闅忚绠＄悊</h1>
          <p className="page-subtitle">鍏?{total} 鏉¤褰?/p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>锛?鏂板闅忚</button>
      </div>

      {/* 鐘舵€佹爣绛?*/}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {STATUS_TABS.map(t => (
          <button
            key={t.v}
            className={`btn btn-sm ${statusTab === t.v ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => { setStatusTab(t.v); setPage(1) }}
          >{t.l}</button>
        ))}
      </div>

      {/* 鎼滅储鏍?*/}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>浼氬憳濮撳悕</label>
              <input className="form-control" placeholder="杈撳叆濮撳悕鎼滅储" value={patientName}
                onChange={e => setPatientName(e.target.value)} style={{ width: 160 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>寮€濮嬫棩鏈?/label>
              <input className="form-control" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>缁撴潫鏃ユ湡</label>
              <input className="form-control" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-sm" type="submit">鎼滅储</button>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => {
              setPatientName(''); setDateFrom(todayStr); setDateTo(''); setPage(1)
            }}>閲嶇疆</button>
          </form>
        </div>
      </div>

      {/* 鍒楄〃 */}
      <div className="card">
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>鍔犺浇涓?..</div>
        ) : followUps.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#aaa' }}>
            鏆傛棤闅忚璁板綍
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>浼氬憳</th>
                <th>璁″垝鏃ユ湡</th>
                <th>闅忚涓婚</th>
                <th>璁″垝浜哄憳</th>
                <th>鐘舵€?/th>
                <th>杩戞湡鎵撳崱</th>
                <th>鍐呭鎽樿</th>
                <th>鎿嶄綔</th>
              </tr>
            </thead>
            <tbody>
              {followUps.map(f => (
                <tr key={f._id}>
                  <td>
                    <span style={{ color: '#1E6B50', cursor: 'pointer', fontWeight: 500 }}
                      onClick={() => nav(`/patients/${f.patientId?._id}`)}>
                      {f.patientId?.name || '-'}
                    </span>
                    <div style={{ fontSize: 12, color: '#8AA89C' }}>{f.patientId?.phone}</div>
                  </td>
                  <td style={{ fontSize: 13, color: '#4A6558' }}>
                    {new Date(f.date).toLocaleDateString('zh-CN')}
                  </td>
                  <td style={{ fontSize: 13, color: '#4A6558' }}>{f.theme || '-'}</td>
                  <td style={{ fontSize: 13, color: '#4A6558' }}>
                    {f.assignedTo?.name || '-'}
                  </td>
                  <td>
                    <span style={{ color: STATUS_COLOR[f.status] || '#666', fontWeight: 500, fontSize: 13 }}>
                      {STATUS_MAP[f.status] || f.status}
                    </span>
                    {f.status === 'cancelled' && f.cancelReason && (
                      <div style={{ fontSize: 11, color: '#8AA89C', marginTop: 2 }}>{f.cancelReason}</div>
                    )}
                  </td>
                  <td>
                    {f.patientLastRecord ? (() => {
                      const days = Math.floor((Date.now() - new Date(f.patientLastRecord)) / 86400000)
                      const color = days === 0 ? '#22A06B' : days <= 3 ? '#D97706' : '#aaa'
                      const label = days === 0 ? '浠婃棩宸叉墦鍗? : `${days}澶╁墠`
                      return <span style={{ fontSize: 12, color, fontWeight: days <= 1 ? 600 : 400 }}>{label}</span>
                    })() : <span style={{ fontSize: 12, color: '#ccc' }}>鏆傛棤璁板綍</span>}
                  </td>
                  <td style={{ maxWidth: 180, fontSize: 13, color: '#4A6558' }}>
                    {f.content ? (f.content.length > 35 ? f.content.slice(0, 35) + '鈥? : f.content) : '-'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {isPendingExec(f) && (
                      <button className="btn btn-primary btn-sm" style={{ marginRight: 6 }}
                        onClick={() => openExec(f)}>鎵ц闅忚</button>
                    )}
                    {isPendingExec(f) && staff && f.staffId && String(f.staffId._id || f.staffId) === String(staff._id) && (
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}
                        onClick={() => openEdit(f)}>缂栬緫</button>
                    )}
                    {isPendingExec(f) && (
                      <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}
                        onClick={() => openCancel(f)}>鍙栨秷</button>
                    )}
                    <button className="btn btn-secondary btn-sm" style={{ marginRight: 6 }}
                      onClick={() => setDetailItem(f)}>鏌ョ湅璇︽儏</button>
                    <button className="btn btn-secondary btn-sm"
                      onClick={() => nav(`/patients/${f.patientId?._id}`)}>鏌ョ湅浼氬憳</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 鍒嗛〉 */}
      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>涓婁竴椤?/button>
          <span style={{ lineHeight: '32px', color: '#666', fontSize: 14 }}>
            绗?{page} / {Math.ceil(total / limit)} 椤?          </span>
          <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>涓嬩竴椤?/button>
        </div>
      )}

      {/* 闅忚璇︽儏寮圭獥 */}
      <DetailModal item={detailItem} onClose={() => setDetailItem(null)} />

      {/* 鏂板闅忚寮圭獥 */}
      {showModal && (
        <FollowUpModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); toast('闅忚璁″垝宸插垱寤?); load() }}
        />
      )}

      {/* 鎵ц闅忚寮圭獥 */}
      {execItem && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setExecItem(null) }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title">鎵ц闅忚 路 {execItem.patientId?.name}</h3>
              <button className="modal-close" onClick={() => setExecItem(null)}>鉁?/button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* 鍙淇℃伅 */}
              <div style={{ background: '#f9f7f3', borderRadius: 8, padding: 12, display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 70 }}>璁″垝鏃ユ湡锛?/span>
                  <span style={{ fontSize: 13 }}>{new Date(execItem.date).toLocaleDateString('zh-CN')}</span>
                </div>
                {execItem.theme && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 70 }}>闅忚涓婚锛?/span>
                    <span style={{ fontSize: 13 }}>{execItem.theme}</span>
                  </div>
                )}
                {execItem.content && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#8AA89C', minWidth: 70 }}>璁″垝鍐呭锛?/span>
                    <span style={{ fontSize: 13, whiteSpace: 'pre-line', flex: 1 }}>{execItem.content}</span>
                  </div>
                )}
              </div>
              {/* 濉啓缁撴灉 */}
              <div>
                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>闅忚鏂瑰紡</label>
                <select className="form-control" value={execForm.type}
                  onChange={e => setExecForm(f => ({ ...f, type: e.target.value }))}>
                  {TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>闅忚缁撴灉 *</label>
                <textarea className="form-control" rows={5}
                  placeholder="璁板綍鏈闅忚鐨勫疄闄呮儏鍐点€佷細鍛樺弽棣堛€佸缓璁瓑..."
                  value={execForm.content}
                  onChange={e => setExecForm(f => ({ ...f, content: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 8 }}>闅忚缁撴灉鐘舵€?/label>
                <div style={{ display: 'flex', gap: 16 }}>
                  {[
                    { v: 'completed',   l: '鉁?宸查殢璁匡紙鍦嗘弧瀹屾垚锛? },
                    { v: 'in_progress', l: '馃攧 闅忚涓紙鏈畬鎴?鏈帴閫氾級' },
                  ].map(o => (
                    <label key={o.v} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14 }}>
                      <input type="radio" name="execStatus" value={o.v}
                        checked={execForm.status === o.v}
                        onChange={() => setExecForm(f => ({ ...f, status: o.v }))} />
                      {o.l}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setExecItem(null)}>鍙栨秷</button>
              <button className="btn btn-primary" onClick={handleExec} disabled={execSaving}>
                {execSaving ? '淇濆瓨涓?..' : '淇濆瓨闅忚缁撴灉'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 鍙栨秷闅忚寮圭獥 */}
      {cancelItem && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setCancelItem(null) }}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">鍙栨秷闅忚</h3>
              <button className="modal-close" onClick={() => setCancelItem(null)}>鉁?/button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14, color: '#4A6558', marginBottom: 12 }}>
                纭鍙栨秷銆寋cancelItem.patientId?.name}銆嶇殑闅忚璁″垝锛熻濉啓鍙栨秷鍘熷洜銆?              </p>
              <textarea className="form-control" rows={4}
                placeholder="璇峰～鍐欏彇娑堝師鍥狅紙蹇呭～锛?.."
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setCancelItem(null)}>杩斿洖</button>
              <button className="btn btn-danger" onClick={handleCancel} disabled={cancelSaving}>
                {cancelSaving ? '澶勭悊涓?..' : '纭鍙栨秷闅忚'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 缂栬緫闅忚寮圭獥 */}
      {editItem && (
        <div className="modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEditItem(null) }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h3 className="modal-title">缂栬緫闅忚璁″垝 路 {editItem.patientId?.name}</h3>
              <button className="modal-close" onClick={() => setEditItem(null)}>鉁?/button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>璁″垝鏃ユ湡</label>
                <input type="date" className="form-control" value={editForm.date}
                  onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>闅忚涓婚</label>
                <input className="form-control" value={editForm.theme}
                  onChange={e => setEditForm(f => ({ ...f, theme: e.target.value }))} placeholder="闅忚涓婚" />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>鑱旂郴鏂瑰紡</label>
                <select className="form-control" value={editForm.type}
                  onChange={e => setEditForm(f => ({ ...f, type: e.target.value }))}>
                  {TYPE_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>璁″垝鍐呭</label>
                <textarea className="form-control" rows={4} value={editForm.content}
                  onChange={e => setEditForm(f => ({ ...f, content: e.target.value }))}
                  placeholder="闅忚璁″垝鍐呭..." />
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#8AA89C', display: 'block', marginBottom: 4 }}>璐熻矗浜哄憳</label>
                <select className="form-control" value={editForm.assignedTo}
                  onChange={e => setEditForm(f => ({ ...f, assignedTo: e.target.value }))}>
                  <option value="">-- 涓嶆寚瀹?--</option>
                  {staffList.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setEditItem(null)}>鍙栨秷</button>
              <button className="btn btn-primary" onClick={handleEdit} disabled={editSaving}>
                {editSaving ? '淇濆瓨涓?..' : '淇濆瓨淇敼'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
