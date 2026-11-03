import React, { useState } from 'react'
import ReferralScreeningList from './ReferralScreeningList'
const HEALTH_SECTION_LABELS = {
  basicInfo:       '基本信息',
  foodAllergy:     '食物过敏',
  drugAllergy:     '药物过敏',
  medicalHistory:  '既往病史',
  specialDiseases: '既往病史／慢病记录（非专病档案）',
  familyHistory:   '家族史',
  longTermMeds:    '长期用药',
  longTermSups:    '长期营养补剂',
  dietSummary:     '膳食调查概述',
  latestVitals:    '近期健康数据记录',
  allergies:       '过敏史',
  medications:     '当前用药',
  surgeries:       '手术史',
  recentSymptoms:  '近期症状',
  currentMedications: '当前用药',
  currentSupplements: '当前营养素补充',
  screeningRecords: '专项筛查项目与结果',
  diseaseHistory: '疾病史与当前状态',
  medicationRecords: '用药记录（含状态与时间）',
  supplementRecords: '营养补充记录（含状态与时间）',
  diseaseSummary: '首次健康信息摘要',
  diseaseCourse: '后续健康变化与医疗机构诊疗归档',
}

const DISEASE_FIELD_LABELS = {
  chiefComplaint:'主诉／主要健康诉求', presentIllness:'首次发病与既往经过', physicalExam:'医疗机构检查信息',
  epidemiologicalHistory:'相关接触／流行病学信息', initialDiagnosis:'医疗机构诊断归档', currentMedication:'医疗机构治疗及用药信息',
  content:'健康及症状变化', examination:'医疗机构检查信息', diagnosis:'医疗机构诊断归档', medicationChange:'用药医嘱变化',
  treatmentResponse:'治疗后反馈', nextPlan:'后续安排', sourceInstitution:'来源医疗机构',
}

const formatDate = value => value ? new Date(value).toLocaleDateString('zh-CN') : '日期未记录'

const HEALTH_SECTION_ORDER = [
  'basicInfo', 'allergies', 'foodAllergy', 'drugAllergy', 'medicalHistory', 'specialDiseases',
  'familyHistory', 'surgeries', 'diseaseSummary', 'diseaseCourse', 'recentSymptoms',
  'medicationRecords', 'supplementRecords', 'medications', 'longTermMeds', 'longTermSups',
  'latestVitals', 'dietSummary',
]

const formatHealthValue = value => {
  if (Array.isArray(value)) return value.map(item => typeof item === 'object'
    ? Object.values(item).filter(Boolean).join(' · ')
    : item).join('；')
  if (typeof value === 'object') return Object.entries(value).filter(([, item]) => item)
    .map(([key, item]) => `${key}：${Array.isArray(item) ? item.join('、') : item}`).join('；')
  return String(value)
}

