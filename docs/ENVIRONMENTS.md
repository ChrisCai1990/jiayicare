# JiayiCare 同机双环境约定

JiayiCare 当前在同一台 ECS 上运行 production（生产）和 staging（预发布测试）。两套环境共享操作系统，但必须隔离代码目录、进程、端口、数据库和报告文件前缀。

| 资源 | production | staging |
| --- | --- | --- |
| 环境标识 | `DEPLOYMENT_ENV=production`（生产后续维护窗口启用；未启用前为兼容模式） | `DEPLOYMENT_ENV=staging` |
| 代码目录 | `/var/www/jiayicare` | `/var/www/jiayicare-staging` |
| Git 分支 | `master` | `staging/ocr-review-2.0` |
| 后端进程 | `jiayicare-backend`（后续维护窗口可改标准名） | `jiayicare-staging-backend` |
| 医护端进程 | Nginx 正式站点 | `jiayicare-staging-staff` |
| 后端端口 | `3000` | `127.0.0.1:3100` |
| 医护端端口 | 正式域名 | `127.0.0.1:5174` |
| MongoDB 数据库 | `jiayicare` | `jiayicare_staging` |
| 报告 OSS 前缀 | `reports/` | `reports-staging/ocr2/` |
| 定时任务 | 启用 | 必须禁用 |

## 强制边界

后端在连接数据库、创建上传目录和启动 HTTP 服务前调用运行时门禁：

- staging 只能连接 `jiayicare_staging`；
- staging 上传前缀必须位于 `reports-staging/`；
- staging 必须设置 `DISABLE_SCHEDULERS=true`；
- staging 只能监听 `127.0.0.1` 且不能使用生产端口 `3000`；
- production 在正式启用环境标识后只能连接 `jiayicare`、使用 `reports/` 和端口 `3000`。

任一条件不满足时进程拒绝启动，不能用健康检查成功替代上述边界核验。

## 部署原则

- staging 先验收，再决定是否合并并部署 production；两者不得共用工作目录。
- staging 可以复制最小必要的脱敏或指定测试数据，不做生产数据库持续同步。
- staging 上传、OCR、审核、驳回和专项筛查投影只能写入 staging 数据库与 OSS 前缀。
- 生产目录、生产进程名的标准化改名必须安排维护窗口，不能为了命名统一而无提示重启生产。
- 回退 staging 时只切换 staging 代码提交并重建、重启 staging 进程，不操作生产目录和生产数据库。
