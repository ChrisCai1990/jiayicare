"""Stage the isolated Taro H5 preview without touching the deployed app root.

Replacements preserve the previous preview as a backup; normal releases still
use scripts/deploy.py and a clean, committed master.
"""

import argparse
from pathlib import Path
from uuid import uuid4

from ssh_config import connect


ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "miniprogram" / "dist"
REMOTE_ROOT = "/var/www/jiayicare/app/dist"
REMOTE_FINAL = REMOTE_ROOT + "/mobile-preview"


def exists(sftp, path):
    try:
        sftp.stat(path)
        return True
    except FileNotFoundError:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publish", action="store_true", help="upload to the isolated preview path")
    parser.add_argument("--replace", action="store_true", help="back up and replace an existing preview")
    args = parser.parse_args()

    index = DIST / "index.html"
    if not index.is_file() or 'src="/mobile-preview/' not in index.read_text(encoding="utf-8"):
        raise SystemExit("Build H5 with JIAYICARE_H5_PUBLIC_PATH=/mobile-preview/ first")
    files = sorted(path for path in DIST.rglob("*") if path.is_file())
    if not files or any(path.suffix in {".wxss", ".wxml"} for path in files):
        raise SystemExit("The dist folder is not a clean H5 build")
    if not any(path.name.endswith(".mjs") for path in files):
        raise SystemExit("PDF preview worker is missing")
    print(f"H5 preview: {len(files)} files, {sum(p.stat().st_size for p in files)} bytes")
    if not args.publish:
        print("Dry run only; pass --publish to upload")
        return

    client = connect()
    try:
        sftp = client.open_sftp()
        try:
            if not exists(sftp, REMOTE_ROOT):
                raise RuntimeError("Existing app document root is missing")
            present = exists(sftp, REMOTE_FINAL)
            if present != args.replace:
                raise RuntimeError("Use --replace only when the preview already exists")
            stage = REMOTE_ROOT + "/.mobile-preview-stage-" + uuid4().hex[:12]
            sftp.mkdir(stage)
            made = {stage}
            for local in files:
                relative = local.relative_to(DIST).as_posix()
                parent = stage
                for part in relative.split("/")[:-1]:
                    parent += "/" + part
                    if parent not in made:
                        sftp.mkdir(parent)
                        made.add(parent)
                remote = stage + "/" + relative
                sftp.put(str(local), remote)
                if sftp.stat(remote).st_size != local.stat().st_size:
                    raise RuntimeError(f"Upload size mismatch: {relative}")
            if exists(sftp, REMOTE_FINAL) != present:
                raise RuntimeError("Preview changed during upload; refusing to replace it")
            backup = None
            if present:
                backup = REMOTE_ROOT + "/mobile-preview.backup-" + uuid4().hex[:12]
                sftp.rename(REMOTE_FINAL, backup)
            try:
                sftp.rename(stage, REMOTE_FINAL)
            except Exception:
                if backup:
                    sftp.rename(backup, REMOTE_FINAL)
                raise
            print("Published isolated preview at https://jiaycare.com/mobile-preview/")
            if backup:
                print(f"Previous preview retained at {backup}")
        finally:
            sftp.close()
    finally:
        client.close()


if __name__ == "__main__":
    main()