function HealthRecordList({ records, supplement = false }) {
  const active = records.filter(item => item?.状态 !== '已停用')
  const stopped = records.filter(item => item?.状态 === '已停用')
  const renderGroup = (title, items, stoppedGroup) => items.length > 0 && (
    <div style={{ marginTop: 7 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: stoppedGroup ? '#8A6B61' : '#1E6B50', marginBottom: 5 }}>
        {title}（{items.length}）
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {items.map((item, index) => (
          <div key={index} style={{ padding: '8px 10px', background: stoppedGroup ? '#FAF8F7' : '#FFFFFF', border: `1px solid ${stoppedGroup ? '#E8DFDB' : '#D8E8E1'}`, borderRadius: 7 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <strong style={{ color: '#173B2E', fontSize: 12 }}>{item?.药品 || item?.名称 || (supplement ? '未命名补充剂' : '未命名药品')}</strong>
              <span style={{ padding: '2px 7px', borderRadius: 10, fontSize: 10, fontWeight: 700, color: stoppedGroup ? '#8A4B3D' : '#176B4D', background: stoppedGroup ? '#F5E8E4' : '#E7F5EF' }}>{item?.状态 || '状态未记录'}</span>
            </div>
            <div style={{ color: '#60756B', fontSize: 11, lineHeight: 1.65, marginTop: 4 }}>
              <span>时间：{item?.开始时间 || '未记录'} → {item?.结束或停用时间 || '—'}</span>
              {item?.用法 && <span style={{ marginLeft: 12 }}>用法：{item.用法}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
  return <>{renderGroup(supplement ? '补充中／待审核' : '使用中／待审核', active, false)}{renderGroup('已停用', stopped, true)}</>
}

export default function AttachedHealthInfoView({ info }) {
  const [expanded, setExpanded] = useState(false)
  if (!info) return null
  const sections = Object.keys(info).filter(k => {
    const v = info[k]
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  }).sort((a, b) => {
    const ai = HEALTH_SECTION_ORDER.indexOf(a); const bi = HEALTH_SECTION_ORDER.indexOf(b)
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi)
  })
  if (sections.length === 0) return null
  const medicationCount = ['medicationRecords', 'supplementRecords'].reduce((total, key) => total + (Array.isArray(info[key]) ? info[key].length : 0), 0)

  return (
    <div style={{ marginTop: 10, padding: expanded ? '12px 14px' : '9px 14px', background: '#F5F9FC', borderRadius: 9, borderLeft: '4px solid #0077B6' }}>
      <button type="button" onClick={() => setExpanded(value => !value)} style={{ width:'100%', border:0, padding:0, background:'transparent', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, cursor:'pointer', textAlign:'left' }}>
        <span style={{ fontSize: 13, color: '#006EAA', fontWeight: 700 }}>附带健康档案 <span style={{ color:'#7895A3', fontWeight:500 }}>· {sections.length} 项{medicationCount ? ` · ${medicationCount} 条用药/补充记录` : ''}</span></span>
        <span style={{ color:'#0077B6', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>{expanded ? '收起 ▲' : '展开查看 ▼'}</span>
      </button>
      {expanded && <div style={{ marginTop:9 }}>{sections.map(k => {
        const v = info[k]
        const label = HEALTH_SECTION_LABELS[k] || k
        if (k === 'screeningRecords' && Array.isArray(v)) return <ReferralScreeningList key={k} records={v} />
        if ((k === 'medicationRecords' || k === 'supplementRecords') && Array.isArray(v)) {
          return <div key={k} style={{ padding: '9px 10px', background: '#EDF5F1', borderRadius: 8, marginBottom: 8 }}><div style={{ color:'#355E4F', fontSize:12, fontWeight:700 }}>{label}</div><HealthRecordList records={v} supplement={k === 'supplementRecords'} /></div>
        }
        if (k === 'diseaseSummary' && typeof v === 'object') {
          const rows = Object.entries(v).filter(([key, value]) => DISEASE_FIELD_LABELS[key] && String(value || '').trim())
          return <div key={k} style={{ padding:'9px 10px', background:'#FFFFFF', border:'1px solid #DCE8E3', borderRadius:8, marginBottom:8 }}><div style={{ color:'#355E4F', fontSize:12, fontWeight:700, marginBottom:6 }}>{label}</div>{rows.map(([key,value]) => <div key={key} style={{ fontSize:12, color:'#1A2B24', lineHeight:1.65, marginBottom:4 }}><span style={{ color:'#60756B', fontWeight:600 }}>{DISEASE_FIELD_LABELS[key]}：</span>{String(value)}</div>)}</div>
        }
        if (k === 'diseaseCourse' && Array.isArray(v)) {
          return <div key={k} style={{ padding:'9px 10px', background:'#FFFFFF', border:'1px solid #DCE8E3', borderRadius:8, marginBottom:8 }}><div style={{ color:'#355E4F', fontSize:12, fontWeight:700, marginBottom:4 }}>{label}</div>{v.map((entry,index) => <div key={index} style={{ padding:'7px 0', borderTop:index ? '1px solid #DCE8E3':'none', fontSize:12, lineHeight:1.65 }}><div style={{ color:'#60756B', fontWeight:600, marginBottom:3 }}>{formatDate(entry.occurredAt)}{entry.sourceInstitution ? ` · ${entry.sourceInstitution}` : ''}</div>{Object.entries(entry).filter(([key,value]) => DISEASE_FIELD_LABELS[key] && String(value || '').trim()).map(([key,value]) => <div key={key}><span style={{ color:'#60756B' }}>{DISEASE_FIELD_LABELS[key]}：</span>{String(value)}</div>)}</div>)}</div>
        }
        return (
          <div key={k} style={{ padding: '7px 9px', background: '#FFFFFF', border: '1px solid #E1EAE6', borderRadius: 7, fontSize: 12, color: '#1A2B24', lineHeight: 1.65, marginBottom: 6 }}>
            <div style={{ color: '#4A6558', fontWeight: 700, marginBottom: 2 }}>{label}</div>
            <div>{formatHealthValue(v)}</div>
          </div>
        )
      })}</div>}
    </div>
  )
}
