#!/usr/bin/env python3
"""Safely inspect or sync only AnnualPlanTemplate records from production to staging."""

import argparse
import json
import shlex

from ssh_config import connect

PROD_ENV = "/var/www/jiayicare/backend/.env"
STAGING_ENV = "/var/www/jiayicare-staging/backend/.env"
NODE_MODULE = "/var/www/jiayicare/node_modules/mongodb"


def remote_command(apply: bool) -> str:
    action = "sync" if apply else "inspect"
    script = r'''const { MongoClient } = require(process.env.NODE_MONGODB);
const compact = row => ({ id: String(row._id), name: row.name, planType: row.planType, year: row.year, updatedAt: row.updatedAt });
(async () => {
  const prod = new MongoClient(process.env.PROD_URI);
  const staging = new MongoClient(process.env.STAGING_URI);
  await Promise.all([prod.connect(), staging.connect()]);
  try {
    const source = await prod.db().collection('annualplantemplates').find({}).toArray();
    if (process.env.ACTION === 'sync') {
      // Upsert by production _id: only this collection is changed; no deletes are performed.
      for (const row of source) await staging.db().collection('annualplantemplates').replaceOne({ _id: row._id }, row, { upsert: true });
    }
    const target = await staging.db().collection('annualplantemplates').find({}).toArray();
    console.log(JSON.stringify({ action: process.env.ACTION, production: source.map(compact), staging: target.map(compact) }));
  } finally { await Promise.all([prod.close(), staging.close()]); }
})().catch(error => { console.error(error.message); process.exit(1); });'''
    encoded = json.dumps(script)
    return (
        f"set -a; . {shlex.quote(PROD_ENV)}; set +a; PROD_URI=\"$MONGODB_URI\"; "
        f"set -a; . {shlex.quote(STAGING_ENV)}; set +a; STAGING_URI=\"$MONGODB_URI\"; "
        f"export PROD_URI STAGING_URI; ACTION={shlex.quote(action)} NODE_MONGODB={shlex.quote(NODE_MODULE)} "
        f"node -e {shlex.quote(script)}"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true', help='write production annual-plan templates to staging')
    args = parser.parse_args()
    ssh = connect()
    try:
      _, out, err = ssh.exec_command(remote_command(args.apply), timeout=60, get_pty=True)
      stdout = out.read().decode('utf-8', 'replace').strip()
      stderr = err.read().decode('utf-8', 'replace').strip()
      code = out.channel.recv_exit_status()
      if code:
          raise RuntimeError(stderr or stdout or f'remote exit {code}')
      print(stdout)
    finally:
      ssh.close()


if __name__ == '__main__':
    main()
