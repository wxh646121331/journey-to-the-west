'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
const W=960,H=540, PIXEL_SCALE=2, SAVE='west-stone-monkey-v1';
const PROGRESS=SAVE+'-chapters';
const CHAPTER_COUNT=4;
const progress=loadGameProgress();

function loadGameProgress(){
  const empty={unlocked:1,active:1,slots:{}};
  try{
    const saved=JSON.parse(localStorage.getItem(PROGRESS));
    if(saved?.slots&&Number.isInteger(saved.unlocked))return saved;
  }catch{}
  try{
    const legacy=JSON.parse(localStorage.getItem(SAVE));
    if(legacy&&typeof legacy==='object'){
      const n=Math.max(1,Math.min(CHAPTER_COUNT,Number(legacy.chapter)||1));
      const unlocked=n===2&&legacy.flightTrialDone?3:n;
      return {unlocked,active:n,slots:{[n]:{...legacy,chapter:n}}};
    }
  }catch{}
  return empty;
}
function persistProgress(){
  $('continue').hidden=!progress.slots[progress.active];
  try{
    localStorage.setItem(PROGRESS,JSON.stringify(progress));
    return true;
  }catch{return false;}
}
function writeGameSave(state){
  progress.slots[state.chapter]=state;
  progress.unlocked=Math.max(progress.unlocked,state.chapter);
  progress.active=state.chapter;
  return persistProgress();
}
function unlockNextChapter(n,initial){
  progress.unlocked=Math.max(progress.unlocked,n);
  progress.slots[n]??={chapter:n,...initial};
  progress.active=n;
  persistProgress();
}

const questNames=['寻找猴群并交谈','穿越瀑布，查看洞中石碑','返回瀑布前，再次与猴群交谈','带猴群进入水帘洞，在石王座前集合'];
const THRONE_X=3375;
let seatedAt=null;
const followerStarts=[1845,1890,1950];
const followers=followerStarts.map(x=>({x,y:418,vy:0,ground:true,face:1,moving:false,landing:null}));
let escort=false, afterTalk=null, birdAt=0, stepAt=0, water=null, noiseBuffer=null;
let mode='cover',paused=false,t=0,last=0,cam=0,storyIndex=0,score=0,activeQuiz=null,quizDone=false,burst=0,checkpoint=90,found=false,challenged=false,ending=false,muted=false,audio=null,toastUntil=0,saveTime=0;
let jumpRequestedUntil=-1, death=null;
const keys=new Set(),player={x:90,y:360,vx:0,vy:0,w:23,h:34,ground:false,face:1};
const platforms=[{x:-100,y:452,w:450},{x:390,y:420,w:140},{x:560,y:382,w:145},{x:740,y:425,w:260},{x:1050,y:404,w:115},{x:1210,y:365,w:140},{x:1400,y:410,w:100},{x:1540,y:452,w:530},{x:2120,y:412,w:180},{x:2340,y:392,w:160},{x:2525,y:432,w:420},{x:2975,y:405,w:150},{x:3150,y:432,w:350}];
const peaches=[{x:215,y:408},{x:440,y:376},{x:610,y:338},{x:790,y:380},{x:960,y:382},{x:1090,y:360},{x:1260,y:321},{x:1435,y:365},{x:1740,y:408},{x:2185,y:368},{x:2405,y:348},{x:3025,y:361}].map(p=>({...p,taken:false}));
const lines=[['天地初开','东胜神洲的海外，有一座花果山。'],['天地初开','山顶有一块仙石，日日承受天地精华。'],['天地初开','日月轮转，仙石之中渐渐孕育出生命。'],['灵石有知','山风吹过，林间鸟鸣，一场奇遇即将开始。'],['仙石初醒','一日，仙石忽然迸裂，产下一枚石卵。'],['仙石初醒','石卵见风，化作一只石猴，五官俱备，四肢皆全。'],['仙石初醒','石猴睁开双眼，两道金光直冲天际。'],['你的旅程','这一次，由你走进花果山，去寻找瀑布背后的秘密。']];
const quizzes={3:{q:'花果山位于哪一洲？',a:['东胜神洲','南赡部洲','西牛贺洲'],right:0,why:'花果山坐落于东胜神洲傲来国的海外。'},7:{q:'石猴由什么孕育而来？',a:['一株千年桃树','花果山顶的仙石','东海的一滴水'],right:1,why:'山顶仙石受天地精华，产下石卵，见风化作石猴。'},final:{q:'猴群为什么愿意拜石猴为王？',a:['他找到了许多仙桃','他打败了山中猛虎','他探明水帘洞，并平安返回'],right:2,why:'石猴兑现了探明水源、平安返回的约定，还为猴群寻到安居之所。'}};
function enableGameAudio(){
  if(muted)return;
  try{
    const AudioEngine=window.AudioContext||window.webkitAudioContext;
    if(!AudioEngine)return;
    audio??=new AudioEngine();
    if(audio.state==='suspended')audio.resume().catch(()=>{});
  }catch{}
}
document.addEventListener('pointerdown',enableGameAudio);
document.addEventListener('keydown',enableGameAudio);
function tone(f=440,d=.12){if(muted)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();const o=audio.createOscillator(),g=audio.createGain();o.type='triangle';o.frequency.value=f;g.gain.setValueAtTime(.045,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+d);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+d);}catch{}}
function toast(s){$('toast').textContent=s;toastUntil=t+3.5;}
function setSteps(n){for(let i=0;i<3;i++)$('step'+i).classList.toggle('active',i<=n);}
function save(){
  if(mode!=='play')return false;
  return writeGameSave({
    chapter:1,x:checkpoint,score,taken:peaches.map(p=>p.taken),found,challenged,escort,...vitalSave()
  });
}
function placePlayerOnGround(route,x){
  slamActive=false;
  const floor=route.find(p=>x>=p.x&&x+player.w<=p.x+p.w)??route[0];
  const safeX=Math.max(floor.x,Math.min(floor.x+floor.w-player.w,x));
  Object.assign(player,{x:safeX,y:floor.y-player.h,vx:0,vy:0,ground:true});
  jumpRequestedUntil=-1;
}
function reset(){death=null;$('deathPanel').hidden=true;$('cloudButton').hidden=true;$('heavenBossHud').hidden=true;$('heavenWarning').hidden=true;$('practiceNext').hidden=true;clearTransformation();slamActive=false;slamImpact=null;health=100;maxHealth=100;lives=3;immuneUntil=0;damageNumbers.length=0;effectRings.length=0;$('stamina').hidden=true;stamina=100;flightTrialDone=false;$('health').hidden=true;$('staffButton').hidden=true;$('flightDown').hidden=true;jumpRequestedUntil=-1;chapter=1;$('chapterLabel').textContent='CHAPTER 01 / 花果山';$('energy').hidden=true;$('spellButton').hidden=true;seatedAt=null;escort=false;afterTalk=null;followers.forEach((monkey,i)=>Object.assign(monkey,{x:followerStarts[i],y:418,vy:0,ground:true,face:1,moving:false,landing:null}));$('quest').hidden=true;particles.length=0;storyIndex=0;score=0;activeQuiz=null;found=false;challenged=false;ending=false;checkpoint=90;cam=0;peaches.forEach(p=>p.taken=false);placePlayerOnGround(platforms,90);$('ending').hidden=true;$('pausePanel').hidden=true;$('chapterPanel').hidden=true;$('dialog').hidden=true;$('hud').hidden=true;$('touch').hidden=true;paused=false;keys.clear();}
function start(){reset();mode='story';$('cover').hidden=true;$('pause').hidden=false;$('status').textContent='序章 · 灵根育孕源流出';setSteps(0);showLine();tone(392);}
function showLine(){const l=lines[storyIndex];$('dialog').hidden=false;$('dialog').innerHTML=`<div class="speaker">第一回 · ${l[0]}</div><div class="line">${l[1]}</div><span class="next">点击屏幕 / 空格 继续 ▾</span>`;}
function showQuiz(q,final=false,next=null){activeQuiz={...q,final,next};quizDone=false;mode='quiz';$('touch').hidden=true;$('dialog').hidden=false;$('dialog').innerHTML=`<div class="speaker">山海问答 · ${final?'最后一问':'读到这里，考考你'}</div><div class="line">${q.q}</div>${q.a.map((a,i)=>`<button class="option" data-answer="${i}">${'ABC'[i]} &nbsp; ${a}</button>`).join('')}`;$('dialog').querySelectorAll('[data-answer]').forEach(b=>b.onclick=e=>{e.stopPropagation();answer(Number(b.dataset.answer));});}
function answer(i){if(quizDone)return;quizDone=true;const correct=i===activeQuiz.right;if(correct){if(!activeQuiz.next)score++;tone(660);}else tone(180,.2);$('dialog').innerHTML=`<div class="speaker">山海问答</div><div class="line">${correct?'✦ 回答正确！':'正确答案：'+ 'ABC'[activeQuiz.right]+' · '+activeQuiz.a[activeQuiz.right]}</div><div class="feedback ${correct?'correct':''}">${activeQuiz.why}</div><span class="next">点击继续 ▾</span>`;}
function advance(){if(paused)return;if(mode==='story'){storyIndex++;if(quizzes[storyIndex])showQuiz(quizzes[storyIndex]);else if(storyIndex>=lines.length)startBurst();else showLine();}else if(mode==='quiz'&&quizDone){const {final,next}=activeQuiz;activeQuiz=null;if(next){$('dialog').hidden=true;mode='play';next();}else if(final)talk('猴群 · 拜见美猴王','多亏你找到了这处洞天！我们说话算数，从今往后，你便是我们的美猴王！',approachThrone);else{mode='story';showLine();}}else if(mode==='talk'){closeDialog();}}
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
  if(chapter===4){interactChapterFour();return;}
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
function finish(){$('health').hidden=true;$('stamina').hidden=true;$('quest').hidden=true;mode='end';ending=true;$('dialog').hidden=true;$('hud').hidden=true;$('touch').hidden=true;$('pause').hidden=true;setSteps(2);const n=peaches.filter(p=>p.taken).length;$('ending').hidden=false;$('ending').innerHTML=`<span class="eyebrow">CHAPTER COMPLETE</span><h2>美 猴 王</h2><div class="cn-title">第一关 · 石破天惊，圆满完成</div><p>你为猴群寻得洞天，也赢得了他们的信任。</p><div class="stats"><div><strong>${n} / 12</strong><span>林间仙桃</span></div><div><strong>${score} / 3</strong><span>山海问答</span></div><div><strong>已发现</strong><span>水帘洞天</span></div></div><button class="primary" id="nextChapter">第二关 · 漂洋寻仙 →</button><button class="subtle" id="again">再游花果山 ↻</button>`;$('again').onclick=start;$('nextChapter').onclick=()=>startChapterTwo();$('status').textContent='第一关完成 · 美猴王诞生';$('hint').textContent='第一段旅程已完成，感谢你走进花果山。';unlockNextChapter(2,{phase:'cave',intro:true});tone(523,.3);setTimeout(()=>tone(784,.5),220);}
function pause(){
  jumpRequestedUntil=-1;
  if(['cover','end','gameover','dying'].includes(mode))return;
  if(paused&&!$('chapterPanel').hidden){closeChapterSelect();return;}
  paused=!paused;
  keys.clear();
  $('pausePanel').hidden=!paused;
  $('saveResult').textContent='';
  if(paused)$('resume').focus?.();
  else $('stage').focus?.({preventScroll:true});
}
function manualSave(){
  if(mode==='play')return saveCurrentCheckpoint();
  return writeGameSave(progress.slots[chapter]??{chapter,intro:true});
}
function loadChapter(n){
  const saved=progress.slots[n];
  if(n===4){startChapterFour(saved);return;}
  if(n===3){startChapterThree(saved);return;}
  if(n===2){startChapterTwo(saved);return;}
  if(!saved||saved.intro){start();return;}
  reset();
  restoreVitals(saved);
  score=saved.score||0;
  challenged=!!saved.challenged;
  found=!!saved.found;
  escort=!!saved.escort;
  checkpoint=saved.x||90;
  placePlayerOnGround(platforms,checkpoint);
  peaches.forEach((p,i)=>p.taken=!!saved.taken?.[i]);
  $('cover').hidden=true;
  $('pause').hidden=false;
  tone(392);
  beginPlay();
  if(found)setSteps(2);
}
function openChapterSelect(){
  if(!paused)return;
  for(let n=1;n<=CHAPTER_COUNT;n++){
    const button=$('selectChapter'+n);
    button.disabled=n>progress.unlocked;
    const saved=progress.slots[n];
    $('chapterState'+n).textContent=button.disabled?'未解锁':saved&&!saved.intro?'有存档':'已解锁';
  }
  $('pausePanel').hidden=true;
  $('chapterPanel').hidden=false;
  $('chapterBack').focus?.();
}
function closeChapterSelect(){
  $('chapterPanel').hidden=true;
  $('pausePanel').hidden=false;
  $('chapterSelect').focus?.();
}
function selectChapter(n){
  if(!paused||$('chapterPanel').hidden||n>progress.unlocked)return;
  manualSave();
  progress.active=n;
  persistProgress();
  loadChapter(n);
}
$('start').onclick=start;$('restart').onclick=start;$('resume').onclick=pause;$('pause').onclick=pause;
$('sound').onclick=()=>{muted=!muted;$('sound').textContent='♫ 声音：'+(muted?'关':'开');tone(523);};
$('continue').hidden=!progress.slots[progress.active];
$('continue').onclick=()=>loadChapter(progress.active);
$('saveNow').onclick=()=>{
  $('saveResult').textContent=manualSave()?'已保存 · 下次从本关存档点继续':'无法保存到此浏览器';
};
$('chapterSelect').onclick=openChapterSelect;
$('chapterBack').onclick=closeChapterSelect;
for(let n=1;n<=CHAPTER_COUNT;n++)$('selectChapter'+n).onclick=()=>selectChapter(n);
$('stage').addEventListener('click',e=>{if(e.target.closest('button'))return;advance();});
window.addEventListener('keydown',e=>{if(paused&&e.code!=='Escape')return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)||e.key===' ')e.preventDefault();if(e.repeat)return;if(mode==='book'&&!paused&&['ArrowLeft','ArrowRight'].includes(e.code)){flipBook(e.code==='ArrowLeft'?-1:1);return;}if(e.code==='Escape'){pause();return;}if(paused)return;if((e.code==='Space'||e.key===' ')&&['story','quiz','talk'].includes(mode)){advance();return;}keys.add(e.code);if(e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW'||e.key===' '||e.key==='ArrowUp'||e.key?.toLowerCase()==='w')jump();if(e.code==='KeyE')interact();if(e.code==='KeyF')castTransform();if(e.code==='KeyS')castCloud();if(e.code==='KeyA')swingStaff();});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(!paused&&!['cover','end','gameover','dying'].includes(mode))pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&!paused&&!['cover','end','gameover','dying'].includes(mode))pause();});
document.querySelectorAll('[data-key]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();if(b.hasPointerCapture&&!b.hasPointerCapture(e.pointerId)){try{b.setPointerCapture(e.pointerId);}catch{}}keys.add(b.dataset.key);if(b.dataset.key==='Space')jump();if(b.dataset.key==='KeyE')interact();if(b.dataset.key==='KeyF')castTransform();if(b.dataset.key==='KeyS')castCloud();if(b.dataset.key==='KeyA')swingStaff();});if(b.dataset.key==='Space')b.addEventListener('click',e=>{if(e.detail===0)jump();});for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>keys.delete(b.dataset.key));});
function jump(){
  if(mode!=='play'||paused||slamActive||transformedForm?.flight)return;
  if(transformedForm?.id==='squirrel'&&nearClimbTree())return;
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
if(mode==='dying'){updateDeath(dt);return;}
updateParticles(dt);
if(chapter===2){updateChapterTwo(dt);return;}
if(chapter===3){updateChapterThree(dt);return;}
if(chapter===4){updateChapterFour(dt);return;}
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
  burst+=dt;if(burst>3.7)beginPlay();return;}if(mode!=='play')return;const p=player;updateRun(dt);const wasGrounded=p.ground,oldX=p.x;p.x=Math.max(0,Math.min(3430,p.x+p.vx*dt));if(!challenged&&p.x>2245){p.x=2245;if(oldX<2245)toast('先和猴群交谈，完成瀑布前的约定。');}
if(escort)moveFollowers(dt);
resolvePlayerVertical(platforms,dt);if(p.ground&&p.vx&&t>=stepAt){stepAt=t+.26;footstep();}
if(!wasGrounded&&p.ground){footstep(true);}
if(!wasGrounded&&p.ground)scatter(p.x+12,p.y+p.h,10,['#d5bf8c','#81975d']);
if((oldX<2317)!==(p.x<2317))scatter(2317,p.y+15,60,['#d4fff0','#8fcfc4','#f5f9db'],130);
applyJumpRequest();
if(p.y>600){fallAndRespawn(platforms);if(mode!=='play')return;}if(p.ground&&p.x>1540&&p.x<1790)checkpoint=1580;if(p.ground&&p.x>2525&&challenged&&!found)checkpoint=2570;for(const f of peaches){if(!f.taken&&Math.abs(p.x+12-f.x)<27&&Math.abs(p.y+17-f.y)<34){f.taken=true;healFromPeach();scatter(f.x,f.y,36,['#ffd39a','#f1a785','#f9edbd'],100);tone(740,.09);save();}}cam+=((Math.max(0,Math.min(2540,p.x-330)))-cam)*Math.min(1,dt*7);$('area').textContent=p.x<650?'花果山 · 灵石台':p.x<1550?'花果山 · 青石涧':p.x<2320?'花果山 · 飞瀑前':'水帘洞 · 别有洞天';$('counts').textContent=`仙桃 ${peaches.filter(f=>f.taken).length}/12　✦ ${score}`;$('status').textContent=escort?'目标 · 带猴群到石王座前':found?'目标 · 返回猴群，带大家入住水帘洞':challenged?'目标 · 穿过瀑布，调查洞内石碑':'目标 · 沿溪流寻找猴群';if(t>saveTime){save();saveTime=t+4;}}
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x*PIXEL_SCALE)/PIXEL_SCALE,Math.round(y*PIXEL_SCALE)/PIXEL_SCALE,Math.round(w*PIXEL_SCALE)/PIXEL_SCALE,Math.round(h*PIXEL_SCALE)/PIXEL_SCALE);}
function poly(points,c){ctx.fillStyle=c;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fill();}
function mountain(x,y,w,h,c){poly([[x,y+h],[x+w*.12,y+h*.56],[x+w*.25,y+h*.56],[x+w*.25,y+h*.28],[x+w*.36,y+h*.28],[x+w*.36,y+h*.12],[x+w*.47,y],[x+w*.6,y+h*.06],[x+w*.6,y+h*.26],[x+w*.72,y+h*.26],[x+w*.8,y+h*.6],[x+w*.92,y+h*.6],[x+w,y+h]],c);}
function tree(x,y,s=1){rect(x-5*s,y-110*s,12*s,115*s,'#31483b');rect(x+4*s,y-100*s,4*s,97*s,'#63704b');poly([[x,y-64*s],[x-29*s,y-91*s],[x-26*s,y-98*s],[x+4*s,y-77*s]],'#344d3c');const cs=['#183e35','#23513e','#346447','#496f49'];for(let i=0;i<4;i++){rect(x-(63-i*5)*s,y-(153-i*13)*s,(110-i*7)*s,31*s,cs[i]);rect(x-(38-i*9)*s,y-(174-i*10)*s,(73-i*2)*s,28*s,cs[i]);}rect(x-36*s,y-159*s,23*s,5*s,'#748951');
const rim=['#648f59','#779f61','#91ac66'];
for(let i=0;i<3;i++){
  rect(x+(12-i*4)*s,y-(170-i*14)*s,(22+i*4)*s,3*s,rim[i]);
  rect(x+(29-i*3)*s,y-(167-i*14)*s,4*s,7*s,rim[i]);
}
}
function monkey(x,y,face=1,walk=false,scale=1,crown=false,armored=false){ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(face*scale,scale);const swing=walk?Math.sin(t*15)*5:0;rect(-17,16,10,5,'#935e3c');rect(-22,7,5,13,'#935e3c');rect(-22,4,9,5,'#b7834e');rect(-8,12,18,17,'#a76d3d');rect(-8,27,6,8+swing,'#825132');rect(5,27,6,8-swing,'#825132');rect(-10,33+swing,9,4,'#dbb275');rect(3,33-swing,10,4,'#dbb275');rect(-11,1,24,19,'#b7844b');rect(-15,6,6,8,'#c99a64');rect(11,5,6,8,'#c99a64');rect(-5,5,17,13,'#e6bd7e');rect(1,6,3,4,'#20372b');rect(9,6,3,4,'#20372b');rect(7,12,6,3,'#754734');rect(-11,-3,23,7,'#8b5c37');rect(-3,-7,8,7,'#a27440');rect(6,17,6,14,'#d1a060');if(crown){rect(-10,-8,23,4,'#e9bb5f');for(let i=0;i<3;i++)rect(-9+i*9,-14,5,7,'#edca70');}if(armored)drawWukongArmor(swing);ctx.restore();}
function drawWukongArmor(stride){
  const gold='#eac170';
  const light='#f9e2a4';
  const dark='#9e663e';
  rect(-9,-7,21,5,dark);
  rect(-8,-8,20,3,gold);
  rect(-2,-11,7,4,gold);
  rect(0,-10,3,3,'#c4654d');
  poly([[-6,-8],[-12,-18],[-22,-22],[-18,-16],[-13,-13],[-10,-7]],'#b95346');
  poly([[7,-9],[12,-19],[22,-24],[19,-17],[14,-14],[11,-8]],'#da7858');
  rect(-11,15,6,8,dark);
  rect(8,15,6,8,dark);
  rect(-10,15,5,3,light);
  rect(8,15,5,3,light);
  rect(-7,17,17,12,gold);
  rect(-5,18,13,2,light);
  rect(-5,22,13,1,dark);
  rect(-5,25,13,1,dark);
  rect(-8,28,20,3,'#9f5042');
  rect(0,28,4,3,light);
  rect(-10,33+stride,9,3,gold);
  rect(3,33-stride,10,3,gold);
}
function peach(x,y){rect(x-6,y-6,13,11,'#e5a186');rect(x-3,y-8,9,14,'#e9b38c');rect(x-7,y-3,3,6,'#c88373');rect(x,y-11,7,4,'#8eae62');rect(x-2,y-10,3,5,'#9fc571');}
function lightGradient(x0,y0,x1,y1,stops){
  const gradient=ctx.createLinearGradient(x0,y0,x1,y1);
  for(const [at,color] of stops)gradient.addColorStop(at,color);
  return gradient;
}
function glow(x,y,r,color){
  if(x+r<0||x-r>W||y+r<0||y-r>H)return;
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,color);
  g.addColorStop(1,color.slice(0,7)+'00');
  rect(x-r,y-r,r*2,r*2,g);
}
function lightShaft(x,y,length,spread,color){
  const end=x-length*.37;
  const g=lightGradient(x,y,end,y+length,[[0,color],[.58,color.slice(0,7)+'14'],[1,color.slice(0,7)+'00']]);
  poly([[x-7,y],[x+7,y],[end+spread,y+length],[end-spread,y+length]],g);
}
function contactShadow(x,y,width=26,sunlit=false){
  if(x+width<0||x-width>W)return;
  const left=x-width*(sunlit?1.35:.6);
  const right=x+width*.44;
  const g=lightGradient(left,y,right,y,[[0,'#14262400'],[.75,'#14262466'],[1,'#14262422']]);
  poly([[x-width*.24,y-1],[right,y],[x+width*.22,y+4],[left,y+7],[left+width*.15,y+3]],g);
}
function drawBackground(){
  const c=(['cover','story','burst'].includes(mode)||mode==='quiz'&&!activeQuiz?.final&&!activeQuiz?.next||mode==='voyage')?0:cam;
  const sunX=741-c*.018;
  rect(0,0,W,H,lightGradient(0,0,0,H,[[0,'#519fcd'],[.38,'#a9dae1'],[.68,'#f5eac4'],[1,'#b1cbbb']]));
  glow(sunX,87,173,'#fff1baca');
  poly([[sunX-24,77],[sunX-11,64],[sunX+11,64],[sunX+24,77],
    [sunX+24,97],[sunX+11,110],[sunX-11,110],[sunX-24,97]],'#fff9d6');
  for(let i=0;i<7;i++){
    const x=((i*203+t*(2+i%3)-c*.065)%1250+1250)%1250-140;
    const y=112+i%3*51;
    rect(x,y,105,5,'#fffbeb9c');
    rect(x+18,y-6,55,6,'#fffbebad');
    rect(x+31,y+5,66,2,'#a4cdd683');
  }
  const ranges=[
    [110,285,.08,'#8dafad','#bbcec2'],
    [180,295,.17,'#689990','#8db8a1'],
    [257,290,.28,'#447968','#669b7f']
  ];
  for(const [base,spacing,parallax,shade,lit] of ranges){
    const offset=c*parallax;
    for(let i=Math.floor(offset/spacing)-1;i<=Math.floor((W+offset)/spacing);i++){
      const x=i*spacing-offset,y=base+Math.sin(i*2)*33,w=390,h=340;
      mountain(x,y,w,h,shade);
      poly([[x+w*.47,y],[x+w*.60,y+h*.06],[x+w*.60,y+h*.26],
        [x+w*.72,y+h*.26],[x+w*.80,y+h*.60],[x+w*.92,y+h*.60],
        [x+w,y+h],[x+w*.58,y+h],[x+w*.65,y+h*.60],[x+w*.52,y+h*.35]],lit);
    }
    rect(0,base+65,W,175,lightGradient(0,base+65,0,base+240,[[0,'#f1f4ce00'],[.64,'#f1f4ce38'],[1,'#f1f4ce00']]));
  }
  for(let i=0;i<3;i++)lightShaft(sunX+24+i*65,85,355,38+i*4,'#fff3c637');
  return c;
}
function drawCover(){drawBackground();mountain(-90,260,530,330,'#153e34');mountain(670,230,450,370,'#163e32');tree(60,470,1.45);tree(890,430,1.1);rect(23,470,80,6,'#355943');rect(863,430,63,5,'#355943');rect(675,257,42,280,'#87b7aa');for(let i=0;i<9;i++)rect(678+i*5,260+(t*65+i*29)%270,2,40,'#d7e6c276');poly([[380,540],[397,460],[429,440],[434,418],[520,418],[531,447],[564,460],[601,540]],'#274b39');rect(422,420,113,10,'#638052');if(mode!=='burst'||burst<1.5){poly([[452,416],[443,370],[455,343],[493,338],[512,360],[507,417]],'#8b9471');poly([[493,338],[512,360],[507,417],[483,416],[493,378],[484,361]],'#b8b893');poly([[443,370],[455,343],[465,352],[455,374],[473,416],[452,416]],'#646f59');rect(466,347,22,3,'#d2c6a0');poly([[480,342],[477,369],[489,378],[481,409]],'#daca8c');}if(mode==='burst'){if(burst>1.5)monkey(478,Math.min(383,250+(burst-1.5)*90),1,false,1.4);const alpha=Math.max(0,1-Math.abs(burst-1.5)*3);rect(0,0,W,H,`rgba(255,242,189,${alpha})`);}for(let i=0;i<21;i++){const x=(i*143+Math.sin(t+i)*30)%960,y=240+(i*47)%270+Math.sin(t*.8+i)*12;rect(x,y,2,2,i%2?'#d7cc87':'#7dbb83');}}
function drawWorld(){drawBackground();const c=cam;rect(0,485,960,55,'#497f74');for(let i=0;i<25;i++)rect((i*53+t*18)%1000,490+i%4*12,25,2,'#99bc9c55');for(let i=0;i<13;i++){const x=i*295-c;const ground=platforms.find(p=>i*295>=p.x+9&&i*295<p.x+p.w-9);if(ground&&i*295<2525&&x>-160&&x<1100)tree(x,ground.y,.8+i%3*.22);}const cave=2525-c;
if(cave<W){
  rect(cave,0,1000,H,lightGradient(cave,0,cave+430,0,[[0,'#29493b'],[1,'#162f2b']]));
  lightShaft(cave+68,93,340,115,'#d7edb872');
  rect(2525-c,0,1000,90,'#15362e');for(let i=0;i<9;i++)poly([[2525+i*130-c,80],[2555+i*130-c,140+i%3*20],[2577+i*130-c,80]],'#15362e');}
for(const f of platforms){if(f.x-c>1000||f.x+f.w-c<-20)continue;rect(f.x-c,f.y,f.w,110,'#344b36');const shade=f.x>=2525;
rect(f.x-c,f.y,f.w,8,shade?'#7d8b63':'#adba7a');
rect(f.x-c,f.y,f.w,2,shade?'#9aa582':'#e2d99a');
rect(f.x-c,f.y+8,f.w,90,lightGradient(0,f.y+8,0,f.y+98,[[0,'#172e2777'],[1,'#172e2700']]));rect(f.x-c,f.y+8,f.w,9,'#536b42');drawStoneFace(f.x-c,f.y,f.w,'#abc08944');for(let i=0;i<f.w;i+=29){rect(f.x+i-c,f.y+30+(i%3)*13,18,5,'#465c3d');rect(f.x+i-c,f.y+19,9,4,'#263f32');}for(let i=0;i<f.w;i+=18)rect(f.x+i-c,f.y-3,3,6,'#a1ae68');}
for(let i=0;i<9;i++){
  const worldX=i*295;
  const floor=platforms.find(p=>worldX>=p.x+9&&worldX<p.x+p.w-9);
  if(floor)contactShadow(worldX-c,floor.y,Math.min(61,worldX-floor.x)/1.35,true);
}
rect(1980-c,350,65,8,'#a59c68');rect(2005-c,330,7,26,'#8a8355');rect(1990-c,326,50,20,'#b7a36f');ctx.fillStyle='#304b35';ctx.font='10px serif';ctx.fillText('水帘洞 →',1994-c,340);
for(const [i,follower] of followers.entries()){
  if(follower.ground)contactShadow(follower.x-c,follower.y+34,21,follower.x<2525);
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
  if(player.ground)contactShadow(player.x+12-c,player.y+player.h,25,player.x<2525);
  monkey(player.x+12-c,player.y+1,player.face,player.ground&&!!player.vx,1,mode==='coronation');
}
const fx=2280-c;
glow(fx+43,435,83,'#dcfff24c');
rect(fx,0,75,458,lightGradient(fx,0,fx+75,0,[[0,'#74aeb46c'],[.7,'#bee9dfa9'],[1,'#edfff6bb']]));for(let i=0;i<15;i++){const yy=(t*190+i*47)%450;rect(fx+i%6*13,yy,4,29+i%4*15,'#d3efda99');}for(let i=0;i<18;i++){const a=i*2.3;rect(fx+37+Math.sin(a+t)*48,451+Math.cos(a+t*2)*13,5,4,'#e1edce99');}if(player.x>2090&&player.x<2350&&!found){ctx.fillStyle='#f1e1ac';ctx.font='13px sans-serif';ctx.fillText('向右跃入水帘 →',2100-c,300);}if(mode==='play'){let label='';let x=0;if(player.x>1780&&player.x<2070){label='[ E ] '+(found?'告诉猴群你的发现':'与猴群交谈');x=1880;}if(player.x>3210&&(!found||escort)){label=escort?'[ E ] 石王座':'[ E ] 读石碑';x=3280;}if(label){ctx.textAlign='center';ctx.font='13px sans-serif';ctx.fillStyle='#f5deb0';ctx.fillText(label,x-c,306);ctx.textAlign='left';}}}
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
  const quiet=muted||paused||mode==='dying'||mode==='gameover';
  if(!quiet&&chapter===4&&mode==='play'&&fourthScene==='escape'&&heavenBossEngaged&&heavenGuards.at(-1)?.hp>0){
    updateHeavenMusic();
  }
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
const effectRings=[];
function scatter(x,y,count,colors,speed=65){
  if(count>=35){
    effectRings.push({x,y,age:0,reach:20+speed*.32,color:colors[0]});
    if(effectRings.length>12)effectRings.shift();
  }
  for(let i=0;i<count;i++){
    const angle=Math.random()*Math.PI*2;
    const force=speed*(.2+Math.random()*.8);
    const life=.3+Math.random()*.85;
    particles.push({
      x,y,vx:Math.cos(angle)*force,vy:Math.sin(angle)*force-speed*.45,
      life, duration:life, size:.5+Math.floor(Math.random()*5)*.5,
      color:colors[i%colors.length],spark:i%3===0
    });
  }
  if(particles.length>480)particles.splice(0,particles.length-480);
}

