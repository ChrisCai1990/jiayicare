"""Shared SSH configuration for local maintenance scripts.

Credentials must stay outside Git. Set JIAYICARE_SSH_PASSWORD or
JIAYICARE_SSH_KEY_PATH before running a maintenance script.
"""

import base64
import hashlib
import os

import paramiko


HOST = os.environ.get("JIAYICARE_SSH_HOST", "121.40.156.39")
USER = os.environ.get("JIAYICARE_SSH_USER", "root")


class PinnedHostKeyPolicy(paramiko.MissingHostKeyPolicy):
    def __init__(self, fingerprint: str):
        self.fingerprint = fingerprint

    def missing_host_key(self, client, hostname, key):
        actual = "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode().rstrip("=")
        if actual != self.fingerprint:
            raise paramiko.SSHException(f"SSH host key mismatch for {hostname}: {actual}")
        client.get_host_keys().add(hostname, key.get_name(), key)


def connect(timeout: int = 15) -> paramiko.SSHClient:
    password = os.environ.get("JIAYICARE_SSH_PASSWORD")
    key_filename = os.environ.get("JIAYICARE_SSH_KEY_PATH")
    if not password and not key_filename:
        raise RuntimeError(
            "Set JIAYICARE_SSH_PASSWORD or JIAYICARE_SSH_KEY_PATH before connecting."
        )

    client = paramiko.SSHClient()
    client.load_system_host_keys()
    fingerprint = os.environ.get("JIAYICARE_SSH_HOST_FINGERPRINT", "")
    client.set_missing_host_key_policy(PinnedHostKeyPolicy(fingerprint) if fingerprint else paramiko.RejectPolicy())
    client.connect(
        HOST,
        username=USER,
        password=password,
        key_filename=key_filename,
        timeout=timeout,
    )
    return client
