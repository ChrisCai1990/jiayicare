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

## 目录结构（5个端）
```
JiayiCare-mono/
├── app/            React Native + Expo 用户端（患者使用，移动App）
├── miniprogram/    Taro 3 + React 微信小程序端（患者使用，功能对标 app/）
├── admin/          React + Vite 超级管理后台（运营/超管使用）
├── staff/          React + Vite 医护端（医生/健管师使用）
├── backend/        Node.js + Express + MongoDB API
└── package.json
```

### 各端职责
- **app/**：患者使用的移动端App（健康数据、问诊、服务购买等）
- **miniprogram/**：患者使用的微信小程序端，1:1 对标 app/ 的用户端功能，共用同一套后端 API。
  技术栈 Taro 3 + React（非 app/ 的 React Native），因为小程序无法直接运行 RN 代码，是独立工程。
  详见 `miniprogram/CLAUDE.md`。
- **admin/**：超级管理员后台（患者总览、订单、服务管理、商城产品管理、健康方案模板、医护账号管理等）
- **staff/**：医护人员工作台（随访、患者管理、服务记录、计划、提成等）
- **backend/**：统一API服务，四端共用（app/miniprogram/admin/staff）

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

### 小程序端部署（miniprogram/，与其余三端完全不同）
```bash
npm run build:miniprogram   # 等价于 cd miniprogram && npm run build:weapp，产出 miniprogram/dist/
```
`deploy.py` 的自动部署流程**不适用**于小程序：小程序不是网页，不能扔进 Nginx 静态目录了事。
构建产物 `miniprogram/dist/` 必须：
1. 用**微信开发者工具**导入 `miniprogram/dist` 目录本地预览/调试；
2. 确认无误后，在微信开发者工具里点击「上传」，或用 `miniprogram-ci`（需要小程序管理后台生成的私钥）命令行上传体验版；
3. 登录[微信公众平台](https://mp.weixin.qq.com)小程序管理后台，把上传的版本提交**微信官方审核**；
4. 审核通过后手动点击发布。

目前没有把小程序纳入 `scripts/deploy.py` 的自动化路径——微信审核是人工环节，无法绕过，如需要 CI 自动上传体验版可以后续接入 `miniprogram-ci`，但提审和发布必须人工在公众平台操作。

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
- 用户端：手机号 13800138000 / 验证码 123456（硬编码判断，始终可用，未配置真实短信服务时任何手机号都会在响应里明文返回验证码）
- 超管后台：superadmin / jiayi2024
- 医护端超管：jy_super / jiayi2024
- 其余医护测试账号（jy_hm/jy_fd/jy_ns/jy_ma/jy_hp/jy_tcm/jy_rb）仅在不存在时通过 `SEED_DEMO_ACCOUNTS=true` + `DEMO_ACCOUNT_PASSWORD` 创建，已存在的账号不受影响

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
POST /api/auth/wechat-mp       微信小程序登录（code2session，body:{code,userInfo?}）

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
