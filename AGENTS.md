# Codex / Claude Code 双端统一项目记忆

> 2026-09-21条件冲突真实HTTP验收通过：隔离测试预加载钩子在读取后/实际CAS前写入人工决定，接口409且持久意图pending；显式重试200/完成，人工not_needed及其他内容保留，零旧Task/Review。已恢复无钩子exec25665并回归通过；不是自动恢复或全闭环，未部署/推送。

> 2026-09-21待恢复提醒真实页面通过：computer-use以隔离健管从本人工作台打开合成pending报告，详情明确尚未完成/未自动恢复、不新增客户任务；仅关闭，无强清操作，刷新保留。报告6ab0a8b966a9bc4b458ad506；时间为合成fixture，不是自动恢复或全链路验收。未改生产，仅本地证据提交。

> 2026-09-21条件草稿重载回归：隔离后端exec44023，报告副作用及项目回写两份实际HTTP脚本通过；双写真实Mongo仅一成功/一冲突，ObjectId/Date原值保留。补路由显式返回条件冲突409，避免通用500；末次响应分支尚未重载HTTP触发验证。来源互斥/安全恢复/页面仍待，仅本地提交，未部署或推送。

> 2026-09-21条件草稿目标并发保护：仅按原方案content/客户/status匹配写决策子字段，目标已变化返回409，不覆盖人工决定或其他内容。四场景真实隔离Mongo通过；代诊补丁后的三份报告HTTP/硬退出回归通过。新保护尚未重载HTTP/页面验证，来源报告互斥及自动恢复仍待，未部署；功能分支推送仍待单独授权。

> 2026-09-21用户专项授权后医疗代诊补丁已发布生产f9fb958b（功能分支349333cd），GitHub/线上一致、构建及健康检查通过，跳过数据迁移。整体新架构未发布；旧订单未补建，页面/完整履约仍待。见docs/MEDICAL_PROXY_DISPATCH_FIX_20260921.md。

> 2026-09-21医疗代诊专项：顾问直接发起改为健管预约→规划师派单→就医专员，工作台操作任务不被督办遮蔽；32项测试及真实隔离预约/派单HTTP、重复/防回退验证通过。顾问输入为合成，页面/履约和生产同步仍待；未改真实订单、未部署。见docs/MEDICAL_PROXY_DISPATCH_FIX_20260921.md。

> 2026-09-21审核保存后真实硬退出验证通过：本地子进程save后exit(29)，父进程确认audit+pending输入保留且零子记录；实际HTTP显式重试两次保留原token/输入/责任人，唯一Task/Review。不是自动扫描或running安全接管；仅测试证据本地提交，未部署，推送仍待授权。

> 2026-09-21未执行意图可见性：显式pending超过5分钟投影本人健管工作台唯一报告提醒，撤销后不提示派单；详情只读提示不冒充自动恢复，保留独立项目冲突操作。旧审核响应重读最新状态。两隔离API脚本、19项回归和1897模块构建通过，新增提示未浏览器验收；未部署，仅本地提交，推送待授权。

> 2026-09-21显式异常审核输入持久化：legacyDispatchIntent与旧审核结果同文档保存，首次CAS防覆盖，冻结输入/人员/来源；后续消费原输入并记录结果。真实API、同文档竞争/未执行输入保留、撤销互斥与13项回归通过；尚无自动扫描/安全接管，非完整恢复，未部署，仅本地提交。

> 2026-09-21双队列互斥实测通过：旧复查先占用时项目回写保持pending，项目回写先占用时旧复查409且零子记录；原持有者完成后显式再调用，两队列均完成且子记录各一。真实隔离Mongo确定性调度，不是自动恢复/HTTP竞速。仅测试记录本地提交，推送仍待授权，未部署。

> 2026-09-21派单占用真实页面通过：隔离健管从本人工作台打开中断报告，详情显示结果未确认/禁止强清，仅关闭按钮，刷新仍保留；使用computer-use实际浏览器，不是渲染替代。未改数据或生产。本地证据提交，推送仍待具体目的地授权；自动恢复与全链验收未完成。

> 2026-09-21派单占用页面提示已补：legacyReviewWrite.running优先只读显示，缺planItemSync也可见，不提供强清或重复关联操作；16项回归/员工端1897模块构建通过，浏览器未验。推送因远程外发审批被拒，dc783df7及后续仅本地，等待用户确认具体GitHub目的地；不得重试绕过，未部署。

> 2026-09-21旧复查来源占用保护已接：按审核/客户/updatedAt原子领取legacyReviewWrite并保存输入，模型写/删排除两种running；完成凭token解锁，异常保留锁不超时抢占。两项撤销竞争转通过，重复/并发/原项目恢复及11项回归通过；超时工作台API通过。硬中断自动恢复、审核同文档意图和条件草稿保护仍待，未部署。

> 2026-09-21上线阻断复现：legacyReviewStaleSource真实隔离Mongo在写Review前/写Task前撤销审核成功，旧快照仍各建一Task/Review，两项失败退出1。现有防重不等于撤销安全；新增恢复设计但尚未实施，见docs/REPORT_AUDIT_EFFECTS_RECOVERY_PLAN.md。仅测试/证据，无业务修改或部署。

> 2026-09-21条件分流修复：实测已判不需要仍误建旧复查，现区分有条件模块与新增草稿数，needed/not_needed/pending均不落旧派单，保留原决定。新复查冻结taskAssigneeSnapshot，半成功重试不改责任人。真实隔离两API脚本及11项回归通过；自动意图/补偿及撤销竞争仍待，未部署。

> 2026-09-21旧异常审核防重局部修复：报告保存后才做条件草稿/复查，固定报告派生子记录ID+仅插入复用首份内容；真实HTTP重复/并发均一Task一Review，半成功重试/已完成不重开通过，原API及11项回归通过。尚无审核同文档意图/自动补偿，撤销竞争、条件分流与历史记录仍待；非完整闭环，未部署。

> 2026-09-21真实隔离HTTP发现旧异常审核两缺陷：无效子项500遗留孤立Task、重复approve生成双Task/双复查。已先做子记录前置校验，无效项400且零副作用通过；重复审核仍失败，脚本退出1并保留证据，继续阻断上线。原报告连续API和11项回归通过，不代表新故障已全修；未部署。

> 2026-09-21报告占用提示：员工报告编辑及旧审核入口先拒绝running，保存阶段并发丢失返回明确REPORT_WRITE_CONFLICT/409；实际隔离HTTP两入口占用拒绝及原连续脚本通过，11项回归通过。其他写入口与旧审核保存前创建异常随访的副作用仍待，非完整闭环，未部署。

> 2026-09-20恢复二次故障验证通过：真实隔离Mongo在硬退出后分别注入目标屏障失败、解锁失败，均保持running并拒绝源修改/删除；旧恢复快照失效，再扫描完成且不重写完成时间。旧活进程场景及10项回归通过。本轮仅测试/证据，无业务变更或部署；友好409、写入口审计及最终全链验收仍待。

> 2026-09-20硬中断恢复新增版本屏障：报告持久epoch递增，方案端同报告epoch只升不降，项目写入及回执均按epoch条件；先推进目标屏障再解锁，防旧活进程/迟到请求覆盖。真实子进程写前/写后硬退出经恢复扫描通过，完成时间不重写；旧快照/连续HTTP/14项回归通过。无epoch历史占用不接管，友好冲突错误与最终全链验收仍待；未部署。

