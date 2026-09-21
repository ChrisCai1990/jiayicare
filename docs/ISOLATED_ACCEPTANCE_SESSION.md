# 可登录隔离环境：验收接续

> 2026-09-21持续随访第二部分：结构化检查/复查/就医计划拦截提前完成，服务履约与原计划分离；新增顾问结果处置（审核报告+已发布后续任务，或明确无需继续）。76项回归通过，隔离HTTP双路径、顾问真实页面通过；不是完整自动闭环。自动关联/合并审核、历史等待入口及源版本竞争仍待，详见docs/FOLLOWUP_CONTINUITY.md。未部署/推送，自动任务暂停。

> 2026-09-21用户新增持续随访标准：同事项多次过程，结果审核/后续计划落地后才结束。本次仅完成第一部分：普通随访默认进行中、追加过程/下次时间、CAS/幂等权限，29项回归、实际HTTP和三次页面过程通过，1898模块构建通过。自动关闭门槛尚未改、原手动结束仍保留，需求未全部实现；必须继续docs/FOLLOWUP_CONTINUITY.md，不把旧核销验收当新标准通过。隔离后端97355，未部署/推送。

## 09-21 核销补验接续（最新）

- 新清单C:/Users/huawei/AppData/Local/Temp/jiayicare-round-two-gu4B4J/session.json；四个HTTP脚本全过，详见ROUND_TWO_CASE_EVIDENCE.md最新节。双次模拟订单并发仅核销1次、余1次；原健管随访自动完成，实际页面余额/任务对应通过。仅fixture支付状态，无真实付款。
- 首次2qaGuZ遗漏初始订单受理记录，证据保留；测试发布前补调用已有客户限定reconcile方法，再用全新gu4B4J复跑，不覆盖旧完成记录。
- 后端79103未重启，无业务代码变化。浏览器1/tab3为规划师、新gu4B4J客户消费记录页，已markHandoff。自动任务保持暂停；下一步只补年度首次评估生成审核入口，不扩范围。

## 09-21 第2轮同案例页面与API

- 新roundTwoCaseAudit.js <manifest> --verify-complete通过：七服务任务完成/岗位正确，原健管完成时间不变，四岗无本次服务待办；顾问/健管准备项目待办1→0。没有重跑旧脚本以覆盖历史结论。
- 发现原案例准备项目缺独立报告，真实上传创建6ab0d2a24056a2ff98b5c077（纯模拟无文件），由健管在真实浏览器点击“审核通过”，页面/API确认；不算OCR或真实AI。
- Computer Use四岗位实际登录；规划师查看服务详情显示完整七环节与原结论，就医专员无待办并可见完成服务，顾问/健管首页体检卡消退。规划师年度统筹独立待办保留，没有抹成全部任务为零。
- 浏览器1/tab3最后为familyDoctor、同客户followups页，已markHandoff；后端79103未变。切岗可直接本地/login，退出登录确认弹窗曾使Playwright超时，不重复盲点。
- docs/ROUND_TWO_CASE_EVIDENCE.md列出完整证据与边界。首次评估→年度生成、收费核销的隔离真实入口仍待；真实AI/生产支付禁止，不得拿旧已审核fixture代替。下一步只补这些已定范围，不回头扩展恢复功能。未部署/推送。

## 09-21 第1轮收尾，接第2轮

- 隔离后端exec79103，原fvvTxL数据库，保持外部出口拦截和后台扫描禁用；前端未变。测试显式调用生产scan函数，不是等待24小时运行。自动任务仍暂停，无生产变更/推送。
- legacyReportReview新占用标记recoveryVersion1/kind；恢复不先释放源锁，而是稳定ID只插入不覆盖两个目标，确认后同时完成占用/持久意图。无版本/旧无保护目标不恢复。
- AbnormalReview新派生记录标记auditDispatchVersion1；删除API在源running时409，完成后保留隐藏删除凭据；查询/计数隐藏，物理删除保护避免迟到upsert复活。人工创建复查仍沿用原删除。客户Task不重开、不覆盖人工结论；本次不扩展取消联动规则。
- legacyDispatchRecovery.js真实exit33三位置及延迟活worker、恢复写后回执故障再重试通过。真实HTTP删除占用409/恢复后200，普通人工复查删除回归通过。最新证据报告6ab0d1062e5a7e2e9202fd87、6ab0d1072e5a7e2e9202fda8、6ab0d1082e5a7e2e9202fdc9、6ab0d1092e5a7e2e9202fdea、6ab0d1092e5a7e2e9202fe08。
- reportAuditSideEffects/auditedPlanItemHttp/proxyPlannerDispatch/legacyReviewStaleSource/conditionalClaimRecovery及新恢复脚本通过，另reportDispatchScan通过；16项相关单测通过。旧脚本日志的“automatic recovery NOT implemented”指该脚本未覆盖自动恢复，不是当前全局状态。
- 下一步第2轮同一完整案例岗位API/页面验收；不要重复展开第一轮功能。历史无版本占用保留核查，不迁移。真实AI/收费核销仍未验，不把模拟输入与本地API成功说成生产成功。

## 09-21 手动推进：扫描接续已接入并重载

- 后端exec13519替代旧进程，仍fvvTxL/session.json、127.0.0.1:3000及同一虚构数据库；启动器凭证清空/外部出口拦截/后台任务关闭均保留。浏览器旧JWT失效需重新登录。
- reportConditionalDrafts从路由原样抽出；reportDispatchQueue供审核与既有每日扫描共用，completed不重复消费，仅有明确持久意图的新条件占用可安全恢复。无意图历史报告、来源不符、撤销、无版本旧占用不派单；旧Task/Review running不强清。
- reportDispatchScan.js <manifest>真实子进程exit32（目标写前/后）、双扫描、鲜活锁不接管、人工not_needed保留、完成重扫无变更，以及未执行旧复查意图唯一派单通过。报告证据：6ab0ced75ae0621896557e71、6ab0ced85ae0621896557e9a、6ab0ced85ae0621896557eb8；另外三项拒绝证据保留。实际调用生产扫描函数，使用虚构输入和测试时钟，不是等待24小时或真实AI验收。
- 重载后reportAuditSideEffects、auditedPlanItemHttp、proxyPlannerDispatch三份实际HTTP脚本通过；代诊订单为隔离合成6ab0cf37cd968649bd7b6d4c。reportPlanItemQueue/reportWriteConflict/reportAuditGate共7项通过。前端未修改未重构建。
- 尚余旧复查Task/Review中断安全恢复（含删除后迟到插入风险）、同案例全岗位验收，不能宣称第1轮/完整闭环完成。未部署/推送；用户已暂停自动任务，后续手动继续。

## 09-21 14:05 第1轮条件中断恢复屏障

- conditionalReportClaim领取递增既有planItemWriteEpoch并记录fenceVersion1，写目标前逐个推进既有reportItemWriteFences；conditionalDraftWrite接收claim并核对epoch，路由与测试预加载器传递claim。共享epoch受原两队列互斥保护。
- recoverConditionalClaim只接管明确pending意图、kind conditional_drafts、fenceVersion1、有非空目标列表的新占用；原token/epoch CAS领取，再推进所有目标屏障，最后写interrupted解锁，意图仍pending。失败保持占用，旧无版本/无意图不接管。尚无每日扫描调用。
- conditionalClaimRecovery真实Mongo验证双恢复者仅一成功、旧执行者写拒绝、新占用可写，原来源四项回归通过。新增真实无生产凭证子进程在目标写前/写后exit31，恢复成功且既有草稿不改；报告6ab0c86c68cb5872ded2cde7、6ab0c86d68cb5872ded2cdf5。不是完整自动恢复闭环。
- 本轮未重载后端（仍exec98143），下一轮重载并回归，继续既定第1轮安全恢复，不扩展功能。旧Task/Review恢复和扫描仍待；第2轮未开始。本地提交，未部署/推送，未修改生产。

## 09-21 13:05 三轮范围收敛；第1轮条件来源保护

- 以docs/THREE_ROUND_ACCEPTANCE.md为当前范围，自动任务automation保持原频率但更新三轮/排除营养运动中医，不扩张功能。
- conditionalReportClaim复用来源legacyReviewWrite写/删互斥，按原已审核/患者/关联/updatedAt领取，记录kind和目标方案IDs。仅存在条件模块才领取；正常完成释放，明确目标CAS未命中释放，未知错误不解锁。无超时抢占，自动安全恢复未实现。
- conditionalReportClaim.js真实Mongo四场景通过：撤销在前不执行回调；运行中撤销/删除/双领取拒绝；CAS冲突释放；未知错误锁定。报告6ab0ba1cd2c2109e18118b74/78/81/86。合成错误不是硬退出恢复证明。
- 隔离后端重载至exec98143/fvvTxL，清凭证/阻断外部出口不变；reportAuditSideEffects实际HTTP回归全部通过，条件三态无旧Task/Review。本轮无页面改动。
- 待续：第1轮剩余安全恢复及扩大队列竞争验证；完成后进入同案例多岗完整回归，不重新扩展营养/运动/中医。不部署生产、不推送被拒绝的功能分支。

## 09-21 12:20 条件草稿竞争真实HTTP验收

- 新conditionalConflictPreload.js仅明确RUN_ISOLATED_ACCEPTANCE及随机隔离manifest允许载入；实际调用再校验回环Mongo URI、数据库名、唯一合成客户名/方案名。无业务测试开关或生产导入。
- 通过node -r预加载至既有隔离启动器，仍清除生产凭证并阻断外部出口。在目标CAS前写入人工not_needed及备注，继续调用原始writer；没有伪造模型返回/HTTP响应。
- conditionalConflictHttp.js实际登录及审核API：第一次409/CONDITIONAL_DRAFT_CONFLICT，审核已保存且意图pending；显式第二次200/意图completed，人工决定与备注保持，旧Task/Review均0。报告6ab0b09021bb374e51ae2a84，方案6ab0b09021bb374e51ae2a80。输入合成、确定性时序，不是自然双请求竞速或自动恢复。
- 验收后确认停止唯一钩子后端，恢复正常无预加载隔离后端exec25665，数据库/manifest仍fvvTxL；reportAuditSideEffects回归通过。JWT已更新，浏览器需重新登录。
- 本轮仅新增隔离测试和证据，本地提交。来源报告撤销保护、自动安全恢复和完整全岗位闭环仍待；未操作生产、未绕过功能分支推送审批。

