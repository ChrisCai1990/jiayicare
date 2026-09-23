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


def ensure_remote_dir(sftp, remote: PurePosixPath) -> None:
    current = PurePosixPath("/")
    for part in remote.parts[1:]:
        current /= part
        try:
            sftp.stat(str(current))
        except FileNotFoundError:
            sftp.mkdir(str(current))


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
                remote_path = REMOTE_ROOT.joinpath(*relative.parts)
                ensure_remote_dir(sftp, remote_path.parent)
                sftp.put(str(local_path), str(remote_path))
                uploaded += 1
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