> 2026-09-20旧快照并发保护已接：报告队列原子pending→running单占用，模型save/更新/删除在运行中加条件保护；两项真实Mongo旧快照复现转为拦截源变更，保存/删除/重复占用也通过。常规异常回pending重试，硬中断不超时抢占，5分钟占用投影健管工作台。连续HTTP、14项回归和构建通过；硬中断安全恢复/错误提示仍待，继续阻断上线，未部署。

> 2026-09-20关键未通过：隔离真实Mongo确定性插入时序复现两项旧快照缺陷——队列读取后撤销审核/更改关联，旧项目仍completed，撤销场景甚至sync completed。新增reportPlanItemStaleWorker.js退出1并保留合成证据。这是上线阻断，不是通过；需来源版本与项目写入的持久互斥/一致性修复，不能仅前后再查一次。未部署、未改生产。

> 2026-09-20项目更正页面通过：同方案候选过滤、理由及明确确认已接，真实隔离浏览器提交合成报告成功，刷新显示正确目标/已完成回写/持久理由。13项回归及员工构建通过；pending/conflict仅渲染回归，跨文档旧回写竞争仍待，不是完整真实AI闭环，未部署。

> 2026-09-20关联更正竞争验证：真实隔离HTTP双窗口同时选不同项目，仅一个200/一个409，单条审计且仅胜出项目完成；持久意图后目标被其他报告占用，恢复保留原证据并记conflict。完整报告项目API脚本复跑通过。尚未覆盖旧回写与改关联同时发生等全部跨文档竞争；更正页面仍待，未部署。

> 2026-09-20同方案项目更正API通过：冲突报告可由所属健管凭token/理由重选同客户同方案待完成且未绑报告的项目，持久意图后复用回写；原项目不改、原/新关联留审计。真实隔离HTTP权限/跨方案/占用/重放通过，10项回归通过。更正页面及跨文档并发仍待，跨方案/跨客户更正未开放；未部署。

> 2026-09-20冲突核对页面通过：健管从本人工作台打开合成报告，填理由并明确确认后保存；刷新仍保留结论/原项目已跳过，工作台24→23，其他提醒未清除。10项回归、员工端1897模块构建通过。仅保留现状处置，错误关联重选仍待；非真实AI/完整闭环，未部署。

> 2026-09-20冲突核对接口通过：所属健管可凭当前token和理由确认保留原项目状态，仅销除对应关联冲突提醒，不改项目/报告内容；追加保留处理凭据，重复审核同关联不重开。真实隔离HTTP权限/版本/理由/重复提交及提示消退通过，8项回归通过。页面入口与重选关联仍待，非完整闭环；未部署。

> 2026-09-20报告项目冲突进入健管工作台：只读投影原报告conflict，不新建任务；按本人客户过滤并归入报告与资料。实际API验证本场景6条唯一提示、顾问/未分配健管不接收；连续链/故障恢复重跑、7项回归及员工构建通过。处理销项入口和页面操作仍待，未部署生产。

> 2026-09-20报告项目恢复机制：新审核同文档保存planItemSync意图，立即尝试及既有每日扫描只处理pending；失败保留重试，冲突/撤销停止，不扫描历史未标记报告。两类真实Mongo故障注入恢复、连续HTTP及11组审核场景通过，7项回归通过；冲突工作台提示仍待，非完整闭环，未部署。

> 2026-09-20项目级连续API验收通过：同一合成方案两项经真实上传/补传、两种审核入口，健管与顾问checkup-progress均2→1→0，重放不重现待办或改写完成时间；原体检7服务任务仍零残留。仅合成方案/报告输入，未验证真实AI、临床或收费服务；自动失败补偿仍待，未部署。

> 2026-09-20报告上传关联加固：上传前核对同客户有效方案/项目，回填reportId改原子条件更新，不覆盖已绑定报告；补传空记录限定同方案项目、未审核且无内容/文件。隔离真实上传边界与两审核入口11组通过，4项回归通过。仅合成资料，非真实AI/完整闭环；自动补偿仍待，未部署。

> 2026-09-20补齐AI结果审核项目回写：常用报告编辑审核入口在已保存且audited时复用同一原子完成器，草稿/驳回重提不完成。两入口11组隔离真实HTTP通过、10项回归通过；仅合成报告输入，不是真实AI验收。隔离后端92556，未部署；自动故障补偿、上传关联归属及其他端入口仍待核查。

> 2026-09-20报告项目回写加固：报告审核保存后按同客户/同项目/待完成及原报告归属原子更新，重复审核保留完成时间、不覆盖跳过项。独立虚构客户5组真实审核API通过，13项回归通过；原体检7任务零残留。隔离后端已重启加载陪同日期补丁，陪同API场景尚待。无生产修改，故障自动补偿和全闭环仍待。

> 2026-09-20同次分组浏览器通过：fvvTxL显示本次1/既往0、方案2份、任务7/报告1，准备入口保留；修复结构化one_stop服务误标单独体检，浏览器已显示体检一站式服务，9项回归通过。准备项目需报告planItemId独立证据，未清零缺项。陪同日期专项已由用户单独授权发布生产1b0d007c，闭环仍未发布。

> 2026-09-20陪同就医日期热修：escortTime为自由行程文字，不能直接拼Date；新增medicalEscortSchedule严格校验主日期，单时刻精确排期、说明/区间按主日期零点锚定且原文保留，不猜上午下午。三订单日期共用有效结果；34项回归含真实Order模型日期校验通过（无创建订单/DB写入）。仅功能分支修复，尚未生产部署，若发布须仅提取专项补丁，禁止夹带闭环功能。

> 2026-09-20同次体检分组修复：患者方案API只读投影唯一同客户承接checkupServiceId，页面按明确服务关联归组，准备方案不再作为另一次既往体检；保留本次准备入口及项目独立核对。8项回归/员工端构建、隔离真实API关联和7任务零残留通过；新分组页面待浏览器复核，缺项/报告解读待办未隐藏，未部署。

> 2026-09-20浏览器复核：fvvTxL顾问实际登录，体检管理显示本次已完成、7任务/1报告，完成展示通过。但准备方案仍0/1且误列既往体检，首页仍体检方案待完成；需核查准备方案项目与报告匹配及同次归组，不能自动抹平缺失证据。前端改IPv4回环恢复访问，生产未动。

> 2026-09-20体检进度显示修复：按本方案/显式serviceInstanceId归集任务报告，不再按名称混入其他年度；已完成/取消优先于推送状态，本阶段任务优先于等待客户确认。6项展示/路由回归通过，页面仍待复核。报告待解读有独立familyDoctorViewedAt凭据，不随服务关闭伪造已读；未部署。

> 2026-09-20全新标准隔离场景复跑：真实客户问卷/双岗准备/服务发布承接/预约陪检/报告审核/顾问评估/规划师验收API通过，原健管随访完成；7条服务任务无残留，四岗位service-tasks均空，重复验收不新增或重写完成时间。输入及报告/履约仍模拟，无真实AI/收费核销；非全部闭环验收。未改生产。

> 2026-09-20收单回写修复：原年度准备承接复用规划师/设计/预约同源凭据，完成唯一service:intake，不新增操作；保留人工完成、缺凭据/改派/重复拦截。隔离真实激活API重放两次通过，残留从2条降为旧abnormal_followup 1条，49项相关回归通过。旧条件任务未删除，全闭环仍待；未部署生产。

> 2026-09-20隔离目录调整：闭环功能分支移至 C:/Users/huawei/Documents/codex/health-management-isolated，原deploy-health-monitoring-7630c892保留生产master，禁止切换影响另一任务。医保补丁已独立发布d3ca572e，不代表闭环上线。隔离五岗位API冒烟通过；只读审计发现已关闭服务仍有service:intake和旧误派abnormal_followup两项planned，未删除或伪造完成，完整闭环仍未通过。

