const test=require('node:test'),assert=require('node:assert/strict');
const {systemdConfiguration}=require('../src/utils/accountDeletionOfflineFence');
test('stopped systemd writer retains its configured database and guard identity',()=>{
 const output='MainPID=0\nActiveState=inactive\nEnvironmentFiles=/etc/jiayicare/review.env (ignore_errors=no)\nEnvironment=NODE_ENV=production';
 const result=systemdConfiguration('jiayicare-review-api',()=>output,file=>{
  assert.equal(file,'/etc/jiayicare/review.env');
  return 'MONGODB_URI=mongodb://127.0.0.1/synthetic\nACCOUNT_DELETION_GUARD_ENABLED=true\nACCOUNT_DELETION_LEDGER_FILE=/private/ledger';
 });
 assert.equal(result.pid,0);assert.equal(result.status,'inactive');
 assert.equal(result.environment.MONGODB_URI,'mongodb://127.0.0.1/synthetic');
 assert.equal(result.environment.ACCOUNT_DELETION_GUARD_ENABLED,'true');
});
test('unreadable files, ambiguous filenames and inline database overrides fail closed',()=>{
 assert.throws(()=>systemdConfiguration('unit',()=> 'EnvironmentFiles=/etc/a.env (ignore_errors=no)',()=>{throw Error('unreadable')}),/unreadable/);
 assert.throws(()=>systemdConfiguration('unit',()=> 'EnvironmentFiles=/etc/a b.env (ignore_errors=no)'),{code:'DELETION_SYSTEMD_ENV_FILES_UNSUPPORTED'});
 assert.throws(()=>systemdConfiguration('unit',()=> 'Environment=MONGODB_URI=mongodb://other/db'),{code:'DELETION_SYSTEMD_INLINE_CONFIGURATION'});
});