## 09-21 11:50 待恢复提醒真实浏览器验收

- 使用computer-use实际IAB tab3，隔离健管登录localhost:5174，从本人工作台“报告复查派单待恢复”打开报告详情；非直接深链替代入口测试。
- seedPendingDispatchPage.js仅随机隔离库/虚构主客户校验后，创建独立虚构客户6ab0a8b966a9bc4b458ad504、报告6ab0a8b966a9bc4b458ad506；真实armLegacyDispatchIntent保存，六分钟年龄为人工fixture，不是真实进程退出或自动恢复证据。
- 页面显示审核输入保存但不能认定后续任务完成，不要重复上传/审核/手工建任务，并明确不是新客户任务、不是已自动恢复。弹窗仅关闭，无强清/重复派单操作；刷新后status提示与关闭按钮仍在。
- IAB保留该报告页供后续核验，未修改报告/状态。工作台其他合成提醒未清除；未声称72条总数代表真实业务负担。
- 后端仍exec44023，上一轮末次条件冲突响应catch尚待重载和实际HTTP故障触发；来源保护、安全恢复、其他岗位链路仍未完成。本轮只测试fixture和证据，无生产操作、无外部消息/支付/AI。

## 09-21 11:15 条件目标保护接口回归及双写

- 核实唯一startIsolatedAcceptance进程后重载，同fvvTxL/3000，新exec44023；启动确认清除继承凭证、禁止dotenv、外部HTTP/AI/子进程出口，Mongo仅27134，自动索引/后台关闭。
- reportAuditSideEffects、auditedPlanItemHttp真实HTTP全通过；needed/not_needed/pending均无旧任务，pending正常写草稿。复查并发200/409且唯一Task/Review。脚本后rg无匹配使组合命令最终exit1，但两脚本均已通过，非测试失败。
- conditionalDraftWrite新增双执行者同快照实际并发，一成功一CONDITIONAL_DRAFT_CONFLICT；ObjectId/Date保留。五场景通过，最新双写方案6ab0a0f155e69b9752e2790a。
- 发现通用错误处理固定500，路由新增只捕获CONDITIONAL_DRAFT_CONFLICT返回409及code，其他错误仍抛出；此最后响应分支尚未重载或实际HTTP冲突触发，不宣称接口冲突验收完成。
- 来源报告撤销竞争、自动安全恢复、全岗位页面仍待。本轮不部署、不改生产/真实订单，不重复申请已被拒绝的功能分支推送；生产专项授权不扩展到功能分支。

## 09-21 10:45 代诊补丁后回归与条件草稿目标保护

- 隔离分支干净起步，代诊专项已单独生产发布f9fb958b，本心跳未操作生产；功能分支包含同补丁。隔离后端为exec3411/fvvTxL，前端5174。
- auditedPlanItemHttp、reportAuditSideEffects、legacyDispatchHardExit实际HTTP及真实硬退出重跑通过；最新硬退出报告6ab098d36c2a9799b584ac6c。合成输入，不是真实AI/全履约验收。
- 新conditionalDraftWrite通过原始content/患者/status精确匹配，仅写content.workflowModuleDecisions，冲突409；路由不再保存整个旧content。plan.toObject()保存BSON类型，避免JSON/structuredClone破坏ObjectId。
- conditionalDraftWrite.js四场景真实Mongo通过：人工needed、not_needed、其他内容变化均拒绝，正常草稿可写；方案6ab0991819e1308d0cecb7bb/c6/d1/dc。
- 新代码未重载长驻后端，下一轮先重载后做报告API回归。当前仅目标方案防覆盖，不是来源报告占用保护，也不是安全恢复；两者仍待。未改真实订单/外部出口，无生产部署。
- 本轮本地提交；此前功能分支外发审批拒绝仍有效，生产专项授权不外推为整个功能分支的推送许可，不绕过重试。

## 09-21 09:30 审核保存后真实进程退出与显式重试

- 新legacyDispatchHardExit.js <session.json>校验回环随机隔离库/虚构主客户，独立合成报告由无外部凭证子进程通过实际armLegacyDispatchIntent和report.save保存后立即process.exit(29)。不是把状态直接设pending冒充进程退出。
- 父进程确认实际退出码29，原报告audited+pending意图完整，Task/Review均0。随后实际本地HTTP审核重试两次，故意传空异常项/不同理由，仍沿用首次token、原异常输入/理由和首次人员，只生成一Task一Review，响应completed。
- 本轮报告6ab088715bd18a4533237f32；合成数据及子进程退出现场保留。此结果仅说明首次输入不会丢失且显式接口重试可继续，不是自动恢复，不覆盖领取running后硬退出，更不是真实AI/临床履约。
- 本轮无业务代码/前端变化，不重启或重复构建；隔离继续exec71834/fvvTxL。本地提交测试和双端记录，具体GitHub外发授权仍待，不重试push。生产及外部消息/AI/支付未访问。
- 剩余重点未变：从路由抽离安全处理器后接pending扫描、条件方案并发写保护、running目标版本屏障及安全恢复；未经这些验证不放开自动接管或交付完整闭环。

## 09-21 06:00 未执行派单意图工作台与最新响应

- ai-todos纳入显式legacyDispatchIntent.pending且创建超过5分钟，仍按本人客户/健管权限、稳定原报告ID投影唯一提示“报告复查派单待恢复”。running优先显示占用；不建新Task，不用提醒充当恢复。已撤销报告不再提示派单。
- ReportPlanConflictCard在无独立项目冲突且未running时展示只读pending说明，明确输入已保存但后续任务未确认、不是新客户任务、不表示自动恢复；已有项目conflict仍保留原核对操作，不以pending卡片遮住。只有渲染验证，实际浏览器待验。
- 旧audit响应改读最新报告，正常HTTP响应legacyDispatchIntent已completed，而非保存时的pending旧对象。reportAuditSideEffects验证正常响应、首次CAS与合成陈旧pending唯一工作台提示、撤销后提示消退；原auditedPlanItemHttp全通过，19项回归通过，员工端本地API构建1897模块通过，既有大包警告保留。
- 核对停止隔离PID15644，新exec71834，同fvvTxL/JWT刷新；无生产操作/推送重试。本轮本地提交，GitHub外发授权仍待。当前提醒建议管理员核查，尚无安全自动恢复入口，不是闭环交付。
- 下一步优先将处理器抽离路由并证明pending安全消费，覆盖真正进程退出；running不能直接超时接管。条件草稿并发保护和无显式异常项路径仍需补齐。

## 09-21 05:25 首次异常审核输入与审核同文档持久化

- 新legacyDispatchIntent仅旧audit入口approve且显式abnormalItems非空时建立；保存首次人员、完整派单输入、客户/方案引用及token/pending。首次save附加legacyDispatchIntent:null条件，两个已加载请求不能覆盖首份意图；普通模型占用保护仍生效。历史报告不回填，无异常项和常用AI结果审核入口不在本轮范围。
- 保存后消费意图中的原输入/人员，来源引用不符返回409不自动改派。现有条件模块分流或旧复查完成后按token/pending回执completed，区分conditional_workflow/legacy_review。未启用后台自动消费；这不是安全接管机制。原接口响应仍使用原report对象，最终意图状态以重新读取数据库为准，后续需统一响应。
- reportAuditSideEffects实际API验证无效项无意图、正常/重复/并发和条件三态完成回执；独立真实Mongo两个loaded文档竞争save，一个成功一个DocumentNotFound，原审核及pending输入同时保留且无子记录。这是刻意保存后不执行，不是实际杀进程测试。13项回归、原auditedPlanItemHttp及来源撤销/双队列互斥通过。
- 隔离PID2532核对停止，新exec79767，同fvvTxL/JWT刷新；无前端或生产操作。本轮仅本地提交，GitHub外发仍待明确授权。
- 必需接续：未执行pending的工作台可见性/真实进程退出恢复验证；将可恢复处理器从路由抽出后接每日扫描，但必须先解决条件草稿来源保护及running目标屏障，不能直接超时清锁。已审核无显式异常输入时的条件动作仍无同文档意图，全链仍未通过。

## 09-21 04:50 双队列交错互斥通过

- 扩展legacyReviewStaleSource，在旧复查Review写边界插入真实项目reconcile，确认项目意图及项目仍pending；旧复查正常完成后再调用项目队列，双方完成。report 6ab0460aad61483fdfd8321c。
- 反向在项目回写占用的目标边界调用旧复查，返回409且无Review/Task；项目完成后以最新报告再调用，双方完成且只有一对复查记录。report 6ab0460aad61483fdfd8323c。
- 原两项来源撤销保护一并通过。使用真实Mongo和实际处理器、确定性插入调用；第二次调用由测试显式执行，不是后台扫描或异常恢复。未验证条件草稿跨文档保护，未消除审核保存后漏派窗口。
- 本轮无业务代码变更、无重启/构建/生产访问，仅测试及记录本地提交。推送仍被具体GitHub外发授权阻挡，不重试。环境仍exec46238/fvvTxL，下一步保持持久意图和目标安全恢复优先。

## 09-21 04:15 派单占用实际页面核验通过

- computer-use实际浏览器登录本地合成健管（无生产账号）；工作台68条测试提醒中，点击“隔离复查中断”的复查派单占用提醒，自动定位原报告并打开详情弹窗。
- 页面明确显示“报告复查派单处理中”“结果尚未全部确认”“不代表复查任务已全部生成”，此弹窗仅关闭，无强清/重新提交/关联核对表单。刷新后重新加载同报告，保护提示仍在。无需修改报告、清锁或删除测试任务。
- 实际合成来源：patient 6ab02ee6c57aec06efda7b47 / report 6ab02ee6c57aec06efda7b49，属于上一轮注入Task失败留下的现场，不是本轮临时改状态的fixture。其他陈旧合成占用也保留，工作台未伪清零。
- 操作步骤：本地5174健管登录→工作台“报告复查派单占用待检查”→对应报告详情→阅读原因；当前仅可核查，不应反复审核或强制解锁。仍无安全自动恢复/管理员恢复入口，因此不能交付整体闭环验收。
- tab3保留此详情URL待接续；后端仍exec46238/fvvTxL，未重启，无代码改动所以不重复构建/回归。仅更新证据及双端记忆，本地提交；GitHub外发审批仍待用户，不重试推送。

