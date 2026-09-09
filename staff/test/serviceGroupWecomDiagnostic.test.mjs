import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../src/utils/serviceGroupWecom.js', import.meta.url), 'utf8')
  .replace(/^import .*;\r?\n/m, '').replace(/export /g, '');
const scope = vm.createContext({ setTimeout, clearTimeout });
vm.runInContext(source, scope);
test('SDK errors distinguish the failing method and preserve error codes', () => {
  assert.match(scope.sdkError('getCurExternalChat', {err_msg:'getCurExternalChat:fail no permission', errcode:60011}).message, /getCurExternalChat.*no permission.*60011/);
});
test('SDK diagnostics exclude IDs, URLs and unrelated response fields', () => {
  const error=scope.sdkError('getContext', {errMsg:'fail https://example.com/private abcdefghijklmnopqrstuvwxyz1234', chatId:'private-chat-id', secret:'private-secret'}).message;
  assert.doesNotMatch(error,/example\.com|abcdefghijklmnopqrstuvwxyz|private-chat-id|private-secret/);
});
test('invoke success remains strict and failed responses identify the method', async () => {
  const result=await scope.invoke({invoke:(m,p,cb)=>cb({err_msg:'getContext:ok',entry:'group_chat_tools'})},'getContext');
  assert.equal(result.entry,'group_chat_tools');
  await assert.rejects(scope.invoke({invoke:(m,p,cb)=>cb({err_msg:'getContext:fail'})},'getContext'), /getContext.*fail/);
});
