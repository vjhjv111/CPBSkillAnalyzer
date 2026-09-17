(function(root){
  function fields(raw){
    return (raw || []).flatMap(f=>{
      const v=f.boundingPoly?.vertices;
      if(!Array.isArray(v)||v.length<4||v.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))) return [];
      const x=Math.min(...v.map(p=>p.x)),y=Math.min(...v.map(p=>p.y));
      const w=Math.max(...v.map(p=>p.x))-x,h=Math.max(...v.map(p=>p.y))-y;
      return [{text:String(f.inferText || ''),confidence:Number(f.inferConfidence)||0,x,y,w,h,cx:x+w/2,cy:y+h/2}];
    });
  }
  const inside=(f,r)=>f.cx>=r.x && f.cx<r.x+r.w && f.cy>=r.y && f.cy<r.y+r.h;
  function textIn(all,r){
    const selected=all.filter(f=>inside(f,r));
    // Group by vertical overlap before sorting horizontally, since OCR words
    // in the same line have slightly different y coordinates.
    const lines=[];
    for(const f of selected.sort((a,b)=>a.cy-b.cy)){
      let line=lines.find(l=>Math.abs(l.cy-f.cy)<Math.max(l.h,f.h)*0.55);
      if(!line){line={cy:f.cy,h:f.h,items:[]};lines.push(line);}
      line.items.push(f);
    }
    return {text:lines.sort((a,b)=>a.cy-b.cy).map(l=>l.items.sort((a,b)=>a.x-b.x).map(f=>f.text).join('')).join(''),confidence:selected.length?Math.min(...selected.map(f=>f.confidence)):0};
  }
  function levelIn(all,r){
    const candidates=all.filter(f=>inside(f,r)&&f.confidence>=0.8).map(f=>f.text.trim().replace(/^Lv\.?\s*/i,'')).filter(t=>/^(?:[5-9]|10)$/.test(t));
    return candidates.length===1?Number(candidates[0]):null;
  }
  function levelNear(all,cell){
    const area={x:cell.x+cell.w*.30,y:cell.y+cell.h*.06,w:cell.w*.82,h:cell.h*.56};
    const target={x:cell.x+cell.w*.83,y:cell.y+cell.h*.40};
    const candidates=all.filter(f=>inside(f,area)&&f.confidence>=0.6)
      .map(f=>({...f,value:f.text.trim().replace(/^Lv\.?\s*/i,'')}))
      .filter(f=>/^(?:[5-9]|10)$/.test(f.value))
      .sort((a,b)=>{
        const score=f=>Math.hypot((f.cx-target.x)/cell.w,(f.cy-target.y)/cell.h)+(1-f.confidence)*.5;
        return score(a)-score(b);
      });
    return candidates.length?Number(candidates[0].value):null;
  }
  function roster(raw,rows){
    const all=fields(raw);
    return rows.map(({rowIndex,offset,type})=>{
      const name=textIn(all,{x:0,y:offset,w:310,h:65});
      const pos=textIn(all,{x:0,y:offset+65,w:85,h:50});
      const position=pos.text.toUpperCase();
      return {rowIndex,name:name.text,position:/^(1B|2B|3B|SS|LF|CF|RF|DH|C|SP|RP|CP|P)$/.test(position)?position:(type==='pitcher'?'P':''),skills:[0,1,2].map(i=>{
        const name=textIn(all,{x:i*280,y:offset+330,w:280,h:130});
        return {name:name.text,level:levelIn(all,{x:i*280+170,y:offset+235,w:100,h:95}),uncertain:name.confidence<0.8};
      })};
    });
  }
  function rosterOriginal(raw,rows,type){
    const all=fields(raw);
    return rows.map(row=>{
      const name=textIn(all,row.name), positionText=textIn(all,row.position).text.toUpperCase();
      const position=/^(1B|2B|3B|SS|LF|CF|RF|DH|C|SP|RP|CP|P)$/.test(positionText)?positionText:(type==='pitcher'?'P':'');
      return {rowIndex:row.rowIndex,name:name.text,position,skills:row.skills.map(cell=>{
        const nonNumeric=all.filter(field=>!/^(?:[5-9]|10)$/.test(field.text.trim()));
        const skillName=textIn(nonNumeric,{x:cell.x-6,y:cell.y+cell.h*.42,w:cell.w+12,h:cell.h*.58});
        const level=levelNear(all,cell);
        return {name:skillName.text,level,uncertain:skillName.confidence<0.8};
      })};
    });
  }
  // Comparison regions are user-selected cards. Locate known skill text and
  // pair only an unambiguous nearby badge; never assign levels by array order.
  function comparison(raw,vocab){
    const all=fields(raw), matches=[];
    const normalized=s=>s.replace(/\s+/g,'');
    for(const f of all){
      if(f.confidence<0.8) continue;
      const adjacent=all.filter(g=>g!==f && Math.abs(g.cx-f.cx)<Math.max(g.w,f.w) && g.y>=f.y+f.h*.5 && g.y-f.y<f.h*2.5).sort((a,b)=>a.y-b.y)[0];
      const sameLine=all.filter(g=>g!==f && g.x>=f.x+f.w*.8 && g.x-(f.x+f.w)<f.h*2 && Math.abs(g.cy-f.cy)<f.h*.6).sort((a,b)=>a.x-b.x)[0];
      const options=[f.text,f.text+(adjacent?.text||''),f.text+(sameLine?.text||'')].map(normalized);
      const name=options.find(s=>vocab.includes(s));
      if(!name) continue;
      const badges=all.filter(g=>g.confidence>=0.8 && /^(?:[5-9]|10)$/.test(g.text.trim()) && g.cy<f.cy && f.cy-g.cy<f.h*9 && Math.abs(g.cx-f.cx)<Math.max(f.w, f.h*4));
      matches.push({name,level:badges.length===1?Number(badges[0].text):null,y:f.y,x:f.x});
    }
    matches.sort((a,b)=>a.y-b.y || a.x-b.x);
    return Array.from({length:3},(_,i)=>matches[i]?{name:matches[i].name,level:matches[i].level}:{name:'',level:null});
  }
  const api={fields,textIn,levelIn,levelNear,roster,rosterOriginal,comparison};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;else root.ClovaParser=api;
})(globalThis);