## 09-21 03:45 派单占用提示补齐；远程同步待审批

- ReportPlanConflictCard优先显示legacyReviewWrite.running只读状态，即使无planItemSync也展示；避免原conflict仍出现可提交核对按钮。明确结果未全部确认、不能超时强清，不称任务已全部生成。只是卡片提示，外围所有编辑控件禁用尚未逐项覆盖，后端保护仍为实际边界。
- 新渲染测试覆盖无项目元数据/项目冲突/双占用与完成后不显示；16项回归通过，员工端指向127.0.0.1:3000/api构建通过（1897模块，既有大包警告）。实际浏览器状态尚未验收，不把静态渲染称多岗位页面实测。
- 上轮dc783df7提交成功，但push被auto-review明确拒绝：具体GitHub外发目的地需用户授权。已向用户询问是否允许ChrisCai1990/jiayicare既有功能分支，当前心跳不是该问题的明确答复。本轮不重试、不换命令绕过；继续本地修改/提交，远程最后成功62ba49c1。
- 隔离后端仍exec46238/fvvTxL，无重启/生产操作。本轮未改业务机制；下一轮优先安全恢复目标屏障和审核原子意图，自动补偿、条件来源保护以及实际页面仍未闭合。

## 09-21 03:15 旧复查来源持久占用保护（恢复未实现）

- MedicalReport.legacyReviewWrite记录运行token、时间、人员与输入；ensureLegacyReportReview在子记录写前按当前已审核/同客户/updatedAt原子领取。reportWriteFence普通save、查询更新和删除同时排除此占用与planItemSync.running，两执行者互斥；完成只凭本token更新回执并解锁。
- 两项legacyReviewStaleSource通过：6ab02e89bc0d123d8ea3bdc5、...bdd4撤销尝试modifiedCount=0，来源仍audited，创建任务有效。不是撤销成功后补救取消。历史失败证据保留。
- 失败不释放：网络错误可能仍有迟到目标写，安全屏障未完成前不允许超时/重复调用抢占。Task失败留下Review和running，来源修改/删除及再次派单均拒绝；原“半成功重复调用能恢复”的结论被此更严格保护取代，不能继续宣称自动恢复已实现。
- reportAuditSideEffects：重复200/200唯一对，重叠并发409/200唯一对；独立正常来源已完成Task重试不重开；条件三态仍不误派。合成陈旧running记录通过本人ai-todos呈现“报告复查派单占用待检查”，审核API409；5分钟只用于显示，不用于接管。页面未验。
- 原auditedPlanItemHttp、reportPlanItemStaleWorker（含硬退出及恢复失败）通过，11项回归通过。隔离PID19076核对停止，新exec46238，同fvvTxL，JWT刷新，前端未改。无生产操作。
- 下一步：安全目标版本屏障/接管与自动恢复，审核保存和待办意图同文档原子化。当前save后领取前仍有漏派窗口；条件草稿在此锁前仍缺并发来源保护。历史冲突在领取后会保持running待核查，需在安全终态设计中处理；不开放人工强清锁，不部署。

## 09-21 02:35 撤销来源竞争两项失败，继续阻断上线

- 新legacyReviewStaleSource.js使用实际本地Mongo及现有helper，在Review.updateOne或Task.updateOne前确定性执行报告rejected。不是实际HTTP竞速，而是目标边界故障调度。撤销modifiedCount=1，旧审核快照仍创建Task/Review各1，两个安全断言失败，最终单独运行退出1。
- 最新报告证据：写Review前6ab026ab7816e68038bfd62b；写Task前6ab026ab7816e68038bfd638。首轮同样失败记录也保留。没有删除/取消任务掩盖问题，无真实客户。
- 防重、条件分流已有通过结果不覆盖此问题。新增REPORT_AUDIT_EFFECTS_RECOVERY_PLAN.md记录同文档意图、互斥占用、各目标epoch屏障、异常工作台和恢复验收顺序；这是待实施设计，不是代码完成或安全证明。
- 下一轮优先实现持久意图与原子领取，并明确新目标不存在时的屏障及旧执行者失效保证；未证明前不可超时解锁。单纯写前再读一次或固定子记录ID不足。
- 本轮只新增失败测试/设计/双端记录，不改业务、不重启；隔离仍exec71219/fvvTxL。未重复跑与此次无代码变化无关的构建。生产、外部AI、订单与通知未访问。

## 09-21 02:00 条件分流与责任人重试修复

- 真实HTTP先复现已not_needed条件仍旧派单：report 6ab01e642efa5e1abc52a1f7，Task/Review各1，测试退出1，证据保留。原因drafted=0既表示无模块也表示已有人工决定。
- draftConditionalModulesFromAuditedReport返回drafted和hasConditionalModules；旧派单仅无条件模块时可进入，关联方案查询同时限定patientId。needed/not_needed不重写决定，pending仍生成草稿而不建旧Task。现有唯一调用点同步调整。
- 新AbnormalReview.taskAssigneeSnapshot保存首次责任人展示名；补Task从此值取，不用重试人员。历史半成功若缺快照且无Task返回409，不猜测补派；已有Task不覆盖。本项仅冻结旧Task展示字段，不代表全部岗位ID归属机制已完成。
- reportAuditSideEffects全通过：not_needed report 6ab01ecb4fd5b5bed1daac2d、needed ...ac3a、pending ...ac47均无旧Task/Review，原决定保持；重复/并发/无效项/半成功重试仍通过，改重试人员名也保留首次责任人。原auditedPlanItemHttp及11项回归通过，非临床或真实AI验收。
- 核对停止隔离PID11952，新exec71219，同fvvTxL，加载本轮及上轮末次来源核对；JWT刷新，无前端/生产操作。前端旧会话需重登。
- 尚待优先项保持：审核同文档持久意图、自动恢复及异常工作台；保存后硬退出漏派、并发撤销/删除保护与条件方案并发写。仍不认为完整闭环通过，不请求生产授权。

## 09-21 01:30 旧异常审核防重局部修复，自动恢复尚缺

- 将条件草稿及旧复查创建移到report.save成功后，保存失败不执行这些后续写入。legacyReportReview以报告ID/类型散列固定Review和Task的24hex ID，依赖既有_id唯一约束做setOnInsert；并发重复键只在目标存在时再核对来源。不新增生产索引、不覆盖既有状态或内容。
- 先持久Review，再创建已包含abnormalReviewId的Task；重试读取首份Review内容，不用失败/迟到请求内容。不同ID的历史复查记录返回409待核对，不猜测迁移或删除。当前一个报告只创建一套旧审核复查，后续新随访应由明确的新管理事件处理。
- reportAuditSideEffects真实HTTP已转通过：无效项400零写、重复200/200一对记录、并发200/200一对记录。最新重复report 6ab016e0c4ea3215f7945f6d、并发6ab016e0c4ea3215f7945f74。另真实Mongo注入Task创建异常，Review保留且重试恢复唯一任务/首份内容；完成Task后重试不重开。原失败现场保留。
- 原auditedPlanItemHttp和11项回归通过；不代表所有异常窗口。隔离PID9996核对停止，新exec36659，同fvvTxL、JWT刷新。HTTP验证后补充了Task来源核对，最终helper通过直接Mongo重试测试，但长驻后端尚未加载此末次补充；下轮先重启再复验。
- 重要缺口：尚未把审核后的动作意图与审核同文档原子保存，保存后/Review创建前硬退出仍可能漏派；当前半成功需再次调用，不是自动恢复。Review保存后Task失败也没有新工作台提示/每日补偿。并发撤销审核/报告删除仍需持久版本保护。不得称已完成持久意图机制或完整闭环。
- 下一轮先设计持久意图及恢复/异常可见性；同时检查conditionalDrafts为0是否混淆“已有决定”与“无条件模块”，避免重新审核误落旧派单。归属/assignee在重试时仍由本次staff取值，需统一冻结来源。无生产/真实AI/订单通知。

## 09-21 00:55 旧异常审核副作用真实复现；一项修复、一项仍失败

- 新reportAuditSideEffects.js <session.json>仅回环隔离API/随机库，独立虚构客户。无效severity使原接口500、报告unaudited但Task=1/Review=0（report 6ab00e8fb3f86cbfdb45082c）；连续两次合法approve均200却Task=2/Review=2（report 6ab00e8fb3f86cbfdb450833）。真实HTTP证据，不是静态推断；现场保留。
- 最小修复：旧审核入口任何条件方案/任务变更前，用AbnormalReview模型validate异常列表、严重度、日期及相关字段；无效返回400/INVALID_ABNORMAL_REVIEW。不是创建子记录。复跑无效项report 6ab00ec6c413843210ba394f返回400且Task/Review均0、报告仍unaudited。
- 重复approve尚未修复：report 6ab00ec6c413843210ba3956仍双Task/双Review；脚本退出1，不能称全绿/上线通过。下一轮设计报告同文档持久意图+固定子记录ID/幂等恢复，覆盖保存失败、重复/并发和Task成功Review失败；简单先查询是否存在或移至save后均不足。
- 原auditedPlanItemHttp全部通过，11项专项回归通过。这些原场景abnormalItems为空，不能覆盖上述重复副作用。未做真实AI、消息、订单/核销或生产操作。
- 已核对停止隔离PID27136并启动exec31303，同fvvTxL，加载上一轮最终catch收窄和本轮校验。JWT刷新；前端未改。首次副作用脚本两失败，修后仍一失败，保留测试和证据，不删除重复记录冒充修复。

## 09-21 00:20 两个报告审核入口占用提示