function updateParticles(dt){
  for(let i=effectRings.length-1;i>=0;i--){
    effectRings[i].age+=dt;
    if(effectRings[i].age>.52)effectRings.splice(i,1);
  }
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
  const inWorld=mode==='play'||mode==='talk'||mode==='coronation'||mode==='end'||(mode==='quiz'&&(activeQuiz?.final||activeQuiz?.next));
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
  drawParticles(offset);
}
function drawParticles(camera){
  for(const ring of effectRings){
    const progress=ring.age/.52;
    const radius=5+ring.reach*Math.sqrt(progress);
    ctx.globalAlpha=(1-progress)*.72;
    for(let i=0;i<29;i++){
      const angle=i*Math.PI*2/29;
      rect(ring.x-camera+Math.cos(angle)*radius,ring.y+Math.sin(angle)*radius*.67,2.4,1.7,ring.color);
    }
  }
  for(const p of particles){
    const alpha=Math.min(1,p.life/p.duration*1.6);
    const x=p.x-camera;
    if(p.spark){
      ctx.globalAlpha=alpha*.37;
      for(let i=1;i<=3;i++)rect(x-p.vx*i*.015,p.y-p.vy*i*.015,p.size+.5,p.size+.5,p.color);
      ctx.globalAlpha=alpha*.25;
      rect(x-2,p.y-2,p.size+4,p.size+4,p.color);
    }
    ctx.globalAlpha=alpha;
    rect(x,p.y,p.size,p.size,p.color);
    if(p.spark&&p.size>1.3){
      ctx.globalAlpha=alpha*.9;
      rect(x,p.y,.8,.8,'#fff6da');
    }
  }
  ctx.globalAlpha=1;
}
function drawStoneFace(x,y,width,glint){
  if(x+width<0||x>W)return;
  const start=Math.max(8,Math.floor(-x/23)*23);
  const end=Math.min(width-7,W-x+22);
  for(let i=start;i<end;i+=23){
    const seam=12+(Math.floor(i/23)*13)%24;
    rect(x+i,y+seam,13,1,'#10252854');
    rect(x+i+9,y+seam+1,1,5,'#10252840');
    rect(x+i+2,y+seam-2,5,1,glint);
    if(Math.floor(i/23)%3===0){
      rect(x+i+5,y+46,11,1,'#10252842');
      rect(x+i+9,y+47,1,5,'#10252842');
    }
  }
}
function drawAtmosphere(){
  const sea=chapter===3&&thirdScene==='palace';
  const ember=chapter===3&&thirdScene==='underworld';
  const color=sea?'#b8f2e4':ember?'#ffb982':'#e9efbc';
  const cover=['cover','story','burst'].includes(mode)||(mode==='quiz'&&!activeQuiz?.final&&!activeQuiz?.next);
  const camera=cover?0:cam;
  for(let i=0;i<36;i++){
    const phase=(i*.17+t*(.09+i%4*.017))%1;
    const x=((i*89+Math.sin(t*.72+i)*23-camera*.16)%W+W)%W;
    const y=55+i*47%428+Math.sin(t*.54+i)*13;
    ctx.globalAlpha=.07+Math.sin(phase*Math.PI)*.27;
    rect(x,y,i%6===0?2.5:1.25,i%6===0?2.5:1.25,color);
    if(i%9===0){
      ctx.globalAlpha*=.45;
      rect(x-2,y+1,7,.5,color);
      rect(x+1,y-2,.5,7,color);
    }
  }
  ctx.globalAlpha=1;
}
function frame(now){const dt=Math.min(.032,(now-last)/1000||.016);last=now;if(!paused)t+=dt;update(dt);ctx.setTransform(PIXEL_SCALE,0,0,PIXEL_SCALE,0,0);ctx.imageSmoothingEnabled=false;if(['cover','story','burst'].includes(mode)||(mode==='quiz'&&!activeQuiz?.final&&!activeQuiz?.next))drawCover();else if(chapter===2)drawChapterTwo();else if(chapter===3)drawChapterThree();else if(chapter===4)drawChapterFour();else drawWorld();if(chapter===1)drawEffects();drawAtmosphere();drawDamageNumbers();if(t>toastUntil)$('toast').textContent='';requestAnimationFrame(frame);}requestAnimationFrame(frame);

let stamina=100, flightTrialDone=false, ambienceAt=0;
let chapter=1, region='cave', energy=0, learned=false, transformedUntil=0, voyageTime=0, dockWait=0;
const forms=[
  {id:'crane',name:'飞鹤',flight:true,speed:315,vertical:200,hint:'方向键高速飞行，触屏用跳跃键上升、▼ 下降。敌人仍会发现你。'},
  {id:'fly',name:'苍蝇',flight:true,speed:110,vertical:90,hint:'方向键慢速飞行，触屏用跳跃键上升、▼ 下降。敌人会忽略你。'},
  {id:'tiger',name:'老虎',speed:230,hint:'靠近敌人可以吓退它们。'},
  {id:'squirrel',name:'松鼠',speed:345,hint:'快速移动，靠近树干按 ↑ 或空格爬树。'}
];
let transformedForm=null, climbingTree=null;
const climbTrees={
  shore:[{x:284,y:442},{x:540,y:411},{x:901,y:415},{x:1152,y:386},{x:1666,y:400}],
  mountain:[{x:191,y:434},{x:500,y:434},{x:708,y:404},{x:930,y:434},{x:1280,y:434}]
};
function currentClimbTrees(){
  if(chapter===2&&region==='shore')return climbTrees.shore;
  if(chapter===3&&thirdScene==='mountain')return climbTrees.mountain;
  return [];
}
function nearClimbTree(){
  return currentClimbTrees().find(trunk=>Math.abs(player.x+12-trunk.x)<=24&&
    player.y+player.h>=trunk.y-121&&player.y+player.h<=trunk.y+5);
}
const bodhiHall={door:1750,entry:98,teacher:808,floor:426,width:1120};
const secondRoutes={
  cave:[
    {x:-70,y:432,w:690},{x:650,y:425,w:145},{x:835,y:389,w:140},
    {x:1015,y:422,w:150},{x:1205,y:385,w:135},{x:1380,y:432,w:410}
  ],
  shore:[
    {x:-80,y:442,w:450},{x:480,y:411,w:112},{x:650,y:379,w:111,motion:{center:657,range:45,phase:0}},
    {x:850,y:415,w:168},{x:1102,y:386,w:164},{x:1361,y:427,w:153,motion:{center:1361,range:22,phase:1.8}},
    {x:1600,y:400,w:320}
  ],
  hall:[{x:0,y:bodhiHall.floor,w:bodhiHall.width}]
};
const secondPeaches={
  cave:[[300,394],[704,389],[888,351],[1070,385],[1259,349],[1470,394]],
  shore:[[221,402],[530,375],[56,341],[873,375],[1140,350],[49,390],[1640,363],[1810,363]],
  hall:[]
};
const shoreTraps=[
  {x:928,y:415,w:54,offset:0},
  {x:1180,y:386,w:54,offset:1.15}
];
const shoreLifts=secondRoutes.shore.filter(floor=>floor.motion);
let collected=new Set();
let secondDialogueLine=0;

