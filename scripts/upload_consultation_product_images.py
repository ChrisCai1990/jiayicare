"""Attach the two approved consultation covers to existing unpublished products.

Read-only by default. Pass --apply to upload files and set the image fields.
"""

import argparse
import hashlib
import json
import posixpath
import shlex
from pathlib import Path

from ssh_config import connect


ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = (
    ("6ae56f97f21be13bbc6b45fb", "单次专家咨询分析", "expert-consultation-20261101.png"),
    ("6ae56f97f21be13bbc6b45ff", "MDT 多学科咨询分析（远程）", "mdt-consultation-20261101.png"),
)
REMOTE_ROOT = "/var/www/jiayicare"


def run(ssh, command):
    _, stdout, stderr = ssh.exec_command(command, timeout=45)
    output = stdout.read().decode("utf-8")
    error = stderr.read().decode("utf-8")
    if stdout.channel.recv_exit_status() != 0:
        raise RuntimeError(error or output)
    return output.strip()


def db_script(apply):
    entries = [{"id": ident, "name": name, "file": filename} for ident, name, filename in PRODUCTS]
    return f"""
require('dotenv').config({{path:'backend/.env'}});
const mongoose=require('mongoose');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const entries={json.dumps(entries, ensure_ascii=False)};
const apply={str(apply).lower()};
(async()=>{{
  await mongoose.connect(process.env.MONGODB_URI,{{autoIndex:false,autoCreate:false,serverSelectionTimeoutMS:10000}});
  const db=mongoose.connection.db;
  const tenant=await db.collection('tenants').findOne({{code:'jiayihui'}},{{projection:{{_id:1}}}});
  if(!tenant) throw new Error('tenant missing');
  const uploadDir=process.env.UPLOADS_DIR || path.join(process.cwd(),'uploads');
  const out=[];
  for(const entry of entries){{
    const id=new mongoose.Types.ObjectId(entry.id);
    const product=await db.collection('products').findOne({{_id:id,tenantId:tenant._id}},{{projection:{{name:1,status:1,images:1,originalPrice:1}}}});
    if(!product || product.name!==entry.name || product.status!=='off') throw new Error('unexpected product state: '+entry.name);
    const url='/api/uploads/'+entry.file;
    const existing=product.images || [];
    if(existing.length && !(existing.length===1 && existing[0]===url)) throw new Error('existing image requires manual review: '+entry.name);
    const file=path.join(uploadDir,entry.file);
    let sha256=null;
    if(fs.existsSync(file)) sha256=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if(apply){{
      if(!sha256) throw new Error('uploaded file missing: '+file);
      const result=await db.collection('products').updateOne({{_id:id,tenantId:tenant._id,name:entry.name,status:'off',images:existing}},{{$set:{{images:[url]}}}});
      if(result.matchedCount!==1) throw new Error('concurrent product change: '+entry.name);
    }}
    out.push({{id:entry.id,name:entry.name,status:product.status,before:existing,after:apply?[url]:null,uploadDir,fileExists:!!sha256,sha256}});
  }}
  console.log(JSON.stringify(out));
  await mongoose.disconnect();
}})().catch(e=>{{console.error(e.message);process.exitCode=1;}});
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    with connect() as ssh:
        head = run(ssh, f"cd {shlex.quote(REMOTE_ROOT)} && git rev-parse HEAD")
        if head not in {
            "c03e234a7a84341f241d5e80c51d5a224966d574",
            "87b2cdb2e7199af4b723f2a36b90ed1b9a780cdf",
        }:
            raise RuntimeError(f"production HEAD changed: {head}")
        print("production_head", head)
        command = f"cd {shlex.quote(REMOTE_ROOT)} && node -e {shlex.quote(db_script(False))}"
        print("before", run(ssh, command))
        for _, _, filename in PRODUCTS:
            url = "https://jiaycare.com/api/uploads/" + filename
            print("public_image", filename, run(ssh, "curl -sS -o /dev/null -w '%{http_code} %{size_download} %{content_type}' " + shlex.quote(url)))
        if not args.apply:
            return
        sftp = ssh.open_sftp()
        try:
            upload_dir = run(ssh, f"cd {shlex.quote(REMOTE_ROOT)} && node -e " + shlex.quote("require('dotenv').config({path:'backend/.env'});console.log(process.env.UPLOADS_DIR || require('path').join(process.cwd(),'uploads'))"))
            for _, _, filename in PRODUCTS:
                local = ROOT / "assets" / "product-covers" / filename
                data = local.read_bytes()
                if len(data) < 100_000 or data[:8] != b"\x89PNG\r\n\x1a\n":
                    raise RuntimeError(f"invalid PNG: {filename}")
                remote = posixpath.join(upload_dir, filename)
                try:
                    sftp.stat(remote)
                except FileNotFoundError:
                    temporary = remote + ".uploading"
                    with sftp.open(temporary, "wb") as handle:
                        handle.write(data)
                    sftp.rename(temporary, remote)
                remote_sha = run(ssh, "sha256sum " + shlex.quote(remote)).split()[0]
                if remote_sha != hashlib.sha256(data).hexdigest():
                    raise RuntimeError(f"upload hash mismatch: {filename}")
                print("uploaded", filename, remote_sha)
        finally:
            sftp.close()
        print("after", run(ssh, f"cd {shlex.quote(REMOTE_ROOT)} && node -e {shlex.quote(db_script(True))}"))


if __name__ == "__main__":
    main()
