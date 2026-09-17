import React, { useEffect, useMemo, useState } from 'react'
import { adminAPI } from '../../api'
import { useToast } from '../../App'

const blanks = {
  institution: { name:'', level:'', nature:'', region:'', contactName:'', contactTitle:'', phone:'', campusDetails:[], cooperationStatus:'none', status:'active' },
  department: { institutionId:'', campus:'', name:'', specialties:'', introduction:'', status:'active' },
  expert: { name:'', title:'', institutionId:'', departmentId:'', campus:'', expertise:'', diseaseTags:'', introduction:'', licenseNumber:'', serviceModes:'', outpatientSchedule:'', contactNote:'', linkedStaffId:'', status:'active' },
}
const labels = { institution:'医院', department:'医院科室', expert:'专家' }
const displayList = value => Array.isArray(value) ? value.join('、') : value || ''

export default function MedicalResourcesPage() {
  const toast = useToast()
  const [data, setData] = useState({ institutions:[], departments:[], experts:[] })
  const [staff, setStaff] = useState([])
  const [tab, setTab] = useState('expert')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(blanks.expert)
  const [busy, setBusy] = useState(false)
  const load = async () => { try { const [r,s] = await Promise.all([adminAPI.medicalResources(), adminAPI.employees({ limit:500 })]); setData(r.data); setStaff((s.data || []).filter(x=>x.staffStatus !== 'inactive')) } catch(e) { toast(e.message) } }
  useEffect(()=>{ load() },[])
  const institutions = data.institutions || [], departments = data.departments || [], experts = data.experts || []
  const filteredDepartments = departments.filter(d => !form.institutionId || String(d.institutionId?._id || d.institutionId) === String(form.institutionId))
  const rows = useMemo(() => {
    const source = tab === 'institution' ? institutions : tab === 'department' ? departments : experts
    const keyword = q.trim().toLowerCase(); if (!keyword) return source
    return source.filter(x => JSON.stringify(x).toLowerCase().includes(keyword))
  },[tab,q,institutions,departments,experts])
  const open = (type, item=null) => {
    setTab(type); setEditing(item)
    const base = { ...blanks[type], ...(item || {}) }
    ;['aliases','specialties','expertise','diseaseTags','serviceModes'].forEach(k => { if (base[k]) base[k] = displayList(base[k]) })
    if (type === 'institution') base.campusDetails = item?.campusDetails?.length ? item.campusDetails.map(c=>({name:c.name||'',address:c.address||'',contactName:c.contactName||'',contactTitle:c.contactTitle||'',phone:c.phone||''})) : (item?.campuses || []).map(name=>({name,address:item.address||'',contactName:'',contactTitle:'',phone:''}))
    base.institutionId = item?.institutionId?._id || item?.institutionId || base.institutionId || ''
    base.departmentId = item?.departmentId?._id || item?.departmentId || base.departmentId || ''
    base.linkedStaffId = item?.linkedStaffId?._id || item?.linkedStaffId || ''
    setForm(base)
  }
  const set = k => e => setForm(f=>({...f,[k]:e.target.value}))
  const save = async () => {
    setBusy(true)
    try {
      const api = tab === 'institution' ? ['createMedicalInstitution','updateMedicalInstitution'] : tab === 'department' ? ['createMedicalDepartment','updateMedicalDepartment'] : ['createMedicalExpert','updateMedicalExpert']
      editing ? await adminAPI[api[1]](editing._id, form) : await adminAPI[api[0]](form)
      toast(`${labels[tab]}已保存`); setEditing(null); setForm(null); await load()
    } catch(e) { toast(e.message) } finally { setBusy(false) }
  }
  const toggle = async item => { const fn = tab === 'institution' ? 'toggleMedicalInstitution' : tab === 'department' ? 'toggleMedicalDepartment' : 'toggleMedicalExpert'; try { await adminAPI[fn](item._id); await load() } catch(e) { toast(e.message) } }
  return <div>
    <div className="page-header"><div><div className="page-title">医疗资源库</div><div className="page-subtitle">医院、医院科室和专家独立建档；员工账号只负责系统登录和内部权限。</div></div><button className="btn btn-primary" onClick={()=>open(tab)}>＋ 新增{labels[tab]}</button></div>
    <div style={{padding:'12px 16px',background:'#EFF8F3',borderRadius:10,color:'#1E6B50',fontSize:13,marginBottom:16}}>专家可以仅作为外部医疗资源存在；只有需要登录医护端接收协作的专家，才关联员工账号。</div>
    <div className="card"><div className="card-body">
      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:16}}>{[['institution',`医院（${institutions.length}）`],['department',`科室（${departments.length}）`],['expert',`专家（${experts.length}）`]].map(([k,l])=><button key={k} className={`btn ${tab===k?'btn-primary':'btn-secondary'}`} onClick={()=>{setTab(k);setForm(null);setEditing(null)}}>{l}</button>)}<input className="form-input" style={{marginLeft:'auto',width:260}} value={q} onChange={e=>setQ(e.target.value)} placeholder="搜索医院、科室、姓名或擅长"/></div>
      {!rows.length ? <div style={{padding:40,textAlign:'center',color:'#8AA89C'}}>暂无{labels[tab]}资料</div> : <table className="table"><thead><tr>{(tab==='institution'?['医院','等级/性质','地区','总联系人','院区','状态','操作']:tab==='department'?['医院','院区','科室','特色方向','状态','操作']:['专家','医院/科室','职称','擅长/疾病','账号关联','状态','操作']).map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(item=><tr key={item._id}>{tab==='institution'?<><td><b>{item.name}</b></td><td>{item.level||'-'} / {({public:'公立',private:'民营',other:'其他'})[item.nature]||'-'}</td><td>{item.region||'-'}</td><td>{item.contactName||'-'}{item.contactTitle&&<div style={{fontSize:11,color:'#8AA89C'}}>{item.contactTitle}</div>}{item.phone&&<div style={{fontSize:11,color:'#65776F'}}>{item.phone}</div>}</td><td>{(item.campusDetails||[]).map(c=>c.name).join('、')||displayList(item.campuses)||'-'}</td></>:tab==='department'?<><td>{item.institutionId?.name||'-'}</td><td>{item.campus||'-'}</td><td><b>{item.name}</b></td><td>{displayList(item.specialties)||'-'}</td></>:<><td><b>{item.name}</b></td><td>{item.institutionId?.name||'-'} · {item.departmentId?.name||'-'}{item.campus?` · ${item.campus}`:''}</td><td>{item.title||'-'}</td><td>{displayList(item.expertise)||displayList(item.diseaseTags)||'-'}</td><td>{item.linkedStaffId?.name||'未关联（外部）'}</td></>}<td>{item.status==='active'?'启用':'停用'}</td><td><button className="btn btn-secondary btn-sm" onClick={()=>open(tab,item)}>编辑</button> <button className="btn btn-secondary btn-sm" onClick={()=>toggle(item)}>{item.status==='active'?'停用':'启用'}</button></td></tr>)}</tbody></table>}
    </div></div>
    {form && <div className="modal-overlay" onClick={e=>{if(e.target===e.currentTarget)setForm(null)}}><div className="modal" style={{maxWidth:720}}><div className="modal-header"><h3 className="modal-title">{editing?'编辑':'新增'}{labels[tab]}</h3><button className="modal-close" onClick={()=>setForm(null)}>×</button></div><div className="modal-body" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
      {tab==='institution' && <><Field label="医院名称 *" value={form.name} onChange={set('name')}/><Field label="医院等级" value={form.level} onChange={set('level')} placeholder="如：三级甲等"/><Select label="性质" value={form.nature} onChange={set('nature')} options={[['','请选择'],['public','公立'],['private','民营'],['other','其他']]}/><Field label="地区" value={form.region} onChange={set('region')}/><Field label="医院总联系人" value={form.contactName} onChange={set('contactName')}/><Field label="总联系人职位" value={form.contactTitle} onChange={set('contactTitle')} placeholder="如：医务处主任"/><Field span label="医院总联系电话" value={form.phone} onChange={set('phone')}/><CampusEditor campuses={form.campusDetails||[]} onChange={campusDetails=>setForm(f=>({...f,campusDetails}))}/></>}
      {tab==='department' && <><Select label="医院 *" value={form.institutionId} onChange={set('institutionId')} options={[['','请选择'],...institutions.filter(x=>x.status==='active').map(x=>[x._id,x.name])]}/><Field label="院区" value={form.campus} onChange={set('campus')}/><Field label="科室名称 *" value={form.name} onChange={set('name')}/><Field label="特色方向" value={form.specialties} onChange={set('specialties')} placeholder="多个用顿号分隔"/><Text span label="科室简介" value={form.introduction} onChange={set('introduction')}/></>}
      {tab==='expert' && <><Field label="姓名 *" value={form.name} onChange={set('name')}/><Field label="职称" value={form.title} onChange={set('title')} placeholder="如：主任医师"/><Select label="医院 *" value={form.institutionId} onChange={e=>setForm(f=>({...f,institutionId:e.target.value,departmentId:''}))} options={[['','请选择'],...institutions.filter(x=>x.status==='active').map(x=>[x._id,x.name])]}/><Select label="科室 *" value={form.departmentId} onChange={set('departmentId')} options={[['','请选择'],...filteredDepartments.filter(x=>x.status==='active').map(x=>[x._id,x.name])]}/><Field label="院区" value={form.campus} onChange={set('campus')}/><Select label="关联员工账号" value={form.linkedStaffId} onChange={set('linkedStaffId')} options={[['','不关联（外部专家）'],...staff.filter(x=>x.role==='specialist').map(x=>[x._id,`${x.name}${x.title?` · ${x.title}`:''}`])]}/><Field span label="擅长领域" value={form.expertise} onChange={set('expertise')} placeholder="如：眩晕、前庭疾病、头痛"/><Field span label="疾病标签" value={form.diseaseTags} onChange={set('diseaseTags')} placeholder="用于转介搜索，多个用顿号分隔"/><Field label="执业证号" value={form.licenseNumber} onChange={set('licenseNumber')}/><Field label="服务方式" value={form.serviceModes} onChange={set('serviceModes')} placeholder="门诊、线上咨询等"/><Field span label="出诊信息" value={form.outpatientSchedule} onChange={set('outpatientSchedule')}/><Text span label="专家简介" value={form.introduction} onChange={set('introduction')}/><Text span label="内部联络备注" value={form.contactNote} onChange={set('contactNote')}/></>}
    </div><div className="modal-footer"><button className="btn btn-secondary" onClick={()=>setForm(null)}>取消</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy?'保存中…':'保存'}</button></div></div></div>}
  </div>
}

