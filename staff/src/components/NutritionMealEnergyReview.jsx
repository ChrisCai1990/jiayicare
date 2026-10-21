import React from 'react'
import energyReview from '../../../shared/nutritionMealEnergy.cjs'

const names = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }
const difference = value => value === 0 ? '与目标一致' : value > 0 ? `高于目标 ${value} kcal` : `低于目标 ${-value} kcal`
export function MealEnergySummary({ mealKey, modules, assessment, manual }) {
  const meal = energyReview.estimateEditedMeals(modules, assessment, manual).meals[mealKey]
  if (!meal) return null
  return <div role="status" style={{ margin: '-6px 0 16px', padding: '0 12px', fontSize: 13, color: '#355E4F' }}>{names[mealKey]}最新估算：{meal.unknown ? `已识别部分 ${meal.subtotal} kcal，${meal.unknown} 项待核实（见上方能量核对）` : `${meal.subtotal} kcal${meal.difference === null ? '' : `；${difference(meal.difference)}`}`}</div>
}
export default function NutritionMealEnergyReview({ modules, assessment, manual, onChange, disabled }) {
  const result = energyReview.estimateEditedMeals(modules, assessment, manual)
  return <section style={{ padding: 16, border: '1px solid #DCE7E0', borderRadius: 10, marginBottom: 16, background: '#FAFCFB' }}>
    <strong>编辑后能量估算 · 随餐次内容实时更新</strong>
    <div style={{ marginTop: 8 }}>{result.unknown ? `已识别部分小计 ${result.subtotal} kcal，另有 ${result.unknown} 项待核实，暂不能判断全天差额。` : `全天估算 ${result.subtotal} kcal；${result.difference === null ? '请确认管理期目标' : difference(result.difference)}。`}</div>
    <div style={{ fontSize: 12, color: '#66776E', margin: '8px 0' }}>大类采用交换份平均值估算，非实际食物精确热量；熟重、液体量、豆制品及具体食谱无法直接套用时，请填写本行总能量。烹调油需单列。增删或修改内容后重新计算，不改动管理期目标。</div>
    {Object.entries(result.meals).map(([key, meal]) => <details key={key} style={{ margin: '8px 0' }}>
      <summary>{names[key]}：{meal.unknown ? `已识别 ${meal.subtotal} kcal，${meal.unknown} 项待核实` : `约 ${meal.subtotal} kcal`}{meal.difference !== null ? `；${difference(meal.difference)}` : ''}（展开核对）</summary>
      {meal.rows.map((row, index) => <div key={`${index}:${row.line}`} style={{ padding: 8, borderBottom: '1px solid #E5EBE7', fontSize: 13 }}>
        <div>{row.line} → {row.kcal === null ? '待核实' : `约 ${Math.round(row.kcal)} kcal`}</div>
        <div style={{ color: '#66776E', fontSize: 12 }}>{row.source}：{row.note}</div>
        {row.source !== '餐包固定值' && <label>核实本行总能量（kcal，可覆盖估算）<input type="number" min="0" max="10000" step="0.1" disabled={disabled} value={manual?.[key]?.[row.line] ?? ''} onChange={e => onChange(key, row.line, e.target.value)} style={{ width: 110, marginLeft: 8 }} placeholder="待核实" /></label>}
      </div>)}
    </details>)}
    <div style={{ fontSize: 13, color: '#355E4F' }}>{result.unknown ? '调整提示：先补齐未识别项的能量，再判断是否需要增加或减少食物。' : result.difference === null ? '调整提示：请先确认管理期每日能量目标。' : result.difference > 0 ? '调整提示：优先复核高于目标的餐次、主食分量与烹调油，再结合营养结构调整。' : result.difference < 0 ? '调整提示：优先复核低于目标的餐次，结合营养结构补足食物；不要仅靠增加油脂补差额。' : '能量估算与目标一致，仍需核对营养结构、过敏及禁忌。'}</div>
    <a href={energyReview.SOURCE} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}>交换份参考依据（附录E，仅用于食物能量估算）</a>
  </section>
}
