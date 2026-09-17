const {test} = require('node:test');
const assert = require('node:assert/strict');
const OCR = require('../public/ocr-core');

test('unknown and invalid levels stay unknown; actual levels 1–4 are retained', () => {
  for (const v of [null, undefined, '', '6abc', 0, 11, 1.5, {}, true]) assert.equal(OCR.readLevel(v), null);
  for (let n=1; n<=10; n++) assert.equal(OCR.readLevel(String(n)),n);
});
test('exact names resolve, but typos and condition variants need confirmation', () => {
  const data = {'홈어드밴티지':[], '선봉장(주루142+)':[], '선봉장(주루130)':[], '포수리드':[], '포수리드(버프포함)':[]};
  assert.equal(OCR.match('홈 어드밴티지',data).key,'홈어드밴티지');
  assert.equal(OCR.match('홈어드벤티지',data).key,null);
  assert.deepEqual(OCR.match('홈어드벤티지',data).candidates,['홈어드밴티지']);
  assert.equal(OCR.match('선봉장',data).candidates.length,2);
  assert.equal(OCR.match('포수리드',data).key,null);
  assert.equal(OCR.match('선봉장(주루142+)',data).key,'선봉장(주루142+)');
  assert.deepEqual(OCR.match('',data).candidates,[]);
  assert.equal(OCR.match('홈어드밴티지'.normalize('NFD'),data).key,'홈어드밴티지');
});
test('row crops cover the selected table without gaps or duplication', () => {
  const rows=OCR.splitRows({x:120,y:90,w:600,h:630},9);
  assert.deepEqual(rows[0],{x:120,y:90,w:600,h:70});
  assert.equal(rows.at(-1).y+rows.at(-1).h,720);
  for(const n of [0,19,2.5,NaN]) assert.throws(()=>OCR.splitRows({},n));
});
test('proxy forwards selected model, crops and token limit; rejects unsupported inputs', async t => {
  process.env.ANTHROPIC_API_KEY='test-only-not-a-real-key';
  const app=require('../server');
  const realFetch=global.fetch;
  let payload;
  global.fetch=async (_url, options) => {payload=JSON.parse(options.body);return {status:200,json:async()=>({model:payload.model,content:[]})};};
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{global.fetch=realFetch;server.close();});
  const post=body=>realFetch(`http://127.0.0.1:${server.address().port}/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  const body={model:'claude-sonnet-5',prompt:'Read',maxTokens:8000,images:[{label:'row 1',mediaType:'image/png',base64:'YWJj'},{label:'row 2',mediaType:'image/png',base64:'YWJj'}]};
  assert.equal((await post(body)).status,200);
  assert.equal(payload.model,'claude-sonnet-5');
  assert.equal(payload.max_tokens,8000);
  assert.equal(payload.messages[0].content.filter(x=>x.type==='image').length,2);
  assert.equal((await post({...body,model:'claude-haiku-4-5-20251001'})).status,200);
  assert.equal(payload.model,'claude-haiku-4-5-20251001');
  assert.equal((await post({...body,model:'arbitrary'})).status,400);
  assert.equal((await post({...body,images:[]})).status,400);
  assert.equal((await post({...body,images:[null]})).status,400);
  assert.equal((await post({...body,images:Array(20).fill(body.images[0])})).status,400);
});
