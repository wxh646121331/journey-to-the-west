'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
const W=960,H=540, PIXEL_SCALE=2, SAVE='west-stone-monkey-v1';
const questNames=['寻找猴群并交谈','穿越瀑布，查看洞中石碑','返回瀑布前，再次与猴群交谈','带猴群进入水帘洞，在石王座前集合'];
const THRONE_X=3375;
let seatedAt=null;
const followerStarts=[1845,1890,1950];
const followers=followerStarts.map(x=>({x,y:418,vy:0,ground:true,face:1,moving:false,landing:null}));
let escort=false, afterTalk=null, birdAt=0, stepAt=0, water=null, noiseBuffer=null;
let mode='cover',paused=false,t=0,last=0,cam=0,storyIndex=0,score=0,activeQuiz=null,quizDone=false,burst=0,checkpoint=90,found=false,challenged=false,ending=false,muted=false,audio=null,toastUntil=0,saveTime=0;
let jumpRequestedUntil=-1;
const keys=new Set(),player={x:90,y:360,vx:0,vy:0,w:23,h:34,ground:false,face:1};
const platforms=[{x:-100,y:452,w:450},{x:390,y:420,w:140},{x:560,y:382,w:145},{x:740,y:425,w:260},{x:1050,y:404,w:115},{x:1210,y:365,w:140},{x:1400,y:410,w:100},{x:1540,y:452,w:530},{x:2120,y:412,w:180},{x:2340,y:392,w:160},{x:2525,y:432,w:420},{x:2975,y:405,w:150},{x:3150,y:432,w:350}];
const peaches=[{x:215,y:408},{x:440,y:376},{x:610,y:338},{x:790,y:380},{x:960,y:382},{x:1090,y:360},{x:1260,y:321},{x:1435,y:365},{x:1740,y:408},{x:2185,y:368},{x:2405,y:348},{x:3025,y:361}].map(p=>({...p,taken:false}));
const lines=[['天地初开','东胜神洲的海外，有一座花果山。'],['天地初开','山顶有一块仙石，日日承受天地精华。'],['天地初开','日月轮转，仙石之中渐渐孕育出生命。'],['灵石有知','山风吹过，林间鸟鸣，一场奇遇即将开始。'],['仙石初醒','一日，仙石忽然迸裂，产下一枚石卵。'],['仙石初醒','石卵见风，化作一只石猴，五官俱备，四肢皆全。'],['仙石初醒','石猴睁开双眼，两道金光直冲天际。'],['你的旅程','这一次，由你走进花果山，去寻找瀑布背后的秘密。']];
const quizzes={3:{q:'花果山位于哪一洲？',a:['东胜神洲','南赡部洲','西牛贺洲'],right:0,why:'花果山坐落于东胜神洲傲来国的海外。'},7:{q:'石猴由什么孕育而来？',a:['一株千年桃树','花果山顶的仙石','东海的一滴水'],right:1,why:'山顶仙石受天地精华，产下石卵，见风化作石猴。'},final:{q:'猴群为什么愿意拜石猴为王？',a:['他找到了许多仙桃','他打败了山中猛虎','他探明水帘洞，并平安返回'],right:2,why:'石猴兑现了探明水源、平安返回的约定，还为猴群寻到安居之所。'}};
function tone(f=440,d=.12){if(muted)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.045,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+d);}catch{}}
function toast(s){$('toast').textContent=s;toastUntil=t+3.5;}
function setSteps(n){for(let i=0;i<3;i++)$('step'+i).classList.toggle('active',i<=n);}
function save(){if(mode!=='play')return;try{localStorage.setItem(SAVE,JSON.stringify({x:checkpoint,score,taken:peaches.map(p=>p.taken),found,challenged,escort,...vitalSave()}));}catch{}}
function placePlayerOnGround(route,x){
  slamActive=false;
  const floor=route.find(p=>x>=p.x&&x+player.w<=p.x+p.w)??route[0];
  const safeX=Math.max(floor.x,Math.min(floor.x+floor.w-player.w,x));
  Object.assign(player,{x:safeX,y:floor.y-player.h,vx:0,vy:0,ground:true});
  jumpRequestedUntil=-1;
}
function reset(){slamActive=false;slamImpact=null;health=100;maxHealth=100;lives=3;immuneUntil=0;damageNumbers.length=0;$('stamina').hidden=true;stamina=100;flightTrialDone=false;$('health').hidden=true;$('staffButton').hidden=true;$('flightDown').hidden=true;jumpRequestedUntil=-1;chapter=1;$('chapterLabel').textContent='CHAPTER 01 / 花果山';$('energy').hidden=true;$('spellButton').hidden=true;seatedAt=null;escort=false;afterTalk=null;followers.forEach((monkey,i)=>Object.assign(monkey,{x:followerStarts[i],y:418,vy:0,ground:true,face:1,moving:false,landing:null}));$('quest').hidden=true;particles.length=0;storyIndex=0;score=0;activeQuiz=null;found=false;challenged=false;ending=false;checkpoint=90;cam=0;peaches.forEach(p=>p.taken=false);placePlayerOnGround(platforms,90);$('ending').hidden=true;$('pausePanel').hidden=true;paused=false;keys.clear();}
function start(){reset();mode='story';$('cover').hidden=true;$('pause').hidden=false;$('status').textContent='序章 · 灵根育孕源流出';setSteps(0);showLine();tone(392);}
function showLine(){const l=lines[storyIndex];$('dialog').hidden=false;$('dialog').innerHTML=`<div class="speaker">第一回 · ${l[0]}</div><div class="line">${l[1]}</div><span class="next">点击屏幕 / 空格 继续 ▾</span>`;}
function showQuiz(q,final=false){activeQuiz={...q,final};quizDone=false;mode='quiz';$('touch').hidden=true;$('dialog').hidden=false;$('dialog').innerHTML=`<div class="speaker">山海问答 · ${final?'最后一问':'读到这里，考考你'}</div><div class="line">${q.q}</div>${q.a.map((a,i)=>`<button class="option" data-answer="${i}">${'ABC'[i]} &nbsp; ${a}</button>`).join('')}`;$('dialog').querySelectorAll('[data-answer]').forEach(b=>b.onclick=e=>{e.stopPropagation();answer(Number(b.dataset.answer));});}
function answer(i){if(quizDone)return;quizDone=true;const correct=i===activeQuiz.right;if(correct){score++;tone(660);}else tone(180,.2);$('dialog').innerHTML=`<div class="speaker">山海问答</div><div class="line">${correct?'✦ 回答正确！':'正确答案：'+ 'ABC'[activeQuiz.right]+' · '+activeQuiz.a[activeQuiz.right]}</div><div class="feedback ${correct?'correct':''}">${activeQuiz.why}</div><span class="next">点击继续 ▾</span>`;}
function advance(){if(paused)return;if(mode==='story'){storyIndex++;if(quizzes[storyIndex])showQuiz(quizzes[storyIndex]);else if(storyIndex>=lines.length)startBurst();else showLine();}else if(mode==='quiz'&&quizDone){const final=activeQuiz.final;activeQuiz=null;if(final)talk('猴群 · 拜见美猴王','多亏你找到了这处洞天！我们说话算数，从今往后，你便是我们的美猴王！',approachThrone);else{mode='story';showLine();}}else if(mode==='talk'){closeDialog();}}
function startBurst(){mode='burst';burst=0;$('dialog').hidden=true;$('hint').textContent='仙石迸裂，石猴初生。';tone(110,.8);}
function beginPlay(){mode='play';showHealth();$('stamina').hidden=false;renderStamina();$('stage').focus?.({preventScroll:true});$('dialog').hidden=true;$('hud').hidden=false;$('touch').hidden=false;setSteps(1);showQuest();$('hint').textContent='方向键移动，空格跳跃；靠近猴群按 E 交谈';toast('你成为了石猴。向右走，沿溪流寻找猴群。');save();}
function showQuest(){
  const card=$('quest');
  card.hidden=false;
  $('questTitle').textContent=questNames[escort?3:found?2:challenged?1:0];
  card.classList.remove('arrival');
  const stage=$('stage');
  if(stage.clientWidth){
    card.style.setProperty('--quest-x', (stage.clientWidth/2-card.offsetLeft-card.offsetWidth/2)+'px');
    card.style.setProperty('--quest-y', (stage.clientHeight/2-card.offsetTop-card.offsetHeight/2)+'px');
    void card.offsetWidth;
    card.classList.add('arrival');
  }
}
function closeDialog(){
  jumpRequestedUntil=-1;
  mode='play';
  $('dialog').hidden=true;
  $('touch').hidden=false;
  keys.clear();
  const next=afterTalk;
  afterTalk=null;
  if(next)next();
}
function talk(title,text,next){
  mode='talk';
  afterTalk=next;
  keys.clear();
  $('touch').hidden=true;
  $('dialog').hidden=false;
  $('dialog').innerHTML=`<div class="speaker">${title}</div><div class="line">${text}</div><span class="next">点击屏幕继续 ▾</span>`;
  if(title.startsWith('猴群'))chatter();
}
function interact(){
  if(mode!=='play'||paused)return;
  if(chapter===2){interactChapterTwo();return;}
  if(chapter===3){interactChapterThree();return;}
  if(player.x>1780&&player.x<2070&&!escort){
    if(!found){
      talk('猴群 · 瀑布前的约定','谁能穿过瀑布，探明水源，再平安回来，我们就拜他为王！',()=>{
        challenged=true;
        checkpoint=1810;
        save();
        showQuest();
      });
    }else{
      talk('猴群 · 一同入洞','瀑布后面有石桥和一处宽敞洞府？好！你在前面带路，我们跟你去。',()=>{
        escort=true;
        checkpoint=1810;
        save();
        showQuest();
      });
    }
    return;
  }
  if(player.x>3210&&!found&&challenged){
    talk('洞中石碑','花果山福地，水帘洞洞天。这里能遮风避雨，快回去告诉猴群！',()=>{
      found=true;
      checkpoint=3190;
      setSteps(2);
      save();
      showQuest();
    });
    return;
  }
  if(escort&&player.x>3260){
    if(followers.some(monkey=>monkey.x<3090||!monkey.ground)){toast('等猴群都进洞，再到石王座前互动。');return;}
    showQuiz(quizzes.final,true);
    return;
  }
  toast($('questTitle').textContent);
}
function approachThrone(){
  mode='coronation';
  $('quest').hidden=true;
  $('touch').hidden=true;
  $('status').textContent='美猴王 · 登上石王座';
}
function updateCoronation(dt){
  const gap=THRONE_X-(player.x+12);
  if(Math.abs(gap)>1){
    player.face=Math.sign(gap);
    player.vx=player.face*105;
    player.x+=player.face*Math.min(Math.abs(gap),105*dt);
    player.y=398;
    player.ground=true;
    return;
  }
  player.vx=0;
  if(seatedAt===null){
    seatedAt=t;
    chirp(392,392,.45,0,.055,'triangle');
  }
  if(t-seatedAt>2.25)finish();
}
function finish(){$('health').hidden=true;$('stamina').hidden=true;$('quest').hidden=true;mode='end';ending=true;$('dialog').hidden=true;$('hud').hidden=true;$('touch').hidden=true;$('pause').hidden=true;setSteps(2);const n=peaches.filter(p=>p.taken).length;$('ending').hidden=false;$('ending').innerHTML=`<span class="eyebrow">CHAPTER COMPLETE</span><h2>美 猴 王</h2><div class="cn-title">第一关 · 石破天惊，圆满完成</div><p>你为猴群寻得洞天，也赢得了他们的信任。</p><div class="stats"><div><strong>${n} / 12</strong><span>林间仙桃</span></div><div><strong>${score} / 3</strong><span>山海问答</span></div><div><strong>已发现</strong><span>水帘洞天</span></div></div><button class="primary" id="nextChapter">第二关 · 漂洋寻仙 →</button><button class="subtle" id="again">再游花果山 ↻</button>`;$('again').onclick=start;$('nextChapter').onclick=()=>startChapterTwo();$('status').textContent='第一关完成 · 美猴王诞生';$('hint').textContent='第一段旅程已完成，感谢你走进花果山。';try{localStorage.setItem(SAVE,JSON.stringify({chapter:2,phase:'cave'}));}catch{}tone(523,.3);setTimeout(()=>tone(784,.5),220);}
function pause(){jumpRequestedUntil=-1;if(['cover','end','gameover'].includes(mode))return;paused=!paused;keys.clear();$('pausePanel').hidden=!paused;}
$('start').onclick=start;$('restart').onclick=start;$('resume').onclick=pause;$('pause').onclick=pause;$('sound').onclick=()=>{muted=!muted;$('sound').textContent='♫ 声音：'+(muted?'关':'开');tone(523);};
try{if(localStorage.getItem(SAVE))$('continue').hidden=false;}catch{}
$('continue').onclick=()=>{try{const s=JSON.parse(localStorage.getItem(SAVE));if(s?.chapter===3){startChapterThree(s);return;}if(s?.chapter===2){startChapterTwo(s);return;}reset();restoreVitals(s);score=s.score||0;challenged=!!s.challenged;found=!!s.found;escort=!!s.escort;checkpoint=s.x||90;placePlayerOnGround(platforms,checkpoint);peaches.forEach((p,i)=>p.taken=!!s.taken?.[i]);$('cover').hidden=true;$('pause').hidden=false;tone(392);beginPlay();if(found)setSteps(2);}catch{start();}};
$('stage').addEventListener('click',e=>{if(e.target.closest('button'))return;advance();});
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)||e.key===' ')e.preventDefault();if(e.repeat)return;if(mode==='book'&&!paused&&['ArrowLeft','ArrowRight'].includes(e.code)){flipBook(e.code==='ArrowLeft'?-1:1);return;}if(e.code==='Escape'){pause();return;}if(paused)return;if((e.code==='Space'||e.key===' ')&&['story','quiz','talk'].includes(mode)){advance();return;}keys.add(e.code);if(e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW'||e.key===' '||e.key==='ArrowUp'||e.key?.toLowerCase()==='w')jump();if(e.code==='KeyE')interact();if(e.code==='KeyF')castTransform();if(e.code==='KeyA')swingStaff();});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(!paused&&!['cover','end','gameover'].includes(mode))pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&!paused&&!['cover','end','gameover'].includes(mode))pause();});
document.querySelectorAll('[data-key]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();if(b.hasPointerCapture&&!b.hasPointerCapture(e.pointerId)){try{b.setPointerCapture(e.pointerId);}catch{}}keys.add(b.dataset.key);if(b.dataset.key==='Space')jump();if(b.dataset.key==='KeyE')interact();if(b.dataset.key==='KeyF')castTransform();if(b.dataset.key==='KeyA')swingStaff();});if(b.dataset.key==='Space')b.addEventListener('click',e=>{if(e.detail===0)jump();});for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>keys.delete(b.dataset.key));});
function jump(){
  if(mode!=='play'||paused||slamActive)return;
  jumpRequestedUntil=t+.18;
  applyJumpRequest();
}
function applyJumpRequest(){
  if(!player.ground||t>jumpRequestedUntil)return;
  jumpRequestedUntil=-1;
  scatter(player.x+12,player.y+34,12,['#d5bf8c','#81975d']);
  player.vy=-510;
  player.ground=false;
  noiseHit(.17,.12,850,220);
}
function update(dt){updateAmbience();
if(paused)return;
updateParticles(dt);
if(chapter===2){updateChapterTwo(dt);return;}
if(chapter===3){updateChapterThree(dt);return;}
if(mode==='coronation'){updateCoronation(dt);return;}
if(mode==='burst'){
  if(burst<1.5&&burst+dt>=1.5){
    scatter(478,383,180,['#ffe6a5','#c5b487','#8b9471','#fff6d3'],230);
    noiseHit(.075,.62,6700,950);
    noiseHit(.92,.63,380,42,.018);
    chirp(91,35,.68,.025,.22);
    for(let i=1;i<=9;i++){
      noiseHit(.07+i*.013,.24-i*.018,2500-i*185,190,i*.048);
    }
    entranceMusic();
  }
  burst+=dt;if(burst>3.7)beginPlay();return;}if(mode!=='play')return;const p=player;updateRun(dt);const wasGrounded=p.ground,oldX=p.x,oldBottom=p.y+p.h;p.x=Math.max(0,Math.min(3430,p.x+p.vx*dt));if(!challenged&&p.x>2245){p.x=2245;if(oldX<2245)toast('先和猴群交谈，完成瀑布前的约定。');}
if(escort)moveFollowers(dt);
p.vy+=1170*dt;p.y+=p.vy*dt;p.ground=false;for(const f of platforms){if(p.x+p.w>f.x&&p.x<f.x+f.w&&oldBottom<=f.y+3&&p.y+p.h>=f.y&&p.vy>=0){p.y=f.y-p.h;p.vy=0;p.ground=true;}}if(p.ground&&p.vx&&t>=stepAt){stepAt=t+.26;footstep();}
if(!wasGrounded&&p.ground){footstep(true);}
if(!wasGrounded&&p.ground)scatter(p.x+12,p.y+p.h,10,['#d5bf8c','#81975d']);
if((oldX<2317)!==(p.x<2317))scatter(2317,p.y+15,60,['#d4fff0','#8fcfc4','#f5f9db'],130);
applyJumpRequest();
if(p.y>600){fallAndRespawn(platforms);if(mode!=='play')return;}if(p.ground&&p.x>1540&&p.x<1790)checkpoint=1580;if(p.ground&&p.x>2525&&challenged&&!found)checkpoint=2570;for(const f of peaches){if(!f.taken&&Math.abs(p.x+12-f.x)<27&&Math.abs(p.y+17-f.y)<34){f.taken=true;healFromPeach();scatter(f.x,f.y,36,['#ffd39a','#f1a785','#f9edbd'],100);tone(740,.09);save();}}cam+=((Math.max(0,Math.min(2540,p.x-330)))-cam)*Math.min(1,dt*7);$('area').textContent=p.x<650?'花果山 · 灵石台':p.x<1550?'花果山 · 青石涧':p.x<2320?'花果山 · 飞瀑前':'水帘洞 · 别有洞天';$('counts').textContent=`仙桃 ${peaches.filter(f=>f.taken).length}/12　✦ ${score}`;$('status').textContent=escort?'目标 · 带猴群到石王座前':found?'目标 · 返回猴群，带大家入住水帘洞':challenged?'目标 · 穿过瀑布，调查洞内石碑':'目标 · 沿溪流寻找猴群';if(t>saveTime){save();saveTime=t+4;}}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x*PIXEL_SCALE)/PIXEL_SCALE,Math.round(y*PIXEL_SCALE)/PIXEL_SCALE,Math.round(w*PIXEL_SCALE)/PIXEL_SCALE,Math.round(h*PIXEL_SCALE)/PIXEL_SCALE);}
function poly(points,c){ctx.fillStyle=c;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();}
function mountain(x,y,w,h,c){poly([[x,y+h],[x+w*.12,y+h*.56],[x+w*.25,y+h*.56],[x+w*.25,y+h*.28],[x+w*.36,y+h*.28],[x+w*.36,y+h*.12],[x+w*.47,y],[x+w*.6,y+h*.06],[x+w*.6,y+h*.26],[x+w*.72,y+h*.26],[x+w*.8,y+h*.6],[x+w*.92,y+h*.6],[x+w,y+h]],c);}
function tree(x,y,s=1){rect(x-5*s,y-110*s,12*s,115*s,'#31483b');rect(x+4*s,y-100*s,4*s,97*s,'#63704b');poly([[x,y-64*s],[x-29*s,y-91*s],[x-26*s,y-98*s],[x+4*s,y-77*s]],'#344d3c');const cs=['#183e35','#23513e','#346447','#496f49'];for(let i=0;i<4;i++){rect(x-(63-i*5)*s,y-(153-i*13)*s,(110-i*7)*s,31*s,cs[i]);rect(x-(38-i*9)*s,y-(174-i*10)*s,(73-i*2)*s,28*s,cs[i]);}rect(x-36*s,y-159*s,23*s,5*s,'#748951');}
function monkey(x,y,face=1,walk=false,scale=1,crown=false){ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(face*scale,scale);const swing=walk?Math.sin(t*15)*5:0;rect(-17,16,10,5,'#935e3c');rect(-22,7,5,13,'#935e3c');rect(-22,4,9,5,'#b7834e');rect(-8,12,18,17,'#a76d3d');rect(-8,27,6,8+swing,'#825132');rect(5,27,6,8-swing,'#825132');rect(-10,33+swing,9,4,'#dbb275');rect(3,33-swing,10,4,'#dbb275');rect(-11,1,24,19,'#b7844b');rect(-15,6,6,8,'#c99a64');rect(11,5,6,8,'#c99a64');rect(-5,5,17,13,'#e6bd7e');rect(1,6,3,4,'#20372b');rect(9,6,3,4,'#20372b');rect(7,12,6,3,'#754734');rect(-11,-3,23,7,'#8b5c37');rect(-3,-7,8,7,'#a27440');rect(6,17,6,14,'#d1a060');if(crown){rect(-10,-8,23,4,'#e9bb5f');for(let i=0;i<3;i++)rect(-9+i*9,-14,5,7,'#edca70');}ctx.restore();}
function peach(x,y){rect(x-6,y-6,13,11,'#e5a186');rect(x-3,y-8,9,14,'#e9b38c');rect(x-7,y-3,3,6,'#c88373');rect(x,y-11,7,4,'#8eae62');rect(x-2,y-10,3,5,'#9fc571');}
function drawBackground(){const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#153e3d');g.addColorStop(.65,'#719e83');g.addColorStop(1,'#aec0a0');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);const c=(mode==='cover'||mode==='story'||mode==='quiz'&&!activeQuiz?.final||mode==='burst')?0:cam;rect(715-c*.04,49,57,57,'#d5cf92');rect(725-c*.04,39,37,76,'#d5cf92');for(let layer=0;layer<3;layer++){const color=['#49796b','#356757','#214e40'][layer];for(let i=-1;i<6;i++)mountain(i*290-c*(.09+layer*.1),110+layer*55+Math.sin(i*2)*35,390,340,color);}for(let i=0;i<7;i++){const x=((i*203+t*(2+i%3)-c*.08)%1250)-140;rect(x,100+i%3*51,105,5,'#a1b69a44');rect(x+18,94+i%3*51,55,6,'#a1b69a44');}for(let i=0;i<12;i++){const x=i*97+Math.sin(t*.2+i)*16;rect(x,340+Math.sin(t+i)*15,90,3,'#b5c6a33a');}return c;}
function drawCover(){drawBackground();mountain(-90,260,530,330,'#153e34');mountain(670,230,450,370,'#163e32');tree(60,470,1.45);tree(890,430,1.1);rect(23,470,80,6,'#355943');rect(863,430,63,5,'#355943');rect(675,257,42,280,'#87b7aa');for(let i=0;i<9;i++)rect(678+i*5,260+(t*65+i*29)%270,2,40,'#d7e6c276');poly([[380,540],[397,460],[429,440],[434,418],[520,418],[531,447],[564,460],[601,540]],'#274b39');rect(422,420,113,10,'#638052');if(mode!=='burst'||burst<1.5){poly([[452,416],[443,370],[455,343],[493,338],[512,360],[507,417]],'#8b9471');rect(457,349,15,50,'#a7ac82');poly([[480,342],[477,369],[489,378],[481,409]],'#daca8c');}if(mode==='burst'){if(burst>1.5)monkey(478,Math.min(383,250+(burst-1.5)*90),1,false,1.4);const alpha=Math.max(0,1-Math.abs(burst-1.5)*3);rect(0,0,W,H,`rgba(255,242,189,${alpha})`);}for(let i=0;i<21;i++){const x=(i*143+Math.sin(t+i)*30)%960,y=240+(i*47)%270+Math.sin(t*.8+i)*12;rect(x,y,2,2,i%2?'#d7cc87':'#7dbb83');}}
function drawWorld(){drawBackground();const c=cam;rect(0,485,960,55,'#497f74');for(let i=0;i<25;i++)rect((i*53+t*18)%1000,490+i%4*12,25,2,'#99bc9c55');for(let i=0;i<13;i++){const x=i*295-c;const ground=platforms.find(p=>i*295>=p.x+9&&i*295<p.x+p.w-9);if(ground&&i*295<2525&&x>-160&&x<1100)tree(x,ground.y,.8+i%3*.22);}if(player.x>2100){rect(2525-c,0,1000,90,'#15362e');for(let i=0;i<9;i++)poly([[2525+i*130-c,80],[2555+i*130-c,140+i%3*20],[2577+i*130-c,80]],'#15362e');}
for(const f of platforms){if(f.x-c>1000||f.x+f.w-c<-20)continue;rect(f.x-c,f.y,f.w,110,'#344b36');rect(f.x-c,f.y,f.w,8,'#8a9b5f');rect(f.x-c,f.y+8,f.w,9,'#536b42');for(let i=0;i<f.w;i+=29){rect(f.x+i-c,f.y+30+(i%3)*13,18,5,'#465c3d');rect(f.x+i-c,f.y+19,9,4,'#263f32');}for(let i=0;i<f.w;i+=18)rect(f.x+i-c,f.y-3,3,6,'#a1ae68');}
rect(1980-c,350,65,8,'#a59c68');rect(2005-c,330,7,26,'#8a8355');rect(1990-c,326,50,20,'#b7a36f');ctx.fillStyle='#304b35';ctx.font='10px serif';ctx.fillText('水帘洞 →',1994-c,340);
for(const [i,follower] of followers.entries()){
  monkey(follower.x-c,follower.y+3,escort?follower.face:i%2?-1:1,follower.ground&&follower.moving,.85);
}
if(!challenged){
  for(let i=0;i<14;i++)rect(2250-c,280+i*10,2,4,'#f3d991');
}
drawStoneFurniture(c);
rect(3270-c,352,55,80,'#8c9879');rect(3275-c,345,45,8,'#aab18a');ctx.fillStyle='#294333';ctx.font='12px serif';for(let i=0;i<5;i++){ctx.fillText('水帘洞洞天'[i],3280-c,367+i*13);ctx.fillText('花果山福地'[i],3305-c,367+i*13);}rect(2670-c,404,54,12,'#7b8660');rect(2680-c,414,9,18,'#7b8660');rect(2706-c,414,9,18,'#7b8660');rect(2760-c,416,25,16,'#7b8660');
peaches.filter(p=>!p.taken).forEach(p=>peach(p.x-c,p.y));if(seatedAt!==null){
  const x=THRONE_X-c;
  monkey(x,375,1,false,1,true);
  rect(x-13,402,26,7,'#a76d3d');
  rect(x-13,407,7,8,'#dbb275');
  rect(x+6,407,7,8,'#dbb275');
}else{
  monkey(player.x+12-c,player.y+1,player.face,player.ground&&!!player.vx,1,mode==='coronation');
}
const fx=2280-c;rect(fx,0,75,458,'#a8d8cb88');for(let i=0;i<15;i++){const yy=(t*190+i*47)%450;rect(fx+i%6*13,yy,4,29+i%4*15,'#d3efda99');}for(let i=0;i<18;i++){const a=i*2.3;rect(fx+37+Math.sin(a+t)*48,451+Math.cos(a+t*2)*13,5,4,'#e1edce99');}if(player.x>2090&&player.x<2350&&!found){ctx.fillStyle='#f1e1ac';ctx.font='13px sans-serif';ctx.fillText('向右跃入水帘 →',2100-c,300);}if(mode==='play'){let label='';let x=0;if(player.x>1780&&player.x<2070){label='[ E ] '+(found?'告诉猴群你的发现':'与猴群交谈');x=1880;}if(player.x>3210&&(!found||escort)){label=escort?'[ E ] 石王座':'[ E ] 读石碑';x=3280;}if(label){ctx.textAlign='center';ctx.font='13px sans-serif';ctx.fillStyle='#f5deb0';ctx.fillText(label,x-c,306);ctx.textAlign='left';}}}
function moveFollowers(dt){
  followers.forEach((follower,i)=>{
    const target=Math.max(1810,player.x-42-i*42);
    const current=platforms.findIndex(p=>follower.x>=p.x&&follower.x<p.x+p.w);
    const direction=Math.sign(target-follower.x);
    if(follower.ground&&current>=0&&direction){
      const platform=platforms[current];
      const next=platforms[current+direction];
      const edge=direction>0?platform.x+platform.w:platform.x;
      if(next&&direction*(target-edge)>=0&&Math.abs(edge-follower.x)<19){
        follower.face=direction;
        follower.landing=next.x+next.w/2;
        follower.vy=-510;
        follower.ground=false;
      }
    }
    const goal=follower.landing??target;
    const gap=goal-follower.x;
    follower.moving=Math.abs(gap)>1;
    if(follower.moving)follower.face=Math.sign(gap);
    follower.x+=Math.sign(gap)*Math.min(Math.abs(gap),205*dt);
    const oldBottom=follower.y+34;
    follower.vy+=1170*dt;
    follower.y+=follower.vy*dt;
    follower.ground=false;
    for(const platform of platforms){
      if(follower.x<platform.x||follower.x>=platform.x+platform.w)continue;
      if(follower.vy>=0&&oldBottom<=platform.y+3&&follower.y+34>=platform.y){
        follower.y=platform.y-34;
        follower.vy=0;
        follower.ground=true;
        follower.landing=null;
        break;
      }
    }
  });
}

function drawStoneFurniture(camera){
  for(const x of [2810,2870]){
    const top=x-camera;
    rect(top+5,412,6,20,'#526750');
    rect(top+32,412,6,20,'#526750');
    rect(top,406,44,10,'#879477');
    rect(top,406,44,3,'#a7ab87');
  }
  const x=3370-camera;
  rect(x-31,418,72,14,'#576c56');
  rect(x-23,359,56,61,'#78896e');
  rect(x-17,350,44,12,'#9ca78a');
  rect(x-16,366,42,46,'#627960');
  rect(x-30,391,14,28,'#a0a98a');
  rect(x+27,391,14,28,'#a0a98a');
  rect(x-25,406,61,11,'#99a182');
  rect(x-36,427,82,5,'#a9ab88');
}

function makeNoise(){
  if(noiseBuffer)return noiseBuffer;
  noiseBuffer=audio.createBuffer(1,audio.sampleRate*2,audio.sampleRate);
  const samples=noiseBuffer.getChannelData(0);
  for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
  return noiseBuffer;
}
function noiseHit(duration,volume,frequency,endFrequency=frequency,delay=0){
  if(muted||!audio||audio.state!=='running')return;
  const source=audio.createBufferSource();
  source.buffer=makeNoise();
  const filter=audio.createBiquadFilter();
  filter.type='lowpass';
  const now=audio.currentTime+delay;
  filter.frequency.setValueAtTime(frequency,now);
  filter.frequency.exponentialRampToValueAtTime(endFrequency,now+duration);
  const gain=audio.createGain();
  gain.gain.setValueAtTime(.001,now);
  gain.gain.linearRampToValueAtTime(volume,now+.015);
  gain.gain.exponentialRampToValueAtTime(.001,now+duration);
  source.connect(filter).connect(gain).connect(audio.destination);
  source.start(now,Math.random());
  source.stop(now+duration);
}
function footstep(landing=false){
  noiseHit(landing?.14:.095,landing?.19:.12,420+Math.random()*330,130);
}
function chirp(from,to,duration,delay,volume,type='sine'){
  if(muted||!audio||audio.state!=='running')return;
  const now=audio.currentTime+delay;
  const voice=audio.createOscillator();
  const gain=audio.createGain();
  voice.type=type;
  voice.frequency.setValueAtTime(from,now);
  voice.frequency.exponentialRampToValueAtTime(to,now+duration);
  gain.gain.setValueAtTime(.001,now);
  gain.gain.linearRampToValueAtTime(volume,now+duration*.24);
  gain.gain.exponentialRampToValueAtTime(.001,now+duration);
  voice.connect(gain).connect(audio.destination);
  voice.start(now);
  voice.stop(now+duration);
}
function entranceMusic(){
  // A low drone and a sparse pentatonic motif accompany the stone monkey's entrance.
  chirp(98,98,2.4,.48,.075);
  chirp(146.83,146.83,2.15,.6,.035);
  const melody=[196,220,261.63,293.66,261.63,392];
  melody.forEach((note,i)=>{
    const delay=.48+i*.33;
    chirp(note*1.012,note,.31,delay,.10,'triangle');
    chirp(note*2,note*2,.15,delay,.025);
  });
}
function chatter(){
  for(let i=0;i<6;i++)chirp(230+Math.random()*150,120+Math.random()*190,.09+i%2*.07,i*.13,.035,'triangle');
}
function updateAmbience(){
  if(!audio||audio.state!=='running')return;
  if(!water&&!muted){
    const source=audio.createBufferSource();
    source.buffer=makeNoise();
    source.loop=true;
    const filter=audio.createBiquadFilter();
    filter.type='lowpass';
    filter.frequency.value=930;
    water=audio.createGain();
    water.gain.value=0;
    source.connect(filter).connect(water).connect(audio.destination);
    source.start();
  }
  const quiet=muted||paused;
  const inThird=chapter===3&&!['cover','end'].includes(mode);
  const sea=inThird&&thirdScene==='palace';
  const lava=inThird&&thirdScene==='underworld';
  const distance=mode==='play'||mode==='talk'?Math.abs(player.x-2317):700;
  water?.gain.setTargetAtTime(quiet?0:sea?.028:lava?.016:.018+.13*Math.max(0,1-distance/950),audio.currentTime,.2);
  if(!quiet&&(sea||lava)&&t>=ambienceAt){
    ambienceAt=t+(sea?.48:1.35)+Math.random()*(sea?1.1:2.2);
    if(sea){
      for(let i=0;i<3;i++)chirp(230+i*95,530+i*125,.10,i*.09,.038);
    }else{
      noiseHit(.65,.12,300,70);
      chirp(90,47,.48,.09,.07);
      noiseHit(.13,.055,1900,210,.28);
    }
  }
  if(!quiet&&!sea&&!lava&&t>birdAt&&player.x<2430){
    birdAt=t+3+Math.random()*6;
    chirp(1900,2900,.09,0,.024);
    chirp(2850,2050,.13,.15,.021);
  }
}

const particles=[];
function scatter(x,y,count,colors,speed=65){
  for(let i=0;i<count;i++){
    const angle=Math.random()*Math.PI*2;
    const force=speed*(.2+Math.random()*.8);
    const life=.3+Math.random()*.85;
    particles.push({
      x,y,vx:Math.cos(angle)*force,vy:Math.sin(angle)*force-speed*.45,
      life, duration:life, size:.5+Math.floor(Math.random()*5)*.5,
      color:colors[i%colors.length]
    });
  }
  if(particles.length>480)particles.splice(0,particles.length-480);
}

function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.life-=dt;
    if(p.life<=0){particles.splice(i,1);continue;}
    p.x+=p.vx*dt;
    p.y+=p.vy*dt;
    p.vy+=125*dt;
  }
}