function CampusEditor({ campuses, onChange }) {
  const update = (index,key,value) => onChange(campuses.map((item,i)=>i===index?{...item,[key]:value}:item))
  return <div style={{gridColumn:'span 2',borderTop:'1px solid #E5E7EB',paddingTop:12}}><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}><div><b>院区信息</b><div style={{fontSize:11,color:'#8AA89C',marginTop:2}}>每个院区分别维护地址、联系人、职位和联系电话</div></div><button type="button" className="btn btn-secondary btn-sm" onClick={()=>onChange([...campuses,{name:'',address:'',contactName:'',contactTitle:'',phone:''}])}>＋ 添加院区</button></div>{!campuses.length&&<div style={{padding:12,textAlign:'center',background:'#F7F9F8',color:'#8AA89C',borderRadius:8}}>尚未添加院区</div>}{campuses.map((campus,index)=><div key={index} style={{border:'1px solid #E0E8E3',borderRadius:9,padding:12,marginTop:8}}><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}><Field label="院区名称 *" value={campus.name} onChange={e=>update(index,'name',e.target.value)}/><Field label="院区联系电话" value={campus.phone} onChange={e=>update(index,'phone',e.target.value)}/><Field span label="院区地址" value={campus.address} onChange={e=>update(index,'address',e.target.value)}/><Field label="院区联系人" value={campus.contactName} onChange={e=>update(index,'contactName',e.target.value)}/><Field label="联系人职位" value={campus.contactTitle} onChange={e=>update(index,'contactTitle',e.target.value)}/></div><div style={{textAlign:'right',marginTop:8}}><button type="button" className="btn btn-danger btn-sm" onClick={()=>onChange(campuses.filter((_,i)=>i!==index))}>删除院区</button></div></div>)}</div>
}

function Field({label,value,onChange,placeholder='',span=false}) { return <div className="form-group" style={{marginBottom:0,gridColumn:span?'span 2':undefined}}><label className="form-label">{label}</label><input className="form-input" value={value||''} onChange={onChange} placeholder={placeholder}/></div> }
function Text({label,value,onChange,span=false}) { return <div className="form-group" style={{marginBottom:0,gridColumn:span?'span 2':undefined}}><label className="form-label">{label}</label><textarea className="form-input" rows={3} value={value||''} onChange={onChange}/></div> }
function Select({label,value,onChange,options}) { return <div className="form-group" style={{marginBottom:0}}><label className="form-label">{label}</label><select className="form-input" value={value||''} onChange={onChange}>{options.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></div> }
