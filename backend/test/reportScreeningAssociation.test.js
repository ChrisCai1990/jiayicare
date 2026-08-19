const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { validateReportScreeningAssociation } = require('../src/utils/reportScreeningAssociation');

const id = () => new mongoose.Types.ObjectId();

test('screening report requires an active visible L1 category', () => {
  assert.match(validateReportScreeningAssociation({ screeningL1: 'invalid', screeningL2: '血压' }).message, /大类已失效/);
  assert.match(validateReportScreeningAssociation({ screeningL1: id(), screeningL2: '血压', l1Node: null }).message, /大类已失效/);
});

test('screening report rejects a missing or cross-parent L2 category', () => {
  const l1Id = id();
  const otherL1Id = id();
  const l1Node = { _id: l1Id };
  assert.match(validateReportScreeningAssociation({ screeningL1: l1Id, screeningL2: '', l1Node }).message, /具体分类/);
  assert.match(validateReportScreeningAssociation({
    screeningL1: l1Id,
    screeningL2: '血压',
    l1Node,
    l2Node: { _id: id(), parent: otherL1Id, name: '血压' },
  }).message, /不属于/);
});

test('screening report accepts a visible L2 child of the selected L1', () => {
  const l1Id = id();
  assert.equal(validateReportScreeningAssociation({
    screeningL1: l1Id,
    screeningL2: '血压',
    l1Node: { _id: l1Id },
    l2Node: { _id: id(), parent: l1Id, name: '血压' },
  }), null);
});
