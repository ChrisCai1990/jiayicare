# 可登录隔离环境：验收接续

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
