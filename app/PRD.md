# 嘉医管家 · 产品需求文档（PRD）

> 版本：v1.0 | 整理日期：2026-05-18 | 状态：已上线

---

## 一、产品概述

### 1.1 产品定位

**嘉医管家**是一款面向慢病患者及健康管理人群的移动健康管理应用，连接患者、医生与健康管理师，提供健康监测、随访管理、用药提醒、AI 问诊、专属服务等一体化健康管理服务。

### 1.2 目标用户

| 用户角色 | 描述 |
|---------|------|
| **患者（C 端）** | 慢病患者（高血压、糖尿病等）或有健康管理需求的普通用户 |
| **医生** | 负责患者随访、消息回复、任务制定的主治医师 |
| **健康管理师** | 负责日常服务跟进、订单管理、健康指导的健管师 |

### 1.3 产品目标

- 帮助患者养成定期记录健康指标的习惯
- 实现医患之间的高效沟通与随访管理
- 通过服务包体系实现商业化
- 利用 AI 提供个性化健康指导

---

## 二、技术架构

### 2.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **C 端前端** | React Native (Expo) | 编译为 Web 应用 |
| **管理后台** | React + Vite | 独立 Web 应用 |
| **后端** | Node.js + Express | RESTful API |
| **数据库** | MongoDB (Mongoose) | 文档型数据库 |
| **AI 接口** | Anthropic Claude API | AI 问诊/对话 |

### 2.2 部署环境

| 服务 | 平台 | 地址 |
|------|------|------|
| C 端应用 | Vercel | `dist-*.vercel.app` |
| 管理后台 | Vercel | `dist-*.vercel.app` |
| API 服务 | Railway | `mongodb-production-06f7.up.railway.app` |
| 数据库 | Railway (MongoDB) | 内网访问 |

### 2.3 认证机制

- C 端：手机号 + 短信验证码登录，JWT Token（7天有效期）
- 管理后台：用户名 + 密码登录，JWT Token（type: 'admin'，7天有效期）
- Demo 账号：`13800138000`（展示用，使用 Mock 数据）

---

## 三、C 端功能需求

### 3.1 认证与引导

#### 3.1.1 登录

- 手机号输入（11位，1开头）
- 发送/重发短信验证码（60秒冷却）
- 验证码登录，获取 JWT
- 非生产环境：验证码固定为 `123456`

#### 3.1.2 新用户引导（Onboarding）

首次登录后进入，完成后不再出现。

**信息采集：**
- 姓名、年龄、性别
- 身高（cm）、体重（kg）
- 慢性病史（多选：高血压/糖尿病/冠心病等）
- 吸烟、饮酒、运动习惯
- 家族病史

**完成逻辑：**
- 提交后生成初始健康评分（60–85分随机）
- `onboardingCompleted` 标记为 true
- 跳转首页

---

### 3.2 首页（Home）

#### 3.2.1 英雄卡（健康评分区）

- 显示当前健康评分（0–100分）
- 分数颜色：≥80 绿色 / ≥60 黄色 / <60 红色
- 评分趋势折线图（SVG Sparkline，需 ≥2天数据）
- 评分历史：每日首次访问仪表盘自动记录，最多保留30条

#### 3.2.2 健康指标快览

展示最新各类指标记录（无数据显示"暂无"）：

| 指标 | 单位 | 异常阈值 |
|------|------|---------|
| 血压 | mmHg | 收缩压 ≥130 警告，≥140 危险 |
| 血糖 | mmol/L | ≥7.0 或 <3.9 危险，≥6.1 警告 |
| 心率 | bpm | >100 或 <60 警告 |
| 体重 | kg | — |
| 睡眠 | h | — |

#### 3.2.3 快捷服务（4个入口）

- 问诊医生 → AI 聊天页
- 健康档案 → 记录页
- 用药计划 → 用药管理页
- AI 助手 → AI 聊天页

#### 3.2.4 今日随访任务

