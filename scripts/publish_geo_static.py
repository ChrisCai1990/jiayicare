#!/usr/bin/env python3
"""Publish only the public GEO static files to the configured Nginx directory.

This deliberately avoids changing application code, database data, Nginx
configuration, or running processes.
"""

from __future__ import annotations

import os
from pathlib import Path, PurePosixPath

from ssh_config import connect


LOCAL_ROOT = Path(__file__).resolve().parents[1] / "geo-knowledge-center"
REMOTE_ROOT = PurePosixPath("/var/www/jiayicare-static/knowledge")
PRIVATE_ROOTS = {".preview", "content", "scripts"}
PRIVATE_FILES = {"README.md", ".gitignore"}


def ensure_remote_dir(sftp, remote: PurePosixPath) -> None:
    current = PurePosixPath("/")
    for part in remote.parts[1:]:
        current /= part
        try:
            sftp.stat(str(current))
        except FileNotFoundError:
            sftp.mkdir(str(current))


def remove_remote_tree(sftp, remote: PurePosixPath) -> None:
    """Remove only known accidentally-published internal build inputs."""
    try:
        entries = sftp.listdir_attr(str(remote))
    except FileNotFoundError:
        return
    for entry in entries:
        target = remote / entry.filename
        if entry.st_mode & 0o040000:
            remove_remote_tree(sftp, target)
        else:
            sftp.remove(str(target))
    sftp.rmdir(str(remote))


def main() -> None:
    if not (LOCAL_ROOT / "index.html").is_file():
        raise RuntimeError(f"Missing GEO homepage: {LOCAL_ROOT / 'index.html'}")

    client = connect()
    try:
        sftp = client.open_sftp()
        try:
            ensure_remote_dir(sftp, REMOTE_ROOT)
            uploaded = 0
            for local_path in sorted(LOCAL_ROOT.rglob("*")):
                if not local_path.is_file():
                    continue
                relative = local_path.relative_to(LOCAL_ROOT)
                if relative.parts[0] in PRIVATE_ROOTS or relative.name in PRIVATE_FILES:
                    continue
                remote_path = REMOTE_ROOT.joinpath(*relative.parts)
                ensure_remote_dir(sftp, remote_path.parent)
                sftp.put(str(local_path), str(remote_path))
                uploaded += 1
            for private_root in PRIVATE_ROOTS:
                remove_remote_tree(sftp, REMOTE_ROOT / private_root)
            for private_file in PRIVATE_FILES:
                try:
                    sftp.remove(str(REMOTE_ROOT / private_file))
                except FileNotFoundError:
                    pass
        finally:
            sftp.close()

        command = (
            f"test -f {REMOTE_ROOT / 'index.html'} "
            f"&& test -f {REMOTE_ROOT / 'privacy-policy.html'}"
        )
        _, stdout, stderr = client.exec_command(command)
        if stdout.channel.recv_exit_status() != 0:
            raise RuntimeError(stderr.read().decode("utf-8", "replace").strip() or "Remote verification failed")
        print(f"Published {uploaded} GEO static files.")
    finally:
        client.close()


if __name__ == "__main__":
    main()
