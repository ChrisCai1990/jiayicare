const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
module.exports = function pageBuild(root) {
  const hash = crypto.createHash('sha256');
  const walk = dir => { for (const entry of fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()) walk(file);
    else if(entry.isFile()) { hash.update(path.relative(root,file).replace(/\\/g,'/'));hash.update(fs.readFileSync(file)); }
  }};
  walk(path.join(root,'src'));walk(path.join(root,'config'));
  for(const name of ['package.json','package-lock.json','pnpm-lock.yaml']) {const f=path.join(root,name);if(fs.existsSync(f))hash.update(fs.readFileSync(f));}
  return 'web-'+hash.digest('hex').slice(0,16);
};
