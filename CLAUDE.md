# JiayiCare Monorepo 完整说明

## 目录结构
```
JiayiCare-mono/
├── app/        React Native + Expo 前端（用户端）
├── admin/      React + Vite 管理后台
├── backend/    Node.js + Express + MongoDB API
└── package.json
```

## 部署命令

### 所有服务（push 后 Railway 自动部署）
```bash
git add <files> && git commit -m "..." && git push origin master
```
- app/ 变更 → jiayihui-app 服务自动重新构建
- admin/ 变更 → jiayihui-admin 服务自动重新构建
- backend/ 变更 → backend 服务自动重新构建

## 线上地址
- 前端 app：https://jiayihui-app-production.up.railway.app
- 管理后台：https://jiayihui-admin-production.up.railway.app
- 后端：https://mongodb-production-06f7.up.railway.app/api

## 部署方式（Railway 自动部署）
- push 代码到 GitHub master 分支后，Railway 自动触发构建部署
- jiayihui-app 服务：Build=`npm install && npm run build:app` / Start=`npm run serve:app`
- jiayihui-admin 服务：Build=`npm install && npm run build:admin` / Start=`npm run serve:admin`
- backend 服务：Railway 连接 GitHub ChrisCai1990/jiayicare master，push 后自动部署

## 演示账号
- 手机号：13800138000 / 验证码：123456

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
```

## 后端环境变量（Railway Variables）
- MONGODB_URI
- JWT_SECRET
- WECHAT_SECRET
- FRONTEND_URL

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
Railway 旧版 schema 把 familyHistory 等定义为 String，直接用 findByIdAndUpdate 会报 Cast 错误。
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

---

## ⚠️ 遗留问题
- **EditProfileScreen 数组字段被注释掉**（allergies/medicalHistory/medications/familyHistory/surgeries）
  - 原因：Railway 旧 schema 把这些字段定义为 String，发数组会报 Cast 错误
  - 位置：`app/src/screens/profile/EditProfileScreen.js` handleSave 的 healthProfile 里
  - 恢复方式：取消注释那5个字段，前提是 Railway 已部署最新 User.js（Mixed 数组类型）
