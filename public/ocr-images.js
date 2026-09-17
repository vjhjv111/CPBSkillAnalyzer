/* Fixed roster layouts; comparison screenshots retain adjustable regions. */
function prepareRosterImages(source) {
  if (Math.abs(source.width/source.height - 591/1280) > 0.025) {
    throw new Error('라인업은 예시와 같은 세로 전체 스크린샷을 올려주세요. 잘린 사진은 자동 분할할 수 없어요.');
  }
  const probe=document.createElement('canvas'); probe.width=591; probe.height=1280;
  const probeContext=probe.getContext('2d',{willReadFrequently:true});
  probeContext.drawImage(source,0,0,591,1280);
  const selected=document.getElementById('rosterLayout').value;
  const type=selected==='auto' ? OCR.detectRosterType(probeContext.getImageData(0,0,591,1280).data,591,1280) : selected;
  if (!type) throw new Error('타자/투수 탭을 구분하지 못했어요. 화면 종류를 타자 또는 투수로 선택해주세요.');
  const rows=OCR.rosterRegions(source.width,source.height,type);
  // A small context image plus one enlarged contact sheet per player. Each
  // sheet contains only that player's identity and three complete skill cells.
  const overview=document.createElement('canvas'); overview.width=462; overview.height=1000;
  overview.getContext('2d').drawImage(source,0,0,462,1000);
  const images=[{label:`${type==='batter'?'타자':'투수'} 전체 화면: 배치 확인 전용. 선수는 상세 이미지에서만 읽으세요.`,mediaType:'image/png',base64:overview.toDataURL('image/png').split(',')[1]}];
  for (const row of rows) {
    const sheet=document.createElement('canvas'); sheet.width=840; sheet.height=460;
    const ctx=sheet.getContext('2d'); ctx.fillStyle='#192027'; ctx.fillRect(0,0,840,460);
    ctx.imageSmoothingEnabled=true; ctx.imageSmoothingQuality='high';
    const draw=(r,x,y,w,h)=>ctx.drawImage(source,r.x,r.y,r.w,r.h,x,y,w,h);
    draw(row.identity,12,8,296,102);
    ctx.fillStyle='#fff'; ctx.font='20px sans-serif';
    ctx.fillText(`ROW ${row.rowIndex} / ${type.toUpperCase()}`,340,45);
    row.skills.forEach((r,i)=>{
      ctx.fillText(`SKILL ${i+1}`,12+i*280,134);
      draw(r,8+i*280,140,264,r.h*1280/source.height*4);
    });
    images.push({rowIndex:row.rowIndex,label:`선수 행 ${row.rowIndex}. 상단: 이름·포지션. 하단 SKILL 1~3: 각각 4배 확대한 스킬 아이콘·레벨·이름. 이것은 한 선수입니다.`,mediaType:'image/png',base64:sheet.toDataURL('image/png').split(',')[1]});
  }
  return images;
}
async function prepareVisionImages(file, mode) {
  const url = URL.createObjectURL(file), source = new Image();
  try {
    source.src = url;
    await source.decode();
    if (mode === 'roster') return prepareRosterImages(source);
    return await new Promise((resolve, reject) => {
      const dialog = document.createElement('dialog');
      dialog.style.cssText = 'width:min(940px,94vw);max-height:94vh;overflow:auto;background:#17202d;color:#fff;border:1px solid #718096;border-radius:12px;padding:18px';
      dialog.innerHTML = `<h3 style="margin-top:0">인식할 영역 확인</h3>
        <p>기존 스킬과 변경 후보를 각각 선택하고 드래그해 이름·레벨이 모두 들어오도록 조정하세요.</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0">
          <label>영역 <select id="cropRegion"><option>기존 스킬</option><option>변경 후보</option></select></label>
        </div>
        <canvas style="display:block;max-width:100%;max-height:58vh;touch-action:none;margin:auto;border:1px solid #718096"></canvas>
        <p id="cropError" role="alert"></p>
        <div style="display:flex;gap:12px;justify-content:flex-end"><button id="cropCancel" type="button">취소</button><button id="cropConfirm" type="button">이 영역으로 분석</button></div>`;
      document.body.append(dialog);
      const canvas = dialog.querySelector('canvas'), ctx = canvas.getContext('2d');
      const scale = Math.min(1, 900 / source.width, 550 / source.height);
      canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
      const boxes = [
        {x:0,y:0,w:source.width/2,h:source.height}, {x:source.width/2,y:0,w:source.width/2,h:source.height}];
      const region = dialog.querySelector('#cropRegion');
      const draw = () => {
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        boxes.forEach((box, index) => {
          ctx.strokeStyle = index === Number(region.selectedIndex) ? '#42f5bf' : '#ffca65'; ctx.lineWidth = 2;
          ctx.strokeRect(box.x*scale, box.y*scale, box.w*scale, box.h*scale);
        });
      };
      const point = event => {
        const rect = canvas.getBoundingClientRect();
        return {x: Math.max(0, Math.min(source.width, (event.clientX-rect.left)/rect.width*source.width)),
          y: Math.max(0, Math.min(source.height, (event.clientY-rect.top)/rect.height*source.height))};
      };
      let start = null;
      canvas.onpointerdown = e => { start = point(e); canvas.setPointerCapture(e.pointerId); };
      canvas.onpointermove = e => {
        if (!start) return;
        const end = point(e);
        boxes[region.selectedIndex] = {x:Math.min(start.x,end.x),y:Math.min(start.y,end.y),w:Math.abs(start.x-end.x),h:Math.abs(start.y-end.y)};
        draw();
      };
      canvas.onpointerup = canvas.onpointercancel = () => { start = null; };
      region.onchange = draw;
      const finish = () => { dialog.close(); dialog.remove(); };
      const cancel = () => { finish(); reject(Object.assign(new Error('분석을 취소했습니다.'), {kind:'cancel'})); };
      dialog.oncancel = e => { e.preventDefault(); cancel(); };
      dialog.querySelector('#cropCancel').onclick = cancel;
      dialog.querySelector('#cropConfirm').onclick = () => {
        try {
          const crops = boxes;
          if (crops.some(b => b.w < 16 || b.h < 16)) throw new Error('글씨가 들어오도록 더 넓게 영역을 선택해주세요.');
          const encode = (box, label, maxSide, maxArea) => {
            const out = document.createElement('canvas');
            const factor = Math.min(2, maxSide/Math.max(box.w,box.h), Math.sqrt(maxArea/(box.w*box.h)));
            out.width = Math.max(1,Math.round(box.w*factor)); out.height = Math.max(1,Math.round(box.h*factor));
            const c = out.getContext('2d'); c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
            c.drawImage(source,box.x,box.y,box.w,box.h,0,0,out.width,out.height);
            return {label,mediaType:'image/png',base64:out.toDataURL('image/png').split(',')[1]};
          };
          const images = [encode({x:0,y:0,w:source.width,h:source.height},'전체 화면: 배치와 포지션 확인용. 상세 이미지와 중복 집계하지 마세요.',1000,650000)];
          crops.forEach((box,i) => images.push(encode(box,i === 0 ? '기존 스킬 영역' : '변경 후보 영역',1500,1050000)));
          if (JSON.stringify(images).length > 28*1024*1024) throw new Error('이미지가 너무 큽니다. 영역이나 선수 수를 줄여주세요.');
          finish(); resolve(images);
        } catch (e) { dialog.querySelector('#cropError').textContent = e.message; }
      };
      dialog.showModal(); draw();
    });
  } finally { URL.revokeObjectURL(url); }
}