- 显示最多5条待完成任务
- 点击勾选完成（乐观更新）
- 空状态提示

#### 3.2.5 我的服务团队

- 显示主治医师和健管师姓名/职称
- 点击进入 AI 聊天

#### 3.2.6 刷新策略

- 首次加载：页面挂载时请求
- 焦点刷新：从录入页/其他页返回时自动刷新
- 下拉刷新：手动触发

#### 3.2.7 系统消息推送触发

- 每日首次打开首页自动调用推送检查接口（localStorage 记录日期）
- 推送静默失败，不影响页面加载

---

### 3.3 健康档案（Records）

#### 3.3.1 健康记录列表

- 支持类型筛选（血压/血糖/心率/体重/睡眠）
- 按时间倒序排列
- 趋势图（折线图，最近14条数据）
- Demo 用户展示 Mock 数据；真实用户仅展示真实数据

#### 3.3.2 录入新记录（AddRecord）

**支持录入类型：**
- 血压：收缩压 + 舒张压（mmHg）
- 血糖：mmol/L，支持餐前/餐后标注
- 心率：bpm
- 体重：kg
- 睡眠：h（支持小数）

**录入后：**
- 保存至数据库
- 返回记录页（触发首页焦点刷新）

#### 3.3.3 健康报告（HealthReport）

- 支持周报/月报切换
- 显示各指标最新值、趋势方向（↑↓→）、期间变化量
- 健康评分（基于记录频率、任务完成率、异常指标计算）
- Highlights 亮点/预警文字

#### 3.3.4 体检报告（ReportUpload）

**上传：**
- 支持图片（jpg/png）和 PDF
- 文件 <3MB 时读取 base64 DataURL 存储用于预览
- 表单：标题、类型、医院、日期、状态、关键发现

**展示：**
- 卡片列表，含类型标签、状态标签、关键发现标签
- 点击卡片 → 预览弹窗

**预览弹窗：**
- 图片：直接展示
- PDF：在新标签页打开
- 无内容：显示报告基本信息

---

### 3.4 随访任务（Tasks）

- 任务列表，按优先级+创建时间排序
- 分类：随访/用药/运动/饮食/复查/生活/其他
- 点击勾选完成（乐观更新，失败时回滚）
- `key` 使用 `_id || id`（兼容后端和 Mock 数据）

---

### 3.5 消息中心（Messages）

**消息来源：**
- `doctor`：医生发来的消息
- `manager`：健管师发来的消息
- `system`：系统自动推送
- `user`：用户发出的留言

**功能：**
- 消息列表，按时间倒序
- 点击标记已读
- 全部已读按钮
- 未读消息数角标（Tab 栏显示）
- 用户发消息给医生/健管师

---

### 3.6 问卷（Questionnaire）

#### 3.6.1 题目设计（7题）

| 题号 | 类型 | 题目 |
|------|------|------|
| Q1 | 单选 | 吸烟习惯（从不/已戒/偶尔/每天） |
| Q2 | 多选 | 确诊慢性病（高血压/糖尿病/冠心病/高脂血症/慢性肾病/其他/无） |
| Q3 | 量表 1-10 | 近两周睡眠质量 |
| Q4 | 单选 | 每周运动频率 |
| Q5 | 矩阵 | 近两周心理状态（入睡困难/紧张焦虑/情绪低落/食欲减退 × 无/轻度/中度/重度） |
| Q6 | 文本 | 当前用药（选填） |
| Q7 | 单选 | 家族遗传病史 |

#### 3.6.2 提交与结果

- 答案自动同步至用户健康档案
- 计算额外加分（不吸烟+5，运动规律+4~5，睡眠好+分）
- 返回**个性化健康建议**（3种类型：warning/tip/good）
- 成功页展示：健康评分 + 奖励分 + 建议卡片列表

---

### 3.7 用药计划（Medication）

- 用药列表（药品名/剂量/频率/时间）
- 每日打卡（今日服药状态）
- 添加新用药
- 删除用药

