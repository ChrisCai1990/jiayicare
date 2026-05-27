# JiayiCare 项目完整说明

## 部署命令（push 后阿里云自动部署）
```bash
git add <files> && git commit -m "..." && git push origin master
```

## 线上地址（阿里云 ECS 121.40.156.39）
- 前端 app：http://121.40.156.39
- 管理后台：http://121.40.156.39:8081
- 医护端：http://121.40.156.39:8082
- 后端：http://121.40.156.39/api

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

## API 调用方式（src/services/api.js）
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

## Auth（src/context/AuthContext.js）
```js
const { user, token, isDemo, loading, updateUser, logout } = useAuth();
```
- `isDemo`：演示用户标志
- `updateUser(newUser)`：更新本地用户状态

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
// user.js 路由里用这个，不要用 findByIdAndUpdate：
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

## 健康记录 payload 结构（POST /records）
```js
// 血压
{ type:'bloodPressure', category:'vitals', label:'血压', unit:'mmHg',
  value:'130/80', extra:{sys:130, dia:80}, status:'normal'|'warning'|'low', note:'' }

// 血糖/心率/体重
{ type:'bloodSugar', category:'vitals', label:'血糖', unit:'mmol/L',
  value:'6.1', status:'normal', note:'' }

// 睡眠
{ type:'sleep', category:'lifestyle', label:'睡眠', unit:'小时',
  value:'7.5', extra:{sleepTime:'22:30', wakeTime:'06:30'}, status:'normal', note:'' }
```

---

## 本次对话完成的功能（2026-05-19）
- ✅ Railway 部署修复：连接 GitHub 仓库，解决长期不自动部署问题
- ✅ 编辑资料保存修复：用 collection.updateOne 绕过 Mongoose 类型转换
- ✅ 睡眠录入：新增入睡时间+醒来时间，自动计算时长（AddRecordScreen）
- ✅ 健康档案页：新增睡眠指标卡片+睡眠趋势图 Tab（RecordsScreen）
- ✅ 服务包购买：去除伪造成功的兜底逻辑，错误正确显示在弹窗内

## ⚠️ 遗留问题
- **EditProfileScreen 数组字段被注释掉**（allergies/medicalHistory/medications/familyHistory/surgeries）
  - 位置：`src/screens/profile/EditProfileScreen.js` handleSave 的 healthProfile 里
  - 恢复方式：直接取消注释那5个字段即可（当前后端 User.js 已是 Mixed 数组类型）

## 待办任务
- [ ] 用户提出的 UI 修改建议（图片中有多条，已确认：健康档案加睡眠 ✅、睡眠录入加时间 ✅）
- [ ] 其余修改建议待用户逐一确认后实现
