// Shared instructions for new drafts and revisions. Sparse self-recording is normal
// in ongoing health management; missing daily entries are not failed adherence.
const PHASE_ASSESSMENT_EVIDENCE_RULES = `只描述有来源的记录、日期、数值和已确认的生活方式习惯，不给客户或执行情况打分、贴“改善/恶化/升级/依从性差”等结论标签。已有生活方式档案可作为日常习惯的自述背景；没有明确变更记录时，不得因某几天未打卡就推断习惯中断，也不得把档案习惯伪装成每天都有记录。
健康数据只在同一指标、有可比较的多次记录时描述观察到的变化及记录范围；少量、不等间隔或测量条件不明的记录，只逐项陈述，不称“趋势”“明显波动”“持续改善”。记录日期少不等于没有执行、没有饮食或监测不合格；不要要求客户每天或每餐记录。
生活方式与指标必须有相近时间的两类记录，且存在可比较的变化，才能描述可观察的时间关联，并说明不代表因果；否则明确写“现有记录无法分析两者关联”，指出缺少哪类同期证据。不得从一次饮食描述推断整月膳食结构发生变化。
风险栏目只列已记录的异常信号、待核实事项或资料限制，不把正常变动和缺少记录写成健康风险。下一步仅提出与已确认管理方案及真实资料相符的待人工核对事项、责任角色和复评时间，不自行增加打卡频次或改动方案。`;

module.exports = { PHASE_ASSESSMENT_EVIDENCE_RULES };
