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

✅ **2026-07-18起改用正式号 `wx50062146332b1b20`**（用户新申请的账号，之前的测试号`wxa5fd7a7eb7cde164`和
另一个未启用的正式号`wx1631398eb9f9ed45`都已停用，历史记录见下）。

配置位置：
- `miniprogram/project.config.json` 的 `appid` 字段（源码目录这份，**不要改`dist/`下的**，见上）
- 服务器 `/var/www/jiayicare/backend/.env` 的 `WECHAT_MP_APPID` / `WECHAT_MP_SECRET`（AppSecret不进代码仓库，旧配置备份在服务器`.env.bak`/`.env.bak2`）

**正式号上线剩余步骤：**
1. ~~切换project.config.json和服务器.env~~ 已完成（2026-07-18）
2. 开发者工具里用**这个正式号绑定的微信开发者账号**（确认开发者工具右上角登录的微信号是`wx50062146332b1b20`的开发者/体验成员）重新真机调试验证登录
3. 验证通过后在微信公众平台提交审核
4. 审核通过后手动点击发布

> 踩过的坑：测试号和正式号是完全不同的两个AppID，`wx.login()`拿到的code只在对应AppID下有效，
> 如果小程序端配的AppID和服务器`.env`配的AppID不一致（哪怕都"看起来配置正确"），
> `jscode2session`会报`errcode 40029 invalid code`，容易误判成code过期/网络问题，实际是AppID对不上。
> 换AppID后一定要**同时**改两处（小程序端project.config.json + 服务器.env）并重启后端，缺一不可。