- 员工PATCH medical-reports/:id与/:id/audit在已加载报告running时返回409/REPORT_WRITE_CONFLICT，提示刷新或持续占用联系管理员；模型原子保护仍保留。仅report.save的DocumentNotFoundError转409，其他错误不伪装冲突；找不到报告仍404。
- auditedPlanItemHttp在合成历史running现场分别调用两接口，均409且报告仍audited；整个上传/审核/双岗进度/更正并发/恢复API脚本通过。保存过程中才发生竞争的HTTP确定性时序尚未覆盖，不把初始占用测试外推。
- 11项回归通过。新增try/catch使旧静态相邻文本断言失败，改为限定路由、保存先于回写且catch必须return/throw的断言后通过；不是掩盖业务失败。
- 核对后停止原隔离PID15996，新启动器exec80674，同fvvTxL且出口围栏不变。API验证后进一步将公共路由catch收窄至save，磁盘最终版本单测通过，但该微调尚未重启加载；下一轮先重启复跑。前端未改、JWT已刷新，无生产访问。
- 尚待：单项编辑/删除/用户端/后台/AI回写入口审计与友好错误；旧audit在保存前调用draftConditionalModulesFromAuditedReport及Task/AbnormalReview创建，有并发保存失败留下副作用的风险。先做确定性复现及持久幂等后置机制设计，不仅搬到save后就声称故障闭合。当前无全量闭环/生产验收通过结论。

## 23:40 恢复本身失败时保护保留（隔离专项通过）

- 扩展reportPlanItemStaleWorker：真实子进程项目写前/写后硬退出，再分别注入恢复目标屏障写失败、屏障已推进后的报告解锁失败。两种异常均保持running、epoch递增；真实源修改及删除返回0，不提前放行。
- 旧恢复快照重放不推进epoch、不解除新占用。实际scan（仅扫描器时钟+6分钟）重试后completed；写后中断的项目完成时间不变。旧活进程迟到写及两项来源并发保护一并通过，10项队列/项目/关联回归通过。
- 本轮合成报告证据：屏障失败6aaffecc9ce4d94f9f75870b；解锁失败6aaffecd9ce4d94f9f75872d。错误日志injected recovery ...为主动故障注入，不是生产错误；保留数据。恢复失败通过抛错模拟，并非真实断网；子进程退出是真实process.exit。
- 仅新增测试及文档，不改业务代码，不重启前后端，不访问生产/AI/消息/订单。运行继续fvvTxL环境。复跑：设置既有NODE_PATH后运行node backend/test/integration/reportPlanItemStaleWorker.js <session.json>。
- 尚待：并发编辑的友好409（旧接口可能500/更新0）、全部报告写入口审计、最终多岗位完整闭环验收。本轮不能称整体完成，不请求生产授权；下一轮先处理并发编辑错误提示。

## 23:10 新版本硬中断恢复通过；不等于完整上线验收

- MedicalReport.planItemWriteEpoch单调递增（arm不重置）；HealthPlan.reportItemWriteFences按报告ID保存最新epoch。占用者先推进目标屏障，项目原子完成须epoch相等；迟到者不能降低屏障，报告回执/异常释放亦按epoch CAS。
- 新running超过5分钟进入既有扫描恢复：先增加报告epoch保持锁定，再推进方案屏障，成功后才能变pending。时间只决定扫描资格，屏障才提供旧写失效保证；不是仅超时抢占。网络异常释放也走同一屏障，考虑服务端写仍在飞行。屏障失败/目标不存在保持running，不强解锁。
- 无epoch或0的旧running不恢复，旧代码写入不检查epoch，不能外推安全。隔离历史合成占用继续保留，不迁移、删除或伪造通过。本轮未新增索引、未切Mongo架构。
- reportPlanItemStaleWorker真实Mongo验证：两项旧快照来源更改被拒绝；另暂停仍存活旧执行者在项目写前，恢复后撤销审核，再放行旧执行者，项目仍pending、旧回执无效；旧epoch无法降级方案屏障。
- 同脚本用无业务凭证的本地Node子进程真实process.exit(23/24)，分别在项目写前及写后回执前硬退出；真实库保留running。仅注入扫描器时钟+6分钟（不改客户/任务日期），调用实际scan恢复后completed；写后场景完成时间原值不变。这是本机真实进程退出/数据库恢复，不是真实AI/临床履约。
- 连续auditedPlanItemHttp全段通过（含旧无epoch占用不接管/工作台提示）、14项回归通过。后端2604已核对停止，新exec48578，同fvvTxL清单/JWT刷新；无前端修改，不重复构建。生产未访问。
- 尚待：恢复屏障本身中断/失败的专项覆盖，实际HTTP并发编辑需清晰409而非旧路由500/静默0，所有写入口审计及最终多岗位完整闭环复验。仍不批准整体上线；下一轮先补这些保护，不清除旧失败证据。

## 22:35 持久占用保护通过；恢复未完成，仍阻断上线

- reportPlanItemQueue原子findOneAndUpdate抢pending→running，仅赢家读取冻结报告并写项目；完成/冲突/obsolete通过模块内部Symbol能力写回。普通异常在操作settled后退回pending；回执失败也尝试释放，释放失败保留running，不按时间接管，防旧进程继续写入。
- MedicalReport挂reportWriteFence：现有文档save增加$where排除running，查询更新/替换/删除追加同条件；只有队列内部查询可绕过。扫描源码未见业务MedicalReport.bulkWrite/collection写来源，原生collection分类迁移脚本仍不受模型钩子保护；不将其称数据库级写隔离。文档save冲突会抛错，update可返回0，部分旧入口的友好409处理仍待。
- reportPlanItemStaleWorker实跑两场景safe=true：并发源更改modifiedCount=0，源保持audited/原关联，所以项目完成有效；另验证运行中save拒绝、deleteOne删除0、第二个claim为空。不是允许撤销成功后仍完成。历史失败现场未修改或删除。
- auditedPlanItemHttp全链及同方案竞争/两种异常恢复再次通过。新增合成硬中断running记录（并非实际杀进程）：scan不抢占，真实ai-todos显示报告项目回写占用待检查，普通resolve返回409。该记录保留，不能人工清状态来冒充恢复验收。
- 员工报告详情running只读保护提示，不显示更正/确认按钮；14项回归和1897模块构建通过。尚未浏览器验running态。后端9132已核对停止，新exec30745，同fvvTxL清单，JWT刷新。
- 下一步必须补安全恢复：先确认旧执行者已退出/不可再写，再恢复持久意图；不能仅用5分钟/TTL作为失效证明。当前没有管理员安全恢复入口，硬中断可能留下占用，因此仍阻断上线。还须实际HTTP并发编辑错误呈现、用户端/后台写入口和文档删除审计；无生产部署、无数据库架构变更。

## 22:00 关键失败：旧快照仍可完成项目（上线阻断）

- 新脚本 backend/test/integration/reportPlanItemStaleWorker.js <session.json>：仅回环随机隔离库、核验原虚构客户，另建纯虚构客户/两份方案报告；在真实queue读取报告后、HealthPlan.updateOne前确定性插入来源变化，使用真实Mongo写入，不是真实HTTP竞争或临床资料。
- audit_revoked：report 6aafe51505d806471b694c68 / plan 6aafe51505d806471b694c62。来源已rejected，原项目仍completed，planItemSync也completed。
- association_changed：report 6aafe51505d806471b694c79 / plan 6aafe51505d806471b694c73。来源已指向另一项目/新token，旧项目仍completed；报告新token保护了回执但没有保护跨文档项目写入。
- 脚本退出1，两项安全断言失败，现场完整保留，未做回退清理伪造通过。此前双窗口更正/目标占用及页面正向通过仍成立，但不能覆盖此缺陷。禁止据此前证据批准闭环上线。
- 根因：completeAuditedPlanItem只检查传入快照与目标项目，报告token条件仅用于事后队列回执。简单写前再查/写后再查仍有间隙，不能宣称强一致；需串行化来源变更与回写，并设计进程中断后的持久占用恢复，或经另行审批的事务架构，不自动改生产Mongo架构。
- 下一轮优先修此缺陷及故障恢复，再重跑本脚本、原连续HTTP和页面。不因安全检查失败停止其他本地安全开发；无需用户提供真实数据或批准生产操作。运行仍后端44265/fvvTxL；此次只加测试/记录，不改业务或部署。

## 21:25 同方案更正页面正向通过

- ReportPlanConflictCard增加处理方式和同方案合格项目下拉，排除原项、已完成/已绑定目标及已取消/完成方案；选择变化取消确认，理由+目标+明确确认齐备才可提交。后端再次校验，不依赖前端放行。
- 保存结果明确区分completed、pending、conflict和未知，只有completed说已回写；其他不称检查完成。刷新保留更正审计理由；无重复提交按钮。
- 实际浏览器fvvTxL健管：patient 6aafdd2a5ca8088628b4b64a，report 6aafdd2c5ca8088628b4b6d8，plan 6aafdd2c5ca8088628b4b6d1，target 6aafdd2c5ca8088628b4b6d3。原跳过项改关联正确合成目标，已占用目标不列选项；仅填理由选目标仍禁用，勾选提交成功。刷新仍显示正确合成目标/已完成/完整合成核对理由。此为合成业务输入，不是临床或真实AI验收。
- 新 --prepare-relink-only 为auditedPlanItemHttp准备独立场景后退出，打印非凭证ID/URL且明确不算完成验收。该模式本轮运行通过前半段上传/审核/核对负向检查，不重跑后续并发及故障段（前轮已通过）。
- 13项回归通过，员工端1897模块构建通过（首个构建命令参数错误，改用staff工作目录原命令后成功，既有大包告警保留）。最终标签文字改为“当前关联项目状态”，浏览器热更新/刷新通过。无后端重启或生产访问；tab3保留本报告。
- 待办：pending/conflict浏览器故障态仍未实跑；旧回写持有快照后与更正并发、审核撤销/归属变更跨文档仍需安全验证。不要把正向表单成功外推全部并发已闭合。

## 20:50 关联更正双窗口及目标占用竞争通过

