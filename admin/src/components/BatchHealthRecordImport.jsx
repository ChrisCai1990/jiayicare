import React, { useRef, useState } from 'react'
import { adminAPI } from '../api'
const HEALTH_IMPORT_HEADERS = ['身份证号码', '姓名', '添加时间', '身高(CM)', '体重(KG)', 'BMI', '体温(℃)', '呼吸(次/分)', '脉搏(次/分)', '收缩压', '舒张压', '血糖(mmol/L)', '氧饱和度(%)', '疼痛评分(0-10)', '左眼视力', '右眼视力', '眼轴(mm)', '腰围(cm)', '臀围(cm)', '腰臀比', '备注']
const WIDE_HEALTH_COLUMNS = [
  ['身高(cm)', '身高'], ['体重(kg)', '体重'], ['BMI', 'BMI'], ['体温(℃)', '体温'], ['呼吸(次/分)', '呼吸'], ['脉搏(次/分)', '脉搏'],
  ['血糖(mmol/L)', '血糖'], ['血氧饱和度(%)', '血氧饱和度'], ['疼痛评分(0-10)', '疼痛评分'], ['左眼视力', '左眼视力'], ['右眼视力', '右眼视力'],
  ['眼轴(mm)', '眼轴'], ['腰围(cm)', '腰围'], ['臀围(cm)', '臀围'], ['腰臀比', '腰臀比'],
]

function parseHealthImportCsv(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  const source = String(text || '').replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '"' && quoted && source[i + 1] === '"') { cell += '"'; i += 1 }
    else if (ch === '"') quoted = !quoted
    else if (ch === ',' && !quoted) { row.push(cell.trim()); cell = '' }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && source[i + 1] === '\n') i += 1
      row.push(cell.trim()); cell = ''
      if (row.some(Boolean)) rows.push(row)
      row = []
    } else cell += ch
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row)
  if (!rows.length) return []
  const headers = rows[0].map(x => x.trim()
    .replace(/^添加时间$/, '测量时间')
    .replace(/\(CM\)/i, '(cm)')
    .replace(/\(KG\)/i, '(kg)')
    .replace(/^氧饱和度\(%\)$/, '血氧饱和度(%)'))
  const isWide = !headers.includes('数据类型')
  const required = isWide ? ['身份证号码', '姓名', '测量时间'] : ['身份证号码', '姓名', '测量时间', '数据类型']
  if (required.some(x => !headers.includes(x))) throw new Error(`模板缺少必填列：${required.join('、')}`)
  let inheritedId = '', inheritedName = ''
  const parsed = []
  rows.slice(1).forEach((cols, rowIndex) => {
    const get = name => cols[headers.indexOf(name)] || ''
    inheritedId = get('身份证号码') || inheritedId
    inheritedName = get('姓名') || inheritedName
    const common = { idNumber: inheritedId, name: inheritedName, recordedAt: get('测量时间'), note: get('备注'), sourceRowNumber: rowIndex + 2 }
    if (!isWide) {
      parsed.push({ ...common, type: get('数据类型'), systolic: get('收缩压'), diastolic: get('舒张压'), value: get('数值') })
      return
    }
    const systolic = get('收缩压'), diastolic = get('舒张压')
    if (systolic || diastolic) parsed.push({ ...common, type: '血压', systolic, diastolic, value: '' })
    WIDE_HEALTH_COLUMNS.forEach(([column, type]) => {
      const value = get(column)
      if (value !== '') parsed.push({ ...common, type, systolic: '', diastolic: '', value })
    })
  })
  return parsed.filter(x => x.recordedAt || x.type || x.value || x.systolic || x.diastolic)
}

