const test=require('node:test'),assert=require('node:assert/strict');
const {fileReferences}=require('../src/utils/accountDeletionInventory');
const storage={ossOrigins:['https://owned.example'],uploadOrigins:['https://app.example']};
test('inventory sees nested historical files and deduplicates signed URLs without storing their tokens',()=>{
 const result=fileReferences({fileUrl:'https://owned.example/reports/a.pdf?token=secret',ossKeys:['reports/a.pdf'],snapshot:{imageUrls:['https://app.example/api/uploads/p.png']},note:'https://owned.example/reports/b.pdf'},storage);
 assert.deepEqual(result.map(f=>f.storage+':'+f.key).sort(),['local:p.png','oss:reports/a.pdf','oss:reports/b.pdf']);
 assert.equal(JSON.stringify(result).includes('secret'),false);
});
test('inline content is erased with document; external source is not treated as an owned object',()=>{
 const result=fileReferences({imageUrl:'data:image/png;base64,example',avatar:'https://wechat.example/avatar/x',references:[{url:'https://medical.example/guideline'}]},storage);
 assert.equal(result.length,1);assert.equal(result[0].storage,'external-reference');
 assert.equal(result[0].origin,'https://wechat.example');
});
test('ambiguous file locator blocks automatic execution rather than disappearing',()=>{
 assert.equal(fileReferences({fileUrl:'unknown-file-reference'},storage)[0].storage,'unclassified');
});
test('traversal and encoded storage separators are rejected',()=>{
 for(const value of ['https://owned.example/reports/../a.pdf','https://owned.example/reports/%2e%2e/a.pdf','https://owned.example/reports%2fa.pdf']) assert.throws(()=>fileReferences({fileUrl:value},storage),/INVALID_STORAGE_REFERENCE/);
 assert.throws(()=>fileReferences({ossKey:'../customer.pdf'},storage),/INVALID_STORAGE_REFERENCE/);
});
test('isolated local adapter keys and signed review URLs resolve to one owned file',()=>{
 const review={...storage,objectKeyStorage:'local',localReferencePrefixes:['/api/review-files/','/review-api/review-files/']};
 const refs=fileReferences({ossKey:'reports/a.pdf',fileUrls:['/api/review-files/reports%2Fa.pdf?token=secret','https://app.example/review-api/review-files/reports%2Fa.pdf?token=secret']},review);
 assert.deepEqual(refs,[{storage:'local',key:'reports/a.pdf'}]);
 assert.equal(fileReferences({ossKey:'reports/a.pdf'},storage)[0].storage,'oss');
 for(const fileUrl of ['/api/review-files/%2e%2e%2Fx','/api/review-files/reports%252Fx','https://app.example/review-api/review-files/reports/../x']) assert.throws(()=>fileReferences({fileUrl},review),/INVALID_STORAGE_REFERENCE/);
 assert.equal(fileReferences({fileUrl:'https://other.example/api/review-files/reports/a.pdf'},review)[0].storage,'external-reference');
});
