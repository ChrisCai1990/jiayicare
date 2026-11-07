const test=require('node:test'),assert=require('node:assert/strict');
const {renderDraft,dimensions}=require('../src/utils/phaseFourDimensionDraft');
test('固定4+5+2+2维度并保持四卡片解析兼容',()=>{
 const content=renderDraft(dimensions.map(labels=>labels.map(()=> '本期暂无记录')));
 assert.equal(content.split('\n\n').length,4);
 assert.equal(content.split('\n').filter(s=>s.startsWith('- ')).length,13);
 assert.match(content,/三、问题分析\n- 生活方式行为改变/);
 assert.match(content,/四、下一步规划\n- 生活方式行为改变/);
 assert.equal((content.match(/就医或检查完成及时性/g)||[]).length,2);
});
test('不完整或空内容不得保存成成功草稿',()=>{
 assert.throws(()=>renderDraft([[],[],[],[]]));
 assert.throws(()=>renderDraft(dimensions.map(labels=>labels.map(()=>''))));
});
