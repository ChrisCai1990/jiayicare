const { MongoClient } = require('mongodb');

const SRC_URI = 'mongodb://mongo:JdpeVcLfUCPbXjOVzdZEPvLihTYBhtjK@autorack.proxy.rlwy.net:40817';
const DST_URI = 'mongodb://127.0.0.1:27017';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const src = new MongoClient(SRC_URI, {
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 120000,
  });
  const dst = new MongoClient(DST_URI, { serverSelectionTimeoutMS: 10000 });

  console.log('connecting...');
  await src.connect();
  await dst.connect();
  console.log('connected');

  const srcCol = src.db('test').collection('medicalreports');
  const dstCol = dst.db('jiayicare').collection('medicalreports');

  const total = await srcCol.countDocuments();
  console.log('Railway medicalreports total:', total);

  await dstCol.deleteMany({});

  const cursor = srcCol.find({});
  let success = 0, fail = 0, idx = 0;

  while (await cursor.hasNext()) {
    idx++;
    let doc;
    try {
      doc = await cursor.next();
    } catch (e) {
      console.log('read failed, skip:', e.message);
      fail++;
      continue;
    }

    let inserted = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await dstCol.insertOne(doc);
        inserted = true;
        break;
      } catch (e) {
        if (attempt < 3) {
          console.log('doc ' + idx + ' write fail, retry ' + attempt + '/3: ' + e.message);
          await sleep(2000);
        }
      }
    }

    if (inserted) {
      success++;
      if (success % 5 === 0 || success === 1) {
        console.log('OK ' + success + '/' + total);
      }
    } else {
      console.log('FAIL doc ' + idx + ', skip');
      fail++;
    }
  }

  console.log('done: success=' + success + ' fail=' + fail);
  await src.close();
  await dst.close();
}

main().catch(e => { console.error('fatal:', e.message); process.exit(1); });