function drawEffects(){
  const inWorld=mode==='play'||mode==='talk'||mode==='coronation'||mode==='end'||(mode==='quiz'&&activeQuiz?.final);
  const offset=inWorld?cam:0;
  const waterfall=inWorld?2317-cam:696;
  if(waterfall>-60&&waterfall<W+60){
    for(let i=0;i<84;i++){
      const phase=(t*(.65+i%7*.07)+i*.618)%1;
      const spread=12+phase*69;
      const x=waterfall+Math.sin(i*8.79)*spread;
      const y=(inWorld?449:519)-Math.sin(phase*Math.PI)*(8+i%31);
      ctx.globalAlpha=(1-phase)*.58;
      rect(x,y,.5+i%4*.5,.5+i%3*.5,'#d5f7e0');
    }
  }
  if(mode==='burst'&&burst>1.5&&burst<2.35){
    const age=(burst-1.5)/.85;
    ctx.globalAlpha=(1-age)*.65;
    for(let i=0;i<90;i++){
      const angle=i*Math.PI*2/90;
      const radius=13+age*155;
      rect(478+Math.cos(angle)*radius,383+Math.sin(angle)*radius*.61,1.5,1,'#fff1b5');
    }
  }
  for(const p of particles){
    ctx.globalAlpha=Math.min(1,p.life/p.duration*1.7);
    rect(p.x-offset,p.y,p.size,p.size,p.color);
  }
  ctx.globalAlpha=1;
}
function frame(now){const dt=Math.min(.032,(now-last)/1000||.016);last=now;if(!paused)t+=dt;update(dt);ctx.setTransform(PIXEL_SCALE,0,0,PIXEL_SCALE,0,0);ctx.imageSmoothingEnabled=false;if(['cover','story','burst'].includes(mode)||(mode==='quiz'&&!activeQuiz?.final))drawCover();else if(chapter===2)drawChapterTwo();else if(chapter===3)drawChapterThree();else drawWorld();if(chapter===1)drawEffects();drawDamageNumbers();if(t>toastUntil)$('toast').textContent='';requestAnimationFrame(frame);}requestAnimationFrame(frame);