---

### 3.8 AI 问诊（Chat）

- 基于 Anthropic Claude API
- 支持角色切换（AI 医生 / AI 健管师）
- 用户信息作为 System Prompt 上下文
- 对话历史在会话内保持

---

### 3.9 提醒管理（Reminders）

- 健康提醒列表
- 开关控制启用/禁用
- 添加自定义提醒
- 删除提醒

---

### 3.10 服务商城（ServiceMall）

**服务包列表：**（由后端配置）

| 服务 | 类型 | 描述 |
|------|------|------|
| 专属医生随访服务 | 医疗 | 每月2次视频随访 |
| 健康管理师服务 | 管理 | 每日健康指导 |
| 24小时健康监测 | 监测 | 实时指标监控 |
| 营养膳食方案 | 营养 | 个性化饮食计划 |
| 运动康复计划 | 运动 | 专属运动方案 |
| 心理健康疏导 | 心理 | 专业心理支持 |

**下单流程：**
- 选择服务 → 填写备注 → 确认下单
- 后端同时创建 Order 记录和 Task 记录

---

### 3.11 续费（Renewal）

**套餐选项：**

| 套餐 | 价格 | 周期 | 备注 |
|------|------|------|------|
| 年度服务包 | ¥2,980 | 12个月 | 推荐，高亮展示 |
| 半年服务包 | ¥1,680 | 6个月 | — |
| 季度服务包 | ¥980 | 3个月 | — |

**流程：**
- 展示当前服务状态（生效中/即将到期/已到期）
- 选择套餐 → 确认弹窗（显示价格摘要）→ 提交 → 成功页

---

### 3.12 我的（Profile）

#### 3.12.1 顶部信息卡

- 头像（名字首字生成）
- 姓名、年龄、性别、手机号
- 3项统计：健康评分 / 服务剩余天数 / 本月记录数

#### 3.12.2 服务包卡片

- **已开通：** 显示套餐名、到期日、剩余天数，按钮"续约"→ RenewalScreen
- **未开通：** 引导卡，按钮"了解详情"→ ServiceMallScreen

#### 3.12.3 功能菜单

| 菜单项 | 跳转/功能 | 角标 |
|--------|-----------|------|
| 我的订单 | OrdersScreen | 待跟进订单数 |
| 编辑资料 | EditProfileScreen | — |
| 通知设置 | NotificationSettingsScreen | 当前状态（已开启/已全部关闭） |
| 账户安全 | AccountSecurityScreen | — |
| 帮助与反馈 | HelpFeedbackScreen | — |
| 退出登录 | 确认弹窗后清除 Token | — |

---

### 3.13 编辑资料（EditProfile）

**基本信息：**姓名、年龄、性别

**身体数据：**身高（cm）、体重（kg）

**生活习惯：**吸烟习惯、饮酒习惯、运动频率

**健康档案（7字段）：**
| 字段 | 说明 |
|------|------|
| 血型 | ABO+Rh |
| 药物过敏史 | 文本 |
| 食物过敏史 | 文本 |
| 既往病史 | 文本 |
| 用药史 | 文本 |
| 家族病史 | 文本 |
| 手术史 | 文本 |

**账户信息：** 展示手机号（不可编辑，点击进入账户安全页）

---

### 3.14 账户安全（AccountSecurity）

- 更换手机号流程：
  1. 输入新手机号
  2. 发送验证码（非生产环境固定 `123456`）
  3. 输入验证码 → 完成换绑
- 验证码5分钟有效期
- 新号不能与当前号相同，不能已被其他账户使用

---

### 3.15 通知设置（NotificationSettings）

开关类型（存储在 localStorage `jy_notif_settings`）：
- 健康提醒
- 随访通知
- 用药提醒
- 系统通知

---

## 四、系统消息自动推送

触发时机：每日首次打开首页（localStorage 日期判断）

