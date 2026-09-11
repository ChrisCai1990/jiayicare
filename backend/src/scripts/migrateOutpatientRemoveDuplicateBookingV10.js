/* eslint-disable no-console */
const mongoose = require('mongoose');
const { main } = require('./migrateOutpatientOneStopWorkflowV5');

if (require.main === module) {
  main()
    .catch(err => { console.error(err); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
}
