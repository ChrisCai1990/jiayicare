# 已安装 App 服务群图片查看（2026-11-21）

- 基于 `cd48b9de`，保留苹果端 11 月 20 日的健康照片读取、压缩与保存超时修复；保留华为端既有文件选择和聊天文档打开流程。
- 服务群聊天页与历史记录对图片显示“查看图片”，使用 H5 图片预览；小程序代码路径也支持微信本地图片预览。
- `npm run build:h5` 使用 `JIAYICARE_H5_PUBLIC_PATH=/mobile-preview/releases/group-images-20261121/` 构建成功，输出 48 个文件。
- `scripts/deploy_group_image_app_h5_20261121.py` 先校验苹果、华为线上旧入口哈希及资源无冲突，然后上传静态资源、备份入口、原子替换并用站点本机 HTTPS 检查新入口。两处发布成功，入口 SHA256 均为 `8aeb13699c8777e2312d147f63445802d53a391015108ccef979c4348b84ce8a`，备份目录 `/var/backups/jiayicare-app-group-images-20261121-8aeb13699c87/`。
- 未生成新的 iOS 或 Android 原生安装包；真实设备打开图片仍需验收。
