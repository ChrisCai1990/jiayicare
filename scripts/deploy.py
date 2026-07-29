#!/usr/bin/env python3
"""Deploy JiayiCare from the current local master commit.

Required local environment:
  JIAYICARE_SSH_PASSWORD or JIAYICARE_SSH_KEY_PATH

The script never stages or commits files. With --push it only pushes an already
clean local master branch. By default it uploads that exact commit to Aliyun as
a Git bundle, so the server does not need to connect to GitHub.
"""

import argparse
import os
import re
import subprocess
import sys
import tempfile
import time

from ssh_config import HOST, connect

ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;?]*[a-zA-Z]|\x1b[=>]")
REPO_DIR = "/var/www/jiayicare"
LOCAL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run_git(*args, check=True):
    return subprocess.run(
        ["git", *args], cwd=LOCAL_DIR, capture_output=True, text=True, check=check
    )


def require_clean_master():
    status = run_git("status", "--porcelain")
    if status.stdout.strip():
        raise RuntimeError("工作区有未提交改动；请先人工审阅并提交。")

    branch = run_git("branch", "--show-current").stdout.strip()
    if branch != "master":
        raise RuntimeError(f"部署仅允许 master 分支，当前分支为 {branch!r}。")


def push_clean_master():
    require_clean_master()
    result = run_git("push", "origin", "master", check=False)
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "git push 失败")
    print("GitHub push 完成")


def deploy(backend_only=False, clean=False, github_source=False):
    require_clean_master()
    revision = run_git("rev-parse", "HEAD").stdout.strip()
    print(f"连接服务器 {HOST}...")
    ssh = connect()
    remote_bundle = None

    def remote(command, timeout=300, label=None):
        if label:
            print(label)
        _, stdout, stderr = ssh.exec_command(command, timeout=timeout, get_pty=True)
        output = []
        for line in iter(stdout.readline, ""):
            line = ANSI_ESCAPE_RE.sub("", line).lstrip("\r").rstrip()
            if line:
                print(f"  {line}")
                output.append(line)
        exit_code = stdout.channel.recv_exit_status()
        if exit_code:
            error = stderr.read().decode("utf-8", "replace").strip()
            if error:
                print(f"  stderr: {error}")
        return exit_code, "\n".join(output)

    try:
        remote(f"rm -f {REPO_DIR}/.git/index.lock", timeout=5)

        if github_source:
            code, _ = remote(
                f"cd {REPO_DIR} && git fetch origin master && git reset --hard origin/master",
                timeout=60,
                label="服务器从 GitHub 同步 origin/master（备用模式）",
            )
        else:
            with tempfile.NamedTemporaryFile(
                prefix=f"jiayicare-{revision[:12]}-", suffix=".bundle", delete=False
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
                    raise RuntimeError(result.stderr.strip() or "创建本地 Git bundle 失败")

                remote_bundle = f"/tmp/jiayicare-{revision}.bundle"
                print(f"上传本地 commit {revision} 到服务器...")
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
                f"cd {REPO_DIR} && git fetch {remote_bundle} HEAD "
                f"&& git reset --hard {revision}",
                timeout=60,
                label="从本地 Git bundle 同步服务器代码",
            )

        if code:
            raise RuntimeError("服务器代码同步失败")

        code, output = remote(
            f"cd {REPO_DIR} && test \"$(git rev-parse HEAD)\" = \"{revision}\" "
            f"&& git status --porcelain",
            timeout=15,
            label=f"确认服务器 commit：{revision}",
        )
        if code or output.strip():
            raise RuntimeError("服务器 commit 或工作区状态校验失败")

        if clean:
            remote(f"rm -rf {REPO_DIR}/node_modules", timeout=60, label="清理 node_modules")

        code, _ = remote(
            f"cd {REPO_DIR} && npm ci --legacy-peer-deps",
            timeout=600,
            label="安装锁定依赖",
        )
        if code:
            raise RuntimeError("依赖安装失败")

        if not backend_only:
            for workspace, command, label in (
                ("app", "npm run export:web", "构建用户端（嘉医管家）"),
                ("app-jinyisen", "npm run export:web", "构建用户端（金伊森）"),
                ("admin", "npm run build", "构建管理端"),
                ("staff", "npm run build", "构建医护端"),
            ):
                code, _ = remote(
                    f"cd {REPO_DIR}/{workspace} && {command} 2>&1",
                    timeout=600,
                    label=label,
                )
                if code:
                    raise RuntimeError(f"{label}失败")

        code, _ = remote("pm2 restart jiayicare-backend", timeout=30, label="重启后端")
        if code:
            raise RuntimeError("后端重启失败")
        time.sleep(3)

        code, output = remote(
            "curl -fsS --max-time 10 http://127.0.0.1:3000/api/health",
            timeout=15,
            label="检查后端健康状态",
        )
        if code:
            raise RuntimeError("健康检查失败")

        print("部署完成")
        print("用户端（嘉医管家）：https://jiaycare.com")
        print("用户端（金伊森）：https://jinyisen.jiaycare.com")
        print("管理端：https://admin.jiaycare.com")
        print("医护端：https://staff.jiaycare.com")
    finally:
        if remote_bundle:
            try:
                ssh.exec_command(f"rm -f {remote_bundle}", timeout=10)
            except Exception:
                pass
        ssh.close()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="安全部署 JiayiCare")
    parser.add_argument("--push", action="store_true", help="推送干净的 master 后部署")
    parser.add_argument("--backend", action="store_true", help="只安装依赖并重启后端")
    parser.add_argument("--clean", action="store_true", help="先清理服务器 node_modules")
    parser.add_argument(
        "--github-source",
        action="store_true",
        help="备用：让服务器从 GitHub 拉取；默认由本地上传 Git bundle",
    )
    args = parser.parse_args()

    try:
        if args.push:
            push_clean_master()
        deploy(
            backend_only=args.backend,
            clean=args.clean,
            github_source=args.github_source,
        )
    except (RuntimeError, OSError) as exc:
        print(f"部署失败：{exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