> 2026-09-20专家约诊补医保：新建及约诊审核编辑增加medical_insurance，后端请求白名单、交接文本和编辑解析同步支持“医保”；保留自费/高端险原逻辑，不改历史记录或报销规则。32项相关测试通过，未部署生产；同工作区健康基金等其他修改不纳入本次提交。

> 2026-09-20规划师最终验收页面通过：从本人工作台填写隔离模拟结论后，真实API关闭服务/承接并自动完成唯一原健管年度体检随访，数据库完成凭据ID齐全，页面详情已完成。修正验收页误用代办核验标题。无收费订单、模拟报告/结论，非真实AI或全量闭环；旧错误条件任务和收单重复待办仍待核查，未改生产。

> 2026-09-20条件误派修复：ensureCheckupTasks固定链补建排除conditional及非六个固定阶段，避免预约等推进时提前产生异常审核。独立随机Mongo库验证六节点/重放同ID/无条件任务通过；扩大回归288/289通过，余为已知V15断言失败。旧VmyQ9g错误任务保留，后端待受控重启、标准全页面及真实AI/收费核销仍待；未改生产。

> 2026-09-20顾问结果评估页面已实际提交：新增独立评估/最终验收结论表单，不继承上环节清单、不重复输入；真实隔离库确认原评估completed、结论准确保存、原规划师验收解锁。8项针对回归及员工端构建通过。最终验收页面、条件异常待办及真实AI/收费核销仍待，不是完整闭环；未改生产。

> 2026-09-20报告审核页面通过并解锁原顾问任务；发现顾问结果评估待办误跳AI方案生成，已按workflowStageKey及旧明确设计名称收窄，浏览器验证打开原任务。当前评估表单却沿用了报告回收清单，尚未提交，待修；条件异常审核还未触发却出现阻塞待办，需核查。未改生产。

> 2026-09-20标准页面推进：就医专员从工作台完成模拟陪检，健管从工作台关联模拟报告并完成回收；真实库确认原报告回收completed、未审核报告仍阻止顾问评估/最终验收。修正回收页面误称最终收尾/完成闭环的文案，不改业务门槛；标准审核及验收页面仍待，未改生产。

> 2026-09-20标准问卷正向验收通过：新隔离场景真实客户问卷提交后发布/承接/启动成功，无customer员工任务、无重复派单；规划师从工作台实际表单提交模拟预约，原陪检解锁且交接信息一致。后续标准陪检/报告/验收页面仍待，未改生产。

> 2026-09-20客户前置修复：体检发布不再把customer节点转员工待办；发布/承接核验本次问卷分配与客户提交凭据，缺配置/凭据409。真实隔离API已验证缺绑定拒绝且不改旧任务，280项回归通过；有效问卷提交后的标准模板正向链路仍待实跑，未迁移旧错误任务、未改生产。

> 2026-09-20标准模板隔离实测未通过：新随机库重跑双岗准备通过，但八节点标准配置发布后，将customer健康文件节点错误指派给顾问，准备承接被此前置409阻断。保留现场与错误证据，未跳过/伪造完成、未改生产；六节点已通过结果不能外推标准模板。接续见 `docs/ISOLATED_ACCEPTANCE_SESSION.md`。

> 2026-09-20隔离页面验收：补原健管随访只读自动完成依据，凭完整服务/承接/评估/验收ID才展示，不伪造人工执行记录、不新增待办；真实健管浏览器已展开核对。266项相关回归及员工端构建通过，标准模板全岗位办理/核销/真实AI仍待验收，未改生产。

> 2026-09-20隔离关闭验收：真实API已通过报告审核解锁、顾问结果评估、规划师验收、服务关闭及唯一原健管随访完成，重复验收不重复派单/回写；浏览器健管页面确认原年度体检提醒已随访。修复前端content与接口executedContent校验/保存不一致的实际阻断，264项回归通过。资料与履约结论为模拟、无收费订单，非真实AI/支付核销/全岗位页面完整验收；未改生产。

> 2026-09-20隔离服务验收：模拟六节点配置经真实服务创建函数、发布/关联/启动API，承接唯一且未重复建任务；预约及陪检完成已流转至报告回收。真实接口发现并修复重复完成上游重开下游任务，8项防重回归通过。报告审核至最终关闭及全岗位页面仍待验收，非完整真实AI/支付闭环；未改生产，接续见 `docs/ISOLATED_ACCEPTANCE_SESSION.md`。

> 2026-09-20自动接续：双岗准备真实HTTP路径通过（初始年度/模板为模拟输入），重复确认不重复派发、越权403、审核发布及客户确认门槛通过。修复准备完成后待承接工作台入口缺失，只读投影复用原任务，规划师浏览器已验证。253项测试与员工端构建通过；尚无服务实例，承接至最终关闭仍待验收，未改生产。脚本/运行接续见 `docs/ISOLATED_ACCEPTANCE_SESSION.md`。

> 2026-09-20自动接续：建立可登录隔离后端/五岗位/虚构客户，真实登录/工作台/随访API通过，浏览器发现并修复AiCaseReviewPanel顶层变量/Hook白屏；顾问页面登录通过。251项相关测试通过。完整服务闭环及其他岗位页面尚未验收，未接生产；运行入口和进程接续见 `docs/ISOLATED_ACCEPTANCE_SESSION.md`。

> 2026-09-20：新增STARTUP_SCHEMA_WRITES_ENABLED=false跳过启动自动索引/旧索引迁移，STARTUP_BACKGROUND_JOBS_ENABLED=false跳过listen回调后台任务，默认不变；247项相关测试通过，未部署。不是只读模式，API及模块导入副作用仍须核查；隔离fixture不是登录账号，多岗位页面验收待完成，见 `docs/STARTUP_SAFETY_CONTROLS.md`。

> 2026-09-20：隔离虚构客户/三岗位fixture已建立，实际服务期与岗位归属/到期拦截测试新增，真实Mongo测试9项通过；不是可登录账号或全链路验收。上线审核见 `docs/HEALTH_MANAGEMENT_ROLLOUT_REVIEW.md`：分支相对生产181文件（8fd97281基线），启动副作用不能仅靠体检开关禁用；完整结构审计、启动控制及多岗验收仍待完成。未部署、未改生产。

> 2026-09-20生产只读核查完成：仍为8fbda1cd，Mongo7.0.34 standalone，自动准备派发关闭；followups派发唯一索引及新体检承接/建议集合缺失。指定客户排除归档后唯一，但历史已确认方案不在准备窗口且无新承接，不能直接做新链路验收，不修改真实日期或造单。无生产写入；下一步部署/结构变更清单另行确认，详见 `docs/CHECKUP_PRODUCTION_PREFLIGHT.md`（不含客户身份数据）。

> 2026-09-20：用户授权本地隔离MongoDB后，官方7.0.34便携包校验通过，127.0.0.1:27134 standalone真实测试7项通过：20路双岗派发、20路核销单次扣减、退款竞争、缺索引及半成功恢复。默认模型连接也隔离到随机测试库，复跑无延后同步告警。验收后关闭本地进程、保留测试数据；未接生产、未部署/启用。版本架构对齐但Windows不同于生产Linux，真实业务/多岗端到端仍未通过，详见 `docs/CHECKUP_LOCAL_MONGO_ACCEPTANCE.md`。

> 2026-09-20验收：扩大回归503项中502通过，仍为既有V15门诊迁移断言1项失败。新增仅连接127.0.0.1随机测试库的真实MongoDB派发并发脚本；实跑因本地27017拒绝连接受阻，未创建数据、未通过真实数据库验收。环境要求与范围见 `docs/CHECKUP_LOCAL_MONGO_ACCEPTANCE.md`。未部署，自动派发仍关闭。

