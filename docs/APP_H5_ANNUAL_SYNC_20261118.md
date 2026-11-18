# 苹果与华为 App 年度安排页面同步（2026-11-18）

- 已安装苹果 App 页面入口：`https://app.joinwehealth.com/mobile-preview/`。
- 华为 App 页面入口：`https://jiaycare.com/mobile-preview/`。
- 以苹果线上入口相同的源码基线 `4167865a` 为基础，合入小程序最新的年度随访卡片展示：近期安排和待办任务显示客户行动摘要，展开显示目标、日期、机构；内部设置依据不展示。
- 本地 H5 构建通过。两个 App 使用同一份构建产物，静态资源放在独立的 `releases/annual-20261118/` 目录，避免覆盖已有资源。
- 发布前入口 SHA256：苹果 `4a7c64a9a62bb0bac2e47e143fa8dd857ab9736c45aa0c64dc5227e4f9d9db7f`；华为 `44bf6c3b6e8066a3bebdfa1a63de94b9e972b310b98bf40e0dee191e657a0df0`。
- 发布后两个入口 SHA256 均为 `17a7ec3232aa5b54b78ce7685adbc9c00b256634d5b7064556d5eec0557f90cd`。每个入口的两个入口 JS 文件均经 HTTP 读取并与服务器文件逐字节核对。
- 备份：`/var/backups/jiayicare-app-annual-h5-20261118-17a7ec3232aa/`，包含两个旧入口文件。
- 本次更新为 App 内加载的 H5 页面，未生成新的 iOS 或 Android 安装包；真机重新打开后的交互仍需用户设备验收。

另据用户明确授权，清理了金娟年度方案中隐藏的旧更年期管理随访记录，停用其重新生成但未执行的随访。生产复查：旧记录 0 条、同来源活动随访 0 条，任务状态为 cancelled 且客户不可见，修正历史已留档。
