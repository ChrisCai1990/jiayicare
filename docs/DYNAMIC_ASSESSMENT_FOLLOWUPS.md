# 专业健康评估动态随访：当前实施边界

本功能属于健康管理闭环分阶段开发，详见 `HEALTH_MANAGEMENT_CLOSED_LOOP_BLUEPRINT_2026-09.md`。本文件记录当前代码能力，不代表已经部署生产或完成全部闭环。

## 已实现

- 专业健康评估在待健康顾问终审时，可生成 AI 随访草稿；年度输入和专项协作均可在评估列表查看，并标明用途。
- 健康顾问可核对完整内容，修改标题、日期、类型、内容、是否需要服务，或移除草稿。非法日期和不完整草稿会报错，不静默删除。
- 终审以版本号原子保存审核快照；生成草稿过程中若评估被修改或审核，返回冲突。已终审草稿不能再次改写。
- 正式随访分配给客户健管专员；仅在明确需要服务时另建健康规划师服务需求任务，使用同一事项关联键。就医专员不提前分配。
- 新动态任务使用 `assessmentActionKey` 的稀疏唯一索引，逐条幂等写入。发布中途失败可以重试，只补缺项，不覆盖已完成任务。
- 缺少必要负责人时不写入任务，保存失败提示；审核任务保留，页面提供重试入口。发布和审核任务关闭成功后标记发布完成。
- 工作台的专业反馈任务进入转介，健康顾问终审任务进入评估页面，服务需求进入随访任务详情。
- 生成和审核接口均校验岗位和客户访问范围；全年动态随访不调用年度方案重建。

## 仍需后续实施与验收

- 当前 AI 草稿由按钮触发；尚未接通所有会诊、病历、报告事件的自动生成和自动重试队列。
- 健康规划师目前收到服务需求。需求与实际订单/一站式服务的选择关联、完成/取消/失败对原随访的自动回写，仍属下一阶段。
- 去重当前覆盖同一评估快照的重复发布；跨报告、跨评估相同建议的合并及来源修订仍需实现。
- 当前评估入口复用年度管理页面，后续可独立为健康评估入口。
- 尚需测试环境真实数据库及分岗位端到端验收；本地单元测试使用模型替身，不能替代真实 MongoDB 并发与唯一索引验收。

## 上线前核验

确认 `FollowUp` 集合已建立 `assessmentActionKey` 稀疏唯一索引。旧任务不写入该字段，也不批量迁移。新机制未挂接既有就医代办、用药代办、体检一站式等专用流程的自动事件；通用事件接入时必须继续检查 `dynamicFollowUpEligibility`。

本地回归命令（仓库根目录）：

```powershell
node --test backend/test/dynamicAssessmentFollowUps.test.js backend/test/dynamicFollowUpEligibility.test.js backend/test/annualPlanPreparation.test.js backend/test/annualPlanPreparationTasks.test.js backend/test/checkupSerialWorkflow.test.js backend/test/referralDiseaseLink.test.js backend/test/annualPlanGeneration.test.js backend/test/annualPlanTaskSplit.test.js backend/test/annualPlanServiceTasks.test.js
```

医护端构建：`npm run build:staff`。
