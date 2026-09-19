# 可登录隔离环境：验收接续

2026-09-20：已建立真实本机后端、五岗位登录及纯虚构客户，未接生产。

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
