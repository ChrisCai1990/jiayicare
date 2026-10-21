import React from 'react'
import categoryPlan from '../../../shared/nutritionCategoryDisplay.cjs'
import mealPlans from '../../../shared/nutritionMealPlans.cjs'

export default function NutritionMealPlanSelector({ selected, variants, onSelect, disabled, assessment, confirmed, onConfirm, unavailableReason }) {
  const pack = mealPlans.packBudgets(assessment?.mealEnergyKcal)
  const isPack = selected === 'meal_pack'
  return <section style={{ padding: 16, marginBottom: 16, border: '1px solid #DCE7E0', borderRadius: 10, background: '#F6FAF8', display: 'grid', gap: 12 }}>
    <strong>配餐方式</strong>
    <label className="form-label">算法<select className="form-input" disabled={disabled} value={isPack ? 'meal_pack' : 'balanced'} onChange={e => onSelect(e.target.value === 'meal_pack' ? 'meal_pack' : 'balanced_categories')}>
      <option value="balanced">第一种：中国居民平衡膳食餐盘</option>
      <option value="meal_pack" disabled={!variants.meal_pack}>第二种：早餐、晚餐各一包营养餐包</option>
    </select></label>
    {!isPack && <label className="form-label">呈现方式<select className="form-input" disabled={disabled} value={selected} onChange={e => onSelect(e.target.value)}>
      <option value="balanced_recipes">具体食谱（食材、菜名和分量）</option>
      <option value="balanced_categories">食物大类（主食、荤菜、蔬菜、水果、奶制品、蛋类等及分量）</option>
    </select></label>}
    <div style={{ fontSize: 13, color: '#355E4F' }}>最终管理期能量：{assessment?.managementKcal} kcal/日。切换后四个餐次随之更新，各版本的人工修改分别保留；保存、审核后推送当前选择。</div>
    {selected === 'balanced_categories' && <div style={{ fontSize: 13, color: '#355E4F', lineHeight: 1.7 }}>{categoryPlan.BASIS} 分量按餐次预算生成并取整，营养师可调整。</div>}
    {!variants.meal_pack && <div style={{ fontSize: 13, color: '#79551A' }}>餐包方式暂不可用：{unavailableReason || '请重新生成包含餐包方式的草稿'}。</div>}
    {isPack && <>
      <div style={{ fontSize: 13, lineHeight: 1.8 }}><strong>{mealPlans.PACK.labelName}</strong><br />标签致敏源：{mealPlans.PACK.allergenStatement}<br />{mealPlans.PACK.preparation}</div>
      <details style={{ fontSize: 13, lineHeight: 1.8 }}><summary>完整配料及标签提示</summary><div>{mealPlans.PACK.ingredients}</div><div>{mealPlans.PACK.labelWarning}</div></details>
      <div style={{ fontSize: 13, lineHeight: 1.8 }}>早餐：餐包200＋常规食物{pack?.breakfast} kcal；午餐：常规食物{pack?.lunch} kcal；晚餐：餐包200＋常规食物{pack?.dinner} kcal；加餐：{pack?.snack} kcal。餐包共2包／日，已计入总能量。</div>
      <details style={{ fontSize: 13 }}><summary>每包50 g营养成分</summary><div style={{ lineHeight: 1.8 }}>配餐计200 kcal；标签855.5 kJ（约204.5 kcal）。蛋白质13.2 g、脂肪6.2 g、碳水20.8 g、膳食纤维6 g、钠170 mg。维生素A 400 μg RE、D 0.75 μg、E 6 mg α-TE、B₁ 0.65 mg、B₂ 0.7 mg、B₆ 0.7 mg、B₁₂ 1.2 μg、C 75 mg；烟酸9 mg、叶酸162.5 μg DFE、泛酸2 mg；镁80 mg、钙260 mg、铁4.75 mg、锌3.45 mg、牛磺酸57.5 mg。</div></details>
      <label style={{ fontSize: 13 }}><input type="checkbox" disabled={disabled} checked={confirmed} onChange={e => onConfirm(e.target.checked)} /> 已核对以上完整配料、鱼／乳／豆／谷物致敏源及本会员疾病、用药，确认适用。</label>
    </>}
  </section>
}
