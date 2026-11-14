# 客户端版本对齐（2026-11-14）

用户要求异常排查可准确对齐版本，不再仅隐藏错误的v1.0.0。

- 我的页面展示客户端、实际安装版本、构建号、页面源码指纹，并可一键复制。页面指纹编译时生成，不能从服务器最新版本替代当前已加载页面。
- 苹果原生源ios-push-fix-20261112，最新云端1.0.2(5)对应3c3f87f，保留APNs与角标桥。使用SDK54匹配expo-application7.0.8读取nativeApplicationVersion/nativeBuildVersion，get-app-info与页面注入支持；页面加载失败时原生错误页也显示安装版本。
- 新候选1.0.3(6)，源码8830ac5。云端构建3f782026-bda7-447b-ba42-3a38fe87039c。构建/上传/提审/正式上架须分别核验。
- 老包无法读取时明确显示不支持；不将1.0.3或App Store最新版本冒充本机版本。网页显示不适用，小程序读getAccountInfoSync实际版本/环境，不伪造开发版号。
- 5项版本专项测试与3种浏览器模拟新包/旧包/网页状态、剪贴板复制通过。iOS平台bundle导出通过，真实设备安装验收尚未完成。
- 参考官方接口：https://docs.expo.dev/versions/latest/sdk/application/ 。
- 实际发布与小程序状态待回填。

## 苹果上传结果
- 2026-11-14 用户接受新版开发者许可协议；浏览器刷新确认接受日期为11月14日，商务页免费App协议有效、更新提示消失。
- 1.0.3（6）已成功上传 App Store Connect，提交回执7e16ad35-9fd3-49a0-b40b-c513b484e138，对应构建3f782026-bda7-447b-ba42-3a38fe87039c。苹果正在处理安装包，尚未提交App Review或正式发布。日志：工作区release-receipts/ios-version-submit-business-active-20261114.log。