function chapterTwoSave(){
  return writeGameSave({
    chapter:2,phase:region,energy,learned,flightTrialDone,peaches:[...collected],checkpoint,...vitalSave()
  });
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
    const beat=lines[index++];
    if(Array.isArray(beat)){
      const [speaker,line]=beat;
      talk(speaker,line,next);
    }else showQuiz(beat,false,next);
  }
  next();
}
function startChapterTwo(saved){
  reset();
  chapter=2;
  restoreVitals(saved);
  region=saved?.phase==='hall'||saved?.phase==='shore'?saved.phase:'cave';
  energy=Math.max(0,Math.min(10,saved?.energy||0));
  learned=region!=='cave'&&!!saved?.learned;
  flightTrialDone=!!saved?.flightTrialDone;
  collected=new Set(saved?.peaches||[]);
  transformedUntil=0;
  voyageTime=0;
  dockWait=0;
  checkpoint=region==='hall'?bodhiHall.entry:(saved?.checkpoint??90);
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
  if(region!=='cave'){
    openSecondRoute(bodhiQuest());
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
  $('spellButton').hidden=!learned||region==='hall';
  $('cloudButton').hidden=!learned||region==='hall';
  $('practiceNext').hidden=!flightTrialDone||region==='hall';
  $('practiceNext').onclick=()=>{
    if(chapter===2&&region==='shore'&&mode==='play'&&!paused&&flightTrialDone)startChapterThree();
  };
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
    {q:'美猴王渡过西海后到了哪里？',a:['东胜神洲','西牛贺洲','天庭'],right:1,why:'悟空先到了南赡部洲，又渡西海，才抵达西牛贺洲。'},
    ['西牛贺洲','岸边有人指向远山。山中有一处洞府，名为斜月三星洞。']
  ],()=>openSecondRoute('拜见菩提祖师'));
}
function bodhiQuest(){
  if(region==='hall')return learned?'出观练习七十二变':'向右走，拜见菩提祖师';
  return learned?'拾桃补充元气，按 F 施展七十二变':'拜见菩提祖师';
}
function nearBodhiDoor(){
  return player.ground&&Math.abs(player.x+12-bodhiHall.door)<=36;
}
function nearBodhiExit(){
  return player.ground&&Math.abs(player.x+12-bodhiHall.entry)<=48;
}
function enterBodhiArea(next,x){
  region=next;
  checkpoint=x;
  placePlayerOnGround(secondRoutes[next],x);
  cam=next==='hall'?0:Math.min(1010,x-320);
  keys.clear();
  jumpRequestedUntil=-1;
  particles.length=0;
  $('area').textContent=next==='hall'?'斜月三星洞 · 祖师内堂':'西牛贺洲 · 灵台方寸山';
  $('hint').textContent=next==='hall'?'向右走可见祖师，左侧大门可离开。':'在观外按 F 变化，按 S 消耗 5 点灵气驾云。';
  openSecondRoute(bodhiQuest());
}
function interactChapterTwo(){
  if(transformedForm){toast('恢复原形后即可互动。');return;}
  if(region==='shore'&&nearBodhiDoor())enterBodhiArea('hall',bodhiHall.entry);
  else if(region==='hall'&&nearBodhiExit())enterBodhiArea('shore',bodhiHall.door-68);
}
function meetBodhi(){
  chapterTwoDialogue([
    ['菩提祖师','你越海寻来，求的是什么？'],
    ['美猴王','弟子愿拜您为师，学习长生与变化之道。'],
    ['菩提祖师','好。赐你姓孙，法名悟空。我传你七十二变和驾云之法。出观后按 F 变化，按 S 唤筋斗云。'],
    {q:'菩提祖师给美猴王起了什么法名？',a:['悟净','悟能','悟空'],right:2,why:'菩提祖师赐他姓孙，法名悟空。'}
  ],()=>{
    learned=true;
    openSecondRoute(bodhiQuest());
  });
}
function canCastTravelSpell(){
  return chapter>=2&&mode==='play'&&!paused&&!slamActive&&learned&&!transformedForm;
}
function castTransform(){
  if(!canCastTravelSpell())return;
  if(chapter===2&&region==='hall'){toast('到观外再练习七十二变。');return;}
  if(chapter===4&&fourthScene==='stable')return;
  if(energy<2){toast('元气不足。沿路拾两颗仙桃再来试。');return;}
  // Four equal intervals give every form a 25% chance on each cast.
  const form=forms[Math.floor(Math.random()*forms.length)];
  startTravelSpell(form,2,10);
  toast('七十二变 · 化作'+form.name);
}
const cloudForm={
  id:'cloud',name:'筋斗云',flight:true,speed:450,vertical:290,
  hint:'驾筋斗云 · 方向键自由飞行，空格上升，↓ 下降。'
};
function castCloud(){
  if(!canCastTravelSpell())return;
  if((chapter===2&&region==='hall')||(chapter===4&&fourthScene==='stable')){
    toast('到屋外再驾筋斗云。');
    return;
  }
  if(energy<5){toast('驾筋斗云需要 5 点灵气。');return;}
  startTravelSpell(cloudForm,5,20);
  chirp(230,930,.42,0,.13,'triangle');
  toast('筋斗云 · 20 秒自由飞行');
}
function startTravelSpell(form,cost,duration){
  energy-=cost;
  renderEnergy();
  transformedUntil=t+duration;
  transformedForm=form;
  $('flightDown').hidden=!form.flight&&form.id!=='squirrel';
  $('hint').textContent=form.hint;
  if(form.flight){player.vy=0;player.ground=false;}
  scatter(player.x+12,player.y+15,42,['#fff0af','#efb767','#c4e3ac'],115);
  chirp(370,720,.35,0,.09,'triangle');
  saveCurrentCheckpoint();
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
  if(updateTransformation(dt,route))return;
  updateRun(dt);
  moveOnPlatforms(route,dt);
  if(p.y>590){fallAndRespawn(route);if(mode!=='play')return;}
  if(region==='shore'){
    checkShoreTraps(route);
    if(mode!=='play')return;
    if(p.ground&&p.x>1640&&checkpoint<1600){checkpoint=1640;chapterTwoSave();}
  }else if(region==='cave'&&p.ground&&p.x>1430&&p.x<1510&&checkpoint<1430){
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
  if(region==='hall'){
    cam+=(Math.max(0,Math.min(bodhiHall.width-W,p.x-490))-cam)*Math.min(1,dt*7);
    $('area').textContent='斜月三星洞 · 祖师内堂';
    if(!learned&&p.ground&&Math.abs(p.x+12-bodhiHall.teacher)<=78)meetBodhi();
    return;
  }
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
  const left=keys.has('ArrowLeft')||(chapter<3&&keys.has('KeyA'));
  const direction=Number(right)-Number(left);
  const sprint=!transformedForm&&direction!==0&&keys.has('KeyZ')&&stamina>=27*dt;
  stamina=Math.max(0,Math.min(100,stamina+(sprint?-27:(!direction||!keys.has('KeyZ')?19:0))*dt));
  player.vx=direction*(transformedForm?.speed??(sprint?326:205));
  if(direction)player.face=direction;
  renderStamina();
}
function clearTransformation(){
  transformedUntil=0;
  transformedForm=null;
  climbingTree=null;
  $('flightDown').hidden=true;
}
function updateTransformation(dt,route){
  if(!transformedForm)return false;
  if(t>=transformedUntil){
    const wasCloud=transformedForm.id==='cloud';
    clearTransformation();
    $('counts').textContent=chapter>=3&&hasStaff?'如意金箍棒':'';
    $('hint').textContent='F 七十二变，S 驾筋斗云，长按 Z 疾跑。';
    if(chapter===2&&!flightTrialDone&&!wasCloud){
      flightTrialDone=true;
      finishChapterTwo();
      return true;
    }
    return false;
  }
  $('counts').textContent=transformedForm.name+' '+Math.ceil(transformedUntil-t)+' 秒';
  const direction=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||(chapter<3&&keys.has('KeyA')));
  const climb=keys.has('ArrowUp')||keys.has('KeyW')||keys.has('Space');
  const descend=keys.has('ArrowDown')||(transformedForm.id!=='cloud'&&keys.has('KeyS'));
  if(transformedForm.flight){
    if(direction)player.face=direction;
    player.x=Math.max(0,Math.min(route.at(-1).x+route.at(-1).w-24,player.x+direction*transformedForm.speed*dt));
    player.y=Math.max(62,Math.min(350,player.y+(Number(descend)-Number(climb))*transformedForm.vertical*dt));
  }else if(transformedForm.id==='squirrel'&&!direction&&(climbingTree||(climb&&nearClimbTree()))){
    climbingTree ||= nearClimbTree();
    player.x=climbingTree.x-12;
    const bottom=climbingTree.y-player.h;
    player.y=Math.min(bottom,Math.max(bottom-115,player.y+(Number(descend)-Number(climb))*185*dt));
    player.vy=0;
    player.ground=player.y===bottom;
    if(player.ground)climbingTree=null;
  }else{
    climbingTree=null;
    return false;
  }
  cam+=(Math.max(0,Math.min(route.at(-1).x+route.at(-1).w-W,player.x-315))-cam)*Math.min(1,dt*7);
  return true;
}
function resolvePlayerVertical(route,dt){
  const p=player;
  const oldTop=p.y;
  const oldBottom=p.y+p.h;
  p.vy+=1170*dt;
  const nextTop=p.y+p.vy*dt;
  p.ground=false;
  let collision=p.vy>=0?Infinity:-Infinity;
  for(const floor of route){
    if(p.x+p.w<=floor.x||p.x>=floor.x+floor.w)continue;
    if(p.vy>=0){
      if(oldBottom<=floor.y+3&&nextTop+p.h>=floor.y)collision=Math.min(collision,floor.y);
    }else{
      const underside=floor.y+(floor.depth??22);
      if(oldTop>=underside&&nextTop<=underside)collision=Math.max(collision,underside);
    }
  }
  if(Number.isFinite(collision)){
    p.ground=p.vy>=0;
    p.y=p.ground?collision-p.h:collision;
    p.vy=0;
  }else p.y=nextTop;
}
function bridgeStepAt(x){
  return caveBridge.find(step=>x>=step.x&&x<step.x+step.w);
}
function moveOnPlatforms(route,dt,limit=Infinity){
  const p=player;
  const onGround=p.ground;
  const oldX=p.x;
  p.x=Math.max(0,Math.min(Math.min(limit,route.at(-1).x+route.at(-1).w-24),p.x+p.vx*dt));
  const arch=route===mountainBridgeRoute;
  if(arch&&onGround&&p.y+p.h!==454){
    const nextStep=bridgeStepAt(p.x+12);
    const oldStep=bridgeStepAt(oldX+12);
    if(nextStep&&Math.abs(nextStep.y-(p.y+p.h))<=11){
      p.y=nextStep.y-p.h;
    }else if(oldStep&&!nextStep&&Math.abs(434-(p.y+p.h))<=11){
      p.y=434-p.h;
    }
  }
  const collisionRoute=arch?route.filter(floor=>!floor.bridge||(
    p.ground&&p.y+p.h!==454
      ? floor===bridgeStepAt(p.x+12)
      : true
  )):route;
  resolvePlayerVertical(collisionRoute,dt);
  if(p.ground&&p.vx&&t>=stepAt){stepAt=t+.26;footstep();}
  if(!onGround&&p.ground)footstep(true);
  applyJumpRequest();
}
function finishChapterTwo(){
  $('practiceNext').hidden=true;
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
  chapterTwoSave();
  unlockNextChapter(3,{scene:'mountain',intro:true,health:100,maxHealth:100,lives:3});
}
function drawSailboat(x,y){
  poly([[x-57,y],[x+60,y],[x+42,y+17],[x-38,y+17]],'#754b35');
  rect(x-48,y,98,5,'#c18d59');
  rect(x-2,y-91,5,94,'#613f30');
  poly([[x+4,y-86],[x+4,y-11],[x+54,y-15]],'#f2deb0');
  poly([[x-7,y-66],[x-7,y-12],[x-40,y-16]],'#bb895e');
}
function drawChapterTwo(){
  if(region==='hall'){drawBodhiHall();return;}
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
    rect(-c,0,605,432,lightGradient(-c,0,610-c,0,[[0,'#142f2b'],[.68,'#284a3d'],[1,'#5d8063']]));
    lightShaft(598-c,106,337,92,'#f4f1bd60');
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
  }else if(bodhiHall.door-c<W+130){
    drawBodhiExterior(bodhiHall.door-c,400);
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
    drawStoneFace(x,floor.y,floor.w,'#c9c99842');
  }
  if(region==='shore'){
    for(const trunk of climbTrees.shore)tree(trunk.x-c,trunk.y,1.1);
    drawShoreTraps(c);
  }
  secondPeaches[region].forEach(([baseX,y],i)=>{
    const lift=region==='shore'&&(i===2?shoreLifts[0]:i===5?shoreLifts[1]:null);
    const x=lift?lift.x+baseX:baseX;
    if(!collected.has(region+i))peach(x-c,y);
  });
  if(transformedForm){
    drawTransformation(c);
  }else{
    monkey(player.x+12-c,player.y+1,player.face,player.ground&&!!player.vx);
  }
  drawParticles(c);
  if(mode==='play'&&region==='shore'&&nearBodhiDoor()&&!transformedForm){
    drawBodhiLabel('[ E ] 进入道观',bodhiHall.door-c,277);
  }
}

function drawBodhiLabel(label,x,y){
  ctx.save();
  ctx.font='14px sans-serif';
  ctx.textAlign='center';
  const width=Math.ceil(ctx.measureText(label).width)+20;
  rect(x-width/2,y-17,width,25,'#243d35ee');
  rect(x-width/2,y-17,width,1,'#c4a66d');
  ctx.fillStyle='#fff0c5';
  ctx.fillText(label,x,y);
  ctx.restore();
}

function drawBodhiExterior(x,floor,title='斜月三星洞'){
  rect(x-106,floor-118,212,109,'#d8c6a0');
  rect(x-106,floor-115,212,12,'#ad906c');
  rect(x-111,floor-17,222,13,'#64756d');
  for(const dx of [-99,-48,40,91]){
    rect(x+dx,floor-123,9,113,'#713f37');
    rect(x+dx+6,floor-121,2,106,'#a3634b');
    rect(x+dx-2,floor-20,13,8,'#a9a08a');
  }
  for(const dx of [-86,56]){
    rect(x+dx,floor-86,29,44,'#365852');
    rect(x+dx+3,floor-82,23,36,'#d1a66f');
    for(let i=0;i<4;i++)rect(x+dx+5+i*6,floor-82,2,36,'#674736');
    for(let i=0;i<3;i++)rect(x+dx+3,floor-77+i*10,23,2,'#674736');
  }
  rect(x-29,floor-87,58,77,'#5a3932');
  rect(x-22,floor-81,44,71,'#233630');
  rect(x-22,floor-81,6,71,'#835342');
  rect(x+16,floor-81,6,71,'#9f6f50');
  rect(x-44,floor-10,88,4,'#acaa91');
  rect(x-51,floor-6,102,6,'#808c7e');
  // The stepped ridge and raised corners outline the two tiled eaves.
  drawBodhiRoof(x,floor-116,126,54);
  drawBodhiRoof(x,floor-154,75,32);
  rect(x-36,floor-110,72,22,'#694638');
  rect(x-33,floor-108,66,18,'#243e36');
  ctx.save();
  ctx.font='bold 12px serif';
  ctx.textAlign='center';
  ctx.fillStyle='#e9ca87';
  ctx.fillText(title,x,floor-95);
  ctx.restore();
  for(const dx of [-58,58])drawBodhiLantern(x+dx,floor-109);
}

function drawBodhiRoof(x,y,half,height){
  const ridge=y-height;
  poly([[x-half-8,y-10],[x-half+10,y-5],[x-half+37,y-15],[x-25,ridge],
    [x+24,ridge],[x+half-37,y-15],[x+half-10,y-5],[x+half+8,y-10],
    [x+half-4,y],[x-half+4,y]],'#1d393a');
  for(let i=1;i<=3;i++){
    const reach=24+(half-35)*i/4;
    const row=ridge+(height-7)*i/4;
    rect(x-reach,row,reach*2,2,i%2?'#4d7771':'#3c625e');
    for(let j=-reach+8;j<reach-5;j+=12)rect(x+j,row+2,2,5,'#304f50');
  }
  rect(x-27,ridge-2,54,4,'#87a492');
  rect(x-half+5,y-2,half*2-10,4,'#aa8b65');
}

function drawBodhiLantern(x,y){
  rect(x-1,y,2,12,'#b79866');
  rect(x-7,y+11,14,15,'#803c37');
  rect(x-5,y+13,10,11,'#de8050');
  rect(x-2,y+13,4,11,'#f5b368');
  rect(x-5,y+25,10,2,'#e0ae65');
  rect(x-1,y+27,2,6,'#d4744f');
}

