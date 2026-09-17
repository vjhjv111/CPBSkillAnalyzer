/* Shared, deterministic OCR validation. Also loaded by node:test. */
(function(root) {
  const normalize = value => String(value ?? '').normalize('NFC').replace(/\s+/g, '');
  const baseName = value => normalize(value).replace(/\([^)]*\)$/, '');
  function readLevel(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (!/^\d{1,2}$/.test(String(value).trim())) return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
  }
  function distance(a, b) {
    const row = Array.from({length: b.length + 1}, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0]; row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const old = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = old;
      }
    }
    return row[b.length];
  }
  function match(raw, dataset) {
    const name = normalize(raw), keys = Object.keys(dataset);
    if (!name) return {key: null, fuzzy: false, candidates: []};
    // A bare name may have both an untagged value and conditional variants.
    const exact = keys.filter(k => baseName(k) === name || normalize(k) === name);
    if (exact.length === 1) return {key: exact[0], fuzzy: false, candidates: exact};
    if (exact.length > 1) return {key: null, fuzzy: false, candidates: exact};
    const limit = name.length >= 4 ? Math.floor(name.length * 0.25) : 0;
    const candidates = keys.map(key => ({key, d: distance(name, baseName(key))}))
      .filter(x => x.d <= limit).sort((a, b) => a.d - b.d).map(x => x.key);
    return {key: null, fuzzy: candidates.length > 0, candidates};
  }
  function contextualMatch(raw, dataset, role, cardType) {
    const name=normalize(raw), keys=Object.keys(dataset);
    if (!name) return {key:null,fuzzy:false,candidates:[],inferred:false};
    const literal=keys.find(key=>normalize(key)===name);
    if (literal) return {key:literal,fuzzy:false,candidates:[literal],inferred:false};
    const variants=keys.filter(key=>baseName(key)===name);
    if (variants.length) {
      const expectedStar=cardType==='impact'?'4':'5';
      const score=key=>{
        const taggedRole=/선발/.test(key)?'sp':(/불펜|마무리|셋업|중계|추격조|롱릴리프|필승조|승리조/.test(key)?'rp':null);
        const taggedCard=/골글/.test(key)?'gg':(/시그/.test(key)?'sig':(/임팩/.test(key)?'impact':(/국대/.test(key)?'nt':null)));
        const taggedStar=/4성/.test(key)?'4':(/5성/.test(key)?'5':null);
        let value=0;
        value+=taggedRole?(taggedRole===role?20:-20):1;
        value+=taggedCard?(taggedCard===cardType?20:-20):1;
        value+=taggedStar?(taggedStar===expectedStar?20:-20):1;
        return value;
      };
      const best=[...variants].sort((a,b)=>score(b)-score(a))[0];
      return {key:best,fuzzy:false,candidates:variants,inferred:variants.length>1};
    }
    return {...match(name,dataset),inferred:false};
  }
  function splitRows(box, count) {
    if (!Number.isInteger(count) || count < 1 || count > 18) throw new Error('행 수는 1~18이어야 합니다.');
    return Array.from({length: count}, (_, i) => ({x: box.x, y: box.y + box.h * i / count, w: box.w, h: box.h / count}));
  }
  // Coordinates measured from the two 591 x 1280 '한 눈에 보기' layouts.
  // All source rectangles scale with the uploaded image, never the CSS preview.
  function rosterRegions(width, height, type) {
    if (!['batter','pitcher'].includes(type)) throw new Error('타자/투수 화면 종류를 선택해주세요.');
    const edges = [324,394,465,535,606,676,747,817,888,958,1029,1099];
    const centers = type === 'batter' ? [291,357,423] : [270,336,402];
    const rect = (x,y,w,h) => ({x:x*width/591,y:y*height/1280,w:w*width/591,h:h*height/1280});
    return edges.slice(0,-1).map((y,i) => ({
      rowIndex:i+1,
      identity:rect(96,y+8,148,51),
      name:rect(96,y+8,148,28),
      position:rect(96,y+36,42,25),
      // Eight extra pixels retain wrapped skill names such as 베스트 포지션.
      skills:centers.map(x => rect(x-33,y+1,66,edges[i+1]-y+8)),
    }));
  }
  function detectRosterType(pixels, width, height) {
    function cyanCount(left,right) {
      let count=0;
      for (let y=Math.floor(248*height/1280);y<Math.ceil(256*height/1280);y++) {
        for (let x=Math.floor(left*width/591);x<Math.ceil(right*width/591);x++) {
          const i=(y*width+x)*4, r=pixels[i],g=pixels[i+1],b=pixels[i+2];
          if (g>100 && b>120 && g-r>45 && b-r>60) count++;
        }
      }
      return count;
    }
    const batter=cyanCount(12,121), pitcher=cyanCount(128,236);
    const minimum=20*width/591*height/1280;
    if (Math.max(batter,pitcher)<minimum || Math.max(batter,pitcher)<Math.min(batter,pitcher)*1.8) return null;
    return batter>pitcher ? 'batter' : 'pitcher';
  }
  const api = {normalize, baseName, readLevel, distance, match, contextualMatch, splitRows, rosterRegions, detectRosterType};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OCR = api;
})(globalThis);
