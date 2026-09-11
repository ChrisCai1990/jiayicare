# 企业微信客户群 AI 自动回复方案调研

## 结论

截至 2026-09-11，企业微信没有可用于“含微信客户的外部客户群”的官方开放接口，使自建 AI 读取客户任意群消息并以机器人身份在原群自动回复。官方可上线的客户群自动化是“@小助理/服务人员 + 关键词或默认文案”的规则回复；自由问答 AI 应走独立的微信客服会话，或留在群内以“AI 拟稿、人工确认发送”方式实现。

企业微信“智能机器人”确实可支持 AI 回调、流式回复和群聊 @ 触发，但可公开复核的产品/开发资料均将其群聊范围限定为企业内部群，不能据此推断外部客户群可用。[1][2][3]

## 业务能力对照

| 需求 | 官方可行性 | 能否在原客户群完成 | 推荐程度 |
| --- | --- | --- | --- |
| 客户群常见问题自动答复 | 可行：小助理关键词/默认回复 | 可以 | 立即启用 |
| 客户群任意消息由 AI 理解并自动答复 | 无官方通道 | 不可以 | 不做绕过 |
| 客户进入独立会话后 AI 自动答复 | 可行：微信客服 API | 不能留在原群，但体验连续 | 首选开发方向 |
| 群内 AI 生成答案，医护确认后发送 | 可行：人工使用现有群聊天 | 可以 | 健康服务首选 |
| 员工内部群 AI @问答 | 可行：智能机器人 | 可以，仅内部群 | 可用于团队知识助手 |
| 外部群读取/自动回复的 RPA、Hook、协议机器人 | 技术上可见实现 | 表面可行，但非官方 | 不纳入生产 |

## 已识别的 GitHub 路线

### A. 微信客服 API：面对外部客户的官方自动回复

这是最接近“客户随时发消息，AI 随时回复”的路径。客户从群公告、欢迎语、关键词回复或小程序中点击“咨询小嘉 AI”后，进入企业微信的微信客服会话。客户消息触发回调，服务端以 `sync_msg` 拉取内容，调用 AI 后用 `send_msg` 回复；客服状态还能切至人工接待。企业客服 API 的主动回复受客户最后发言后 48 小时和条数等窗口限制，应以上线时官方文档为准。[4]

| 项目 | 适合借鉴的内容 | 不应直接照搬的部分 |
| --- | --- | --- |
| `zhuy24721-cmyk/wecom-dify-customer-service-public` | FastAPI 回调、`sync_msg`、Dify、`SAFE_MODE`、转人工提醒 | 0 star 的 V1 示例；去重与 cursor 在内存，重启会丢失，作者也建议改 Redis/数据库 [5] |
| `iocion/wechat_customer` | 客服会话状态机、队列、技能路由、转人工 | Python/GLM 独立服务，与 JiayiCare Node 后端重复 [6] |
| `lc-cn/onebots` + `@onebots/adapter-wecom-kf` | TypeScript 适配器，可嵌入现有同步器，游标可持久化；包近期仍在发布 | 是通用 IM 网关，对单一 JiayiCare 通道可能过重 [7] |
| `langbot-app/LangBot` | 更完整的开源多渠道平台，含微信客服和企微智能机器人；Apache-2.0、近期发布活跃 | 引入第二套 Agent、知识库、会话和存储，不应与患者档案双写 [8] |

### B. 企业微信智能机器人：仅供内部团队

`easy-wx/wecom-ai-bot-cb-svr`、`Cielo730/dify_wecombot`、`AstrBot`、`LangBot`、`FastGPT` 都能把机器人回调/长连接接到大模型，并支持群聊中的 @机器人、流式消息或卡片。[1][9][10][11]

它们非常适合嘉医汇内部群：医护可 @“小嘉助手”查询 SOP、服务目录、已确认的流程信息，或由机器人把待办摘要推给内部群。但不能作为“客户服务群内自由 AI 回复”的证据：这些项目的企微智能机器人文档明确写的是企业内部群。[2][3]

### C. 客户群运营与 AI 副驾驶：群内保留人工发送

`wkin-t/dingtalk-ai-bot` 的客户群设计把“内部群智能机器人”和“客户群运营”明确拆开：客户群不假设可 @机器人实时对话，AI 只生成待审批的运营文案。[12] 这与健康服务更匹配：AI 可以结合客户已授权、已审核的资料生成草稿，但由嘉小瑞/医护复核后在原群发送。

### D. RPA、截图 OCR、个人微信/平板协议：不进入候选生产方案

GitHub 上可见以屏幕截图、OCR、键鼠模拟自动读写企业微信的项目，也有个人微信协议机器人。这些并不是企业微信向外部客户群提供的机器人 API；它们依赖模拟客户端行为，难以证明消息来源、同意范围、回复归属与审计边界。对涉及健康信息、图片、报告的嘉医汇，不应以此替代官方接口。该结论是基于官方接口范围和实现方式作出的风险判断，而非对所有此类项目逐一作法律结论。[13]

## 嘉医汇的推荐架构

不复制任何完整 GitHub 项目，而是在 JiayiCare 现有 Node 后端中增加一个窄的微信客服通道：

```text
客户群：关键词回复/“咨询小嘉 AI”入口
        ↓
企业微信客服：加密回调 → sync_msg
        ↓
JiayiCare wecom-kf adapter
  ├─ 幂等：msgid、cursor、客服会话、发送记录持久化
  ├─ 分流：规则问答 / AI 可回答 / 必须人工
  ├─ AI：复用现有小嘉服务边界与模型调用
  └─ 回复：send_msg 或转人工待办
        ↓
客户收到客服会话回复；医护在现有工作台接管
```