> 2026-09-20：体检双岗准备派发已接确认同步/每日扫描，仅 CHECKUP_PREPARATION_AUTO_ENABLED=true 后首次确认写入意图，历史已确认不回填；默认关闭。复核可信服务期/14天窗口/岗位，实际唯一索引缺失拒绝派发，半成功每日补齐，缺岗/冲突进入工作台。243项相关测试及员工端构建通过，未部署/启用；真实索引、改期/并发及多岗位验收仍必需。

> 2026-09-20：原订单核销入口已可自动关联唯一已验收未核销的体检承接，记录服务/承接/验收ID并按版本原子扣次；多次订单只回写本次服务与健管随访，保留余次。236项相关测试通过，未部署。多个候选或多子项目仍拦截待明确选择；历史核销不猜测补关联，真实数据库/绩效故障恢复、准备自动派发仍待验收或补齐。

> 2026-09-20：显式体检承接最终验收改走安全完成器，以已完成原验收为持久意图，恢复服务关闭及单次订单关闭的中断；版本/状态/退款/核销冲突不覆盖，正常未验收不关闭。220项相关测试通过，未部署。已确认多次核销记录无具体服务实例ID，不能推断本次核销；多次关联及缺失来源兜底/自动准备派发仍待补。

> 2026-09-20：体检承接失败/完成回写异常已投影到规划师工作台，超管可核对改派问题；同一承接仅一条待办，直接打开原准备卡片，不新建任务。增加受权限/当前客户归属保护的完成重试。215项相关测试及员工端构建通过，未部署；服务/订单关闭中断自动恢复、多次核销、缺失准备来源的异常兜底和准备自动派发仍待补。

> 2026-09-20：新增体检最终验收至年度健管随访回写，精确年度/冻结排期、原顾问评估与验收结论、服务完成及单次订单核销校验；同文档完成凭据、每日补偿、原准备卡片显示结果。211项专项和员工端构建通过；扩大回归464项中463通过，1项原有V15门诊迁移静态断言失败（基线同样缺少断言文本）。未部署；多次订单单次核销、异常工作台汇总及准备自动派发仍待补，见 `docs/ANNUAL_CHECKUP_PREPARATION.md`。

> 2026-09-20：独立体检准备报告回流已接精确承接：本次回收完成、清单报告全部审核且明确关联本准备/服务后，仅解锁既有顾问结果评估任务；启动/每日游标扫描补偿，不调用AI、不新建任务。189项相关回归通过，未部署；最终验收至健管随访回写、自动准备派发和真实数据库验收仍待完成，见 `docs/ANNUAL_CHECKUP_PREPARATION.md`。

> 2026-09-20：具体体检承接已接原预约任务激活：复核有效已发布服务、订单、准备证据及原节点/岗位，原设计节点复用准备结果完成，原预约节点进入办理，不创建任务/订单。持久运行token、任务同文档凭据及部分失败恢复；未部署。选定回归538项及激活12项复跑通过，员工端构建通过；报告回流/最终完成回写、自动准备派发及真实索引/数据库验收仍待完成，见 `docs/ANNUAL_CHECKUP_PREPARATION.md`。

> 体检准备新增规划师选择具体既有服务及持久关联（仅linked_pending_activation）：核对同客户/日期/有效订单或员工发起凭据、未执行、未占用；方案_id与服务唯一索引防重复，运行时只核验索引不创建。530项主回归及新增2项并发补测通过，员工端构建通过；未部署，索引待核验，预约解锁/结果回流/自动派发未接，不能称服务已启动，见 `docs/ANNUAL_CHECKUP_PREPARATION.md`。

> 体检双岗准备已补只读汇合校验及卡片：按冻结排期精确配对，复核可信服务期/当前归属/日期、有效审核发布方案、客户本次确认及资源凭据，不能只凭completed放行。516项回归及员工端构建通过，未部署；实际服务选择关联、预约解锁、自动准备派发仍未接，旧服务隔离不解除，见 `docs/ANNUAL_CHECKUP_PREPARATION.md`。

> 目标再次确认：方案至服务落地闭环，AI承担资料整理/建议/归纳，确定规则负责流转/去重/提醒，人工仅必要审核、沟通与实际履约；标准化流程/岗位/证据/异常，不一刀切客户内容。本批新增准备草稿同文档自动入队意图及后台加项，复用启动/每日扫描恢复，不回填旧草稿、不自动重试失败。500项回归及员工端构建通过，未部署；双岗汇合/预约承接/任务派发仍待接，见 `docs/ANNUAL_CHECKUP_PREPARATION.md`。

> 体检准备AI加项已接员工方案页与持久生成记录：按方案_id占用、失败显式重试、管理员确认中断恢复；来源重新核验后，所选项目与审核凭据同文档原子保存，不重复加项。492项回归及员工端构建通过；当前需顾问点击生成，尚非自动队列，双岗汇合/派发未接、未部署，见 `docs/ANNUAL_CHECKUP_PREPARATION.md`。

> 体检准备AI加项新增纯输入/输出校验模块：同客户有效终审评估/已审核报告、模板加项白名单、来源引用及输入指纹；无资料/候选不调用AI，失败不重试或伪造结果。473项回归通过；尚未接持久队列/API/页面，不是自动加项已启用，未部署，见 `docs/ANNUAL_CHECKUP_PREPARATION.md`。

> 体检准备新增独立标准模板草稿入口，自动关联任务，确定性_id防重复/关联失败恢复；不可变preparationTaskId隔离客户确认和旧服务回退。461项回归及员工端构建通过，未部署/派单；准备模式AI加项、双岗汇合与正式服务承接仍未接，不能直接解除隔离，详见 `docs/ANNUAL_CHECKUP_PREPARATION.md`。

> 体检准备工作台办理与证据回写已接（未启用派单）：顾问关联草稿后原方案审核发布自动完成，规划师保存沟通资源结果完成；通用编辑/清理不能绕过。448项回归及员工端构建通过。原体检生成器会建立服务实例，下一步先拆纯准备新建入口，再接双岗汇合、去重与自动派发；未部署，详见 `docs/ANNUAL_CHECKUP_PREPARATION.md`。

> 年度体检已补14天窗口及双岗位候选规则（未接派发/工作台），并修复每日扫描按标题误改派其他岗位的风险。419项回归通过，未部署。下一步接实际准备业务证据、工作台及原体检流程汇合；不得直接开启候选派单，清理器/改期/幂等/历史边界见 `docs/ANNUAL_CHECKUP_PREPARATION.md`。

> 收尾总表见 `docs/HEALTH_MANAGEMENT_ACCEPTANCE_STATUS.md`，不能再称全链路已完成。生产只读核验：版本8fbda1cd、MongoDB7.0.34 standalone，不支持改期事务，新增集合/派发唯一索引尚未建立，自动阶段评估关闭；未改生产。手动新评估已接可信服务期及正确总评起点。下一关键缺口：年度体检前14天顾问+规划师并行准备、阶段评估生成队列及全工作台一致性审计。

> 已派发待执行固定事项增加顾问显式审核改期：凭据、日期覆盖层、随访/服务需求和审计在多文档事务内提交，已开始/已关联不改，失败整批回滚。需真实数据库事务能力验收，不自动改数据库架构，未部署。同步不再抢占运行中尝试，进程中断需管理员确认旧进程停止后恢复；详见 `docs/ANNUAL_ISSUED_SCHEDULE_CORRECTIONS.md`。

