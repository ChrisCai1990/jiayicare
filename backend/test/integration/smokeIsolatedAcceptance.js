// Uses real login/authorization routes; never prints passwords or bearer tokens.
const fs = require('node:fs');
const assert = require('node:assert/strict');

async function main() {
  const session = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert.equal(session.api, 'http://127.0.0.1:3000/api');
  assert.match(session.database, /^jiayicare_acceptance_[a-f0-9]{32}$/);
  const request = async (route, options = {}) => {
    const response = await fetch(session.api + route, { ...options, signal: AbortSignal.timeout(15000) });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request('/staff/me')).status, 401);
  for (const account of session.accounts) {
    const login = await request('/staff/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: account.username, password: account.password }) });
    assert.equal(login.status, 200);
    const headers = { Authorization: `Bearer ${login.body.data.token}` };
    const me = await request('/staff/me', { headers });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.role, account.role);
    for (const route of ['/staff/ai-todos', '/staff/followups']) {
      const result = await request(route, { headers });
      assert.equal(result.status, 200, `${account.role} ${route}: ${JSON.stringify(result.body)}`);
    }
    console.log(`${account.role}: login, identity, AI workbench and followups OK`);
  }
  console.log('Unauthenticated access rejected. This is smoke acceptance, not full business closure.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
