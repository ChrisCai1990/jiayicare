# iOS 服务消息与桌面角标

现有商店 1.0.0(3) 未包含原生 iOS 通知模块。只更新 H5 或服务器不能使旧安装包接收 APNs；需发布包含通知模块和 production APNs entitlement 的新安装包。

后端在既有登录会话绑定、未读消息队列和华为通道基础上增加 `apns`。用户须在设备上允许通知并主动绑定；退出登录、注销或会话失效后，该会话的目的设备不再被选取。客户端传入的用户/机构字段不能指定接收人。

Apple 收到通用服务消息文字、`kind=service-message` 和绝对未读数量，不发送健康内容、客户姓名或账号标识。当前发送入口沿用已保存的真人直接服务消息，不扩展 AI、草稿、撤回消息或未接入原队列的消息类型。前台读取消息后由 H5 同步角标，最大显示99。

配置须通过服务器私有环境管理：`NATIVE_PUSH_ENABLED=true`、`IOS_PUSH_ENABLED=true`，以及 `APNS_KEY_ID`、`APNS_TEAM_ID`、`APNS_PRIVATE_KEY_PATH`。私钥不进仓库。通道独立判断可用性；未配置或关闭 iOS 通道时保留既有华为功能。Store/TestFlight 使用 production APNs。

APNs HTTP 200 仅代表 Apple 接收，不等于设备已展示。网络和上游失败沿用有限重试；错误记录不包含设备令牌、JWT 或上游正文。

验证命令：

```sh
node --test backend/test/iosPush.test.js backend/test/nativePushConfig.test.js backend/test/nativePushDispatch.test.js backend/test/pushDeviceRegistry.test.js
```

发布前需完成原生签名构建及 H5 接入，真机核验首次授权、后台收到消息、未读数、读后清零及退出登录。不得将模拟传输测试称为实际 APNs 送达。