let stamina=100, flightTrialDone=false, ambienceAt=0;
let chapter=1, region='cave', energy=0, learned=false, transformedUntil=0, voyageTime=0, dockWait=0;
const secondRoutes={
  cave:[
    {x:-70,y:432,w:690},{x:650,y:425,w:145},{x:835,y:389,w:140},
    {x:1015,y:422,w:150},{x:1205,y:385,w:135},{x:1380,y:432,w:410}
  ],
  shore:[
    {x:-80,y:442,w:450},{x:480,y:411,w:112},{x:650,y:379,w:111,motion:{center:657,range:45,phase:0}},
    {x:850,y:415,w:168},{x:1102,y:386,w:164},{x:1361,y:427,w:153,motion:{center:1361,range:22,phase:1.8}},
    {x:1600,y:400,w:320}
  ]
};
const secondPeaches={
  cave:[[300,394],[704,389],[888,351],[1070,385],[1259,349],[1470,394]],
  shore:[[221,402],[530,375],[56,341],[873,375],[1140,350],[49,390],[1640,363],[1810,363]]
};
const shoreTraps=[
  {x:928,y:415,w:54,offset:0},
  {x:1180,y:386,w:54,offset:1.15}
];
const shoreLifts=secondRoutes.shore.filter(floor=>floor.motion);
let collected=new Set();
let secondDialogueLine=0;

