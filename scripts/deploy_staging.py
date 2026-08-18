#!/usr/bin/env python3
"""Deploy the exact local staging-main commit without touching production.

Credentials stay outside Git and are loaded by ssh_config.py. The server does
not need GitHub access: this script uploads a bundle containing the exact local
commit. Staging runtime configuration remains in the untracked backend/.env on
the server.
"""

import argparse
import hashlib
import os
import re
import shlex
import subprocess
import sys
import tempfile
import time

from ssh_config import HOST, connect


ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;?]*[a-zA-Z]|\x1b[=>]")
LOCAL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STAGING_DIR = "/var/www/jiayicare-staging"
PRODUCTION_DIR = "/var/www/jiayicare"
STAGING_BRANCH = "staging-main"


def run_git(*args, check=True):
    return subprocess.run(
        ["git", *args], cwd=LOCAL_DIR, capture_output=True, text=True, check=check
    )


def require_clean_staging_branch():
    status = run_git("status", "--porcelain").stdout.strip()
    if status:
        raise RuntimeError("工作区有未提交改动；请先人工审阅并提交。")
    branch = run_git("branch", "--show-current").stdout.strip()
    if branch != STAGING_BRANCH:
        raise RuntimeError(
            f"staging 部署只允许 {STAGING_BRANCH} 分支，当前为 {branch!r}。"
        )


def push_staging_branch():
    require_clean_staging_branch()
    result = run_git("push", "origin", STAGING_BRANCH, check=False)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "git push 失败")
    print(f"GitHub {STAGING_BRANCH} push 完成")


def dependency_fingerprint():
    tree = run_git("ls-tree", "-r", "HEAD").stdout.splitlines()
    manifests = []
    for line in tree:
        _, path = line.split("\t", 1)
        if os.path.basename(path) in {"package.json", "package-lock.json"}:
            manifests.append(line)
    return hashlib.sha256("\n".join(sorted(manifests)).encode()).hexdigest()


