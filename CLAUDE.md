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
python scripts/deploy.py --push --backend -m "fix: 描述改动"
```

### 只部署（代码已手动 push 过）
```bash
python scripts/deploy.py
python scripts/deploy.py --backend
```

> `--push` 会自动执行 git add . → git commit → git push，再 SSH 部署。未指定 `-m` 时 commit message 默认为 `update 时间戳`。

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
        → SSH 连接 121.40.156.39（root / Jiayi2026!）
        → git fetch + git reset --hard origin/master
        → npm install（后端）
        → npm run build:admin + build:staff（有前端改动时）
        → pm2 restart jiayicare-backend
        → 验证：pm2 status + superadmin 密码同步日志
```

### 服务器信息
- 系统：阿里云 ECS，Ubuntu
- IP：121.40.156.39，SSH：root@121.40.156.39，密码：Jiayi2026!
- PM2 进程：`jiayicare-backend`（id 0）、`webhook-server`（id 1）
- 前端静态文件：Nginx 托管 `/var/www/jiayicare/{app,admin,staff}/dist`
- 数据库：本地 MongoDB 27017，库名 jiayicare
- 后端配置：`/var/www/jiayicare/backend/.env`
- 部署日志：`/var/log/jiayicare-deploy.log`
- GitHub SSH：服务器 Deploy Key `/root/.ssh/github_deploy`（key id: 152715350）

## 演示账号
- 用户端：手机号 13800138000 / 验证码 123456
- 超管后台：superadmin / jiayi2024
- 医护端超管：jy_super / jiayi2024

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

### superadmin 密码
后端每次启动自动执行 `sa.password = 'jiayi2024'; sa.save()`（触发 bcrypt pre-save 钩子），确保密码哈希始终有效。日志输出 `🔑 superadmin 密码已同步`。

---

## ⚠️ 遗留问题
- **EditProfileScreen 数组字段被注释掉**（allergies/medicalHistory/medications/familyHistory/surgeries）
  - 位置：`app/src/screens/profile/EditProfileScreen.js` handleSave 的 healthProfile 里
  - 恢复方式：直接取消注释那5个字段即可（当前 User.js 已是 Mixed 数组类型，阿里云部署版本支持）