function chapterTwoSave(){
  try{
    localStorage.setItem(SAVE,JSON.stringify({
      chapter:2,phase:region,energy,learned,flightTrialDone,peaches:[...collected],checkpoint,...vitalSave()
    }));
  }catch{}
}
function chapterTwoQuest(title){
  const card=$('quest');
  card.hidden=false;
  $('questTitle').textContent=title;
  card.classList.remove('arrival');
  const stage=$('stage');
  if(stage.clientWidth){
    card.style.setProperty('--quest-x',(stage.clientWidth/2-card.offsetLeft-card.offsetWidth/2)+'px');
    card.style.setProperty('--quest-y',(stage.clientHeight/2-card.offsetTop-card.offsetHeight/2)+'px');
    void card.offsetWidth;
    card.classList.add('arrival');
  }
  $('status').textContent=title;
}
function chapterTwoDialogue(lines,done){
  let index=0;
  function next(){
    if(index===lines.length){done();return;}
    secondDialogueLine=index;
    const [speaker,line]=lines[index++];
    talk(speaker,line,next);
  }
  next();
}
function startChapterTwo(saved){
  reset();
  chapter=2;
  restoreVitals(saved);
  region=saved?.phase==='shore'?'shore':'cave';
  energy=Math.max(0,Math.min(10,saved?.energy||0));
  learned=region==='shore'&&!!saved?.learned;
  flightTrialDone=!!saved?.flightTrialDone;
  collected=new Set(saved?.peaches||[]);
  transformedUntil=0;
  voyageTime=0;
  dockWait=0;
  checkpoint=saved?.checkpoint??90;
  if(region==='shore'&&checkpoint===1550)checkpoint=1640;
  placePlayerOnGround(secondRoutes[region],checkpoint);
  $('cover').hidden=true;
  $('pause').hidden=false;
  $('chapterLabel').textContent='CHAPTER 02 / 漂洋寻仙';
  $('hud').hidden=false;
  $('energy').hidden=false;
  $('spellButton').hidden=!learned;
  $('area').textContent=region==='shore'?'西牛贺洲 · 登岸':'花果山 · 水帘洞';
  $('counts').textContent='';
  $('hint').textContent='仙桃补充元气。学会变化后，可按 F 施法。';
  renderEnergy();
  if(region==='shore'){
    openSecondRoute(learned?'消耗 2 点元气，试一次七十二变':'拜见菩提祖师');
    return;
  }
  if(saved?.checkpoint){
    openSecondRoute('找到海边的帆船');
    return;
  }
  chapterTwoDialogue([
    ['水帘洞 · 一日','美猴王正和群猴玩耍，洞里满是笑声。'],
    ['水帘洞 · 忽然','一只猴子倒下，再也没有醒来。群猴围拢过来，洞中渐渐安静。'],
    ['猴群','我们今日虽快乐，可总有一天也会死。想到这里，大家都慌了。'],
    ['美猴王','可有谁知道，怎样才能不死？'],
    ['老猴','我听说，神仙和佛能够超脱生死。大王若想求个明白，可以出海去访一访。'],
    ['美猴王','那我便渡海去寻师，求个长生之法。']
  ],()=>openSecondRoute('找到海边的帆船'));
}
function openSecondRoute(quest){
  mode='play';
  showHealth();
  $('stamina').hidden=false;renderStamina();
  $('stage').focus?.({preventScroll:true});
  $('touch').hidden=false;
  chapterTwoQuest(quest);
  chapterTwoSave();
}
function renderEnergy(){
  $('energyMeter').value=energy;
  $('energyValue').textContent=energy+'/10';
}
function arriveAcrossSea(){
  region='shore';
  checkpoint=90;
  cam=0;
  placePlayerOnGround(secondRoutes.shore,90);
  chapterTwoSave();
  chapterTwoDialogue([
    ['海上','一叶帆船乘风破浪。美猴王漂过南赡部洲，又渡西海，终于来到西牛贺洲。'],
    ['西牛贺洲','岸边有人指向远山。山中有一处洞府，名为斜月三星洞。']
  ],()=>openSecondRoute('拜见菩提祖师'));
}
function interactChapterTwo(){
  if(region!=='shore'||player.x<1680)return;
  if(learned){toast('按 F 或点击「变化」施法，消耗 2 点元气。');return;}
  chapterTwoDialogue([
    ['菩提祖师','你越海寻来，求的是什么？'],
    ['美猴王','弟子愿拜您为师，学习长生与变化之道。'],
    ['菩提祖师','好。赐你姓孙，法名悟空。今日先试一试七十二变。']
  ],()=>{
    learned=true;
    checkpoint=1640;
    $('spellButton').hidden=false;
    openSecondRoute('拾桃补充元气，按 F 施展七十二变');
  });
}
function castTransform(){
  if(chapter<2||mode!=='play'||paused||slamActive||!learned||t<transformedUntil)return;
  if(energy<2){toast('元气不足。沿路拾两颗仙桃再来试。');return;}
  energy-=2;
  renderEnergy();
  transformedUntil=t+10;
  $('flightDown').hidden=false;
  $('hint').textContent='方向键自由飞行。触屏可用左右键、跳跃键上升、▼ 下降。';
  player.vy=-160;
  player.ground=false;
  scatter(player.x+12,player.y+15,42,['#fff0af','#efb767','#c4e3ac'],115);
  chirp(370,720,.35,0,.09,'triangle');
  if(chapter===2)chapterTwoSave();else saveChapterThree();
  toast('七十二变 · 化作飞鹤');
}
function updateChapterTwo(dt){
  if(mode==='voyage'){
    voyageTime+=dt;
    if(voyageTime>=4)arriveAcrossSea();
    return;
  }
  if(mode!=='play')return;
  const p=player;
  const route=secondRoutes[region];
  if(region==='shore')moveShoreLifts();
  if(updateFlight(dt,route))return;
  updateRun(dt);
  moveOnPlatforms(route,dt);
  if(p.y>590){fallAndRespawn(route);if(mode!=='play')return;}
  if(region==='shore'){
    checkShoreTraps(route);
    if(mode!=='play')return;
    if(p.ground&&p.x>1640&&checkpoint<1600){checkpoint=1640;chapterTwoSave();}
  }else if(p.ground&&p.x>1430&&p.x<1510&&checkpoint<1430){
    checkpoint=1440;
    chapterTwoSave();
  }
  secondPeaches[region].forEach(([baseX,y],i)=>{
    const lift=region==='shore'&&(i===2?shoreLifts[0]:i===5?shoreLifts[1]:null);
    const x=lift?lift.x+baseX:baseX;
    const id=region+i;
    const touchesPeach=p.x+p.w+7>=x-7&&p.x-7<=x+7&&p.y+p.h+8>=y-10&&p.y-8<=y+7;
    if(collected.has(id)||!touchesPeach)return;
    collected.add(id);
    healFromPeach();
    energy=Math.min(10,energy+1);
    renderEnergy();
    scatter(x,y,26,['#ffd39a','#f1a785','#f9edbd'],90);
    tone(740,.09);
    chapterTwoSave();
  });
  cam+=(Math.max(0,Math.min(1010,p.x-320))-cam)*Math.min(1,dt*7);
  $('area').textContent=region==='shore'?'西牛贺洲 · 灵台方寸山':p.x<600?'花果山 · 水帘洞':'花果山 · 出海山道';
  if(region==='cave'&&p.x>1580&&p.ground){
    dockWait+=dt;
    if(dockWait<dt*2)toast('登船准备中，稍候片刻。');
    if(dockWait>=1.25){
      mode='voyage';
      $('touch').hidden=true;
      $('quest').hidden=true;
      $('status').textContent='渡海寻仙';
    }
  }else if(dockWait){
    dockWait=0;
  }
}
function moveShoreLifts(){
  for(const lift of shoreLifts){
    const previous=lift.x;
    const {center,range,phase}=lift.motion;
    lift.x=center+Math.sin(t*1.2+phase)*range;
    if(player.ground&&player.y+player.h===lift.y&&player.x+player.w>previous&&player.x<previous+lift.w){
      player.x+=lift.x-previous;
    }
  }
}
function trapPhase(trap){return (t+trap.offset)%3.1;}
function checkShoreTraps(route){
  if(t<immuneUntil)return;
  for(const trap of shoreTraps){
    if(trapPhase(trap)<1.8||player.x+player.w<=trap.x||player.x>=trap.x+trap.w)continue;
    if(player.y+player.h<trap.y-13||player.y>=trap.y)continue;
    hurtPlayer(15,true);
    immuneUntil=t+.95;
    player.vy=-235;
    player.ground=false;
    noiseHit(.13,.18,1300,120);
    if(health===0)loseLife(route);else saveCurrentCheckpoint();
    break;
  }
}
function drawShoreTraps(camera){
  for(const trap of shoreTraps){
    const phase=trapPhase(trap);
    const height=phase>=1.8?15:3;
    const color=phase>=1.8?'#ead8aa':phase>=1.22?'#e5a65e':'#83947a';
    for(let x=trap.x;x<trap.x+trap.w;x+=9){
      poly([[x-camera,trap.y],[x+4-camera,trap.y-height],[x+8-camera,trap.y]],color);
    }
  }
}
function renderStamina(){
  const shown=Math.floor(stamina);
  $('staminaMeter').value=shown;
  $('staminaValue').textContent=shown+'/100';
}
function updateRun(dt){
  const right=keys.has('ArrowRight')||keys.has('KeyD');
  const left=keys.has('ArrowLeft')||(chapter!==3&&keys.has('KeyA'));
  const direction=Number(right)-Number(left);
  const sprint=direction!==0&&keys.has('KeyZ')&&stamina>=27*dt;
  stamina=Math.max(0,Math.min(100,stamina+(sprint?-27:(!direction||!keys.has('KeyZ')?19:0))*dt));
  player.vx=direction*(sprint?326:205);
  if(direction)player.face=direction;
  renderStamina();
}
function updateFlight(dt,route){
  if(!transformedUntil)return false;
  if(t>=transformedUntil){
    transformedUntil=0;
    $('flightDown').hidden=true;
    $('counts').textContent=chapter===3&&hasStaff?'如意金箍棒':'';
    $('hint').textContent='F 施展七十二变，长按 Z 加速跑。';
    if(chapter===2&&!flightTrialDone){
      flightTrialDone=true;
      finishChapterTwo();
      return true;
    }
    return false;
  }
  const direction=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||(chapter!==3&&keys.has('KeyA')));
  if(direction)player.face=direction;
  const climb=keys.has('ArrowUp')||keys.has('KeyW')||keys.has('Space');
  const descend=keys.has('ArrowDown')||keys.has('KeyS');
  player.x=Math.max(0,Math.min(route.at(-1).x+route.at(-1).w-24,player.x+direction*225*dt));
  player.y=Math.max(62,Math.min(350,player.y+(Number(descend)-Number(climb))*145*dt));
  cam+=(Math.max(0,Math.min(route.at(-1).x+route.at(-1).w-W,player.x-315))-cam)*Math.min(1,dt*7);
  $('counts').textContent='飞行 '+Math.ceil(transformedUntil-t)+' 秒';
  return true;
}
function moveOnPlatforms(route,dt,limit=Infinity){
  const p=player;
    const oldBottom=p.y+p.h;
    const onGround=p.ground;
    p.x=Math.max(0,Math.min(Math.min(limit,route.at(-1).x+route.at(-1).w-24),p.x+p.vx*dt));
    p.vy+=1170*dt;
    p.y+=p.vy*dt;
    p.ground=false;
    for(const floor of route){
      if(p.x+p.w>floor.x&&p.x<floor.x+floor.w&&oldBottom<=floor.y+3&&p.y+p.h>=floor.y&&p.vy>=0){
        p.y=floor.y-p.h;
        p.vy=0;
        p.ground=true;
        break;
      }
    }
    if(p.ground&&p.vx&&t>=stepAt){stepAt=t+.26;footstep();}
    if(!onGround&&p.ground)footstep(true);
    applyJumpRequest();
}
function finishChapterTwo(){
  mode='end';
  $('health').hidden=true;
  $('stamina').hidden=true;
  $('quest').hidden=true;
  $('touch').hidden=true;
  $('pause').hidden=true;
  $('ending').hidden=false;
  $('ending').innerHTML='<span class="eyebrow">CHAPTER COMPLETE</span><h2>孙 悟 空</h2><div class="cn-title">第二关完成 · 拜师学艺</div><p>习得七十二变</p><button class="primary" id="nextThird">第三关 · 龙宫取宝 →</button><button class="subtle" id="freeSecond">继续练习七十二变</button><button class="subtle" id="replaySecond">再游第二关 ↻</button><button class="subtle" id="replayFirst">返回第一关</button>';
  $('nextThird').onclick=()=>startChapterThree();
  $('freeSecond').onclick=()=>{ $('ending').hidden=true;$('pause').hidden=false;openSecondRoute('继续修炼 · F 施展七十二变'); };
  $('replaySecond').onclick=()=>startChapterTwo();
  $('replayFirst').onclick=start;
  $('status').textContent='第二关完成 · 习得七十二变';
  saveChapterThree({scene:'mountain',intro:true,thirdPeaches:[],health:100,maxHealth:100,lives:3});
}
function drawSailboat(x,y){
  poly([[x-57,y],[x+60,y],[x+42,y+17],[x-38,y+17]],'#754b35');
  rect(x-48,y,98,5,'#c18d59');
  rect(x-2,y-91,5,94,'#613f30');
  poly([[x+4,y-86],[x+4,y-11],[x+54,y-15]],'#f2deb0');
  poly([[x-7,y-66],[x-7,y-12],[x-40,y-16]],'#bb895e');
}
function drawChapterTwo(){
  drawBackground();
  const sailing=mode==='voyage';
  const c=sailing?0:cam;
  rect(0,456,W,84,'#346d68');
  for(let i=0;i<28;i++){
    const y=464+i%6*13;
    rect((i*91+t*19)%1040-40,y,28+i%5*8,2,'#a6cab181');
  }
  if(sailing){
    const x=145+voyageTime*155;
    const y=451+Math.sin(t*3)*4;
    drawSailboat(x,y);
    monkey(x-25,y-35,1,false,.85);
    for(let i=0;i<17;i++)rect(x-63-i*6,y+9+i%3*4,4,1,'#c0e8d0');
    return;
  }
  if(region==='cave'){
    rect(-c,0,595,110,'#173a34');
    rect(-c,110,82,322,'#1e483b');
    for(let i=0;i<8;i++)poly([[i*78-c,100],[i*78+23-c,151+i%3*17],[i*78+51-c,100]],'#173a34');
    rect(571-c,125,27,239,'#718d70');
    rect(551-c,113,65,19,'#8ea181');
    if(mode==='talk'){
      rect(568-c,235,63,197,'#506b55');
      rect(573-c,242,6,184,'#71866a');
      rect(624-c,242,5,184,'#304d40');
    }else{
      rect(615-c,350,3,65,'#b6d3a67a');
    }
    for(let i=0;i<3;i++){
      const x=155+i*58-c;
      if(i===1&&mode==='talk'&&secondDialogueLine>0){
        ctx.save();
        ctx.translate(x-15,420);
        ctx.rotate(-Math.PI/2);
        monkey(0,0,1,false,.78);
        ctx.restore();
      }else{
        monkey(x,396,i%2?-1:1,mode==='talk'&&i!==1,.78);
      }
    }
    rect(342-c,396,68,9,'#84947a');
    rect(351-c,405,9,27,'#657960');
    rect(392-c,405,9,27,'#657960');
    drawSailboat(1728-c,450+Math.sin(t*3)*2);
  }else{
    const shrine=1770-c;
    rect(shrine-56,269,132,131,'#485a46');
    poly([[shrine-83,271],[shrine+10,214],[shrine+100,271]],'#244b40');
    rect(shrine-65,268,152,8,'#a0a477');
    rect(shrine-18,316,55,84,'#203c33');
    rect(shrine-23,306,65,11,'#b0a876');
    rect(shrine+56,283,5,38,'#917d52');
    rect(shrine+49,310,19,21,'#e5b56b');
    const master=1730-c;
    rect(master-8,377,19,23,'#a3a57e');
    rect(master-6,365,15,13,'#e3cba0');
    rect(master-8,362,18,5,'#e8d9b2');
    rect(master,374,7,13,'#dbd3b3');
  }
  for(const floor of secondRoutes[region]){
    const x=floor.x-c;
    rect(x,floor.y,floor.w,110,'#354d3c');
    rect(x,floor.y,floor.w,7,floor.motion?'#ddb771':'#8c9e6b');
    if(floor.motion){
      rect(x+10,floor.y+14,floor.w-20,4,'#b58e55');
      for(let i=0;i<4;i++)rect(x+18+i*23,floor.y+20,5,5,'#d6af70');
    }
    for(let i=8;i<floor.w;i+=24)rect(x+i,floor.y+17+i%13,9,3,'#607451');
  }
  if(region==='shore')drawShoreTraps(c);
  secondPeaches[region].forEach(([baseX,y],i)=>{
    const lift=region==='shore'&&(i===2?shoreLifts[0]:i===5?shoreLifts[1]:null);
    const x=lift?lift.x+baseX:baseX;
    if(!collected.has(region+i))peach(x-c,y);
  });
  if(t<transformedUntil){
    drawCrane(player.x+12-c,player.y+15,player.face);
  }else{
    monkey(player.x+12-c,player.y+1,player.face,player.ground&&!!player.vx);
  }
  for(const p of particles){
    ctx.globalAlpha=Math.min(1,p.life/p.duration*1.7);
    rect(p.x-c,p.y,p.size,p.size,p.color);
  }
  ctx.globalAlpha=1;
  if(mode==='play'&&region==='shore'&&player.x>1640){
    ctx.fillStyle='#fff0c5';
    ctx.font='14px sans-serif';
    ctx.fillText(learned?'[ F ] 七十二变':'[ E ] 拜见菩提祖师',1680-c,318);
  }
}