## 登录方式：与 app/ 网页授权完全不同
- **app/**（网页场景）：用户点击"微信登录"→ 跳转微信 OAuth 网页 → 拿到 `code` → 后端 `POST /auth/wechat` →
  code 换 `access_token + openid`（网页授权 API：`sns/oauth2/access_token`）
- **miniprogram/**（小程序场景）：调用 `Taro.login()` 拿到临时 `code` → 后端 `POST /auth/wechat-mp` →
  code 换 `openid + session_key`（小程序专用 API：`sns/jscode2session`，没有 access_token，也没有拿用户信息的接口）
- 两种场景的 appid 不同（网页/公众号 appid ≠ 小程序 appid），因此 openid 也不同，后端用两个独立字段区分：
  `User.wechatOpenid`（网页授权）vs `User.wechatMpOpenid`（小程序）。**不要混用**。
- 后端环境变量：`WECHAT_MP_APPID` / `WECHAT_MP_SECRET`（未配置时 `/auth/wechat-mp` 返回 503，前端仍可用手机号登录）。

## 页面路由清单（app.config.js 里的 pages，Taro 用真实文件路径而非路由名）

> ⚠️ 2026-07-18 晚间第二轮对齐（用户明确要求"1:1复刻"，追平app端当天11:09-14:37的6次改动）：
> 新增独立打卡页 pages/checkin/index、新增个人资料独立页 pages/records/profile-archive/index、
> 健康档案页加个人资料入口+历史记录按日分组、首页打卡网格抽离为入口按钮+移除管家团队、
> 我的页去重+加管家团队+头部编辑入口、AI健康分析板块顺序对齐、底部Tab结构对齐（随访移出Tab）。
> 详见本文件末尾"2026-07-18第二轮1:1复刻"章节。早前 2026-07-18 白天的大规模补齐记录仍保留在下表。

| 页面 | 文件 | 说明 | 实现程度 |
|------|------|------|----------|
| 登录 | pages/auth/login/index | 手机验证码登录 + 微信一键登录 + 演示登录 | ✅ 完整对齐 |
| 引导建档 | pages/onboarding/index | 首次登录最小化建档 | ✅ 完整对齐 |
| 首页 | pages/home/index | 问候卡+成长卡片+BMI色带+血压血糖迷你趋势图+打卡入口按钮+待办 | ✅ 对齐app端瘦身后结构，图表为轻量div实现 |
| 打卡 | pages/checkin/index | 必打卡/可选打卡区分+时段选择+症状自评+生理指标弹窗 | ✅ 新增，对齐 CheckinScreen |
| 健康档案（Tab） | pages/records/index/index | 记录列表(按日分组)+分类筛选+个人资料入口+AI健康分析入口+睡眠卡片+趋势图Tab | ✅ 核心交互完整对齐 |
| 个人资料 | pages/records/profile-archive/index | 基本信息+基础健康档案+医疗保障信息+生活方式+年度复查计划 | ✅ 新增，对齐 ProfileArchiveScreen |
| 录入健康数据 | pages/records/add/index | 血压/血糖/心率/体重/睡眠/情绪/吸烟/饮酒 | ✅ 字段口径与 app/ 完全一致（已补吸烟/饮酒） |
| 健康报告 | pages/records/report/index | 周期评分+图表化指标+任务完成率+亮点 | ✅ 核心交互完整对齐 |
| 上传体检报告（Tab） | pages/records/upload/index | Taro.chooseImage+uploadFile | ✅ 核心链路对齐 |
| AI健康助手 | pages/chat/index | 对话界面 | ✅ 已修复读取字段bug，功能正常 |
| 用药管理 | pages/medication/index | 列表+打卡 | ⚠️ 无新增/停用表单（未在本轮范围内） |
| 随访 | pages/tasks/index | 待办任务+随访计划合并列表，已从Tab移出，靠首页待办卡片"全部"入口访问 | ⚠️ 无分类Tab、无表单字段展示（未在本轮范围内） |
| 消息（Tab） | pages/messages/index | 固定角色分组会话列表+推送记录合并+AI置顶+产品购买弹窗 | ✅ 已重写对齐，SSE改为10秒轮询 |
| 提醒设置 | pages/reminders/index | 列表+开关 | ⚠️ 无新增/分类（未在本轮范围内） |
| 服务商城 | pages/services/mall/index | 分类Tab+会员Banner+多规格+优惠券+基金抵扣+支付方式 | ✅ 已补齐对齐 |
| 服务包续约 | pages/services/renewal/index | 三档套餐+确认弹窗(优惠券/基金/支付方式)+已有服务分支 | ✅ 已补齐对齐，价格已订正为与后端一致 |
| 编辑资料 | pages/profile/edit/index | 完整健康档案字段（血型/过敏史/病史/用药/家族史/手术史/婚育史等） | ✅ 已补齐对齐 |
| 账号安全 | pages/profile/security/index | 换绑手机号 | ✅ 完整对齐 |
| 帮助与反馈 | pages/profile/feedback/index | 反馈表单 | ⚠️ 无历史反馈列表（未在本轮范围内） |
| 消息通知设置 | pages/profile/notifications/index | 本地开关 | ✅ 完整对齐 |
| 我的订单 | pages/orders/index | 订单列表+取消 | ✅ 核心链路对齐 |
| 用户协议/隐私/免责 | pages/legal/index | 完整法律文本 | ✅ 完整对齐 |
| 即将开放 | pages/common/coming-soon/index | 占位页 | ✅ 完整对齐 |
| 我的（Tab） | pages/profile/index/index | 会员卡片+健康基金+菜单入口(已去重)+管家团队+家庭成员板块+头部编辑入口 | ✅ 已补齐对齐 |
| 营养素管理 | pages/nutrition/index | 进行中/已停用+打卡/停用/新增 | ✅ 新增，对齐 NutritionScreen |
| 会员权益 | pages/profile/benefits/index | 健康基金+积分+专属权益+合作伙伴权益 | ✅ 新增，对齐 BenefitsScreen |
| 家庭成员管理 | pages/profile/family/index | 搜索添加+邀请确认/拒绝+解除关联 | ✅ 新增，对齐 FamilyMembersScreen |
| 问卷调查 | pages/questionnaire/index | 动态表单引擎(6种题型+跳题逻辑) | ✅ 新增，对齐 QuestionnaireScreen |
| AI健康分析 | pages/records/ai-health/index | 健康分析(板块顺序已对齐)+风险评估，审核状态展示 | ✅ 新增，对齐 AiHealthScreen |
| 体检报告分类查看 | pages/records/medical-reports/index | 年份+分类分组，报告展开查看 | ✅ 新增，对齐 MedicalReportsScreen |
| 专项筛查 | pages/records/screening/index | 5大类完整目录，勾选/上传 | ✅ 新增，对齐 SpecialScreeningScreen |
| 健康方案 | pages/services/plans/index | 方案列表+任务详情+确认+完成 | ✅ 新增，对齐 ServicePlansScreen |
| 公开报告分享页 | pages/records/public-report/index | 小程序场景适配（路由参数token+原生转发） | ✅ 新增，已按小程序场景重新设计 |

底部 TabBar（微信原生 tabBar，配置在 `src/app.config.js`）：首页 / 健康档案 / 上传报告 / 消息 / 我的。
**2026-07-18 第二轮已对齐app端**：随访已从Tab移除（app端Tasks已改为Stack内独立页面，靠首页待办卡片
"全部"链接进入），新增"上传报告"Tab，与app端 Home/Records/ReportUpload/Messages/Profile 结构一致。
图标当前是1x1占位PNG（`src/assets/tab/*.png`，上传报告Tab复用了home图标占位），上线前需替换真实设计稿
导出的图标（建议81x81px，selected/unselected两套）。

## 已修复的历史bug（原"已知功能性bug"章节，2026-07-18已修复）

1. **AI聊天读取后端返回字段错误**（已修复）：`pages/chat/index.jsx` 原读取 `res?.data?.reply`，
   后端 `backend/src/routes/chat.js` 实际返回字段是 `data.content`，已改为读取 `res?.data?.content`，
   与 app 端 ChatScreen.js 读法一致。验证方式：读取 backend/src/routes/chat.js 确认响应体结构，
   并核对小程序端解构路径与之匹配。
2. **消息角色分组和未读判断字段名不存在**（已修复）：原用 `m.fromRole || m.role || m.senderRole` /
   `!m.read` 判断，后端 `Message` 模型真实字段是 `type`/`unread`，这些字段在真实数据里都不存在。
   已按 app 端 `MessagesScreen.js` 的固定角色方案（`ROLE_DEFS`）完整重写，见下方"消息页"说明。

## 剩余简化项（本轮范围内已注明，非遗漏）

以下简化点已在对应文件顶部注释里写明原因，均为技术受限或合理场景适配，不是遗漏：
- **消息会话详情**：小程序无 EventSource(SSE) 支持，用10秒轮询代替 app 端的实时推送
- **首页/健康档案/健康报告图表**：用 `src/components/TrendChart.jsx`（纯div柱状条）代替 app 端的
  SVG 图表，避免引入 canvas/echarts 图表库的额外构建风险；数据真实，只是视觉呈现更简单
- **专项筛查上传**：用 `Taro.chooseImage` 只支持图片，app端web版用 `<input type=file>` 可选PDF；
  小程序无通用文件选择器（`Taro.chooseMessageFile` 仅企业微信等特定客户端支持）
- **AI健康分析**：未接语音播报（app端 `tts.speak`），小程序场景暂不需要
- **健康方案页**：年度管理方案(annual_mgmt)模块字段中文标签映射（`FIELD_LABEL`/`MODULE_NAME`）只
  覆盖了 app 端最常用的一批字段，未覆盖的字段会退化显示原始 key 而非中文标签，但数据本身不丢失
- **公开报告分享页**：小程序场景做了合理重新设计——用路由参数 `token` 而非 URL query 传递分享凭证，
  登录按钮用 `Taro.reLaunch` 而非 app 端的 `window.location.href`，新增 `onShareAppMessage` 支持
  小程序原生转发（这是比 app 端生成公开链接更符合小程序生态的分享方式）

## 未在本轮范围内的已知差距（供后续排期）

- 用药管理页无新增/停用表单，只有列表+打卡
- 随访（Tasks）页无分类Tab、无表单字段展示
- 提醒设置页无新增/分类
- 帮助与反馈页无历史反馈列表
- Tab 图标是占位 PNG，需要替换真实设计稿导出的图标
- 未接入小程序订阅消息（wx.requestSubscribeMessage），提醒/随访提醒目前只能靠用户主动打开小程序查看

## 2026-07-18 第二轮1:1复刻（用户明确要求，追平app端当天白天的6次改动）

用户在完成第一轮补齐后明确要求"1:1复刻"，因此本轮不再评估优先级，直接照app端结构补齐全部差距。

1. **打卡功能重构**：新增独立页 `pages/checkin/index.jsx`，完整对齐 app 端 `CheckinScreen.js`：
   必打卡/可选打卡按 `user.chronicDiseases` 动态区分、运动打卡时段选择（现在/早上/上午/中午/下午/晚上）、
   症状自评（8个常见症状+2个紧急症状"胸痛""呼吸困难"，选中紧急症状提交后弹窗提示联系医师）、
   生理指标原地弹窗（血压/血糖/心率/体重/睡眠）、日期归属选择（今天/昨天/前天+日期选择器）。
   接后端已有的 `GET /records/today-status` 接口（此前接口已存在但小程序api.js未封装，本轮补上
   `recordsAPI.todayStatus()`）。首页原12项打卡网格+`QuickCheckinModal`已删除，改为跳转入口按钮。
   顺带修复了首页 `markTaskDone` 里调用不存在的 `loadData()`（应为 `loadCore()`）的历史bug。
2. **首页瘦身**：移除健康管家团队横向卡片（已移至"我的"页），移除内联打卡网格，保留成长卡片/BMI色带/
   趋势图/待办任务；待办任务区块新增"全部"入口跳转 `pages/tasks/index`（因随访Tab移除后需要新入口）。
3. **健康档案页拆分**：新增 `pages/records/profile-archive/index.jsx`，对齐 app 端
   `ProfileArchiveScreen.js`：基本信息（只读，编辑跳编辑资料页）、基础健康档案10个字段、医疗保障信息
   （只读）、生活方式（含编辑弹窗）、年度复查计划（接 `checkupAPI.get()`，该API小程序端已存在）。
   健康档案主页顶部新增"个人资料"入口卡片；历史记录列表改为按日期分组，同日多条记录折叠显示
   "共N次"，并区分 `recordedAt`（记录归属日期）与 `createdAt`（实际提交时间，仅当两者不同日才显示
   "提交于..."，对应补录场景）。
4. **我的页对齐**：菜单去重（移除"健康档案""体检报告"，与底部Tab重复）；新增"我的健康管家团队"
   横向卡片区块（数据源 `user.careTeam`，兼容旧 `doctor`/`manager` 字段）；头部头像区新增编辑资料
   快捷按钮（铅笔图标）。
5. **AI健康分析板块顺序对齐**：`pages/records/ai-health/index.jsx` 的 `HealthSummaryView` 板块顺序
   从"生活方式→医疗问题→肿瘤→心脑血管→慢病→体检完整度"改为"肿瘤风险筛查分析→心脑血管病风险分析→
   慢性病及其他健康指标分析→体检全面性评估→需优先解决的医疗问题→生活方式评估"，6处标题文案同步对齐。
6. **底部Tab结构对齐**：`app.config.js` tabBar 从 首页/健康档案/随访/消息/我的 改为
   首页/健康档案/上传报告/消息/我的，"随访"移出Tab（新增 `pages/records/upload/index` 复用已有页面
   作为Tab、`pages/tasks/index` 保留为普通页面，靠首页待办卡片"全部"链接访问）。图标资源复制了
   home的占位png作为report Tab的占位图标（`assets/tab/report.png`/`report-active.png`）。

本轮改动均已通过 `npm run build:weapp` 验证无报错。

## 主题变量（import { colors, spacing, radius, shadow } from '../../theme'）
数值与 app/src/theme/index.js 完全一致，唯一差异：`shadow` 从 RN 的
`{shadowColor,shadowOffset,shadowOpacity,shadowRadius}` 对象转换成小程序 CSS 支持的
`boxShadow` 字符串（如 `'0px 2px 8px rgba(26,43,36,0.06)'`），直接赋给 `style={{ boxShadow: shadow.card }}`。

## 共享组件（src/components/）
- `TrendChart.jsx`：轻量趋势图组件，纯div柱状条实现（不依赖canvas/echarts）。`mini` 模式用于卡片内
  迷你走势图，完整模式带坐标轴标签用于趋势图Tab/健康报告指标图。

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
servicesAPI.order(serviceId, note, paymentMethod, useHealthFund, couponId)
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
| smoking | 吸烟 | value (支) |
| drinking | 饮酒 | value (ml) |

## 双端同步原则（2026-07-17 起）

miniprogram/ 和 app/ 共用同一套后端和用户群体，**功能应尽量保持同步**，避免用户在两端体验不一致。
- 之后改动 app/ 的用户端功能（新增字段、改交互、改API），如果miniprogram有对应页面，**要评估是否需要同步改**，
  至少要在这份文档里补一条待办，不能让两端悄悄分叉
- 2026-07-18已完成一轮大规模补齐（详见上方页面路由清单），后续新增功能建议延续本轮的原则：
  能真实接后端API就不用假数据占位，遇到小程序场景与网页/App场景机制性差异时，做合理的场景适配而不是
  生搬硬套，并在代码注释+本文档里写清楚简化点和原因
