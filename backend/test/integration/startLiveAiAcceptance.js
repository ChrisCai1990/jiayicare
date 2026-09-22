// Credential arrives over parent-owned stdin, never argv, disk, or printed output.
const readline = require('node:readline');
if (process.env.RUN_ISOLATED_ACCEPTANCE !== 'true') throw Error('Explicit opt-in required');
const input = readline.createInterface({ input: process.stdin });
input.once('line', key => {
  input.close();
  require('./startIsolatedAcceptance').main({ qwenKey: key.trim() }).catch(() => {
    console.error('LIVE_ACCEPTANCE_START_FAILED'); process.exit(1);
  });
});