**推送规则（每类每24小时最多一条）：**

| 规则 | 触发条件 | 消息标题 |
|------|---------|---------|
| 血压异常 | 收缩压 ≥140 | 血压异常提醒 |
| 血压偏高 | 收缩压 130–139 | 血压偏高提醒 |
| 血糖偏高 | 血糖 ≥7.0 mmol/L | 血糖偏高提醒 |
| 血糖偏低 | 血糖 <3.9 mmol/L | 血糖偏低提醒 |
| 心率偏快 | 心率 >100 bpm | 心率偏快提醒 |
| 心率偏慢 | 心率 <50 bpm | 心率偏慢提醒 |
| 服务将到期 | 剩余 ≤14天 | 服务包即将到期 |
| 无记录提醒 | 近7天无健康记录 | 健康记录提醒 |

去重逻辑：数据库查询该 title 的 system 消息是否在 24h 内已存在。

---

## 五、管理后台（Admin）

### 5.1 登录

- 用户名 + 密码认证
- 默认账号：`doctor1` / `manager1`，密码：`jiayi2024`
- 角色区分：doctor（医生）/ manager（健管师）

### 5.2 数据总览（Dashboard）

- 统计卡：总患者数、本周新增、待跟进订单数、患者留言数
- 最新注册患者表格（5条）

### 5.3 患者管理

**列表页：**
- 分页（每页20条）
- 搜索：姓名/手机号模糊搜索
- 筛选：全部 / 已开通服务 / 未开通服务
- 列：姓名、手机号、年龄性别、服务包、到期日、健康评分、注册时间

**详情页（5个Tab）：**

| Tab | 内容 |
|-----|------|
| 概览 | 最新健康指标（5项）、基本信息、健康档案 |
| 健康记录 | 所有记录列表（类型/数值/时间） |
| 任务 | 任务列表 + 创建任务按钮 |
| 消息 | 对话气泡形式展示消息历史 + 发消息按钮 |
| 订单 | 订单列表（服务/金额/状态/备注/时间） |

**操作：**
- 发消息（以医生/健管师身份）→ 患者消息页即时可见
- 创建任务（标题/分类/描述/优先级）

### 5.4 订单管理

- 按状态筛选（全部/待联系/已安排/已完成/已取消）
- 状态流转操作：
  - 待联系 → 标记已安排 / 取消订单
  - 已安排 → 标记完成 / 取消订单
- 点击患者名跳转患者详情

### 5.5 消息中心

- 查看所有患者发给医生/健管师的留言
- 分页，按时间倒序
- 点击"回复"→ 跳转患者详情消息 Tab

---

## 六、数据模型

### User（患者）
```
phone, name, age, gender, avatar, healthScore
servicePackage, serviceExpiry
doctor{name,title}, manager{name,title}
height, weight, smoking, drinking, exercise
onboardingCompleted, scoreHistory[{score,date}]
healthProfile{bloodType,drugAllergy,foodAllergy,
  pastHistory,medicHistory,familyHistory,surgeryHistory}
```

### HealthRecord（健康记录）
```
user, type(bloodPressure/bloodSugar/heartRate/weight/sleep)
value, unit, extra{sys,dia,...}, note, recordedAt
```

### Task（随访任务）
```
user, title, category, description, priority(1-3)
status(pending/completed), source, completedAt
```

### Message（消息）
```
user, type(doctor/manager/system/user)
sender, title, content, unread, readAt
```

### Order（服务订单）
```
user, serviceId, serviceName, servicePrice, serviceIcon
note, status(pending/scheduled/completed/cancelled)
scheduledAt, completedAt
```

### MedicalReport（体检报告）
```
user, title, type, hospital, date, pages, fileSize
status(pending/normal/abnormal), keyFindings[]
content(base64,<4MB), mimeType
```

### Admin（管理员）
```
username, password(bcrypt), name
role(doctor/manager/superadmin), title
```

---

## 七、接口清单

