// Read-only Linux deployment audit. Emit booleans/file metadata, never credentials
// or customer records. Does not establish readiness or enable the deletion route.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const dotenv = require('dotenv');
const processRows = JSON.parse(cp.execFileSync('pm2', ['jlist'], {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024}));
const prod = processRows.find(row => row.name === 'jiayicare-backend');
if (!prod || prod.pm2_env.pm_exec_path !== '/var/www/jiayicare/backend/src/index.js') throw Error('Unexpected production service');
const reviewService = Object.fromEntries(cp.execFileSync('systemctl', ['show', 'jiayicare-review-api',
  '--property=MainPID,EnvironmentFiles', '--no-pager'], {encoding: 'utf8'}).trim().split('\n').map(line => {
  const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
}));
function processEnvironment(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) < 1) throw Error('Service not running');
  return Object.fromEntries(fs.readFileSync('/proc/' + pid + '/environ', 'utf8').split('\0').filter(x => x.includes('=')).map(x => {
    const at = x.indexOf('='); return [x.slice(0, at), x.slice(at + 1)];
  }));
}
function fileEnvironment(filename) { return fs.existsSync(filename) ? dotenv.parse(fs.readFileSync(filename)) : {}; }
const reviewFiles = [...reviewService.EnvironmentFiles.matchAll(/(\/[^\s;]+) \(ignore_errors=(?:yes|no)\)/g)].map(match => match[1]);
const environments = [
  ['production', {...fileEnvironment('/var/www/jiayicare/backend/.env'), ...prod.pm2_env, ...processEnvironment(prod.pid)}],
  ['review', Object.assign({}, ...reviewFiles.map(fileEnvironment), processEnvironment(reviewService.MainPID))],
].map(([environment, env]) => ({environment,
  deletionEnabled: env.ACCOUNT_DELETION_ENABLED === 'true', guardEnabled: env.ACCOUNT_DELETION_GUARD_ENABLED === 'true',
  financeKeyConfigured: !!env.ACCOUNT_DELETION_ARCHIVE_KEYS,
  financeReviewerConfigured: !!env.ACCOUNT_DELETION_FINANCE_ADMIN_IDS, ossConfigured: !!env.OSS_BUCKET}));
const roots = ['/var/backups/jiayicare', '/var/backups/jiayicare-staging', '/var/www/jiayicare/backups',
  '/var/www/jiayicare/backend/backups', '/var/www/jiayicare-review/backups', '/root/.pm2/logs', '/var/log/nginx'];
const backups = roots.map(root => {
  const types = {}; let count = 0, bytes = 0, symlinks = 0;
  function visit(folder) {
    for (const item of fs.readdirSync(folder, {withFileTypes: true})) {
      const file = path.join(folder, item.name);
      if (item.isSymbolicLink()) { symlinks++; continue; }
      if (item.isDirectory()) visit(file);
      else if (item.isFile()) {
        const stat = fs.statSync(file), extension = item.name.endsWith('.archive.gz') ? '.archive.gz' : path.extname(item.name);
        count++; bytes += stat.size; types[extension] = (types[extension] || 0) + 1;
      }
    }
  }
  if (fs.existsSync(root)) visit(root);
  return {root, exists: fs.existsSync(root), count, bytes, symlinks, types};
});
console.log(JSON.stringify({checkedAt: new Date().toISOString(), environments, backups,
  limitation: 'File metadata and selected configuration only; not proof of deletion or exhaustive backup discovery.'}));
