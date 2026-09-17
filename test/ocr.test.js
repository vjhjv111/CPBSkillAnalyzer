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
test('parenthesized variants resolve from role and card context',()=>{
  const data={
    '철완(140149)':[], '철완(134139)':[],
    '오버페이스(선발)':[], '오버페이스(중계)':[], '오버페이스(마무리)':[],
    '도전정신(4성)':[], '도전정신(5성)':[],
    '패기(임팩선발)':[], '패기(골글)':[], '포수리드':[], '포수리드(버프포함)':[]
  };
  assert.equal(OCR.contextualMatch('철완',data,'sp','gg').key,'철완(140149)');
  assert.equal(OCR.contextualMatch('오버페이스',data,'sp','gg').key,'오버페이스(선발)');
  assert.equal(OCR.contextualMatch('오버페이스',data,'rp','gg').key,'오버페이스(중계)');
  assert.equal(OCR.contextualMatch('도전정신',data,'sp','impact').key,'도전정신(4성)');
  assert.equal(OCR.contextualMatch('도전정신',data,'sp','gg').key,'도전정신(5성)');
  assert.equal(OCR.contextualMatch('패기',data,'sp','impact').key,'패기(임팩선발)');
  assert.equal(OCR.contextualMatch('포수리드',data,null,'impact').key,'포수리드');
  assert.equal(OCR.contextualMatch('오버페이쓰',data,'sp','gg').key,null);
});
test('row crops cover the selected table without gaps or duplication', () => {
  const rows=OCR.splitRows({x:120,y:90,w:600,h:630},9);
  assert.deepEqual(rows[0],{x:120,y:90,w:600,h:70});
  assert.equal(rows.at(-1).y+rows.at(-1).h,720);
  for(const n of [0,19,2.5,NaN]) assert.throws(()=>OCR.splitRows({},n));
});
test('fixed roster layouts scale all eleven rows and preserve wrapped names', () => {
  for (const type of ['batter','pitcher']) {
    const original=OCR.rosterRegions(591,1280,type);
    const doubled=OCR.rosterRegions(1182,2560,type);
    assert.equal(original.length,11);
    assert.deepEqual(original.map(r=>r.rowIndex),[1,2,3,4,5,6,7,8,9,10,11]);
    for (let i=0;i<11;i++) {
      assert.equal(original[i].skills.length,3);
      for (const key of ['x','y','w','h']) assert.equal(doubled[i].skills[0][key],original[i].skills[0][key]*2);
      for (const rect of [original[i].identity,...original[i].skills]) {
        assert.ok(rect.x>=0 && rect.y>=0 && rect.x+rect.w<=591 && rect.y+rect.h<=1280);
      }
    }
    assert.ok(original[8].skills[2].y+original[8].skills[2].h>=964);
  }
  assert.equal(OCR.rosterRegions(591,1280,'batter')[0].skills[0].x-OCR.rosterRegions(591,1280,'pitcher')[0].skills[0].x,21);
});
test('cyan selected-tab underline detects the layout, and rejects ambiguous tabs', () => {
  const pixels=new Uint8ClampedArray(591*1280*4);
  const paint=(left,right)=>{for(let y=250;y<254;y++)for(let x=left;x<right;x++){const i=(y*591+x)*4;pixels[i]=0;pixels[i+1]=175;pixels[i+2]=230;pixels[i+3]=255;}};
  assert.equal(OCR.detectRosterType(pixels,591,1280),null);
  paint(12,121);assert.equal(OCR.detectRosterType(pixels,591,1280),'batter');
  paint(128,236);assert.equal(OCR.detectRosterType(pixels,591,1280),null);
  pixels.fill(0);paint(128,236);assert.equal(OCR.detectRosterType(pixels,591,1280),'pitcher');
});
