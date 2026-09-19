# 用户端小程序：登录审核、推送支付、健康管家红点

## 基线和发布边界

- 2026-09-19 拉取 GitHub，从 `origin/master` 的 `72429589` 创建独立分支 `fix/miniprogram-review-payment-badge-20260919`，保留此前主干功能。
- 用户确认线上为 1.0.165、1.0.166 曾提审。本次未找到可核验的 1.0.166 上传清单，不能把“主干包含修复”表述为“原审核包已包含修复”。
- 主干包含 `0ed6f829`、`0f1e32c7`、`c1692676` 的推送支付修复。此前取消登录的 `5a219cac` 不在当前主干历史中，本次针对最新源码重新补齐。
- 本次未执行生产部署、微信上传、重新提审或真实扣款。上线需部署后端、上传本工作区新构建并完成真机验收与微信提审。

## 修改

1. 登录表单顶部提供“暂不登录，先浏览”，不依赖手机号、验证码或协议勾选；清除登录回跳地址后返回首页，保留短信及微信手机号登录。首页等待会话恢复，游客只请求公开服务；商城和公开报告分享页允许游客访问。
2. 保留既有推送微信支付链路：声明 `wechat_jsapi_v1`、调起收银台、查询服务端支付结果。缺失支付参数、用户取消、确认超时均不显示成功。单品旧记录兼容、基金及优惠券、服务归属规则保持原实现。
3. 全局与消息页共用角标更新模块，只采用服务端可见未读数；已读操作使旧请求失效，串行写入原生角标；网络失败保持上次结果，退出登录清除角标。
4. 消息列表、线程、计数复用 AI 审核可见性查询，排除撤回、待审/拒绝 AI 内容及用户自发消息的遗留 unread 标记；无效、停用、删除、已完成、已取消订单的问卷不会制造空角标。
5. 列表保留最近 50 条并合入历史未读，推送额外保留问卷入口；历史角色会话可查看，权限仍由原后端控制。通知与角色会话不重复计数。部分请求失败保留已加载消息并显示重试提示。

后端消息读取为 App 和小程序共用。未修改 App 页面、医护端、管理端或订单创建/结算业务，没有迁移、删除或批量标记历史消息。

## 验证

从仓库根目录执行（沿用现有依赖，未修改锁文件）：

```powershell
node --test backend/test/messageInbox.test.js backend/test/singleProductPushPayment.test.js backend/test/checkupQuestionnaireWorkflow.test.js backend/test/conversationRoles.test.js backend/test/latestConversationMessages.test.js backend/test/orderInventory.test.js backend/test/healthFundAllocation.test.js backend/test/healthFundProductRule.test.js miniprogram/test/*.test.js
```

60 项通过、0 项失败，包含 14 项新增行为用例：登录拒绝、支付成功/取消/超时/缺失参数、角标竞态、历史未读、无效问卷和用户隔离。原基线存在的日期断言已固定测试时钟，旧支付测试已跟随现有 `serviceOwnership` 函数迁移；这些调整没有修改对应业务逻辑。

```powershell
Set-Location miniprogram
node ../node_modules/@tarojs/cli/bin/taro build --type weapp
```

微信小程序生产构建通过，输出 `miniprogram/dist`；正式 AppID 沿用 `wx50062146332b1b20`。

## 真机验收

- 清除登录态后启动、从分享入口启动，未勾选协议时点击“暂不登录，先浏览”，确认首页/商城可浏览；主动登录后个人服务正常。
- 体验版打开已有医护推送单品，确认微信收银台；取消不显示成功。真实付款由用户本人完成，服务端确认后核对订单和工作人员待办。
- 健康管家进入/退出会话、切换 Tab、前后台切换，持续观察轮询；无可见未读时角标保持消失，有真实新消息时仍出现。
