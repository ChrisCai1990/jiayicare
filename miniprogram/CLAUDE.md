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
| 页面 | 文件 | 说明 | 实现程度 |
|------|------|------|----------|
| 登录 | pages/auth/login/index | 手机验证码登录 + 微信一键登录 + 演示登录 | 完整 |
| 引导建档 | pages/onboarding/index | 首次登录最小化建档（姓名/证件号/电话） | 完整 |
| 首页（Tab） | pages/home/index | 问候卡+健康评分+今日打卡+待办摘要 | 简化（无图表/复杂打卡弹窗，见下方说明） |
| 健康档案（Tab） | pages/records/index/index | 记录列表+分类筛选 | 简化（无趋势图） |
| 录入健康数据 | pages/records/add/index | 血压/血糖/心率/体重/睡眠/情绪，字段口径与 app/ 一致 | 完整 |
| 健康报告 | pages/records/report/index | 周期评分摘要 | 简化（无图表） |
| 上传体检报告 | pages/records/upload/index | Taro.chooseImage+uploadFile，走真实 /reports 接口 | 完整（核心链路） |
| AI健康助手 | pages/chat/index | 对话界面，接真实 /chat 接口 | 简化（无消息转人工/历史记录） |
| 用药管理 | pages/medication/index | 列表+打卡 | 简化（无新增/停用表单） |
| 随访（Tab） | pages/tasks/index | 待办任务+随访计划合并列表 | 简化（无分类Tab/表单填写） |
| 消息（Tab） | pages/messages/index | 会话列表+单会话收发 | 简化（无图片消息/角色Tab） |
| 提醒设置 | pages/reminders/index | 列表+开关 | 简化（无新增/分类） |
| 服务商城 | pages/services/mall/index | 服务列表+预约下单 | 简化（无健康基金抵扣/优惠券/多规格） |
| 服务包续约 | pages/services/renewal/index | pkg_1y/6m/3m 三档购买 | 完整（核心链路） |
| 编辑资料 | pages/profile/edit/index | 姓名/性别/年龄/身高体重 | 简化（无完整健康档案数组字段） |
| 账号安全 | pages/profile/security/index | 换绑手机号 | 完整 |
| 帮助与反馈 | pages/profile/feedback/index | 反馈表单 | 简化（无历史反馈列表） |
| 消息通知设置 | pages/profile/notifications/index | 本地开关（与 app/ 一致，非服务端配置） | 完整 |
| 我的订单 | pages/orders/index | 订单列表+取消 | 完整（核心链路） |
| 用户协议/隐私/免责 | pages/legal/index | 完整法律文本（与 app/ 一致） | 完整 |
| 即将开放 | pages/common/coming-soon/index | 占位页 | 完整 |
| 我的（Tab） | pages/profile/index/index | 会员卡片+健康基金+菜单入口 | 完整（核心链路） |

底部 TabBar（微信原生 tabBar，非 JS 自定义组件，配置在 `src/app.config.js`）：
首页 / 健康档案 / 随访 / 消息 / 我的。图标当前是 1x1 占位 PNG（`src/assets/tab/*.png`），
上线前需替换为真实设计稿导出的图标（建议 81x81px，selected/unselected 两套）。

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
- Tab 图标是占位 PNG，需要替换真实素材
- 首页/健康档案/健康报告页面没有移植 app/ 端的 SVG 图表（血压/血糖走势图、BMI色带等），
  小程序端用文字+简单卡片替代；如需图表可接入 `taro-echarts` 或小程序原生 `canvas`
- 消息页角色识别依赖后端返回字段 `fromRole`/`role`/`senderRole` 之一，需与后端实际消息模型字段核对
- 服务商城下单未实现健康基金抵扣、优惠券、多规格选择（app/ 端 ServiceMallScreen 的完整逻辑）
- 用药/提醒/反馈页面没有"新增"表单，只有列表+基础操作
- 未接入小程序订阅消息（wx.requestSubscribeMessage），提醒/随访提醒目前只能靠用户主动打开小程序查看
