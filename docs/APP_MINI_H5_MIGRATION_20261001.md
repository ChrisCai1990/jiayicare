# 用户端 App 与小程序共用页面迁移（进行中）

目标：以 `miniprogram/src` 的 Taro 页面为功能基准，产出 App 可复用的 H5 界面；小程序仍使用原有 WeApp 构建。此前 v6 Android APK 只完成局部界面调整，不能视为迁移完成。

## 已完成

- 加入 Taro 3.6.32 H5 平台依赖，修复 H5 生产构建配置。H5 构建成功，访客态首页和四个主导航页面在浏览器可渲染。
- H5 登录页隐藏仅小程序可用的微信手机号快捷登录入口，保留短信登录路径。
- H5 短信登录不再尝试 `Taro.login()` 获取小程序凭证；2026-10-01 本机 Edge 使用隔离的模拟 API 走通手机号、验证码、协议同意、`/auth/login` 至首页，登录请求 `wxLoginCode` 为空且无页面脚本错误。真实短信登录仍待账号验证。
- 登录页打开协议文本时阻止事件冒泡，不会把查看条款误记为勾选同意。
- 图片选择结果统一转为 data URL：小程序读文件系统，H5 读浏览器 `File`/blob。报告上传、就医资料、筛查资料、健康打卡、消息照片和血压/血糖/体重拍照识别已调用共用读取方法。
- 消息语音在 H5 改用浏览器麦克风与 `MediaRecorder`（后端支持的 WebM/MP4），播放改用 `Audio`；小程序继续使用原 Taro 录音与播放接口。仍须真机验证 WebView 麦克风授权和实际收发。
- H5 对微信小程序 JSAPI 支付明确拦截，防止创建付费订单后才发现无法调用小程序支付；不伪造成功。免费路径仍交由后端核定。
- 可选原生壳内的付费路径先以 H5 登录态检查 `/payments/capabilities`，再让原生端验证 SDK/微信安装；只有成功后才以 `paymentScene=app` 创建或重试订单。原生 SDK 回调只是提示，H5 仍轮询服务端订单状态；独立浏览器 H5 继续阻止付费。预览包支付开关仍关闭，未做真实付款。
- 原生 App 加入可选 WebView 壳：仅在设置 HTTPS `EXPO_PUBLIC_SHARED_H5_URL` 时加载共用 H5 页面，默认仍显示现有原生页面。限制同源导航、处理 Android 返回键/加载失败；声明麦克风权限。尚未配置正式 H5 地址，也未在真机启用。
- 共用 H5 壳运行时不挂载旧原生 `AuthProvider`，避免两个独立登录态同时发起会话活动请求；支付由 H5 自己的登录态向后端核验，原生只提供 SDK 能力。
- H5 静态资源路径可用 `JIAYICARE_H5_PUBLIC_PATH=/mobile-preview/` 构建到独立站内目录；默认 `/` 只用于本地烟测。与 App 的 `EXPO_PUBLIC_SHARED_H5_URL` 必须指向同一个实际 HTTPS 目录。
- 体检报告原件在 H5 改为鉴权下载后生成当前页面的临时 Blob URL，图片与 PDF 在页内预览，关闭时释放 URL；旧版 base64 原件也可预览。Android WebView 的 PDF 渲染仍待真机验证。
- 支付与登录的现有小程序回归用例已更新平台模拟；新增独立 H5 禁止付费下单、原生 App 支付场景参数测试，避免共用页面把微信小程序 JSAPI 错用于 App。
- 定向 16 项平台/支付/媒体/原件预览测试通过；H5 与 WeApp 构建均通过。浏览器访客与登录页烟测不等于真机 App 验收。
- H5 的系统推送尚未接入，通知偏好开关暂禁用并明确告知用户可在“健康管家”页查看消息，避免本地开关造成已经开通系统推送的误解。
- 商城微信右上角分享菜单只在小程序调用；趋势图在 H5 用页面 Canvas 绘制同一份记录，避免小程序 Canvas API 在 App 壳中不可用。本机浏览器以隔离的测试数据验证血压趋势画布确有像素且无脚本错误；真实账号数据仍待验收。
- 2026-10-01 `build:h5`、`build:weapp`、Android Expo JS 导出，以及 `h5Audio.test.js`、`appBridge.test.js` 均通过；H5 只有打包体积警告，未进行真实账号或真机业务验收。
- H5 页面顶部不再套用微信小程序胶囊与状态栏预留高度；原生 WebView 的安全区由宿主处理。该调整的 H5 生产构建通过（仅打包体积警告）。
- H5 消息未读轮询改随网页可见状态启动/暂停，恢复前台后立即刷新；小程序仍沿用原 App 显示/隐藏生命周期。H5 再次生产构建通过（仅打包体积警告），尚未验证真实账号消息或系统级推送。
- 以 `/mobile-preview/` 作为 H5 静态资源目录重新构建，本机 Edge 验证该子路径加载登录页，访客进入首页并切到健康档案时 URL 保持在 `/mobile-preview/#/...`，页面无脚本异常。由于本地来源与生产 API 不同源且无生产会话，本次数据请求失败不代表生产同源结果；不可据此确认真实登录或业务数据。
- 原生 WebView 只在已配置的 H5 入口页及其 hash 路由中导航，其他普通链接交由外部浏览器打开；避免官网同域的其他页面意外复用 App 能力。修改后 Android Expo JS 导出通过，真机交互仍待验收。
- H5 选图依赖的 Taro `chooseImage` 并不会执行 `sizeType: compressed`；共用读取函数现在于转成 base64 前拒绝超过后端 15MB 上限的原图，给出明确压缩提示，避免大图耗内存后才由服务端拒绝。适配文件的 Babel 转译检查通过。
- H5 HTML 原先缺少 viewport 元信息，手机 WebView 可能按桌面宽度缩放整页；现已加移动端宽度与安全区设置，`/mobile-preview/` 生产构建产物确认包含该标记。
- 修复浏览器录音 MIME 带 `codecs` 参数时服务端拒绝或误解码的问题：发送前统一为 `data:audio/webm;base64,...` 等基础类型，并保留原始录音内容。带 codec 参数的专项测试及 Babel 转译通过；真实 WebView 麦克风仍待真机验收。
- 上述调整后 H5 子路径生产构建与 WeApp 构建都通过。两种构建共用 `miniprogram/dist`，最后一次 WeApp 构建已覆盖 H5 产物；部署 H5 前必须重新用 `JIAYICARE_H5_PUBLIC_PATH=/mobile-preview/` 构建并核对入口文件。
- H5 报告 PDF 预览改为按需加载 PDF.js 兼容版，在页面内将原件逐页绘制到 Canvas，避免 Android WebView 不支持 PDF iframe 时出现空白。WeApp 构建用专门的空实现排除 PDF.js 与 worker；两端构建通过，真机大页数 PDF 的性能与关闭行为仍待验收。最后一次构建是 `/mobile-preview/` H5 产物；后续 WeApp 构建仍会覆盖它。
- `node miniprogram/test/h5PdfBrowserSmoke.cjs` 在本机 Edge 上用真实 PDF worker 渲染一页测试 PDF，确认 Canvas 有非白像素；这验证浏览器路径，不能代替华为 WebView 和真实报告验收。
- 2026-10-02 聚焦平台回归 16 项全通过；检查了现有 Taro 平台 API，报告原件下载的 H5 `arraybuffer` 路径由本地 Taro H5 实现支持。华为手机此时未出现在 `adb devices`，真机验收尚不能开始。
- 只读核对生产 Nginx：`/etc/nginx/mime.types` 已将 `mjs` 映射到 `application/javascript`，可提供 PDF.js 模块 worker；当前站点尚无单独的 `/mobile-preview/` 部署。未上传任何预览文件或修改线上配置。
- 新增独立的 `shared-h5-preview` EAS 构建档位，指向预留的 `https://jiaycare.com/mobile-preview/`，与既有 `preview` 隔离，且 App 微信支付仍关闭。JSON 配置检查通过；必须等该路径实际部署并通过访问检查后才可用此档位构建给用户测试。
- H5 `/mobile-preview/` 构建已打包为 `artifacts/shared-h5-preview-20261002.zip`（SHA-256 `AF9B5E417AB813AAF6B670E6212C3032707348CDF54EE04B2DE4B8BF51020A1A`）；包内有 `index.html`、JS/CSS 与 PDF worker。此预览包是未跟踪构建产物，不应混入 Git 提交。
- 2026-10-02 首次将独立预览页暂存到 `https://jiaycare.com/mobile-preview/` 后，本机 Edge 发现空白页与 React #31；原因是 npm workspace 将 Taro 依赖提升到根目录的 React 19，而小程序使用 React 18。已在 H5 Webpack 配置中固定 React 18，先用本地资源覆盖同源 URL 验证登录页，再备份替换独立预览。线上匿名登录页现返回 200、可见，浏览器无脚本错误；原版站点和 `/api/health` 同时返回 200。未修改 Nginx 或运行中的业务进程。部署脚本保留被替换预览的备份，普通生产发布仍遵循标准流程。
- 2026-10-02 再跑平台桥接、H5 录音、报告预览、登录及支付回归共 16 项，全部通过。当前桌面环境未提供 ADB、EAS CLI；尝试临时运行 EAS CLI 遇到 Windows pnpm 缓存符号链接权限错误。Android APK 构建及真机验收仍未完成，不应把已发布的 H5 预览当作新版 App 交付。
- 2026-10-02 复查发现普通站点发布清空了 `app/dist/mobile-preview`，该网址退回旧 Expo 网页。重新以 React 18 构建 H5（仅体积警告），通过独立脚本恢复 48 个文件到该预览目录；浏览器现显示 Taro 访客首页，脚本均从 `/mobile-preview/js/` 加载且无页面错误。该目录仍会被后续普通站点发布清空，需在正式 App 验收前改成持久托管位置或纳入安全的标准发布流程。
- 2026-10-02 已从独立分支 `app-shared-h5-preview-20261002` 的 `7c36ca79` 通过 Expo GitHub 构建 `shared-h5-preview` Android APK，构建 ID `d7c2efaf-b500-44e4-bbc3-acbe85b53c84` 成功。APK 存于工作区外层 `mobile-test-apks/jiayicare-shared-h5-preview-20261002.apk`，大小 66,787,976 字节，SHA-256 `9C31656796A27FFEB93608D38C693E49DB2935E24284E0400EEFD277E346EA2C`。Google 官方 ADB 37.0.1 已识别华为 JAD_AL50；`adb install -r` 覆盖安装成功，主界面启动、首页和健康档案可显示，未见启动崩溃。切换页面时曾回到访客首页，原因待登录后核实；真实短信登录、媒体、订单、通知仍未完成验收，不代表正式交付。
- 用户复测时预览路径再次被常规 Expo 网站发布覆盖，浏览器确认返回旧 Expo 页面（`/_expo/static/js/web/`），这解释了登录页和导航栏突然变样，并可能造成跳转/白屏。已将 48 个 Taro H5 文件发布到 `/var/www/jiayicare-static/mobile-preview/`，Nginx 独立 `alias` 该路径，正常 App `app/dist` 发布不会清除它。发布前后有配置/文件备份，`nginx -t`、本机 HTTPS 页面及 `/api/health` 验证通过；Edge 访客首页、商城 hash 导航与脚本无异常。仍须用户登录态及真机业务复测。
- 用户手机反复出现“360手机助手，安装来源：PC 工具”，且不操作嘉医汇时也发生；电脑同时运行多个 `360MobileMgr` 进程，结束后未再见该进程。此弹窗来自 USB 连接的电脑工具，不应归因于 App；用户需取消安装并断开 USB 做隔离复测。
- 原生预览壳增加返回/首页栏、深色状态栏文字和同源预览路径导航；Android JS 导出通过。此改动尚未包含在现有 APK，需重新构建并真机验证。

## 未完成，禁止交付为正式 App

- 为可选原生壳提供经过验收的 HTTPS H5 地址，验证 WebView 导航、媒体权限及版本更新；目前只有代码入口，不能用旧站点冒充新界面。
- 真机验证短信登录、授权/隐私、主要页面及导航、报告图片上传与预览（含 PDF）、消息照片与语音、推送通知。
- 接入 App 微信支付通道，校验真实支付回调与订单状态；不得用小程序 JSAPI 支付参数直接调用 App。
- Android 和 iOS 构建、安装、回归；不得仅凭 H5 构建或截图宣布对齐。

## 平台边界

微信小程序用 `Taro.login`/`/auth/wechat-mp`、微信 `requestPayment`、小程序文件系统和录音接口。App 应保留独立身份、支付及媒体能力适配；两端共用页面和业务 API，但不能混用平台凭证。H5 在 `https://jiaycare.com` 同源部署之前，不应从本地访客烟测推断真实登录可用。