> 续约更正支持顾问修订尚未派发的固定日期事项：原年度方案不解冻，日期修订与凭据同文档生效，随访/服务需求共用新日期和原派单键。375项回归及员工端构建通过，未部署。已派发记录改期、相对周期修订及真实多岗位/数据库并发仍待补，见 `docs/ANNUAL_SCHEDULE_AMENDMENTS.md`。

> 续约更正已增加“保留原排期”的安全应用：顾问明确确认后自动尝试，失败每日/原重试入口恢复，越界/凭据异常进岗位工作台；同文档版本原子保存生效字段和原版本，冻结执行起点，历史订单稀疏唯一保留。361项回归及员工端构建通过，未部署。真实MongoDB/跨集合并发及需要改变冻结排期的更正仍待补，见 `docs/ANNUAL_SERVICE_PERIOD_CORRECTIONS.md` 最新一节。

> 更正权限已确认：规划师提交凭据更正、顾问审核排期影响，保留原版本及执行记录。本轮完成申请/影响快照/审核退回/撤回/工作台及版本审计，347项回归和员工端构建通过；审核后仅 `approved_pending_apply`，尚不替换生效凭据、不调整任务，下一步安全应用，见 `docs/ANNUAL_SERVICE_PERIOD_CORRECTIONS.md`。未部署。

> 自动阶段评估及年度来源补给的新周期已接可信服务期；旧年度不借续约权益继续派单，保留已启动履约和人工暂停。332项回归通过，未部署；更正权限待业务确认，手动评估/其他周期入口及真实联调仍待补，见 `docs/ANNUAL_PERIODIC_SERVICE_GATES.md`。

> 续年派发异常已按规划师/顾问进入工作台，支持不重复确认的重试；新续年任务/用药/补给承接增加稀疏唯一派发键、真实索引就绪检查和尝试ID写回保护。305项回归及员工端构建通过，未部署；真实MongoDB并发及冻结后更正仍待验收/补齐，见 `docs/ANNUAL_RENEWAL_RECOVERY.md`。

> 客户端访问锁、用户AI权益有效期及血压/体重监测已接可信续约期；不改原档案，保留用户主动关闭，到期仍可查看/确认续年方案。293项回归通过；其他周期任务及真实多岗位验收仍待补，未部署/提审，详见 `docs/ANNUAL_SERVICE_PERIODS.md`。

> 续约依据已确认为“已支付年度服务订单；线下合同由所属健康规划师核验补录”。功能分支新增可信凭据、服务期门槛及工作台入口，244项回归通过；未部署。客户端旧到期锁、退款后续处置及并发验收尚未闭环，见 `docs/ANNUAL_SERVICE_PERIODS.md`，不可只改档案日期视为续约。

> 年度总评已接下一年度准备与 AI 草稿来源：续年必须引用上一已确认方案的顾问终审且已归档总评，不重复首次会诊门槛。216 项回归通过，尚未部署；合同服务年度、续约激活和自动生成未闭环，见 `docs/ANNUAL_PLAN_CONTINUITY.md`。

> 阶段评估归档已增加 `archive_pending` 持久状态及对应岗位工作台重试：冻结审核快照、保留原审核人、来源唯一档案和并发完成保护；旧历史缺档未迁移。207 项回归及未上线边界见 `docs/PHASE_ASSESSMENT_ROUTING.md`。

> 阶段评估已按综合、营养、运动、药食同源分流审核及工作台，保留旧营养路径；自动扫描默认关闭。197 项回归及归档补偿/年度衔接等未完成边界见 `docs/PHASE_ASSESSMENT_ROUTING.md`，未部署生产。

> 病历/报告审核保存已接入独立随访草稿队列，顾问审核后才派发；来源排除、修订、内部任务隔离和未部署边界见 `docs/REPORT_FOLLOWUP_AUTOMATION.md`。

> 后续会诊/专项评估已接入自动随访草稿队列（仅待审，不自动发布）；年度输入不另派动态任务，修订保留版本。每日恢复、AI失败人工接管和后续边界见 `docs/ASSESSMENT_FOLLOWUP_AUTOMATION.md`。

> 功能分支新增管理随访与既有服务关联及状态回写，岗位入口、异常重选和上线核验见 `docs/FOLLOWUP_SERVICE_LINK.md`；未关联的既有专用流程保持原分派规则。

> 动态随访功能分支：专业评估草稿审核发布、逐条幂等重试和工作台入口的当前能力及未完成项见 `docs/DYNAMIC_ASSESSMENT_FOLLOWUPS.md`；尚不能视为全自动闭环或生产已上线。

> 2026-09-19：用户确认推送多商品勾选后一次微信付款，模型/退款/积分/发布边界见 `docs/PUSH_GROUP_PAYMENT_20260919.md`；一张 Payment 分摊多个独立订单，不能将整笔金额写到每个子订单。

> 2026-09-19：营养实物订单付款话术及实付积分核对见 `docs/NUTRITION_ORDER_COPY_20260919.md`；按订单类型区分发货和预约，不改历史消息/余额，话术修改不等于仓库履约配置已修改。

> 2026-09-19：小程序登录可拒绝、推送支付结果确认和健康管家未读一致性修复见 `docs/MINIPROGRAM_REVIEW_FIX_20260919.md`；发布时核对实际上传构建，不能把主干修复等同于已进入某个审核版本。
> 同日回归：1.0.167 已上传但未部署配套后端；问卷档案预填 flatMap 格式错误导致线上 500，消息页全成功门槛放大为空列表。修复需前后端配套发布，不能清历史数据消红点；详情见同文档“1.0.167 回归修复”。

> 2026-09-18：健康管理闭环总体方案已由业务确认，后续年度综合健康评估、专业健康评估、年度方案、统一工作台、动态随访、阶段性评估、年度总评及专业服务流转均以 `docs/HEALTH_MANAGEMENT_CLOSED_LOOP_BLUEPRINT_2026-09.md` 为开发和验收基线。

> 2026-09-12：AI 用量管理已先同步 GitHub 再部署，功能版本 `edc7eab6` 生产验收通过；默认限额、首次发布异常及后续验收见 `docs/AI_USAGE_CONTROL.md`。


> 2026-09-12：医学影像页原文校验已部署（代码 `fb86e2b2`）；行为、验证与历史数据边界见 `docs/OCR_IMAGE_EVIDENCE.md`。

> 家庭服务助手（2026-09-09，首版已部署，企微待配置）：功能与企微接入边界见 `docs/SERVICE_GROUP_ASSISTANT.md`。消息桥接接收器不能被当作已经连通官方会话存档。

> 同步日期：2026-07-29
> 来源：根目录及各子项目 `CLAUDE.md`、已跟踪的 `.claude/launch.json`。本节是两端共享的稳定记忆；更详细的历史与页面清单仍查阅对应 `CLAUDE.md`。

## 记忆维护规则

- 本项目长期同时使用 Codex 与 Claude Code；`AGENTS.md` 与 `CLAUDE.md` 都必须保留。Claude Code 也必须读取本节，禁止把这里视为 Codex 私有配置。
- 新的跨项目约定、部署变化、关键业务流程和已确认遗留问题，应同步维护到两边入口文件。
- 子项目细节以该子项目 `CLAUDE.md` 和当前代码为准；发现文档冲突时，以当前代码、根目录最新说明和实际验证结果为准，并修正文档。
- 不删除 `.claude/`、Claude 历史说明或 Codex 协作说明，除非用户明确授权。
- 密钥、密码、服务器凭据只放环境变量或本机未跟踪配置，不写入仓库。
- 所有核心开发、测试和部署命令必须能在 Windows PowerShell 下从仓库根目录执行。
- 核心流程只能依赖仓库脚本、标准命令和环境变量；不得依赖 Codex/Claude 任一端的私有记忆、私有插件或机器绝对路径。
- 新机器迁移时只允许重新安装通用运行时并注入未跟踪凭据，不应重新设计启动、测试或部署流程。