### C 端接口（Bearer Token）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/send-code` | 发送验证码 |
| POST | `/api/auth/login` | 登录 |
| GET  | `/api/user/me` | 获取当前用户 |
| PUT  | `/api/user/me` | 更新用户信息 |
| POST | `/api/user/onboarding` | 完成引导 |
| GET  | `/api/user/dashboard` | 首页汇总数据 |
| GET  | `/api/user/report` | 健康报告（?period=week/month） |
| POST | `/api/user/change-phone/send-code` | 换号发验证码 |
| POST | `/api/user/change-phone` | 完成换号 |
| GET  | `/api/records` | 健康记录列表 |
| GET  | `/api/records/trend/:type` | 趋势数据 |
| POST | `/api/records` | 新增记录 |
| DELETE | `/api/records/:id` | 删除记录 |
| GET  | `/api/medications` | 用药列表 |
| POST | `/api/medications` | 添加用药 |
| POST | `/api/medications/:id/checkin` | 打卡 |
| DELETE | `/api/medications/:id` | 删除用药 |
| GET  | `/api/tasks` | 任务列表 |
| POST | `/api/tasks` | 创建任务 |
| PATCH | `/api/tasks/:id/complete` | 完成任务 |
| GET  | `/api/messages` | 消息列表 |
| PATCH | `/api/messages/:id/read` | 标记已读 |
| PATCH | `/api/messages/read-all` | 全部已读 |
| POST | `/api/messages` | 发送消息 |
| GET  | `/api/reminders` | 提醒列表 |
| POST | `/api/reminders` | 创建提醒 |
| PATCH | `/api/reminders/:id/toggle` | 切换启用 |
| DELETE | `/api/reminders/:id` | 删除提醒 |
| GET  | `/api/reports` | 体检报告列表 |
| GET  | `/api/reports/:id` | 体检报告详情（含content） |
| POST | `/api/reports` | 上传体检报告 |
| DELETE | `/api/reports/:id` | 删除体检报告 |
| POST | `/api/chat` | AI 问诊 |
| POST | `/api/questionnaire` | 提交问卷 |
| GET  | `/api/services` | 服务列表 |
| POST | `/api/services/order` | 下单 |
| GET  | `/api/orders` | 我的订单 |
| PATCH | `/api/orders/:id/cancel` | 取消订单 |
| POST | `/api/feedback` | 提交反馈 |
| POST | `/api/system/push` | 系统消息推送检查 |

### 管理后台接口（Bearer Token, type:admin）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/admin/login` | 管理员登录 |
| GET  | `/api/admin/dashboard` | 统计数据 |
| GET  | `/api/admin/patients` | 患者列表 |
| GET  | `/api/admin/patients/:id` | 患者详情 |
| POST | `/api/admin/patients/:id/message` | 发消息给患者 |
| POST | `/api/admin/patients/:id/task` | 创建患者任务 |
| GET  | `/api/admin/orders` | 订单列表 |
| PATCH | `/api/admin/orders/:id/status` | 更新订单状态 |
| GET  | `/api/admin/messages` | 患者留言列表 |

---

## 八、待优化方向

### 性能
- Railway 冷启动优化（Keep-alive / 升级计划）
- 首屏加载骨架屏已实现，可进一步优化 JS bundle 体积

### 功能完善
- 消息推送：真实短信/推送通知（目前为应用内通知）
- 支付集成：续费/下单实际支付流程
- 体检报告：AI 自动识别关键指标
- 健康报告分享：生成可分享链接

### 数据安全
- 体检报告 base64 存储上限（MongoDB 16MB 文档限制），大文件应迁移至 OSS
- 管理员密码应在首次部署后强制修改

### 运营
- 管理后台：数据导出（Excel）
- 管理后台：推送统计与患者活跃度分析
- A/B 测试：问卷题目和推荐文案优化

---

*文档由 Claude 根据实际开发内容整理，如有遗漏或调整请告知。*