- 扩展auditedPlanItemHttp：同一合成冲突token通过Promise.all发起两个真实HTTP更正，分别选同方案两个不同目标。结果严格一个200/一个409；报告关联为胜者、审计一条、只完成胜出目标、另一目标pending、旧项skipped。
- 另一个合成Mongo场景在pending意图保存后、恢复前将目标绑定另一报告；实际reconcile保持目标pending及竞争报告ID，当前意图conflict。没有以覆盖别人的报告来消除冲突。
- 整个实际API脚本复跑通过：上传/两审核入口/双岗2→1→0、权限/保留现状/更正及故障恢复均通过。此次仅新增验收脚本，无业务代码或前端变化，不重启/构建。
- 局限：双窗口请求并发由真实HTTP调度，但不是任意时序穷举。旧回写已读快照后与关联更正并发、审核撤销及归属变化跨文档竞争仍待；不能称强一致已解决。更正页面未接，下一轮先继续安全边界审计，再接选择表单。环境仍后端44265、fvvTxL，生产和外部出口未触及。

## 20:15 同方案关联更正API通过（页面未接）

- 原conflict/resolve新增retarget_item + targetItemId：仅同客户同方案其他pending且未绑定报告项目；已完成/取消方案、原项目仍绑定本报告、目标非待完成或已有报告全部拒绝。不更改planId或sourceHealthPlanId，不开放跨客户/跨方案转移。
- 报告CAS原token/conflict/原关联保存新planItemId与新pending意图，并追加原/新项目及理由/人员审计；随后复用安全完成器。失败保留pending，目标竞争由既有原子条件保护并记conflict，不冒充完成。旧项目不会被取消、解绑或覆盖。
- 实际auditedPlanItemHttp新增合成方案两待选项场景：非所属403、跨方案项目409、占用409且旧关联不变，正向syncStatus completed/原跳过项不变/唯一目标绑定本报告/一次审计，旧token重放409。原上传、双岗2/1/0、两审核入口、保留现状及两故障恢复全部通过；10项单元回归通过。
- 尚未验证更正页面、并发改关联与旧回写同时发生、客户归属或方案状态跨文档瞬间变化。Mongo standalone无事务，不能声称跨文档强一致；原已绑定报告或跨方案错误仍需独立处置设计。
- 后端22620已核对停止，新exec44265，仍fvvTxL清单与原出口隔离；JWT刷新，前端未变。无生产访问，无真实AI/消息/订单，全部数据合成。下一步接同方案选择页面与更正后的实际工作台结果，然后专项并发/中断测试。

## 19:40 健管冲突核对实际页面通过

- ReportPlanConflictCard接报告详情原弹窗，显示同客户可见方案/项目及状态，明确不是检查完成或解除关联；理由与确认缺一不可，错误留在卡片内。顾问只读，后端继续核对当前客户归属。成功后不提供重复提交，重新打开读取持久结论。
- 使用computer-use浏览器实际登录fvvTxL健管，从工作台skipped提醒打开原报告；空表按钮禁用、只填理由仍禁用，勾选后提交成功。刷新后理由仍在，原项目“已跳过”；返回工作台24→23，目标skipped提示消失，其他冲突和原主客户待完成1/1保留。
- 本次页面证据：patient 6aafbd212f94ce38f2c7f150 / report 6aafbd222f94ce38f2c7f1ad，均上一轮合成测试数据，无真实医疗意见或通知。tab3保留健管工作台；后端42533/前端81687未重启。
- 10项渲染/队列/审核回归通过，员工端1897模块构建通过（既有大包警告）；不是所有岗位所有服务完整验收。
- 操作：工作台“报告与检查项目关联待核对”→核对原项目→仅确需保留原状态时填写理由、勾选确认→保存。若关联错误不要用此动作销项；正确关联重选机制仍待补。下一轮优先该安全更正路径及后续工作台/服务回流验收，不回写历史测试现场伪造完成。

## 19:10 冲突核对接口（页面待补）

- 新POST /staff/medical-reports/:id/plan-item-conflict/resolve仅允许当前所属健管或超管，必须当前冲突token、keep_existing动作及1至1000字理由。通过同报告CAS把conflict改resolved并原子追加planItemConflictResolutions审计记录；不修改HealthPlan项目、不删除报告、不触发AI或派单。当前客户归属在写入前核验；跨文档归属瞬间并发变更仍不是事务保证。
- 这是“核对后确认保留原项目状态”，不是错误关联重选、报告审核或检查完成。保留关联原值及处理凭据；同关联重复审核不重新派出冲突，新关联重新入队，历史处理记录不覆盖。
- auditedPlanItemHttp真实隔离HTTP验证顾问/未分配健管403、空理由400、旧token409、重复提交409；成功后唯一审计记录、原skipped项目完全不变、本轮六提示仅减少对应一条，再审核仍resolved。原上传/双岗2→1→0/11场景/故障恢复全部通过，8项回归通过。合成资料，不是真实AI或临床验收。
- 原隔离后端23588已核对并停止，新exec会话42533，仍fvvTxL数据库与出口围栏；JWT已刷新。无前端修改，不重复构建；生产未访问。
- 下一步：报告页面展示明确原关联/冲突和核对理由表单，接此最小动作并从健管工作台实际浏览器验收；重选正确关联另需同客户/项目状态及并发保护。不能把本轮API成功称页面或完整闭环通过。

## 18:30 冲突工作台可见性通过

- ai-todos新增report_plan_conflict，仅健管/超管可见，限定本人客户，原报告ID生成稳定待办ID；不新建任务文件，不重复AI审核，链接现有报告页面。员工端纳入报告与资料分组与专用提醒文案。
- auditedPlanItemHttp实际验证本轮独立客户6条冲突（两审核入口各跨客户/skipped/other_report），ID唯一、链接原报告；同客户顾问不接收该类型，另建未分配虚构健管登录也无此类型。上传→审核→双岗2/1/0、11场景及真实Mongo中断恢复仍通过。7项单元回归、员工端1896模块构建通过，仅既有大包告警。
- 注意此轮只实现异常可见，不等于人工处理销项已完成：报告页尚无专门关联冲突处置表单/凭据；不得让专员重复上传、重新解析或凭点击已读销项。后续需最小必要异常动作（明确重选/确认保留原项目状态及理由）和角色/归属/版本校验，再验处理后原提示消失。
- 原隔离后端10896已停，当前会话44614、同fvvTxL清单。JWT刷新，浏览器新类型页面尚未验收。仅本地合成数据，无生产访问/部署。

## 18:00 报告项目故障恢复

- 新MedicalReport.planItemSync存本次审核token/planId/itemId/pending，与报告审核同文档保存后立即reconcile；项目仍使用原同客户/待完成/原报告条件更新。临时异常保留pending不要求人工重复审核；接既有启动/24小时扫描，隔离后台调度保持禁用，本轮手动调用扫描函数验证。
- 扫描只处理显式pending，不回填历史审核报告。完成项目且同reportId识别为幂等成功；不匹配记conflict，审核撤销或关联变化记obsolete，终态不无限重试。报告上的conflict尚未投影到工作台，这是下一步，不能称异常管理全闭合。
- auditedPlanItemHttp完整上传/双岗2→1→0/11组审核重新通过；新增独立合成恢复报告的真实Mongo测试注入写前异常、项目写后回执异常，随后扫描恢复completed、completedAt不变。不是HTTP层故障注入，不是真实AI/临床/收费验收。7项针对回归通过，原主链7任务仍零残留。
- 原隔离后端15072已停止，当前会话15266，同fvvTxL清单，JWT刷新；未触生产、未部署、无新AI/通知出口。跨文档瞬间并发撤销及冲突处理页面尚待专项测试；无前端改动，不重复构建。

## 17:20 上传至双岗项目待办消退连续API通过

- auditedPlanItemHttp.js不再只分开验证上传与审核：同一合成方案两项明确itemType，实际POST上传并补传原report ID，分别走PATCH报告reviewed和PATCH audit approve。两个账号实际登录，GET checkup-progress均严格按本plan ID检查pendingCount从2到1，全部完成后本方案行消失；重复审核后仍消失且第一项completedAt不变。
- 上传关联边界和两审核入口11组仍全通过。只读原主链审计completed、7任务、unfinished空、consistent true。原主链客户的无关联报告与0/1未被修改；本次独立虚构客户/合成资料保留，不冒充原场景项目已完成。
- 本次未改业务代码、未重启后端37417，未操作生产。初始方案及报告内容均合成，不能等同真实报告解析、临床结论、真实履约或收费核销验收。浏览器待办消退页面未另验，当前证据是实际工作台API。
- 下一步仍是项目回写失败自动补偿/冲突工作台提示；真实AI及支付出口保持禁止。不要为了清空待办删除合成现场或伪造已读/已完成。

## 16:50 上传项目关联边界通过

- 新reportPlanLink上传前校验同客户方案/项目；项目reportId回填改为同客户pending及原reportId为空/本报告的原子更新，不覆盖人工完成/跳过/已绑其他报告。
- 原空报告复用只看同日期分类，现在须同planId/planItemId、unaudited、无content/fileUrls；无方案上传不能占用已有服务来源记录。补传base64内容无需fileUrl也能保存。没有按名称猜测或覆盖历史文件。
- auditedPlanItemHttp实跑：跨患者/不存在项目400且无新增，明确同项占位复用ID并保存合成内容，不同项目分开，已有内容不复用，原reportId保留、上传仍pending；两审核入口11组全部通过，4项单测通过。首跑分类ID用了文本导致500，修正脚本为隔离虚构有效分类后通过；首跑合成现场保留。无真实文件解码/AI质量验收。
- 隔离后端原17196已停，新会话37417，fvvTxL库与出口边界不变，JWT刷新。原主链客户未改。自动补偿、关联冲突工作台提示及其他端完成入口仍待；未访问生产或部署。

## 16:15 常用AI结果审核入口补齐