def deploy(clean=False):
    require_clean_staging_branch()
    revision = run_git("rev-parse", "HEAD").stdout.strip()
    dependency_hash = dependency_fingerprint()
    print(f"连接服务器 {HOST}，部署 staging commit {revision}...")
    ssh = connect()
    remote_bundle = f"/tmp/jiayicare-staging-{revision}.bundle"

    def remote(command, timeout=300, label=None, quiet=False):
        if label:
            print(label)
        _, stdout, stderr = ssh.exec_command(command, timeout=timeout, get_pty=True)
        output = []
        for line in iter(stdout.readline, ""):
            line = ANSI_ESCAPE_RE.sub("", line).lstrip("\r").rstrip()
            if line:
                if not quiet:
                    print(f"  {line}")
                output.append(line)
        code = stdout.channel.recv_exit_status()
        error = stderr.read().decode("utf-8", "replace").strip()
        if code and error and not quiet:
            print(f"  stderr: {error}")
        return code, "\n".join(output)

    try:
        guard_cmd = (
            f"test -d {shlex.quote(PRODUCTION_DIR)}/.git && "
            f"printf '%s|%s' \"$(git -C {shlex.quote(PRODUCTION_DIR)} rev-parse HEAD)\" "
            '"$(pm2 pid jiayicare-backend)"'
        )
        code, production_before = remote(
            guard_cmd, timeout=15, label="记录生产 commit 与后端 PID", quiet=True
        )
        if code or "|" not in production_before:
            raise RuntimeError("无法建立生产环境不变基线，停止 staging 部署。")

        code, _ = remote(
            f"test -d {shlex.quote(STAGING_DIR)}/.git && "
            f"test -f {shlex.quote(STAGING_DIR)}/backend/.env",
            timeout=15,
            label="检查独立 staging 目录与环境配置",
        )
        if code:
            raise RuntimeError("staging 目录或 backend/.env 不存在。")

        with tempfile.NamedTemporaryFile(
            prefix=f"jiayicare-staging-{revision[:12]}-",
            suffix=".bundle",
            delete=False,
        ) as bundle_file:
            local_bundle = bundle_file.name
        try:
            result = subprocess.run(
                ["git", "bundle", "create", local_bundle, "HEAD"],
                cwd=LOCAL_DIR,
                capture_output=True,
                text=True,
                check=False,
            )
            if result.returncode:
                raise RuntimeError(result.stderr.strip() or "创建 Git bundle 失败")
            sftp = ssh.open_sftp()
            try:
                sftp.put(local_bundle, remote_bundle)
            finally:
                sftp.close()
        finally:
            try:
                os.unlink(local_bundle)
            except OSError:
                pass

        code, _ = remote(
            f"cd {shlex.quote(STAGING_DIR)} && "
            f"git fetch {shlex.quote(remote_bundle)} HEAD && "
            f"git checkout --detach {shlex.quote(revision)} && "
            f"test \"$(git rev-parse HEAD)\" = {shlex.quote(revision)} && "
            "test -z \"$(git status --porcelain --untracked-files=no)\"",
            timeout=90,
            label="同步 staging 代码并校验 exact commit",
        )
        if code:
            raise RuntimeError("staging 代码同步或工作区校验失败。")

        code, _ = remote(
            f"cd {shlex.quote(STAGING_DIR + '/backend')} && set -a && . ./.env && set +a && "
            "node -e \"require('./src/utils/runtimeSafety').assertDeploymentEnvironment(process.env)\"",
            timeout=20,
            label="执行 staging 数据库、OSS、端口与定时任务边界校验",
        )
        if code:
            raise RuntimeError("staging 环境安全边界校验失败，停止部署。")

        if clean:
            code, _ = remote(
                f"rm -rf {shlex.quote(STAGING_DIR)}/node_modules",
                timeout=90,
                label="清理 staging node_modules",
            )
            if code:
                raise RuntimeError("清理 staging 依赖失败。")

        marker = f"{STAGING_DIR}/.deploy-dependency-fingerprint"
        code, _ = remote(
            f"test -d {shlex.quote(STAGING_DIR)}/node_modules && "
            f"test \"$(cat {shlex.quote(marker)} 2>/dev/null)\" = {shlex.quote(dependency_hash)}",
            timeout=15,
            label="检查 staging 依赖缓存",
        )
        if code:
            code, _ = remote(
                f"cd {shlex.quote(STAGING_DIR)} && npm ci --legacy-peer-deps && "
                f"printf '%s' {shlex.quote(dependency_hash)} > {shlex.quote(marker)}",
                timeout=900,
                label="安装 staging 锁定依赖",
            )
            if code:
                raise RuntimeError("staging 依赖安装失败。")

        builds = (
            ("app", "npm run export:web:staging", "构建嘉医管家 staging Web"),
            ("app-jinyisen", "npm run export:web:staging", "构建金伊森 staging Web"),
            ("admin", "npm run build:staging", "构建管理端 staging"),
            ("staff", "npm run build:staging", "构建医护端 staging"),
        )
        for workspace, command, label in builds:
            code, _ = remote(
                f"cd {shlex.quote(STAGING_DIR + '/' + workspace)} && {command} 2>&1",
                timeout=900,
                label=label,
            )
            if code:
                raise RuntimeError(f"{label}失败。")

        frontend_processes = (
            ("jiayicare-staging-app", "app/dist-staging", 8081),
            ("jiayicare-staging-jinyisen", "app-jinyisen/dist-staging", 8082),
            ("jiayicare-staging-admin", "admin/dist", 5175),
            ("jiayicare-staging-staff", "staff/dist", 5174),
        )
        for name, dist, port in frontend_processes:
            command = (
                f"cd {shlex.quote(STAGING_DIR)} && pm2 delete {shlex.quote(name)} >/dev/null 2>&1 || true; "
                f"cd {shlex.quote(STAGING_DIR)} && pm2 start node_modules/serve/build/main.js "
                f"--name {shlex.quote(name)} -- -s {shlex.quote(dist)} "
                f"-l tcp://127.0.0.1:{port}"
            )
            code, _ = remote(command, timeout=45, label=f"启动 {name}")
            if code:
                raise RuntimeError(f"启动 {name} 失败。")

        backend_cmd = (
            f"cd {shlex.quote(STAGING_DIR + '/backend')} && set -a && . ./.env && set +a && "
            "if pm2 describe jiayicare-staging-backend >/dev/null 2>&1; then "
            "pm2 restart jiayicare-staging-backend --update-env; else "
            "pm2 start src/index.js --name jiayicare-staging-backend; fi"
        )
        code, _ = remote(backend_cmd, timeout=45, label="重启 staging 后端")
        if code:
            raise RuntimeError("staging 后端启动失败。")
        remote("pm2 save", timeout=30, label="保存 staging PM2 进程表")
        time.sleep(3)

        checks = (
            ("http://127.0.0.1:3100/api/health", "staging API"),
            ("http://127.0.0.1:8081", "嘉医管家 staging Web"),
            ("http://127.0.0.1:8082", "金伊森 staging Web"),
            ("http://127.0.0.1:5175", "管理端 staging"),
            ("http://127.0.0.1:5174", "医护端 staging"),
        )
        for url, label in checks:
            code, _ = remote(
                f"curl -fsS --max-time 15 -o /dev/null {shlex.quote(url)}",
                timeout=20,
                label=f"验证 {label}",
            )
            if code:
                raise RuntimeError(f"{label}健康检查失败。")

        code, production_after = remote(guard_cmd, timeout=15, quiet=True)
        if code or production_after != production_before:
            raise RuntimeError("生产 commit 或后端 PID 在 staging 部署期间发生变化。")

        print("staging 部署完成；生产 commit 与后端 PID 保持不变。")
    finally:
        try:
            ssh.exec_command(f"rm -f {shlex.quote(remote_bundle)}", timeout=10)
        except Exception:
            pass
        ssh.close()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="安全部署 JiayiCare staging 环境")
    parser.add_argument("--push", action="store_true", help="推送干净的 staging-main 后部署")
    parser.add_argument("--clean", action="store_true", help="仅清理 staging node_modules 后重装")
    args = parser.parse_args()
    try:
        if args.push:
            push_staging_branch()
        deploy(clean=args.clean)
    except (RuntimeError, OSError) as exc:
        print(f"staging 部署失败：{exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
