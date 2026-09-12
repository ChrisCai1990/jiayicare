#!/usr/bin/env python3
"""Deploy JiayiCare from the current local master commit.

Required local environment:
  JIAYICARE_SSH_PASSWORD or JIAYICARE_SSH_KEY_PATH

The script never stages or commits files. With --push it only pushes an already
clean local master branch. By default it uploads that exact commit to Aliyun as
a Git bundle, so the server does not need to connect to GitHub.
"""

import argparse
import hashlib
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


def dependency_fingerprint():
    """Hash tracked npm manifests without reading or exposing secrets."""
    tree = run_git("ls-tree", "-r", "HEAD").stdout.splitlines()
    manifests = []
    for line in tree:
        _, path = line.split("\t", 1)
        if os.path.basename(path) in {"package.json", "package-lock.json"}:
            manifests.append(line)
    payload = "\n".join(sorted(manifests)).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


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


def deploy(backend_only=False, clean=False, github_source=False, skip_data_migrations=False):
    require_clean_master()
    revision = run_git("rev-parse", "HEAD").stdout.strip()
    dependency_hash = dependency_fingerprint()
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
            f"&& git status --porcelain --untracked-files=no",
            timeout=15,
            label=f"确认服务器 commit：{revision}",
        )
        if code or output.strip():
            raise RuntimeError("服务器 commit 或工作区状态校验失败")

        if clean:
            remote(f"rm -rf {REPO_DIR}/node_modules", timeout=60, label="清理 node_modules")

        marker = f"{REPO_DIR}/.deploy-dependency-fingerprint"
        code, _ = remote(
            f"cd {REPO_DIR} && test -d node_modules "
            f"&& test \"$(cat {marker} 2>/dev/null)\" = \"{dependency_hash}\"",
            timeout=15,
            label="检查依赖缓存",
        )
        if code:
            code, _ = remote(
                f"cd {REPO_DIR} && npm ci --legacy-peer-deps "
                f"&& printf '%s' '{dependency_hash}' > {marker}",
                timeout=600,
                label="锁文件已变化，安装锁定依赖",
            )
            if code:
                raise RuntimeError("依赖安装失败")
        else:
            print("依赖锁文件未变化，跳过 npm ci")

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

        def run_migration(command, **options):
            if skip_data_migrations:
                return 0, ""
            return remote(command, **options)

        if skip_data_migrations:
            print("本次仅发布代码，跳过数据迁移；不创建迁移完成标记")

        # One-time, idempotent data migration. The server marker prevents later
        # deployments from overwriting Admin adjustments made after review.
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/seedServiceWorkflowDrafts.js ] && "
            f"[ ! -f {REPO_DIR}/.service-workflow-drafts-v1-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/seedServiceWorkflowDrafts.js --apply && "
            f"touch {REPO_DIR}/.service-workflow-drafts-v1-applied; fi",
            timeout=120,
            label="初始化服务流程、随访计划和方案审核稿",
        )
        if code:
            raise RuntimeError("服务流程审核稿初始化失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateUnifiedServiceWorkflowV2.js ] && "
            f"[ ! -f {REPO_DIR}/.unified-service-workflow-v2-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateUnifiedServiceWorkflowV2.js --apply && "
            f"touch {REPO_DIR}/.unified-service-workflow-v2-applied; fi",
            timeout=120,
            label="修正服务流程关联并启用统一条件节点",
        )
        if code:
            raise RuntimeError("统一服务流程数据修正失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateUnifiedServiceWorkflowV3Samples.js ] && "
            f"[ ! -f {REPO_DIR}/.unified-service-workflow-v3-samples-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateUnifiedServiceWorkflowV3Samples.js && "
            f"touch {REPO_DIR}/.unified-service-workflow-v3-samples-applied; fi",
            timeout=120,
            label="补齐体检与门诊一站式验收节点",
        )
        if code:
            raise RuntimeError("验收样例条件节点补齐失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateUnifiedServiceWorkflowV4Deduplicate.js ] && "
            f"[ ! -f {REPO_DIR}/.unified-service-workflow-v4-deduplicate-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateUnifiedServiceWorkflowV4Deduplicate.js && "
            f"touch {REPO_DIR}/.unified-service-workflow-v4-deduplicate-applied; fi",
            timeout=120,
            label="合并门诊一站式重复复诊节点",
        )
        if code:
            raise RuntimeError("门诊一站式重复节点修正失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateOutpatientOneStopWorkflowV5.js ] && "
            f"[ ! -f {REPO_DIR}/.outpatient-one-stop-workflow-v5-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateOutpatientOneStopWorkflowV5.js && "
            f"touch {REPO_DIR}/.outpatient-one-stop-workflow-v5-applied; fi",
            timeout=120,
            label="将门诊一站式升级为六阶段固定服务闭环",
        )
        if code:
            raise RuntimeError("门诊一站式六阶段流程迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateOutpatientOneStopRoleOrderV6.js ] && "
            f"[ ! -f {REPO_DIR}/.outpatient-one-stop-role-order-v6-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateOutpatientOneStopRoleOrderV6.js && "
            f"touch {REPO_DIR}/.outpatient-one-stop-role-order-v6-applied; fi",
            timeout=120,
            label="调整门诊一站式资料收集与健康顾问评估顺序",
        )
        if code:
            raise RuntimeError("门诊一站式岗位顺序迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateOutpatientRemoveDuplicateBookingV10.js ] && "
            f"[ ! -f {REPO_DIR}/.outpatient-remove-duplicate-booking-v10-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateOutpatientRemoveDuplicateBookingV10.js && "
            f"touch {REPO_DIR}/.outpatient-remove-duplicate-booking-v10-applied; fi",
            timeout=120,
            label="移除门诊一站式重复预约节点并迁移活动方案",
        )
        if code:
            raise RuntimeError("门诊一站式重复预约节点迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateOutpatientStaffAssignmentV11.js ] && "
            f"[ ! -f {REPO_DIR}/.outpatient-staff-assignment-v11-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateOutpatientStaffAssignmentV11.js && "
            f"touch {REPO_DIR}/.outpatient-staff-assignment-v11-applied; fi",
            timeout=120,
            label="为门诊一站式增加健康规划师执行人员安排环节",
        )
        if code:
            raise RuntimeError("门诊一站式执行人员安排迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateOutpatientBookingSnapshotV12.js ] && [ ! -f {REPO_DIR}/.outpatient-booking-snapshot-v12-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateOutpatientBookingSnapshotV12.js && touch {REPO_DIR}/.outpatient-booking-snapshot-v12-applied; fi",
            timeout=120, label="补齐门诊代诊日预约信息交接",
        )
        if code:
            raise RuntimeError("门诊代诊日预约信息交接迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateOutpatientIntakeTaskV7.js ] && "
            f"[ ! -f {REPO_DIR}/.outpatient-intake-task-v7-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateOutpatientIntakeTaskV7.js && "
            f"touch {REPO_DIR}/.outpatient-intake-task-v7-applied; fi",
            timeout=120,
            label="明确门诊一站式首环节资料上传与完整性审核",
        )
        if code:
            raise RuntimeError("门诊一站式资料收集任务迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateOutpatientSupervisorGateV8.js ] && "
            f"[ ! -f {REPO_DIR}/.outpatient-supervisor-gate-v8-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateOutpatientSupervisorGateV8.js && "
            f"touch {REPO_DIR}/.outpatient-supervisor-gate-v8-applied; fi",
            timeout=120,
            label="取消门诊一站式逐环节督办闸门并解锁当前岗位",
        )
        if code:
            raise RuntimeError("门诊一站式督办闸门迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateOutpatientAdvisorDataV9.js ] && "
            f"[ ! -f {REPO_DIR}/.outpatient-advisor-data-v9-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateOutpatientAdvisorDataV9.js && "
            f"touch {REPO_DIR}/.outpatient-advisor-data-v9-applied; fi",
            timeout=120,
            label="向门诊预约环节补传健康顾问评估信息",
        )
        if code:
            raise RuntimeError("健康顾问评估信息迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateOutpatientProxyEscortHandoffV13.js ] && "
            f"[ ! -f {REPO_DIR}/.outpatient-proxy-escort-handoff-v13-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateOutpatientProxyEscortHandoffV13.js && "
            f"touch {REPO_DIR}/.outpatient-proxy-escort-handoff-v13-applied; fi",
            timeout=120,
            label="修复首次代诊完成后的陪诊专员任务交接",
        )
        if code:
            raise RuntimeError("门诊一站式陪诊任务交接修复失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateOutpatientEscortHandoffDataV14.js ] && "
            f"[ ! -f {REPO_DIR}/.outpatient-escort-handoff-data-v14-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateOutpatientEscortHandoffDataV14.js && "
            f"touch {REPO_DIR}/.outpatient-escort-handoff-data-v14-applied; fi",
            timeout=120,
            label="补齐当前陪诊任务的代诊日与检查预约信息",
        )
        if code:
            raise RuntimeError("门诊一站式陪诊资料交接迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateCheckupPlanDesignV5.js ] && "
            f"[ ! -f {REPO_DIR}/.checkup-plan-design-v5-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateCheckupPlanDesignV5.js && "
            f"touch {REPO_DIR}/.checkup-plan-design-v5-applied; fi",
            timeout=120,
            label="补齐健康顾问体检方案定制节点",
        )
        if code:
            raise RuntimeError("健康顾问体检方案定制节点补齐失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateCheckupSerialWorkflowV6.js ] && "
            f"[ ! -f {REPO_DIR}/.checkup-serial-workflow-v6-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateCheckupSerialWorkflowV6.js && "
            f"touch {REPO_DIR}/.checkup-serial-workflow-v6-applied; fi",
            timeout=120,
            label="按客户确认状态切换体检岗位任务",
        )
        if code:
            raise RuntimeError("体检岗位串行任务迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateCheckupSerialWorkflowV7.js ] && "
            f"[ ! -f {REPO_DIR}/.checkup-serial-workflow-v7-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateCheckupSerialWorkflowV7.js && "
            f"touch {REPO_DIR}/.checkup-serial-workflow-v7-applied; fi",
            timeout=120,
            label="纠正体检后续岗位任务阻塞状态",
        )
        if code:
            raise RuntimeError("体检后续岗位任务阻塞状态迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateCheckupClosureV9.js ] && "
            f"[ ! -f {REPO_DIR}/.checkup-closure-v9-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateCheckupClosureV9.js && "
            f"touch {REPO_DIR}/.checkup-closure-v9-applied; fi",
            timeout=120,
            label="关联体检陪诊记录与报告闭环",
        )
        if code:
            raise RuntimeError("体检报告闭环关联迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateLegacyHealthManagerClosureV10.js ] && "
            f"[ ! -f {REPO_DIR}/.legacy-health-manager-closure-v10-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateLegacyHealthManagerClosureV10.js && "
            f"touch {REPO_DIR}/.legacy-health-manager-closure-v10-applied; fi",
            timeout=120,
            label="归并健管专员历史体检收尾任务",
        )
        if code:
            raise RuntimeError("健管专员历史体检收尾任务归并失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateCheckupSupervisionClosureV12.js ] && "
            f"[ ! -f {REPO_DIR}/.checkup-supervision-closure-v12-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateCheckupSupervisionClosureV12.js --apply && "
            f"touch {REPO_DIR}/.checkup-supervision-closure-v12-applied; fi",
            timeout=180,
            label="增加体检结果评估、健康规划师总督办与最终验收",
        )
        if code:
            raise RuntimeError("体检一站式最终闭环迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/migrateCheckupTemplateWorkflowV13.js ] && "
            f"[ ! -f {REPO_DIR}/.checkup-template-workflow-v13-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/migrateCheckupTemplateWorkflowV13.js --apply && "
            f"touch {REPO_DIR}/.checkup-template-workflow-v13-applied; fi",
            timeout=180,
            label="统一体检模板与 Admin 产品流程并移除历史错误关联",
        )
        if code:
            raise RuntimeError("体检模板与产品流程统一迁移失败")
        code, _ = run_migration(
            f"if [ -f {REPO_DIR}/backend/src/scripts/consolidateCheckupTemplatesV14.js ] && "
            f"[ ! -f {REPO_DIR}/.checkup-template-consolidation-v14-applied ]; then "
            f"cd {REPO_DIR}/backend && node src/scripts/consolidateCheckupTemplatesV14.js --apply && "
            f"touch {REPO_DIR}/.checkup-template-consolidation-v14-applied; fi",
            timeout=180,
            label="合并嘉医管家与金伊森重复体检模板",
        )
        if code:
            raise RuntimeError("体检模板合并迁移失败")
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
    parser.add_argument("--skip-data-migrations", action="store_true", help="仅发布代码，不执行数据迁移或创建迁移标记")
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
            skip_data_migrations=args.skip_data_migrations,
        )
    except (RuntimeError, OSError) as exc:
        print(f"部署失败：{exc}", file=sys.stderr)
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