- 原PATCH medical-reports/:id（aiStatus=reviewed）只审核报告、不完成显式关联项目。现报告保存后且audit_status=audited时调用completeAuditedPlanItem；重复提交仍幂等，不更改审核门槛。驳回重提回unaudited、草稿pending不完成项目。
- auditedPlanItemHttp.js扩展两入口11组真实HTTP：旧audit五组，加review正向/跨客户/skipped/其他报告/驳回重提/草稿六组，全通过，正向重放完成时间不变。独立虚构客户与报告保留；没有外部AI调用或真实报告质量验证。10项回归通过，前端未改不重复构建。
- 原隔离后端25076已停止，按同fvvTxL清单重启会话92556；JWT重置需重新登录。所有网络隔离与无生产凭证措施保持。未访问生产、未部署。
- 尚待：报告审核已成功但项目回写失败的自动补偿与异常待办；上传报告planId/planItemId回填归属核查；用户端/专项筛查手动完成属于不同入口需分开审计。当前不能称项目全闭环或真实AI验收完成。

## 15:40 报告项目回写真正API验证

- 修复原audit路由在报告持久化前先plan.save、未核对患者且重写完成时间的问题。新增completeAuditedPlanItem：审核保存后，同planId/patientId及pending项目，reportId为空或本报告时原子完成；skipped/其他报告/跨患者不覆盖。
- 新脚本 node backend/test/integration/auditedPlanItemHttp.js <session.json>：严格本机随机库及原虚构客户校验，另建“隔离项目回写客户（纯虚构）”，不修改原服务现场。实际健管登录及PATCH审核覆盖matching（含重放首次完成时间不变）、other_patient、skipped、other_report、rejected，5组通过。报告/检查项目为合成输入，无真实文件/AI，不是临床或全部服务验收。合成记录保留。
- 13项针对回归通过；原体检服务只读审计仍7任务、unfinished空。审核后写回若暂时失败，可重试审核恢复，但尚无独立自动补偿/工作台失败投影，本轮不宣称此故障闭合。其他报告审核入口及自动匹配路径还须审计，避免只覆盖旧audit接口。
- 已停止原隔离后端30108并用原fvvTxL清单重启，会话3502；隔离出口和无生产凭证不变，陪同日期补丁也已加载，未创建任何陪同订单。JWT刷新后浏览器需重新登录。本轮无生产访问/部署。

## 15:00 同次分组页面通过

- IAB tab3重新登录fvvTxL顾问，打开患者tab=plans&serviceView=checkup：本次1/既往0，方案2份，任务7/报告1，已完成及本次准备方案入口均正确。6a9c7409页面验收通过，不是全闭环验收。
- 同页发现结构化serviceMode=one_stop/serviceScene=checkup_one_stop但模板名不含一站式时误标单独体检。新增统一checkupServiceMode供本次/历史使用，9项回归通过，浏览器实际显示体检一站式服务。
- 项目审核完成机制在staff.js报告审核中，仅有report.planId+planItemId才回写对应item.status；当前空模拟报告无此项目映射。checkupPreparationReports回流门槛允许明确not_completed清单项，所以服务验收不能直接当成所有检查完成。保留0/1与报告解读待办，未写入假完成；下一轮补实际报告项目关联API及缺项处置验证，并核查回写同客户约束与失败恢复。
- 本轮未重启后端60141，故陪同日期补丁运行加载/场景补验仍待；该专项已在用户单独授权的发布轮部署生产1b0d007c，本轮没有生产访问。

## 14:20 同次体检明确关联分组

- 后端患者方案列表新增只读checkupServiceId投影，来源CheckupPreparationHandoff，核对同患者/正确方案类型/唯一承接；不写回HealthPlan、不改检查项目完成状态。前端按明确关联归组，执行服务为主卡，本次准备方案保留可点击入口；类别计数也按组计算，不按年份或名称合并。
- 8项展示/路由/投影回归通过；员工端1896模块构建通过，仅既有大包告警。实际fvvTxL顾问登录+GET患者方案验证准备关联ID等于本服务ID，准备active、服务completed；只读Mongo审计仍7任务、unfinished空、consistent true。
- 原隔离后端26704由同属主停止后重启为会话60141；同fvvTxL清单、出口围栏不变。前端81687不变。JWT重置，tab3下次需要重新登录再验证“既往0、本次两份方案与准备入口”。本轮尚未浏览器复核新分组，不能报页面验收通过。
- 准备项目0/1和报告待解读仍保留，模拟报告没有项目对应凭据，不因服务关闭自动抹平。下一步检查项目与报告的真实匹配闭合、结果评估中的解读入口；不触及生产。

## 13:40 浏览器复核与本机访问恢复

- 原前端PID29060仅监听::1，shell localhost 200但IAB连接拒绝；仅重启此隔离Vite为127.0.0.1:5174（会话81687），页面仍使用localhost以保持CORS。后端PID26704、Mongo21408原本正常，未停止；本轮多余启动均因端口占用退出，无新库/数据覆盖。
- IAB tab3以fvvTxL顾问账号实际登录，服务管理→体检管理显示“本次体检服务已完成”，本次任务7项、报告1份；095dbb79完成提示及精确报告关联浏览器验证通过。
- 新发现：同一次的准备方案仍confirmed、0/1项目完成，被放入“既往体检”；顾问首页因此仍有“体检方案待完成”。合成报告尚无检查项目映射，不能凭服务完成伪造项目完成。下一步核对准备方案/服务实例/报告项目的明确关联与同次分组，再决定缺项工作台提示或自动回写。
- 顾问首页独立报告待解读1条仍保留，本轮没有点击报告/伪造已解读。方案详情显示AI加项准备未完成（隔离出口禁止外部AI），未重试生成。无生产访问或部署，尚非全闭环验收。

## 最新：进度展示修复与待解读边界

- CheckupManagementWorkspace原提示只看confirmedAt/pushedAt，服务完成仍会要求客户确认；任务/报告原先按名称匹配整位客户，可能混入其他年度。新增checkupProgress纯展示模块：严格按本plan ID或显式serviceInstanceId归集，完成/取消优先，本服务具体阶段优先于推送提示。无明确关联的历史报告不猜测属于本次，仍在原报告列表保留。
- 6项展示/路由回归通过。新逻辑没有执行或修改客户/任务数据；本轮浏览器页面尚未验收，应以fvvTxL新账号/新patientId核对完成标题和本次报告计数，不能沿用旧URL。
- 报告待解读源于MedicalReport audited+pending+familyDoctorViewedAt为空，原有独立顾问查看动作负责关闭；本轮不因result_review completed自动伪造“已查看/已沟通”。当前模拟API场景未实际查看报告，所以不能将service-tasks空泛化为整个工作台没有待办。后续需在评估入口整合查看/解读证据，避免遗漏或重复操作。
- 环境仍为后端29624、前端56767、fvvTxL清单；未访问生产或外部AI。
- 员工端构建1896模块通过，仅既有大包告警。

## 最新：全新标准场景零服务任务残留（12:20）

- 旧44184已停止，当前隔离后端29624，前端56767不变；新清单 C:/Users/huawei/AppData/Local/Temp/jiayicare-acceptance-fvvTxL/session.json。旧VmyQ9g及所有证据保留，不删除旧异常任务。浏览器需重新登录新清单账号并使用新patientId，不沿用旧URL。
- 从零运行checkupPreparationHttp.js、checkupServiceHttp.js --standard-template --with-questionnaire、checkupClosureHttp.js全部通过。含问卷未提交阻断/真实提交、双岗与客户确认门槛、原服务启动、预约陪检、报告待审阻断/审核解锁、独立评估/验收、原健管唯一回写及重放幂等。没有收费订单。
- auditIsolatedCheckupTasks.js结果：serviceStatus completed、taskCount 7、unfinished []、consistent true；固定6阶段+原收单均完成，无误建abnormal_followup。真实四岗位/staff/service-tasks皆200、data []。
- 闭合脚本新增“无未完成源任务”和“四岗位服务工作台无残留”硬断言，后续不再仅以service completed判断通过。
- 本轮为真实API/真实Mongo复跑，非本轮浏览器操作。初始年度方案/模板、问卷答案、报告及履约结论为合成数据，不能算真实AI/专业评估/支付核销验收。此前页面办理证据属于VmyQ9g场景。仍需核查顾问报告解读待办与服务进度投影、其他专业服务及真实AI授权边界。

## 最新：收单回写隔离API通过（11:46后）

- checkupPreparationActivation增加精确service:intake复用：核对本承接设计/预约任务同文档凭据、准备证据plan ID、当前规划师归属、唯一未执行收单任务，以版本条件更新并保存formData.checkupPreparationIntake来源。已有人工完成不覆盖，重复/改派/缺证据拦截，不新增任务。正常激活及active重放均覆盖；其他非准备服务不套用此逻辑。
- 隔离后端63318已停止，新会话44184在独立工作区加载修复；前端56767不变。仍无生产凭证，出口围栏不变。
- VmyQ9g用原规划师实际登录后，POST原准备任务/checkup-preparation/activate两次均200/active。只读审计service仍completed、任务总数仍8，未完成从2变1，仅旧abnormal_followup阻塞；service:intake不再残留。无删除、不修改异常任务，不代表全闭环通过。
- 49项激活/完成/重放回归全部通过；本轮无前端改动，无真实AI/收费订单。尚须新标准场景全程验证无旧条件误派、各工作台与报告解读投影核对。active接口仅在有明确原承接证据时补回写，不做历史批量修复。

## 当前工作区与审计（11:13更新，优先于下方历史）

- 工作区：C:/Users/huawei/Documents/codex/health-management-isolated；既有feature/health-management-foundation-20260918。原deploy-health-monitoring-7630c892为master生产发布目录，不再切换该目录分支。自动接续提示已调整。
- 隔离后端63318、前端56767已从新工作区启动；旧78444/83387已停止。仍使用VmyQ9g/session.json、127.0.0.1:27134和3000、localhost:5174；JWT重置需重新登录。根及staff/node_modules仅为既有依赖目录的junction（本机安装优化，不提交、不复制生产凭证）。启动围栏保持不变，五岗位登录/工作台/随访API与未登录拒绝通过。
- 新只读审计脚本：node backend/test/integration/auditIsolatedCheckupTasks.js <session.json>。仅接受隔离清单，直连本机随机验收库，核对虚构客户后读取，不创建索引、不修复数据。
- 实跑发现：service completed，共8任务，其中service:intake planned未阻塞，旧abnormal_followup planned阻塞，consistent=false。固定六阶段完成不等于所有工作台任务闭环。
- 收单根因：checkupServiceInstance在新建服务时额外建立service:intake supervisor，原发布/承接和结束链未处理此独立待办。下一步设计精确收单复用/完成回写，需留真实办理凭据与幂等性，不可随意删除或仅隐藏。旧条件误派保留，后续新场景证明不再产生。
- 本轮无生产访问/部署。医保专项此前已独立发布d3ca572e，与闭环功能发布无关。

