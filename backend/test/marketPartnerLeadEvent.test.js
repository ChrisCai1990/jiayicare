const test = require('node:test');
const assert = require('node:assert/strict');
const { contributionFromRows } = require('../src/utils/marketPartnerLeadEvent');

test('first conversation stays earliest while later direct contribution retains its own evidence', () => {
  const firstAt = new Date('2026-11-01T03:00:00Z');
  assert.deepEqual(contributionFromRows([
    { _id: 'first', occurredAt: firstAt, directReferral: false },
    { _id: 'direct', occurredAt: new Date('2026-11-02T03:00:00Z'), directReferral: true },
  ]), { eventId: 'first', firstConversationAt: firstAt, directReferral: true,
    directEventId: 'direct' });
  assert.equal(contributionFromRows([]), null);
});
