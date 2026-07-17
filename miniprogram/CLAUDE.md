# JiayiCare 小程序端说明

技术栈：Taro 3.6.32 + React 18（JS，不用 TS，跟 app/ 保持一致降低维护成本）+ 微信小程序原生组件/API。
共用后端：与 app/ 用同一套 `backend/` API，唯一区别是登录方式（见下）。

## 本地开发调试
```bash
cd miniprogram
npm install
npm run build:weapp   # 一次性构建，稳定可用
```
> ⚠️ `npm run dev:weapp`（watch监听模式）有已知bug：webpack解析react-jsx-runtime内部路径报错导致进程崩溃退出，不要用。
> 改完代码后手动重新跑一次 `npm run build:weapp`，再去开发者工具里点「编译」刷新，没有热更新。

然后打开**微信开发者工具**（需自行下载安装：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html），
选择「导入项目」，项目目录指向 `miniprogram/dist`。

> `dist/project.config.json` 是 Taro 构建时自动生成的，跟随源码目录 `miniprogram/project.config.json` 的
> appid 同步，**不要手动编辑或复制覆盖 dist 下这个文件**——手动改过一次导致 `miniprogramRoot` 字段被搞错，
> 开发者工具误判成小游戏项目报"未找到game.json"，删掉重新 `build:weapp` 才恢复。改 AppID 只改源码那份。

## 构建
```bash
npm run build:weapp   # 生产构建，产出 dist/
```
构建产物是小程序原生代码（wxml/wxss/js/json），不是网页，不能直接部署到服务器。
上线需要在微信开发者工具里手动上传，提交微信官方审核后手动发布——这个环节没有自动化方案，
详见根目录 `CLAUDE.md` 的"小程序端部署"一节。

## 微信小程序 AppID 配置

⚠️ **当前用的是测试号（2026-07-17起），不是正式小程序账号，正式上线前必须切回正式号。**

| | AppID | 用途 |
|---|---|---|
| 当前生效（测试号） | `wxa5fd7a7eb7cde164` | 开发调试用，无需正式审核即可真机测试 |
| 正式小程序（暂未接入） | `wx1631398eb9f9ed45` | 用户真实可用的小程序，走微信官方审核后上线用这个 |

配置位置：
- `miniprogram/project.config.json` 的 `appid` 字段（源码目录这份，**不要改`dist/`下的**，见上）
- 服务器 `/var/www/jiayicare/backend/.env` 的 `WECHAT_MP_APPID` / `WECHAT_MP_SECRET`（当前也是测试号的值，正式号的AppSecret已备份在服务器`.env.bak`里，不进代码仓库）

**接入正式账号步骤（后续待办）：**
1. `miniprogram/project.config.json` 的 `appid` 改回 `wx1631398eb9f9ed45`
2. 服务器 `.env` 的 `WECHAT_MP_APPID`/`WECHAT_MP_SECRET` 改回正式号的值
3. `pm2 restart jiayicare-backend --update-env`
4. 重新 `npm run build:weapp`，开发者工具里用正式号账号（确认开发者工具右上角登录的微信号是这个小程序的开发者/体验成员）重新真机调试验证登录
5. 验证通过后在微信公众平台提交审核，通过后手动发布

> 踩过的坑：测试号和正式号是完全不同的两个AppID，`wx.login()`拿到的code只在对应AppID下有效，
> 如果小程序端配的AppID和服务器`.env`配的AppID不一致（哪怕都"看起来配置正确"），
> `jscode2session`会报`errcode 40029 invalid code`，容易误判成code过期/网络问题，实际是AppID对不上。