## 最新：规划师最终验收页面与原健管回写通过

- 后端已受控停止旧74429，按同一VmyQ9g清凭证/网络隔离入口重启为78444，加载8c5219b6；JWT刷新后浏览器重新登录虚构healthPlanner。
- 本人首页原“总督办/最终验收”进入独立必填结论，09:53保存明确非真实履约的模拟验收结论。真实库result_review和final_acceptance均completed且保留各自原文，service及handoff.completion均completed。
- 只读精确查询年度/排期/客户确认原健管年度体检随访只有1条、completed，完成凭据包含handoff/service/final/review四个ID。规划师客户页展开原随访详情显示已完成、执行时间09:53:41。未人工点击健管完成。
- UI标题误把体检最终验收写成“核对代办结果与检查单”，当前节点误称独立订单督办，已按明确体检结论阶段修正文案；不改变状态推进规则。路由专项3项通过。
- 仍未完整验收：旧误建条件任务保留（新代码不会自动删除），规划师另有“服务收单”待办，报告解读和服务进度投影仍待核查；新标准完整场景需重跑无误派。真实报告/AI、收费订单核销及其他专业服务尚未通过。本次仅无订单标准体检主链API/多岗位页面推进闭合。
- 页面tab2当前为规划师客户随访详情，保留供接续；未连接生产或真实外部出口。
- 员工端本地构建1895模块通过，只有既有大包警告；标题修复后的未完成任务页面尚未重开复核，不重开已完成业务来做展示测试。

## 最新：固定链补建不再提前派发条件审核

- 根因：checkupOneStopFlow.ensureCheckupTasks读取所有followUpPlans，按任意非空stageKey补建；预约推进首次运行后将abnormal_followup也建立成永久阻塞待办。现按followUpPlans/workflowModules排除conditional，仅补建六个固定阶段；不删除既有任务、不代替原条件决策入口。
- 新脚本 backend/test/integration/checkupFixedChainMongo.js：只连接127.0.0.1:27134随机数据库，不加载dotenv、不连接外部；真实保存六个固定任务，重放ID不变，条件任务为零。此次库jiayicare_acceptance_5d893add2848b7a98dffc0a02fb390e0保留，数据全部虚构。这是持久化回归，不是完整API/UI验收。
- 针对12项通过；扩大annualCheckup*/checkup*/followUpExecutionContent回归289项中288通过，剩余为既有V15门诊迁移文本断言（总督办与最终验收）失败。此次未改前端，不重做构建。
- VmyQ9g原场景及错误条件任务未改，旧运行后端尚未加载新修复。下一次先受控重启隔离后端，再完成规划师最终验收页面并核对原健管任务。随后新标准场景验证条件节点不会再次误建；不把旧现场删除当作修复证据。

## 最新：独立评估结论已从顾问工作台提交

- VmyQ9g场景不变，浏览器tab 2仍为familyDoctor。结果评估/最终验收改用CheckupConclusionForm，两个员工入口均不继承上环节清单，隐藏重复补充说明。空结论提交被拦截。
- 08:46浏览器从首页结果评估待办打开，填写明确“隔离模拟评估、无真实医疗判断/后续随访”的结论后保存，页面显示事务记录已更新。只读Mongo核对原result_review为completed且executedContent逐字保存；final_acceptance为in_progress、isBlocked=false、结论仍空，未替规划师完成。
- 8项针对回归通过，员工端构建1895模块通过（原有大包告警）；未连接真实AI/订单支付。仅真实页面/API流转验证，不能当作真实专业评估。
- 下一步：规划师最终验收页面；修复条件abnormal_followup尚未触发却提前创建的阻塞任务；核查报告解读重复待办与旧服务进度投影。后端进程尚未加载上次populate改动，需受控重启同隔离场景后验证显式stageKey路径。当前浏览器已关闭评估弹窗。

2026-09-20：已建立真实本机后端、五岗位登录及纯虚构客户，未接生产。

## 最新：报告审核通过，顾问办理仍有表单缺口

- 健管从首页报告待审核进入原始资料，关闭预览→审核AI结果→提交审核。模拟报告零项目/无原文件，页面已审核；真实库原result_review=in_progress且isBlocked=false。仅UI/流转验收，非报告质量/AI验收。
- 顾问首页点击结果评估却弹AI体检方案生成：ServiceTasksPanel原来仅凭familyDoctor角色识别设计任务。新增checkupTaskRouting：明确plan_design优先，旧数据仅匹配体检方案定制/设计/审核；三处后端populate补workflowStageKey。单元测试通过，浏览器旧数据兼容路径已确认不再误跳。
- 当前原评估任务打开“记录事务完成情况”，清单却显示“核对体检执行情况并完成报告回收”及上一阶段结论；尚未点击完成。下一步修复结果评估/最终验收表单不能继承前置清单冒充本阶段执行，再继续UI。
- 顾问另看到未实际发现异常却出现阻塞“体检异常后续方案审核”。疑似ensureCheckupTasks遍历所有阶段而未排除conditional，下一步检查并新增回归；不要仅手动完成/删除现场任务。
- 仍VmyQ9g/后端74429，后端新增populate尚未重启加载，浏览器2保留顾问评估弹窗（未保存）。本次未调用真实AI/通知/支付，未部署。

## 最新：标准陪检及报告回收页面通过

- 沿用VmyQ9g/后端74429：就医专员首页唯一陪检待办打开执行表单，确认预约交接信息后，以明确模拟结论提交已完成；原报告回收解锁。
- `checkupClosureHttp.js <manifest> --prepare-report-only`只创建模拟待审报告、保存closure-http.json及断言，不自动完成任何后续节点。未运行真实AI或上传原文件，页面“AI解析完成”来自模拟pending状态，不能作为AI验收证据。
- 健管首页原回收待办→核对陪检→选择同服务模拟报告→整份覆盖全部项目→齐全→提交。页面成功，真实库断言collection.completed、review仍blocked、final未完成。
- 发现回收按钮/横幅误称“完成闭环”“最终收尾”，已改为“完成回收并进入解析审核”“后续仍需审核、评估及最终验收”，涉及PatientDetailPage、FollowUpsPage、ServiceTaskContextBanner。业务状态未变。
- 下一步健管从首页报告待审核入口审核本模拟报告，然后顾问结果评估、规划师最终验收页面。浏览器2保留健管会员页；三份历史库证据均保留，禁止复写原任务或把fixture标成真实医疗/AI验收。

## 最新：标准问卷正向及规划师页面通过

- 当前manifest：`C:/Users/huawei/AppData/Local/Temp/jiayicare-acceptance-VmyQ9g/session.json`，后端74429替代45690；前两轮库完整保留。已加载6f2ae7a6全部保护。
- 扩充 `checkupServiceHttp.js --standard-template --with-questionnaire --prepare-only`：新建明确模拟的单题健康文件并绑定标准八节点配置。真实服务创建函数产生原分配；提交前真实发布409且无新任务；客户真实登录/问卷提交后，发布/承接/激活全部成功。零customer员工任务、设计复用准备完成、原预约只启动一次。
- 双岗准备脚本已在新库全部通过。年度方案仍为已审核模拟前置，不代表真实AI/专业评估通过。标准模板为仓库定义，不是线上配置快照。
- 浏览器规划师从首页预约待办进入会员执行页，自动打开预约表单；填写“隔离模拟机构（非真实预约）”、模拟楼层/会合点、09:00及非医疗指导说明后点击确认预约。页面提示事务记录已更新；数据库断言booking.completed、原onsite.isBlocked=false且机构交接值一致。无真实预约/消息/订单。
- 接续请切换本manifest的medicalAssistant账号，办理原陪检，再健管报告回收、顾问评估及规划师验收。浏览器2保留当前规划师会员页。不要执行旧无模拟细节的service脚本完成段覆盖真实页面证据；使用prepare-only亦会因booking已完成而不重复执行。
- 本轮仅扩展验收脚本、文档，无业务代码变化；前轮280项回归通过，后续标准闭环尚未完成。

## 最新：客户前置安全修复（正向验收仍待完成）

- 新 `checkupCustomerIntake` 核验customer模板/问卷配置、本次提交状态、同客户同问卷答卷及PushRecord的服务/订单来源；仅submitted标志不放行，冲突来源不接受。发布前校验，不生成员工customer任务；准备承接及启动重核共享同一门槛。不改变无客户节点且无问卷配置的旧模板。
- 旧错误任务不自动删除或完成。当前标准场景缺问卷绑定，仍应该409；`checkupIntakeGateHttp.js <nsE3Fp/session.json>` 已验证真实发布拒绝且全部原任务文档未变化。
- 280项相关测试通过。尚未验证配置有效问卷→真实客户提交→标准模板发布无customer员工任务→预约承接的正向路径，下一轮优先新场景完成；不能声称原标准阻断已完整解决。
- 后端会话45690替代19346，沿用nsE3Fp库；最后一次来源冲突强化在重启之后，下一轮需重启该后端加载最终代码。其他进程未变。无前端改动，不重建员工端；未部署生产。

## 最新：标准八节点场景暴露客户前置错误（未通过）

