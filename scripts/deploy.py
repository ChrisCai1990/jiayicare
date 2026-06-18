#!/usr/bin/env python3
"""
JiayiCare 一键部署脚本
用法：
  python scripts/deploy.py                      # 只部署（不 push）
  python scripts/deploy.py --push               # git add + commit + push + 部署
  python scripts/deploy.py --push -m "描述"    # 指定 commit message
  python scripts/deploy.py --backend            # 只重启后端（不重新构建前端）
  python scripts/deploy.py --clean              # 全量清理 node_modules 后重装（依赖有大变动时用）
"""

import sys
import time
import subprocess
import argparse
import os
from datetime import datetime

# ── 配置 ──────────────────────────────────────────────
HOST     = '121.40.156.39'
USER     = 'root'
PASSWORD = 'Jiayi2026!'
REPO_DIR = '/var/www/jiayicare'
LOCAL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# ──────────────────────────────────────────────────────

def check_paramiko():
    try:
        import paramiko
        return paramiko
    except ImportError:
        print('📦 安装 paramiko...')
        subprocess.run([sys.executable, '-m', 'pip', 'install', 'paramiko', '-q'], check=True)
        import paramiko
        return paramiko

def git_commit_and_push(message=None):
    def run_git(args, check=True):
        return subprocess.run(['git'] + args, cwd=LOCAL_DIR,
                              capture_output=True, text=True, check=check)

    # 检查是否有改动
    status = run_git(['status', '--porcelain'])
    has_changes = bool(status.stdout.strip())

    if has_changes:
        print('📝 提交代码改动...')
        run_git(['add', '.'])
        msg = message or f'update {datetime.now().strftime("%Y-%m-%d %H:%M")}'
        result = run_git(['commit', '-m', msg], check=False)
        if result.returncode not in (0, 1):  # 1 = nothing to commit
            print(f'❌ git commit 失败：\n{result.stderr}')
            sys.exit(1)
        print(f'✅ 已提交：{msg}')
    else:
        print('ℹ️  没有新改动，跳过 commit')

    print('📤 推送代码到 GitHub...')
    result = subprocess.run(['git', 'push', 'origin', 'master'],
                            cwd=LOCAL_DIR, capture_output=True, text=True)
    if result.returncode != 0:
        print(f'❌ git push 失败：\n{result.stderr}')
        sys.exit(1)
    print('✅ push 成功')

