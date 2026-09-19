# 专业健康评估动态随访：当前实施边界

本功能属于健康管理闭环分阶段开发，详见 `HEALTH_MANAGEMENT_CLOSED_LOOP_BLUEPRINT_2026-09.md`。本文件记录当前代码能力，不代表已经部署生产或完成全部闭环。

## 已实现

- 后续专项协作评估进入健康顾问待审时，持久化排队并自动生成 AI 随访草稿；首次年度输入仅用于年度方案，不自动另派动态随访。年度输入和专项协作均可在评估列表查看，并标明用途。
- 健康顾问可核对完整内容，修改标题、日期、类型、内容、是否需要服务，或移除草稿。非法日期和不完整草稿会报错，不静默删除。
- 终审以版本号原子保存审核快照；生成草稿过程中若评估被修改或审核，返回冲突。已终审草稿不能再次改写。
- 正式随访分配给客户健管专员；仅在明确需要服务时另建健康规划师服务需求任务，使用同一事项关联键。就医专员不提前分配。
- 新动态任务使用 `assessmentActionKey` 的稀疏唯一索引，逐条幂等写入。发布中途失败可以重试，只补缺项，不覆盖已完成任务。
- 缺少必要负责人时不写入任务，保存失败提示；审核任务保留，页面提供重试入口。发布和审核任务关闭成功后标记发布完成。
- 工作台的专业反馈任务进入转介，健康顾问终审任务进入评估页面，服务需求进入随访任务详情。
- 生成和审核接口均校验岗位和客户访问范围；全年动态随访不调用年度方案重建。
- 自动生成、版本留痕、失败人工接管、工作台恢复与上线验证详见 `ASSESSMENT_FOLLOWUP_AUTOMATION.md`。

## 仍需后续实施与验收

- 会诊反馈/专项评估已接入自动草稿队列；独立病历和报告的审核保存入口亦已接入，独立模型、排除范围及验收见 `REPORT_FOLLOWUP_AUTOMATION.md`。存量未标记记录不批量补跑 AI。
- 服务关联与状态回写已新增实现，见 `FOLLOWUP_SERVICE_LINK.md`；仍需真实数据库和各岗位端到端验收。
- 去重覆盖同一反馈版本和评估快照；来源修订保留新旧版本，但不会自动撤销历史任务。不同报告/不同转介中语义相同建议的合并仍需顾问核对。
- 当前评估入口复用年度管理页面，后续可独立为健康评估入口。
- 尚需测试环境真实数据库及分岗位端到端验收；本地单元测试使用模型替身，不能替代真实 MongoDB 并发与唯一索引验收。

## 上线前核验

确认 `FollowUp` 集合已建立 `assessmentActionKey` 稀疏唯一索引，`ProfessionalHealthAssessment` 已建立 `sourceFeedbackKey` 稀疏唯一索引和自动化状态索引。旧任务不批量迁移。新机制未挂接既有就医代办、用药代办、体检一站式等专用流程的自动事件；通用事件接入时必须继续检查 `dynamicFollowUpEligibility`。

本地回归命令（仓库根目录）：

```powershell
node --test backend/test/dynamicAssessmentFollowUps.test.js backend/test/dynamicFollowUpEligibility.test.js backend/test/annualPlanPreparation.test.js backend/test/annualPlanPreparationTasks.test.js backend/test/checkupSerialWorkflow.test.js backend/test/referralDiseaseLink.test.js backend/test/annualPlanGeneration.test.js backend/test/annualPlanTaskSplit.test.js backend/test/annualPlanServiceTasks.test.js
```

医护端构建：`npm run build:staff`。
