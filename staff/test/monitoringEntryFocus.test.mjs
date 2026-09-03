import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../src/pages/PatientDetailPage.jsx', import.meta.url), 'utf8');
const start = source.indexOf('  // 从健康监测入口进入时');
const end = source.indexOf('  const handleArchiveSectionClick', start);
function run(options = {}) {
  let callback, cleanup, scrolls = 0, expanded = false;
  const context = { requestedTab: 'monitoring', tab: 'records', healthBaseView: 'monitoring', data: { user: { _id: 'patient' } }, id: 'patient', location: { key: 'entry' }, focusedMonitoringEntry: { current: null },
    archiveSectionsRef: { current: { querySelector: () => ({ classList: { remove: name => { assert.equal(name, 'archive-collapsed'); expanded = true; } }, scrollIntoView: () => { scrolls++; } }) } },
    useEffect: fn => { cleanup = fn(); }, requestAnimationFrame: fn => { callback = fn; return 1; }, cancelAnimationFrame: () => { callback = null; }, ...options };
  vm.runInNewContext(source.slice(start, end), context);
  return { context, flush: () => callback?.(), cancel: () => cleanup?.(), get expanded() { return expanded; }, get scrolls() { return scrolls; } };
}
test('monitoring entry expands submitted data and scrolls after render', () => {
  const result = run(); assert.equal(result.expanded, true); assert.equal(result.scrolls, 0);
  result.flush(); assert.equal(result.scrolls, 1); assert.equal(result.context.focusedMonitoringEntry.current, 'patient:entry');
});
test('ordinary browsing, loading and stale patient do not move scroll', () => {
  for (const options of [{ requestedTab: 'records' }, { data: null }, { data: { user: { _id: 'other' } } }, { healthBaseView: 'profile' }, { focusedMonitoringEntry: { current: 'patient:entry' } }]) {
    const result = run(options); result.flush(); assert.equal(result.expanded, false); assert.equal(result.scrolls, 0);
  }
});
test('navigation cleanup cancels a pending scroll', () => {
  const result = run(); result.cancel(); result.flush(); assert.equal(result.scrolls, 0); assert.equal(result.context.focusedMonitoringEntry.current, null);
});
