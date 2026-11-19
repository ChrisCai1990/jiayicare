# 医护安卓消息提醒：华为优先试用

## 2026-11-19 0.1.3 排障包

- 服务端推送凭据和开关已配置，`pushReady()` 为真；用户安装并开启 0.1.2 后，生产只读检查仍为 0 台设备、0 条投递。因此后台通知和桌面角标尚未经真机验证。
- 0.1.3 增加 WebView 录音权限桥接：只允许 `https://staff.jiaycare.com` 的语音采集请求，用户首次录音时由 Android 弹出麦克风权限。网页现有文字发送、语音录制、播放接口继续使用。
- 0.1.3 提醒按钮显示连接状态；取得华为 Token 后尝试向生产接口登记，接口失败显示 HTTP 状态，华为服务取 Token 失败提示重试。按钮可再次触发取 Token。此包仅供内部诊断，不能把编译成功视为推送送达。
- APK：`staff-android/build/jiayicare-staff-huawei-pilot-debug.apk`，包名 `com.jiayicare.staff`，versionCode 4 / versionName 0.1.3，SHA-256 `0052BEF465947657A7895D3C7E75635534885E6DCF33F41AD78C27673A7A2C12`。签名指纹与华为后台已登记的调试签名一致。覆盖安装后需在手机上观察按钮状态，并用新客户消息测试通知与角标。

## 2026-11-19 0.1.4 群聊和手机布局

- 用户在华为真机确认 0.1.3 显示“提醒已连接”，生产只读检查为 1 台有效设备；一对一新客户消息的角标已由用户真机确认。服务群测试没有进入旧版投递队列，因为此前华为推送只接一对一消息。
- 服务群客户新消息从本版后端起标记推送资格，扫描时仅向当前实际入群且仍分配该客户的在职医护排队，发送前再次检查成员、客户、机构、模块权限及待人工回复状态。旧服务群消息不补推。通用通知不含客户身份或正文；角标计入一对一未读消息和待回复服务群数。服务群推送仍需上线后真机测试。
- 医护网页版在手机打开服务群会收起筛选等顶部内容、压缩群资料与输入栏；安卓版识别专属 User Agent，隐藏重复网页导航。工作台手机端改为横向标签和紧凑会话列表。
- 手机群语音改为点按开始、再次点按发送，可取消，避免首次麦克风授权打断长按手势。真机语音录制和发送仍需复测。
- APK `staff-android/build/jiayicare-staff-huawei-pilot-debug.apk` 为 0.1.4，versionCode 5，SHA-256 `88F50A072D5113B493811623E685D58966DD8463C5688F513A0BE3FA608AF097`；签名与 0.1.3 一致。前端 Vite 构建通过；`staffPush.test.js` 和 `staffGroupPush.test.js` 共 6 项通过。

## 现状

- 独立工作树 `pilot/staff-android-messages-20261118` 起自 `49cbb00a`；后端及医护网页已通过发布提交 `10415922` 上线，生产健康检查和医护页面可访问。服务端尚未配置华为凭据和启用开关，故后台系统通知仍未生效。
- 可安装的 `staff-android/build/jiayicare-staff-pilot-debug.apk` 使用嘉医汇 Logo，可登录、查看和回复客户消息，但没有后台系统推送或桌面角标。
- 2026-11-19 更新的 `staff-android/build/jiayicare-staff-huawei-pilot-debug.apk` 为 `0.1.2`（SHA-256 `F462FCE7847812360B3A60405A6A1F3288E33F890CD55102A78688BCAFCC1F64`），已含医护专属华为配置和“开启提醒”入口。桌面图标改用嘉医汇 Logo 左侧方形品牌符号，保持比例；App 打开时不再依赖推送 Token 才查询未读数，并声明华为桌面角标权限。尚需服务端接通与真机验证，不能将其当作通知或角标已可送达。
- 已准备华为 Push Kit 专用 `push` 构建变体。服务端按客户当前所属医护、岗位、机构和有效登录设备定向发送简短提醒，并在华为通知里设置未读角标。打开 App 时每 15 秒同步未读数，退出登录时解绑设备。
- 默认关闭：需要 `STAFF_PUSH_ENABLED=true`、`STAFF_PUSH_START_AT`、`STAFF_HUAWEI_PUSH_CLIENT_ID`、`STAFF_HUAWEI_PUSH_CLIENT_SECRET`。启动时间以前的留言不补推。通知不含客户姓名和消息正文。第三方凭据只放服务端。

## 真机接通所需

1. 2026-11-18 已在现有企业华为项目下创建“嘉医汇医护”Android 手机应用，APP ID `119869889`，包名 `com.jiayicare.staff`；未上架。客户 App 的应用 ID 不适用于医护包。
2. 已在华为后台为该医护应用登记本机 Gradle 调试签名 SHA-256 指纹 `A5:23:F3:DE:D2:D0:23:5D:68:09:57:A1:CA:E3:5E:C0:4F:9C:FE:FB:2B:D3:88:CC:E4:4D:EE:DB:1A:FD:2C:73`，推送服务项目状态显示“正常”。用户提供的医护应用专属 `agconnect-services.json` 已核对 APP ID 和包名并放入 `staff-android/app/`，由 Git 忽略。工程默认使用上述医护 APP ID，也可通过 `STAFF_HUAWEI_APP_ID` 或 Gradle 参数覆盖。正式发布须使用妥善保管的正式签名证书。
3. 服务端私有环境填写该医护应用的 Client ID / Client Secret 和启动时间，部署经过复核的后端及医护网页后再开启开关。
4. 用合成客户和医护账号在华为真机验收后台通知、点按进入消息、已读角标归零、切换账号和退出后不再接收。其他安卓品牌暂不承诺系统通知或角标；现有企业微信提醒是独立链路，其线上启用状态须另核验。

## 验证边界

`node --test backend/test/staffPush.test.js` 4 项通过；`messageInbox.test.js` 借用匹配依赖后 6 项通过。`assemblePushDebug` 使用 AGConnect 插件 `1.9.6.300` 编译通过，APK 包名 `com.jiayicare.staff`、APP ID `119869889`、签名 SHA-256 与控制台一致，`push_configured=true`。后端和医护网页已部署，但推送开关关闭、未做华为真机验收，因此不能声称通知或角标已送达。`adb devices` 当时未列出已连接手机。

华为文档：[Android 获取推送 Token](https://developer.huawei.com/consumer/en/doc/HMS-References/push-HmsInstanceId-cls/)、[服务端发送 API](https://developer.huawei.com/consumer/en/doc/HMS-References/push-sendapi/)、[角标](https://developer.huawei.com/consumer/en/doc/hmscore-guides/android-badging-0000001050042083/)、[SDK 集成](https://developer.huawei.com/consumer/en/doc/hmscore-guides/android-integrating-sdk-0000001050042006/)。