- 新场景manifest：`C:/Users/huawei/AppData/Local/Temp/jiayicare-acceptance-nsE3Fp/session.json`；后端exec19346替代2569，同端口且保持原出口隔离。旧jdmCHJ库及关闭证据完整保留，未重开旧任务。前端/Mongo仍沿用原进程，页面旧JWT失效需新manifest登录。
- 新场景 `checkupPreparationHttp.js` 全部通过。`checkupServiceHttp.js <新manifest> --standard-template --prepare-only` 使用仓库八节点定义，只导入数据（dotenv已禁用，不运行迁移），模拟批准模板；无订单、无问卷绑定配置，不冒充完整生产配置。
- 真实发布/关联通过，但激活409“原服务收单/前置任务尚未完成”。原始customer/intake模板被staff.js通用upsertMedicalAssistModuleTasks的负责人fallback派给familyDoctor；plan_design依赖该错误员工任务。当前无该客户任务自动完成桥接，不能靠人工替客户点完成证明闭环。
- service-http.json已保存任务岗位/前置快照与activationFailure，保留activation_failed原现场。23项模板/问卷/激活既有单测通过，但不能掩盖此真实API失败。
- 下一步修正客户节点与员工任务分离，同时保持资料门槛：核对有效问卷绑定/提交证据或已审核准备资料复用的规则，未具备证据不解锁；不要简单过滤节点而绕过前置，不直接批量删除/完成旧任务。相关入口：staff.js约3249负责人fallback、3463固定节点、3517串联；questionnaire.js约358仅写checkupIntake提交状态；checkupPreparationActivation.js约62检查原前置。
- 此轮仅扩充隔离验收脚本及证据，未修改业务逻辑；标准模板多岗位办理仍待修复后重跑。当前无需生产审批，可继续本地安全诊断与修复。

## 最新接续：健管自动完成的可追溯展示

- 原详情仅显示已随访/时间，未展示自动完成来源；新增只读 `CheckupCompletionEvidence`，仅completed且完整四项凭据存在时显示。保留人工记录，不写入虚构的executedContent，不新增按钮任务。
- 实际浏览器健管账号：随访管理→已随访→重置→唯一年度体检提醒→详情→查看关联凭据，已看到服务、评估、最终验收及承接ID；同上一轮API证据匹配。浏览器2保留此页，后端2569/前端83387/Mongo21408未重启（接续前核验归属）。
- 266项相关回归及员工端本地API构建通过，原大包警告保留。
- 标准模板静态核对：`seedCheckupOneStopWorkflowDraft.js`为八节点，含客户健康文件与条件异常审核；此前六节点模拟场景没有覆盖这两段，也未覆盖按中文名称触发的预约/报告表单校验。不得把六节点结果当作标准模板全流程验收。
- 下一轮应在新隔离场景使用标准配置，验证客户资料前置及实际多岗表单；不要回退/重开已完成的本轮证据，不直接运行带dotenv和默认生产候选URI的迁移脚本。真实AI及外部交易仍禁止。

## 最新接续：报告审核至原健管随访关闭

- 新增 `node backend/test/integration/checkupClosureHttp.js <session.json路径>`，保留结果于同目录 `closure-http.json`。模拟未审核报告由隔离库创建（未验收文件上传/OCR/AI），实际报告回收完成API不提前解锁；真实报告审核API解锁唯一原顾问任务。
- 实际复现结果评估接口400：前端提交content，后端校验executedContent。统一取值用于校验及保存，优先显式content（空值不能借旧字段绕过），兼容旧executedContent调用。
- 真实顾问评估/规划师最终验收接口保存结论并完成，服务自动关闭，唯一原年度健管随访completed，承接completion.completed。空结论400；重复最终验收任务数不变，原健管完成时间与更新时间不变。
- 浏览器使用隔离健管账号登录、随访管理→已随访→详情，确认唯一“年度体检提醒”已随访、负责人健管专员、完成时间存在；未用UI代替执行全部岗位表单。
- 264项相关回归全通过；仅后端改动未重建前端。后端会话2569替代54338，沿用同一session.json；前端/Mongo未变，浏览器2保留健管随访详情用于接续。
- 下一步：标准模板的各岗位实际页面办理、年度评估/AI边界、收费订单核销的隔离场景仍待核验；当前模拟六阶段无订单场景不能覆盖生产模板校验、真实专业判断、外部履约、付款/核销。禁止生产或真实通知/交易。

## 最新接续：服务承接与预约/陪检流转

- `node backend/test/integration/checkupServiceHttp.js <session.json路径>`：模拟六阶段配置，无收费订单，经实际服务创建函数建立实例；真实发布、关联及启动API重复执行均未新增重复任务，复用已完成准备。
- 使用模拟履约结论调用真实完成接口，预约→陪检→报告回收已通过。首次实跑发现重复保存预约会重开已完成陪检；已改为仅原子解锁仍阻塞的planned/missed任务，保留在办/完成/取消及原执行证据。真实API复跑与8项单元回归通过。
- `service-http.json`保存模拟服务/任务ID及已通过检查，不含密码。此脚本使用最小模拟模板，不等于生产模板、实际预约/陪检、AI或支付验收。
- 报告回流、结果审核、最终验收及原健管任务关闭尚待实跑；结果审核/最终验收接口校验executedContent而前端提交content，疑似不一致，下一轮需实际复现再修复。
- 后端已重启为exec会话54338（旧86014已停止），复用原session.json及隔离数据库；浏览器JWT需重新登录。Mongo及前端未变；先核验进程归属。
- 前述“尚无服务实例”是上一轮状态，现已有上述明确标记的模拟实例，未改任何生产环境。
- 本轮相关回归261项全部通过（含8项新增防重测试）；无前端修改，未重复构建。此前扩大回归的既有V15静态断言失败仍未解决，不能称整个仓库全绿。

## 本轮接续：双岗准备真实HTTP验收

- 新脚本 `backend/test/integration/checkupPreparationHttp.js <session.json路径>` 可重复运行；结果保存在同目录preparation-http.json，不含登录token或密码。
- 初始“已审核发布年度方案”和标准检查模板是明确标记的模拟前置输入，不代表专业评估、AI生成及年度方案审核已通过。验证码直接写入隔离库，非可拨打标识完成真实登录接口，不发短信。
- 真实客户确认接口重复执行，只生成两条准备任务；非负责岗位访问403。
- 顾问通过真实模板草稿、修改审核、发布接口完成原准备任务；规划师通过真实接口保存模拟沟通证据。两条任务完成仍必须等客户确认本次体检方案；确认后汇合门槛通过。
- 实际页面发现待承接阶段工作台没有入口：已补只读投影，准备齐备且无承接/待启动时出现一条原任务入口；已启动、失败异常、未齐备及归属变化不重复显示，不新增数据库任务，不调用AI。
- 已在规划师页面看到“体检准备齐备·待关联服务”，点击打开原准备卡，显示暂无符合条件服务；并未自动下单。当前隔离库确实尚无正式服务实例，下一步准备明确标记的服务模板/实例输入并验证承接、预约、回流和最终关闭。
- 253项相关测试及员工端构建通过（既有大包警告保留）。生产未改，不能称服务全闭环通过。

### 重启保留本轮虚构数据

先停止确认属于本验收的后端进程，再设置 `RUN_ISOLATED_ACCEPTANCE=true` 和 `ISOLATED_ACCEPTANCE_SESSION=<session.json绝对路径>` 运行原启动器。它只接受隔离库命名及虚构客户标记，复用原账号数据；新JWT密钥使旧登录失效，页面需要重新登录。禁止向该参数传入生产配置。

本轮后端exec会话改为86014；Mongo与前端仍沿用下述进程。后续先核验存活及归属。

## 本轮已验证

- 真实HTTP：健康顾问、规划师、健管专员、就医专员、超管登录与身份、ai-todos、followups返回200；未登录访问me返回401。
- 浏览器实际打开员工端发现白屏：AiCaseReviewPanel把assessment变量和useState放在模块顶层，构建通过仍运行失败。已移回StageWorkflow及主组件内部，新增模块导入/四专业角色渲染测试；刷新后可登录并显示顾问工作台。
- 含新渲染/出口控制测试的相关回归251项通过。不是全业务或全部旧功能验收。
- 尚未走年度准备、正式服务、报告回流、核销和原随访完成；其他四岗仅API验证，不算页面已验收。AI出口故意禁用，不算AI生成通过。

## 可复现启动

先启动已批准的本地MongoDB7.0.34，绑定127.0.0.1:27134；不得更换为生产库。运行前确认3000/5174未被其他程序占用。

```powershell
$env:RUN_ISOLATED_ACCEPTANCE='true'
node backend/test/integration/startIsolatedAcceptance.js
```

启动器每次创建随机jiayicare_acceptance_前缀数据库，创建五个独立随机密码账号及无手机、无临床资料的虚构客户，输出临时session.json路径。密码只在该本地运行文件，不提交或打印到测试报告。账号为acceptance_familyDoctor、acceptance_healthPlanner、acceptance_healthManager、acceptance_medicalAssistant、acceptance_superadmin。

另开终端，从staff目录：

```powershell
$env:VITE_API_URL='http://127.0.0.1:3000/api'
node ../node_modules/vite/bin/vite.js --host localhost --port 5174 --strictPort
```

页面：http://localhost:5174/。必须显式设置上述API地址，员工端默认地址是生产，不能遗漏。真实HTTP冒烟（仓库根目录）：

```powershell
node backend/test/integration/smokeIsolatedAcceptance.js <启动器输出的session.json绝对路径>
```

## 安全边界

启动器清除继承的业务凭证/代理、屏蔽dotenv加载，随机JWT，关闭后台初始化/索引迁移，仅绑定127.0.0.1:3000。允许数据库连接仅127.0.0.1:27134，拦截HTTP/HTTPS/fetch、其他Socket与子进程。此为测试进程防误连措施，不是操作系统安全沙箱；不加载不可信代码，不复制生产资料。

初始库无业务模板/任务，不可伪称完整验收。模型校验真实执行，但付款、真实专业意见和AI输出不能靠虚构种子冒充。下一步只补明确标记的模拟业务输入，使用真实路由/工作台执行，逐环节记录证据和未覆盖项。

## 本机本轮接续位置（非凭证）

- session文件：C:/Users/huawei/AppData/Local/Temp/jiayicare-acceptance-jdmCHJ/session.json。
- Mongo进程PID21408；后端exec会话33837，前端exec会话83387。后续先检查存活和端口归属，禁止按旧PID盲目停止其他进程。
- 保留上述进程供下一次验收，测试库保留；重开启动器会创建新库，不覆盖本轮记录。启动曾因Mongo尚未就绪连接失败，无生产访问。
