#!/usr/bin/env python3
"""Read-only production preflight for Jin Juan's management-review pilot."""

import base64
import hashlib
import json
import os
import shlex
from pathlib import Path

from ssh_config import connect


PATIENT_ID = "6a4ef1980f2291549b4ffd8d"
KNOWN_HOSTS = Path("C:/Users/huawei/.ssh/known_hosts")
REMOTE_DIR = "/var/www/jiayicare"

CHECK = r"""
const cp = require('child_process');
require('dotenv').config({ path: 'backend/.env', quiet: true });
const { MongoClient, ObjectId } = require('mongoose').mongo;
const policy = require('./backend/src/utils/managementReviewPolicy');
const id = '__PATIENT_ID__';
(async () => {
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
  try {
    await client.connect();
    const db = client.db();
    const user = await db.collection('users').findOne({ _id: new ObjectId(id), isDeleted: { $ne: true }, archivedAt: null },
      { projection: { name: 1, createdAt: 1, serviceStartDate: 1, serviceExpiry: 1,
        assignedFamilyDoctor: 1, assignedNutritionist: 1, assignedRehabSpecialist: 1 } });
    const app = JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 15000 }))
      .find(row => row.name === 'jiayicare-backend');
    const effective = { ...process.env, ...(app?.pm2_env || {}) };
    const periods = user ? policy.periods(user, new Date(), effective) : [];
    const [confirmedPlans, existingReviews] = await Promise.all([
      db.collection('annualplans').find({ patientId: new ObjectId(id), confirmedAt: { $ne: null } })
        .project({ year: 1, pushedAt: 1, updatedAt: 1, reviewStatus: 1, moduleData: 1 }).toArray(),
      db.collection('managementreviews').find({ patientId: new ObjectId(id) })
        .project({ periodKey: 1, status: 1, goalReviews: 1, roles: 1, contributions: 1, generation: 1 }).toArray(),
    ]);
    const phaseAssessments = await db.collection('phaseassessments').find({ patientId: new ObjectId(id) })
      .project({ periodKey: 1, status: 1 }).toArray();
    console.log(JSON.stringify({
      patientVerified: user?.name === '金娟',
      activeRecordFound: Boolean(user),
      assignedAdvisor: Boolean(user?.assignedFamilyDoctor),
      assignedNutritionist: Boolean(user?.assignedNutritionist),
      assignedRehabSpecialist: Boolean(user?.assignedRehabSpecialist),
      confirmedPlans: confirmedPlans.map(row => ({ year: row.year, pushed: Boolean(row.pushedAt), reviewStatus: row.reviewStatus,
        goalCount: row.moduleData?.management_targets?.records?.length || 0,
        modules: Object.entries(row.moduleData || {}).filter(([, value]) => value?.enabled !== false)
          .map(([key, value]) => ({ key, count: value?.records?.length || 0,
            linkedSourceCount: value?.records?.filter(item => item.sourceIds?.length).length || 0,
            sources: (value?.records || []).map(item => (item.sourceIds || []).map(String)) })) })),
      healthManagementMode: effective.HEALTH_MANAGEMENT_ROLLOUT_MODE || 'unset',
      healthManagementEnabled: effective.HEALTH_MANAGEMENT_ROLLOUT_MODE === 'all'
        || effective.HEALTH_MANAGEMENT_ROLLOUT_MODE === 'allowlist'
          && String(effective.HEALTH_MANAGEMENT_PATIENT_IDS || '').split(',').map(x => x.trim()).includes(id),
      managementReviewMode: effective.MANAGEMENT_REVIEW_MODE || 'unset',
      managementReviewSelected: policy.enabled(id, effective),
      restoredPreviewSelected: policy.restored(id, effective),
      firstMonth: effective.MANAGEMENT_REVIEW_FIRST_MONTH || 'service-start',
      duePeriods: periods.filter(row => row.due).map(row => ({ key: row.key, kind: row.kind })),
      existingReviews: existingReviews.map(row => ({ key: row.periodKey, status: row.status,
        goalCount: row.goalReviews?.length || 0, roles: row.roles || [],
        submittedRoles: Object.entries(row.contributions || {}).filter(([, value]) => value?.status === 'submitted').map(([role]) => role),
        generationStatus: row.generation?.status || 'unset' })),
      phaseAssessments: phaseAssessments.map(row => ({ key: row.periodKey, status: row.status })),
      productionRevision: cp.execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    }));
  } finally { await client.close(); }
})().catch(error => { console.error('Preflight failed: ' + error.message); process.exitCode = 1; });
"""


def main() -> None:
    entry = next(line for line in KNOWN_HOSTS.read_text(encoding="utf-8").splitlines()
                 if line.startswith("121.40.156.39 ssh-ed25519 "))
    os.environ["JIAYICARE_SSH_HOST_FINGERPRINT"] = "SHA256:" + base64.b64encode(
        hashlib.sha256(base64.b64decode(entry.split()[2])).digest()).decode().rstrip("=")
    command = "cd " + shlex.quote(REMOTE_DIR) + " && node -e " + shlex.quote(CHECK.replace("__PATIENT_ID__", PATIENT_ID))
    with connect() as ssh:
        _, stdout, stderr = ssh.exec_command(command, timeout=60)
        output = stdout.read().decode("utf-8", "replace").strip()
        error = stderr.read().decode("utf-8", "replace").strip()
        if stdout.channel.recv_exit_status():
            raise SystemExit(error or output or "Preflight failed")
        print(json.dumps(json.loads(output), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
