const express = require('express');
const { randomUUID } = require('node:crypto');
const app = express();
app.use(express.json({limit:'30mb'}));
app.use((req,res,next)=>{
  res.setHeader('Access-Control-Allow-Origin',process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','content-type');
  if(req.method==='OPTIONS') return res.sendStatus(204);
  next();
});
app.get('/health',(_req,res)=>res.json({service:'skill-analyzer',provider:'clova',configured:!!(process.env.CLOVA_OCR_INVOKE_URL && process.env.CLOVA_OCR_SECRET)}));
app.use(express.static('public'));
app.post('/analyze',async(req,res)=>{
  const endpoint=process.env.CLOVA_OCR_INVOKE_URL, secret=process.env.CLOVA_OCR_SECRET;
  if(!endpoint || !secret) return res.status(503).json({error:{message:'서버에 CLOVA_OCR_INVOKE_URL과 CLOVA_OCR_SECRET을 설정해주세요.'}});
  const {base64,mediaType}=req.body || {};
  if(!['image/png','image/jpeg'].includes(mediaType) || typeof base64!=='string' || !base64.length || base64.length>28*1024*1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return res.status(400).json({error:{message:'PNG/JPEG 이미지 데이터를 확인해주세요.'}});
  try{
    const url=new URL(endpoint);
    if(url.protocol!=='https:') throw new Error('invalid endpoint');
    const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{'Content-Type':'application/json','X-OCR-SECRET':secret},body:JSON.stringify({version:'V2',requestId:randomUUID(),timestamp:Date.now(),lang:'ko',images:[{format:mediaType==='image/png'?'png':'jpg',name:'screenshot',data:base64}]})});
    if(!response.ok) return res.status(response.status===429?429:502).json({error:{message:response.status===401 || response.status===403?'CLOVA 인증에 실패했어요. 서버의 Invoke URL과 Secret Key를 확인해주세요.':`CLOVA OCR 요청 실패 (${response.status}). 잠시 후 다시 시도해주세요.`}});
    const data=await response.json(), image=data.images?.[0];
    if(image?.inferResult!=='SUCCESS' || !Array.isArray(image.fields)) return res.status(502).json({error:{message:'CLOVA OCR이 이미지를 읽지 못했어요. 다시 시도해주세요.'}});
    res.json({provider:'clova',fields:image.fields});
  }catch(error){
    res.status(502).json({error:{message:error.name==='TimeoutError'?'CLOVA OCR 응답 시간이 초과됐어요. 다시 시도해주세요.':'CLOVA OCR 연결에 실패했어요. 서버 설정을 확인해주세요.'}});
  }
});
if(require.main===module) app.listen(process.env.PORT || 3000,()=>console.log('CLOVA OCR proxy started'));
module.exports=app;