function drawCrane(x,y,face){
  ctx.save();
  ctx.translate(Math.round(x),Math.round(y));
  ctx.scale(face,1);
  const wing=Math.round(Math.sin(t*14)*15);
  poly([[-10,-3],[-23,-8],[-19,1],[-10,5],[5,4],[12,0],[9,-4]],'#f5eed8');
  poly([[-12,0],[-24,3],[-28,4],[-29,2],[-15,-3]],'#867866');
  poly([[4,-2],[12,-7],[18,-9],[23,-7],[23,-4],[16,-4],[9,2]],'#fff9e7');
  rect(19,-10,4,2,'#b74d37');
  rect(22,-7,1,1,'#243832');
  poly([[23,-7],[32,-6],[23,-4]],'#b49255');
  poly([[-9,1],[-15,wing-12],[-22,wing-16],[-18,wing-6],[-5,wing+3],[4,1]],'#fff9e7');
  poly([[-15,wing-12],[-22,wing-16],[-21,wing-9],[-16,wing-4],[-13,wing-5]],'#344448');
  rect(-19,5,9,1,'#aa8b5a');
  rect(-23,6,8,1,'#aa8b5a');
  ctx.restore();
}

const thirdRoutes={
  mountain:[
    {x:-90,y:434,w:680},{x:630,y:404,w:185},{x:855,y:434,w:153},
    {x:1008,y:454,w:207},{x:1215,y:434,w:635}
  ],
  palace:[
    {x:-80,y:441,w:440},{x:398,y:403,w:165},{x:603,y:373,w:174},
    {x:820,y:417,w:202},{x:1062,y:395,w:185},{x:1282,y:431,w:570}
  ],
  underworld:[
    {x:-80,y:440,w:415},{x:371,y:408,w:155},{x:566,y:381,w:190},
    {x:794,y:427,w:205},{x:1040,y:390,w:178},{x:1260,y:430,w:590}
  ]
};
const royalHalls={
  palace:{door:694,throne:965,floor:373,inside:[{x:640,y:430,w:1212}],name:'水晶宫'},
  underworld:{door:1355,throne:1640,floor:430,inside:[{x:1300,y:430,w:550}],name:'森罗殿'}
};
let hallEntered=false;
let thirdScene='mountain', hasStaff=false, namesCleared=false, trained=false, dragonSpoken=false, returnedFromUnderworld=false;
const SLAM_WINDUP=.36;
let slamActive=false, slamImpact=null, slamStartY=0;
let health=100, maxHealth=100, lives=3, immuneUntil=0, combo=0, swingAt=-Infinity, swingFacing=1;
let bookPage=0, demons=[];
const damageNumbers=[];
let thirdPeachesTaken=new Set();
const thirdPeaches={mountain:[[470,398],[920,398]],palace:[[476,369],[1120,359],[1495,397]],underworld:[[456,374],[888,391],[1330,395]]};
const staffDamage=[7,10,12];
const monkeyNames=['孙悟空','通背猿猴','赤尻马猴','山中猕猴'];
const deathBook=[
  ['羽族名册',['白鹭','山雀','苍鹰']],
  ['走兽名册',['山鹿','白狐','野兔']],
  ['猴属名册',monkeyNames],
  ['水族名册',['鲤鱼','河蟹','青虾']]
];

