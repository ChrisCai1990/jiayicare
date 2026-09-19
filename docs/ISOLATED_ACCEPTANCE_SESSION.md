# 可登录隔离环境：验收接续

2026-09-20：已建立真实本机后端、五岗位登录及纯虚构客户，未接生产。

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
