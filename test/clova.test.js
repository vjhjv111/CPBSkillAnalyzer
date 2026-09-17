const {test}=require('node:test');const assert=require('node:assert/strict');
const Parser=require('../public/clova-parser');const OCR=require('../public/ocr-core');
const field=(text,x,y,w=40,h=20,confidence=.99)=>({inferText:text,inferConfidence:confidence,boundingPoly:{vertices:[{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}]}});
test('roster coordinates separate identity, multiline names and numeric badges',()=>{
 const raw=[field("허인서'26",10,10,190,30),field('C',10,75),field('홈',310,340),field('어드밴티지',290,385,180),field('7',205,280),field('6',485,280),field('100',60,200),field('정밀타격',15,370,150),field('5',765,280,30,20,.4)];
 const p=Parser.roster(raw,[{rowIndex:9,offset:0}])[0];
 assert.equal(p.name,"허인서'26");assert.equal(p.position,'C');
 assert.equal(p.skills[0].level,7);assert.equal(p.skills[1].name,'홈어드밴티지');assert.equal(p.skills[1].level,6);assert.equal(p.skills[2].level,null);
 assert.equal(p.skills[2].uncertain,true);
 const second=Parser.roster([field('집중력',10,460+360,140)], [{rowIndex:1,offset:0},{rowIndex:2,offset:460}]);
 assert.equal(second[0].skills[0].name,'');assert.equal(second[1].skills[0].name,'집중력');
});
test('whole roster screenshot maps OCR coordinates into eleven fixed rows',()=>{
 const rows=OCR.rosterRegions(591,1280,'batter'), y=324;
 const raw=[field("로사리오'17",100,y+10,110,20),field('1B',100,y+40,25,18),
   field('5툴플레이어',260,y+51,72,18),field('8',307,y+22,16,18),
   field('홈',329,y+50,20,15),field('어드밴티지',320,y+66,75,15),field('6',374,y+23,16,18),
   field('우완킬러',402,y+52,55,18),field('6',438,y+23,16,18)];
 const players=Parser.rosterOriginal(raw,rows,'batter');
 assert.equal(players.length,11);assert.equal(players[0].name,"로사리오'17");assert.equal(players[0].position,'1B');
 assert.deepEqual(players[0].skills.map(s=>[s.name,s.level]),[['5툴플레이어',8],['홈어드밴티지',6],['우완킬러',6]]);
 assert.deepEqual(players[1].skills.map(s=>s.name),['','','']);
});
test('ambiguous badges and comparison misses remain unconfirmed',()=>{
 assert.equal(Parser.levelIn(Parser.fields([field('6',5,5),field('7',10,10)]),{x:0,y:0,w:100,h:100}),null);
 const result=Parser.comparison([field('집중력',100,200,100),field('7',160,150)],['집중력']);
 assert.equal(result[0].name,'집중력');assert.equal(result[0].level,7);assert.equal(result[1].level,null);
 assert.deepEqual(Parser.fields([{inferText:'bad'}]),[]);
});
test('nearby badge recovery accepts a low-confidence first-slot digit and ignores label numbers',()=>{
 const cell={x:258,y:325,w:66,h:78};
 const all=Parser.fields([field('8',309,347,15,18,.66),field('5',261,373,12,17,.99),field('6',375,347,15,18,.99)]);
 assert.equal(Parser.levelNear(all,cell),8);
});
test('CLOVA proxy uses V2 Korean single image and protects credentials on errors',async t=>{
 process.env.CLOVA_OCR_INVOKE_URL='https://example.test/general';process.env.CLOVA_OCR_SECRET='test-only-secret';
 const app=require('../server'),realFetch=global.fetch;let payload,headers,status=200,inferResult='SUCCESS';
 global.fetch=async(url,options)=>{assert.equal(String(url),'https://example.test/general');payload=JSON.parse(options.body);headers=options.headers;return {ok:status===200,status,json:async()=>({images:[{inferResult,fields:[]}]})};};
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(()=>{global.fetch=realFetch;server.close();delete process.env.CLOVA_OCR_INVOKE_URL;delete process.env.CLOVA_OCR_SECRET;});
 const post=body=>realFetch(`http://127.0.0.1:${server.address().port}/analyze`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 const body={mediaType:'image/png',base64:'YWJj'};
 assert.equal((await post(body)).status,200);assert.equal(payload.version,'V2');assert.equal(payload.lang,'ko');assert.equal(payload.images.length,1);assert.equal(payload.images[0].data,'YWJj');assert.equal(headers['X-OCR-SECRET'],'test-only-secret');assert.ok(Number.isFinite(payload.timestamp));
 assert.equal((await post({...body,mediaType:'image/webp'})).status,400);
 status=403;let response=await post(body);assert.equal(response.status,502);assert.ok(!(await response.text()).includes('test-only-secret'));
 status=429;assert.equal((await post(body)).status,429);
 status=200;inferResult='FAILURE';assert.equal((await post(body)).status,502);
 delete process.env.CLOVA_OCR_SECRET;assert.equal((await post(body)).status,503);
});
