/* User-confirmed regions avoid assuming a particular phone aspect ratio. */
async function prepareVisionImages(file, mode) {
  const url = URL.createObjectURL(file), source = new Image();
  try {
    source.src = url;
    await source.decode();
    return await new Promise((resolve, reject) => {
      const dialog = document.createElement('dialog');
      dialog.style.cssText = 'width:min(940px,94vw);max-height:94vh;overflow:auto;background:#17202d;color:#fff;border:1px solid #718096;border-radius:12px;padding:18px';
      dialog.innerHTML = `<h3 style="margin-top:0">인식할 영역 확인</h3>
        <p>${mode === 'roster' ? '선수 이름·포지션·스킬이 있는 표 본문을 드래그하세요. 머리글은 제외하고, 행 수를 맞춰 분할선이 선수 사이에 오도록 조정하세요.' : '기존 스킬과 변경 후보를 각각 선택하고 드래그해 이름·레벨이 모두 들어오도록 조정하세요.'}</p>
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin:12px 0">
          <label>영역 <select id="cropRegion">${mode === 'roster' ? '<option>선수 목록</option>' : '<option>기존 스킬</option><option>변경 후보</option>'}</select></label>
          ${mode === 'roster' ? '<label>선수 행 수 <input id="cropRows" type="number" min="1" max="18" value="1" style="width:65px"></label>' : ''}
        </div>
        <canvas style="display:block;max-width:100%;max-height:58vh;touch-action:none;margin:auto;border:1px solid #718096"></canvas>
        <p id="cropError" role="alert"></p>
        <div style="display:flex;gap:12px;justify-content:flex-end"><button id="cropCancel" type="button">취소</button><button id="cropConfirm" type="button">이 영역으로 분석</button></div>`;
      document.body.append(dialog);
      const canvas = dialog.querySelector('canvas'), ctx = canvas.getContext('2d');
      const scale = Math.min(1, 900 / source.width, 550 / source.height);
      canvas.width = Math.round(source.width * scale); canvas.height = Math.round(source.height * scale);
      const boxes = mode === 'roster' ? [{x:0,y:0,w:source.width,h:source.height}] : [
        {x:0,y:0,w:source.width/2,h:source.height}, {x:source.width/2,y:0,w:source.width/2,h:source.height}];
      const region = dialog.querySelector('#cropRegion'), rows = dialog.querySelector('#cropRows');
      const count = () => rows ? Number(rows.value) : 1;
      const draw = () => {
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        boxes.forEach((box, index) => {
          ctx.strokeStyle = index === Number(region.selectedIndex) ? '#42f5bf' : '#ffca65'; ctx.lineWidth = 2;
          ctx.strokeRect(box.x*scale, box.y*scale, box.w*scale, box.h*scale);
          if (mode === 'roster' && Number.isInteger(count()) && count() >= 1 && count() <= 18) {
            OCR.splitRows(box, count()).slice(1).forEach(row => {
              ctx.beginPath(); ctx.moveTo(row.x*scale, row.y*scale); ctx.lineTo((row.x+row.w)*scale,row.y*scale);ctx.stroke();
            });
          }
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
      region.onchange = draw; if (rows) rows.oninput = draw;
      const finish = () => { dialog.close(); dialog.remove(); };
      const cancel = () => { finish(); reject(Object.assign(new Error('분석을 취소했습니다.'), {kind:'cancel'})); };
      dialog.oncancel = e => { e.preventDefault(); cancel(); };
      dialog.querySelector('#cropCancel').onclick = cancel;
      dialog.querySelector('#cropConfirm').onclick = () => {
        try {
          const crops = mode === 'roster' ? OCR.splitRows(boxes[0], count()) : boxes;
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
          crops.forEach((box,i) => images.push(encode(box,mode === 'roster' ? `선수 행 ${i+1}: 이 행을 정확히 한 번 읽으세요.` : (i === 0 ? '기존 스킬 영역' : '변경 후보 영역'),1500,1050000)));
          if (JSON.stringify(images).length > 28*1024*1024) throw new Error('이미지가 너무 큽니다. 영역이나 선수 수를 줄여주세요.');
          finish(); resolve(images);
        } catch (e) { dialog.querySelector('#cropError').textContent = e.message; }
      };
      dialog.showModal(); draw();
    });
  } finally { URL.revokeObjectURL(url); }
}
