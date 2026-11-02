const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { generateChatFollowupDraft } = require('../../src/utils/chatFollowupDraft');
const scheduler = require('../../src/utils/chatFollowupScheduler');

test('retired chat drafts have no generation entry point', async () => {
  assert.equal((await generateChatFollowupDraft({ patientId: 'synthetic', role: 'nutritionist' })).status, 'skip');
  assert.equal((await scheduler.scanAndGenerateChatFollowupDrafts()).status, 'skip');
  assert.equal(scheduler.startChatFollowupScheduler(), null);
});

test('staff routes reject old manual generation and resolution', () => {
  const source = fs.readFileSync(require.resolve('../../src/routes/staff'), 'utf8');
  for (const suffix of ['ai-draft', 'resolve']) {
    assert.match(source, new RegExp(`router\\.post\\('/patients/:id/chat-followup/${suffix}'[\\s\\S]*?res\\.status\\(410\\)`));
  }
  const index = fs.readFileSync(require.resolve('../../src/index'), 'utf8');
  assert.doesNotMatch(index, /startChatFollowupScheduler/);
});
