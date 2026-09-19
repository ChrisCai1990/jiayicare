# 可登录隔离环境：验收接续

2026-09-20：已建立真实本机后端、五岗位登录及纯虚构客户，未接生产。

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
