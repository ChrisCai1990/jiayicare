const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
test('deployment refuses divergent history and does not remove Git operation locks', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/deploy.py'), 'utf8');
  assert.ok(source.includes('git merge --ff-only origin/master'));
  assert.ok(source.includes('git merge --ff-only {revision}'));
  assert.ok(source.includes('test ! -e .git/index.lock'));
  assert.ok(source.includes('git status --porcelain --untracked-files=no'));
  assert.ok(!source.includes('git reset --hard'));
  assert.ok(!source.includes('rm -f {REPO_DIR}/.git/index.lock'));
});
