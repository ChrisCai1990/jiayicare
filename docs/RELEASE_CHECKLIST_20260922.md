# 闭环版本发布检查清单

## 验证结果

- App与金伊森App Expo web导出、小程序Taro构建通过；员工端1904模块、管理端120模块构建通过（大包警告保留）。小程序仅构建，未上传/提审。
- 独立依赖最终候选后端1184项：1171通过、11失败、2跳过；生产master基线604项：591通过、11失败、2跳过。去除耗时后失败名称完全一致，无新增失败；不能称全绿，也不将基线失败自动判为无影响。
- 新增两个启动控制用例通过。体检组件属性顺序及后续任务迁至工具文件导致的两项旧字符串定位测试已更新，保持原断言内容；19项相关测试全过。客户端服务展示2项通过。
- 11项既有失败分布在aiCaseReviewRouteGate、checkupAdminClosureConfig、homePageTaskOrder、inpatientPlanPermission、medicalAssistTaskVisibility；不在此次范围扩修。最终是否接受这些基线遗留项随生产发布审批明确。
- 本次不冒充重新跑过最终候选的完整多岗页面/真实AI闭环；之前隔离证据仍见FINAL_ACCEPTANCE_HANDOFF.md。此次范围是发布整合、构建及回归审核。

## 生产只读核查

2026-09-22 07:38 UTC，服务器与GitHub master均43781626f448f90ff27e5151717f8da03d0d3b7a。GitHub使用单次http.sslBackend=openssl查询成功，未改全局配置或推送。

scripts/audit_release_indexes.py使用本地模型生成精确唯一索引规格，服务器仅原生Mongo listIndexes/count/aggregate，不加载生产模型。21项全部duplicateGroups=0；已有5项，缺少16项，缺项的eligibleDocuments均0。数组键在同一文档内先去重，稀疏索引保留显式null参与冲突检查，partial按模型过滤。此为时间点结果，执行前必须重查。

新增清单（只有add，不drop/syncIndexes，不清洗客户资料）：

| 集合 | 唯一键 | 条件 |
|---|---|---|
| annualplanpreparations | patientId,year | 普通 |
| annualserviceperiods | annualPlanId | 普通 |
| annualserviceperiods | sourceOrderId | type=objectId |
| annualserviceperiods | evidenceOrderIds | sparse |
| annualserviceperiods | patientId,contractReference,startDate | sourceType=offline_contract |
| checkuppreparationhandoffs | servicePlanId | 普通 |
| followups | assessmentActionKey | sparse |
| followups | annualDispatchKey | sparse |
| followupservicelinks | requestTaskId | 普通 |
| followupservicelinks | followUpId | 普通 |
| medications | annualDispatchKey | sparse |
| professionalhealthassessments | sourceFeedbackKey | sparse |
| recurringsupplyplans | annualDispatchKey | sparse |
| reportfollowupdrafts | sourceKey | 普通 |
| supplements | annualDispatchKey | sparse |
| tasks | annualDispatchKey | sparse |

CheckupPreparationSuggestion以方案ID作为_id，内置唯一索引即可。已有年度方案、阶段评估、报告摘要、营养素订单、补给订单5项唯一索引也已核对。非唯一性能索引可按模型另列后续优化，不作为本次防重前提；本清单不授权生产索引写入。

## 启动与启用

- 发布前审核并设置STARTUP_SCHEMA_WRITES_ENABLED=false，禁止Mongoose自动创建/删除/同步索引。
- 保持STARTUP_BACKGROUND_JOBS_ENABLED开启或未设置，保留原OCR恢复、提醒、用药生命周期等。
- 新增HEALTH_MANAGEMENT_RECOVERY_ENABLED=false：只暂停新增报告/评估草稿启动恢复、准备承接/结案恢复、续约任务恢复及自动双岗派发。旧年度窗口与原提醒继续运行。默认不设仍保留隔离验收行为；生产首次发布必须显式设置false。
- CHECKUP_PREPARATION_AUTO_ENABLED=false、ENABLE_PHASE_ASSESSMENT_SCHEDULER=false继续保持。独立恢复开关不是API只读开关，人工请求仍能写数据/调用AI；索引完成前须处于维护窗口，不进行新功能操作。
- 索引验证、版本及岗位冒烟完成后，另行批准开启恢复开关并重启；评估/双岗自动派发是否开启分别决定，不随代码默认开启。
- 新集合/新键当前无积压，不能保证发布时仍为零；启用前再核查。原有年度扫描仍按原职责运行，不声称整个服务启动零写入。

## 候选与回退

独立目录health-management-release-audit，以功能8664fd90合入生产master43781626形成本地候选；未切换生产目录分支。5处冲突分别保留双端历史、两种报告API、原异常数据校验+生产元数据校验、生产历史积分promotion兼容。其余生产报告归类/审核质量补丁自动合并后回归。

只允许将本候选及后续明确审核的提交发布，不能再直接部署旧8664fd90，否则可能回退生产补丁。依赖锁文件不变，独立npm ci --ignore-scripts安装构建依赖，未改运行中隔离环境依赖。

发布执行须再次确认：远端未前进→备份可恢复并记录→维护窗口→按上表精确createIndex并复查→配置上述开关→标准脚本--skip-data-migrations发布同一干净master→健康/岗位/旧服务冒烟→退出维护。索引创建失败即停，不继续启动新业务。无生产部署授权前不得执行。

回退以旧代码43781626为基线，新增集合/兼容性新增索引保留，不直接恢复旧数据库覆盖新业务，不删除报告/任务。已经产生新版任务时先暂停新恢复、人工核对，再决定回退；旧代码不会自动承接全部新版数据。