export function BatchHealthRecordImport({ patient, onSaved, toast: toastFn }) {
  const inputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [rows, setRows] = useState([])
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const canImport = patient.idType !== 'passport' && !!patient.idNumber

  const downloadTemplate = () => {
    if (!canImport) return toastFn('请先在基本信息中登记客户身份证号码')
    const sample = [patient.idNumber, patient.name || '', '2024-01-15 08:30', '170', '70.2', '24.3', '36.5', '16', '74', '101', '68', '5.8', '98', '0', '1.0', '1.0', '24.1', '82', '96', '0.85', '早晨测量']
    const csv = [HEALTH_IMPORT_HEADERS, sample].map(row => row.map(value => `"${String(value || '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `历史健康数据导入模板_${patient.name || '客户'}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const chooseFile = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = parseHealthImportCsv(await file.text())
      if (!parsed.length) throw new Error('文件中没有数据')
      setLoading(true); setFileName(file.name); setRows(parsed); setPreview(null)
      const res = await adminAPI.importPatientHealthRecords(patient._id, { rows: parsed, fileName: file.name, preview: true })
      setPreview(res.data)
    } catch (error) { setRows([]); setPreview(null); toastFn(error.message || '文件解析失败') }
    finally { setLoading(false) }
  }

  const confirmImport = async () => {
    if (!preview?.summary?.ready) return
    setLoading(true)
    try {
      const res = await adminAPI.importPatientHealthRecords(patient._id, { rows, fileName, preview: false })
      toastFn(`成功导入 ${res.data.imported} 条历史健康数据`)
      setRows([]); setPreview(null); setFileName(''); onSaved()
    } catch (error) { toastFn(error.message || '导入失败') }
    finally { setLoading(false) }
  }

  const downloadFailures = () => {
    const failed = preview?.rows?.filter(row => row.status !== 'ready') || []
    const csv = [['原文件行号', '状态', '原因'], ...failed.map(row => [row.rowNumber, row.status === 'duplicate' ? '重复' : '错误', row.message])]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })); a.download = `导入失败明细_${patient.name || '客户'}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header"><div className="card-title">历史健康数据批量导入</div></div>
      <div className="card-body">
        <div style={{ fontSize: 12, color: '#8AA89C', marginBottom: 12 }}>横向模板每个测量时间一行、各指标分列，空白指标自动跳过；身份证号码精准匹配当前客户，姓名二次校验。同一客户后续行可留空身份证和姓名，系统会自动沿用上一行；旧版纵向模板仍可继续导入，单次最多1000条健康记录。</div>
        {!canImport && <div style={{ padding: '9px 12px', marginBottom: 12, borderRadius: 8, color: '#B45309', background: '#FFF7E8', fontSize: 13 }}>该客户尚未登记身份证号码，请先完善基本信息后再导入。</div>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary btn-sm" onClick={downloadTemplate} disabled={!canImport}>下载CSV模板</button>
          <button className="btn btn-primary btn-sm" onClick={() => inputRef.current?.click()} disabled={!canImport || loading}>{loading ? '处理中…' : '上传并预检'}</button>
          <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={chooseFile} />
        </div>
        {preview && <div style={{ marginTop: 14, padding: 12, borderRadius: 8, background: '#F7FAF8' }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fileName}</div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 13 }}><span style={{ color: '#1E6B50' }}>可导入 {preview.summary.ready}</span><span style={{ color: '#D97706' }}>重复 {preview.summary.duplicate}</span><span style={{ color: '#DC3545' }}>错误 {preview.summary.error}</span></div>
          {preview.rows.some(row => row.status !== 'ready') && <div style={{ marginTop: 8, maxHeight: 140, overflow: 'auto', fontSize: 12, color: '#6B7280' }}>{preview.rows.filter(row => row.status !== 'ready').slice(0, 20).map(row => <div key={row.rowNumber}>第{row.rowNumber}行：{row.message}</div>)}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button className="btn btn-primary btn-sm" disabled={!preview.summary.ready || loading} onClick={confirmImport}>确认导入 {preview.summary.ready} 条</button>{(preview.summary.error + preview.summary.duplicate) > 0 && <button className="btn btn-secondary btn-sm" onClick={downloadFailures}>下载失败明细</button>}</div>
        </div>}
      </div>
    </div>
  )
}

