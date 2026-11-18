# 华为 App 服务群资料上传修复（2026-11-18）

- 用户反馈已安装的安卓 App 内服务群“上传医疗资料”点击后无响应。
- H5 上传入口原先在文件选择器前等待授权 API 和操作菜单。安卓 WebView 可能因失去直接点击手势而不打开系统选择器。
- 本次将 H5 的图片和 PDF 选项直接连接浏览器文件选择器；选择后再检查 AI 授权并提交。图片最多 9 张，资料总量不超过 15 MB。小程序原生选择路径保留。
- 从 `fix/app-h5-annual-production-20261118` 工作树构建，Taro H5 编译成功。构建资源路径为 `/mobile-preview/releases/group-material-upload-20261118/`。
- 用户在本聊天明确授权发布华为入口。发布前 `https://jiaycare.com/mobile-preview/` 入口 SHA256 为 `17a7ec3232aa5b54b78ce7685adbc9c00b256634d5b7064556d5eec0557f90cd`。
- 只更新华为 H5 入口，未改苹果入口、后端、业务数据或安卓安装包。发布后入口 SHA256 为 `054ecdd06ce2455f5a99e53a6b6aaa8c1aa3d854cde600e7df1ee2cad8b5ff7a`，47 个资源已校验，服务器 HTTPS 回读两条入口脚本与文件逐字节一致。
- 旧入口备份：`/var/backups/jiayicare-huawei-group-upload-20261118-054ecdd06ce2/previous-index.html`。部署包同目录留存。
- 尚未在用户安卓设备实际打开系统文件选择器及提交医疗资料；这一步必须真机验收。如仍无系统选择器，继续检查安装包 WebView 的原生文件选择回调。