## 当前系统边界与本地端口

本仓库有 5 个应用端，共用一个 Node.js 后端和 MongoDB：

| 模块 | 技术栈 | 本地入口/方式 |
|---|---|---|
| `backend/` | Node.js + Express + Mongoose | API `http://localhost:3000` |
| `admin/` | React + Vite | 项目配置默认 `http://localhost:5175`；旧 `.claude` 启动配置记为 5173，修改端口时同时检查 CORS |
| `staff/` | React + Vite | `http://localhost:5174` |
| `app/` | React Native + Expo | Web 调试 `http://localhost:8081` |
| `miniprogram/` | Taro 3.6.32 + React 18 | 无独立 HTTP 端口；构建 `miniprogram/dist/` 后用微信开发者工具 |
| MongoDB | MongoDB | `mongodb://127.0.0.1:27017/jiayicare` |

- `admin`、`staff`、`app`、`miniprogram` 共用 `backend` API。
- 本地前端必须使用后端 CORS 白名单内的 `localhost` 地址；不要混用 `127.0.0.1` 页面来源。
- `app/.claude/launch.json` 里的 `node server.js` 已过时；当前后端入口是 `backend/src/index.js`。

## 当前关键业务流程

- 体检报告实行“只上传、不自动识别”：
  `用户上传 → 健管首页 report_parse 待办 → 专门触发 AI 解析 → 待审核 → 审核通过 → 用户端可见`。
- 未解析显示“待解析”，解析中显示“解析中”，不得提前显示“待审核”。
- 药物/营养素审核：
  健管专员/就医专员手动新增为 `pending`；药物由家庭医生审核，营养素由营养师审核；本人及超管录入直接生效。
- AI 健康分析和风险评估仅家庭医生可生成，健管人员只能查看；前端隐藏与后端鉴权都必须保留。
- `PUT /user/me` 对 Mixed 数组字段使用原生 driver：
  `User.collection.updateOne(...)` 后重新查询；不要改回 `findByIdAndUpdate`。
- 弹窗内错误必须显示在弹窗内部；不要依赖可能被弹窗遮住的 toast。
- 多次服务必须按“一个订单 + 多次服务权益”建模：订单保存购买规格、总价、总次数和已用次数；每次服务单独核销并保留人员、时间和备注，最后一次核销后订单才自动完成。禁止直接把多次服务整单标记完成。
- 嘉医管家面向大众：首页展示 Admin 已上架且排序靠前的常用服务，底部主导航设商城；上传报告保留在健康档案内。
- AI健康分析与AI风险评估是服务包权益，仅健康预防/健康护航年度计划默认拥有；Admin 可在会员设置→服务包配置权益，后端生成接口必须强制校验，不能只靠前端隐藏。
- 会员软删除必须把原手机号保存到 `archivedPhone` 并释放 `phone/contactPhone` 唯一登录号；恢复前检查号码是否已被其他有效档案使用，禁止抢占。

## App 与小程序同步原则

- `app/` 与 `miniprogram/` 面向同一用户群体，新增字段、交互或 API 时必须评估双端同步，不能静默分叉。
- 能接真实 API 时不用假数据占位；平台机制不同则做合理适配，并在代码注释和文档中说明。
- 微信网页授权与小程序登录不可混用：
  - App/网页：`POST /auth/wechat`，字段 `User.wechatOpenid`。
  - 小程序：`POST /auth/wechat-mp`，字段 `User.wechatMpOpenid`，环境变量 `WECHAT_MP_APPID/WECHAT_MP_SECRET`。
- 小程序正式 AppID 记录为 `wx50062146332b1b20`；AppID 变更必须同时更新源码 `miniprogram/project.config.json` 与服务器环境变量。
- 小程序禁止手改 `miniprogram/dist/project.config.json`；只改源码配置后重新构建。
- `npm run dev:weapp` 的 watch 模式有已知 `react-jsx-runtime` 崩溃问题；使用 `npm run build:weapp` 后在微信开发者工具中重新编译。
- 小程序不是网页，不能部署到 Nginx；构建后需微信开发者工具上传、公众平台提审并人工发布。

## 部署约定

- 提交、认证、部署和失败处理的完整标准流程见 `docs/DEVELOPMENT_WORKFLOW.md`；Codex 与 Claude Code 均必须遵循。
- 生产环境：阿里云 ECS `121.40.156.39`，SSH `root@121.40.156.39`。
- 线上入口：
  - App：`https://jiaycare.com`
  - Admin：`https://admin.jiaycare.com`
  - Staff：`https://staff.jiaycare.com`
  - API：`https://jiaycare.com/api`
- 主部署路径由本地 `python scripts/deploy.py` 发起，默认通过 SFTP 上传当前 commit 的 Git bundle；阿里云不连接 GitHub：
  - 全量：`python scripts/deploy.py --push`
  - 仅后端：`python scripts/deploy.py --push --backend`
- `--push` 只接受已提交且干净的 `master`；脚本不会自动暂存或提交。
- `--github-source` 仅为备用模式，只有确认阿里云到 GitHub 网络正常时才使用。
- 服务器前端目录：`/var/www/jiayicare/{app,admin,staff}/dist`；PM2 后端进程：`jiayicare-backend`。
- 部署后至少验证 API 健康检查，并分别确认 App、Admin、Staff 静态站点可访问。

### 本机认证与部署历史（2026-07-30补充）

- 本项目此前已经多次成功部署到阿里云，生产环境及 `scripts/deploy.py` 主部署链路均为既有可用配置；新会话里认证环境变量为空，不代表项目从未部署或服务器尚未配置。
- SSH 密码、私钥内容和具体密钥材料不得写入仓库记忆。遇到 `JIAYICARE_SSH_PASSWORD` / `JIAYICARE_SSH_KEY_PATH` 未设置时，应先检查既有本机安全配置、终端会话环境或由用户重新注入认证，再继续部署。
- 不得自行猜测私钥路径、创建新凭据或要求把密码写入项目文件；认证恢复后仍使用 `python scripts/deploy.py --push`（或代码已推送时使用 `python scripts/deploy.py`）。
- 2026-07-30 本批优化提交为 `7d75f99`，已推送 `origin/master`；当时因当前 Codex 进程未继承 SSH 认证变量，阿里云部署未在该次操作中完成。继续工作时先核对线上 commit，再决定仅部署该提交还是已有后续版本。

## 测试账号约定

- 用户端演示：`13800138000` / 验证码 `123456`。
- 管理与医护测试账号：`superadmin`、`jy_super`、`jy_hm`、`jy_fd`、`jy_ns`、`jy_ma`、`jy_hp`、`jy_tcm`、`jy_rb`。
- 仓库不得保存账号密码。非生产环境通过 `BOOTSTRAP_ADMIN_PASSWORD`、`SEED_DEMO_ACCOUNTS=true` 和 `DEMO_ACCOUNT_PASSWORD` 初始化；已存在账号不会被自动重置。

## 已知遗留

- 聊天模块重构暂缓，消息撤回搁置。
- AI 审核权限仍需覆盖药物、营养素、检查开单、就医协助等剩余 `aiStatus` 写入链路。
- 小程序仍有简化项：用药新增/停用、随访分类和表单、提醒新增/分类、反馈历史、订阅消息。
- 小程序 Tab 图标仍是占位 PNG，上线前需替换正式设计资源。
- OSS 试用记录约于 2026-10-12 到期，临近日期需要复核续费或迁移方案。

