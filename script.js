(function(){
  const BIG=[5,6,7,8,9],SMALL=[0,1,2,3,4];
  const API='https://draw.ar-lottery01.com/WinGo/WinGo_30S/GetHistoryIssuePage.json';
  const BACKUP='https://api.allorigins.win/raw?url='+encodeURIComponent(API);
  const CIRC=2*Math.PI*27,TCIRC=2*Math.PI*24;

  const WIN_STICKERS=[
    "CAACAgUAAxkBAAEQkVBpl8hMx9iNmWZNMVtLuyCYQtQsPwAC4hgAAkimcFRTsVq4_esRyDoE",
    "CAACAgUAAxkBAAEQkW5pl92txZsdpU9GlEDLtjydlvZDbQACCBkAAtU5mFQ_tKahAfWqGzoE"
  ];
  const LOSS_STICKERS=[
    "CAACAgUAAxkBAAEQkXBpl94FSYLa7nWcqyKjv8XBSZcbkQACshkAAnw-uVTIVk2h2uLUfzoE"
  ];

  let hist=[],lv=1,cL=0,cW=0,last100=[],tgOn=false,botT='',chId='';
  let lastPeriodPredicted='',tgSentPeriods={},lastApiPeriod='';

  let tgQueue=[];
  let tgSending=false;

  async function processTgQueue(){
    if(tgSending||tgQueue.length===0)return;
    tgSending=true;
    while(tgQueue.length>0){
      let task=tgQueue.shift();
      try{
        await task();
      }catch(e){
        console.warn('TG queue error:',e);
      }
      await delay(500);
    }
    tgSending=false;
  }

  function queueTg(taskFn){
    tgQueue.push(taskFn);
    processTgQueue();
  }

  function tgLog(msg,type){
    let el=document.getElementById('tgLog');if(!el)return;
    let cls=type==='ok'?'log-ok':type==='err'?'log-err':'log-info';
    let time=new Date().toLocaleTimeString('en-US',{hour12:false});
    el.innerHTML=`<div class="${cls}">[${time}] ${msg}</div>`+el.innerHTML;
    if(el.children.length>30)el.removeChild(el.lastChild);
  }

  function p3(p){return p?p.slice(-3):'';}
  function bs(n){return n>=5?'Big':'Small';}
  function col(n){if([1,3,7,9].includes(n))return'linear-gradient(135deg,#00f5a0,#00c98d)';if([2,4,6,8].includes(n))return'linear-gradient(135deg,#ff4757,#e63e50)';return'linear-gradient(135deg,#a855f7,#7c3aed)';}
  function delay(ms){return new Promise(r=>setTimeout(r,ms));}

  function getNextPeriod(apiPeriod){
    if(!apiPeriod)return null;
    let numPart=apiPeriod.slice(-4);
    let prefix=apiPeriod.slice(0,-4);
    let next=parseInt(numPart)+1;
    return prefix+String(next).padStart(4,'0');
  }

  function getTimerRemain(){
    const now=new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Kolkata"}));
    const s=now.getSeconds();
    return s<30?(30-s):(60-s);
  }

  function tick(){
    let remain=getTimerRemain();
    let tt=document.getElementById('timerText'),tf=document.getElementById('timerFg');
    tt.innerText=remain;
    tf.setAttribute('stroke-dashoffset',TCIRC*(1-remain/30));
    if(remain<=5){tf.classList.add('urgent');tt.classList.add('urgent');}
    else{tf.classList.remove('urgent');tt.classList.remove('urgent');}
    if(lastApiPeriod){
      let nextP=getNextPeriod(lastApiPeriod);
      document.getElementById('periodDisplay').innerText=nextP||lastApiPeriod;
    }
  }

  async function tgMsg(msg){
    if(!botT||!chId)return false;
    try{
      let r=await fetch(`https://api.telegram.org/bot${botT}/sendMessage`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({chat_id:chId,text:msg,parse_mode:'HTML'})
      });
      let data=await r.json();
      if(data.ok){tgLog('✅ Message sent','ok');return true;}
      tgLog('❌ '+data.description,'err');return false;
    }catch(e){tgLog('❌ '+e.message,'err');return false;}
  }

  async function tgStk(id){
    if(!botT||!chId)return false;
    try{
      let r=await fetch(`https://api.telegram.org/bot${botT}/sendSticker`,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({chat_id:chId,sticker:id})
      });
      let data=await r.json();
      if(data.ok){tgLog('✅ Sticker sent','ok');return true;}
      tgLog('❌ '+data.description,'err');return false;
    }catch(e){tgLog('❌ '+e.message,'err');return false;}
  }

  async function sendWinStk(){
    tgLog('🎉 Sending WIN stickers...','info');
    for(let i=0;i<WIN_STICKERS.length;i++){
      await tgStk(WIN_STICKERS[i]);
      if(i<WIN_STICKERS.length-1) await delay(800);
    }
  }
  async function sendLossStk(){
    tgLog('😢 Sending LOSS sticker...','info');
    await tgStk(LOSS_STICKERS[0]);
  }

  function sendPredTG(period,predSize,predNum){
    if(!tgOn)return;
    let k=period;
    if(!tgSentPeriods[k])tgSentPeriods[k]={p:false,r:false};
    if(tgSentPeriods[k].p)return;
    tgSentPeriods[k].p=true;

    queueTg(async()=>{
      tgLog('📤 Sending pred '+p3(period)+'...','info');
      let msg=`📈 <b>TRADE PRO AI</b>\n\n📌 <b>${p3(period)}</b>\n🎯 <b>${predSize.toUpperCase()} ${predNum}</b>`;
      let ok=await tgMsg(msg);
      if(!ok) tgSentPeriods[k].p=false;
    });
  }

  function sendResultTG(period,isWin){
    if(!tgOn)return;
    let k=period;
    if(!tgSentPeriods[k])tgSentPeriods[k]={p:false,r:false};
    if(tgSentPeriods[k].r)return;
    if(!tgSentPeriods[k].p){
      tgLog('⚠️ Skipping sticker for '+p3(period)+' - no prediction was sent','info');
      return;
    }
    tgSentPeriods[k].r=true;

    queueTg(async()=>{
      if(isWin) await sendWinStk();
      else await sendLossStk();
    });
  }

  function L1(s){if(!s.length)return{n:'Inverse',v:null,d:'-',a:false};let v=s[s.length-1]==='B'?'S':'B';return{n:'Inverse',v,d:`${s[s.length-1]}→${v}`,a:true};}
  function L2(s){if(s.length<3)return{n:'3Maj',v:null,d:'-',a:false};let b=s.slice(-3).filter(x=>x==='B').length;return{n:'3Maj',v:b>=2?'S':'B',d:`B${b}/3`,a:true};}
  function L3(s){if(s.length<5)return{n:'5Maj',v:null,d:'-',a:false};let b=s.slice(-5).filter(x=>x==='B').length;if(b>=4)return{n:'5Maj',v:'S',d:`B${b}→S`,a:true};if(b<=1)return{n:'5Maj',v:'B',d:`S${5-b}→B`,a:true};return{n:'5Maj',v:b>=3?'S':'B',d:`B${b}`,a:false};}
  function L4(s){if(s.length<2)return{n:'StrkBrk',v:null,d:'-',a:false};let l=s[s.length-1],c=1;for(let i=s.length-2;i>=0;i--){if(s[i]===l)c++;else break;}if(c>=3){let v=l==='B'?'S':'B';return{n:'StrkBrk',v,d:`${c}x${l}→${v}`,a:true};}if(c>=2){let v=l==='B'?'S':'B';return{n:'StrkBrk',v,d:`${c}x${l}`,a:false};}return{n:'StrkBrk',v:null,d:`1x`,a:false};}
  function L5(s){if(s.length<8)return{n:'DblPat',v:null,d:'-',a:false};let a=s[s.length-2],b=s[s.length-1],m={B:0,S:0};for(let i=1;i<s.length-1;i++){if(s[i-1]===a&&s[i]===b&&s[i+1])m[s[i+1]]++;}let t=m.B+m.S;if(t<3)return{n:'DblPat',v:null,d:'low',a:false};let v=m.B>m.S?'B':'S';return{n:'DblPat',v,d:`${a}${b}→${v}(${Math.round(Math.max(m.B,m.S)/t*100)}%)`,a:true};}
  function L6(s){if(s.length<10)return{n:'TriPat',v:null,d:'-',a:false};let a=s[s.length-3],b=s[s.length-2],c=s[s.length-1],m={B:0,S:0};for(let i=2;i<s.length-1;i++){if(s[i-2]===a&&s[i-1]===b&&s[i]===c&&s[i+1])m[s[i+1]]++;}let t=m.B+m.S;if(t<2)return{n:'TriPat',v:null,d:'low',a:false};let v=m.B>=m.S?'B':'S';return{n:'TriPat',v,d:`${a}${b}${c}→${v}`,a:true};}
  function L7(s){if(s.length<10)return{n:'GapFill',v:null,d:'-',a:false};let b=s.slice(-10).filter(x=>x==='B').length;if(b>=7)return{n:'GapFill',v:'S',d:`B${b}/10→S`,a:true};if(b<=3)return{n:'GapFill',v:'B',d:`B${b}/10→B`,a:true};return{n:'GapFill',v:null,d:`B${b}`,a:false};}
  function L8(n){if(n.length<10)return{n:'SumTrnd',v:null,d:'-',a:false};let s1=n.slice(-5).reduce((a,b)=>a+b,0),s2=n.slice(-10,-5).reduce((a,b)=>a+b,0);if(s1>s2+5)return{n:'SumTrnd',v:'S',d:`${s1}>${s2}`,a:true};if(s1<s2-5)return{n:'SumTrnd',v:'B',d:`${s1}<${s2}`,a:true};return{n:'SumTrnd',v:null,d:`${s1}≈${s2}`,a:false};}
  function L9(n){if(!n.length)return{n:'Mirror',v:null,d:'-',a:false};let m=9-n[n.length-1];return{n:'Mirror',v:m>=5?'B':'S',d:`${n[n.length-1]}→${m}`,a:true};}
  function L10(s){if(s.length<8)return{n:'AltRate',v:null,d:'-',a:false};let l=s.slice(-8),a=0;for(let i=1;i<8;i++)if(l[i]!==l[i-1])a++;let r=Math.round(a/7*100);if(r>=70){let v=s[s.length-1]==='B'?'S':'B';return{n:'AltRate',v,d:`${r}%alt→${v}`,a:true};}if(r<=30)return{n:'AltRate',v:s[s.length-1],d:`${r}%stk`,a:true};return{n:'AltRate',v:null,d:`${r}%`,a:false};}
  function L11(s){if(s.length<15)return{n:'HotZone',v:null,d:'-',a:false};let sc=0;for(let i=0;i<Math.min(s.length,20);i++){let w=i<5?3:i<10?2:1;sc+=s[s.length-1-i]==='B'?w:-w;}if(Math.abs(sc)>=8)return{n:'HotZone',v:sc>0?'S':'B',d:`${sc>0?'+':''}${sc}→${sc>0?'S':'B'}`,a:true};return{n:'HotZone',v:null,d:`${sc}`,a:false};}
  function L12(n){if(n.length<2)return{n:'PairDst',v:null,d:'-',a:false};let d=Math.abs(n[n.length-2]-n[n.length-1]);if(d>=5){let v=n[n.length-1]>=5?'S':'B';return{n:'PairDst',v,d:`d=${d}→${v}`,a:true};}return{n:'PairDst',v:null,d:`d=${d}`,a:false};}
  function L13(n){if(n.length<5)return{n:'Gravity',v:null,d:'-',a:false};let avg=n.slice(-5).reduce((a,b)=>a+b,0)/5;if(avg>=6.5)return{n:'Gravity',v:'S',d:`${avg.toFixed(1)}↓`,a:true};if(avg<=2.5)return{n:'Gravity',v:'B',d:`${avg.toFixed(1)}↑`,a:true};return{n:'Gravity',v:null,d:`${avg.toFixed(1)}`,a:false};}
  function L14(s){if(s.length<12)return{n:'Entropy',v:null,d:'-',a:false};let l=s.slice(-12),ch=0;for(let i=1;i<12;i++)if(l[i]!==l[i-1])ch++;let e=ch/11;if(e<=0.25)return{n:'Entropy',v:s[s.length-1],d:`${(e*100).toFixed(0)}%stk`,a:true};if(e>=0.75){let v=s[s.length-1]==='B'?'S':'B';return{n:'Entropy',v,d:`${(e*100).toFixed(0)}%alt`,a:true};}return{n:'Entropy',v:null,d:`${(e*100).toFixed(0)}%`,a:false};}
  function L15(n){if(n.length<8)return{n:'FibPos',v:null,d:'-',a:false};let fibs=[1,2,3,5,8];let bHit=0,sHit=0;fibs.forEach(f=>{if(f<=n.length){let v=n[n.length-f];if(v>=5)bHit++;else sHit++;}});if(Math.abs(bHit-sHit)>=3){let v=bHit>sHit?'S':'B';return{n:'FibPos',v,d:`B${bHit}S${sHit}→${v}`,a:true};}return{n:'FibPos',v:null,d:`B${bHit}S${sHit}`,a:false};}
  function L16(n){if(n.length<10)return{n:'EMA',v:null,d:'-',a:false};let ema3=0,ema7=0,a3=2/4,a7=2/8;n.slice(-10).forEach((v,i)=>{if(i===0){ema3=v;ema7=v;}else{ema3=v*a3+ema3*(1-a3);ema7=v*a7+ema7*(1-a7);}});let diff=ema3-ema7;if(Math.abs(diff)>=1.5){let v=diff>0?'S':'B';return{n:'EMA',v,d:`${ema3.toFixed(1)}/${ema7.toFixed(1)}→${v}`,a:true};}return{n:'EMA',v:null,d:`${diff.toFixed(1)}`,a:false};}
  function L17(n){if(n.length<10)return{n:'RSI',v:null,d:'-',a:false};let gains=0,losses=0;for(let i=n.length-9;i<n.length;i++){let d=n[i]-n[i-1];if(d>0)gains+=d;else losses+=Math.abs(d);}let rs=losses===0?100:gains/losses;let rsi=100-100/(1+rs);if(rsi>=70)return{n:'RSI',v:'S',d:`RSI${rsi.toFixed(0)}→S`,a:true};if(rsi<=30)return{n:'RSI',v:'B',d:`RSI${rsi.toFixed(0)}→B`,a:true};return{n:'RSI',v:null,d:`RSI${rsi.toFixed(0)}`,a:false};}
  function L18(n){if(n.length<10)return{n:'VolSqz',v:null,d:'-',a:false};let l=n.slice(-10),avg=l.reduce((a,b)=>a+b,0)/10;let variance=l.reduce((a,b)=>a+(b-avg)**2,0)/10;let std=Math.sqrt(variance);if(std<=1.2){let v=avg>=4.5?'S':'B';return{n:'VolSqz',v,d:`σ=${std.toFixed(1)}→${v}`,a:true};}return{n:'VolSqz',v:null,d:`σ=${std.toFixed(1)}`,a:false};}
  function L19(n){if(n.length<10)return{n:'EvenOdd',v:null,d:'-',a:false};let ev=n.slice(-10).filter(x=>x%2===0).length;if(ev>=8)return{n:'EvenOdd',v:'B',d:`E${ev}→odd→B`,a:true};if(ev<=2)return{n:'EvenOdd',v:'S',d:`E${ev}→even→S`,a:true};return{n:'EvenOdd',v:null,d:`E${ev}`,a:false};}
  function L20(s){if(s.length<12)return{n:'QuadPat',v:null,d:'-',a:false};let a=s[s.length-4],b=s[s.length-3],c=s[s.length-2],d=s[s.length-1],m={B:0,S:0};for(let i=3;i<s.length-1;i++){if(s[i-3]===a&&s[i-2]===b&&s[i-1]===c&&s[i]===d&&s[i+1])m[s[i+1]]++;}let t=m.B+m.S;if(t<2)return{n:'QuadPat',v:null,d:'low',a:false};let v=m.B>=m.S?'B':'S';return{n:'QuadPat',v,d:`${a}${b}${c}${d}→${v}(${t})`,a:true};}

  function engine(nums,seq){
    let logics=[L1(seq),L2(seq),L3(seq),L4(seq),L5(seq),L6(seq),L7(seq),L8(nums),L9(nums),L10(seq),L11(seq),L12(nums),L13(nums),L14(seq),L15(nums),L16(nums),L17(nums),L18(nums),L19(nums),L20(seq)];
    let bV=0,sV=0;
    logics.forEach(l=>{if(!l.v)return;let w=l.a?4:1;if(l.v==='B')bV+=w;else sV+=w;});
    let pred=bV>=sV?'B':'S';
    let ac=logics.filter(l=>l.a&&l.v).length;
    let margin=Math.abs(bV-sV),total=bV+sV||1;
    let conf=Math.round(55+margin/total*35+ac*1);
    conf=Math.max(60,Math.min(97,conf));
    let nf=Array(10).fill(0);nums.slice(-30).forEach(n=>nf[n]++);
    return{pred,conf,logics,ac,bV,sV,nf};
  }

  async function fetchData(){
    try{
      let r;
      try{r=await fetch(API+'?t='+Date.now());if(!r.ok)throw 0;}
      catch(e){r=await fetch(BACKUP);}
      let d=await r.json(),list=d?.data?.list||[];
      if(!list.length)return;

      last100=list.slice(0,100).map(i=>({
        period:String(i.issueNumber||i.period||''),
        number:parseInt(i.number!=null?i.number:i.num)
      })).filter(i=>!isNaN(i.number)&&i.period);
      if(!last100.length)return;

      lastApiPeriod=last100[0].period;
      let nextPeriod=getNextPeriod(lastApiPeriod);
      if(!nextPeriod)return;

      document.getElementById('periodDisplay').innerText=nextPeriod;

      let nums=last100.map(i=>i.number),seq=nums.map(n=>n>=5?'B':'S');
      if(seq.length<10)return;

      let res=engine(nums,seq);
      let predSize=res.pred==='B'?'Big':'Small';
      let target=res.pred==='B'?BIG:SMALL;

      let lastPN=hist.slice(0,3).map(p=>p.pNum).filter(n=>!isNaN(n));
      let avail=target.filter(n=>!lastPN.includes(n));
      if(!avail.length)avail=[...target];
      let weights=avail.map(n=>({n,w:(res.nf[n]||0)+1}));
      weights.sort((a,b)=>b.w-a.w);
      let predNum=weights[0].n;

      updateHero(predSize,predNum,res.conf);
      updateServer(res);
      updateHeat(res.nf);

      for(let ph of hist){
        if(ph.status!=='Pending')continue;
        let match=last100.find(h=>h.period===ph.period);
        if(match){
          ph.actual=bs(match.number);
          ph.aNum=match.number;
          let win=(ph.pSize===ph.actual);
          ph.status=win?'Win':'Loss';
          console.log('[RES]',ph.period,win?'WIN':'LOSS');
          if(win){cL=0;cW++;lv=1;}
          else{cW=0;cL++;lv=Math.min(cL+1,7);}
          if(tgOn) sendResultTG(ph.period,win);
        }
      }

      if(nextPeriod!==lastPeriodPredicted){
        lastPeriodPredicted=nextPeriod;
        hist.unshift({
          period:nextPeriod,pSize:predSize,pNum:predNum,
          actual:'--',aNum:'--',status:'Pending',level:lv
        });
        console.log('[PRED]',nextPeriod,predSize,predNum,'TG:',tgOn);
        if(tgOn) sendPredTG(nextPeriod,predSize,predNum);
      }

      renderAll();
    }catch(e){console.warn('Fetch:',e);}
  }

  function updateHero(size,num,conf){
    let se=document.getElementById('predSizeText'),ne=document.getElementById('predNumText'),hero=document.getElementById('predHero');
    se.innerText=size.toUpperCase();
    se.className='pred-size-display '+(size==='Big'?'big-text':'small-text');
    ne.innerText=num;
    hero.className='prediction-hero animate-in '+(size==='Big'?'big-mode':'small-mode');
    document.getElementById('confFill').style.width=conf+'%';
    document.getElementById('confValue').innerText=conf+'%';
    let lb=document.getElementById('levelBadge'),lt=document.getElementById('levelText');
    lb.style.display='inline-flex';lt.innerText='LEVEL '+lv;
    lb.className='level-badge '+(lv<=2?'safe':lv<=4?'warning':'danger');
    hero.classList.remove('pred-pop');void hero.offsetWidth;hero.classList.add('pred-pop');
  }

  function updateDonuts(w,l,t){
    let acc=t>0?w/t*100:0;
    document.getElementById('donutPass').setAttribute('stroke-dasharray',`${(t>0?w/t:0)*CIRC} ${CIRC}`);
    document.getElementById('donutPassVal').innerText=w;
    document.getElementById('donutFail').setAttribute('stroke-dasharray',`${(t>0?l/t:0)*CIRC} ${CIRC}`);
    document.getElementById('donutFailVal').innerText=l;
    document.getElementById('donutAcc').setAttribute('stroke-dasharray',`${(acc/100)*CIRC} ${CIRC}`);
    document.getElementById('donutAccVal').innerText=acc.toFixed(0)+'%';
    document.getElementById('donutBets').setAttribute('stroke-dasharray',`${Math.min(t/20,1)*CIRC} ${CIRC}`);
    document.getElementById('donutBetsVal').innerText=t;
  }

  function updateCards(w,l,t){
    let acc=t>0?(w/t*100).toFixed(1):'0.0';
    document.getElementById('cardPass').innerText=w;
    document.getElementById('cardFail').innerText=l;
    document.getElementById('cardAccuracy').innerText=acc+'%';
    document.getElementById('cardBets').innerText=t;
  }

  function updateStreak(){
    let ic=document.getElementById('streakIcon'),vl=document.getElementById('streakValue');
    if(cW>0){ic.innerText='🔥';vl.className='streak-value win-streak';vl.innerText=cW+' WIN'+(cW>1?'S':'');}
    else if(cL>0){ic.innerText='❄️';vl.className='streak-value loss-streak';vl.innerText=cL+' LOSS'+(cL>1?'ES':'');}
    else{ic.innerText='⚡';vl.className='streak-value';vl.style.color='var(--text-secondary)';vl.innerText='—';}
  }

  function renderBalls(){
    document.getElementById('recentBalls').innerHTML=last100.slice(0,10).map(i=>
      `<div class="result-ball" style="background:${col(i.number)}">${i.number}<span class="rb-label">${bs(i.number).charAt(0)}</span></div>`
    ).join('');
  }

  function renderHistory(){
    let c=document.getElementById('historyList');
    let t=hist.filter(p=>p.status!=='Pending').length,w=hist.filter(p=>p.status==='Win').length,l=t-w;
    let acc=t>0?(w/t*100).toFixed(1):'0.0';
    document.getElementById('hsWins').innerText=w;
    document.getElementById('hsLosses').innerText=l;
    document.getElementById('hsAcc').innerText=acc+'%';
    document.getElementById('hsTotal').innerText=hist.length;
    if(!hist.length){c.innerHTML='<div class="empty-state"><i class="fas fa-inbox"></i>No predictions yet</div>';return;}
    c.innerHTML=hist.slice(0,40).map(p=>{
      let sc=p.status==='Win'?'win':p.status==='Loss'?'loss':'pending';
      let pc=p.pSize==='Big'?'var(--accent-purple)':'var(--accent-green)';
      let at=p.status!=='Pending'?`<span class="hi-actual">Result: ${p.actual} (${p.aNum})</span>`:'';
      return`<div class="history-item"><div class="hi-left"><span class="hi-period">${p.period}</span><span class="hi-pred" style="color:${pc}">${p.pSize} → ${p.pNum}</span>${at}</div><span class="hi-status ${sc}">${p.status==='Win'?'✅ WIN':p.status==='Loss'?'❌ LOSS':'⏳'}</span></div>`;
    }).join('');
  }

  function updateServer(res){
    if(!res?.logics)return;
    let icons=['fa-rotate','fa-3','fa-5','fa-bolt','fa-clone','fa-layer-group','fa-scale-balanced','fa-chart-line','fa-mirror','fa-wave-square','fa-fire','fa-arrows-left-right','fa-magnet','fa-shuffle','fa-diagram-project','fa-chart-area','fa-gauge-high','fa-compress','fa-circle-half-stroke','fa-cubes'];
    let colors=['#4facfe','#00f5a0','#22d3ee','#ff4757','#a855f7','#fbbf24','#00f5a0','#4facfe','#a855f7','#22d3ee','#ff4757','#fbbf24','#00f5a0','#a855f7','#4facfe','#22d3ee','#ff4757','#fbbf24','#00f5a0','#a855f7'];
    document.getElementById('logicItems').innerHTML=res.logics.map((l,i)=>{
      let vc=l.v==='B'?'var(--accent-purple)':l.v==='S'?'var(--accent-green)':'var(--text-muted)';
      return`<div class="logic-item"><span class="logic-name"><i class="fas ${icons[i]||'fa-circle'}" style="color:${colors[i]}"></i>${l.n} ${l.a?'🟢':'⚪'}</span><span class="logic-value" style="color:${vc}">${l.v||'—'} <span style="font-size:0.55rem;color:var(--text-muted)">${l.d}</span></span></div>`;
    }).join('')+`<div class="logic-item" style="border-top:2px solid var(--accent-gold);margin-top:8px;padding-top:14px;"><span class="logic-name"><i class="fas fa-trophy" style="color:var(--accent-gold)"></i><b>FINAL</b></span><span class="logic-value" style="color:var(--accent-gold);font-size:1rem"><b>${res.pred==='B'?'BIG':'SMALL'}</b> B:${res.bV} S:${res.sV}</span></div>`;
    let pd=document.getElementById('patternCards'),pats=res.logics.filter(l=>l.a&&l.v);
    pd.innerHTML=pats.length?pats.map(l=>`<div class="pattern-card" style="border-left-color:${l.v==='B'?'var(--accent-purple)':'var(--accent-green)'}">✅ ${l.n}: ${l.d}</div>`).join(''):'<div style="color:var(--text-muted);padding:10px;font-size:0.8rem;">No patterns</div>';
  }

  function updateHeat(nf){
    if(!nf)return;let mx=Math.max(...nf,1);
    document.getElementById('heatmapGrid').innerHTML=nf.map((f,i)=>{
      let int=f/mx,r,g,b;
      if(i>=5){r=0;g=Math.floor(245*int);b=Math.floor(160*int);}
      else{r=Math.floor(255*int);g=Math.floor(71*int);b=Math.floor(87*int);}
      return`<div class="heat-cell" style="background:rgba(${r},${g},${b},${Math.max(int*0.6,0.08)});border:1px solid rgba(${r},${g},${b},${Math.max(int*0.3,0.05)})">${i}<span style="font-size:0.4rem;opacity:0.7;margin-top:2px">${f}</span></div>`;
    }).join('');
  }

  function renderAll(){
    let t=hist.filter(p=>p.status!=='Pending').length,w=hist.filter(p=>p.status==='Win').length,l=t-w;
    updateDonuts(w,l,t);updateCards(w,l,t);updateStreak();renderBalls();renderHistory();
  }

  document.querySelectorAll('.nav-item').forEach(i=>{i.addEventListener('click',function(){
    document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
    document.querySelectorAll('.tab-page').forEach(p=>p.classList.remove('active'));
    this.classList.add('active');document.getElementById(this.dataset.page).classList.add('active');
  });});

  document.getElementById('clearHistoryBtn').addEventListener('click',()=>{
    if(confirm('Clear?')){hist=[];lv=1;cL=0;cW=0;lastPeriodPredicted='';tgSentPeriods={};tgQueue=[];renderAll();}
  });

  document.getElementById('startSession').addEventListener('click',async()=>{
    botT=document.getElementById('botToken').value.trim();
    chId=document.getElementById('channelId').value.trim();
    if(!botT||!chId){alert('Enter token & ID');return;}
    tgLog('🔄 Testing...','info');
    try{
      let r=await fetch(`https://api.telegram.org/bot${botT}/getMe`);
      let data=await r.json();
      if(!data.ok){tgLog('❌ Bad token','err');alert('Invalid token!');return;}
      tgLog('✅ Bot: @'+data.result.username,'ok');
    }catch(e){tgLog('❌ '+e.message,'err');alert('Failed!');return;}
    tgOn=true;
    document.getElementById('startSession').disabled=true;
    document.getElementById('stopSession').disabled=false;
    document.getElementById('sessionStatus').className='tg-status active-status';
    document.getElementById('sessionStatus').innerHTML='<i class="fas fa-circle" style="font-size:0.5rem"></i>ACTIVE';
    tgSentPeriods={};lastPeriodPredicted='';tgQueue=[];
    await tgMsg('📈 <b>TRADE PRO AI</b>\n\n🟢 Session Started');
    tgLog('🚀 Started!','ok');
    fetchData();
  });

  document.getElementById('stopSession').addEventListener('click',async()=>{
    tgOn=false;
    tgQueue=[];
    await tgMsg('📈 <b>TRADE PRO AI</b>\n\n🔴 Session Stopped');
    document.getElementById('startSession').disabled=false;
    document.getElementById('stopSession').disabled=true;
    document.getElementById('sessionStatus').className='tg-status inactive-status';
    document.getElementById('sessionStatus').innerHTML='<i class="fas fa-circle" style="font-size:0.5rem"></i>INACTIVE';
    tgLog('🛑 Stopped','info');
  });

  setInterval(()=>{let k=Object.keys(tgSentPeriods);if(k.length>50)k.sort().slice(0,k.length-20).forEach(x=>delete tgSentPeriods[x]);},60000);

  function init(){tick();fetchData();renderAll();setInterval(fetchData,3000);setInterval(tick,500);tgLog('📋 Ready','info');}
  init();
})();
function rexen6Predict(FetchingListMap) {
    // ---------- CONFIG ----------
    const PREFS_NAME = "REXEN_AI_MEMORY";
    const LOSS_DECAY_PER_TICK = 0.90;
    const LOSS_REINFORCE_STEP = 0.60;
    const BASE_HISTORY_LIMIT = 10;
    const RECENT_LOSS_CAP = 10;
    const SMART_RESET_THRESHOLD = 5;   // consecutive losses
    const ENABLE_ENSEMBLE = true;
    const ENSEMBLE_WEIGHT = 1.0;
    const TREND_MATCH_WINDOW = 4;
    const TREND_FLIP_NEED = 3;
    const VOLATILITY_DANGER = 0.60;
    const VOLATILITY_PENALTY = -0.30;
    const CONF_HIGH = 0.75;
    const CONF_MED = 0.45;

    // ---------- PERSISTENCE HELPERS (localStorage) ----------
    function getPref(key, def) {
        const val = localStorage.getItem(PREFS_NAME + '_' + key);
        return val !== null ? JSON.parse(val) : def;
    }
    function setPref(key, val) {
        localStorage.setItem(PREFS_NAME + '_' + key, JSON.stringify(val));
    }

    // ---------- LOAD PERSISTED STATE ----------
    let recentLosses = getPref('recentLosses', 0);
    let consecLosses = getPref('consecLosses', 0);
    let lossMemory = {};
    for (let i = 0; i <= 9; i++) {
        let v = getPref('loss_' + i, 0.0);
        v *= LOSS_DECAY_PER_TICK; // passive decay
        lossMemory[i] = v;
    }

    // ---------- DYNAMIC HISTORY LIMIT ----------
    let dynamicHistoryLimit = BASE_HISTORY_LIMIT + Math.min(10, recentLosses * 2);

    // ---------- INPUT SANITY ----------
    if (!FetchingListMap || !Array.isArray(FetchingListMap)) {
        console.error('REXEN6: FetchingListMap is null or not an array');
        return null;
    }
    if (FetchingListMap.length > dynamicHistoryLimit) {
        FetchingListMap = FetchingListMap.slice(-dynamicHistoryLimit);
    }

    // ---------- EXTRACT HISTORY ----------
    let historyNumbers = [];
    for (let item of FetchingListMap) {
        try {
            let num = parseInt(String(item.number));
            if (!isNaN(num)) historyNumbers.push(num);
        } catch (e) {}
    }
    if (historyNumbers.length === 0) {
        console.error('REXEN6: No history available');
        return null;
    }

    // ---------- BASIC STATS ----------
    let N = historyNumbers.length;
    let occ = new Array(10).fill(0);
    let totalMissing = new Array(10).fill(0);
    let lastIndex = new Array(10).fill(-1);
    let maxConsecutive = new Array(10).fill(0);

    let curStreakNum = -1, curStreakCount = 0;

    for (let i = 0; i < N; i++) {
        let num = historyNumbers[i];
        if (num < 0 || num > 9) continue;

        occ[num]++;

        if (num === curStreakNum) curStreakCount++;
        else {
            if (curStreakNum !== -1)
                maxConsecutive[curStreakNum] = Math.max(maxConsecutive[curStreakNum], curStreakCount);
            curStreakNum = num;
            curStreakCount = 1;
        }

        if (lastIndex[num] !== -1)
            totalMissing[num] += i - lastIndex[num] - 1;
        lastIndex[num] = i;
    }
    if (curStreakNum !== -1)
        maxConsecutive[curStreakNum] = Math.max(maxConsecutive[curStreakNum], curStreakCount);

    // --- avg missing & current gaps ---
    let avgMissing = new Array(10);
    let currentGap = new Array(10);
    for (let num = 0; num <= 9; num++) {
        avgMissing[num] = occ[num] > 1
            ? totalMissing[num] / (occ[num] - 1)
            : dynamicHistoryLimit * 0.8;
        currentGap[num] = lastIndex[num] === -1
            ? dynamicHistoryLimit
            : (N - 1 - lastIndex[num]);
    }

    // --- last number + streak count ---
    let lastNum = historyNumbers[N - 1];
    let streakCount = 0;
    for (let i = N - 1; i >= 0; i--) {
        if (historyNumbers[i] === lastNum) streakCount++;
        else break;
    }

    // ---------- VOLATILITY (BIG/SMALL flip rate) ----------
    let volatilitySwitch = 0;
    for (let i = 1; i < N; i++) {
        let prevBig = historyNumbers[i - 1] >= 5;
        let nowBig = historyNumbers[i] >= 5;
        if (prevBig !== nowBig) volatilitySwitch++;
    }
    let volFactor = volatilitySwitch / Math.max(1, N - 1);

    // ---------- CLUSTER PATTERN: (last3) -> next counts ----------
    let clusterNextCounts = new Array(10).fill(0);
    let clusterMatches = 0;
    if (N >= 4) {
        let a = historyNumbers[N - 3];
        let b = historyNumbers[N - 2];
        let c = historyNumbers[N - 1];
        for (let i = 0; i <= N - 4; i++) {
            if (historyNumbers[i] === a &&
                historyNumbers[i + 1] === b &&
                historyNumbers[i + 2] === c) {
                let next = historyNumbers[i + 3];
                if (next >= 0 && next <= 9) {
                    clusterNextCounts[next]++;
                    clusterMatches++;
                }
            }
        }
    }

    // -----------------------------------------------------------------
    //      REXEN6 QUANTUM UPGRADE LAYER (QFD / TZI / DRIFT / MODE)
    // -----------------------------------------------------------------

    // ---------- QUANTUM FLIP DETECTOR (QFD) ----------
    let qfdCount = 0;
    for (let i = 2; i < N; i++) {
        let a = historyNumbers[i - 2] >= 5;
        let b = historyNumbers[i - 1] >= 5;
        let c = historyNumbers[i] >= 5;
        if (a === b && b !== c) qfdCount++; // sudden unexpected flip
    }

    // ---------- TRAP-ZONE INDEX (TZI) ----------
    let trapIndex = 0;
    if (streakCount >= 3) trapIndex += 2;
    if (maxConsecutive[lastNum] >= 4) trapIndex += 3;
    if (volFactor < 0.30) trapIndex += 2; // stable trap
    if (recentLosses >= 3) trapIndex += 2;

    // ---------- PATTERN-DRIFT ANALYSIS (PDA) ----------
    let driftScore = 0;
    if (N >= 8) {
        let earlyBig = 0, lateBig = 0;
        for (let i = 0; i < N / 2; i++) {
            if (historyNumbers[i] >= 5) earlyBig++;
        }
        for (let i = Math.floor(N / 2); i < N; i++) {
            if (historyNumbers[i] >= 5) lateBig++;
        }
        driftScore = (lateBig - earlyBig) / Math.max(1, Math.floor(N / 2));
    }

    // ---------- LOSS-CHAIN DAMPENING (LCD) ----------
    let lcdFactor = 1.0;
    if (recentLosses >= 4) lcdFactor = 0.75;
    if (recentLosses >= 6) lcdFactor = 0.55;

    // ---------- MODE SWITCH (auto detection) ----------
    let mode = "GAP";
    if (volFactor > 0.55) mode = "VOLATILE";
    if (driftScore > 0.30) mode = "FREQ";
    if (trapIndex >= 4) mode = "SAFE";

    // -----------------------------------------------------------------
    //                          SCORING ENGINE
    // -----------------------------------------------------------------
    function scoreOne(num, mirrored) {
        // ❗ COMPLETELY UNSEEN NUMBERS GET HARD PENALTY
        if (occ[num] === 0) {
            return -5.0;
        }

        // base signals
        let freqScore = (dynamicHistoryLimit - occ[num]) / dynamicHistoryLimit;
        let gapScore = currentGap[num] / dynamicHistoryLimit;
        let avgMissingScore = avgMissing[num] / dynamicHistoryLimit;

        // thoda soft hot/cold & overdue
        let hotColdBoost = (occ[num] <= dynamicHistoryLimit / 5.0) ? 0.20 : -0.10;
        let overdueBoost = (currentGap[num] > avgMissing[num]) ? 0.25 : 0.0;

        // recency decay
        let recencyWeight = 0;
        for (let i = 0; i < N; i++) {
            if (historyNumbers[i] === num) {
                recencyWeight += Math.pow(0.9, N - 1 - i);
            }
        }
        recencyWeight = (1 - (recencyWeight / Math.max(1, N))) * 0.30;

        let neighborBoost = 0;
        if (Math.abs(lastNum - num) === 1) {
            neighborBoost = (currentGap[num] > avgMissing[num]) ? 0.20 : 0.05;
        }

        let patternGapBoost = (Math.abs(currentGap[num] - avgMissing[num]) <= 1) ? 0.20 : 0.0;

        let streakPenalty = (streakCount >= 2 && num === lastNum) ? -0.50 : 0.0;
        let maxConsPenalty = (maxConsecutive[num] >= 3) ? -0.25 : 0.0;

        let clusterBoost = 0.0;
        if (clusterMatches > 0) {
            clusterBoost = (clusterNextCounts[num] / clusterMatches) * 0.35;
        }

        let lm = lossMemory[num] || 0.0;
        let lossWeight = (mirrored ? +0.50 : -0.50) * lm;

        let score = 0;
        score += freqScore * 0.25;
        score += gapScore * 0.25;
        score += avgMissingScore * 0.15;
        score += recencyWeight;
        score += hotColdBoost;
        score += overdueBoost;
        score += neighborBoost;
        score += patternGapBoost;
        score += clusterBoost;
        score += streakPenalty;
        score += maxConsPenalty;
        score += lossWeight;

        // volatility penalty
        if (volFactor > VOLATILITY_DANGER) score += VOLATILITY_PENALTY;

        // MODE-SPECIFIC WEIGHTS
        let modeBoost = 0;
        switch (mode) {
            case "GAP":
                modeBoost = gapScore * 0.30;
                break;
            case "FREQ":
                modeBoost = freqScore * 0.30;
                break;
            case "VOLATILE":
                modeBoost = recencyWeight * 0.40;
                break;
            case "SAFE":
                modeBoost = -streakPenalty * 0.80;
                break;
        }
        score += modeBoost;

        // QUANTUM FLIP DETECTOR
        if (qfdCount >= 2 && (num >= 5) === (lastNum >= 5)) {
            score -= 0.40;  // avoid repeat direction when flips are weird
        }

        // TRAP ZONE PENALTY
        if (trapIndex >= 4 && num === lastNum) {
            score -= 0.35;
        }

        // PATTERN-DRIFT
        score += driftScore * ((num >= 5) ? 0.20 : -0.20);

        // LOSS-CHAIN DAMPENING
        score *= lcdFactor;

        return score;
    }

    // ---------- SCORING (with ensemble) ----------
    let prediction = -1;
    let highestScore = -9999;

    for (let num = 0; num <= 9; num++) {
        let s1 = scoreOne(num, false);
        let finalScore = s1;
        if (ENABLE_ENSEMBLE) {
            let s2 = scoreOne(num, true);
            finalScore = (s1 + ENSEMBLE_WEIGHT * s2) / (1.0 + ENSEMBLE_WEIGHT);
        }

        if (finalScore > highestScore) {
            highestScore = finalScore;
            prediction = num;
        } else if (Math.abs(finalScore - highestScore) < 1e-6) {
            // tie → 50% chance switch to this num
            if (Math.random() < 0.5) {
                prediction = num;
            }
        }
    }

    // ---------- ERROR CORRECTION PASS (ECP) ----------
    let altPrediction = -1;
    let secondBest = -9999;

    for (let num = 0; num <= 9; num++) {
        if (num === prediction) continue;
        let s1 = scoreOne(num, false);
        let s2 = scoreOne(num, true);
        let finalScore = (s1 + s2) / 2.0;

        if (finalScore > secondBest) {
            secondBest = finalScore;
            altPrediction = num;
        }
    }

    // If difference < threshold, engine is unsure → pick safer alt when in trap
    if (Math.abs(highestScore - secondBest) < 0.18 && altPrediction !== -1) {
        if (trapIndex >= 4) {
            prediction = altPrediction;
        }
    }

    // ---------- CONFIDENCE ----------
    let confidence = Math.min(1.0, Math.max(0.0, (highestScore + 1.5) / 3.0));
    confidence = Math.max(0.0, Math.min(1.0, confidence * (1.0 - 0.30 * volFactor)));

    // ---------- BIG/SMALL MAP ----------
    let predictionType = (prediction >= 0 && prediction <= 4) ? "SMALL" : "BIG";

    // ---------- TREND CORRECTION ----------
    let lastTrendSame = 0;
    for (let i = Math.max(0, N - TREND_MATCH_WINDOW); i < N; i++) {
        let wasBig = historyNumbers[i] >= 5;
        let predBig = prediction >= 5;
        if (wasBig === predBig) lastTrendSame++;
    }
    if (lastTrendSame >= TREND_FLIP_NEED && recentLosses <= 1) {
        predictionType = predictionType === "BIG" ? "SMALL" : "BIG";
    }

    // ---- AI Bias Stabilizer (ABS) ----
    let lastWasBig = lastNum >= 5;
    let predBigSide = prediction >= 5;
    if (recentLosses >= 3 && predBigSide === lastWasBig) {
        predictionType = predictionType === "BIG" ? "SMALL" : "BIG";
    }

    // ---- Drift-based correction ----
    if (driftScore > 0.4 && prediction <= 4)
        predictionType = "BIG";
    if (driftScore < -0.3 && prediction >= 5)
        predictionType = "SMALL";

    // ---------- EVALUATE LAST OUTCOME ----------
    let win = false;
    if (lastNum !== -1) {
        let lastType = (lastNum >= 5) ? "BIG" : "SMALL";
        win = predictionType === lastType;
    }

    // ---------- SMART MEMORY RESET ----------
    consecLosses = win ? 0 : consecLosses + 1;
    if (consecLosses >= SMART_RESET_THRESHOLD) {
        for (let i = 0; i <= 9; i++) {
            setPref('loss_' + i, 0.0);
            lossMemory[i] = 0.0;
        }
        setPref('recentLosses', 0);
        setPref('consecLosses', 0);
        recentLosses = 0;
        consecLosses = 0;
        console.warn('REXEN6: 🧠 Smart Memory Reset Triggered');
    } else {
        setPref('consecLosses', consecLosses);
    }

    // ---------- UPDATE RECENT LOSSES ----------
    recentLosses = win
        ? Math.max(0, recentLosses - 1)
        : Math.min(RECENT_LOSS_CAP, recentLosses + 1);
    setPref('recentLosses', recentLosses);

    // ---------- SAVE LOSS MEMORY ----------
    for (let i = 0; i <= 9; i++) {
        let newVal = lossMemory[i];
        if (!win && prediction === i)
            newVal = Math.min(1.0, newVal + LOSS_REINFORCE_STEP);
        setPref('loss_' + i, newVal);
        lossMemory[i] = newVal; // update local copy if needed later
    }

    // ---------- CONFIDENCE LEVEL ----------
    let confLevel = (confidence > CONF_HIGH) ? "HIGH"
                  : (confidence > CONF_MED ? "MEDIUM" : "LOW");

    // ---------- OUTPUT ----------
    console.log(
        "REXEN6: Prediction=" + prediction + " (" + predictionType + ")" +
        " | Conf=" + (confidence * 100).toFixed(2) + "% [" + confLevel + "]" +
        " | LastResult=" + (win ? "✅ WIN" : "❌ LOSS") +
        " | recentLosses=" + recentLosses +
        " | consecLosses=" + consecLosses +
        " | Volatility=" + volFactor.toFixed(2) +
        " | ClusterMatches=" + clusterMatches +
        " | Mode=" + mode +
        " | TrapIndex=" + trapIndex +
        " | Drift=" + driftScore.toFixed(2) +
        " | QFD=" + qfdCount
    );

    // Return the prediction (matches ServerCalculations in original)
    return prediction;
}
