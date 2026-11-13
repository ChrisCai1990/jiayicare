// Shared instructions for new drafts and revisions. Sparse self-recording is normal
// in ongoing health management; missing daily entries are not failed adherence.
const PHASE_ASSESSMENT_EVIDENCE_RULES = `只描述有来源的记录、日期、数值和已确认的生活方式习惯，不给客户或执行情况打分、贴“改善/恶化/升级/依从性差”等结论标签。已有生活方式档案可作为日常习惯的自述背景；没有明确变更记录时，不得因某几天未打卡就推断习惯中断，也不得把档案习惯伪装成每天都有记录。
健康数据只在同一指标、有可比较的多次记录时描述观察到的变化及记录范围；少量、不等间隔或测量条件不明的记录，只逐项陈述，不称“趋势”“明显波动”“持续改善”。记录日期少不等于没有执行、没有饮食或监测不合格；不要要求客户每天或每餐记录。
若资料快照的comparableChanges.weight提供首末体重及差值，阶段变化须写出日期、数值和升降幅度，注明只是记录值变化；健康记录总数、覆盖天数和类型仅作证据范围，不能代替体重等指标的阶段变化。没有可比体重记录时明确写无法判断体重变化，不使用档案中的单一当前体重推断下降。
生活方式与指标必须有相近时间的两类记录，且存在可比较的变化，才能描述可观察的时间关联，并说明不代表因果；否则明确写“现有记录无法分析两者关联”，指出缺少哪类同期证据。不得从一次饮食描述推断整月膳食结构发生变化。
营养相关问题交已分配营养师结合现有饮食记录和日常习惯核对；若需要进一步访谈，说明需确认的具体问题，不把AI推测当作营养师结论。健康顾问在营养师核对后综合确认下一步事项、责任角色和复评时间。`;

module.exports = { PHASE_ASSESSMENT_EVIDENCE_RULES: PHASE_ASSESSMENT_EVIDENCE_RULES+'\n最新四板块口径（优先于旧模板要求）：\n'+require('./reviewFourSections').rules };
