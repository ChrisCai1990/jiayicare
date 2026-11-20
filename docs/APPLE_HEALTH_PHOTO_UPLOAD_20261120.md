# 苹果 App 健康数据照片上传修复（2026-11-20）

- 用户录屏显示：在“今日健康数据”的饮食记录中选择照片后，页面提示“图片读取失败，请重试”，未进入保存请求。
- 原因：共用的小程序页面调用 `Taro.getFileSystemManager().readFileSync` 读取照片；苹果 App 当前加载的是 H5，选图后返回浏览器 URL，不能使用微信小程序文件系统接口。
- 修复：H5 通过 `fetch` 和 `FileReader` 读取选中照片，小程序保留本地文件读取；饮食、其他生活记录、症状和同页的血压、血糖、腰围、体重照片入口共用兼容逻辑。选图、上传和保存失败时显示中文提示，不直接透出英文平台或网络错误。
- 验证：相关源码通过 Babel JSX 解析和 `git diff --check`；使用工作区 Node 22/npm 与 React 18 依赖构建完整 H5，输出 48 个文件。构建只有原有的资源体积警告。
- 发布：仅更新已安装苹果 App 的 `https://app.joinwehealth.com/mobile-preview/` H5 入口，静态资源位于独立目录 `releases/health-photo-20261120/`。发布前检查线上入口哈希与资源冲突，发布时备份旧入口并校验 48 个文件；失败时脚本回滚入口。
- 最终线上入口 SHA256：`08fa4d2a6b185b1138fd059a3b1a796571da90daeaac57e7608309f714ca921a`。公网入口与两条入口脚本均返回 200；备份位于 `/var/backups/jiayicare-app-health-photo-20261120-08fa4d2a6b18/`。
- 未生成新的 iOS 安装包；真实 iPhone 相册选择及提交成功仍需设备操作复核。华为入口和小程序发布版本未改。

## 15:02 保存中与 15:11 英文菜单的后续处理

- 用户新截图显示照片已选中，但饮食记录停留在“保存中”。生产 Nginx 同时段记录 `POST /api/records` 返回 499（客户端断开），后端无成功响应；Taro H5 原请求时限为 15 秒。不能仅凭 499 判定服务端是否已保存。
- H5 选图时将照片最长边缩至 1600 像素并编码为 JPEG，单次记录的照片数据限制为 15 MiB；带照片的保存请求时限延至 60 秒。页面最长等待 65 秒，超时或连接中断时停止“保存中”并提示先到健康档案核对，以免重复提交。小程序选图流程仍使用原文件系统读取。
- 使用 Node 22/npm 构建完整 H5 成功，输出 48 个文件，只有资源体积警告。仅 Apple App H5 入口发布到 `releases/health-photo-timeout-20261120/`，预检旧入口 SHA256 为 `08fa4d2a6b185b1138fd059a3b1a796571da90daeaac57e7608309f714ca921a`，最终线上入口 SHA256 为 `a4617f28c8712efe1567fd9edf2792ca4f611c2c89b320c9b3edfafc51b2d37a`；48 个文件已核验，备份在 `/var/backups/jiayicare-app-health-photo-timeout-20261120-a4617f28c871/`。
- 英文“Photo Library / Take Photo / Choose Files”为 iOS 原生 WebView 选图菜单。现有安装包不能靠 H5 翻译；iOS 源码另行配置简体中文本地化，需新安装包与真机验收。尚无本次真机保存成功证据。