def run_deploy(backend_only=False, clean=False):
    paramiko = check_paramiko()

    print(f'\n🔌 连接服务器 {HOST}...')
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    try:
        ssh.connect(HOST, username=USER, password=PASSWORD, timeout=15)
    except Exception as e:
        print(f'❌ SSH 连接失败：{e}')
        sys.exit(1)

    print('✅ 已连接\n')

    def run(cmd, timeout=300, label=None):
        if label:
            print(f'⏳ {label}')
        else:
            print(f'$ {cmd}')
        _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout, get_pty=True)
        out = ''
        for line in iter(stdout.readline, ''):
            line = line.rstrip()
            if line:
                print(f'   {line}')
                out += line + '\n'
        exit_code = stdout.channel.recv_exit_status()
        if exit_code != 0:
            err = stderr.read().decode('utf-8', 'replace').strip()
            if err:
                print(f'   ⚠️  stderr: {err}')
        return exit_code, out

    # ── 拉取最新代码 ──
    run(f'rm -f {REPO_DIR}/.git/index.lock', timeout=5)  # 清除残留锁文件
    run(f'cd {REPO_DIR} && git remote prune origin', timeout=15)
    code, _ = run(
        f'cd {REPO_DIR} && git fetch origin master && git reset --hard origin/master',
        timeout=60, label='拉取最新代码'
    )
    if code != 0:
        print('❌ 代码拉取失败')
        ssh.close(); sys.exit(1)

    # ── 验证 commit ──
    _, log = run(f'cd {REPO_DIR} && git log --oneline -1')
    print(f'   📌 当前 commit: {log.strip()}')

    if not backend_only:
        # ── 检测哪些目录有变动 ──
        _, changed = run(f'cd {REPO_DIR} && git diff HEAD~1 HEAD --name-only 2>/dev/null || git diff HEAD --name-only', timeout=15)
        changed_files = changed.strip().splitlines()
        need_app   = any(f.startswith('app/')   for f in changed_files)
        need_admin = any(f.startswith('admin/')  for f in changed_files)
        need_staff = any(f.startswith('staff/')  for f in changed_files)
        need_pkg   = any(f in ('package.json', 'package-lock.json') for f in changed_files)

        # 如果检测不到（首次部署/强制），全量构建
        if not (need_app or need_admin or need_staff or need_pkg):
            print('   ⚠️  未检测到前端改动，若需强制全量构建请用 --clean')
            need_app = need_admin = need_staff = True

        print(f'   📦 构建范围: app={need_app} admin={need_admin} staff={need_staff} pkg={need_pkg}')

        # ── 安装依赖（只在 package.json 变了时才跑）──
        if clean:
            run('rm -rf /var/www/jiayicare/node_modules', timeout=60, label='清理旧 node_modules（--clean）')
            need_pkg = True
        if need_pkg or clean:
            run('cd /var/www/jiayicare && npm install --legacy-peer-deps', timeout=300, label='安装依赖')
        else:
            print('   ✅ package.json 未变，跳过 npm install')

        VITE = '/var/www/jiayicare/node_modules/.bin/vite'

        # ── 构建前端（按需）──
        if need_app:
            code, _ = run('cd /var/www/jiayicare/app && npm run export:web 2>&1', timeout=300, label='构建 app 前端（Expo Web）')
            if code != 0:
                print('❌ app 构建失败')
                ssh.close(); sys.exit(1)
        else:
            print('   ✅ app 未变，跳过构建')

        if need_admin:
            code, _ = run(f'cd /var/www/jiayicare/admin && {VITE} build 2>&1', timeout=300, label='构建 admin 前端')
            if code != 0:
                print('❌ admin 构建失败')
                ssh.close(); sys.exit(1)
        else:
            print('   ✅ admin 未变，跳过构建')

        if need_staff:
            code, _ = run(f'cd /var/www/jiayicare/staff && {VITE} build 2>&1', timeout=300, label='构建 staff 前端')
            if code != 0:
                print('❌ staff 构建失败')
                ssh.close(); sys.exit(1)
        else:
            print('   ✅ staff 未变，跳过构建')
    else:
        # --backend 模式：只在 package.json 变了时装依赖
        _, changed = run(f'cd {REPO_DIR} && git diff HEAD~1 HEAD --name-only 2>/dev/null || echo ""', timeout=15)
        if 'package.json' in changed or 'package-lock.json' in changed:
            run('cd /var/www/jiayicare && npm install --legacy-peer-deps', timeout=300, label='安装后端依赖')
        else:
            print('   ✅ package.json 未变，跳过 npm install')

    # ── 重启后端 ──
    run('pm2 restart jiayicare-backend', timeout=30, label='重启后端')
    time.sleep(3)

    # ── 验证后端存活 ──
    code, out = run('pm2 jlist | python3 -c "import sys,json; procs=json.load(sys.stdin); [print(p[\'name\'],p[\'pm2_env\'][\'status\']) for p in procs if p[\'name\']==\'jiayicare-backend\']"', timeout=10)
    if 'online' in out:
        print('\n✅ 后端运行正常')
    else:
        print('\n⚠️  后端状态未知，请手动检查')

    # ── 检查密码同步日志 ──
    run('pm2 logs jiayicare-backend --lines 5 --nostream 2>&1 | grep -E "(superadmin|错误|error|Error)" || true', timeout=10)

    ssh.close()
    print('\n🎉 部署完成！')
    print('   用户端：  http://121.40.156.39')
    print('   超管后台：http://121.40.156.39:8081')
    print('   医护端：  http://121.40.156.39:8082')
    print('   后端API：  http://121.40.156.39/api')
    print('   账号：superadmin / jiayi2024\n')

def main():
    # 设置 UTF-8 避免 Windows 乱码
    import os
    os.environ.setdefault('PYTHONUTF8', '1')
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')

    parser = argparse.ArgumentParser(description='JiayiCare 一键部署')
    parser.add_argument('--push',    action='store_true', help='git add + commit + push 后再部署')
    parser.add_argument('-m', '--message', default=None, help='commit message（默认：update 时间戳）')
    parser.add_argument('--backend', action='store_true', help='只重启后端，不构建前端')
    parser.add_argument('--clean',   action='store_true', help='全量清理 node_modules 后重装（依赖有大变动时用）')
    args = parser.parse_args()

    if args.push:
        git_commit_and_push(args.message)

    run_deploy(backend_only=args.backend, clean=args.clean)

if __name__ == '__main__':
    main()