function drawBodhiHall(){
  const c=cam, floor=bodhiHall.floor;
  rect(0,0,W,H,lightGradient(0,0,0,H,[[0,'#282e2b'],[.4,'#66503a'],[1,'#9c7756']]));
  rect(0,108,W,14,'#6d4434');
  rect(0,122,W,3,'#b78c5c');
  for(let i=0;i<6;i++){
    const x=26+i*205-c;
    rect(x,139,164,244,'#947654');
    rect(x+5,145,154,231,'#b09168');
    rect(x+5,338,154,38,'#755140');
    rect(x+172,106,15,320,'#663d31');
    rect(x+182,116,3,302,'#a66e4c');
    rect(x+167,410,25,16,'#897d68');
    if(i===1||i===2){
      rect(x+32,168,96,123,'#503e32');
      rect(x+39,175,82,109,'#d9bf88');
      for(let j=0;j<5;j++)rect(x+42+j*17,175,3,109,'#88674c');
      for(let j=0;j<5;j++)rect(x+39,178+j*22,82,3,'#88674c');
      lightShaft(x+117,180,240,48,'#ffe4a954');
    }
    if(i<5&&i%2===0){
      glow(x+145,178,76,'#ffc47b47');
      drawBodhiLantern(x+145,138);
    }
  }
  const door=bodhiHall.entry+12-c;
  rect(door-34,250,68,176,'#663f32');
  rect(door-26,257,52,169,'#d9c08e');
  rect(door-24,257,12,169,'#715540');
  rect(door+18,257,8,169,'#886347');
  rect(door-37,245,74,7,'#b58a5e');
  rect(0,floor,W,H-floor,'#76523b');
  rect(0,floor,W,3,'#d0a474');
  for(let i=-1;i<16;i++){
    const x=i*76-c%76;
    rect(x,floor+20+(i%2)*12,1,78,'#674634');
    rect(x+3,floor+10+(i%3)*21,42,1,'#aa7d54');
  }
  const master=bodhiHall.teacher-c;
  rect(master-44,235,88,110,'#563d31');
  rect(master-38,240,76,99,'#d6be8a');
  ctx.save();
  ctx.textAlign='center';
  ctx.font='bold 22px serif';
  ctx.fillStyle='#644b38';
  ctx.fillText('道',master,298);
  ctx.restore();
  rect(master-58,floor-10,116,10,'#67473a');
  rect(master-55,floor-12,110,3,'#bd9364');
  poly([[master-30,floor-13],[master-20,floor-43],[master-9,floor-50],[master+10,floor-50],
    [master+22,floor-37],[master+31,floor-13]],'#3c4644');
  poly([[master-27,floor-15],[master-18,floor-40],[master-7,floor-47],[master+9,floor-47],
    [master+19,floor-35],[master+28,floor-15]],'#88978a');
  poly([[master-16,floor-35],[master-5,floor-39],[master+8,floor-30],[master+16,floor-18],
    [master+5,floor-17],[master-2,floor-26]],'#c1bea0');
  rect(master-10,floor-64,20,18,'#d9b693');
  rect(master-12,floor-66,24,5,'#e3d8ba');
  rect(master-5,floor-73,11,7,'#dbd4ba');
  rect(master-6,floor-58,3,2,'#413b36');rect(master+4,floor-58,3,2,'#413b36');
  poly([[master-9,floor-52],[master+9,floor-52],[master+4,floor-37],[master-1,floor-32],
    [master-6,floor-42]],'#e9e0c4');
  contactShadow(player.x+12-c,player.y+player.h,24);
  monkey(player.x+12-c,player.y+1,player.face,player.ground&&!!player.vx);
  if(mode==='play'&&nearBodhiExit())drawBodhiLabel('[ E ] 离开道观',door,232);
}

function drawTransformation(camera){
  const {x,y,face,vx}=player;
  if(transformedForm.id==='cloud'){
    const center=x+12-camera, base=y+33, bob=Math.sin(t*13)*2;
    const stream=keys.has('ArrowLeft')||keys.has('ArrowRight')||keys.has('KeyA')||keys.has('KeyD');
    glow(center,base,56,'#f4d47b4c');
    poly([[center-39,base+4+bob],[center-34,base-1+bob],[center-20,base-3+bob],
      [center-13,base-10+bob],[center+3,base-10+bob],[center+11,base-6+bob],
      [center+25,base-6+bob],[center+34,base+1+bob],[center+27,base+9+bob],
      [center-24,base+10+bob]],'#ba8e59');
    rect(center-34,base+1+bob,61,6,'#ebbe67');
    rect(center-21,base-3+bob,47,6,'#ffe6a4');
    rect(center-11,base-8+bob,23,5,'#fff2c7');
    for(let i=0;i<5;i++){
      const trail=center-face*(33+(i*13+t*220)%67);
      rect(trail,base+3+i%3*3,stream?16:7,2,i%2?'#ffdd92a8':'#fff0c0b0');
    }
    monkey(center,y-4+bob,face,false,.91,false,chapter>=3&&hasStaff);
    return;
  }
  if(transformedForm.id==='crane'){
    drawCrane(x+12-camera,y+15,face);
    return;
  }
  ctx.save();
  ctx.translate(Math.round(x+12-camera),Math.round(y+(transformedForm.flight?15:34)));
  ctx.scale(face,1);
  switch(transformedForm.id){
    case 'fly':{
      const wing=Math.round(Math.sin(t*42)*3);
      poly([[-4,0],[-11,-4-wing],[-12,-7-wing],[-6,-7-wing],[1,-2]],'#365460');
      poly([[-4,-1],[-10,-4-wing],[-10,-6-wing],[-6,-6-wing],[-1,-2]],'#b3dbd5');
      poly([[-3,0],[-9,4+wing],[-5,6+wing],[2,2]],'#719c9e');
      rect(-7,-2,10,6,'#262b3c');
      rect(-6,-2,7,3,'#4f7481');
      rect(-4,0,1,4,'#354957');
      rect(-6,3,2,2,'#2d3544');rect(-2,3,2,2,'#2d3544');
      rect(1,-3,6,6,'#422a38');
      rect(3,-2,4,4,'#bd5360');rect(4,-2,2,1,'#f3a491');
      break;
    }
    case 'tiger':{
      const stride=vx?Math.round(Math.sin(t*19)*6):0;
      const tail=Math.sin(t*6)*4;
      const orange='#d88b43', amber='#f0b467', ink='#4c342e', pale='#f4d8a7';
      poly([[-28,-13],[-40,-18-tail],[-45,-29-tail],[-43,-33-tail],[-39,-32-tail],
        [-35,-22-tail],[-25,-18]],orange);
      rect(-44,-31-tail,5,5,ink);rect(-38,-22-tail,5,4,ink);
      rect(-21,-12,7,9,'#a96843');rect(16,-12,7,9,'#a96843');
      poly([[-28,-8],[-27,-21],[-20,-30],[-6,-34],[17,-31],[26,-24],[23,-12],[13,-7],[-10,-7]],ink);
      poly([[-26,-11],[-25,-21],[-18,-28],[-6,-31],[17,-29],[23,-22],[21,-13],[11,-10]],orange);
      poly([[-23,-22],[-15,-28],[-5,-30],[15,-28],[22,-23],[9,-24],[-5,-26],[-16,-24]],amber);
      poly([[-22,-17],[-10,-13],[6,-12],[18,-16],[15,-10],[-12,-9]],pale);
      for(const stripe of [-19,-9,2,13]){
        poly([[stripe,-28],[stripe+5,-29],[stripe+1,-22],[stripe+3,-18],[stripe-2,-21]],ink);
      }
      for(const x of [-23+stride,13-stride]){
        poly([[x-2,-13],[x+9,-14],[x+7,-7],[x+10,-3],[x+10,0],[x-3,0],[x-3,-5]],ink);
        rect(x,-13,7,9,orange);rect(x,-10,6,2,ink);
        rect(x-1,-4,10,3,pale);rect(x+3,-3,1,2,'#af825d');
      }
      rect(16,-38,7,8,ink);rect(28,-38,7,9,ink);
      rect(18,-36,3,4,'#d98f72');rect(30,-36,3,4,'#d98f72');
      poly([[13,-31],[21,-34],[34,-33],[39,-25],[38,-14],[31,-9],[18,-12],[13,-20]],ink);
      poly([[16,-30],[22,-32],[32,-31],[36,-25],[36,-17],[29,-12],[20,-15],[16,-22]],amber);
      rect(17,-26,7,3,ink);rect(28,-28,7,3,ink);
      rect(25,-24,4,3,'#fff1a2');rect(27,-24,2,3,ink);
      rect(29,-20,9,7,pale);rect(36,-19,4,3,ink);rect(32,-15,7,2,ink);
      rect(34,-15,2,2,'#fff4d3');
      if(vx){
        ctx.globalAlpha=.45;
        rect(-48,-14,9,2,'#f0bc75');rect(-55,-8,12,2,'#e6ab62');
        ctx.globalAlpha=1;
      }
      break;
    }
    case 'squirrel':{
      const tail=climbingTree?3:Math.round(Math.sin(t*13)*2);
      const stride=vx?Math.round(Math.sin(t*24)*3):0;
      const dark='#512f30', russet='#bf613e', amber='#e98b51', cream='#f1cc97';
      poly([[-8,-3],[-20,-6],[-28,-14-tail],[-28,-23-tail],[-22,-29-tail],
        [-14,-28-tail],[-9,-22-tail],[-12,-16-tail],[-15,-13-tail],[-8,-9]],dark);
      poly([[-9,-6],[-20,-9],[-26,-15-tail],[-26,-22-tail],[-21,-27-tail],
        [-15,-26-tail],[-11,-22-tail],[-14,-17-tail],[-19,-15-tail],[-15,-11]],russet);
      poly([[-25,-21-tail],[-21,-26-tail],[-16,-25-tail],[-13,-22-tail],
        [-19,-23-tail],[-22,-19-tail],[-21,-15-tail]],amber);
      poly([[-11,-4],[-10,-13],[-4,-17],[5,-15],[9,-8],[8,-2],[-7,-1]],dark);
      poly([[-9,-5],[-7,-13],[-3,-15],[4,-13],[7,-8],[5,-3],[-5,-3]],russet);
      poly([[0,-12],[6,-16],[9,-12],[8,-6],[5,-4],[2,-6]],cream);
      poly([[3,-17],[3,-24],[7,-25],[9,-20],[13,-20],[16,-16],[18,-13],[14,-10],[6,-11]],dark);
      rect(5,-22,2,4,'#dd986f');rect(6,-18,8,6,amber);
      rect(11,-14,6,3,cream);rect(11,-17,2,2,dark);rect(12,-17,1,1,'#fff2cc');
      rect(-8+stride,-4,6,4,dark);rect(5-stride,-4,6,4,dark);
      rect(-7+stride,-2,5,1,amber);rect(6-stride,-2,4,1,cream);
      break;
    }
  }
  ctx.restore();
}