## 登录方式：与 app/ 网页授权完全不同
- **app/**（网页场景）：用户点击"微信登录"→ 跳转微信 OAuth 网页 → 拿到 `code` → 后端 `POST /auth/wechat` →
  code 换 `access_token + openid`（网页授权 API：`sns/oauth2/access_token`）
- **miniprogram/**（小程序场景）：调用 `Taro.login()` 拿到临时 `code` → 后端 `POST /auth/wechat-mp` →
  code 换 `openid + session_key`（小程序专用 API：`sns/jscode2session`，没有 access_token，也没有拿用户信息的接口）
- 两种场景的 appid 不同（网页/公众号 appid ≠ 小程序 appid），因此 openid 也不同，后端用两个独立字段区分：
  `User.wechatOpenid`（网页授权）vs `User.wechatMpOpenid`（小程序）。**不要混用**。
- 后端环境变量：`WECHAT_MP_APPID` / `WECHAT_MP_SECRET`（未配置时 `/auth/wechat-mp` 返回 503，前端仍可用手机号登录）。

## 页面路由清单（app.config.js 里的 pages，Taro 用真实文件路径而非路由名）

> ⚠️ 2026-07-17 用专职agent做过一次逐页深度核对（不只看代码有没有，而是逐字段/逐交互点对比 app/ 真实源码），
> 发现差距比早期"简化"描述严重得多，还挖出2个真实功能bug。下表已按核对结果重写，是当前最准确的版本。

| 页面 | 文件 | 说明 | 实现程度 |
|------|------|------|----------|
| 登录 | pages/auth/login/index | 手机验证码登录 + 微信一键登录 + 演示登录 | ✅ 完整对齐 |
| 引导建档 | pages/onboarding/index | 首次登录最小化建档 | ✅ 完整对齐 |
| 首页（Tab） | pages/home/index | 问候卡+打卡+待办摘要 | ⚠️ 差距较大，见下方"首页" |
| 健康档案（Tab） | pages/records/index/index | 记录列表+分类筛选 | ⚠️ 无趋势图、无AI健康分析入口 |
| 录入健康数据 | pages/records/add/index | 血压/血糖/心率/体重/睡眠/情绪 | ✅ 字段口径与 app/ 完全一致 |
| 健康报告 | pages/records/report/index | 周期评分摘要 | ⚠️ 无图表 |
| 上传体检报告 | pages/records/upload/index | Taro.chooseImage+uploadFile | ✅ 核心链路对齐 |
| AI健康助手 | pages/chat/index | 对话界面 | 🐛 **有bug，见下方"已知功能性bug"** |
| 用药管理 | pages/medication/index | 列表+打卡 | ⚠️ 无新增/停用表单 |
| 随访（Tab） | pages/tasks/index | 待办任务+随访计划合并列表 | ⚠️ 无分类Tab、无表单字段展示 |
| 消息（Tab） | pages/messages/index | 会话列表+单会话收发 | 🐛 **有bug，见下方"已知功能性bug"**，且差距很大见下方"消息页" |
| 提醒设置 | pages/reminders/index | 列表+开关 | ⚠️ 无新增/分类 |
| 服务商城 | pages/services/mall/index | 服务列表+预约下单 | ⚠️ 差距很大，见下方"服务商城/续约" |
| 服务包续约 | pages/services/renewal/index | pkg_1y/6m/3m 三档购买 | ⚠️ 无优惠券/健康基金抵扣/支付方式选择（**之前误标"完整"，已订正**） |
| 编辑资料 | pages/profile/edit/index | 姓名/性别/年龄/身高体重 5个基础字段 | ⚠️ 差距很大，见下方"编辑资料" |
| 账号安全 | pages/profile/security/index | 换绑手机号 | ✅ 完整对齐 |
| 帮助与反馈 | pages/profile/feedback/index | 反馈表单 | ⚠️ 无历史反馈列表 |
| 消息通知设置 | pages/profile/notifications/index | 本地开关 | ✅ 完整对齐 |
| 我的订单 | pages/orders/index | 订单列表+取消 | ✅ 核心链路对齐 |
| 用户协议/隐私/免责 | pages/legal/index | 完整法律文本 | ✅ 完整对齐 |
| 即将开放 | pages/common/coming-soon/index | 占位页 | ✅ 完整对齐 |
| 我的（Tab） | pages/profile/index/index | 会员卡片+健康基金+菜单入口 | ⚠️ 菜单入口缺失较多，见下方"我的" |

底部 TabBar（微信原生 tabBar，配置在 `src/app.config.js`）：首页 / 健康档案 / 随访 / 消息 / 我的。
**⚠️ 与app端已不对等**：app端底部Tab目前是 Home/Records/ReportUpload/Messages/Profile（Tasks已从Tab移除，
改成Stack内独立页面），miniprogram仍保留Tasks作为Tab、没有独立的ReportUpload Tab——两端信息架构需要
拉齐，具体以哪端为准待确认。
图标当前是1x1占位PNG（`src/assets/tab/*.png`），上线前需替换真实设计稿导出的图标（建议81x81px，selected/unselected两套）。

### 首页差距明细（app: `app/src/screens/home/HomeScreen.js` 1919行 → mini: `pages/home/index.jsx` 187行）
缺失：血压/血糖迷你走势图、BMI色带、成长打卡卡片（连续天数+月历+趋势反馈）、任务详情弹窗、健康管家团队横向卡片、
情绪圆点选分、生理指标"原地打卡弹窗"（app端可在首页直接填写提交不跳转，mini端点击打卡直接跳转到录入页）、
饮食打卡的餐次选择+补录历史日期。打卡项从app的12项精简为9项（缺"吸烟""饮酒"）。
API层：app额外调用 `recordsAPI.trend()`、`systemAPI.push()`，mini端未调用。

### 编辑资料差距明细（app: `EditProfileScreen.js` → mini: `pages/profile/edit/index.jsx`）—— 差距最大的页面
mini端仅5个字段（姓名/性别/年龄/身高/体重），POST时**完全没有`healthProfile`对象**，意味着用户在小程序编辑资料，
以下字段永远写不进去：
- 联系电话、配送地址、血型（ABO/RH）
- 5个结构化数组字段：过敏史(allergies)、既往病史(medicalHistory)、用药记录(medications)、家族史(familyHistory)、手术史(surgeries)
- 健康摘要文字字段：drugAllergy/foodAllergy/pastHistory/medicHistory/surgeryHistory（含只读的infectiousHistory）
- 女性专属：月经史(menstrualHistory)；婚育史(maritalHistory)
- 医疗保障信息只读展示区块

> 根目录/app目录 CLAUDE.md 里"EditProfileScreen数组字段被注释掉"这条遗留问题**已过时**——app端该问题
> 早已修复，`healthProfile`对象字段现已完整启用，两份旧文档的这条描述应视为无效。

### 服务商城/服务续约差距明细（app: `ServiceMallScreen.js` 877行 + `RenewalScreen.js` → mini对应页面）
缺失：服务分类Tab筛选、会员权益Banner、星级评分、多图详情弹窗、**多规格选择**、**支付方式选择**（mini端服务续约硬编码微信支付）、
**优惠券选择**（`servicesAPI.coupons()`两端api.js方法一致，mini端未调用）、**健康基金抵扣**、价格明细展示、
"预约咨询"与"立即支付"两种下单模式区分。
接口层没问题（`servicesAPI.order`签名两端一致），mini端只是调用时少传了后三个参数（paymentMethod/useHealthFund/couponId）——纯UI未做，接口现成能用。

### 消息页差距明细（app: `MessagesScreen.js` 1437行 → mini: `pages/messages/index.jsx` 119行）
app端已重构为基于`careTeam`团队的固定角色分组（doctor/manager/nutritionist三个固定角色），并新增了
push records合并展示（知识科普/健康方案/问卷/营养推荐/产品推送/系统通知）、SSE实时推送、产品推送购买弹窗、
AI助手会话置顶、系统通知独立Modal。mini端仍是旧的"从消息里猜角色"逻辑，且这个逻辑本身有bug（见下）。

### 我的（Profile）菜单差距明细
"健康管理"分组app有5项，mini只有2项，缺失：健康方案(ServicePlans)、体检报告(MedicalReports)、营养素管理(Nutrition)。
"我的服务"分组缺失"会员权益"(Benefits)。**整个"家庭成员"板块**（横向卡片+添加入口）完全没有。

## App端有但miniprogram端完全没有对应页面的功能

以下9个页面miniprogram的路由表里完全不存在。对应的API分组（`supplementsAPI`/`giftsAPI`/`partnerBenefitsAPI`/
`pointsAPI`/`familyLinksAPI`/`questionnaireAPI`/`plansAPI`/`screeningAPI`/`shareAPI`）**已经存在于
`miniprogram/src/services/api.js`**（整体复制app端api.js带过来的），接口现成能用，只是没有UI调用。

| 功能 | app端文件 | 说明 |
|------|-----------|------|
| 营养素管理 | `nutrition/NutritionScreen.js`（482行） | 营养素/保健品记录，新增/打卡/停用，用`supplementsAPI` |
| 会员权益 | `profile/BenefitsScreen.js`（545行） | 积分/礼品兑换/合作商户优惠 |
| 家庭成员管理 | `profile/FamilyMembersScreen.js`（399行） | 添加/搜索/邀请/接受拒绝/移除 |
| 问卷调查 | `questionnaire/QuestionnaireScreen.js`（1001行） | 动态表单问卷填写与提交 |
| AI健康分析 | `records/AiHealthScreen.js`（510行） | AI健康摘要+风险评估生成/查看 |
| 体检报告分类查看 | `records/MedicalReportsScreen.js`（357行） | 按分类查看已审核报告详情 |
| 公开报告分享页 | `records/PublicReportScreen.js`（320行） | 无需登录的分享报告只读页（小程序场景分享机制不同，可能不完全适用） |
| 专项筛查 | `records/SpecialScreeningScreen.js`（544行） | 专项体检项目选择/取消/上传 |
| 健康方案 | `services/ServicePlansScreen.js`（852行） | 健管方案列表/确认/年度体检管理方案 |

## 已知功能性bug（不是"简化"，是接错了，需要单独修复）

1. **AI聊天永远拿不到真实回复**：`pages/chat/index.jsx` 读取 `res?.data?.reply`，但后端
   `backend/src/routes/chat.js` 实际返回字段是 `data.content`（app端读的也是`res.data.content`，是对的）。
   结果mini端每次都掉进前端硬编码的兜底文案"抱歉，我暂时无法回复，请稍后重试。"，聊天功能形同虚设。
2. **消息角色分组和未读判断永远失真**：`pages/messages/index.jsx` 用
   `m.fromRole || m.role || m.senderRole` 判断角色、`!m.read` 判断未读，但后端`Message`模型的真实字段
   是`type`（不是fromRole/senderRole）和`unread`（不是read）——这三个角色字段在真实数据里都不存在，
   角色分组永远得到undefined分组，未读红点数字不准确。

## 主题变量（import { colors, spacing, radius, shadow } from '../../theme'）
数值与 app/src/theme/index.js 完全一致，唯一差异：`shadow` 从 RN 的
`{shadowColor,shadowOffset,shadowOpacity,shadowRadius}` 对象转换成小程序 CSS 支持的
`boxShadow` 字符串（如 `'0px 2px 8px rgba(26,43,36,0.06)'`），直接赋给 `style={{ boxShadow: shadow.card }}`。

## API 调用方式（src/services/api.js）
与 app/src/services/api.js 结构完全一致（同一组 API 分组/方法名/路径/参数），底层请求方法重写：
- `fetch` → `Taro.request`
- `localStorage` → `Taro.setStorageSync` / `Taro.getStorageSync`
- 文件上传新增 `reportsAPI.uploadFile(filePath)`，用 `Taro.uploadFile` 对接 `/reports/upload`
  （若后端未提供该接口，`ReportUploadScreen` 对应页面会自动降级为 base64 走 `/reports` 创建）

```js
import { userAPI, recordsAPI, servicesAPI, ordersAPI } from '../../services/api';

userAPI.getMe()
recordsAPI.create(payload)
servicesAPI.order(serviceId, note, paymentMethod)
ordersAPI.list()
```

## Auth（src/context/AuthContext.jsx）
API 形状与 app/src/context/AuthContext.js 一致：
```js
const { user, token, loading, login, logout, updateUser, isDemo } = useAuth();
```

## 健康数据类型（POST /records payload，与 app/ 完全一致）
| type | label | 字段 |
|------|-------|------|
| bloodPressure | 血压 | extra.sys / extra.dia |
| bloodSugar | 血糖 | value (mmol/L) |
| heartRate | 心率 | value (次/分) |
| weight | 体重 | value (kg) |
| sleep | 睡眠 | value(时长h) / extra.sleepTime / extra.wakeTime |
| mood | 情绪 | value (1-10分) |

## 已知限制 / 待办

**优先级高（功能性bug，用户可感知到"坏了"）：**
- AI聊天读错字段永远拿不到真实回复（见上方"已知功能性bug"）
- 消息页角色分组/未读判断字段名不存在，逻辑永远失真（见上方"已知功能性bug"）

**优先级中（明确的功能缺口，见上方各页面差距明细）：**
- 编辑资料缺整个健康档案数组字段结构，用户在小程序填的过敏史/病史/用药记录等实际存不进去
- 服务商城/续约缺健康基金抵扣、优惠券、多规格、支付方式选择
- 9个App端页面（营养素/会员权益/家庭成员/问卷/AI健康分析/体检报告分类/专项筛查/健康方案/公开分享页）完全没做，
  对应API已就绪，只缺UI
- 两端底部Tab结构不对等（app已移除Tasks Tab，mini还保留），需要确认最终以哪端为准

**优先级低（体验/素材类）：**
- Tab 图标是占位 PNG，需要替换真实素材
- 首页/健康档案/健康报告页面没有移植 app/ 端的 SVG 图表，小程序端用文字+简单卡片替代；
  如需图表可接入 `taro-echarts` 或小程序原生 `canvas`
- 用药/提醒/反馈页面没有"新增"表单，只有列表+基础操作
- 未接入小程序订阅消息（wx.requestSubscribeMessage），提醒/随访提醒目前只能靠用户主动打开小程序查看

## 双端同步原则（2026-07-17 起）

miniprogram/ 和 app/ 共用同一套后端和用户群体，**功能应尽量保持同步**，避免用户在两端体验不一致。
- 之后改动 app/ 的用户端功能（新增字段、改交互、改API），如果miniprogram有对应页面，**要评估是否需要同步改**，
  至少要在这份文档里补一条待办，不能让两端悄悄分叉
- 优先修复上面列的2个功能性bug，其次是"编辑资料"和"服务商城"这两个差距最大且涉及真实数据完整性的页面
- 9个完全缺失的页面按需排期，不必须一次做完
