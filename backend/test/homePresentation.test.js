const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{transformSync}=require('esbuild');
const read=file=>fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');
for(const file of ['miniprogram/src/pages/home/index.jsx','app/src/screens/home/HomeScreen.js'])test(file+' keeps original task actions and two membership shortcuts',()=>{
 const source=read(file);assert.doesNotThrow(()=>transformSync(source,{loader:'jsx'}));
 assert.match(source,/我的会员权益/);assert.match(source,/查看计划与使用情况/);assert.match(source,/查看余额与收支明细/);
 assert.match(source,/一起照顾好今天的你/);assert.match(source,/记录健康数据/);
 assert.doesNotMatch(source,/\{runtimeInfo\}/);
 assert.match(source,/setTaskDetail/);assert.match(source,/careFlowId/);
 assert.match(source,/allPendingTaskItems\.slice\(0, 3\)/);
});
test('fund shortcut opens existing benefits fund section on both clients',()=>{
 assert.match(read('miniprogram/src/pages/home/index.jsx'),/benefits\/index\?section=/);
 assert.match(read('miniprogram/src/pages/profile/benefits/index.jsx'),/params\?\.section === 'fund'/);
 assert.match(read('app/src/screens/home/HomeScreen.js'),/navigate\('Benefits',\{section\}\)/);
 assert.match(read('app/src/screens/profile/BenefitsScreen.js'),/route\?\.params\?\.section === 'fund'/);
});