function drawCrane(x,y,face){
  ctx.save();
  ctx.translate(Math.round(x),Math.round(y));
  ctx.scale(face,1);
  const wing=Math.round(Math.sin(t*14)*13);
  const farWing=Math.round(Math.sin(t*14-.45)*10);
  const ink='#313341', shadow='#a5adad', white='#f9efd9';
  poly([[-9,-4],[-21,farWing-13],[-14,farWing-17],[1,farWing-5],[6,-4]],'#687786');
  poly([[-9,-2],[-18,farWing-12],[-14,farWing-15],[-1,farWing-6],[5,-3]],'#d9ddd1');
  poly([[-9,3],[-23,7],[-32,7],[-33,9],[-20,9],[-6,5]],'#805f4c');
  poly([[-24,-4],[-13,-5],[1,-4],[9,-10],[16,-14],[23,-14],[27,-10],
    [24,-6],[17,-7],[11,0],[3,6],[-13,7],[-22,3]],ink);
  poly([[-21,-3],[-10,-3],[2,-2],[10,-8],[16,-12],[23,-12],[25,-10],
    [22,-8],[17,-9],[10,-1],[2,4],[-11,5],[-19,2]],white);
  poly([[-17,1],[-6,2],[4,0],[1,4],[-11,5]],shadow);
  rect(20,-14,5,2,'#b84340');rect(23,-11,1,1,ink);
  poly([[25,-11],[35,-9],[25,-8]],'#edbe69');
  poly([[-13,2],[-25,wing-12],[-28,wing-19],[-24,wing-19],[-14,wing-12],
    [-7,wing-8],[3,0],[-5,6]],ink);
  poly([[-12,1],[-23,wing-12],[-25,wing-17],[-20,wing-14],[-12,wing-9],
    [-6,wing-6],[1,0],[-5,4]],white);
  poly([[-21,wing-11],[-17,wing-9],[-11,wing-4],[-5,1],[-12,0]],shadow);
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
const caveBridge=Array.from({length:25},(_,i)=>({
  x:981+i*10,y:Math.round(434-Math.sin(i*Math.PI/24)*56),w:10,depth:12,bridge:true
}));
const mountainBridgeRoute=[...caveBridge,...thirdRoutes.mountain];
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

function saveChapterThree(){
  return writeGameSave({
    chapter:3,scene:thirdScene,hallEntered,hasStaff,energy,thirdPeaches:[...thirdPeachesTaken],trained,dragonSpoken,namesCleared,returnedFromUnderworld,checkpoint,...vitalSave()
  });
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
  if(chapter===1)return save();
  if(chapter===2)return chapterTwoSave();
  if(chapter===3)return saveChapterThree();
  return saveChapterFour();
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
  if(transformedForm){
    clearTransformation();
    $('counts').textContent=chapter>=3&&hasStaff?'如意金箍棒':'';
  }
  placePlayerOnGround(route,checkpoint);
  const maxCam=chapter===1?2540:chapter===2?1010:chapter===3?930:fourthCameraLimit();
  cam=Math.max(0,Math.min(maxCam,player.x-315));
  immuneUntil=t+.85;
}
function fallAndRespawn(route){
  hurtPlayer(20);
  if(health===0){loseLife(route);return;}
  respawnPlayer(route);
  toast('坠落 · 生命 −20');
  saveCurrentCheckpoint();
}
function loseLife(route){
  if(death||mode==='gameover')return;
  lives=Math.max(0,lives-1);
  refreshHealth();
  clearTransformation();
  jumpRequestedUntil=-1;
  keys.clear();
  mode='dying';
  death={route,left:1.9};
  $('touch').hidden=true;
  $('pause').hidden=true;
  $('deathLives').textContent='剩余 '+lives+' 条命';
  $('deathPanel').hidden=false;
  chirp(151,62,.48,0,.10,'triangle');
}
function updateDeath(dt){
  death.left-=dt;
  if(death.left>0)return;
  const {route}=death;
  death=null;
  $('deathPanel').hidden=true;
  function revive(){
    health=maxHealth;
    refreshHealth();
    respawnPlayer(route);
    $('ending').hidden=true;
    $('touch').hidden=false;
    $('pause').hidden=false;
    keys.clear();
    mode='play';
    $('stage').focus?.({preventScroll:true});
    saveCurrentCheckpoint();
  }
  if(lives>0){revive();return;}
  mode='gameover';
  $('ending').hidden=false;
  $('ending').innerHTML='<span class="eyebrow">TRY AGAIN</span><h2>三条命已用完</h2><button id="retryCheckpoint" class="primary">从重生点再试 →</button>';
  $('retryCheckpoint').onclick=()=>{
    lives=3;
    revive();
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
  $('cloudButton').hidden=false;
  $('energy').hidden=false;
  $('stamina').hidden=false;
  renderStamina();
  showHealth();
  $('area').textContent={mountain:'花果山 · 水帘洞',palace:'东海 · 水晶宫',underworld:'幽冥 · 森罗殿'}[thirdScene];
  $('counts').textContent=hasStaff?'如意金箍棒':'';
  refreshHealth();
  const quest=thirdScene==='mountain'
    ? returnedFromUnderworld?'从桥边走回猴群，告诉它们幽冥的事':trained?'走上小拱桥，按 E 下到河边，再潜入东海':'找到猴群，带它们操练兵器'
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
    ['东海龙王','海藏里有一根定海神铁。你沿殿向右走，若能拿得动，便试试它。'],
    {q:'龙王让悟空去海藏试什么？',a:['定海神铁','一把宝剑','一面宝镜'],right:0,why:'普通兵器太轻，龙王便指点悟空去试定海神铁。'}
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
        ['猴群','列阵！举刀！挺枪！出剑！'],
        ['孙悟空','这些凡间兵器给孩儿们练手还行，我一用力就觉得太轻，根本不趁手。'],
        ['老猴','洞中小拱桥下的河水通着东海。大王何不去龙宫求一件宝物？']
      ],()=>{trained=true;openThirdRoute();});
    }else if(!returnedFromUnderworld&&trained&&player.x>=1010&&player.x<=1192&&player.ground&&player.y+player.h===454){
      switchThirdScene('palace');
      openThirdRoute();
    }else if(trained&&standingAboveRiver()){
      player.y=454-player.h;
      player.vy=0;
      toast('来到桥下。再按 E 潜入东海。');
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
      ['孙悟空','把生死簿拿来。我自己翻。'],
      {q:'悟空要翻开哪一册来查名字？',a:['功德簿','生死簿','兵器谱'],right:1,why:'生死簿记载姓名与寿数，悟空想亲自查阅。'}
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
  if(chapter<3||mode!=='play'||paused||!hasStaff||t<transformedUntil||slamActive||t-swingAt<.40)return;
  if(chapter===4&&fourthScene!=='escape')return;
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
  for(const demon of staffTargets()){
    const ahead=(demon.x-(player.x+12))*swingFacing;
    if(demon.hp<=0||ahead< -14||ahead>83+combo*8||Math.abs(demon.y-player.y-34)>44)continue;
    hitEnemy(demon,damage);
  }
}
function hitEnemy(demon,damage){
  const applied=Math.round(damage*(1-(demon.armor??0))*10)/10;
  demon.hp=Math.max(0,Math.round((demon.hp-applied)*10)/10);
  showDamage(demon.x,demon.y-48,applied);
  demon.aggro=true;
  demon.dir=Math.sign(player.x+12-demon.x)||demon.dir;
  demon.strikeAt=0;
  demon.readyAt=t+.34;
  scatter(demon.x,demon.y-18,damage>=30?48:20+combo*5,['#f6c575','#fcdfae','#aa6975'],85);
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
  for(const demon of staffTargets()){
    if(demon.hp>0&&Math.abs(demon.x-slamImpact.x)<=94&&Math.abs(demon.y-slamImpact.y)<=37)hitEnemy(demon,30);
  }
}
function staffTargets(){
  if(chapter===4)return fourthScene==='escape'?heavenGuards:[];
  return thirdCombatActive()?demons:[];
}
function thirdCombatActive(){
  return !hallEntered&&((thirdScene==='underworld'&&!namesCleared)||(thirdScene==='palace'&&hasStaff));
}
function updateDemons(dt,route=thirdRoutes[thirdScene],enemies=demons){
  for(const demon of enemies){
    if(demon.hp<=0)continue;
    const gap=player.x+12-demon.x;
    const heightGap=Math.abs(player.y+34-demon.y);
    const sameHeight=heightGap<36;
    const invisible=transformedForm?.id==='fly';
    if(transformedForm?.id==='tiger'&&Math.abs(gap)<145&&heightGap<65){
      demon.fearUntil=t+.9;
      demon.fearDirection=-Math.sign(gap)||-demon.dir;
    }
    const fleeing=t<(demon.fearUntil??0);
    if(invisible||fleeing){
      demon.aggro=false;
      demon.strikeAt=0;
    }else if(Math.abs(gap)<155&&heightGap<(transformedForm?.id==='crane'?140:75)){
      demon.aggro=true;
    }
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
      const lightning=demon.kind==='thunder'&&Math.random()<.2;
      if(sameHeight&&attackGap>=-10&&attackGap<demon.reach+11&&t>=immuneUntil){
        hurtPlayer(demon.damage,true);
        if(lightning){
          hurtPlayer(20,true);
          strikeHeavenLightning([player.x+12]);
        }
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
    }else if(fleeing){
      demon.dir=demon.fearDirection;
    }else if(!demon.aggro&&(demon.x<=demon.min||demon.x>=demon.max)){
      demon.dir=demon.x<=demon.min?1:-1;
    }
    if(!demon.strikeAt){
      const target=demon.landing??(fleeing?demon.x+demon.dir*100:demon.aggro?player.x+12:demon.dir>0?demon.max:demon.min);
      const distance=target-demon.x;
      const speed=demon.landing!==null?186:fleeing?164:demon.aggro?demon.speed:65;
      demon.x+=Math.sign(distance)*Math.min(Math.abs(distance),speed*dt);
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
  return hallEntered?royalHalls[thirdScene].inside:thirdScene==='mountain'?mountainBridgeRoute:thirdRoutes[thirdScene];
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
  if(updateTransformation(dt,route)){
    player.x=Math.max(hallEntered?hall.door-24:0,Math.min(player.x,doorLimit));
    if(thirdScene==='palace'&&!dragonSpoken)player.x=Math.min(player.x,1020);
    if(thirdCombatActive())updateDemons(dt);
    if(health===0){clearTransformation();loseLife(route);}
    return;
  }
  const limit=Math.min(doorLimit,thirdScene==='palace'&&!dragonSpoken?1030:Infinity);
  moveStaffPlayer(route,dt,limit,hallEntered?hall.door-24:0);
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
function moveStaffPlayer(route,dt,limit=Infinity,minX=0){
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
    if(player.x<=minX&&player.vx<0)player.vx=0;
    moveOnPlatforms(route,dt,limit);
  }
  if(slamActive&&player.ground)landStaffSlam();
}
function finishChapterThree(){
  mode='end';
  $('stamina').hidden=true;$('health').hidden=true;$('energy').hidden=true;
  $('quest').hidden=true;
  $('hud').hidden=true;
  $('touch').hidden=true;
  $('pause').hidden=true;
  $('ending').hidden=false;
  $('ending').innerHTML='<span class="eyebrow">CHAPTER COMPLETE</span><h2>龙宫与幽冥</h2><div class="cn-title">第三关完成 · 九幽除名</div><p>获得如意金箍棒 · 生死簿已除名</p><button class="primary" id="nextFourth">第四关 · 官封弼马温 →</button><button class="subtle" id="replayThird">再游第三关 ↻</button>';
  const fourthStart={energy,health:maxHealth,maxHealth,lives:3};
  $('nextFourth').onclick=()=>startChapterFour(fourthStart);
  $('replayThird').onclick=()=>startChapterThree();
  saveChapterThree();
  unlockNextChapter(4,{intro:true,...fourthStart});
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
  if(sea&&!hallEntered){
    for(let i=-1;i<5;i++)lightShaft(i*264-c*.08+Math.sin(t*.24+i)*17,0,530,92,'#b9f9e061');
  }
  if(!sea&&!mountainScene&&!hallEntered){
    rect(0,478,W,62,lightGradient(0,478,0,H,[[0,'#ed8c52'],[.28,'#a94737'],[1,'#692d36']]));
    rect(0,360,W,118,lightGradient(0,360,0,478,[[0,'#f68c5200'],[1,'#f68c525c']]));
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
  const floorRoute=mountainScene?thirdRoutes.mountain:currentThirdRoute();
  for(const floor of floorRoute){
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
      rect(0,floor.y+5,W,80,lightGradient(0,floor.y+5,0,floor.y+85,[[0,sea?'#96d3bf44':'#dd9b6744'],[1,'#17252d48']]));
      for(let i=-1;i<13;i++){
        const tile=i*86-c%86;
        rect(tile,floor.y+15,80,2,sea?'#6c9990':'#8a5c68');
      }
      continue;
    }
    rect(x,floor.y,floor.w,110,mountainScene?'#354c3e':sea?'#294955':'#352735');
    rect(x,floor.y,floor.w,7,mountainScene?'#8b9a72':sea?'#77aaa1':'#a5726c');
    for(let i=12;i<floor.w;i+=26)rect(x+i,floor.y+17+i%14,11,4,mountainScene?'#617359':sea?'#48707a':'#604552');
    drawStoneFace(x,floor.y,floor.w,sea?'#a3d7c44c':'#cfa48944');
  }
  if(mountainScene){
    for(const trunk of climbTrees.mountain)tree(trunk.x-c,trunk.y,1.1);
    for(let i=0;i<4;i++){
      const x=263+i*43-c;
      const face=i%2?-1:1;
      monkey(x,402,face,trained,.8);
      const angle=trained?.36+Math.sin(t*8+i)*.57:.28;
      drawTrainingWeapon(x+face*7,423,face,angle,i%3);
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
  if(transformedForm){
    drawTransformation(c);
  }else{
    const x=player.x+12-c;
    if(t>=immuneUntil||Math.floor(t*22)%2===0){
      const spinAge=(t-swingAt)/.37;
      if(combo===3&&spinAge<1){
        ctx.save();
        ctx.translate(x,player.y+17);
        ctx.rotate(spinAge*Math.PI*2*swingFacing);
        monkey(0,-17,player.face,false,1,false,hasStaff);
        ctx.restore();
      }else{
        const lean=t-swingAt<.24?swingFacing*(combo===2?3:5):0;
        monkey(x+lean,player.y+1,player.face,player.ground&&!!player.vx,1,false,hasStaff);
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
  drawParticles(c);
  let label='';
  if(mountainScene){
    if(returnedFromUnderworld&&player.x>=235&&player.x<=490)label='与猴群交谈';
    if(!returnedFromUnderworld&&!trained&&player.x>=235&&player.x<=490)label='操练猴群';
    if(!returnedFromUnderworld&&trained&&standingAboveRiver())label='下到桥底';
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
function standingAboveRiver(){
  const step=bridgeStepAt(player.x+12);
  return player.ground&&player.x>=1040&&player.x<=1160&&step&&Math.abs(player.y+player.h-step.y)<=6;
}
function drawTrainingWeapon(x,y,face,angle,kind){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(face,1);
  ctx.rotate(angle);
  const edge='#e1e5ce', steel='#a4b5b2', dark='#33434a', gold='#d8aa69';
  rect(-1.5,-5,3,11,'#503631');
  rect(-1.5,4,3,2,gold);
  if(kind===1){
    rect(-1.5,-29,3,37,'#6e4834');
    rect(.5,-29,1,36,'#a97850');
    poly([[-4,-28],[-3,-33],[0,-41],[3,-33],[4,-28],[0,-25]],dark);
    poly([[-2,-29],[0,-38],[2,-30],[0,-27]],edge);
    rect(-2.5,-27,5,2,gold);
  }else if(kind===0){
    poly([[-2,-6],[-3,-18],[0,-26],[5,-31],[7,-25],[6,-18],[2,-6]],dark);
    poly([[-1,-8],[-2,-18],[1,-25],[5,-28],[5,-20],[1,-8]],steel);
    poly([[0,-9],[2,-20],[5,-28],[5,-21],[2,-12]],edge);
    rect(-4,-7,8,2,gold);
  }else{
    poly([[-3,-6],[-3,-24],[0,-32],[3,-24],[3,-6]],dark);
    poly([[-2,-8],[-2,-24],[0,-29],[2,-24],[2,-8]],steel);
    rect(0,-24,1,16,edge);
    rect(-5,-7,10,2,gold);
  }
  rect(-2,0,4,3,'#bd8c59');
  ctx.restore();
}

function drawCaveBridge(camera){
  const left=caveBridge[0].x-camera;
  for(const [i,step] of caveBridge.entries()){
    const x=step.x-camera,y=step.y;
    rect(x,y,11,step.depth,'#87917a');
    rect(x,y,11,3,'#c2c4a5');
    rect(x,y+10,11,2,'#596c5e');
    rect(x,y-16,11,3,'#85967f');
    if(i%3===0)rect(x+4,y-16,3,17,'#a5ae8f');
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
  rect(0,0,W,H,lightGradient(0,0,0,H,[[0,sea?'#172e3e':'#231c30'],
    [.48,wall],[1,sea?'#326469':'#754557']]));
  glow(hall.throne-c,319,237,sea?'#d3c99552':'#ef9d6652');
  rect(0,117,W,11,trim);
  rect(0,134,W,5,sea?'#749e8a':'#915c64');
  for(let i=-1;i<11;i++){
    const x=i*110-c%110;
    glow(x+42,212,74,sea?'#f1df9b51':'#ffb87269');
    rect(x,145,14,283,column);
    rect(x+10,155,3,251,sea?'#95aaa275':'#cc947073');
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
  if(dragon)drawEastSeaDragonKing(0,-12);
  else drawRoyal(0,-12);
  ctx.restore();
}
function drawEastSeaDragonKing(x,y){
  ctx.save();
  ctx.translate(x,y);
  const ink='#1e323a', deep='#254c50', jade='#3e7974', mint='#87b7a0';
  const gold='#d1a25e', glint='#f6d58e', cream='#e9ddbe';
  // Seated silhouette, with broad silk sleeves and a flared skirt.
  poly([[-26,1],[-22,-15],[-21,-29],[-12,-36],[11,-36],[21,-28],[23,-13],[26,1]],ink);
  poly([[-23,-1],[-19,-15],[-19,-27],[-11,-34],[10,-34],[19,-27],[21,-14],[23,-1]],deep);
  poly([[-19,-26],[-11,-31],[-6,-18],[-10,-8],[-23,-4],[-21,-15]],jade);
  poly([[9,-33],[18,-27],[20,-14],[23,-4],[10,-7],[6,-18]],jade);
  poly([[-8,-28],[0,-33],[10,-29],[7,-17],[11,-2],[-11,-2],[-7,-16]],'#58938a');
  poly([[-8,-30],[-4,-28],[9,-16],[7,-13],[-6,-23]],glint);
  poly([[9,-28],[12,-25],[1,-18],[-3,-20]],gold);
  rect(-13,-10,26,3,gold);rect(-4,-11,8,5,'#674a3a');
  rect(-2,-10,4,3,glint);
  for(const side of [-1,1]){
    ctx.save();
    ctx.scale(side,1);
    poly([[10,-24],[16,-25],[20,-18],[17,-14],[12,-15],[13,-19],[15,-19],[16,-17],[17,-19],[15,-22],[11,-22]],gold);
    rect(14,-10,6,2,mint);
    rect(17,-7,5,1,gold);
    ctx.restore();
  }
  rect(-23,-2,46,2,glint);rect(-15,0,30,1,gold);
  // Horns sit behind the pale swept mane.
  for(const side of [-1,1]){
    ctx.save();
    ctx.scale(side,1);
    poly([[7,-45],[13,-53],[14,-61],[12,-68],[16,-70],[19,-62],[18,-57],[23,-62],
      [26,-63],[25,-58],[19,-51],[15,-45]],'#754f40');
    poly([[9,-45],[15,-53],[16,-61],[14,-67],[16,-68],[17,-61],[17,-55],[23,-60],
      [24,-60],[23,-57],[17,-51],[13,-46]],glint);
    poly([[6,-51],[16,-50],[22,-46],[18,-43],[24,-39],[20,-34],[21,-30],
      [15,-27],[10,-33],[8,-40]],'#9b9882');
    poly([[11,-49],[18,-47],[20,-44],[16,-43],[21,-39],[19,-35],[16,-39],[13,-35],[11,-42]],cream);
    ctx.restore();
  }
  poly([[-14,-43],[-10,-53],[8,-53],[15,-47],[16,-35],[10,-28],[-8,-28],[-15,-34]],ink);
  poly([[-12,-43],[-9,-51],[7,-51],[13,-46],[14,-36],[8,-30],[-8,-30],[-13,-35]],jade);
  poly([[-9,-48],[-4,-51],[7,-50],[11,-46],[5,-46],[1,-43],[-5,-45]],mint);
  rect(-2,-50,5,2,glint);rect(-1,-49,3,2,'#9d653f');
  poly([[-11,-45],[-6,-46],[-2,-42],[-7,-42],[-10,-43]],glint);
  poly([[3,-42],[7,-46],[12,-45],[10,-43],[7,-42]],glint);
  rect(-8,-41,5,2,'#fff2af');rect(5,-41,5,2,'#fff2af');
  rect(-5,-41,1,2,ink);rect(7,-41,1,2,ink);
  poly([[-10,-37],[-5,-40],[6,-40],[12,-36],[10,-32],[6,-30],[-7,-30],[-11,-33]],'#8d6b54');
  poly([[-8,-37],[-4,-39],[6,-39],[10,-36],[8,-33],[-8,-33]],'#e1bb82');
  rect(-6,-36,2,1,'#5d473d');rect(6,-36,2,1,'#5d473d');
  rect(-5,-32,10,1,ink);
  poly([[-8,-33],[-3,-32],[4,-32],[9,-33],[7,-26],[2,-19],[-2,-18],[-6,-24]],'#a8a28a');
  poly([[-6,-32],[4,-31],[7,-32],[5,-26],[1,-21],[-2,-23]],cream);
  for(const side of [-1,1]){
    ctx.save();
    ctx.scale(side,1);
    poly([[7,-34],[13,-35],[19,-32],[24,-25],[24,-22],[22,-22],[21,-25],[16,-30],[12,-31],[7,-31]],ink);
    poly([[8,-34],[13,-34],[18,-31],[23,-25],[23,-23],[21,-26],[17,-30],[12,-32],[8,-32]],cream);
    ctx.restore();
  }
  ctx.restore();
}
function drawRoyal(x,y){
  const robe='#765266';
  const trim='#d4a875';
  poly([[x-23,y],[x-18,y-22],[x-10,y-31],[x+10,y-31],[x+18,y-23],[x+23,y]],'#272833');
  poly([[x-21,y-2],[x-16,y-22],[x-9,y-29],[x+9,y-29],[x+16,y-23],[x+21,y-2]],robe);
  poly([[x+6,y-29],[x+15,y-23],[x+19,y-4],[x+12,y-7],[x+8,y-20]],'#9d6b7d');
  poly([[x-15,y-19],[x-10,y-17],[x-14,y-4],[x-20,y-3]],'#513b57');
  rect(x-19,y-3,38,2,trim);
  rect(x-15,y-7,33,3,trim);
  rect(x-4,y-27,8,18,'#a47277');
  rect(x-13,y-22,4,12,trim);rect(x+11,y-22,4,12,trim);
  for(let i=0;i<3;i++){
    rect(x-12+i*11,y-13-(i%2)*5,5,2,trim);
    rect(x-10+i*11,y-15-(i%2)*5,1,6,trim);
  }
  rect(x-3,y-17,6,6,trim);
  rect(x-1,y-16,2,4,'#8b4651');
  rect(x-9,y-44,19,17,'#d5a98a');
  rect(x-6,y-38,3,2,'#302f3a');rect(x+5,y-38,3,2,'#302f3a');
  poly([[x-24,y-51],[x-15,y-49],[x-10,y-50],[x-10,y-56],[x+10,y-56],
    [x+10,y-50],[x+16,y-49],[x+24,y-51],[x+23,y-46],[x+13,y-44],
    [x-14,y-44],[x-23,y-46]],'#302638');
  rect(x-8,y-54,16,4,'#695169');
  rect(x+4,y-54,4,2,'#967183');
  rect(x-13,y-48,26,2,trim);
  rect(x-2,y-54,4,5,'#c17a67');
  rect(x-8,y-41,6,2,'#4c3840');rect(x+3,y-41,6,2,'#4c3840');
  for(let i=0;i<5;i++)rect(x-12+i*6,y-45,1,8,trim);
  poly([[x-9,y-34],[x-4,y-30],[x+4,y-30],[x+10,y-34],[x+9,y-24],[x+3,y-16],
    [x-4,y-20],[x-8,y-25]],'#302838');
  rect(x+2,y-28,2,8,'#574052');
  rect(x-3,y-34,7,2,'#996750');
  rect(x-17,y-12,7,4,'#d2a480');rect(x+11,y-12,7,4,'#d2a480');
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
  const pig=demon.kind==='pig';
  const stride=demon.ground&&!demon.strikeAt?Math.round(Math.sin(t*12+x*.11)*3):0;
  const ink='#382b3b', hide=pig?'#ab696c':'#855e97';
  const light=pig?'#df9b88':'#b289b8', armor=pig?'#904d45':'#554965';
  ctx.save();
  ctx.translate(Math.round(x),Math.round(y));
  ctx.scale(demon.dir,1);
  for(const [leg,step] of [[-9,stride],[4,-stride]]){
    rect(leg+step,-10,8,10,ink);
    rect(leg+step+1,-9,6,6,armor);
    rect(leg+step+1,-3,7,2,pig?'#c58b66':'#96718a');
  }
  const shoulder=pig?17:13;
  poly([[-shoulder,-8],[-shoulder,-24],[-8,-30],[10,-30],[shoulder,-21],
    [shoulder,-8]],ink);
  poly([[-shoulder+2,-10],[-shoulder+2,-23],[-8,-28],[9,-28],[shoulder-2,-21],
    [shoulder-2,-10]],armor);
  rect(-shoulder+2,-25,9,6,hide);
  rect(shoulder-8,-24,8,6,light);
  rect(-shoulder+3,-14,shoulder*2-6,3,'#b88764');
  rect(-2,-15,5,5,'#e1b67a');rect(0,-14,1,2,ink);
  if(pig){
    poly([[-15,-26],[-15,-35],[-8,-40],[7,-40],[14,-35],[18,-31],[17,-23],[5,-21],
      [-9,-23]],ink);
    rect(-13,-34,7,7,hide);rect(-10,-35,19,10,hide);rect(-5,-37,13,3,light);
    rect(8,-34,8,10,light);rect(10,-31,7,5,'#e6aa98');
    rect(12,-30,1,2,'#814754');rect(15,-30,1,2,'#814754');
    rect(6,-34,3,2,'#fff0b7');rect(8,-34,1,2,ink);
    poly([[8,-24],[12,-24],[14,-29],[14,-24],[11,-21]],'#fff0c8');
  }else{
    poly([[-12,-26],[-12,-34],[-9,-39],[-11,-43],[-6,-42],[-4,-37],
      [4,-37],[7,-43],[10,-44],[10,-37],[13,-33],[13,-25],[7,-21],[-7,-23]],ink);
    poly([[-9,-27],[-10,-34],[-5,-36],[5,-36],[11,-32],[11,-26],[6,-23],[-6,-25]],hide);
    rect(-9,-41,2,5,'#d4bd9c');rect(7,-41,2,5,'#f0d1a0');
    rect(-5,-35,12,2,light);
    rect(-3,-31,3,2,'#ffc970');rect(6,-31,3,2,'#ffe0a3');
    rect(3,-27,7,3,'#493041');rect(5,-27,1,2,'#f5d7a8');rect(8,-27,1,2,'#f5d7a8');
  }
  ctx.translate(shoulder-2,-16);
  ctx.rotate(demon.strikeAt?-.95:demon.readyAt-t>.68?.95:Math.sin(t*8)*.25);
  rect(-3,-2,24,4,'#543c39');
  rect(-1,-2,20,2,'#936a54');
  poly([[12,-6],[23,-6],[26,-3],[26,4],[23,7],[12,6]],ink);
  rect(14,-5,10,9,pig?'#827783':'#a5765e');
  for(let i=0;i<4;i++)rect(13+i*3,-8,2,4,pig?'#e9d0a4':'#e2af82');
  rect(15,0,2,2,'#e7bb91');rect(21,2,2,2,'#e7bb91');
  rect(-4,-4,7,7,hide);rect(-3,-4,5,2,light);
  ctx.restore();
  drawEnemyHealth(demon,x,y);
}
function drawEnemyHealth(demon,x,y){
  const barY=y-(demon.kind==='ghost'?49:46);
  if(t<(demon.fearUntil??0)){
    ctx.fillStyle='#f6dc9e';
    ctx.font='bold 11px sans-serif';
    ctx.fillText('!',x-2,barY-6);
  }
  rect(x-11,barY,22,3,'#47313d');
  rect(x-11,barY,22*demon.hp/demon.maxHp,3,'#cf7969');
}
function drawSeaGuard(demon,x,y){
  const shrimp=demon.kind==='shrimp';
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(demon.dir,1);
  const ink='#4a2c37', shell=shrimp?'#ca7157':'#b7534c', shine=shrimp?'#f9b785':'#ee9575';
  const stride=demon.ground&&!demon.strikeAt?Math.round(Math.sin(t*13+x*.12)*3):0;
  for(let i=0;i<4;i++){
    const root=-13+i*7;
    const foot=root+(i<2?-6:4)+(i%2?stride:-stride);
    poly([[root,-11],[root+4,-9],[foot+4,-4],[foot+3,0],[foot,0],[foot,-3],[root,-7]],ink);
    rect(foot+1,-4,2,3,shell);
  }
  poly([[-17,-11],[-14,-23],[-5,-28],[8,-28],[15,-24],[18,-17],[14,-8],[-12,-7]],ink);
  poly([[-15,-11],[-12,-22],[-5,-26],[8,-26],[13,-23],[16,-17],[12,-10],[-11,-9]],shell);
  rect(-8,-25,14,2,shine);
  poly([[-10,-14],[-5,-17],[9,-17],[13,-13],[10,-10],[-8,-10]],'#d59b74');
  rect(-6,-22,4,4,ink);rect(6,-22,4,4,ink);
  rect(-4,-22,2,2,'#fff0c7');rect(8,-22,2,2,'#fff0c7');
  if(shrimp){
    poly([[-9,-21],[-19,-20],[-24,-15],[-22,-8],[-16,-9],[-12,-14]],ink);
    poly([[-10,-20],[-18,-18],[-22,-15],[-21,-10],[-17,-11],[-13,-16]],shell);
    rect(-19,-17,2,5,shine);rect(-16,-19,2,4,'#a94d4d');
    poly([[0,-26],[-2,-32],[-7,-35],[-13,-35],[-13,-37],[-6,-37],[1,-33],[3,-26]],shine);
    poly([[8,-26],[10,-33],[7,-37],[2,-39],[3,-41],[10,-38],[13,-33],[11,-26]],'#df956d');
    rect(-1,-18,4,7,'#48746e');rect(0,-17,2,5,'#b7b07e');
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
    rect(-16,-2,43,4,ink);
    rect(-15,-2,42,2,'#be9966');
    rect(22,-3,5,6,'#c29a68');
    poly([[26,-6],[39,0],[26,6]],'#53696e');
    poly([[26,-5],[37,0],[26,2]],'#dce6d2');
    rect(-3,-3,6,7,shell);rect(-2,-3,4,2,shine);
  }else{
    for(const sign of [-1,1]){
      const raised=sign===1&&demon.strikeAt?6:0;
      ctx.save();
      ctx.scale(sign,1);
      rect(10,-18,12,7,ink);rect(11,-17,9,4,shell);
      ctx.translate(18,-16-raised);
      poly([[-1,3],[-4,-5],[1,-13],[8,-16],[13,-15],[14,-11],[8,-8],[6,-5],
        [10,-4],[15,-8],[16,-2],[11,4],[4,6]],ink);
      poly([[0,2],[-2,-5],[2,-12],[8,-14],[12,-13],[12,-12],[6,-8],[4,-5],
        [9,-2],[14,-5],[14,-2],[10,2],[4,4]],shell);
      rect(5,-13,6,2,shine);rect(8,0,4,2,shine);
      ctx.restore();
    }
  }
  ctx.restore();
}

// 第四回：招安、御马监、南天门与齐天大圣。
const fourthRoutes={
  clouds:[{x:0,y:422,w:300},{x:345,y:387,w:154},{x:550,y:347,w:148},
    {x:749,y:377,w:164},{x:965,y:335,w:153},{x:1170,y:369,w:175},{x:1400,y:402,w:360}],
  stable:[{x:0,y:428,w:1080}],
  escape:[{x:0,y:428,w:535},{x:588,y:398,w:213},{x:848,y:369,w:188},
    {x:1083,y:402,w:223},{x:1354,y:428,w:560}],
  cave:[{x:0,y:432,w:960}]
};
const fourthArea={clouds:'天庭 · 云阶',stable:'天庭 · 御马监',escape:'天庭 · 南天门外廊',cave:'花果山 · 水帘洞'};
const heavenPeaches=[[212,388],[408,353],[631,311],[833,343],[1040,299],[1262,333],[1492,366]];
const heavenlyHorses=[
  {x:289,coat:'#b27954',mane:'#604337',light:'#d8a471',shade:'#80583f'},
  {x:518,coat:'#ddd0ac',mane:'#9e8769',light:'#f6e7c2',shade:'#b1a283'},
  {x:747,coat:'#797d86',mane:'#464a5c',light:'#a9acaf',shade:'#5b5f71'}
];
const HEAVEN_GATE=1825;
const HEAVEN_ARENA_LEFT=1354;
const HEAVEN_ARENA_RIGHT=1914;
const heavenSword={windup:.32,recovery:.68,reach:56};
const heavenPosts=[
  {id:'keeper',x:402,min:315,max:509,y:428,kind:'keeper',maxHp:18,damage:12,windup:.62,recovery:1.05,speed:88,reach:48},
  {id:'guard1',x:692,min:613,max:784,y:398,kind:'thunder',maxHp:50,armor:.10,damage:25,speed:91,...heavenSword},
  {id:'guard2',x:947,min:865,max:1014,y:369,kind:'flame',maxHp:35,damage:20,speed:80,...heavenSword},
  {id:'guard3',x:1190,min:1103,max:1283,y:402,kind:'flame',maxHp:35,damage:20,speed:91,...heavenSword},
  {id:'heaven-boss',x:1642,y:428,kind:'general',maxHp:200}
];
let fourthScene='clouds', fedHorses=new Set(), takenHeavenPeaches=new Set(), heavenGuards=[], fourthComplete=false, fourthIntro=false;
let heavenFireballs=[], heavenBolts=[], heavenBossMove=null, heavenBossTurn=0, heavenBossReady=0;
let heavenBossEngaged=false, heavenImpact=null, heavenMusicStep=0, heavenMusicAt=0;
function saveChapterFour(){
  return writeGameSave({
    chapter:4,phase:fourthScene,checkpoint,energy,fourthComplete,fed:[...fedHorses],peaches:[...takenHeavenPeaches],
    defeated:heavenGuards.filter(guard=>guard.hp<=0).map(guard=>guard.id),...vitalSave()
  });
}
function resetHeavenGuards(defeated=[]){
  heavenGuards=heavenPosts.map(post=>({...post,hp:defeated.includes(post.id)?0:post.maxHp,
    dir:-1,ground:true,vy:0,landing:null,strikeAt:0,readyAt:t+.6,aggro:false,
    castAt:0,spellReadyAt:t+.8}));
  clearHeavenCombat();
}
function clearHeavenCombat(){
  heavenFireballs=[];
  heavenBolts=[];
  heavenBossMove=null;
  heavenBossEngaged=false;
  heavenImpact=null;
  heavenMusicStep=0;
  heavenMusicAt=t;
  heavenBossTurn=0;
  heavenBossReady=t+1.1;
  for(const guard of heavenGuards)guard.castAt=0;
  const boss=heavenGuards.at(-1);
  if(boss)boss.y=428;
  $('heavenBossHud').hidden=true;
  $('heavenWarning').hidden=true;
}
function fourthCameraLimit(){
  const end=fourthRoutes[fourthScene].at(-1);
  return Math.max(0,end.x+end.w-W);
}
function fourthQuest(){
  if(fourthScene==='clouds')return '跳过云阶，到御马监门前按 E';
  if(fourthScene==='stable')return fedHorses.size<heavenlyHorses.length
    ? '靠近天马按 E 喂食 · '+fedHorses.size+'/'+heavenlyHorses.length : '到马厩右侧，按 E 与监官交谈';
  if(fourthScene==='escape')return heavenGuards[0].hp>0
    ? '按 A 挥棒，打退拦路的监官' : '打退天兵天将，前往南天门';
  return '回水帘洞，按 E 和老猴交谈';
}
function openFourthRoute(){
  mode='play';
  $('stage').focus?.({preventScroll:true});
  $('touch').hidden=false;
  $('staffButton').hidden=fourthScene!=='escape';
  $('spellButton').hidden=fourthScene==='stable';
  $('cloudButton').hidden=fourthScene==='stable';
  $('area').textContent=fourthArea[fourthScene];
  $('counts').textContent=fourthScene==='escape'?'如意金箍棒':'';
  $('hint').textContent={
    clouds:'方向键移动，空格跳跃，E 进入御马监。',
    stable:'走近天马或监官，按 E 互动。',
    escape:'A 挥棒，空中按 A 砸地。看到守卫头上的叹号时，及时跳开。',
    cave:'向右走，靠近老猴后按 E 交谈。'
  }[fourthScene];
  showHealth();
  chapterTwoQuest(fourthQuest());
  saveChapterFour();
}
function switchFourthScene(scene){
  fourthIntro=false;
  clearHeavenCombat();
  fourthScene=scene;
  checkpoint=90;
  cam=0;
  keys.clear();
  jumpRequestedUntil=-1;
  clearTransformation();
  particles.length=0;
  effectRings.length=0;
  damageNumbers.length=0;
  placePlayerOnGround(fourthRoutes[scene],checkpoint);
  if(scene==='escape')resetHeavenGuards();
  openFourthRoute();
}
function startChapterFour(saved){
  reset();
  chapter=4;
  restoreVitals(saved,150);
  learned=true;
  hasStaff=true;
  swingAt=-Infinity;
  combo=0;
  energy=Math.max(0,Math.min(10,saved?.energy??4));
  fourthScene=Object.hasOwn(fourthRoutes,saved?.phase)?saved.phase:'clouds';
  fourthComplete=!!saved?.fourthComplete;
  fourthIntro=!saved?.phase;
  fedHorses=new Set(saved?.fed||[]);
  takenHeavenPeaches=new Set(saved?.peaches||[]);
  resetHeavenGuards(saved?.defeated);
  checkpoint=saved?.checkpoint??90;
  placePlayerOnGround(fourthRoutes[fourthScene],checkpoint);
  cam=Math.max(0,Math.min(fourthCameraLimit(),player.x-310));
  $('cover').hidden=true;
  $('pause').hidden=false;
  $('hud').hidden=false;
  $('energy').hidden=false;
  $('stamina').hidden=false;
  $('chapterLabel').textContent='CHAPTER 04 / 官封弼马';
  $('hint').textContent='← → 移动，空格跳跃，E 互动，A 挥棒，Z 疾跑。';
  renderEnergy();
  renderStamina();
  showHealth();
  if(fourthComplete){finishChapterFour();return;}
  if(saved?.phase){openFourthRoute();return;}
  fourthScene='cave';
  placePlayerOnGround(fourthRoutes.cave,90);
  chapterTwoDialogue([
    ['花果山 · 妖王结盟','悟空与牛魔王等六位妖王结为兄弟。群山响应，花果山的势力一日比一日大。'],
    ['凌霄宝殿 · 太白金星','陛下，花果山与众妖结盟，若兴兵讨伐，恐怕难以收场。不如招他上天，授个官职，也好约束。'],
    ['玉帝','准奏。太白金星，你带诏书去请孙悟空上天。'],
    ['太白金星 · 花果山','美猴王，玉帝请你上天任职，随我驾云去吧。']
  ],()=>switchFourthScene('clouds'));
}
function nearFourth(x,radius=55){
  return player.ground&&Math.abs(player.x+12-x)<=radius;
}
function interactChapterFour(){
  if(transformedForm){toast('恢复原形后即可互动。');return;}
  if(fourthScene==='clouds'&&nearFourth(1584)){
    switchFourthScene('stable');
    chapterTwoDialogue([
      ['御马监 · 监官','这里是御马监。玉帝封你做弼马温，天马就交给你照料了。'],
      ['孙悟空','既接了差事，先去看看这些天马！']
    ],openFourthRoute);
  }else if(fourthScene==='stable'){
    const horse=heavenlyHorses.findIndex(entry=>nearFourth(entry.x,52));
    if(horse>=0){
      if(fedHorses.has(horse)){toast('这匹天马已经喂过了。');return;}
      fedHorses.add(horse);
      tone(600+horse*80,.16);
      scatter(heavenlyHorses[horse].x+21,395,18,['#f1d99a','#b2cb81'],48);
      chapterTwoQuest(fourthQuest());
      saveChapterFour();
    }else if(nearFourth(929)){
      if(fedHorses.size<heavenlyHorses.length){toast('先把三匹天马都喂好。');return;}
      chapterTwoDialogue([
        ['御马监 · 半月后','悟空把天马养得膘肥体壮。监官们备酒相贺，悟空便问弼马温是什么品级。'],
        ['监官','弼马温只管养马，连品级也没有。'],
        ['孙悟空','我在花果山好歹也是个大王，玉帝就给我封这么小的官？这差事，老孙不做了！'],
        ['监官','擅自离开御马监？且慢！']
      ],()=>switchFourthScene('escape'));
    }
  }else if(fourthScene==='escape'&&nearFourth(HEAVEN_GATE,72)){
    if(heavenGuards.some(guard=>guard.hp>0)){toast('还有天兵天将拦路，先打退他们！');return;}
    chapterTwoDialogue([
      ['南天门','悟空打退追来的天兵天将，冲出南天门，驾云返回花果山。']
    ],()=>switchFourthScene('cave'));
  }else if(fourthScene==='cave'&&nearFourth(655,77)){
    chapterTwoDialogue([
      ['老猴','大王回来啦！天宫封了个什么官？'],
      ['孙悟空','玉帝真小气，就封我一个小小的弼马温，叫我在天上养马。'],
      ['猴群','大王本领这般高强，何必受他的气？咱们就在凡间奉你为齐天大圣，和天一样威风！'],
      ['孙悟空','好！从今日起，老孙就是齐天大圣！']
    ],finishChapterFour);
  }
}
function updateChapterFour(dt){
  if(mode!=='play')return;
  const route=fourthRoutes[fourthScene];
  const escaping=fourthScene==='escape';
  const limit=escaping&&heavenGuards[0].hp>0?496:Infinity;
  if(updateTransformation(dt,route))player.x=Math.min(player.x,limit);
  else moveStaffPlayer(route,dt,limit);
  if(player.y>590){if(escaping)clearHeavenCombat();fallAndRespawn(route);return;}
  if(fourthScene==='clouds'){
    for(const [i,[x,y]] of heavenPeaches.entries()){
      if(takenHeavenPeaches.has(i)||Math.abs(player.x+12-x)>26||Math.abs(player.y+17-y)>33)continue;
      takenHeavenPeaches.add(i);
      healFromPeach();
      energy=Math.min(10,energy+1);
      renderEnergy();
      scatter(x,y,24,['#ffd39a','#f1a785','#f9edbd'],85);
      tone(740,.09);
      saveChapterFour();
    }
  }
  if(escaping){
    updateHeavenFireballs(dt);
    const beforeX=heavenGuards.map(guard=>guard.x);
    updateDemons(dt,route,heavenGuards.slice(0,-1));
    updateHeavenBoss(dt);
    for(const [i,guard] of heavenGuards.entries()){
      const canWalk=guard.kind==='general'?!heavenBossMove&&guard.y===428:guard.ground;
      const distance=canWalk?Math.abs(guard.x-beforeX[i]):0;
      const speed=dt>0?Math.min(1,distance/(dt*70)):0;
      guard.walkAmount=(guard.walkAmount??0)+(speed-(guard.walkAmount??0))*Math.min(1,dt*18);
      guard.walkPhase=(guard.walkPhase??0)+distance*.17;
    }
    if(health<=0){clearHeavenCombat();loseLife(route);return;}
    const quest=fourthQuest();
    if($('questTitle').textContent!==quest)chapterTwoQuest(quest);
    const defeated=heavenGuards.filter(guard=>guard.hp===0);
    if(defeated.some(guard=>!guard.recorded)){
      for(const guard of defeated)guard.recorded=true;
      saveChapterFour();
    }
  }
  if((escaping||fourthScene==='clouds')&&player.ground){
    const safe=route.find(floor=>player.x>=floor.x+18&&player.x+player.w<=floor.x+floor.w-18);
    if(safe&&safe.x+18>checkpoint){
      checkpoint=safe.x+18;
      saveChapterFour();
    }
  }
  cam+=(Math.max(0,Math.min(fourthCameraLimit(),player.x-310))-cam)*Math.min(1,dt*7);
}
function finishChapterFour(){
  fourthComplete=true;
  clearHeavenCombat();
  mode='end';
  for(const id of ['stamina','health','energy','quest','hud','touch','pause','dialog'])$(id).hidden=true;
  $('ending').hidden=false;
  $('ending').innerHTML='<span class="eyebrow">CHAPTER COMPLETE</span><h2>齐 天 大 圣</h2><div class="cn-title">第四关完成 · 花果山立旗</div><p>自此，猴群皆称悟空为齐天大圣。</p><button class="primary" id="replayFourth">再游第四关 ↻</button>';
  $('replayFourth').onclick=()=>startChapterFour({energy,maxHealth,health:maxHealth,lives:3});
  $('status').textContent='第四关完成 · 齐天大圣';
  saveChapterFour();
  tone(523,.3);
}

function drawChapterFour(){
  if(fourthIntro&&mode==='talk'&&[1,2].includes(secondDialogueLine)){
    drawHeavenAudience();
    return;
  }
  const c=cam;
  if(fourthScene==='stable')drawHeavenStable(c);
  else if(fourthScene==='cave')drawFourthCave(c);
  else drawCloudRoad(c);
  if(transformedForm)drawTransformation(c);
  else{
    const x=player.x+12-c;
    if(t>=immuneUntil||Math.floor(t*22)%2===0){
      const spin=combo===3&&(t-swingAt)/.37;
      if(spin&&spin<1){
        ctx.save();
        ctx.translate(x,player.y+17);
        ctx.rotate(spin*Math.PI*2*swingFacing);
        monkey(0,-17,player.face,false,1,false,true);
        ctx.restore();
      }else monkey(x,player.y+1,player.face,player.ground&&!!player.vx,1,false,true);
    }
    if(fourthScene==='escape')drawStaff(c);
  }
  drawParticles(c);
}
function drawHeavenAudience(){
  const gold='#e0bc77', shadow='#283c44';
  rect(0,0,W,H,lightGradient(0,0,0,H,[[0,'#253849'],[.51,'#7d9b96'],[1,'#e7cda0']]));
  glow(563,266,278,'#ffe6a274');
  for(let i=0;i<5;i++){
    const x=24+i*210;
    rect(x,128,132,236,shadow);
    rect(x+8,135,116,223,'#9da995');
    rect(x+12,143,108,202,'#c3b48e');
    for(let y=151;y<341;y+=23)rect(x+14,y,104,2,'#7e8779');
    for(let dx=21;dx<120;dx+=17)rect(x+dx,145,2,194,'#758478');
    rect(x-1,356,134,8,gold);
    lightShaft(x+103,154,257,85,'#fff1b550');
  }
  poly([[0,0],[W,0],[838,84],[119,84]],shadow);
  for(let i=0;i<5;i++){
    const y=14+i*17;
    rect(0,y,W,4,i%2?'#606c68':'#aa8e64');
    for(let x=16;x<W;x+=45)rect(x+i*7,y+5,21,3,'#48635e');
  }
  rect(0,90,W,24,'#344f50');
  rect(0,91,W,3,gold);rect(0,110,W,3,gold);
  for(let i=0;i<5;i++){
    const x=61+i*208;
    rect(x-5,111,36,11,gold);
    rect(x,122,25,296,'#446460');
    rect(x+4,129,4,286,'#698e83');rect(x+20,127,4,287,'#a8ab8c');
    for(let j=0;j<5;j++){
      const y=171+j*43;
      poly([[x+5,y],[x+13,y-7],[x+22,y],[x+13,y+7]],'#718d75');
      rect(x+11,y-1,4,2,gold);
    }
    rect(x-6,410,37,17,'#ad9e79');
    rect(x-6,410,37,3,'#e6c893');
    glow(x+90,171,82,'#ffe3a355');
    drawBodhiLantern(x+90,140);
  }
  rect(0,427,W,113,lightGradient(0,427,0,H,[[0,'#84908b'],[1,'#4b6265']]));
  for(let i=0;i<6;i++){
    const y=430+i*i*4;
    rect(0,y,W,1,'#d0c8a4');
    for(let x=-36;x<W;x+=124)rect(x+(i%2)*62,y,1,Math.max(2,i*8),'#536b6a');
  }
  poly([[489,405],[639,405],[741,H],[384,H]],'#9e594f');
  poly([[493,409],[497,409],[399,H],[391,H]],gold);
  poly([[630,409],[634,409],[730,H],[722,H]],gold);
  rect(480,284,168,137,'#34514d');
  rect(486,290,156,127,'#54756c');
  for(const side of [-1,1]){
    const x=564+side*65;
    rect(x-2,294,4,120,gold);
    rect(x-6,310,12,3,'#d1a76d');
  }
  glow(564,318,88,'#efcf916b');
  for(let i=0;i<3;i++){
    rect(491-i*10,410+i*6,146+i*20,6,'#667e76');
    rect(491-i*10,410+i*6,146+i*20,2,gold);
  }
  drawThirdThrone(564,415,'#486e62','#d5ae6f');
  drawJadeEmperor(564,400);
  drawTaibai(335,426);
  drawHeavenOfficer(430,427,'thunder',1,false);
  drawHeavenOfficer(704,427,'flame',-1,false);
}
function drawJadeEmperor(x,y){
  const gold='#e6ba70', ink='#3f343c';
  ctx.save();
  ctx.translate(x,y);
  poly([[-38,1],[-32,-21],[-25,-36],[-14,-42],[14,-42],[25,-36],[32,-21],[38,1]],ink);
  poly([[-35,-1],[-29,-20],[-23,-34],[-13,-39],[13,-39],[23,-34],[29,-20],[35,-1]],'#9b5540');
  poly([[-30,-3],[-25,-20],[-17,-35],[-8,-35],[-12,-19],[-19,-3]],'#c5874e');
  poly([[30,-3],[25,-20],[17,-35],[8,-35],[12,-19],[19,-3]],'#d49958');
  poly([[-16,-36],[-5,-29],[6,-29],[16,-36],[14,-26],[6,-18],[-6,-18],[-14,-26]],gold);
  rect(-30,-4,60,2,gold);
  for(const side of [-1,1]){
    const dx=side*24;
    rect(dx-6,-20,12,7,'#b77a4e');
    rect(dx-6,-15,12,2,'#f1d38a');
    rect(dx-4,-13,8,4,'#d6ab85');
  }
  poly([[-9,-17],[0,-23],[9,-17],[9,-10],[0,-6],[-9,-10]],'#b17c4c');
  rect(-5,-16,10,3,gold);rect(-1,-20,2,11,'#f8d98d');
  rect(-13,-60,26,27,ink);rect(-11,-58,22,23,'#c69b79');
  rect(4,-56,7,12,'#e0b38b');
  rect(-9,-52,6,2,ink);rect(3,-52,6,2,ink);
  rect(-8,-49,5,2,'#f3d1a0');rect(4,-49,5,2,'#f3d1a0');
  rect(-6,-49,2,2,ink);rect(5,-49,2,2,ink);
  poly([[-11,-44],[-5,-41],[6,-41],[11,-44],[10,-33],[5,-25],[1,-21],[-5,-27],[-10,-35]],ink);
  rect(1,-38,3,11,'#62504e');
  rect(-9,-67,18,8,'#5e4a46');rect(-5,-68,10,3,gold);
  rect(-20,-64,40,5,ink);rect(-18,-64,36,2,'#e7c582');
  for(let i=0;i<8;i++){
    const px=-17+i*5, h=5+i%2*3;
    rect(px,-59,1,h,gold);rect(px-1,-59+h,3,2,'#c4935e');
  }
  ctx.restore();
}
function drawTaibai(x,y){
  ctx.save();
  ctx.translate(x,y);
  const ink='#3a4a51', silk='#a6bbad', edge='#e1dcc4';
  poly([[-25,1],[-18,-19],[-16,-34],[-8,-42],[12,-40],[20,-29],[25,1]],ink);
  poly([[-22,-1],[-16,-20],[-14,-33],[-7,-39],[11,-37],[18,-28],[22,-1]],silk);
  poly([[-18,-28],[-10,-34],[-7,-22],[-13,-9],[-20,-8]],'#d2d9c6');
  poly([[7,-37],[15,-30],[20,-10],[11,-7],[8,-21]],'#e7e0c6');
  poly([[-8,-35],[-4,-36],[11,-17],[8,-14],[2,-23]],'#f1e6c8');
  rect(-17,-18,33,3,'#94765d');rect(-1,-19,5,5,'#d9b37c');
  rect(-17,-2,36,2,'#788d82');
  rect(-10,-58,22,24,ink);rect(-8,-56,18,21,'#cfaa88');
  rect(3,-52,7,8,'#e5bd99');
  rect(-8,-56,3,14,edge);rect(8,-55,3,9,edge);
  rect(-4,-51,5,2,edge);rect(4,-51,5,2,edge);
  rect(-2,-48,2,2,ink);rect(6,-48,2,2,ink);
  poly([[-9,-43],[-2,-41],[5,-42],[12,-45],[10,-36],[6,-31],[2,-24],[-3,-27],[-6,-34]],'#eee4cb');
  poly([[4,-40],[8,-40],[6,-34],[2,-27],[2,-33]],'#bbc3b3');
  rect(-10,-60,23,5,'#dcdbc4');rect(-4,-65,9,6,'#b4c5bb');
  rect(-3,-63,7,2,'#e7ddbe');
  ctx.save();
  ctx.translate(12,-25);
  ctx.rotate(.53);
  rect(-1,-18,3,25,'#9c7954');
  poly([[-2,-18],[-7,-28],[-6,-34],[0,-28],[6,-32],[5,-23],[2,-18]],'#efdfbb');
  rect(-1,-29,1,10,'#fff3d6');rect(-3,-19,7,2,'#d4aa6b');
  ctx.restore();
  ctx.restore();
}
function drawCloudRoad(c){
  rect(0,0,W,H,lightGradient(0,0,0,H,[[0,'#628daf'],[.57,'#c0d9d4'],[1,'#f6dbad']]));
  glow(747-c*.12,94,176,'#fff1bb9c');
  for(let i=0;i<7;i++){
    const x=i*238-c*.23-128,y=279+(i%3)*18;
    rect(x+46,y-57,58,77,'#94a9a4');
    drawBodhiRoof(x+75,y-55,52,31);
    rect(x+69,y-32,14,48,'#738e8b');
    rect(x+17,y+14,133,9,'#d8d5ba');
  }
  for(let i=0;i<14;i++){
    const x=((i*161-c*.24+t*4)%1270+1270)%1270-120;
    const y=110+i*47%360;
    rect(x,y,126+i%3*32,13,'#f5ead67d');
    rect(x+18,y-9,82,12,'#e6e9d68a');
  }
  for(const {x,y,w} of fourthRoutes[fourthScene]){
    const left=x-c;
    poly([[left,y],[left+w,y],[left+w-6,y+15],[left+w-26,y+19],
      [left+w-44,y+27],[left+27,y+24],[left+8,y+15]],'#7f9ea5');
    rect(left,y,w,7,'#fff2d7');
    rect(left+8,y+7,w-16,7,'#d8e3d6');
    for(let i=12;i<w-20;i+=32){
      const offset=3*Math.sin(t*1.7+i*.15+x);
      rect(left+i,y+15,18,3,'#acbfbb');
      rect(left+i+5,y+21+offset,22,3,'#8da6ab');
      rect(left+i-4,y-2,16,2,'#fff9df');
    }
  }
  const escaping=fourthScene==='escape';
  const gate=(escaping?HEAVEN_GATE:1584)-c;
  const ground=escaping?428:402;
  const title=escaping?'南天门':'御马监';
  if(escaping){
    rect(gate-70,ground-132,140,132,'#68928a');
    rect(gate-53,ground-112,106,112,'#d3d3b0');
    rect(gate-42,ground-105,84,105,'#4e7976');
    for(const x of [-57,48]){
      rect(gate+x,ground-128,11,128,'#5d746f');
      rect(gate+x+8,ground-120,2,115,'#a8b096');
    }
    drawBodhiRoof(gate,ground-131,90,41);
  }else drawBodhiExterior(gate,ground,title);
  if(escaping){
    drawBodhiLabel(title,gate,ground-105);
    drawHeavenHazards(c);
    for(const guard of heavenGuards)if(guard.hp>0)drawHeavenGuard(guard,c);
  }
  if(!escaping){
    for(const [i,[x,y]] of heavenPeaches.entries())if(!takenHeavenPeaches.has(i))peach(x-c,y);
  }
  if(mode==='play'&&nearFourth(gate+c,escaping?72:55))drawBodhiLabel(escaping?'[ E ] 出南天门':'[ E ] 进入御马监',gate,ground-185);
}
function drawHeavenStable(c){
  rect(0,0,W,H,lightGradient(0,0,0,H,[[0,'#3c453d'],[.58,'#958266'],[1,'#b4986f']]));
  rect(0,128,W,8,'#75543d');
  rect(0,123,W,4,'#b1885e');
  for(let i=0;i<12;i++){
    const x=i*114-c*.58;
    poly([[x-32,0],[x+30,0],[x+103,125],[x+73,125]],'#483e35');
    rect(x+73,119,35,4,'#a7875c');
  }
  rect(0,428,W,H-428,lightGradient(0,428,0,H,[[0,'#8a7759'],[1,'#564d3e']]));
  for(let i=0;i<5;i++)rect(0,433+i*i*5,W,1,'#ae9467');
  rect(0,428,W,4,'#c5a87b');
  for(let i=0;i<5;i++){
    const x=40+i*228-c;
    rect(x,168,166,130,'#beaa7d');
    rect(x+9,176,148,114,'#e8d7a7');
    for(let j=0;j<7;j++)rect(x+18+j*21,176,3,114,'#987952');
    for(let j=0;j<4;j++)rect(x+9,190+j*28,148,3,'#987952');
    rect(x+179,131,16,297,'#634937');
    rect(x+190,141,2,277,'#ae8459');
    lightShaft(x+118,180,248,48,'#ffe4a94a');
    rect(x+4,445,97,2,'#a08962');
  }
  for(const [i,horse] of heavenlyHorses.entries()){
    const x=horse.x-c;
    rect(x-67,335,122,7,'#694e38');
    rect(x-63,342,7,80,'#7f5a3a');rect(x+48,342,7,80,'#7f5a3a');
    drawHeavenHorse(horse,x,426,fedHorses.has(i));
    rect(x+25,410,36,16,'#654b37');rect(x+26,410,33,3,'#a17c51');
    if(fedHorses.has(i))rect(x+29,407,26,5,'#b9ab5f');
    if(mode==='play'&&nearFourth(horse.x,52))drawBodhiLabel(fedHorses.has(i)?'已喂食':'[ E ] 喂天马',x,312);
  }
  const keeper=929-c;
  drawHeavenOfficer(keeper,428,'keeper',-1,false);
  if(mode==='play'&&nearFourth(929))drawBodhiLabel('[ E ] 与监官交谈',keeper,327);
}
function drawHeavenHorse(horse,x,y,fed){
  const ink='#4a403c', dip=fed?Math.round(5+Math.sin(t*4)*3):Math.round(Math.sin(t*3));
  contactShadow(x,y,46);
  const tail=Math.sin(t*3.4)*3;
  poly([[x-24,y-34],[x-38,y-30],[x-48,y-19+tail],[x-50,y-9+tail],
    [x-42,y-14+tail],[x-34,y-24],[x-26,y-26]],ink);
  poly([[x-27,y-32],[x-39,y-27],[x-47,y-16+tail],[x-43,y-15+tail],[x-34,y-25]],horse.mane);
  for(const dx of [-23,-12,8,18]){
    rect(x+dx,y-22,6,21,ink);
    rect(x+dx+1,y-21,4,15,dx===-12||dx===18?horse.shade:horse.coat);
    rect(x+dx-1,y-5,8,4,ink);rect(x+dx,y-5,5,1,'#8f7e69');
  }
  poly([[x-31,y-25],[x-29,y-42],[x-16,y-48],[x+15,y-45],[x+26,y-34],
    [x+20,y-19],[x-18,y-18]],ink);
  poly([[x-29,y-26],[x-27,y-41],[x-15,y-46],[x+15,y-43],[x+23,y-34],
    [x+18,y-22],[x-17,y-20]],horse.coat);
  poly([[x-25,y-29],[x-14,y-24],[x+13,y-24],[x+21,y-32],[x+17,y-21],
    [x-16,y-20]],horse.shade);
  poly([[x-25,y-39],[x-15,y-45],[x+14,y-42],[x+18,y-37],[x+8,y-39],[x-13,y-40]],horse.light);
  poly([[x+6,y-39],[x+13,y-59+dip],[x+23,y-69+dip],[x+32,y-59+dip],
    [x+29,y-42],[x+24,y-24],[x+13,y-25]],horse.mane);
  poly([[x+12,y-37],[x+19,y-58+dip],[x+28,y-64+dip],[x+37,y-56+dip],
    [x+42,y-48+dip],[x+37,y-44+dip],[x+26,y-49+dip],[x+21,y-33]],horse.coat);
  rect(x+26,y-66+dip,3,7,ink);rect(x+32,y-56+dip,2,2,ink);
  poly([[x+22,y-57+dip],[x+28,y-63+dip],[x+35,y-56+dip],[x+37,y-51+dip],
    [x+34,y-52+dip],[x+28,y-57+dip]],horse.light);
  rect(x+32,y-56+dip,1,1,'#fff1cd');
  rect(x+35,y-49+dip,6,2,horse.mane);rect(x+25,y-58+dip,2,12,'#c69b64');
  rect(x+35,y-51+dip,2,2,'#e5bd77');rect(x+25,y-50+dip,13,1,'#8f6247');
}
function drawHeavenOfficer(x,y,kind,face,attacking,bladeScale=1,swordAngle=attacking?-.8:.21,gait){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(face,1);
  const general=kind==='general', keeper=kind==='keeper';
  const ink='#293840', trim=general?'#efbb6b':kind==='thunder'?'#afd6ee':'#edbd7d';
  const armor=keeper?'#80654b':general?'#9a4c43':kind==='thunder'?'#527a9a':'#ab6550';
  if(general)poly([[-11,-31],[-25,-24],[-29,-6],[-17,-9],[-7,-23]],'#783d49');
  const pace=gait?.walkAmount??0;
  const step=Math.sin(gait?.walkPhase??0)*pace;
  for(const [hip,direction] of [[-8,-1],[6,1]]){
    const stride=step*direction;
    const toe=hip+stride*7;
    const footY=-Math.max(0,stride)*6;
    poly([[hip-3,-12],[hip+3,-12],[toe+3,footY-5],[toe+5,footY],[toe-4,footY]],ink);
    rect(toe-2,footY-7,4,3,armor);
    rect(toe-2,footY-3,6,2,trim);
  }
  if(!attacking)ctx.translate(0,-Math.abs(step)*1.7);
  poly([[-15,-5],[-13,-27],[-6,-34],[8,-34],[15,-25],[14,-5]],ink);
  poly([[-12,-8],[-11,-26],[-5,-31],[7,-31],[12,-25],[11,-8]],armor);
  rect(-11,-19,22,3,trim);rect(-8,-13,16,2,trim);
  rect(-13,-29,9,6,trim);rect(6,-29,9,6,trim);
  rect(-6,-25,12,2,'#d5ac80');rect(1,-23,2,9,trim);
  rect(-8,-42,17,12,'#cba588');rect(5,-38,3,2,ink);
  rect(-11,-46,22,6,ink);rect(-8,-48,16,6,armor);
  rect(-8,-44,16,2,trim);
  rect(-10,-32,3,11,ink);rect(9,-32,3,11,ink);
  for(let row=0;row<3;row++){
    const yy=-16+row*4;
    for(let col=0;col<3;col++){
      const xx=-9+col*7+(row%2);
      rect(xx,yy,5,2,trim);rect(xx,yy+2,5,1,ink);
    }
  }
  if(keeper){
    rect(-13,-47,26,3,'#57433b');rect(-7,-51,14,5,'#6f5446');
    rect(-5,-49,10,2,'#ad8761');
    rect(-7,-34,4,1,'#664738');rect(-2,-34,6,1,'#664738');
  }else{
    poly([[-11,-46],[-9,-50],[-3,-54],[4,-54],[10,-49],[12,-44]],ink);
    poly([[-9,-46],[-7,-49],[-2,-52],[4,-52],[9,-48],[9,-45]],armor);
    rect(-8,-45,17,2,trim);
    rect(-1,-51,3,7,trim);
    rect(4,-38,3,1,'#6c4d46');
  }
  if(general)poly([[-6,-48],[-11,-56],[3,-60],[8,-55],[0,-49]],'#d7735e');
  ctx.translate(11,-20);
  ctx.rotate(swordAngle+(attacking?0:step*.15));
  rect(-1,-(keeper?21:6),3,keeper?26:11,'#8f684b');
  if(!keeper){
    ctx.save();
    ctx.scale(bladeScale,bladeScale);
    const w=general?6:3, length=general?42:29;
    poly([[-w,-5],[-w,-length],[1,-length-8],[w,-length],[w,-5]],'#34485b');
    poly([[-w+1,-6],[-w+1,-length],[1,-length-6],[w-1,-length],[w-1,-6]],'#cedde0');
    rect(0,-length,1,length-6,'#f9f2d7');
    rect(-w-3,-7,w*2+6,3,trim);
    ctx.restore();
  }
  rect(-3,-3,6,5,'#cfaa83');
  ctx.restore();
}
function drawHeavenGuard(guard,c){
  const x=guard.x-c;
  if(guard.kind==='general'){
    const move=heavenBossMove;
    if(move?.kind==='charge'&&move.rushing){
      drawHeavenFire(x,394,34);
      for(let i=1;i<=8;i++){
        const tail=x-guard.dir*(27+i*14);
        const yy=394+Math.sin(t*23+i*.85)*18;
        poly([[tail-22,yy+3],[tail,yy-2],[tail+guard.dir*19,yy],
          [tail+7,yy+6]],i%2?'#ffae5eab':'#e76b49aa');
        rect(tail,yy,8,2,'#fff4ac');
      }
      return;
    }
    contactShadow(x,428,60);
    if(move){
      const electric=move.kind==='lightning';
      glow(x,guard.y-55,85,electric?'#b6def576':'#ffc17b66');
      for(let i=0;i<11;i++){
        const turn=t*5+i*Math.PI*2/11;
        const radius=30+(i%3)*10+Math.sin(t*8+i)*6;
        const px=x+Math.cos(turn)*radius, py=guard.y-51+Math.sin(turn)*radius*.62;
        rect(px,py,i%3?3:7,i%3?2:1,electric?'#e4f6ff':'#ffe4a4');
      }
    }
    ctx.save();
    ctx.translate(x,guard.y);
    ctx.scale(1.52,1.52);
    const impact=heavenImpact?.kind==='slam'&&t-heavenImpact.at<.39;
    const growth=move?.kind==='slam'?1+1.15*Math.min(1,(t-move.at)/3):impact?1.65:1;
    const dive=move?.kind==='slam'?Math.max(0,1-(move.ends-t)/.38):0;
    const angle=move?.kind==='lightning'?-.14:move?.kind==='slam'?-.78+dive*2.5:impact?1.72:.21;
    if(dive>0){
      poly([[-10,-4],[-33,-63],[-17,-93],[-1,-29],[30,-65],[20,-9]],'#ffb76350');
      glow(12,-18,58,'#ffd08075');
    }
    drawHeavenOfficer(0,0,'general',guard.dir,!!move,growth,angle,guard);
    ctx.restore();
    return;
  }
  if(guard.castAt)drawHeavenFire(x+guard.dir*14,guard.y-34,8+Math.sin(t*25)*2);
  drawHeavenOfficer(x,guard.y,guard.kind,guard.dir,!!(guard.strikeAt||guard.castAt),1,undefined,guard);
  const barY=guard.y-54;
  rect(x-15,barY,30,3,'#494a4d');
  rect(x-15,barY,30*guard.hp/guard.maxHp,3,guard.kind==='thunder'?'#a4cde3':'#ed966d');
  if(guard.strikeAt)drawBodhiLabel('！',x,barY-7);
}
function drawHeavenFire(x,y,r){
  glow(x,y,r*2,'#ff9d565f');
  const wave=Math.sin(t*30+x)*r*.18;
  poly([[x-r,y-4],[x-r*.6,y-r],[x+r*.34,y-r-wave],[x+r,y-r*.18],
    [x+r*.73,y+r*.7],[x+r*.1,y+r],[x-r*.68,y+r*.61]],'#e36a47');
  poly([[x-r*.63,y-2],[x-r*.29,y-r*.68],[x+r*.42,y-r*.56],
    [x+r*.72,y+r*.15],[x+r*.24,y+r*.64],[x-r*.45,y+r*.39]],'#ffb65e');
  rect(x-r*.24,y-r*.2,r*.53,r*.43,'#ffe6a5');
}
function drawHeavenHazards(c){
  const move=heavenBossMove;
  const alpha=.15+.12*Math.sin(t*11);
  if(heavenImpact){
    const age=t-heavenImpact.at;
    if(age<.64){
      const x=heavenImpact.x-c;
      if(heavenImpact.kind==='slam'){
        const reach=32+age*233;
        glow(x,419,reach,`#ffd78b${Math.round(120*(1-age/.64)).toString(16).padStart(2,'0')}`);
        ctx.save();
        ctx.globalAlpha=1-age/.64;
        poly([[x-reach,428],[x-reach*.65,421],[x-24,423],[x-7,405],
          [x+11,423],[x+reach*.6,417],[x+reach,428],[x+18,433],[x-20,431]],'#ffc780');
        for(let i=0;i<9;i++){
          const side=i%2?1:-1;
          const dx=side*(12+i*5+age*(62+i*8));
          const dy=Math.max(0,(70+i*12)*age-140*age*age);
          rect(x+dx,424-dy,5+i%3,3+i%2,'#b07e61');
        }
        ctx.restore();
      }else if(age<.19){
        rect(0,0,W,H,`rgba(201,229,255,${.22*(1-age/.19)})`);
      }
    }
  }
  if(move?.kind==='lightning'){
    for(const x of move.columns){
      rect(x-c-24,138,48,290,`rgba(147,209,242,${alpha})`);
      rect(x-c-24,425,48,4,'#bbebfa');
      rect(x-c-1,138,2,273,'#def4ee72');
    }
  }
  if(move?.kind==='charge'&&!move.rushing){
    const x=Math.min(move.from,move.target)-c;
    rect(x,418,Math.abs(move.from-move.target),8,`rgba(255,139,69,${alpha+.17})`);
  }
  if(move?.kind==='slam'){
    rect(move.target-c-79,409,158,19,`rgba(251,113,75,${alpha+.15})`);
    rect(move.target-c-79,425,158,4,'#ffc072');
  }
  for(const shot of heavenFireballs)drawHeavenFire(shot.x-c,shot.y,10);
  for(const bolt of heavenBolts){
    const x=bolt.x-c;
    const zig=[[x-12,0],[x+5,111],[x-9,174],[x+17,241],[x-4,319],[x+2,426]];
    poly([...zig,...zig.slice().reverse().map(([a,b])=>[a+6,b])],'#b9e8fd');
    poly([...zig,...zig.slice().reverse().map(([a,b])=>[a+2,b])],'#ffffe5');
    const age=t-bolt.at;
    for(const [height,side] of [[111,-1],[174,1],[241,-1],[319,1]]){
      const reach=43+(height%5)*5+Math.sin(t*30+height)*9;
      poly([[x,height],[x+side*reach*.52,height+15],[x+side*reach,height+11],
        [x+side*reach*.54,height+19],[x,height+4]],'#c1e7ff');
    }
    glow(x,416,68,'#a1dfff65');
    rect(x-(12+age*90),424,24+age*180,2,'#e5f8ffc0');
  }
}
function drawFourthCave(c){
  rect(0,0,W,H,lightGradient(0,0,0,H,[[0,'#203a34'],[.73,'#52715b'],[1,'#2f493c']]));
  for(let i=0;i<14;i++){
    const x=i*77-c;
    poly([[x-23,0],[x+55,0],[x+42,103+i%3*18],[x+23,151+i%3*13]],'#20352f');
    rect(x+19,43,6,54+i%3*15,'#456051');
  }
  glow(628-c,304,162,'#f4dd9555');
  for(let i=0;i<4;i++){
    const x=72+i*241-c;
    poly([[x-55,432],[x-48,296],[x-20,249],[x+39,249],[x+63,298],[x+71,432]],'#30483d');
    poly([[x-46,432],[x-38,302],[x-12,261],[x+31,261],[x+52,302],[x+59,432]],'#385548');
    rect(x-46,306,12,94,'#506953');
    lightShaft(x+27,252,180,48,'#dbe6b428');
  }
  rect(0,432,W,108,lightGradient(0,432,0,H,[[0,'#4a6149'],[1,'#293d35']]));
  rect(0,432,W,5,'#829072');
  for(let i=0;i<18;i++)rect(i*57-c,457+(i%3)*20,40,4,'#52674d');
  drawThirdThrone(755-c,432,'#59695c','#99a283');
  for(let i=0;i<4;i++)monkey(467+i*44-c,402,i%2?-1:1,false,.8);
  const elder=655-c;
  monkey(elder,395,-1,false,1);
  poly([[elder-7,411],[elder+5,408],[elder+2,422],[elder-3,425]],'#e0d0a9');
  rect(elder-11,413,2,19,'#9b764c');
  if(fourthIntro&&secondDialogueLine===0){
    const robes=['#815b57','#615573','#607c74','#8c714d','#527177','#836353'];
    for(let i=0;i<robes.length;i++){
      const x=248+i*61-c,y=432;
      poly([[x-17,y],[x-15,y-27],[x-8,y-33],[x+8,y-33],[x+16,y-23],[x+17,y]],'#2d3534');
      rect(x-12,y-26,24,24,robes[i]);rect(x-11,y-11,22,3,'#ad8c5f');
      rect(x-9,y-44,18,16,i%2?'#a97b64':'#82695c');
      poly([[x-9,y-42],[x-15,y-48],[x-16,y-55],[x-11,y-51],[x-5,y-44]],'#d1bc94');
      poly([[x+5,y-44],[x+12,y-51],[x+16,y-55],[x+15,y-48],[x+9,y-42]],'#e1c79a');
      rect(x-5,y-38,3,2,'#f4cf88');rect(x+3,y-38,3,2,'#f4cf88');
    }
  }
  if(fourthIntro&&secondDialogueLine===3)drawTaibai(333-c,432);
  if(mode==='play'&&nearFourth(655,77))drawBodhiLabel('[ E ] 和老猴交谈',elder,364);
  if(fourthComplete){
    rect(748-c,238,4,190,'#c6a172');
    rect(752-c,242,88,43,'#a34d45');
    drawBodhiLabel('齐天大圣',796-c,268);
  }
}

function heavenPlayerHit(damage){
  if(t<immuneUntil||health<=0)return false;
  hurtPlayer(damage,true);
  immuneUntil=t+.7;
  noiseHit(.19,.24,860,115);
  return true;
}
function strikeHeavenLightning(columns){
  for(const x of columns){
    heavenBolts.push({x,at:t});
    scatter(x,player.y+player.h-4,18,['#fff5cf','#a2ddfb','#7096d2'],100);
  }
  noiseHit(.26,.35,4600,260);
  chirp(180,60,.17,0,.13);
}
function updateHeavenFireballs(dt){
  const px=player.x+12, py=player.y+player.h/2;
  for(const guard of heavenGuards){
    if(guard.kind!=='flame'||guard.hp<=0)continue;
    if(guard.castAt){
      if(t<guard.castAt)continue;
      guard.castAt=0;
      guard.spellReadyAt=t+1.85;
      if(transformedForm?.id==='fly')continue;
      const dx=px-guard.x,dy=py-(guard.y-29),distance=Math.hypot(dx,dy)||1;
      heavenFireballs.push({x:guard.x,y:guard.y-29,vx:dx/distance*290,vy:dy/distance*290,until:t+2.2});
      chirp(540,170,.21,0,.075);
    }else if(guard.ground&&!guard.strikeAt&&t>=guard.spellReadyAt&&transformedForm?.id!=='fly'
        &&Math.abs(px-guard.x)>82&&Math.abs(px-guard.x)<=310&&Math.abs(py-guard.y+29)<160){
      guard.castAt=t+.48;
      guard.dir=Math.sign(px-guard.x);
    }
  }
  heavenFireballs=heavenFireballs.filter(shot=>{
    shot.x+=shot.vx*dt;
    shot.y+=shot.vy*dt;
    if(Math.abs(shot.x-px)<=17&&Math.abs(shot.y-py)<=22){
      heavenPlayerHit(20);
      scatter(shot.x,shot.y,14,['#ffbb67','#f18051'],76);
      return false;
    }
    return t<shot.until;
  });
  heavenBolts=heavenBolts.filter(bolt=>t-bolt.at<.32);
}
function updateHeavenBoss(dt){
  const boss=heavenGuards.at(-1);
  const px=player.x+12;
  if(boss.hp>0&&px>=HEAVEN_ARENA_LEFT-48&&!heavenBossEngaged){
    heavenBossEngaged=true;
    heavenMusicAt=t;
    chirp(147,98,.45,0,.13,'triangle');
    noiseHit(.38,.16,550,110);
  }
  const active=boss.hp>0&&heavenBossEngaged;
  $('heavenBossHud').hidden=!active;
  const warning=$('heavenWarning');
  if(!active){
    warning.hidden=true;
    if(heavenBossMove)boss.y=428;
    heavenBossMove=null;
    return;
  }
  $('heavenBossMeter').value=boss.hp;
  $('heavenBossValue').textContent=boss.hp+' / '+boss.maxHp;
  if(!heavenBossMove){
    const gap=px-boss.x;
    boss.dir=Math.sign(gap)||boss.dir;
    if(Math.abs(gap)>85)boss.x=Math.max(HEAVEN_ARENA_LEFT+26,Math.min(HEAVEN_ARENA_RIGHT-25,boss.x+boss.dir*72*dt));
    if(t<heavenBossReady||transformedForm?.id==='fly'){warning.hidden=true;return;}
    const kind=['charge','lightning','slam'][heavenBossTurn++%3];
    const target=Math.max(HEAVEN_ARENA_LEFT+22,Math.min(HEAVEN_ARENA_RIGHT-24,px));
    const move={kind,at:t,ends:t+(kind==='charge'?.64:3),target,from:boss.x,dir:boss.dir};
    if(kind==='lightning'){
      const middle=Math.max(HEAVEN_ARENA_LEFT+90,Math.min(HEAVEN_ARENA_RIGHT-90,target));
      move.columns=[middle-82,middle,middle+82];
    }
    heavenBossMove=move;
    playHeavenSkillCue(kind);
    scatter(boss.x,boss.y-38,24,kind==='lightning'?['#d7f1ff','#88b0e5']:['#fff0ac','#fa9956'],105);
  }
  const move=heavenBossMove;
  if(move.kind==='charge'&&move.rushing){
    warning.hidden=true;
    boss.x=Math.max(HEAVEN_ARENA_LEFT+24,Math.min(HEAVEN_ARENA_RIGHT-24,boss.x+move.dir*580*dt));
    if(t>=(move.sparkAt??0)){
      move.sparkAt=t+.05;
      scatter(boss.x-move.dir*24,394,5,['#ffc46d','#f68146','#ffedbc'],104);
    }
    if(!move.hit&&Math.abs(boss.x-px)<49&&Math.abs(player.y+17-394)<47){
      move.hit=true;
      heavenPlayerHit(40);
    }
    if(t>=move.ends)finishHeavenBossMove();
    return;
  }
  const left=move.ends-t;
  const message=move.kind==='charge'?'天将化火 · 跳跃闪避':
    move.kind==='lightning'?'⚠ 三道天雷 · '+Math.max(1,Math.ceil(left))+' 秒后落下':
    '⚠ 巨剑蓄力 · '+Math.max(1,Math.ceil(left))+' 秒后砸落';
  if(warning.textContent!==message)warning.textContent=message;
  warning.hidden=false;
  if(move.kind==='slam'){
    const lift=Math.min(1,(t-move.at)/.55);
    const plunge=Math.max(0,Math.min(1,1-left/.38));
    const drop=plunge*plunge;
    boss.y=428-(1-drop)*Math.sin(lift*Math.PI/2)*105;
    boss.x=move.from+(move.target-move.from)*(lift*.76+drop*.24);
    if(plunge>0&&!move.dropping){
      move.dropping=true;
      noiseHit(.36,.35,4400,280);
      chirp(265,78,.33,0,.14,'triangle');
    }
  }
  if(move.kind!=='charge'&&left>0&&t>=(move.pulseAt??move.at+.55)){
    move.pulseAt=t+.52;
    chirp(move.kind==='lightning'?570:135,move.kind==='lightning'?940:90,.18,0,.075,'triangle');
    scatter(boss.x,boss.y-75,9,move.kind==='lightning'?['#d0f3ff','#9aadea']:['#ffd895','#ef884b'],82);
  }
  if(left>0)return;
  if(move.kind==='charge'){
    move.dir=Math.sign(px-boss.x)||boss.dir;
    boss.dir=move.dir;
    move.rushing=true;
    move.ends=t+.74;
    warning.hidden=true;
    noiseHit(.38,.35,2200,180);
    chirp(160,65,.52,0,.19,'sawtooth');
    scatter(boss.x,394,44,['#ffe9a4','#ffad55','#dc5642'],155);
  }else if(move.kind==='lightning'){
    strikeHeavenLightning(move.columns);
    heavenImpact={kind:'lightning',x:move.columns[1],at:t};
    noiseHit(.5,.32,1900,65,.03);
    if(move.columns.some(x=>Math.abs(x-px)<27))heavenPlayerHit(30);
    finishHeavenBossMove();
  }else{
    boss.x=move.target;
    boss.y=428;
    if(Math.abs(move.target-px)<79&&player.y+player.h>375)heavenPlayerHit(50);
    heavenImpact={kind:'slam',x:move.target,at:t,dir:boss.dir};
    effectRings.push({x:move.target,y:423,age:0,reach:116,color:'#f6aa6b'});
    scatter(move.target,422,86,['#ffdc96','#e88860','#f8f2c5'],205);
    noiseHit(.43,.49,1800,55);
    noiseHit(.21,.29,5000,390);
    chirp(100,36,.4,0,.24);
    finishHeavenBossMove();
  }
}
function finishHeavenBossMove(){
  heavenBossMove=null;
  heavenBossReady=t+1.25;
  $('heavenWarning').hidden=true;
}

const heavenMotif=[146.83,174.61,220,196,261.63,220,196,174.61,
  146.83,0,196,220,293.66,261.63,220,0,
  174.61,220,261.63,293.66,349.23,293.66,261.63,220,
  196,174.61,220,196,130.81,146.83,174.61,0];

function updateHeavenMusic(){
  if(t<heavenMusicAt)return;
  heavenMusicAt=t+.194;
  const beat=heavenMusicStep++%heavenMotif.length;
  const note=heavenMotif[beat];
  if(beat%4===0||beat%16===11){
    chirp(100,43,.21,0,.20);
    noiseHit(.13,.085,1100,110);
  }
  if(beat%4===2)noiseHit(.12,.085,4900,740);
  if(beat%2===1)noiseHit(.045,.040,8000,3000);
  const root=beat<16?73.42:beat<24?87.31:65.41;
  if(beat%2===0){
    chirp(root*1.005,root,.18,0,.128,'triangle');
    chirp(root/2,root/2,.17,0,.073);
  }
  if(beat%8===0)chirp(root*1.5,root*1.5,.47,0,.051,'triangle');
  if(note){
    chirp(note*1.026,note,.177,0,.138,'triangle');
    chirp(note*2.02,note*2,.11,0,.043,'triangle');
    if(beat%4===0)chirp(note*1.5,note*1.5,.17,0,.05);
  }
}
function playHeavenSkillCue(kind){
  if(kind==='lightning'){
    noiseHit(.31,.24,6500,650);
    chirp(360,1140,.42,0,.15,'triangle');
    chirp(550,1240,.32,.06,.07,'sine');
  }else if(kind==='slam'){
    chirp(135,52,.4,0,.23,'triangle');
    chirp(308,125,.28,.06,.095,'sawtooth');
    noiseHit(.33,.21,1750,105);
  }else{
    noiseHit(.35,.29,1450,6800);
    chirp(88,288,.43,0,.16,'triangle');
    chirp(240,510,.3,.06,.075,'sawtooth');
  }
}