function saveChapterThree(state){
  try{
    localStorage.setItem(SAVE,JSON.stringify({
      chapter:3,scene:thirdScene,hallEntered,hasStaff,energy,thirdPeaches:[...thirdPeachesTaken],trained,dragonSpoken,namesCleared,returnedFromUnderworld,checkpoint,...vitalSave(),...state
    }));
  }catch{}
}
function resetDemons(){
  const spawns=thirdScene==='palace'&&hasStaff?[
    {x:637,min:616,max:670,y:373,dir:1,kind:'shrimp'},
    {x:521,min:477,max:553,y:403,dir:1,kind:'crab'},
    {x:447,min:407,max:478,y:403,dir:1,kind:'shrimp'},
    {x:308,min:263,max:346,y:441,dir:1,kind:'crab'},
    {x:237,min:189,max:273,y:441,dir:1,kind:'shrimp'},
    {x:162,min:117,max:204,y:441,dir:1,kind:'crab'}
  ]:[
    {x:861,min:822,max:985,y:427,dir:1,kind:'ghost'},
    {x:1120,min:1060,max:1192,y:390,dir:-1,kind:'ghost'},
    {x:1375,min:1285,max:1455,y:430,dir:1,kind:'pig'}
  ];
  const stats={
    ghost:{hp:20,damage:20,speed:102,windup:.32,recovery:.95,reach:37},
    pig:{hp:36,damage:28,speed:132,windup:.25,recovery:.72,reach:37},
    shrimp:{hp:30,damage:20,speed:121,windup:.38,recovery:.85,reach:78},
    crab:{hp:40,damage:30,speed:81,windup:.63,recovery:1.42,reach:46}
  };
  demons=spawns.map(demon=>{
    const spec=stats[demon.kind];
    return {...demon,...spec,maxHp:spec.hp,strikeAt:0,readyAt:0,vy:0,ground:true,aggro:false,landing:null};
  });
}
function startChapterThree(saved){
  const previousEnergy=chapter===2?energy:0;
  reset();
  chapter=3;
  learned=true;
  energy=Math.max(0,Math.min(10,saved?.energy??previousEnergy));
  thirdPeachesTaken=new Set(saved?.thirdPeaches||[]);
  transformedUntil=0;
  renderEnergy();
  thirdScene=saved?.intro?'mountain':(saved?.scene??'mountain');
  if(!thirdRoutes[thirdScene])thirdScene='mountain';
  hasStaff=!saved?.intro&&(thirdScene==='underworld'||!!saved?.hasStaff);
  trained=!!saved?.trained;
  dragonSpoken=!!saved?.dragonSpoken||hasStaff;
  returnedFromUnderworld=thirdScene==='mountain'&&!saved?.intro&&!!saved?.returnedFromUnderworld;
  namesCleared=(thirdScene==='underworld'||returnedFromUnderworld)&&!!saved?.namesCleared;
  const hall=royalHalls[thirdScene];
  const savedX=saved?.intro?90:(saved?.checkpoint??90);
  hallEntered=!!hall&&!saved?.intro&&(
    saved?.hallEntered??(thirdScene==='palace'?dragonSpoken:namesCleared||savedX>=1490)
  );
  checkpoint=hall&&!hallEntered?Math.min(savedX,hall.door-24):savedX;
  restoreVitals(saved,hasStaff?150:100);
  immuneUntil=0;
  swingAt=-Infinity;
  combo=0;
  bookPage=0;
  resetDemons();
  placePlayerOnGround(currentThirdRoute(),checkpoint);
  $('cover').hidden=true;
  $('hud').hidden=false;
  $('pause').hidden=false;
  $('chapterLabel').textContent='CHAPTER 03 / 龙宫与幽冥';
  $('hint').textContent='← → 移动，空格跳跃，E 互动，取得金箍棒后按 A 攻击，空中按 A 消耗 50 体力砸地。';
  if(saved&&!saved.intro){openThirdRoute();return;}
  chapterTwoDialogue([
    ['水帘洞','悟空学艺归来，见群猴用竹竿木刀练武，便想给它们弄些真兵器。'],
    ['傲来国','他驾风越海，从傲来国的武库取走一批刀枪剑戟，带回花果山。'],
    ['孙悟空','小的们，且随我列阵练练！']
  ],openThirdRoute);
}
function vitalSave(){return {health,maxHealth,lives};}
function restoreVitals(saved,fallbackMax=100){
  maxHealth=saved?.maxHealth??fallbackMax;
  health=Math.min(maxHealth,Math.max(1,saved?.health??maxHealth));
  lives=Math.min(3,Math.max(1,saved?.lives??3));
}
function showHealth(){
  $('health').hidden=false;
  refreshHealth();
}
function refreshHealth(){
  $('healthMeter').max=maxHealth;
  $('healthMeter').value=health;
  $('healthValue').textContent=health+'/'+maxHealth;
  $('livesValue').textContent='命 '+lives+'/3';
}
function saveCurrentCheckpoint(){
  if(chapter===1)save();
  else if(chapter===2)chapterTwoSave();
  else saveChapterThree();
}
function showDamage(x,y,amount,isPlayer=false){
  damageNumbers.push({x,y,amount,isPlayer,at:t});
}
function healFromPeach(){
  const amount=Math.min(20,maxHealth-health);
  health+=amount;
  refreshHealth();
  toast(amount>0?'仙桃 · 生命 +'+amount:'拾取仙桃');
}
function hurtPlayer(amount,combat=false){
  const applied=combat&&maxHealth===150?Math.round(amount*.9):amount;
  health=Math.max(0,health-applied);
  showDamage(player.x+12,player.y-8,applied,true);
  refreshHealth();
}
function respawnPlayer(route){
  placePlayerOnGround(route,checkpoint);
  const maxCam=chapter===1?2540:chapter===2?1010:930;
  cam=Math.max(0,Math.min(maxCam,player.x-315));
  immuneUntil=t+.85;
}
function fallAndRespawn(route){
  respawnPlayer(route);
  hurtPlayer(20);
  if(health===0)loseLife(route);
  else{
    toast('坠落 · 生命 −20');
    saveCurrentCheckpoint();
  }
}
function loseLife(route){
  lives--;
  refreshHealth();
  keys.clear();
  respawnPlayer(route);
  if(lives>0){
    health=maxHealth;
    refreshHealth();
    toast('回到重生点 · 剩余 '+lives+' 条命');
    saveCurrentCheckpoint();
    return;
  }
  mode='gameover';
  $('touch').hidden=true;
  $('ending').hidden=false;
  $('ending').innerHTML='<span class="eyebrow">TRY AGAIN</span><h2>三条命已用完</h2><button id="retryCheckpoint" class="primary">从重生点再试 →</button>';
  $('retryCheckpoint').onclick=()=>{
    lives=3;
    health=maxHealth;
    refreshHealth();
    respawnPlayer(route);
    $('ending').hidden=true;
    $('touch').hidden=false;
    mode='play';
    $('stage').focus?.({preventScroll:true});
    saveCurrentCheckpoint();
  };
}
function drawDamageNumbers(){
  for(let i=damageNumbers.length-1;i>=0;i--){
    const damage=damageNumbers[i];
    const age=t-damage.at;
    if(age>=.85){damageNumbers.splice(i,1);continue;}
    ctx.globalAlpha=1-age/.85;
    ctx.font='bold 16px system-ui';
    ctx.fillStyle=damage.isPlayer?'#ff9b87':'#ffe29a';
    ctx.fillText('−'+damage.amount,damage.x-cam-10,damage.y-age*34);
  }
  ctx.globalAlpha=1;
}
function openThirdRoute(){
  mode='play';
  $('stage').focus?.({preventScroll:true});
  $('touch').hidden=false;
  $('staffButton').hidden=!hasStaff;
  $('spellButton').hidden=false;
  $('energy').hidden=false;
  $('stamina').hidden=false;
  renderStamina();
  showHealth();
  $('area').textContent={mountain:'花果山 · 水帘洞',palace:'东海 · 水晶宫',underworld:'幽冥 · 森罗殿'}[thirdScene];
  $('counts').textContent=hasStaff?'如意金箍棒':'';
  refreshHealth();
  const quest=thirdScene==='mountain'
    ? returnedFromUnderworld?'从桥边走回猴群，告诉它们幽冥的事':trained?'走到水帘洞拱桥下的小河，潜入东海':'找到猴群，带它们操练兵器'
    : thirdScene==='palace'
      ? hasStaff?(hallEntered?'往左走，按 E 离开水晶宫':'击退宫外的虾兵蟹将，返回花果山'):dragonSpoken?'前往海藏，取定海神针':'走近龙王的宝座'
      : namesCleared?(hallEntered?'往左走，按 E 离开森罗殿':'原路返回幽冥入口，回花果山'):'穿过幽冥，去阎王宝座前';
  const hall=royalHalls[thirdScene];
  chapterTwoQuest(hall&&awaitingHallEntry()?'走到'+hall.name+'门前，按 E 入殿':quest);
  saveChapterThree();
}
function switchThirdScene(scene,x=90){
  thirdScene=scene;
  hallEntered=false;
  checkpoint=x;
  cam=Math.max(0,Math.min(930,x-315));
  placePlayerOnGround(thirdRoutes[scene],x);
}
function returnFromPalace(){
  switchThirdScene('mountain');
  chapterTwoDialogue([
    ['花果山 · 操练场','悟空穿着龙宫披挂回到花果山。众猴围上来，他把金箍棒一展，又收回手中。'],
    ['花果山 · 夜','群猴设宴庆贺。酒过数巡，悟空在松阴下睡去。'],
    ['幽冥界','两名勾魂使拿着写有孙悟空姓名的文书，把他的魂魄带到幽冥。'],
    ['孙悟空','我已习得长生之法。这生死簿，我倒要亲自看一看。']
  ],()=>{
    switchThirdScene('underworld');
    resetDemons();
    openThirdRoute();
  });
}
function meetDragon(){
  chirp(138,196,.58,0,.06,'triangle');
  chapterTwoDialogue([
    ['东海龙王','上仙到水晶宫来，有何贵干？'],
    ['孙悟空','我来借一件称手的兵器。你先前拿来的刀枪画戟，分量都太轻。'],
    ['东海龙王','海藏里有一根定海神铁。你沿殿向右走，若能拿得动，便试试它。']
  ],()=>{dragonSpoken=true;checkpoint=850;openThirdRoute();});
}
function interactChapterThree(){
  if(t<transformedUntil){toast('恢复原形后即可互动。');return;}
  if(thirdScene==='mountain'){
    if(returnedFromUnderworld){
      if(player.x>=235&&player.x<=490){
        chapterTwoDialogue([
          ['猴群','大王回来了！方才你在松阴下睡得好沉。'],
          ['孙悟空','我到了幽冥，把咱们猴属的名字从生死簿上划去了。'],
          ['水帘洞','群猴听罢齐声欢呼。龙宫与冥司也各自上表，奏闻天庭。']
        ],finishChapterThree);
      }else toast($('questTitle').textContent);
      return;
    }
    if(!trained&&player.x>=235&&player.x<=490){
      chapterTwoDialogue([
        ['猴群','列阵！举刀！换长枪！'],
        ['孙悟空','这些凡间兵器给孩儿们练手还行，我一用力就觉得太轻，根本不趁手。'],
        ['老猴','洞中小拱桥下的河水通着东海。大王何不去龙宫求一件宝物？']
      ],()=>{trained=true;openThirdRoute();});
    }else if(!returnedFromUnderworld&&trained&&player.x>=1010&&player.x<=1192&&player.ground&&player.y+player.h===454){
      switchThirdScene('palace');
      openThirdRoute();
    }else toast($('questTitle').textContent);
    return;
  }
  const hall=royalHalls[thirdScene];
  if(hall&&awaitingHallEntry()){
    if(atRoyalDoor(hall)){
      hallEntered=true;
      checkpoint=hall.door;
      placePlayerOnGround(currentThirdRoute(),checkpoint);
      noiseHit(.25,.10,620,170);
      openThirdRoute();
    }else toast($('questTitle').textContent);
    return;
  }
  if(hallEntered&&(hasStaff&&thirdScene==='palace'||namesCleared)&&player.ground&&player.x<=hall.door+30){
    hallEntered=false;
    checkpoint=hall.door-24;
    placePlayerOnGround(currentThirdRoute(),checkpoint);
    if(thirdScene==='palace')resetDemons();
    openThirdRoute();
    return;
  }
  if(thirdScene==='palace'){
    if(!dragonSpoken&&atRoyalThrone(hall)){meetDragon();return;}
    if(hasStaff&&!hallEntered&&player.x<180){
      if(demons.some(demon=>demon.hp>0)){toast('先击退龙宫追兵，再返回花果山。');return;}
      returnFromPalace();return;
    }
    if(hallEntered&&dragonSpoken&&!hasStaff&&player.x>=1550){
      chapterTwoDialogue([
        ['海藏','金纹从巨柱上亮起，照亮了殿底。铁柱上刻着「如意金箍棒」。'],
        ['孙悟空','再细些！再短些！'],
        ['海藏','神铁应声缩小，落入悟空掌中。龙王们又送来一身披挂。']
      ],()=>{
        hasStaff=true;
        maxHealth=150;
        health=150;
        checkpoint=1480;
        scatter(player.x+12,player.y,68,['#fff2ab','#d6a654','#f2c778'],145);
        tone(587,.24);
        openThirdRoute();
      });
    }else toast($('questTitle').textContent);
    return;
  }
  if(!namesCleared&&atRoyalThrone(hall)){
    meetUnderworldKing();
    return;
  }
  if(namesCleared&&!hallEntered&&player.x<=155){
    returnedFromUnderworld=true;
    switchThirdScene('mountain',1260);
    talk('花果山 · 梦醒','悟空在水帘洞的桥边醒来。猴群还在洞中等着他。',openThirdRoute);
    return;
  }
  toast($('questTitle').textContent);
}
function meetUnderworldKing(){
  chirp(98,59,.65,0,.085,'triangle');
    chapterTwoDialogue([
      ['阎王','你既有长生之法，且待我查一查名册。'],
      ['孙悟空','把生死簿拿来。我自己翻。']
    ],openDeathBook);
}
function openDeathBook(){
  mode='book';
  keys.clear();
  $('touch').hidden=true;
  $('dialog').hidden=false;
  bookPage=0;
  renderDeathBook();
}
function flipBook(direction){
  if(mode!=='book'||paused)return;
  bookPage=Math.max(0,Math.min(deathBook.length-1,bookPage+direction));
  renderDeathBook();
}
function renderDeathBook(){
  const [title,names]=deathBook[bookPage];
  const correctPage=bookPage===2;
  $('dialog').innerHTML=`<div class="speaker">生死簿 · 第 ${bookPage+1} / ${deathBook.length} 页</div>
    <div id="bookPage"><b>${title}</b><div class="${namesCleared&&correctPage?'crossed':''}">${names.join('　')}</div></div>
    <div id="bookActions"><button id="bookPrev" ${bookPage===0?'disabled':''}>← 上一页</button>
    <button id="bookNext" ${bookPage===deathBook.length-1?'disabled':''}>下一页 →</button>
    <button id="bookCross" ${correctPage&&!namesCleared?'':'disabled'}>划掉这一页姓名</button>
    <button id="bookClose" ${namesCleared?'':'disabled'}>合上生死簿</button></div>`;
  $('bookPrev').onclick=()=>flipBook(-1);
  $('bookNext').onclick=()=>flipBook(1);
  $('bookCross').onclick=()=>{
    if(paused||bookPage!==2||namesCleared)return;
    namesCleared=true;
    noiseHit(.21,.08,3100,690);
    checkpoint=1440;
    saveChapterThree();
    tone(392,.2);
    renderDeathBook();
  };
  $('bookClose').onclick=()=>{
    if(paused||!namesCleared)return;
    $('dialog').hidden=true;
    openThirdRoute();
  };
}
function swingStaff(){
  if(chapter!==3||mode!=='play'||paused||!hasStaff||t<transformedUntil||slamActive||t-swingAt<.40)return;
  if(!player.ground){
    if(stamina<50){toast('空中砸击需要 50 点体力。');return;}
    stamina-=50;
    renderStamina();
    slamActive=true;
    slamStartY=player.y;
    combo=0;
    swingAt=t;
    swingFacing=player.face;
    jumpRequestedUntil=-1;
    player.vy=0;
    noiseHit(.31,.12,940,1700);
    return;
  }
  combo=t-swingAt<1.02?combo%3+1:1;
  swingAt=t;
  swingFacing=player.face;
  const damage=staffDamage[combo-1];
  noiseHit(.24,.19+combo*.04,4300,270);
  noiseHit(.16,.10,850,140,.025);
  if(combo===3){
    player.vy=-250;
    player.ground=false;
  }
  for(const demon of demons){
    const ahead=(demon.x-(player.x+12))*swingFacing;
    if(!thirdCombatActive()||demon.hp<=0||ahead< -14||ahead>83+combo*8||Math.abs(demon.y-player.y-34)>44)continue;
    hitEnemy(demon,damage);
  }
}
function hitEnemy(demon,damage){
  demon.hp=Math.max(0,demon.hp-damage);
  showDamage(demon.x,demon.y-48,damage);
  demon.aggro=true;
  demon.dir=Math.sign(player.x+12-demon.x)||demon.dir;
  demon.strikeAt=0;
  demon.readyAt=t+.34;
  scatter(demon.x,demon.y-18,15+combo*4,['#f6c575','#fcdfae','#aa6975'],85);
  noiseHit(.17,.32,1300,85);
  chirp(120,56,.13,0,.13,'triangle');
}
function landStaffSlam(){
  slamActive=false;
  swingAt=t;
  slamImpact={x:player.x+12,y:player.y+player.h,at:t};
  scatter(slamImpact.x,slamImpact.y-3,74,['#fff0b0','#e7aa65','#9a7657'],165);
  noiseHit(.38,.48,720,45);
  noiseHit(.13,.29,3400,360,.025);
  chirp(92,38,.27,0,.20);
  if(thirdCombatActive()){
    for(const demon of demons){
      if(demon.hp>0&&Math.abs(demon.x-slamImpact.x)<=94&&Math.abs(demon.y-slamImpact.y)<=37)hitEnemy(demon,30);
    }
  }
}
function thirdCombatActive(){
  return !hallEntered&&((thirdScene==='underworld'&&!namesCleared)||(thirdScene==='palace'&&hasStaff));
}
function updateDemons(dt){
  const route=thirdRoutes[thirdScene];
  for(const demon of demons){
    if(demon.hp<=0)continue;
    const gap=player.x+12-demon.x;
    const sameHeight=Math.abs(player.y+34-demon.y)<36;
    if(Math.abs(gap)<155&&Math.abs(player.y+34-demon.y)<75)demon.aggro=true;
    if(demon.kind==='shrimp'&&demon.strikeAt&&demon.strikeAt-t<=.15){
      const floor=route.find(f=>demon.x>=f.x&&demon.x<f.x+f.w);
      const thrust=Math.max(0,Math.min(320*dt,gap*demon.dir-11));
      if(floor)demon.x=Math.max(floor.x+2,Math.min(floor.x+floor.w-2,demon.x+demon.dir*thrust));
    }
    if(demon.strikeAt&&t>=demon.strikeAt){
      demon.strikeAt=0;
      demon.readyAt=t+demon.recovery;
      if(demon.kind==='shrimp'){
        noiseHit(.12,.16,2700,370);
        scatter(demon.x,demon.y-14,10,['#d7f7dd','#a5d1c0'],75);
      }else if(demon.kind==='crab'){
        noiseHit(.12,.25,3100,540);
        noiseHit(.21,.17,670,105,.035);
      }else{
        noiseHit(.19,.19,1700,220);
        chirp(145,73,.16,0,.07,'triangle');
      }
      const attackGap=(player.x+12-demon.x)*demon.dir;
      if(sameHeight&&attackGap>=-10&&attackGap<demon.reach+11&&t>=immuneUntil){
        hurtPlayer(demon.damage,true);
        immuneUntil=t+.7;
        noiseHit(.2,.22,870,100);
      }
    }
    if(demon.ground&&!demon.strikeAt&&sameHeight&&Math.abs(gap)<demon.reach&&demon.aggro){
      demon.dir=Math.sign(gap)||demon.dir;
      if(t>=demon.readyAt)demon.strikeAt=t+demon.windup;
      continue;
    }
    const index=route.findIndex(f=>demon.x>=f.x&&demon.x<f.x+f.w);
    if(demon.aggro&&demon.ground&&!demon.strikeAt){
      demon.dir=Math.sign(gap)||demon.dir;
      const floor=route[index];
      const next=route[index+demon.dir];
      if(floor){
        const edge=demon.dir>0?floor.x+floor.w:floor.x;
        if(next&&Math.abs(edge-demon.x)<15&&demon.dir*(player.x+12-edge)>0){
          demon.vy=-490;
          demon.ground=false;
          demon.landing=next.x+next.w/2;
        }
      }
    }else if(!demon.aggro&&(demon.x<=demon.min||demon.x>=demon.max)){
      demon.dir=demon.x<=demon.min?1:-1;
    }
    if(!demon.strikeAt){
      const target=demon.landing??(demon.aggro?player.x+12:(demon.dir>0?demon.max:demon.min));
      const distance=target-demon.x;
      demon.x+=Math.sign(distance)*Math.min(Math.abs(distance),(demon.landing!==null?186:demon.aggro?demon.speed:65)*dt);
      if(demon.ground&&index>=0){
        const floor=route[index];
        demon.x=Math.max(floor.x+2,Math.min(floor.x+floor.w-2,demon.x));
      }
    }
    const oldY=demon.y;
    demon.vy+=1170*dt;
    demon.y+=demon.vy*dt;
    demon.ground=false;
    for(const floor of route){
      if(demon.x>=floor.x&&demon.x<floor.x+floor.w&&oldY<=floor.y+3&&demon.y>=floor.y&&demon.vy>=0){
        demon.y=floor.y;
        demon.vy=0;
        demon.ground=true;
        demon.landing=null;
        break;
      }
    }
    if(demon.y>570){demon.x=demon.min+8;demon.y=318;demon.vy=0;demon.landing=null;}
  }
}
function awaitingHallEntry(){
  return !hallEntered&&(thirdScene==='palace'?!hasStaff:thirdScene==='underworld'&&!namesCleared);
}
function currentThirdRoute(){
  return hallEntered?royalHalls[thirdScene].inside:thirdRoutes[thirdScene];
}
function atRoyalDoor(hall){
  return player.ground&&Math.abs(player.x+player.w-hall.door)<=47;
}
function atRoyalThrone(hall){
  return hallEntered&&player.ground&&Math.abs(player.x+12-hall.throne)<=64;
}
function updateChapterThree(dt){
  if(mode!=='play')return;
  const route=currentThirdRoute();
  const hall=royalHalls[thirdScene];
  const doorLimit=hall&&awaitingHallEntry()?hall.door-player.w:Infinity;
  if(updateFlight(dt,route)){
    player.x=Math.max(hallEntered?hall.door-24:0,Math.min(player.x,doorLimit));
    if(thirdScene==='palace'&&!dragonSpoken)player.x=Math.min(player.x,1020);
    if(thirdCombatActive())updateDemons(dt);
    if(health===0){transformedUntil=0;$('flightDown').hidden=true;loseLife(route);}
    return;
  }
  const charging=slamActive&&t-swingAt<SLAM_WINDUP;
  if(charging){
    const progress=Math.max(0,Math.min(1,(t-swingAt)/SLAM_WINDUP));
    player.y=Math.max(0,slamStartY-32*Math.sin(progress*Math.PI/2));
    player.vx=0;
    player.vy=0;
  }else{
    if(slamActive){
      player.vx=swingFacing*65;
      if(player.vy===0){
        player.vy=420;
        noiseHit(.27,.23,3600,310);
      }
    }else updateRun(dt);
    const limit=Math.min(doorLimit,thirdScene==='palace'&&!dragonSpoken?1030:Infinity);
    if(hallEntered&&player.x<=hall.door-24&&player.vx<0)player.vx=0;
    moveOnPlatforms(route,dt,limit);
  }
  if(slamActive&&player.ground)landStaffSlam();
  if(thirdScene==='palace'&&!dragonSpoken&&atRoyalThrone(hall)){meetDragon();return;}
  if(thirdScene==='underworld'&&!namesCleared){
    if(atRoyalThrone(hall)){meetUnderworldKing();return;}
  }
  if(thirdCombatActive())updateDemons(dt);
  thirdPeaches[thirdScene].forEach(([x,y],i)=>{
    const id=thirdScene+i;
    if(hallEntered||thirdPeachesTaken.has(id)||Math.abs(player.x+12-x)>26||Math.abs(player.y+17-y)>37)return;
    thirdPeachesTaken.add(id);
    healFromPeach();
    energy=Math.min(10,energy+1);
    renderEnergy();
    scatter(x,y,24,['#ffd39a','#f1a785','#f9edbd'],85);
    tone(740,.09);
    saveChapterThree();
  });
  if(health===0){loseLife(route);return;}
  if(player.y>590){fallAndRespawn(route);if(mode!=='play')return;}
  if(!hallEntered&&player.ground&&player.x>=1282&&player.x<1400&&checkpoint<1282){
    checkpoint=1305;
    saveChapterThree();
  }
  cam+=(Math.max(0,Math.min(930,player.x-315))-cam)*Math.min(1,dt*7);
}
function finishChapterThree(){
  mode='end';
  $('stamina').hidden=true;$('health').hidden=true;$('energy').hidden=true;
  $('quest').hidden=true;
  $('hud').hidden=true;
  $('touch').hidden=true;
  $('pause').hidden=true;
  $('ending').hidden=false;
  $('ending').innerHTML='<span class="eyebrow">CHAPTER COMPLETE</span><h2>龙宫与幽冥</h2><div class="cn-title">第三关完成 · 九幽除名</div><p>获得如意金箍棒 · 生死簿已除名</p><button class="primary" id="replayThird">再游第三关 ↻</button><p>下一回 · 天庭来诏</p>';
  $('replayThird').onclick=()=>startChapterThree();
  $('status').textContent='第三关完成 · 四海千山皆拱伏';
  tone(523,.24);
}
function drawChapterThree(){
  const sea=thirdScene==='palace';
  const mountainScene=thirdScene==='mountain';
  const c=cam;
  const sky=ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,mountainScene?'#244942':sea?'#102e49':'#211932');
  sky.addColorStop(1,mountainScene?'#9ab695':sea?'#52938f':'#6c424d');
  ctx.fillStyle=sky;
  ctx.fillRect(0,0,W,H);
  for(let i=-1;i<8;i++)mountain(i*265-c*.33,195+i%3*28,340,355,mountainScene?'#3c6b51':sea?'#285461':'#382740');
  for(let i=0;i<40;i++){
    const x=((i*151-c*.24)%W+W)%W;
    const y=455-(i*79+t*(sea?19:10))%440;
    rect(x,y,1+i%3,1+i%3,sea?'#b0edcf88':'#e4aa8580');
  }
  if(!sea&&!mountainScene&&!hallEntered){
    rect(0,478,W,62,'#853b38');
    for(let i=0;i<28;i++){
      const x=(i*77+t*28-c*.2)%1060;
      rect(x,484+i%5*11,16+i%4*9,3,'#ef8654');
    }
  }
  if(mountainScene){
    rect(-c,0,1900,112,'#203b32');
    for(let i=0;i<22;i++){
      const x=i*87-c;
      poly([[x,105],[x+21,144+i%4*15],[x+55,105]],'#203b32');
      rect(x+19,118,4,25+i%3*14,'#496052');
    }
    rect(30-c,180,130,254,'#365749');
    rect(42-c,177,8,257,'#637967');
    rect(148-c,177,8,257,'#516c5a');
    drawThirdThrone(120-c,434,'#5f7461','#9da782');
    drawCaveBridge(c);
  }
  const hall=royalHalls[thirdScene];
  if(hall)drawRoyalHall(hall,c,sea);
  for(const floor of currentThirdRoute()){
    const x=floor.x-c;
    const river=mountainScene&&floor.y===454;
    if(river){
      rect(x,439,floor.w,101,'#326a65');
      for(let i=0;i<18;i++){
        const ripple=(i*31+t*28)%floor.w;
        rect(x+ripple,442+i%6*12,Math.min(22,floor.w-ripple),2,'#8ec9b189');
      }
      continue;
    }
    if(hallEntered){
      rect(0,floor.y,W,110,sea?'#28585a':'#553945');
      rect(0,floor.y,W,5,sea?'#d6c18d':'#b68267');
      for(let i=-1;i<13;i++){
        const tile=i*86-c%86;
        rect(tile,floor.y+15,80,2,sea?'#6c9990':'#8a5c68');
      }
      continue;
    }
    rect(x,floor.y,floor.w,110,mountainScene?'#354c3e':sea?'#294955':'#352735');
    rect(x,floor.y,floor.w,7,mountainScene?'#8b9a72':sea?'#77aaa1':'#a5726c');
    for(let i=12;i<floor.w;i+=26)rect(x+i,floor.y+17+i%14,11,4,mountainScene?'#617359':sea?'#48707a':'#604552');
  }
  if(mountainScene){
    for(let i=0;i<4;i++){
      const x=263+i*43-c;
      monkey(x,402,i%2?-1:1,trained,.8);
      const angle=trained?Math.sin(t*8+i):.4;
      ctx.save();ctx.translate(x+9,415);ctx.rotate(angle);
      rect(0,-22,3,24,'#dac19a');ctx.restore();
    }
  }else if(hallEntered&&sea){
    drawRoyalAudience(hall,c,true);
    if(!hasStaff){
      const shrinking=dragonSpoken&&player.x>=1550&&mode==='talk'&&secondDialogueLine===2;
      ctx.save();
      if(shrinking){ctx.translate(0,431*.66);ctx.scale(1,.34);}
      drawDivineIron(1605-c);
      ctx.restore();
    }
  }else if(hallEntered){
    drawRoyalAudience(hall,c,false);
    rect(1705-c,394,47,36,'#63495a');
    rect(1707-c,383,43,13,namesCleared?'#a99480':'#e7d8ac');
    rect(1728-c,383,2,13,'#806b60');
    if(namesCleared)rect(1710-c,390,35,2,'#a24d49');

  }
  if(hallEntered)drawHallGuards(hall,c,sea);
  else if(sea)drawPalaceGrounds(c);
  if(thirdCombatActive())for(const demon of demons)if(demon.hp>0)drawDemon(demon,c);
  thirdPeaches[thirdScene].forEach(([x,y],i)=>{
    if(!hallEntered&&!thirdPeachesTaken.has(thirdScene+i))peach(x-c,y);
  });
  if(t<transformedUntil){
    drawCrane(player.x+12-c,player.y+15,player.face);
  }else{
    const x=player.x+12-c;
    if(t>=immuneUntil||Math.floor(t*22)%2===0){
      const spinAge=(t-swingAt)/.37;
      if(combo===3&&spinAge<1){
        ctx.save();
        ctx.translate(x,player.y+17);
        ctx.rotate(spinAge*Math.PI*2*swingFacing);
        monkey(0,-17,player.face,false);
        ctx.restore();
      }else{
        const lean=t-swingAt<.24?swingFacing*(combo===2?3:5):0;
        monkey(x+lean,player.y+1,player.face,player.ground&&!!player.vx);
      }
    }
    if(hasStaff)drawStaff(c);
  }
  if(slamImpact&&t-slamImpact.at<.42){
    const phase=(t-slamImpact.at)/.42;
    ctx.globalAlpha=1-phase;
    for(let i=0;i<31;i++){
      const offset=(i-15)*(2+phase*6);
      rect(slamImpact.x-c+offset,slamImpact.y-3-Math.sin(i*.61)*phase*14,5,3,'#ffe1a0');
    }
    ctx.globalAlpha=1;
  }
  for(const p of particles){
    ctx.globalAlpha=Math.min(1,p.life/p.duration*1.7);
    rect(p.x-c,p.y,p.size,p.size,p.color);
  }
  ctx.globalAlpha=1;
  let label='';
  if(mountainScene){
    if(returnedFromUnderworld&&player.x>=235&&player.x<=490)label='与猴群交谈';
    if(!returnedFromUnderworld&&!trained&&player.x>=235&&player.x<=490)label='操练猴群';
    if(!returnedFromUnderworld&&trained&&player.x>=1010&&player.x<=1192&&player.ground&&player.y+player.h===454)label='潜入小河';
  }else if(awaitingHallEntry()){
    if(atRoyalDoor(hall))label='进入'+hall.name;
  }else if(hallEntered&&(sea?hasStaff:namesCleared)&&player.x<=hall.door+30){
    label='离开'+hall.name;
  }else if(sea){
    if(hallEntered&&dragonSpoken&&!hasStaff&&player.x>=1550)label='取定海神针';
    if(hasStaff&&!hallEntered&&player.x<180)label='返回花果山';
  }else{
    if(!namesCleared&&atRoyalThrone(hall))label='拜见阎王';
    if(namesCleared&&!hallEntered&&player.x<=155)label='回花果山';
  }
  if(label&&mode==='play'){
    ctx.fillStyle='#ffe5b3';
    ctx.font='14px sans-serif';
    ctx.fillText('[ E ] '+label,Math.max(12,Math.min(810,player.x-c-25)),295);
  }
}
function drawCaveBridge(camera){
  const left=981-camera;
  for(let i=0;i<25;i++){
    const offset=i*10;
    const rise=Math.sin(i*Math.PI/24);
    const y=Math.round(434-rise*56);
    rect(left+offset,y,11,12,'#87917a');
    rect(left+offset,y,11,3,'#c2c4a5');
    rect(left+offset,y+10,11,2,'#596c5e');
    rect(left+offset,y-16,11,3,'#85967f');
    if(i%3===0)rect(left+offset+4,y-16,3,17,'#a5ae8f');
  }
  rect(left,424,19,14,'#657761');
  rect(left+231,424,19,14,'#657761');
}
function drawRoyalHall(hall,c,sea){
  const door=hall.door-c;
  const floor=hall.floor;
  const trim=sea?'#e3c486':'#d5a26e';
  const wall=sea?'#234a53':'#492d3b';
  const column=sea?'#548b86':'#8e5760';
  if(!hallEntered){
    const left=door-30;
    rect(left,floor-177,450,177,wall);
    poly([[left-42,floor-172],[left+7,floor-207],[left+174,floor-223],
      [left+351,floor-207],[left+487,floor-172]],sea?'#366c6d':'#733b4a');
    rect(left-42,floor-172,529,5,trim);
    rect(left+9,floor-149,65,149,'#142c30');
    rect(left+15,floor-143,52,143,sea?'#2f6262':'#654055');
    rect(left+40,floor-142,3,142,trim);
    rect(left+22,floor-64,4,9,trim);rect(left+56,floor-64,4,9,trim);
    rect(left+2,floor-166,78,17,'#263238');
    ctx.fillStyle=trim;
    ctx.font='bold 12px serif';
    ctx.fillText(hall.name,left+21,floor-154);
    for(let i=0;i<4;i++){
      const x=left+94+i*91;
      rect(x,floor-163,10,163,column);
      rect(x-4,floor-160,18,4,trim);
      rect(x-4,floor-8,18,8,trim);
      rect(x+21,floor-135,41,58,'#172b30');
      for(let bar=0;bar<4;bar++)rect(x+25+bar*9,floor-130,2,48,column);
    }
    return;
  }
  rect(0,0,W,H,wall);
  rect(0,117,W,11,trim);
  rect(0,134,W,5,sea?'#749e8a':'#915c64');
  for(let i=-1;i<11;i++){
    const x=i*110-c%110;
    rect(x,145,14,283,column);
    rect(x-4,147,22,7,trim);
    rect(x-3,410,20,7,trim);
    rect(x+41,139,3,61,trim);
    rect(x+32,196,20,20,sea?'#80bdb0':'#b56f61');
    rect(x+35,200,14,11,'#f2ca8c');
    rect(x+22,239,69,57,sea?'#1e414b':'#382637');
  }
  rect(door-26,293,39,137,'#172d35');
  rect(door-29,286,45,7,trim);
}
function drawHallGuards(hall,c,sea){
  const floor=hall.inside[0].y;
  const offsets=sea?[-164,-108,105,160,216,272]:[-177,-121,96,151];
  for(const offset of offsets){
    const x=hall.throne+offset-c;
    const y=floor-12;
    rect(x-11,y-38,22,10,sea?'#c4906a':'#a08691');
    rect(x-8,y-28,16,10,sea?'#e1af8a':'#bd9a92');
    poly([[x-12,y-18],[x+12,y-18],[x+15,y-3],[x-15,y-3]],sea?'#527f76':'#684e62');
    rect(x-11,y-5,22,3,sea?'#d5a870':'#bc8c72');
    rect(x-8,y-2,5,6,'#333741');rect(x+3,y-2,5,6,'#333741');
    rect(x+17,y-46,2,49,'#c1a77b');
    poly([[x+14,y-44],[x+18,y-55],[x+22,y-44]],'#cfd8ba');
  }
}
function drawPalaceGrounds(c){
  for(const floor of thirdRoutes.palace){
    for(const offset of [30,75,125]){
      if(offset+18>=floor.w)continue;
      const x=floor.x+offset-c;
      const y=floor.y;
      const coral=offset===75?'#b47f70':'#609b8c';
      rect(x-3,y-21,6,21,coral);
      rect(x-10,y-15,11,4,coral);rect(x-11,y-22,4,8,coral);
      rect(x+3,y-11,10,4,coral);rect(x+10,y-17,4,8,coral);
      rect(x-11,y-2,24,2,'#a5baa0');
    }
  }
}
function drawRoyalAudience(hall,c,dragon){
  const x=hall.throne-c;
  const floor=hall.inside[0].y;
  const gold=dragon?'#ead099':'#d49a68';
  rect(x-75,floor-127,150,104,dragon?'#326667':'#643d4c');
  rect(x-75,floor-127,150,3,gold);
  rect(x-62,floor-116,4,86,gold);
  rect(x+58,floor-116,4,86,gold);
  for(let i=0;i<4;i++){
    const y=floor-16+i*4;
    rect(x-45-i*6,y,90+i*12,4,i%2?gold:dragon?'#4c776d':'#78515e');
  }
  ctx.save();
  ctx.translate(x,floor-10);
  ctx.scale(1.38,1.38);
  drawThirdThrone(0,0,dragon?'#4c8679':'#664355',gold);
  drawRoyal(0,-12,dragon);
  ctx.restore();
}
function drawRoyal(x,y,dragon){
  const robe=dragon?'#457d72':'#765266';
  const trim=dragon?'#d9b36d':'#d4a875';
  poly([[x-16,y],[x-13,y-24],[x-7,y-29],[x+8,y-29],[x+16,y-23],[x+20,y]],robe);
  rect(x-15,y-7,33,3,trim);
  rect(x-4,y-27,8,18,dragon?'#79b2a1':'#a47277');
  rect(x-13,y-22,4,12,trim);rect(x+11,y-22,4,12,trim);
  for(let i=0;i<3;i++){
    rect(x-12+i*11,y-13-(i%2)*5,5,2,trim);
    rect(x-10+i*11,y-15-(i%2)*5,1,6,trim);
  }
  rect(x-3,y-17,6,6,trim);
  rect(x-1,y-16,2,4,dragon?'#477d6a':'#8b4651');
  rect(x-9,y-44,19,17,dragon?'#c1aa72':'#d5a98a');
  rect(x-6,y-38,3,2,'#302f3a');rect(x+5,y-38,3,2,'#302f3a');
  if(dragon){
    poly([[x-9,y-46],[x-15,y-56],[x-13,y-63],[x-10,y-53],[x-4,y-47]],trim);
    poly([[x+7,y-46],[x+14,y-55],[x+13,y-63],[x+18,y-56],[x+12,y-45]],trim);
    rect(x-12,y-44,5,7,'#748f70');rect(x+9,y-44,5,7,'#748f70');
    rect(x-6,y-42,4,2,trim);rect(x+4,y-42,5,2,trim);
    rect(x-5,y-34,18,6,'#d5ba80');
    rect(x+8,y-33,2,1,'#77604e');
    rect(x-3,y-28,12,2,'#f1d2a2');
    poly([[x-4,y-30],[x-10,y-17],[x-7,y-15],[x+2,y-28]],'#e8dfc1');
    poly([[x+10,y-30],[x+17,y-17],[x+14,y-15],[x+5,y-28]],'#e8dfc1');
  }else{
    rect(x-15,y-49,30,5,'#392c42');
    rect(x-9,y-54,18,5,'#4d3548');
    rect(x-13,y-48,26,2,trim);
    rect(x-2,y-54,4,5,'#c17a67');
    rect(x-8,y-41,6,2,'#4c3840');rect(x+3,y-41,6,2,'#4c3840');
    for(let i=0;i<5;i++)rect(x-12+i*6,y-45,1,8,trim);
    poly([[x-7,y-32],[x+9,y-32],[x+6,y-19],[x+1,y-15],[x-5,y-21]],'#3f3542');
  }
}
function drawThirdThrone(x,floor,stone,trim){
  rect(x-29,floor-6,58,6,trim);
  rect(x-21,floor-71,42,66,stone);
  rect(x-24,floor-74,48,6,trim);
  rect(x-29,floor-29,13,23,stone);
  rect(x+16,floor-29,13,23,stone);
  rect(x-22,floor-20,44,6,trim);
}
function drawDivineIron(x){
  const glow=.25+Math.sin(t*3)*.09;
  ctx.globalAlpha=glow;
  rect(x-17,179,46,249,'#f4c974');
  ctx.globalAlpha=1;
  rect(x,189,13,242,'#805240');
  rect(x+3,189,4,242,'#bd8558');
  rect(x-3,185,19,16,'#d59a53');
  rect(x-3,413,19,18,'#d59a53');
  rect(x-2,190,17,4,'#fff1a1');
  rect(x-2,418,17,4,'#fff1a1');
  for(let i=0;i<8;i++){
    rect(x+3,219+i*23,8,2,'#f3c36b');
    rect(x+5,218+i*23,2,6,'#f3c36b');
  }
  ctx.fillStyle='#ffe295';
  ctx.font='11px serif';
  [...'如意金箍棒'].forEach((glyph,i)=>ctx.fillText(glyph,x+21,250+i*16));
}
function drawStaff(camera){
  const x=player.x+12-camera;
  const y=player.y+17;
  if(slamActive){
    ctx.save();
    const lift=Math.min(1,(t-swingAt)/SLAM_WINDUP);
    const charging=lift<1;
    ctx.translate(x+swingFacing*(charging?12-5*lift:15),y+(charging?-4-13*lift:5));
    ctx.rotate(swingFacing*(charging?1.28-1.48*lift:-.36));
    ctx.scale(1+lift*.8,1+lift*.55);
    drawStaffShaft(charging?-51:-23,61);
    ctx.restore();
    if(charging){
      ctx.globalAlpha=.4+lift*.45;
      rect(x+swingFacing*7-2,y-32,4,4,'#fff2b3');
      ctx.globalAlpha=1;
      return;
    }
    for(let i=0;i<6;i++){
      ctx.globalAlpha=(6-i)/12;
      rect(x-22+i*9,y-16-i*6,2,10+i*2,'#ffdea1');
    }
    ctx.globalAlpha=1;
    return;
  }
  const age=(t-swingAt)/.34;
  if(age>=1||combo===0){
    const hand=x+15*player.face;
    ctx.save();
    ctx.translate(hand,y+4);
    ctx.rotate(player.face*.21);
    drawStaffShaft(-23,47);
    ctx.restore();
    return;
  }
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(swingFacing,1);
  const direction=combo===2?-1:1;
  const angle=(-1.5+age*2.65)*direction;
  const reach=34+combo*8;
  ctx.beginPath();
  ctx.arc(0,0,reach,angle-.8,angle+.48);
  ctx.strokeStyle='rgba(255,215,118,'+((1-age)*.64)+')';
  ctx.lineWidth=2+combo;
  ctx.stroke();
  for(let i=0;i<14;i++){
    const trailAngle=angle-i*.10*direction;
    ctx.globalAlpha=(1-age)*(1-i/14)*.85;
    rect(Math.cos(trailAngle)*reach,Math.sin(trailAngle)*reach,6+combo,4,'#ffd478');
  }
  ctx.globalAlpha=1;
  ctx.rotate(angle);
  ctx.rotate(-Math.PI/2);
  drawStaffShaft(-9,reach+15);
  ctx.restore();
}
function drawStaffShaft(top,length){
  rect(-2,top,4,length,'#55382d');
  rect(-1,top+2,2,length-4,'#9d6246');
  rect(-1,top+2,1,length-4,'#cb9266');
  for(const end of [top,top+length-8]){
    rect(-3,end,6,8,'#bd873c');
    rect(-3,end+1,6,2,'#ffe5a0');
    rect(-3,end+5,6,1,'#edbc69');
    rect(-1,end+3,2,2,'#f6ce7c');
  }
}
function drawDemon(demon,camera){
  const x=demon.x-camera,y=demon.y;
  if(demon.kind==='shrimp'||demon.kind==='crab'){
    drawSeaGuard(demon,x,y);
    drawEnemyHealth(demon,x,y);
    return;
  }
  poly([[x-12,y-9],[x-10,y-25],[x+8,y-25],[x+12,y-9]],'#735866');
  rect(x-9,y-15,18,3,'#b18572');rect(x-2,y-16,4,5,'#e0b581');
  rect(x-10,y-32,20,14,'#997688');
  rect(x-11,y-38,4,8,'#c49c8e');rect(x+7,y-38,4,8,'#c49c8e');
  rect(x-6,y-28,3,3,'#ffd478');rect(x+3,y-28,3,3,'#ffd478');
  if(demon.kind==='pig'){
    rect(x-13,y-31,5,8,'#bc8c8c');rect(x+8,y-31,5,8,'#bc8c8c');
    rect(x-7,y-25,14,8,'#d49f9d');
    rect(x-4,y-22,2,2,'#724a59');rect(x+2,y-22,2,2,'#724a59');
  }else rect(x-5,y-22,11,2,'#533e51');
  rect(x-4,y-21,2,4,'#e7c9a1');rect(x+3,y-21,2,4,'#e7c9a1');
  rect(x-8,y-6,6,6,'#514353');rect(x+3,y-6,6,6,'#514353');
  ctx.save();ctx.translate(x+10*demon.dir,y-16);ctx.scale(demon.dir,1);
  ctx.rotate(demon.strikeAt?-.95:demon.readyAt-t>.68?.95:Math.sin(t*8)*.25);
  rect(0,-2,21,4,'#8e6658');
  rect(13,-5,11,10,'#b4866f');
  for(let i=0;i<4;i++)rect(13+i*3,-8,2,4,'#d7ad85');
  ctx.restore();
  drawEnemyHealth(demon,x,y);
}
function drawEnemyHealth(demon,x,y){
  rect(x-11,y-45,22,3,'#47313d');
  rect(x-11,y-45,22*demon.hp/demon.maxHp,3,'#cf7969');
}
function drawSeaGuard(demon,x,y){
  const shrimp=demon.kind==='shrimp';
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(demon.dir,1);
  poly([[-15,-10],[-12,-24],[9,-25],[15,-18],[13,-8]],shrimp?'#b86f58':'#ae584d');
  rect(-10,-28,22,11,shrimp?'#df8d69':'#d67a61');
  rect(5,-25,3,3,'#302a32');rect(-4,-25,3,3,'#302a32');
  for(let i=0;i<4;i++){
    rect(-13+i*7,-7,4,7,'#a65d52');
    rect(-13+i*7,-10,4,3,'#e49870');
  }
  if(shrimp){
    rect(-16,-19,8,6,'#e89b74');
    rect(-11,-36,3,10,'#ecb18a');rect(4,-35,3,8,'#ecb18a');
    ctx.translate(8,-16);
    const charging=demon.strikeAt&&demon.strikeAt-t<=.15;
    if(charging){
      ctx.globalAlpha=.72;
      rect(23,-2,29,3,'#d9f9eb');
      rect(32,-5,18,1,'#a2ddd3');
      rect(-40,-4,23,2,'#a2ddd3');
      rect(-36,4,19,1,'#d9f9eb');
      ctx.globalAlpha=1;
    }
    ctx.rotate(demon.strikeAt&&!charging?-.28:0);
    rect(-16,-1,43,3,'#a2835f');
    poly([[25,-5],[35,0],[25,5]],'#d1dec9');
  }else{
    const claw=demon.strikeAt?-6:0;
    rect(-20,-17,12,7,'#bd6556');rect(9,-18,12,7,'#bd6556');
    rect(16,-24+claw,12,11,'#e39074');
    rect(24,-26+claw,7,4,'#f0a685');rect(25,-17+claw,6,4,'#f0a685');
  }
  ctx.restore();
}
