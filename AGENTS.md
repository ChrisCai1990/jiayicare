# Codex / Claude Code 双端统一项目记忆

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
