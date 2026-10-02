// Platform-wide inventory. A source change creates a review task; it never changes a clinical rule.
// Add every guideline-derived rule or validated scale here when it is introduced.
const RULE_VERSION = '2026-10-03.1';
const standards = [
  { id: 'c-tirads', title: 'C-TIRADS 甲状腺结节分类', kind: 'guideline', version: '2020', ruleVersion: RULE_VERSION, sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/32827126/', implementation: 'shared/standardDiseaseAssessment.cjs', monitor: 'source' },
  { id: 'acr-tirads', title: 'ACR TI-RADS 甲状腺结节分类', kind: 'guideline', version: '2017', ruleVersion: RULE_VERSION, sourceUrl: 'https://www.acr.org/Clinical-Resources/Clinical-Tools-and-Reference/Reporting-and-Data-Systems/TI-RADS', implementation: 'shared/standardDiseaseAssessment.cjs', monitor: 'source' },
  { id: 'bi-rads', title: 'ACR BI-RADS 乳腺影像分类', kind: 'guideline', version: 'ACR', ruleVersion: RULE_VERSION, sourceUrl: 'https://www.acr.org/Clinical-Resources/Clinical-Tools-and-Reference/Reporting-and-Data-Systems/BI-RADS', implementation: 'shared/standardDiseaseAssessment.cjs', monitor: 'source' },
  { id: 'lung-rads', title: 'ACR Lung-RADS 肺结节分类', kind: 'guideline', version: 'v2022', ruleVersion: RULE_VERSION, sourceUrl: 'https://www.acr.org/-/media/ACR/Files/RADS/Lung-RADS/Lung-RADS-2022.pdf', implementation: 'shared/standardDiseaseAssessment.cjs', monitor: 'source' },
  { id: 'cn-lipid-2023', title: '中国血脂管理指南：ASCVD 风险评估', kind: 'guideline', version: '2023', ruleVersion: '2026-07-06', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/36925135/', implementation: 'backend/src/utils/ascvdRisk.js', monitor: 'source' },
  { id: 'phq9', title: 'PHQ-9 抑郁症状量表', kind: 'instrument', version: '2001', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/11556941/', implementation: 'backend/src/config/psychScales.js', monitor: 'manual' },
  { id: 'gad7', title: 'GAD-7 焦虑症状量表', kind: 'instrument', version: '2006', sourceUrl: 'https://pubmed.ncbi.nlm.nih.gov/16717171/', implementation: 'backend/src/config/psychScales.js', monitor: 'manual' },
  { id: 'scl90-sas-sds', title: 'SCL-90 / SAS / SDS 量表导入与阈值', kind: 'instrument', version: '待核对', sourceUrl: '', implementation: 'backend/src/utils/psychScaleImport.js', monitor: 'manual' },
  { id: 'health-score', title: '基础健康评分与慢病扣分', kind: 'internal', version: '内部规则', sourceUrl: '', implementation: 'backend/src/utils/healthScore.js', monitor: 'manual' },
  { id: 'cancer-screening', title: '癌症筛查覆盖口径', kind: 'internal', version: '内部规则', sourceUrl: '', implementation: 'backend/src/config/cancerScreeningRules.js', monitor: 'manual' },
];
module.exports = { RULE_VERSION, standards };
