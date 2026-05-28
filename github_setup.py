import requests
import base64
import json
from nacl import encoding, public

TOKEN = "YOUR_GITHUB_TOKEN_HERE"
OWNER = "chriscai1990"
REPO  = "huize-jiagong"

headers = {
    "Authorization": f"token {TOKEN}",
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
}

# 1. 创建仓库
print("1️⃣  创建仓库...")
r = requests.post("https://api.github.com/user/repos", headers=headers, json={
    "name": REPO,
    "private": False,
    "description": "汇泽甲功官网 | 自免·桥本·营养医学",
    "auto_init": False
})
if r.status_code in (201, 422):  # 422 = already exists
    if r.status_code == 422:
        print("   仓库已存在，跳过创建")
    else:
        print(f"   ✅ 仓库创建成功: https://github.com/{OWNER}/{REPO}")
else:
    print(f"   ❌ 创建失败: {r.status_code} {r.text}")
    exit(1)

# 2. 获取仓库公钥（用于加密 Secrets）
print("2️⃣  获取仓库公钥...")
r = requests.get(f"https://api.github.com/repos/{OWNER}/{REPO}/actions/secrets/public-key", headers=headers)
r.raise_for_status()
key_data = r.json()
pub_key_id = key_data["key_id"]
pub_key    = key_data["key"]
print(f"   ✅ key_id: {pub_key_id}")

def encrypt_secret(public_key_str: str, secret_value: str) -> str:
    pk = public.PublicKey(public_key_str.encode("utf-8"), encoding.Base64Encoder())
    box = public.SealedBox(pk)
    encrypted = box.encrypt(secret_value.encode("utf-8"))
    return base64.b64encode(encrypted).decode("utf-8")

# 3. 写入 Secrets
secrets = {
    "ECS_HOST": "39.106.218.225",
    "ECS_USER": "root",
    "ECS_PASS": "@Cbq19900208"
}

print("3️⃣  写入 GitHub Secrets...")
for name, value in secrets.items():
    encrypted = encrypt_secret(pub_key, value)
    r = requests.put(
        f"https://api.github.com/repos/{OWNER}/{REPO}/actions/secrets/{name}",
        headers=headers,
        json={"encrypted_value": encrypted, "key_id": pub_key_id}
    )
    if r.status_code in (201, 204):
        print(f"   ✅ {name} 已设置")
    else:
        print(f"   ❌ {name} 失败: {r.status_code} {r.text}")

print("\n✅ GitHub 仓库和 Secrets 配置完成！")
print(f"   https://github.com/{OWNER}/{REPO}")
