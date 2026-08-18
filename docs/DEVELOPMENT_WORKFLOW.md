# JiayiCare 代码提交与阿里云部署流程

生产环境和 staging 环境共用一个 Git 仓库，但使用不同分支、服务器目录、数据库、OSS 前缀和 PM2 进程。环境边界详见 `docs/ENVIRONMENTS.md`。

staging 标准部署命令：

```powershell
git switch staging-main
python scripts/deploy_staging.py --push
```

该脚本只接受干净的 `staging-main`，只写入 `/var/www/jiayicare-staging` 并只重启 `jiayicare-staging-*` 进程。执行前后会比较生产目录 commit 和 `jiayicare-backend` PID；任一变化都会判定部署异常。生产发布仍使用本文后续的 `scripts/deploy.py`，两套命令不得混用。

本文是 Codex 与 Claude Code 共用的标准流程。GitHub `origin/master` 是版本历史的唯一事实来源；部署由本地主动发起，并将同一 Git commit 直接上传阿里云，阿里云不需要连接 GitHub。禁止在服务器长期直接修改业务代码。

## 1. 一次性机器配置

### 通用软件

- Git for Windows
- Node.js（满足根 `package.json` 与各 workspace 的版本要求）
- Python 3
- Python 包 `paramiko`

```powershell
python -m pip install paramiko
```

### Git 提交身份

每台开发机只需配置一次，内容使用开发者自己的 GitHub 身份：

```powershell
git config --global user.name "<GitHub 显示名>"
git config --global user.email "<GitHub 邮箱>"
```

### GitHub 推送认证

当前 `origin` 使用 HTTPS：

```text
https://github.com/ChrisCai1990/jiayicare.git
```

在可交互 PowerShell 中完成一次 Git Credential Manager 登录：

```powershell
git credential-manager github login
```

认证信息由系统凭据管理器保存，不写入仓库，也不放进 AI 记忆文件。

### 阿里云 SSH 认证

推荐使用独立 SSH 私钥，不推荐长期保存 root 密码。

```powershell
$env:JIAYICARE_SSH_KEY_PATH = "C:\安全目录\jiayicare_aliyun"
```

可选覆盖项：

```powershell
$env:JIAYICARE_SSH_HOST = "121.40.156.39"
$env:JIAYICARE_SSH_USER = "root"
```

临时使用密码时：

```powershell
$env:JIAYICARE_SSH_PASSWORD = "<服务器密码>"
```

凭据不得写入 `.env.example`、`AGENTS.md`、`CLAUDE.md` 或提交历史。阿里云安全组必须允许开发机访问 SSH 端口。

## 2. 开发前同步

只在干净工作区执行：

```powershell
git switch master
git pull --ff-only origin master
npm ci --legacy-peer-deps
```

如果工作区已有修改，先审阅并处理，禁止用 `reset --hard` 覆盖未知改动。

## 3. 本地开发与测试

常用入口：

```powershell
npm run dev:backend
npm run dev:admin
npm run dev:staff
npm run dev:app
```

微信小程序不使用不稳定的 watch 模式：

```powershell
npm run build:miniprogram
```

然后用微信开发者工具导入 `miniprogram/dist/`。

提交前至少执行与改动范围匹配的测试或构建：

```powershell
npm test
npm run build:admin
npm run build:staff
npm run build:app
npm run build:miniprogram
```

全量前端或跨端改动建议执行：

```powershell
npm run build
```

## 4. 审阅并提交

先确认只包含本次改动：

```powershell
git status --short
git diff --check
git diff
```

再明确暂存文件并提交：

```powershell
git add -- <本次修改的文件>
git diff --cached
git commit -m "<type>: <简明说明>"
```

不得使用 `git add .` 混入本地环境文件、日志、构建产物或无关修改。

## 5. 推送并部署

标准全量流程：

```powershell
python scripts/deploy.py --push
```

部署脚本会根据所有已跟踪的 `package.json` 和 `package-lock.json` 计算依赖指纹。
锁文件未变化且服务器 `node_modules` 存在时自动跳过 `npm ci`；锁文件变化或使用
`--clean` 时会重新安装依赖。服务器本地的 `uploads/` 和其他未跟踪运维文件会保留。

该命令只允许：

- 当前分支为 `master`
- 工作区完全干净
- 已提交的 `master` 可成功推送到 GitHub

推送成功后，脚本会：

1. 在本地把当前 `HEAD` 打包成 Git bundle
2. 通过 SFTP 将 bundle 直接上传阿里云
3. 服务器从 bundle 读取 commit，并 `git reset --hard` 到该 commit
4. 校验服务器 `HEAD` 与本地 commit 完全一致且工作区干净
5. `npm ci --legacy-peer-deps`
6. 构建 App、金伊森 App、Admin、Staff
7. `pm2 restart jiayicare-backend`
8. 请求本机 `/api/health` 验证后端

因此正常部署链路是两条由本地发起的独立连接：

```text
本地 → GitHub：保存版本历史
本地 → 阿里云：上传并部署同一 commit
```

GitHub 与阿里云之间没有网络依赖。

仅后端代码变更：

```powershell
python scripts/deploy.py --push --backend
```

代码已经人工推送，只执行服务器部署：

```powershell
python scripts/deploy.py
```

只有后端已推送，只执行后端部署：

```powershell
python scripts/deploy.py --backend
```

仅在本地无法上传 bundle、且已确认阿里云到 GitHub 网络正常时，才使用服务器拉取备用模式：

```powershell
python scripts/deploy.py --github-source
```

`--clean` 会删除服务器 `node_modules` 后重装，只有依赖状态损坏时才使用：

```powershell
python scripts/deploy.py --clean
```

## 6. 部署后验收

脚本内置 API 健康检查，但全量部署后还要人工确认：

- App：https://jiaycare.com
- 金伊森 App：https://jinyisen.jiaycare.com
- Admin：https://admin.jiaycare.com
- Staff：https://staff.jiaycare.com
- API：https://jiaycare.com/api/health

记录本次部署 commit：

```powershell
git rev-parse HEAD
git status --short --branch
```

生产服务器上的 commit 必须与 GitHub `origin/master` 一致。

## 7. 失败处理

- GitHub 推送失败：使用 `--push` 时停止部署并修复 GitHub 认证，避免生产版本没有远程历史。
- SSH 超时：检查本机网络、阿里云安全组和 SSH 端口，未连通前不要反复部署。
- Bundle 上传失败：检查本机到阿里云的 SSH/SFTP 连接；正常模式下无需检查阿里云到 GitHub 的网络。
- 服务器依赖安装或构建失败：保留完整日志，修复代码后重新提交；不要在服务器直接改源码。
- 健康检查失败：检查 PM2 和后端日志，确认数据库及环境变量，再决定是否回退。
- 需要回退时：在 Git 中创建回退提交并重新执行标准部署，保持 GitHub 与生产一致。
