"""Shared SSH configuration for local maintenance scripts.

Credentials must stay outside Git. Set JIAYICARE_SSH_PASSWORD or
JIAYICARE_SSH_KEY_PATH before running a maintenance script.
"""

import os

import paramiko


HOST = os.environ.get("JIAYICARE_SSH_HOST", "121.40.156.39")
USER = os.environ.get("JIAYICARE_SSH_USER", "root")


def connect(timeout: int = 15) -> paramiko.SSHClient:
    password = os.environ.get("JIAYICARE_SSH_PASSWORD")
    key_filename = os.environ.get("JIAYICARE_SSH_KEY_PATH")
    if not password and not key_filename:
        raise RuntimeError(
            "Set JIAYICARE_SSH_PASSWORD or JIAYICARE_SSH_KEY_PATH before connecting."
        )

    client = paramiko.SSHClient()
    client.load_system_host_keys()
    client.set_missing_host_key_policy(paramiko.RejectPolicy())
    client.connect(
        HOST,
        username=USER,
        password=password,
        key_filename=key_filename,
        timeout=timeout,
    )
    return client