---

# 当前进度（每次切换账号时更新）

> 更新时间：2026-07-12

## AI 工具双端兼容约定

- 本项目长期同时使用 Codex 与 Claude Code，所有项目结构、脚本和说明必须保证两端都可继续使用。
- `AGENTS.md` 是 Codex 的入口说明，`CLAUDE.md` 是 Claude Code 的入口说明；两份文件都必须保留，关键项目约定应同步更新。
- 不引入只能依赖某一端私有能力才能完成的核心开发、测试或部署流程；必要的密钥和机器配置统一通过环境变量或本机未跟踪配置提供。
- 不删除 `.claude/`、Claude 相关说明或历史记忆文件，也不删除 Codex 的协作说明，除非用户明确授权。
- 任何目录迁移、命令调整或自动化改造，都要验证 Windows PowerShell 下两端从仓库根目录可以执行。

## 最近做了什么（2026-07-12 医护端一批，9次部署）
- 药物/营养素审核流：健管专员/就医专员手动新增置pending→药物家医审、营养素营养师审；本人及超管录入直接生效；展示录入人/审核人姓名；待审接入首页AiTodosPanel(medication_review/supplement_review)
- 待审记录支持提交人本人撤回删除(withdraw)；营养师"编辑后采纳"越权(403)已修
- AI健康分析/风险评估限家庭医师生成，健管仅可查看(前端隐藏按钮+后端角色兜底)
- 营养干预方案模板支持设"方案说明"标准化内容，创建时预填；位置放名称下方/模板顶部
- 体检报告链路闭环：用户上传→健管首页"体检报告待解析"待办(report_parse)→AI解析→"待审核"→审核通过→用户端可见
  - 报告编辑弹窗加"报告归类"下拉(一级大类，与用户端7类对齐)；医护端上传砍掉二级分类
  - 修复带base64图片报告解析不了(列表-content排除导致误判无文件，改后端聚合返回hasContent)
  - 审核状态列：未解析显"待解析"、解析中显"解析中"，不再误显"待审核"
- AI草稿待审归入首页AiTodosPanel(service_draft_review)+聊天记录自动生成随访草稿
- OSS已接入(3个月试用，约2026-10-12到期)，报告改存URL撑库风险解除

## 下一步
- 金娟真机验收上述改动（尤其报告链路闭环+药物/营养素审核，需切健管jy_hm+家医jy_fd两个角色测）

## 未解决问题
- 聊天模块重构(暂缓)、聊天消息撤回(搁置)
- 金娟"25-羟基维生素D"旧报告：一条无文件(需客户重传)、一条已修可解析
- AI审核权限剩余：药物/营养素/检查开单/就医协助的aiStatus写入流、商城采购自动记录、AI年度体检方案选套餐、转介AI草案未做

---

# JiayiCare Monorepo 完整说明

## 目录结构（4个端）
```
JiayiCare-mono/
├── app/        React Native + Expo 用户端（患者使用）
├── admin/      React + Vite 超级管理后台（运营/超管使用）
├── staff/      React + Vite 医护端（医生/健管师使用）
├── backend/    Node.js + Express + MongoDB API
└── package.json
```