现有 `/api/chat` 已有“健康规划、不得诊疗/开药、紧急情况提示、转人工、对话日志”等控制，适合作为 AI 业务内核；微信客服适配层只负责平台验签、消息状态、客户身份关联和发送，不将群聊原文或私有报告默认传给模型。

建议明确拆成三条数据域：

1. **客户群规则**：关键词、回复素材、版本、群启用状态、命中日志；不含客户健康上下文。
2. **微信客服会话**：`open_kfid`、外部用户标识、消息 ID、cursor、AI/人工状态、发送窗口与转人工原因；保留最小必要内容和到期策略。
3. **JiayiCare 健康档案**：仅在客户已登录/确认绑定、且业务确有必要时读取最小摘要；报告、症状、用药与图片不得自动带入通用客服上下文。

## 健康场景的自动化边界

| 消息类型 | 自动处理 | 后续动作 |
| --- | --- | --- |
| 服务时间、预约入口、报告上传方式、价格/流程 | 允许规则或 AI 回复 | 记录匿名/最小会话日志 |
| 复查准备、已有服务的办理进度 | 可使用已确认的系统事项做保守回复 | 需要时转健康规划师 |
| 症状、指标解释、疾病判断、用药、检查项目 | 不给诊疗回答 | 固定边界提示 + 转人工/正规就医建议 |
| 胸痛、呼吸困难、意识异常等紧急表达 | 不等待模型 | 固定紧急提示，建议立即 120/就医 |
| 报告、饮食照片、检查单 | 不自动入档或自动解读 | 在小程序/医护侧边栏选择客户和用途后确认 |

## 可执行路线

### 第 1 阶段：客户群内立即可用

在企业微信客户联系后台配置小助理：`服务时间`、`预约`、`上传报告`、`咨询小嘉`、`转人工` 等关键词和默认回复。默认回复只引导客户进入客服/小程序，不尝试猜测健康问题。群主逐群启用，并用测试群记录实际触发结果。[14]

### 第 2 阶段：微信客服 AI 安全试运行

1. 创建独立的“嘉医汇咨询小嘉”微信客服账号并授权一个自建应用。
2. 在 JiayiCare 增加 `wecom-kf` 回调，不复用现有服务群“桥接收件箱”。
3. 先以 `SAFE_MODE`：落库、生成草稿、只通知医护，不对客户发送。
4. 选少量低风险 FAQ 开启真实 `send_msg`；所有高风险表达强制转人工。
5. 将 `msgid`、cursor、回复版本、风控命中与人工接管保存到数据库；服务重启不得重答历史消息。

### 第 3 阶段：原群 AI 副驾驶

在已部署的家庭服务助手中生成“可复制的建议回复”，显示资料来源、风险标签和发送前检查。嘉小瑞确认后手动发送；不宣称为机器人自动发送。此阶段最适合客户已在群里发送饮食、执行打卡或服务协调信息的服务体验。

## 立项判断

推荐立项“微信客服 AI 自动回复 + 客户群关键词引流 + 群内 AI 拟稿确认发送”。不推荐立项“外部客户群中直接托管一个自由回复机器人”，因为官方接口边界不支持；使用非官方方案会把账号稳定性、健康信息处理、同意和审计都变为不可控风险。

## Sources

1. 企业微信开发者中心镜像，［智能机器人：接收消息］，更新于 2026-05-18，https://github.com/KevinShiCN/WxWorkAPI/blob/main/docs/%E6%9C%8D%E5%8A%A1%E7%AB%AFAPI/%E6%B6%88%E6%81%AF%E6%8E%A5%E6%94%B6%E4%B8%8E%E5%8F%91%E9%80%81/%E6%99%BA%E8%83%BD%E6%9C%BA%E5%99%A8%E4%BA%BA/%E6%8E%A5%E6%94%B6%E6%B6%88%E6%81%AF.md
2. AstrBot，［接入企业微信智能机器人平台］，2026-03-14，https://github.com/AstrBotDevs/AstrBot/wiki/zh-platform-wecom_ai_bot
3. 阿里云，无影 Agent 专属云电脑：［消息通道］，2026，https://help.aliyun.com/zh/jvs/message-channel
4. 企业微信微信客服 `send_msg` 接口说明镜像，https://metacpan.org/pod/QQ%3A%3Aweixin%3A%3Awork%3A%3Akf
5. zhuy24721-cmyk，［wecom-dify-customer-service-public］，GitHub，2026，https://github.com/zhuy24721-cmyk/wecom-dify-customer-service-public
6. iocion，［wechat_customer］，GitHub，2026，https://github.com/iocion/wechat_customer
7. lc-cn，［OneBots］与 `@onebots/adapter-wecom-kf`，GitHub/npm，2026，https://github.com/lc-cn/onebots ; https://www.npmjs.com/package/%40onebots/adapter-wecom-kf
8. langbot-app，［LangBot］，GitHub，2026，https://github.com/langbot-app/LangBot
9. easy-wx，［wecom-ai-bot-cb-svr］，GitHub，2026，https://github.com/easy-wx/wecom-ai-bot-cb-svr
10. Cielo730，［dify_wecombot］，GitHub，2026，https://github.com/Cielo730/dify_wecombot
11. labring，［FastGPT 接入企微机器人教程］，GitHub，2026，https://github.com/labring/FastGPT/blob/main/document/content/guide/build/publish/wecom.mdx
12. wkin-t，［企业微信客户群能力深化设计］，GitHub，2026，https://github.com/wkin-t/dingtalk-ai-bot/blob/master/WECOM_CUSTOMER_GROUP_DESIGN.md
13. JZQiang，［wecom-cs-mano］，GitHub，2026，https://github.com/JZQiang/wecom-cs-mano
14. 企业微信客户群自动回复说明，https://www.qusiyi.com/wecom-business-guide/246.html
