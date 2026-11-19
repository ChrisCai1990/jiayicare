# 嘉医汇医护安卓试用版

安装后打开现有医护端的客户消息页，可用现有账号登录、查看和回复消息。桌面图标只使用嘉医汇横版 Logo 左侧的方形品牌符号，保持原始比例；顶部仍显示完整 Logo。图标素材可用 `make-launcher-icon.ps1` 从项目内 `geo-knowledge-center/assets/jiayihui-logo.png` 重建。页面与接口均使用正式 HTTPS 地址，APK 不包含客户数据或服务端密钥。

`push` 构建用于华为手机内部试用。生产端已接通华为 Push Kit；一对一与服务群的通知、桌面角标已由试用手机验证。其他安卓品牌的推送通道仍需单独接入。

0.1.5 起，医护手机内的一对一和服务群语音使用原生麦克风录成 16 kHz 单声道 WAV，再由现有接口发送；录音仅在受信任的医护网页且已获系统麦克风权限时启动。首次安装或覆盖安装后，需在华为真机验证实际录音、发送和播放。手机页面也压缩了一对一输入栏与服务群列表。

使用 Android SDK 36 和 JDK 17，在本目录运行 `powershell -File build-pilot.ps1`。默认使用本机 `D:\JiayicareBuild` 中的工具，也可通过 `ANDROID_HOME` 和 `JAVA_HOME` 指定其他位置。调试包输出为 `build/jiayicare-staff-pilot-debug.apk`，仅供内部试用，不是正式签名发布包。

Gradle 另有 `assembleDemoDebug` 和 `assemblePushDebug` 两种构建。后者包含华为 Push Kit；没有独立医护应用的 `app/agconnect-services.json` 和应用 ID 时隐藏“开启提醒”按钮。正式接通条件见 `../docs/STAFF_ANDROID_PUSH_20261118.md`。