### 各端职责
- **app/**：患者使用的移动端App（健康数据、问诊、服务购买等）
- **admin/**：超级管理员后台（患者总览、订单、服务管理、商城产品管理、健康方案模板、医护账号管理等）
- **staff/**：医护人员工作台（随访、患者管理、服务记录、计划、提成等）
- **backend/**：统一API服务，三端共用

## 部署命令

### 标准部署（改了前端或全部改了）
```bash
python scripts/deploy.py --push
python scripts/deploy.py --push -m "feat: 描述改动"
```

### 只改了后端（跳过前端构建，更快）
```bash
python scripts/deploy.py --push --backend
```

### 只部署（代码已手动 push 过）
```bash
python scripts/deploy.py
python scripts/deploy.py --backend
```

> `--push` 只会推送已经提交的干净 `master` 分支；部署脚本不会自动暂存或提交文件。

> `scripts/deploy.py` 通过 SSH 直连服务器执行部署，实时输出日志，自动验证结果。
> 不依赖 Webhook——Webhook 仍保留作为备份，但不在关键路径上。

## 线上地址
- 用户端 app：https://jiaycare.com
- 超管后台 admin：https://admin.jiaycare.com
- 医护端 staff：https://staff.jiaycare.com
- 后端 API：https://jiaycare.com/api

## 部署架构

```
本地开发
  → git push origin master
    → [备份] GitHub Webhook → 9000端口 → deploy.sh（不可靠，不依赖）
    → [主路径] python scripts/deploy.py
        → 使用本机环境变量或 SSH 密钥连接服务器
        → git fetch + git reset --hard origin/master
        → npm ci --legacy-peer-deps
        → 构建 app + admin + staff
        → pm2 restart jiayicare-backend
        → 验证：后端健康检查
```

### 服务器信息
- 系统：阿里云 ECS，Ubuntu
- IP：121.40.156.39，SSH：root@121.40.156.39；凭据只放在本机环境变量或 SSH 密钥中
- PM2 进程：`jiayicare-backend`（id 0）、`webhook-server`（id 1）
- 前端静态文件：Nginx 托管 `/var/www/jiayicare/{app,admin,staff}/dist`
- 数据库：本地 MongoDB 27017，库名 jiayicare
- 后端配置：`/var/www/jiayicare/backend/.env`
- 部署日志：`/var/log/jiayicare-deploy.log`
- GitHub SSH：服务器 Deploy Key `/root/.ssh/github_deploy`（key id: 152715350）

## 演示账号
演示账号默认关闭。仅在非生产环境显式设置 `SEED_DEMO_ACCOUNTS=true` 和
`DEMO_ACCOUNT_PASSWORD` 后创建；仓库不保存账号密码。

---

## 路由名称（navigation.navigate 用这些名字）
| 路由名 | 文件 | 说明 |
|--------|------|------|
| Main | MainTabs | 底部Tab主界面 |
| Login | auth/LoginScreen | 登录 |
| Onboarding | onboarding/OnboardingScreen | 新用户引导 |
| AddRecord | records/AddRecordScreen | 录入健康数据 |
| HealthReport | records/HealthReportScreen | 健康报告 |
| ReportUpload | records/ReportUploadScreen | 上传报告 |
| Chat | chat/ChatScreen | AI健康助手 |
| Medication | medication/MedicationScreen | 用药管理 |
| Reminders | reminders/RemindersScreen | 提醒设置 |
| ServiceMall | services/ServiceMallScreen | 服务商城 |
| Renewal | services/RenewalScreen | 服务包开通/续费 |
| EditProfile | profile/EditProfileScreen | 编辑资料 |
| AccountSecurity | profile/AccountSecurityScreen | 账号安全 |
| HelpFeedback | profile/HelpFeedbackScreen | 帮助与反馈 |
| NotificationSettings | profile/NotificationSettingsScreen | 消息通知设置 |
| Orders | orders/OrdersScreen | 我的订单 |
| Legal | legal/LegalScreen | 用户协议/隐私/免责 |
| ComingSoon | common/ComingSoonScreen | 即将开放 |

底部Tab：Home（首页）/ Records（健康档案）/ Tasks（随访）/ Messages（消息）/ Profile（我的）

---

## 主题色（import { colors, spacing, radius, shadow } from '../../theme'）
```js
colors.primary      = '#1E6B50'  // 主绿色
colors.background   = '#F2EDE3'  // 暖米白背景
colors.surface      = '#FFFFFF'  // 卡片白
colors.textPrimary  = '#1A2B24'
colors.textSecondary= '#4A6558'
colors.textMuted    = '#8AA89C'
colors.danger       = '#DC3545'
colors.warning      = '#D97706'
colors.success      = '#22A06B'
colors.info         = '#0077B6'
colors.border       = '#E0D9CE'
colors.white        = '#FFFFFF'

spacing: xs=4 sm=8 md=16 lg=20 xl=32
radius:  xs=8 sm=12 md=16 lg=20 xl=28 full=999
shadow:  xs / sm / md / lg / card
```

---

## API 调用方式（app/src/services/api.js）
```js
import { userAPI, recordsAPI, servicesAPI, ordersAPI } from '../../services/api';

userAPI.getMe()                          // GET /user/me
userAPI.updateMe(data)                   // PUT /user/me
userAPI.getDashboard()                   // GET /user/dashboard
recordsAPI.list({ type, days, limit })   // GET /records
recordsAPI.create(payload)               // POST /records
servicesAPI.order(serviceId, note, paymentMethod)  // POST /services/order
ordersAPI.list()                         // GET /orders
```

## Auth（app/src/context/AuthContext.js）
```js
const { user, token, isDemo, loading, updateUser, logout } = useAuth();
```
- `isDemo`：演示用户标志
- `updateUser(newUser)`：更新本地用户状态

---

## 后端路由总览（backend/src/）
```
POST /api/auth/send-code       发送验证码
POST /api/auth/login           手机号登录
POST /api/auth/wechat          微信登录

GET  /api/user/me              获取当前用户
PUT  /api/user/me              更新用户信息
GET  /api/user/dashboard       首页汇总数据
GET  /api/user/report          健康报告

GET  /api/records              健康记录列表 (?type=&days=&limit=)
POST /api/records              创建健康记录
DELETE /api/records/:id        删除记录

GET  /api/services             服务商城列表
POST /api/services/order       下单
GET  /api/orders               我的订单
PATCH /api/orders/:id/cancel   取消订单

# 超管后台专用（需 Bearer token + admin role）
GET/POST        /api/admin/member-types                  会员类型
GET/POST        /api/admin/products                      商城产品
PATCH           /api/admin/products/:id                  更新产品
DELETE          /api/admin/products/:id                  删除产品
POST            /api/admin/products/batch-toggle         批量上下架
GET/POST        /api/admin/plan-templates                健康方案模板
PATCH           /api/admin/plan-templates/:id            更新模板
DELETE          /api/admin/plan-templates/:id            删除模板
POST            /api/admin/plan-templates/:id/copy       复制模板
PATCH           /api/admin/plan-templates/:id/toggle     切换启用状态
```

## 后端环境变量（/var/www/jiayicare/backend/.env）
- MONGODB_URI=mongodb://127.0.0.1:27017/jiayicare
- JWT_SECRET
- WECHAT_SECRET
- FRONTEND_URL
- NODE_ENV=production

---

## 健康数据类型
| type | label | 字段 |
|------|-------|------|
| bloodPressure | 血压 | extra.sys / extra.dia |
| bloodSugar | 血糖 | value (mmol/L) |
| heartRate | 心率 | value (次/分) |
| weight | 体重 | value (kg) |
| sleep | 睡眠 | value(时长h) / extra.sleepTime / extra.wakeTime |
| mood | 情绪 | value (1-10分) |

---

## 关键设计决策（避免重复踩坑）

### PUT /user/me 用原生 driver
直接用 findByIdAndUpdate 对 Mixed 数组字段会报 Cast 错误。
```js
// backend/src/routes/user.js 里用这个，不要用 findByIdAndUpdate：
await User.collection.updateOne({ _id: req.user._id }, { $set: updateData });
const user = await User.findById(req.user._id).select('-password');
```

### Modal visible 绑定
```jsx
// 错误（始终显示）：<Modal visible>
// 正确：
<Modal visible={!!someState}>
```

### 服务包 ID
pkg_1y（年度¥2980）/ pkg_6m（半年¥1680）/ pkg_3m（季度¥980）

### 微信登录
需配置环境变量 EXPO_PUBLIC_WECHAT_APPID 才显示微信登录按钮

### 错误显示
弹窗内的错误要显示在弹窗内部，不能用 toast（toast 会被弹窗遮住）

### 商城产品差异化定价
`memberPrices` 字段用 `mongoose.Schema.Types.Mixed` 存 JSON 对象（`{ "年度会员": 199, "半年会员": 149 }`），不用嵌套 Schema，避免 Cast 错误。会员类型从 MemberType 集合读取（自动播种：年度/半年/季度会员）。

### 健康方案模板 7 种 type
`annual_checkup` / `health_management` / `nutrition` / `medical_assist` / `rehab` / `tcm` / `psychology`
对应：年度体检 / 健康管理 / 营养干预 / 就医协助 / 运动复健 / 中医养生 / 心理咨询

### 管理员初始化
后台启动时不会重置已有账号密码。若首次部署时不存在管理员，可临时设置
`BOOTSTRAP_ADMIN_PASSWORD` 或 `PLATFORM_ADMIN_PASSWORD`，创建成功后从运行环境中移除。

---

## ⚠️ 遗留问题
- **EditProfileScreen 数组字段被注释掉**（allergies/medicalHistory/medications/familyHistory/surgeries）
  - 位置：`app/src/screens/profile/EditProfileScreen.js` handleSave 的 healthProfile 里
  - 恢复方式：直接取消注释那5个字段即可（当前 User.js 已是 Mixed 数组类型，阿里云部署版本支持）

## 2026-08 身体成分与服务包规则

- 身体成分统一管理体成分体重、骨骼肌、体脂率、内脏脂肪四项；每项保存实测值、报告原始参考范围和检测时间。体成分体重单独保存在身体成分对象中，不得覆盖一般检查体重。已审核体检报告中的这四项自动同步到身体成分历史，来源报告 ID 用于幂等覆盖；参考范围不得由系统猜测，无法确认时留空待人工复核。骨骼肌与肌肉量是不同项目，不得互相映射；内脏脂肪单位统一为“级”。
- 新客户自主开通的服务包以 Admin「会员设置 → 服务包」为唯一配置源；名称、客户归属、期限、售价、划线价、权益、标签和是否在用户端展示均从该处读取，App 不得写死套餐。

## 佣金结算规则

佣金业务规则遵循 `docs/decisions/commission-settlement-policy.md`：支付后预估，转介绍须实际服务启动且支付满7天才进入审核；服务绩效按完成/核销；取消退款同步调整，人员修改保留审计。不得以预约或分配人员代替实际启动。

> 2026-09-13：功能医学上传状态、列表人工审核和首页待办统一，历史记录按分类兼容，不批量迁移；详见 `docs/FUNCTIONAL_MANUAL_REVIEW.md`。

> 2026-09-14：群消息持续采集与本地规则随访草稿、人工确认边界见 docs/WECOM_ARCHIVE_FOLLOWUP.md。

> 2026-09-14：日常检测原图与按日沟通草稿复用待归档、ServiceRecord 和 FollowUp；规则与验证见 docs/WECOM_ARCHIVE_FOLLOWUP.md。

> 2026-09-14：侧栏三入口与专业随访草稿整理沿用原系统，详见 docs/WECOM_ARCHIVE_FOLLOWUP.md 的侧栏简化节。

> 2026-09-14：群资料12:00/20:00定时归档仅处理已核对元数据的队列，复用原入库函数；详见 docs/WECOM_ARCHIVE_FOLLOWUP.md。
