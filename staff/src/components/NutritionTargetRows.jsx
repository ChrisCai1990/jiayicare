import React from 'react'

export const emptyNutritionTarget = () => ({ metric: '', baseline: '', target: '' })

export function nutritionTargetsFrom(source = {}) {
  if (Array.isArray(source.nutritionTargets) && source.nutritionTargets.length) return source.nutritionTargets.map(row => ({
    metric: row.metric || '', baseline: row.baseline || '', target: row.target || '',
  }))
  if (Array.isArray(source.targets) && source.targets.length) return source.targets.map(row => ({
    metric: row.metric || '', baseline: row.baseline || '', target: row.target || '',
  }))
  if (source.metric || source.baseline || source.target || source.nutritionMetric || source.nutritionBaseline || source.nutritionTarget) return [{
    metric: source.metric || source.nutritionMetric || '',
    baseline: source.baseline || source.nutritionBaseline || '',
    target: source.target || source.nutritionTarget || '',
  }]
  return [emptyNutritionTarget()]
}

export function nutritionTargetError(targets) {
  if (!Array.isArray(targets) || !targets.length) return '请至少填写一条观察指标'
  if (targets.length > 12) return '观察指标最多12条'
  const names = new Set()
  for (const [index, row] of targets.entries()) {
    if (!String(row.metric || '').trim() || !String(row.baseline || '').trim() || !String(row.target || '').trim()) return `请补齐第${index + 1}条指标的名称、已核实基线和阶段目标`
    const name = String(row.metric).trim().toLowerCase()
    if (names.has(name)) return `第${index + 1}条观察指标与前面重复`
    names.add(name)
  }
  return ''
}

export default function NutritionTargetRows({ value, onChange, disabled = false }) {
  const targets = nutritionTargetsFrom({ nutritionTargets: value })
  const setRow = (index, key, fieldValue) => onChange(targets.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: fieldValue } : row))
  return <div style={{ display: 'grid', gap: 10 }}>
    {targets.map((row, index) => <div key={index} style={{ border: '1px solid #DCE7E0', borderRadius: 9, padding: 12, background: '#FAFCFB' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong>观察指标 {index + 1}</strong>
        {!disabled && targets.length > 1 && <button type="button" className="btn btn-secondary btn-sm" onClick={() => onChange(targets.filter((_, rowIndex) => rowIndex !== index))}>删除</button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {[['metric', '指标名称', '如体重、骨骼肌或每周含糖饮料次数'], ['baseline', '已核实基线', '填入数值、单位及测量日期或当前情况'], ['target', '阶段目标', '填入可对比的数值、单位或目标情况']].map(([key, label, placeholder]) => <label key={key} className="form-label">{label} *<input className="form-input" value={row[key]} maxLength={key === 'metric' ? 100 : 200} disabled={disabled} placeholder={placeholder} onChange={e => setRow(index, key, e.target.value)} /></label>)}
      </div>
    </div>)}
    {!disabled && targets.length < 12 && <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={() => onChange([...targets, emptyNutritionTarget()])}>＋ 添加观察指标</button>}
  </div>
}
