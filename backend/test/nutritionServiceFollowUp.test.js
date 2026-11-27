const test = require('node:test');
const assert = require('node:assert/strict');
const {reconcile, action} = require('../src/utils/nutritionServiceFollowUp');
const initial = {phase:'first',start:'2026-10-18',firstStart:'2026-10-21',end:'2027-11-17',lastMeasured:'2026-11-21',targetAt:'2026-12-19',history:[]};

test('preserves the booking on replay and rolls from actual measurement day', () => {
  assert.deepEqual(reconcile(initial,['2026-11-21'],'2026-11-27'),initial);
  const changed=action(initial,{action:'schedule',date:'2026-12-21'},'2026-12-01');
  const measured=reconcile(changed,['2026-12-21','2026-12-21'],'2026-12-23');
  assert.equal(measured.history.length,2);
  assert.equal(measured.history[1].previous,'2026-12-21');
  assert.equal(measured.lastMeasured,'2026-12-21');
  assert.equal(measured.targetAt,'2027-01-13');
  assert.deepEqual(reconcile(measured,['2026-12-21'],'2026-12-23'),measured);
});
test('rest reminder cannot start the second cycle; staff sets real start', () => {
  const resting=reconcile(initial,[],'2027-02-10');
  assert.equal(resting.phase,'rest');
  assert.equal(resting.targetAt,'2027-02-10');
  const deferred=action(resting,{action:'schedule',date:'2027-02-16'},'2027-02-10');
  assert.equal(deferred.secondStart,undefined);
  const second=action(deferred,{action:'start',date:'2027-02-16'},'2027-02-16');
  assert.equal(second.targetAt,'2027-03-16');
  const measured=reconcile(second,['2027-03-19'],'2027-03-19');
  assert.equal(measured.targetAt,'2027-04-16');
  const quarter=reconcile(measured,[],'2027-05-11');
  assert.equal(quarter.phase,'quarter');
  const scheduled=action(quarter,{action:'schedule',date:'2027-05-20'},'2027-05-12');
  assert.equal(reconcile(scheduled,['2027-05-21'],'2027-05-21').targetAt,'2027-08-13');
});
test('service expires, preserves history and blocks manual activity', () => {
  const s=reconcile(initial,[],'2027-11-18');
  assert.equal(s.phase,'finished');
  assert.throws(()=>action(s,{action:'schedule',date:'2027-11-19'},'2027-11-18'));
  assert.throws(()=>action(initial,{action:'end',reason:' '},'2026-11-28'));
  assert.equal(reconcile(initial,[],'2026-11-28',false).phase,'finished');
});
