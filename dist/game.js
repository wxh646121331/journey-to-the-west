'use strict';
const $=id=>document.getElementById(id),canvas=$('game');
let ctx=canvas.getContext('2d');
const W=960,H=540, PIXEL_SCALE=2, SAVE='west-stone-monkey-v1';
const PROGRESS=SAVE+'-chapters';
const CHAPTER_COUNT=5;
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
let jumpRequestedUntil=-1, death=null, airJumpReady=false, airFlipAt=-Infinity;
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
function save(){
  if(mode!=='play')return false;
  return writeGameSave({
    chapter:1,x:checkpoint,score,taken:peaches.map(p=>p.taken),found,challenged,escort,...vitalSave()
  });
}
function placePlayerOnGround(route,x){
  airJumpReady=false;
  airFlipAt=-Infinity;
  slamActive=false;
  slamGiant=false;
  staffWaves.length=0;
  combatClones.length=0;
  screenImpact=null;
  const floor=route.find(p=>x>=p.x&&x+player.w<=p.x+p.w)??route[0];
  const safeX=Math.max(floor.x,Math.min(floor.x+floor.w-player.w,x));
  Object.assign(player,{x:safeX,y:floor.y-player.h,vx:0,vy:0,ground:true});
  jumpRequestedUntil=-1;
}
function reset(){death=null;$('dialog').classList.remove('orchard-dialog');$('giantStaffButton').hidden=true;$('cloneButton').hidden=true;$('bindButton').hidden=true;$('deathPanel').hidden=true;$('cloudButton').hidden=true;$('heavenBossHud').hidden=true;$('heavenWarning').hidden=true;$('practiceNext').hidden=true;clearTransformation();slamActive=false;slamImpact=null;health=100;maxHealth=100;lives=3;immuneUntil=0;damageNumbers.length=0;effectRings.length=0;$('stamina').hidden=true;stamina=100;flightTrialDone=false;$('health').hidden=true;$('staffButton').hidden=true;$('flightDown').hidden=true;jumpRequestedUntil=-1;chapter=1;$('chapterLabel').textContent='CHAPTER 01 / 花果山';$('energy').hidden=true;$('spellButton').hidden=true;seatedAt=null;escort=false;afterTalk=null;followers.forEach((monkey,i)=>Object.assign(monkey,{x:followerStarts[i],y:418,vy:0,ground:true,face:1,moving:false,landing:null}));$('quest').hidden=true;particles.length=0;storyIndex=0;score=0;activeQuiz=null;found=false;challenged=false;ending=false;checkpoint=90;cam=0;peaches.forEach(p=>p.taken=false);placePlayerOnGround(platforms,90);$('ending').hidden=true;$('pausePanel').hidden=true;$('chapterPanel').hidden=true;$('dialog').hidden=true;$('hud').hidden=true;$('touch').hidden=true;paused=false;keys.clear();}
function start(){reset();restoreVitals();mode='story';$('cover').hidden=true;$('pause').hidden=false;$('status').textContent='序章 · 灵根育孕源流出';showLine();tone(392);}
function showLine(){const l=lines[storyIndex];$('dialog').hidden=false;$('dialog').innerHTML=`<div class="speaker">第一回 · ${l[0]}</div><div class="line">${l[1]}</div><span class="next">点击屏幕 / 空格 继续 ▾</span>`;}
function showQuiz(q,final=false,next=null){activeQuiz={...q,final,next};quizDone=false;mode='quiz';$('touch').hidden=true;$('dialog').hidden=false;$('dialog').innerHTML=`<div class="speaker">山海问答 · ${final?'最后一问':'读到这里，考考你'}</div><div class="line">${q.q}</div>${q.a.map((a,i)=>`<button class="option" data-answer="${i}">${'ABC'[i]} &nbsp; ${a}</button>`).join('')}`;$('dialog').querySelectorAll('[data-answer]').forEach(b=>b.onclick=e=>{e.stopPropagation();answer(Number(b.dataset.answer));});}
function answer(i){if(quizDone)return;quizDone=true;const correct=i===activeQuiz.right;if(correct){if(!activeQuiz.next)score++;tone(660);}else tone(180,.2);$('dialog').innerHTML=`<div class="speaker">山海问答</div><div class="line">${correct?'✦ 回答正确！':'正确答案：'+ 'ABC'[activeQuiz.right]+' · '+activeQuiz.a[activeQuiz.right]}</div><div class="feedback ${correct?'correct':''}">${activeQuiz.why}</div><span class="next">点击继续 ▾</span>`;}
function advance(){if(paused)return;if(mode==='story'){storyIndex++;if(quizzes[storyIndex])showQuiz(quizzes[storyIndex]);else if(storyIndex>=lines.length)startBurst();else showLine();}else if(mode==='quiz'&&quizDone){const {final,next}=activeQuiz;activeQuiz=null;if(next){$('dialog').hidden=true;mode='play';next();}else if(final)talk('猴群 · 拜见美猴王','多亏你找到了这处洞天！我们说话算数，从今往后，你便是我们的美猴王！',approachThrone);else{mode='story';showLine();}}else if(mode==='talk'){closeDialog();}}
function startBurst(){mode='burst';burst=0;$('dialog').hidden=true;$('hint').textContent='仙石迸裂，石猴初生。';tone(110,.8);}
function beginPlay(){mode='play';showHealth();$('stamina').hidden=false;renderStamina();$('stage').focus?.({preventScroll:true});$('dialog').hidden=true;$('hud').hidden=false;$('touch').hidden=false;showQuest();$('hint').textContent='方向键移动，空格跳跃；靠近猴群按 E 交谈';toast('你成为了石猴。向右走，沿溪流寻找猴群。');save();}
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
  $('dialog').classList.remove('orchard-dialog');
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
  $('dialog').classList.toggle('orchard-dialog',chapter===5&&orchardEncounter);
  $('dialog').hidden=false;
  $('dialog').innerHTML=`<div class="speaker">${title}</div><div class="line">${text}</div><span class="next">点击屏幕继续 ▾</span>`;
  if(title.startsWith('猴群'))chatter();
}
function interact(){
  if(mode!=='play'||paused||playerFrozen())return;
  if(chapter===2){interactChapterTwo();return;}
  if(chapter===3){interactChapterThree();return;}
  if(chapter===5){interactChapterFive();return;}
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
function finish(){$('health').hidden=true;$('stamina').hidden=true;$('quest').hidden=true;mode='end';ending=true;$('dialog').hidden=true;$('hud').hidden=true;$('touch').hidden=true;$('pause').hidden=true;const n=peaches.filter(p=>p.taken).length;$('ending').hidden=false;$('ending').innerHTML=`<span class="eyebrow">CHAPTER COMPLETE</span><h2>美 猴 王</h2><div class="cn-title">第一关 · 石破天惊，圆满完成</div><p>你为猴群寻得洞天，也赢得了他们的信任。</p><div class="stats"><div><strong>${n} / 12</strong><span>林间仙桃</span></div><div><strong>${score} / 3</strong><span>山海问答</span></div><div><strong>已发现</strong><span>水帘洞天</span></div></div><button class="primary" id="nextChapter">第二关 · 漂洋寻仙 →</button><button class="subtle" id="again">再游花果山 ↻</button>`;$('again').onclick=start;$('nextChapter').onclick=()=>startChapterTwo();$('status').textContent='第一关完成 · 美猴王诞生';$('hint').textContent='第一段旅程已完成，感谢你走进花果山。';unlockNextChapter(2,{phase:'cave',intro:true});tone(523,.3);setTimeout(()=>tone(784,.5),220);}
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
  if(n===5){startChapterFive(saved);return;}
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
const fullscreenStage=$('stage');
const fullscreenButton=$('fullscreen');
let expandedGame=false;

function setGameFullscreen(active){
  expandedGame=active;
  fullscreenStage.classList.toggle('is-fullscreen',active);
  document.body?.classList.toggle('game-expanded',active);
  fullscreenButton.textContent=active?'退出全屏':'全屏';
  fullscreenButton.setAttribute?.('aria-label',active?'退出全屏':'进入全屏');
  fullscreenButton.setAttribute?.('aria-pressed',String(active));
}
fullscreenButton.onclick=()=>{
  setGameFullscreen(!expandedGame);
  fullscreenStage.focus?.({preventScroll:true});
};
window.addEventListener('keydown',e=>{
  if(e.code==='Escape'&&expandedGame){
    e.preventDefault();
    setGameFullscreen(false);
    return;
  }
  if(e.target===fullscreenButton&&(e.code==='Space'||e.code==='Enter'))return;
  if(paused&&e.code!=='Escape')return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)||e.key===' ')e.preventDefault();if(e.repeat)return;if(mode==='book'&&!paused&&['ArrowLeft','ArrowRight'].includes(e.code)){flipBook(e.code==='ArrowLeft'?-1:1);return;}if(e.code==='Escape'){pause();return;}if(paused)return;if((e.code==='Space'||e.key===' ')&&['story','quiz','talk'].includes(mode)){advance();return;}if(e.code==='KeyD'&&hasGiantStaffSkill()){castGiantStaff();return;}keys.add(e.code);if(e.code==='Space'||e.code==='ArrowUp'||e.code==='KeyW'||e.key===' '||e.key==='ArrowUp'||e.key?.toLowerCase()==='w')jump();if(e.code==='KeyE')interact();if(e.code==='KeyF')castTransform();if(e.code==='KeyS')handleWeatherKey();if(e.code==='KeyA')swingStaff();if(e.code==='KeyG')castCombatClones();if(e.code==='KeyH')castBinding();});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();if(!paused&&!['cover','end','gameover','dying'].includes(mode))pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&!paused&&!['cover','end','gameover','dying'].includes(mode))pause();});
document.querySelectorAll('[data-key]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();if(b.hasPointerCapture&&!b.hasPointerCapture(e.pointerId)){try{b.setPointerCapture(e.pointerId);}catch{}}keys.add(b.dataset.key);if(b.dataset.key==='Space')jump();if(b.dataset.key==='KeyE')interact();if(b.dataset.key==='KeyF')castTransform();if(b.dataset.key==='KeyS')handleWeatherKey();if(b.dataset.key==='KeyA')swingStaff();if(b.dataset.key==='KeyD')castGiantStaff();if(b.dataset.key==='KeyG')castCombatClones();if(b.dataset.key==='KeyH')castBinding();});if(b.dataset.key==='Space')b.addEventListener('click',e=>{if(e.detail===0)jump();});for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>keys.delete(b.dataset.key));});
function jump(){
  if(mode!=='play'||paused||playerFrozen()||slamActive||transformedForm?.flight)return;
  if(transformedForm?.id==='squirrel'&&nearClimbTree())return;
  if(!player.ground&&airJumpReady&&progress.skills?.doubleJump){
    airJumpReady=false;
    jumpRequestedUntil=-1;
    airFlipAt=t;
    player.vy=-465;
    scatter(player.x+12,player.y+29,24,['#fff0ad','#cbdfb7','#a5be9a'],105);
    chirp(290,700,.22,0,.09,'triangle');
    return;
  }
  jumpRequestedUntil=t+.18;
  applyJumpRequest();
}
function applyJumpRequest(){
  if(!player.ground||t>jumpRequestedUntil)return;
  jumpRequestedUntil=-1;
  if(chapter===1)scatter(player.x+12,player.y+34,12,['#d5bf8c','#81975d']);
  else emitGroundParticles('jump');
  airJumpReady=true;
  player.vy=-510;
  player.ground=false;
  noiseHit(.17,.12,850,220);
}
function update(dt){updateAmbience();
if(paused)return;
if(mode==='dying'){updateDeath(dt);return;}
updateParticles(dt);
if(mode==='play'&&chapter>=3){updateStaffWaves(dt);updateCombatClones(dt);}
if(chapter===2){updateChapterTwo(dt);return;}
if(chapter===3){updateChapterThree(dt);return;}
if(chapter===5){updateChapterFive(dt);return;}
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
function drawPlayerMonkey(x,y,face,walk,scale=1,crown=false,armored=false){
  const spin=(t-airFlipAt)/.36;
  if(spin>=1||player.ground){
    monkey(x,y,face,walk,scale,crown,armored);
    return;
  }
  ctx.save();
  ctx.translate(x,y+17);
  ctx.rotate(spin*Math.PI*2*face);
  monkey(0,-17,face,false,scale,crown,armored);
  ctx.restore();
}
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
  drawPlayerMonkey(player.x+12-c,player.y+1,player.face,player.ground&&!!player.vx,1,mode==='coronation');
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
let gameAudioBus;
function gameAudioOutput(){
  if(!gameAudioBus&&audio.createDynamicsCompressor){
    gameAudioBus=audio.createDynamicsCompressor();
    gameAudioBus.threshold.value=-13;
    gameAudioBus.knee.value=14;
    gameAudioBus.ratio.value=4;
    gameAudioBus.attack.value=.003;
    gameAudioBus.release.value=.14;
    gameAudioBus.connect(audio.destination);
  }
  return gameAudioBus??audio.destination;
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
  source.connect(filter).connect(gain).connect(gameAudioOutput());
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
  voice.connect(gain).connect(gameAudioOutput());
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
  if(!quiet&&chapter===5&&mode==='play'&&fifthScene==='duel')updateErlangMusic();
  updateNezhaFireBed(!quiet&&chapter===4&&mode==='play'&&fourthScene==='nezha');
  if(!quiet&&chapter===4&&mode==='play'&&((fourthScene==='escape'&&heavenBossEngaged&&heavenGuards.at(-1)?.hp>0)||(fourthScene==='giant'&&giantBoss?.hp>0)||(fourthScene==='nezha'&&nezhaBoss?.hp>0))){
    updateFourthBossMusic();
  }
  const inHeaven=chapter===5||(chapter===4&&(['clouds','stable','escape'].includes(fourthScene)||showFourthAudience()));
  const inThird=chapter===3&&!['cover','end'].includes(mode);
  const sea=inThird&&thirdScene==='palace';
  const lava=inThird&&thirdScene==='underworld';
  const distance=mode==='play'||mode==='talk'?Math.abs(player.x-2317):700;
  water?.gain.setTargetAtTime(quiet||inHeaven?0:sea?.028:lava?.016:.018+.13*Math.max(0,1-distance/950),audio.currentTime,.2);
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
  if(!quiet&&!inHeaven&&!sea&&!lava&&t>birdAt&&player.x<2430){
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
    p.vy+=(p.gravity??125)*dt;
    if(p.groundY!==undefined&&p.y>=p.groundY&&p.vy>0){
      p.y=p.groundY;
      p.vx*=.32;
      p.vy=0;
      p.life=Math.min(p.life,.09);
    }
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
    if(p.surface){
      drawGroundParticle(p,x,alpha);
      continue;
    }
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
const NOON_RAIN_SAVE=SAVE+'-rain-stopped';
let rainStoppedDay='';
try{rainStoppedDay=localStorage.getItem(NOON_RAIN_SAVE)||'';}catch{}
function localRainDay(now){
  return [now.getFullYear(),now.getMonth()+1,now.getDate()].join('-');
}
function isNoonRain(now=new Date()){
  if(mode!=='play'||now.getHours()!==12||rainStoppedDay===localRainDay(now))return false;
  if(chapter===1)return player.x<2525;
  if(chapter===2)return region==='shore'||(region==='cave'&&player.x>620);
  return chapter===4&&fourthScene==='clouds';
}
function stopNoonRain(now=new Date()){
  if(paused||!isNoonRain(now))return false;
  rainStoppedDay=localRainDay(now);
  keys.delete('KeyS');
  try{localStorage.setItem(NOON_RAIN_SAVE,rainStoppedDay);}catch{}
  $('rainStop').hidden=true;
  toast('雨停了');
  return true;
}
function handleWeatherKey(){
  if(transformedForm?.id==='cloud'||!stopNoonRain())castCloud();
}
$('rainStop').onclick=()=>stopNoonRain();
function drawNoonRain(){
  const active=isNoonRain();
  const button=$('rainStop');
  if(button.hidden===active)button.hidden=!active;
  if(!active)return;
  rect(0,0,W,H,'#29475937');
  for(let i=0;i<96;i++){
    const x=((i*109-t*(95+i%4*15))%W+W)%W;
    const y=(i*83+t*(310+i%5*25))%H;
    const length=9+i%4*4;
    poly([[x,y],[x+1.5,y],[x-4,y+length],[x-5,y+length]],
      i%3===0?'#d9e9f19f':'#b4d4e085');
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
function frame(now){const dt=Math.min(.032,(now-last)/1000||.016);last=now;if(!paused)t+=dt;update(dt);ctx.setTransform(PIXEL_SCALE,0,0,PIXEL_SCALE,0,0);ctx.imageSmoothingEnabled=false;ctx.save();applyImpactShake();const drunken=drunkenView();if(drunken)swayDrunkenView();if(['cover','story','burst'].includes(mode)||(mode==='quiz'&&!activeQuiz?.final&&!activeQuiz?.next))drawCover();else if(chapter===2)drawChapterTwo();else if(chapter===3)drawChapterThree();else if(chapter===4)drawChapterFour();else if(chapter===5)drawChapterFive();else drawWorld();if(chapter===1)drawEffects();drawAtmosphere();drawNoonRain();if(chapter>=3){drawStaffWaves(cam);drawCombatClones(cam);drawBoundEnemies(cam);}drawDamageNumbers();ctx.restore();if(drunken)drawDrunkenEcho();if(t>toastUntil)$('toast').textContent='';requestAnimationFrame(frame);}requestAnimationFrame(frame);

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
  if(chapter===5&&fifthScene==='garden')return orchardPeaches;
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
  return chapter>=2&&mode==='play'&&!paused&&!playerFrozen()&&!slamActive&&learned&&!transformedForm;
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
  hint:'驾筋斗云 · 方向键飞行，空格上升，再按 S 解除。'
};
function castCloud(){
  if(playerFrozen())return;
  if(mode==='play'&&!paused&&transformedForm?.id==='cloud'){
    endTravelSpell();
    toast('已解除筋斗云');
    return;
  }
  if(!canCastTravelSpell())return;
  if((chapter===2&&region==='hall')||(chapter===4&&fourthScene==='stable')){
    toast('到屋外再驾筋斗云。');
    return;
  }
  if(energy<5){toast('驾筋斗云需要 5 点灵气。');return;}
  startTravelSpell(cloudForm,5,20);
  $('cloudButton').textContent='下云';
  $('cloudButton').setAttribute?.('aria-label','解除筋斗云');
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
  if(form.flight){player.vy=0;player.ground=false;airJumpReady=false;airFlipAt=-Infinity;}
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
  const right=keys.has('ArrowRight')||(!hasGiantStaffSkill()&&keys.has('KeyD'));
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
  $('cloudButton').textContent='驾云';
  $('cloudButton').setAttribute?.('aria-label','驾筋斗云');
}
function endTravelSpell(){
  clearTransformation();
  $('counts').textContent=chapter>=3&&hasStaff?'如意金箍棒':'';
  $('hint').textContent='F 七十二变，S 驾筋斗云，长按 Z 疾跑。';
}
function updateTransformation(dt,route){
  if(!transformedForm)return false;
  if(t>=transformedUntil){
    const wasCloud=transformedForm.id==='cloud';
    endTravelSpell();
    if(chapter===2&&!flightTrialDone&&!wasCloud){
      flightTrialDone=true;
      finishChapterTwo();
      return true;
    }
    return false;
  }
  $('counts').textContent=transformedForm.name+' '+Math.ceil(transformedUntil-t)+' 秒';
  const direction=Number(keys.has('ArrowRight')||(!hasGiantStaffSkill()&&keys.has('KeyD')))-Number(keys.has('ArrowLeft')||(chapter<3&&keys.has('KeyA')));
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
    if(p.ground){airJumpReady=false;airFlipAt=-Infinity;}
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
  if(p.ground&&!onGround){footstep(true);emitGroundParticles('land');}
  else if(p.ground&&Math.abs(p.x-oldX)>.01&&t>=stepAt){
    stepAt=t+(Math.abs(p.vx)>230?.17:.25);
    footstep();
    emitGroundParticles('step');
  }
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
    drawSurfaceFloor(floor,c,floor.motion?'timber':'stone');
    if(floor.motion){
      rect(x+10,floor.y+14,floor.w-20,4,'#b58e55');
      for(let i=0;i<4;i++)rect(x+18+i*23,floor.y+20,5,5,'#d6af70');
    }
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
    drawPlayerMonkey(player.x+12-c,player.y+1,player.face,player.ground&&!!player.vx);
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
  drawPlayerMonkey(player.x+12-c,player.y+1,player.face,player.ground&&!!player.vx);
  drawParticles(c);
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
    case 'tiger':drawTigerBody(vx);break;
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
let slamActive=false, slamGiant=false, slamImpact=null, slamStartY=0;
const GIANT_STAFF_WINDUP=.92;
const staffWaves=[];
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
function goldArmorBonus(){return progress.skills?.goldArmor?30:0;}
function goldStaffBonus(){return progress.skills?.goldStaff?2:0;}
function roundHealth(value){
  return Math.round((value+Number.EPSILON)*100)/100;
}
function healthText(value){
  const rounded=roundHealth(value);
  return Number.isInteger(rounded)?String(rounded):rounded.toFixed(2);
}
function vitalSave(){return {health:roundHealth(health),maxHealth:roundHealth(maxHealth),lives,armorBonus:goldArmorBonus()};}
function restoreVitals(saved,fallbackMax=100){
  const additional=goldArmorBonus()-(saved?.armorBonus??0);
  const base=saved?.maxHealth??fallbackMax;
  maxHealth=roundHealth(base+additional);
  health=roundHealth(Math.min(maxHealth,Math.max(1,(saved?.health??base)+additional)));
  lives=Math.min(3,Math.max(1,saved?.lives??3));
}
function showHealth(){
  $('health').hidden=false;
  refreshHealth();
}
function refreshHealth(){
  $('healthMeter').max=maxHealth;
  $('healthMeter').value=health;
  $('healthValue').textContent=healthText(health)+'/'+healthText(maxHealth);
  $('livesValue').textContent='命 '+lives+'/3';
}
function saveCurrentCheckpoint(){
  if(chapter===1)return save();
  if(chapter===2)return chapterTwoSave();
  if(chapter===3)return saveChapterThree();
  return chapter===4?saveChapterFour():saveChapterFive();
}
function showDamage(x,y,amount,isPlayer=false,critical=false){
  damageNumbers.push({x,y,amount,isPlayer,critical,at:t});
}
function healFromPeach(){
  const amount=roundHealth(Math.min(20,maxHealth-health));
  health=roundHealth(health+amount);
  refreshHealth();
  toast(amount>0?'仙桃 · 生命 +'+amount:'拾取仙桃');
}
function hurtPlayer(amount,combat=false){
  const applied=combat&&maxHealth-goldArmorBonus()===150?Math.round(amount*.9):amount;
  health=Math.max(0,roundHealth(health-applied));
  showDamage(player.x+12,player.y-8,applied,true);
  refreshHealth();
}
function respawnPlayer(route){
  if(transformedForm){
    clearTransformation();
    $('counts').textContent=chapter>=3&&hasStaff?'如意金箍棒':'';
  }
  placePlayerOnGround(route,checkpoint);
  const maxCam=chapter===1?2540:chapter===2?1010:chapter===3?930:chapter===4?fourthCameraLimit():fifthCameraLimit();
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
  $('ending').innerHTML='<span class="eyebrow">TRY AGAIN</span><h2>三条命已用完</h2><button id="retryCheckpoint" class="primary">重启本关 →</button>';
  $('retryCheckpoint').onclick=()=>{
    const restartChapter=chapter;
    writeGameSave({chapter:restartChapter,intro:true});
    loadChapter(restartChapter);
  };
}
function drawDamageNumbers(){
  for(let i=damageNumbers.length-1;i>=0;i--){
    const damage=damageNumbers[i];
    const age=t-damage.at;
    if(age>=.85){damageNumbers.splice(i,1);continue;}
    ctx.globalAlpha=1-age/.85;
    ctx.font='bold 16px system-ui';
    ctx.fillStyle=damage.isPlayer?'#ff9b87':damage.critical?'#ffad64':'#ffe29a';
    ctx.fillText((damage.critical?'暴击 ':'')+'−'+healthText(damage.amount),damage.x-cam-10,damage.y-age*34);
  }
  ctx.globalAlpha=1;
}
function openThirdRoute(){
  mode='play';
  $('stage').focus?.({preventScroll:true});
  $('touch').hidden=false;
  $('staffButton').hidden=!hasStaff;
  $('giantStaffButton').hidden=!hasGiantStaffSkill();
  $('cloneButton').hidden=!hasGiantStaffSkill();
  $('bindButton').hidden=!progress.skills?.binding;
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
        maxHealth=150+goldArmorBonus();
        health=maxHealth;
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
  if(chapter<3||mode!=='play'||paused||playerFrozen()||!hasStaff||t<transformedUntil||slamActive||t-swingAt<.40)return;
  if((chapter===4&&!['escape','giant','nezha'].includes(fourthScene))||(chapter===5&&!fifthCombat()))return;
  if(!player.ground){
    if(stamina<50){toast('空中砸击需要 50 点体力。');return;}
    stamina-=50;
    renderStamina();
    slamActive=true;
    slamGiant=false;
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
  const critical=rollStaffCritical();
  const damage=(staffDamage[combo-1]+goldStaffBonus())*(critical?2:1);
  noiseHit(.24,.19+combo*.04,4300,270);
  noiseHit(.16,.10,850,140,.025);
  if(combo===3){
    player.vy=-250;
    player.ground=false;
  }
  for(const demon of staffTargets()){
    const ahead=(demon.x-(player.x+12))*swingFacing;
    if(demon.hp<=0||ahead< -14||ahead>83+combo*8||Math.abs(demon.y-player.y-34)>44)continue;
    hitEnemy(demon,damage,critical);
  }
}
function hasGiantStaffSkill(){
  return chapter>=3&&hasStaff&&!!progress.skills?.goldStaff&&!!progress.skills?.goldArmor;
}
function castGiantStaff(){
  if(!hasGiantStaffSkill()||mode!=='play'||paused||playerFrozen()||transformedForm||slamActive||(chapter===4&&fourthLootSequence)||(chapter===5&&!fifthCombat()))return;
  if(!player.ground){toast('巨化棍棒需要从地面起跳。');return;}
  if(energy<1||stamina<100){toast('巨化棍棒需要 1 点灵气和满体力。');return;}
  energy-=1;
  stamina=0;
  renderEnergy();
  renderStamina();
  emitGroundParticles('jump');
  slamActive=true;
  slamGiant=true;
  slamStartY=player.y;
  player.ground=false;
  player.vx=0;
  player.vy=0;
  combo=0;
  swingFacing=player.face;
  swingAt=t;
  jumpRequestedUntil=-1;
  chirp(155,560,.64,0,.19,'triangle');
  noiseHit(.48,.16,600,3300);
  saveCurrentCheckpoint();
}
function rollStaffCritical(){
  return !!progress.skills?.critical&&Math.random()<.1;
}
function hitEnemy(demon,damage,critical=false,attacker=player){
  let applied=roundHealth(damage*(1-(demon.armor??0)));
  if(chapter===5&&demon===erlangBoss){
    if(Math.random()<.10){
      demon.blockAt=t;
      const reflected=roundHealth(damage*.10);
      if(attacker===player)hurtPlayer(reflected);
      else damageCombatClone(attacker,reflected,false);
      scatter(demon.x,demon.y-25,22,['#fff3d4','#e1ba77','#c2e7ec'],100);
      noiseHit(.13,.26,5100,1250);
      chirp(840,340,.19,0,.12,'triangle');
      return;
    }
    if(attacker!==player)applied=Math.min(applied,Math.max(0,roundHealth(demon.hp-100)));
    else if(roundHealth(demon.hp-applied)<=100)demon.playerReachedThreshold=true;
  }
  if(applied<=0)return;
  demon.hp=Math.max(0,roundHealth(demon.hp-applied));
  showDamage(demon.x,demon.y-48,applied,false,critical);
  if(demon.id==='heaven-boss'&&demon.hp===0)startHeavenBossDefeat(demon);
  demon.aggro=true;
  const facingLocked=(demon.id==='heaven-boss'&&heavenBossMove)||(chapter===5&&demon===erlangBoss&&erlangBoss.move);
  if(!facingLocked)demon.dir=Math.sign(player.x+12-demon.x)||demon.dir;
  demon.strikeAt=0;
  demon.readyAt=t+.34;
  scatter(demon.x,demon.y-18,damage>=30?48:20+combo*5,['#f6c575','#fcdfae','#aa6975'],85);
  noiseHit(.17,.32,1300,85);
  chirp(120,56,.13,0,.13,'triangle');
}
function landStaffSlam(){
  const giant=slamGiant;
  slamActive=false;
  slamGiant=false;
  swingAt=t;
  slamImpact={x:player.x+12,y:player.y+player.h,at:t,giant};
  scatter(slamImpact.x,slamImpact.y-3,giant?108:74,['#fff0b0','#e7aa65','#9a7657'],165);
  emitGroundParticles('slam');
  noiseHit(.38,.48,720,45);
  noiseHit(.13,.29,3400,360,.025);
  chirp(92,38,.27,0,.20);
  const critical=rollStaffCritical();
  const reach=giant?122:94;
  const damage=giant?50:30+goldStaffBonus();
  for(const demon of staffTargets()){
    if(demon.hp>0&&Math.abs(demon.x-slamImpact.x)<=reach&&Math.abs(demon.y-slamImpact.y)<=37)hitEnemy(demon,damage*(critical?2:1),critical);
  }
  if(giant){
    for(const dir of [-1,1])staffWaves.push({x:slamImpact.x,y:slamImpact.y,dir,left:1.18,hits:new Set()});
    playBossGroundImpact('heaven');
    shakeOnImpact(slamImpact.x,8,.27);
  }
}
function staffTargets(){
  if(chapter===5)return fifthScene==='duel'?[erlangBoss,...erlangRetinue]:fifthScene==='banquet'&&drankWine?banquetGuards:[];
  if(chapter===4)return fourthScene==='escape'?heavenGuards:fourthScene==='giant'&&giantBoss?[giantBoss]:fourthScene==='nezha'&&nezhaBoss?[nezhaBoss]:[];
  return thirdCombatActive()?demons:[];
}
function thirdCombatActive(){
  return !hallEntered&&((thirdScene==='underworld'&&!namesCleared)||(thirdScene==='palace'&&hasStaff));
}
function updateDemons(dt,route=thirdRoutes[thirdScene],enemies=demons){
  for(const demon of enemies){
    if(demon.hp<=0||enemyBound(demon))continue;
    const victim=closestEnemyVictim(demon);
    const aimX=victim?victim.x:player.x+12;
    const aimY=victim?victim.y:player.y+34;
    const gap=aimX-demon.x;
    const heightGap=Math.abs(aimY-demon.y);
    const sameHeight=heightGap<36;
    const invisible=!victim&&transformedForm?.id==='fly';
    if(!victim&&transformedForm?.id==='tiger'&&Math.abs(gap)<145&&heightGap<65){
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
      const attackGap=(aimX-demon.x)*demon.dir;
      const lightning=demon.kind==='thunder'&&Math.random()<.2;
      if(sameHeight&&attackGap>=-10&&attackGap<demon.reach+11){
        if(victim){
          damageCombatClone(victim,demon.damage+(lightning?20:0));
          if(lightning)strikeHeavenLightning([aimX]);
        }else if(t>=immuneUntil){
          hurtPlayer(demon.damage,true);
          if(lightning){
            hurtPlayer(20,true);
            strikeHeavenLightning([aimX]);
          }
          immuneUntil=t+.7;
        }
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
        if(next&&Math.abs(edge-demon.x)<15&&demon.dir*(aimX-edge)>0){
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
      const target=demon.landing??(fleeing?demon.x+demon.dir*100:demon.aggro?aimX:demon.dir>0?demon.max:demon.min);
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
  const windup=slamGiant?GIANT_STAFF_WINDUP:SLAM_WINDUP;
  const charging=slamActive&&t-swingAt<windup;
  if(charging){
    const progress=Math.max(0,Math.min(1,(t-swingAt)/windup));
    const lift=slamGiant?92*heavenEase(progress/.53):32*Math.sin(progress*Math.PI/2);
    player.y=Math.max(0,slamStartY-lift);
    player.vx=0;
    player.vy=0;
  }else{
    if(slamActive){
      player.vx=swingFacing*(slamGiant?42:65);
      if(player.vy===0){
        player.vy=slamGiant?760:420;
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
  const fourthStart={energy,health:maxHealth,maxHealth,lives:3,armorBonus:goldArmorBonus()};
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
        rect(tile+8,floor.y+34,65,1,sea?'#98b4a795':'#be897b7a');
        rect(tile+47,floor.y+35,2,29,sea?'#284e596e':'#422c3b75');
        rect(tile+5,floor.y+63,82,1,sea?'#86aca276':'#9a67697f');
      }
      continue;
    }
    drawSurfaceFloor(floor,c,mountainScene?'stone':sea?'jade':'ember');
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
        drawPlayerMonkey(x+lean,player.y+1,player.face,player.ground&&!!player.vx,1,false,hasStaff);
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
    const lift=Math.min(1,(t-swingAt)/(slamGiant?GIANT_STAFF_WINDUP:SLAM_WINDUP));
    const size=slamGiant?1+lift*2.15:1+lift*.8;
    if(slamGiant)glow(x,y-27,80+lift*39,'#ffd38070');
    const charging=lift<1;
    ctx.translate(x+swingFacing*(charging?12-5*lift:15),y+(charging?-4-13*lift:5));
    ctx.rotate(swingFacing*(charging?1.28-1.48*lift:-.36));
    ctx.scale(size,slamGiant?size:1+lift*.55);
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
  cave:[{x:0,y:432,w:960}],
  giant:[{x:0,y:432,w:1440}],
  nezha:[{x:0,y:432,w:1440}]
};
const fourthArea={clouds:'天庭 · 云阶',stable:'天庭 · 御马监',escape:'天庭 · 南天门外廊',cave:'花果山 · 水帘洞',giant:'花果山 · 齐天旗前',nezha:'花果山 · 哪吒来战'};
const heavenPeaches=[[212,388],[408,353],[631,311],[833,343],[1040,299],[1262,333],[1492,366]];
const heavenlyHorses=[
  {x:289,coat:'#b27954',mane:'#604337',light:'#d8a471',shade:'#80583f'},
  {x:518,coat:'#ddd0ac',mane:'#9e8769',light:'#f6e7c2',shade:'#b1a283'},
  {x:747,coat:'#797d86',mane:'#464a5c',light:'#a9acaf',shade:'#5b5f71'}
];
const HEAVEN_GATE=1825;
const HEAVEN_CHARGE_WARNING=1;
const HEAVEN_LIGHTNING_WARNING=1.5;
const HEAVEN_SLAM_RISE=.42;
const HEAVEN_SLAM_HOLD=1;
const HEAVEN_SLAM_DIVE=.34;
const HEAVEN_SLAM_TOTAL=HEAVEN_SLAM_RISE+HEAVEN_SLAM_HOLD+HEAVEN_SLAM_DIVE;
function heavenEase(value){
  const x=Math.max(0,Math.min(1,value));
  return x*x*(3-2*x);
}
const HEAVEN_ARENA_LEFT=1354;
const HEAVEN_ARENA_RIGHT=1914;
const heavenSword={windup:.32,recovery:.68,reach:56};
const heavenPosts=[
  {id:'keeper',x:402,min:315,max:509,y:428,kind:'keeper',maxHp:18,damage:12,windup:.62,recovery:1.05,speed:88,reach:48},
  {id:'guard1',x:692,min:613,max:784,y:398,kind:'thunder',maxHp:50,armor:.10,damage:25,speed:91,...heavenSword},
  {id:'guard2',x:947,min:865,max:1014,y:369,kind:'flame',maxHp:35,damage:20,speed:80,...heavenSword},
  {id:'guard3',x:1190,min:1103,max:1283,y:402,kind:'flame',maxHp:35,damage:20,speed:91,...heavenSword},
  {id:'heaven-boss',x:1642,y:428,kind:'general',maxHp:350}
];
let fourthScene='clouds', fedHorses=new Set(), takenHeavenPeaches=new Set(), heavenGuards=[], fourthComplete=false, fourthIntro=false;
let heavenFireballs=[], heavenBolts=[], heavenBossMove=null, heavenBossTurn=0, heavenBossReady=0;
let heavenBossEngaged=false, heavenImpact=null, heavenMusicStep=0, heavenMusicAt=0;
function saveChapterFour(){
  return writeGameSave({
    chapter:4,phase:fourthScene,checkpoint,energy,fourthComplete,lootX:fourthLootSequence?fourthLootX:null,fed:[...fedHorses],peaches:[...takenHeavenPeaches],
    defeated:heavenGuards.filter(guard=>guard.hp<=0).map(guard=>guard.id),...vitalSave()
  });
}
function resetHeavenGuards(defeated=[]){
  $('heavenBossMeter').setAttribute?.('aria-label','天将生命值');
  heavenGuards=heavenPosts.map(post=>({...post,hp:defeated.includes(post.id)?0:post.maxHp,
    dir:-1,ground:true,vy:0,landing:null,strikeAt:0,readyAt:t+.6,aggro:false,
    castAt:0,spellReadyAt:t+.8}));
  heavenBossDefeat=null;
  clearHeavenCombat();
}
function clearHeavenCombat(){
  groundWaves=[];
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
  if(fourthLootSequence)return '走到奖励前，按 E 拾取'+(progress.skills?.goldStaff?'金盔甲':'金箍棒强化');
  if(fourthScene==='nezha')return '迎战哪吒，留意冲刺方向';
  if(fourthScene==='giant')return '避开巨灵神的重击，用金箍棒攻击双脚';
  if(fourthScene==='clouds')return '跳过云阶，到御马监门前按 E';
  if(fourthScene==='stable')return fedHorses.size<heavenlyHorses.length
    ? '靠近天马按 E 喂食 · '+fedHorses.size+'/'+heavenlyHorses.length : '到马厩右侧，按 E 与监官交谈';
  if(fourthScene==='escape'&&heavenGuards.every(guard=>guard.hp===0))return heavenRewards.some(reward=>!progress.skills?.[reward.id])
    ?'拾取天将掉落的二段跳和暴击':'前往南天门，按 E 返回花果山';
  if(fourthScene==='escape')return heavenGuards[0].hp>0
    ? '按 A 挥棒，打退拦路的监官' : '打退天兵天将，前往南天门';
  return '回水帘洞，按 E 和老猴交谈';
}
function openFourthRoute(){
  mode='play';
  $('stage').focus?.({preventScroll:true});
  $('touch').hidden=false;
  $('staffButton').hidden=!['escape','giant','nezha'].includes(fourthScene);
  $('giantStaffButton').hidden=!hasGiantStaffSkill();
  $('cloneButton').hidden=!hasGiantStaffSkill();
  $('bindButton').hidden=!progress.skills?.binding;
  $('spellButton').hidden=fourthScene==='stable';
  $('cloudButton').hidden=fourthScene==='stable';
  $('area').textContent=fourthArea[fourthScene];
  $('counts').textContent=['escape','giant','nezha'].includes(fourthScene)?'如意金箍棒':'';
  $('hint').textContent={
    clouds:'方向键移动，空格跳跃，E 进入御马监。',
    stable:'走近天马或监官，按 E 互动。',
    escape:'A 挥棒，空中按 A 砸地。看到守卫头上的叹号时，及时跳开。',
    cave:'向右走，靠近老猴后按 E 交谈。',
    giant:'A 挥棒，跳过巨斧落地后的震荡波。',
    nezha:'A 挥棒。等哪吒冲刺结束，再靠近反击。'
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
  if(scene==='giant')resetGiantBoss();
  if(scene==='nezha')resetNezhaBoss();
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
  fourthFlagSequence=false;
  fourthLootSequence=false;
  resetGiantBoss();
  resetNezhaBoss();
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
  if(fourthComplete){
    if(fourthScene==='nezha'){
      nezhaBoss.hp=0;
      if(!progress.skills?.goldStaff||!progress.skills?.goldArmor)startFourthLoot();
      else finishChapterFour();
    }
    else if(fourthScene==='giant'){fourthComplete=false;giantBoss.hp=0;startNezhaArrival();}
    else{fourthComplete=false;startFourthFlagSequence();}
    return;
  }
  if(fourthScene==='nezha'&&Number.isFinite(saved?.lootX)){startFourthLoot(saved.lootX);return;}
  if(saved?.phase){openFourthRoute();return;}
  fourthScene='cave';
  placePlayerOnGround(fourthRoutes.cave,90);
  chapterTwoDialogue([
    ['花果山 · 妖王结盟','悟空与牛魔王等六位妖王结为兄弟。群山响应，花果山的势力一日比一日大。'],
    ['凌霄宝殿 · 太白金星','陛下，花果山与众妖结盟，若兴兵讨伐，恐怕难以收场。不如招他上天，授个官职，也好约束。'],
    ['玉帝','准奏。太白金星，你带诏书去请孙悟空上天。'],
    ['太白金星 · 花果山','美猴王，玉帝请你上天任职，随我驾云去吧。'],
    {q:'玉帝派谁到花果山请孙悟空上天？',a:['托塔李天王','太白金星','巨灵神'],right:1,why:'太白金星先提出招安，又奉玉帝之命到花果山宣诏。'}
  ],()=>switchFourthScene('clouds'));
}
function nearFourth(x,radius=55){
  return player.ground&&Math.abs(player.x+12-x)<=radius;
}
function interactChapterFour(){
  if(fourthLootSequence){pickFourthLoot();return;}
  if(transformedForm){toast('恢复原形后即可互动。');return;}
  if(fourthScene==='clouds'&&nearFourth(1584)){
    switchFourthScene('stable');
    chapterTwoDialogue([
      ['御马监 · 监官','这里是御马监。玉帝封你做弼马温，天马就交给你照料了。'],
      ['孙悟空','既接了差事，先去看看这些天马！'],
      {q:'弼马温在御马监负责什么？',a:['照管天马','巡视南天门','掌管蟠桃园'],right:0,why:'御马监管养天马，弼马温的差事就是照料这些马。'}
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
        ['监官','擅自离开御马监？且慢！'],
        {q:'悟空为什么不愿再当弼马温？',a:['天马跑丢了','他想去守南天门','他得知弼马温没有品级'],right:2,why:'监官告诉悟空，弼马温连品级也没有。悟空觉得受了轻视，便辞官离开。'}
      ],()=>switchFourthScene('escape'));
    }
  }else if(fourthScene==='escape'&&nearFourth(HEAVEN_GATE,72)){
    if(heavenGuards.some(guard=>guard.hp>0)){toast('还有天兵天将拦路，先打退他们！');return;}
    if(heavenRewards.some(reward=>!progress.skills?.[reward.id])){toast('先拾取天将掉落的二段跳和暴击。');return;}
    chapterTwoDialogue([
      ['南天门','悟空打退追来的天兵天将，冲出南天门，驾云返回花果山。']
    ],()=>switchFourthScene('cave'));
  }else if(fourthScene==='cave'&&nearFourth(655,77)){
    chapterTwoDialogue([
      ['老猴','大王回来啦！天宫封了个什么官？'],
      ['孙悟空','玉帝真小气，就封我一个小小的弼马温，叫我在天上养马。'],
      ['猴群','大王本领这般高强，何必受他的气？咱们就在凡间奉你为齐天大圣，和天一样威风！'],
      ['孙悟空','好！从今日起，老孙就是齐天大圣！']
    ],startFourthFlagSequence);
  }
}
function updateChapterFour(dt){
  if(mode!=='play')return;
  const route=fourthRoutes[fourthScene];
  const escaping=fourthScene==='escape';
  const limit=escaping&&heavenGuards[0].hp>0?496:Infinity;
  if(playerFrozen()){
    if(!player.ground)resolvePlayerVertical(route,dt);
  }else if(updateTransformation(dt,route))player.x=Math.min(player.x,limit);
  else moveStaffPlayer(route,dt,limit);
  if(player.y>590){if(escaping)clearHeavenCombat();else groundWaves=[];if(fourthScene==='nezha')clearNezhaFire();fallAndRespawn(route);return;}
  if(escaping||fourthScene==='giant'){
    updateGroundWaves(dt);
    if(health<=0){clearHeavenCombat();if(fourthScene==='giant'){giantBoss.attack=null;giantBoss.next=t+3;}loseLife(route);return;}
  }
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
    collectHeavenRewards();
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
  if(fourthScene==='giant'){
    updateGiantBoss(dt,route);
    if(mode!=='play')return;
  }
  if(fourthScene==='nezha'&&!fourthLootSequence){
    updateNezhaBoss(dt,route);
    if(mode!=='play')return;
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
  fourthLootSequence=false;
  clearHeavenCombat();
  mode='end';
  for(const id of ['stamina','health','energy','quest','hud','touch','pause','dialog'])$(id).hidden=true;
  $('ending').hidden=false;
  $('ending').innerHTML='<span class="eyebrow">CHAPTER COMPLETE</span><h2>齐 天 大 圣</h2><div class="cn-title">第四关完成 · 花果山立旗</div><p>击退巨灵神与哪吒，守住齐天大圣旗。</p><p>习得巨化棍棒（D）与分身术（G）</p><button class="primary" id="nextFifth">第五关 · 大闹天宫 →</button><button class="subtle" id="replayFourth">再游第四关 ↻</button>';
  $('nextFifth').onclick=()=>loadChapter(5);
  $('replayFourth').onclick=()=>startChapterFour({energy,maxHealth,health:maxHealth,lives:3,armorBonus:goldArmorBonus()});
  $('status').textContent='第四关完成 · 齐天大圣';
  saveChapterFour();
  unlockNextChapter(5,{intro:true,energy,...vitalSave(),health:maxHealth,lives:3});
  tone(523,.3);
}

function showFourthAudience(){
  return mode==='talk'&&((fourthFlagSequence&&secondDialogueLine>=1&&secondDialogueLine<=3)||
    (fourthIntro&&[1,2].includes(secondDialogueLine)));
}
function drawChapterFour(){
  if(showFourthAudience()){
    drawHeavenAudience();
    if(fourthFlagSequence)drawLiJing(688,426);
    return;
  }
  const c=cam;
  if(fourthFlagSequence&&secondDialogueLine>=4){drawGiantArena(0);drawPlayerMonkey(357,399,1,false,1,false,true);return;}
  if(fourthScene==='stable')drawHeavenStable(c);
  else if(fourthScene==='cave')drawFourthCave(c);
  else if(fourthScene==='giant'||fourthScene==='nezha')drawGiantArena(c);
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
      }else drawPlayerMonkey(x,player.y+1,player.face,player.ground&&!!player.vx,1,false,true);
    }
    if(slamActive||['escape','giant','nezha'].includes(fourthScene))drawStaff(c);
  }
  if(fourthScene==='nezha'){
    drawNezhaBurn(c);
    if(playerFrozen())drawNezhaRibbonWrap(c);
  }
  if(fourthLootSequence)drawFourthLoot(c);
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
function drawCloudRoadBackground(c,route){
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
  for(const {x,y,w} of route){
    const left=x-c;
    if(left+w<-24||left>W+24)continue;
    poly([[left,y],[left+w,y],[left+w-6,y+15],[left+w-26,y+19],
      [left+w-44,y+27],[left+27,y+24],[left+8,y+15]],'#7f9ea5');
    rect(left,y,w,17,lightGradient(0,y,0,y+17,[[0,'#fff4da'],[.48,'#e6ead8'],[1,'#b8cdd0']]));
    rect(left+3,y,w-6,2,'#fff8e5');
    for(let i=12;i<w-20;i+=32){
      const offset=3*Math.sin(t*1.7+i*.15+x);
      rect(left+i,y+15,18,3,'#acbfbb');
      rect(left+i+5,y+21+offset,22,3,'#8da6ab');
      rect(left+i-4,y-2,16,2,'#fff9df');
      rect(left+i+Math.sin(t*1.5+i)*5,y+4,13,2,'#f9f8e6');
      rect(left+i+8,y+25+offset,13,2,'#c4d6d296');
    }
  }
}
function drawSouthHeavenGate(x,y){
  rect(x-70,y-132,140,132,'#68928a');
  rect(x-53,y-112,106,112,'#d3d3b0');
  rect(x-42,y-105,84,105,'#4e7976');
  for(const dx of [-57,48]){
    rect(x+dx,y-128,11,128,'#5d746f');
    rect(x+dx+8,y-120,2,115,'#a8b096');
  }
  drawBodhiRoof(x,y-131,90,41);
  drawBodhiLabel('南天门',x,y-105);
}
function drawCloudRoad(c){
  drawCloudRoadBackground(c,fourthRoutes[fourthScene]);
  const escaping=fourthScene==='escape';
  const gate=(escaping?HEAVEN_GATE:1584)-c;
  const ground=escaping?428:402;
  if(escaping)drawSouthHeavenGate(gate,ground);
  else drawBodhiExterior(gate,ground,'御马监');
  if(escaping){
    drawHeavenHazards(c);
    drawGroundWaves(c);
    for(const guard of heavenGuards)if(guard.hp>0)drawHeavenGuard(guard,c);
    drawHeavenRewards(c);
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
  drawSurfaceFloor(fourthRoutes.stable[0],c,'timber');
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
  const ink='#293840', trim=general?'#efbb6b':kind==='ice'?'#d4f5fc':kind==='thunder'?'#afd6ee':'#edbd7d';
  const armor=keeper?'#80654b':general?'#9a4c43':kind==='ice'?'#3d90ae':kind==='thunder'?'#527a9a':'#ab6550';
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
  if(kind==='ice'){
    poly([[-12,-45],[-12,-55],[-7,-51],[-1,-61],[4,-51],[11,-55],[10,-44]],'#284d67');
    poly([[-10,-49],[-7,-50],[-1,-57],[3,-49],[9,-51],[7,-46]],'#ace1f1');
    rect(-6,-27,13,2,'#b9edf8');rect(-2,-29,4,6,'#e7fbff');
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
      drawHeavenFire(x,394,36,guard.dir<0?Math.PI:0,true);
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
    const follow=heavenImpact?.kind==='slam'?Math.max(0,1-(t-heavenImpact.at)/.42):0;
    const isSlam=move?.kind==='slam';
    const age=isSlam?t-move.at:0;
    const rise=isSlam?heavenEase(age/HEAVEN_SLAM_RISE):0;
    const windup=isSlam?heavenEase(age/(HEAVEN_SLAM_RISE+HEAVEN_SLAM_HOLD)):0;
    const dive=isSlam?heavenEase(1-(move.ends-t)/HEAVEN_SLAM_DIVE):0;
    const growth=isSlam?1+1.15*windup:1+1.15*heavenEase(follow);
    const angle=move?.kind==='lightning'?-.14:isSlam?.21-.99*rise+2.5*dive:
      move?.kind==='charge'? .21-.54*heavenEase((t-move.at)/HEAVEN_CHARGE_WARNING):.21+1.51*heavenEase(follow);
    if(follow)ctx.scale(1+follow*.07,1-follow*.10);
    if(isSlam&&rise>.25)glow(11,-57,36+windup*27,'#ffe4a966');
    if(dive>0){
      poly([[-10,-4],[-33,-63],[-17,-93],[-1,-29],[30,-65],[20,-9]],'#ffb76350');
      glow(12,-18,58,'#ffd08075');
    }
    drawHeavenOfficer(0,0,'general',guard.dir,!!move,growth,angle,guard);
    ctx.restore();
    return;
  }
  if(guard.castAt)drawHeavenFire(x+guard.dir*14,guard.y-34,8+Math.sin(t*25)*2,guard.dir<0?Math.PI:0);
  drawHeavenOfficer(x,guard.y,guard.kind,guard.dir,!!(guard.strikeAt||guard.castAt),1,undefined,guard);
  const barY=guard.y-54;
  rect(x-15,barY,30,3,'#494a4d');
  rect(x-15,barY,30*guard.hp/guard.maxHp,3,guard.kind==='thunder'?'#a4cde3':'#ed966d');
  if(guard.strikeAt)drawBodhiLabel('！',x,barY-7);
}
// Stepped flame silhouettes, drawn as pixel runs at the projectile's scale.
const heavenFireLayers=[
  ['#8b393c',[[0,6,9],[1,3,12],[2,-2,14],[3,1,15],[4,-6,16],[5,-9,17],[6,-4,17],
    [7,-11,17],[8,-7,16],[9,-3,15],[10,1,14],[11,-1,12],[12,5,10]]],
  ['#d9503e',[[1,6,10],[2,3,12],[3,-1,14],[4,0,15],[5,-6,16],[6,-2,16],
    [7,-8,16],[8,-4,15],[9,-1,14],[10,3,13],[11,5,10]]],
  ['#f48946',[[2,7,10],[3,4,12],[4,3,14],[5,-2,15],[6,1,15],[7,-4,15],
    [8,0,14],[9,3,13],[10,5,11]]],
  ['#ffd277',[[3,8,10],[4,6,12],[5,5,14],[6,2,14],[7,4,14],[8,5,13],[9,7,11]]],
  ['#fff3bb',[[4,9,11],[5,8,13],[6,7,13],[7,8,12],[8,9,11]]]
];
function drawHeavenFire(x,y,r,angle=0,large=false){
  glow(x,y,r*2.1,large?'#ff954c73':'#ff9d564a');
  ctx.save();
  ctx.translate(Math.round(x),Math.round(y));
  ctx.rotate(Math.round(angle/(Math.PI/8))*Math.PI/8);
  const unit=r/7;
  ctx.scale(unit,unit);
  const flicker=Math.floor(t*22)%3;
  for(const [color,rows] of heavenFireLayers){
    for(const [row,start,end] of rows){
      const tail=start<2?start-(row+flicker)%3:start;
      rect(tail-10,row-6,end-tail,1,color);
    }
  }
  for(let i=0;i<(large?10:4);i++){
    const trail=(i*7+t*58)%34;
    const yy=Math.round(Math.sin(i*2+t*12)*(3+trail*.13));
    rect(-10-trail,yy,i%3===0?3:2,1,i%2?'#ffb663':'#dc664b');
  }
  if(large){
    rect(4,-3,2,1,'#fffbe1');rect(5,1,2,1,'#fffbe1');
    rect(0,4,3,1,'#ffb65c');
  }
  ctx.restore();
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
    const end=Math.max(HEAVEN_ARENA_LEFT+24,Math.min(HEAVEN_ARENA_RIGHT-24,move.from+move.dir*580*.74));
    const x=Math.min(move.from,end)-c;
    rect(x,418,Math.abs(move.from-end),8,`rgba(255,139,69,${alpha+.17})`);
  }
  if(move?.kind==='slam'){
    rect(move.target-c-79,409,158,19,`rgba(251,113,75,${alpha+.15})`);
    rect(move.target-c-79,425,158,4,'#ffc072');
  }
  for(const shot of heavenFireballs)drawHeavenFire(shot.x-c,shot.y,10,Math.atan2(shot.vy,shot.vx));
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
  drawSurfaceFloor(fourthRoutes.cave[0],c,'stone');
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
  if(fourthComplete||fourthFlagSequence){
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
  const thunder=columns.length>1;
  noiseHit(.10,thunder?.50:.34,10500,2300);
  noiseHit(.46,thunder?.35:.24,2700,90,.026);
  noiseHit(thunder?.74:.38,thunder?.32:.19,620,45,.09);
  chirp(155,42,.38,.023,thunder?.24:.14);
  if(thunder)noiseHit(.34,.14,2200,75,.16);
}
function updateHeavenFireballs(dt,guards=heavenGuards){
  const px=player.x+12, py=player.y+player.h/2;
  for(const guard of guards){
    if(guard.kind!=='flame'||guard.hp<=0||enemyBound(guard))continue;
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
  $('heavenBossName').textContent='南天门 · 天将';
  $('heavenBossMeter').max=boss.maxHp;
  $('heavenBossMeter').value=boss.hp;
  $('heavenBossValue').textContent=healthText(boss.hp)+' / '+healthText(boss.maxHp);
  if(enemyBound(boss))return;
  if(!heavenBossMove){
    const gap=px-boss.x;
    boss.dir=Math.sign(gap)||boss.dir;
    if(Math.abs(gap)>85)boss.x=Math.max(HEAVEN_ARENA_LEFT+26,Math.min(HEAVEN_ARENA_RIGHT-25,boss.x+boss.dir*72*dt));
    if(t<heavenBossReady||transformedForm?.id==='fly'){warning.hidden=true;return;}
    const kind=['charge','lightning','slam'][heavenBossTurn++%3];
    const target=Math.max(HEAVEN_ARENA_LEFT+22,Math.min(HEAVEN_ARENA_RIGHT-24,px));
    const move={kind,at:t,ends:t+(kind==='charge'?HEAVEN_CHARGE_WARNING:kind==='slam'?HEAVEN_SLAM_TOTAL:HEAVEN_LIGHTNING_WARNING),target,from:boss.x,dir:boss.dir};
    if(kind==='lightning'){
      const middle=Math.max(HEAVEN_ARENA_LEFT+148,Math.min(HEAVEN_ARENA_RIGHT-148,target));
      move.columns=[-2,-1,0,1,2].map(offset=>middle+offset*68);
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
      heavenPlayerHit(60);
    }
    if(t>=move.ends)finishHeavenBossMove();
    return;
  }
  const left=move.ends-t;
  const message=move.kind==='charge'?'⚠ 天将化火 · '+Math.max(1,Math.ceil(left-1e-6))+' 秒后冲撞':
    move.kind==='lightning'?'⚠ 五道天雷 · '+(Math.max(1,Math.ceil((left-1e-6)*10))/10).toFixed(1)+' 秒后落下':
    '⚠ 巨剑蓄力 · '+Math.max(1,Math.ceil(left))+' 秒后砸落';
  if(warning.textContent!==message)warning.textContent=message;
  warning.hidden=false;
  if(move.kind==='slam'){
    const lift=heavenEase((t-move.at)/HEAVEN_SLAM_RISE);
    const plunge=Math.max(0,Math.min(1,1-left/HEAVEN_SLAM_DIVE));
    const drop=plunge*plunge;
    boss.y=428-(1-drop)*lift*105;
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
    boss.dir=move.dir;
    move.rushing=true;
    move.ends=t+.74;
    warning.hidden=true;
    noiseHit(.38,.35,2200,180);
    chirp(160,65,.52,0,.19,'sawtooth');
    scatter(boss.x,394,44,['#ffe9a4','#ffad55','#dc5642'],155);
  }else if(move.kind==='lightning'){
    strikeHeavenLightning(move.columns);
    heavenImpact={kind:'lightning',x:move.columns[2],at:t};
    if(move.columns.some(x=>Math.abs(x-px)<27))heavenPlayerHit(50);
    finishHeavenBossMove();
  }else{
    boss.x=move.target;
    boss.y=428;
    if(Math.abs(move.target-px)<79&&player.y+player.h>375)heavenPlayerHit(70);
    heavenImpact={kind:'slam',x:move.target,at:t,dir:boss.dir};
    effectRings.push({x:move.target,y:423,age:0,reach:116,color:'#f6aa6b'});
    emitGroundWaves(move.target,428);
    shakeOnImpact(move.target,9,.28);
    damageClonesNear(move.target,79,375,70);
    scatter(move.target,422,86,['#ffdc96','#e88860','#f8f2c5'],205);
    playBossGroundImpact('heaven');
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

const giantMotif=[73.42,73.42,73.42,87.31,73.42,73.42,98,87.31,65.41,65.41,65.41,73.42,87.31,98,110,98];
const nezhaMotif=[329.63,392,440,523.25,440,392,349.23,0,
  392,440,523.25,587.33,659.25,587.33,523.25,440,
  349.23,392,440,349.23,329.63,293.66,329.63,0];
function updateFourthBossMusic(){
  if(fourthScene==='escape'){updateHeavenMusic();return;}
  if(t<heavenMusicAt)return;
  const giant=fourthScene==='giant';
  const motif=giant?giantMotif:nezhaMotif;
  const beat=heavenMusicStep++%motif.length;
  heavenMusicAt=t+(giant?.224:.143);
  const note=motif[beat];
  if(giant){
    // A low pedal, marching drums and a rising brass-like counterline.
    if([0,3,6,8,11,14].includes(beat)){
      chirp(beat%8===0?82:109,35,.31,0,.24);
      noiseHit(.17,.14,beat%8===0?890:1520,90);
    }
    if(beat%4===2)noiseHit(.13,.118,4200,390);
    if(beat%2===1)noiseHit(.054,.050,5100,1050);
    chirp(note*.5,note*.5,.20,0,.105);
    chirp(note*1.014,note,.20,0,.155,'triangle');
    if(beat%4===0||beat>=12){
      chirp(note*2.01,note*2,.18,.012,.084,'sawtooth');
      chirp(note*3,note*3,.16,.028,.047,'triangle');
    }
    if(beat===7||beat===15){
      for(let i=0;i<3;i++)noiseHit(.07,.085,1750+i*380,350,i*.049);
    }
  }else{
    // Faster, higher plucked notes and a bright offbeat.
    if(beat%4===0)chirp(130,58,.13,0,.16);
    if(beat%4===2)noiseHit(.095,.08,6800,1200);
    if(beat%3===0)chirp(110,110,.15,0,.079,'triangle');
    if(note){
      chirp(note*1.018,note,.13,0,.126,'triangle');
      chirp(note*2.006,note*2,.095,0,.048);
      if(beat%2===0)chirp(note*1.5,note*1.5,.11,.022,.055);
      if(beat>=8&&beat<16)chirp(note*2,note*2,.07,.064,.036,'triangle');
    }
    if(beat%6===5)noiseHit(.065,.069,8800,2500);
  }
}
function updateHeavenMusic(){
  if(t<heavenMusicAt)return;
  heavenMusicAt=t+.178;
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
    if(beat%4===0)chirp(note*1.5,note*1.5,.17,0,.068);
    if(beat>=16&&beat<24)chirp(note*3,note*3,.105,.034,.032,'triangle');
  }
  if(beat%8===7){noiseHit(.06,.09,4900,720);noiseHit(.06,.08,6500,900,.075);}
}
function playBossGroundImpact(kind){
  const stomp=kind==='giant-stomp';
  const heaven=kind==='heaven';
  noiseHit(.083,stomp?.28:.46,stomp?1600:7300,540);
  noiseHit(.46,.39,heaven?1850:stomp?630:1340,58,.018);
  noiseHit(.35,.17,2200,420,.08);
  chirp(stomp?83:heaven?117:103,30,.46,0,.23);
  if(!stomp)chirp(heaven?460:268,91,.23,.015,.105,'triangle');
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

const heavenRewards=[
  {id:'doubleJump',x:1570,name:'二段跳',detail:'起跳后，在空中再按一次跳跃键',color:'#aee6d0'},
  {id:'critical',x:1770,name:'暴击',detail:'每次攻击有 10% 概率造成双倍伤害',color:'#ffd29a'}
];
const HEAVEN_DEFEAT_DURATION=1.15;
let heavenBossDefeat=null;
function startHeavenBossDefeat(boss){
  heavenBossDefeat={x:boss.x,y:boss.y,face:boss.dir,at:t};
  heavenBossMove=null;
  heavenBossEngaged=false;
  $('heavenBossHud').hidden=true;
  $('heavenWarning').hidden=true;
  scatter(boss.x,boss.y-40,95,['#ffecb4','#f3a460','#a87874'],185);
  noiseHit(.65,.35,2200,70);
  chirp(310,53,.61,0,.17,'triangle');
  saveChapterFour();
}
function heavenRewardsReady(){
  return heavenGuards.at(-1)?.hp===0&&(!heavenBossDefeat||t-heavenBossDefeat.at>=HEAVEN_DEFEAT_DURATION);
}
function collectHeavenRewards(){
  if(!heavenRewardsReady())return;
  for(const reward of heavenRewards){
    if(progress.skills?.[reward.id]||Math.abs(player.x+12-reward.x)>31||Math.abs(player.y+17-396)>29)continue;
    progress.skills??={};
    progress.skills[reward.id]=true;
    saveChapterFour();
    toast('习得'+reward.name+' · '+reward.detail);
    scatter(reward.x,396,40,[reward.color,'#fff2c2'],90);
    chirp(420,830,.25,0,.11,'triangle');
  }
}
function drawHeavenRewards(c){
  if(heavenBossDefeat){
    const age=(t-heavenBossDefeat.at)/HEAVEN_DEFEAT_DURATION;
    if(age<1){
      const x=heavenBossDefeat.x-c,y=heavenBossDefeat.y;
      glow(x,y-50,80+age*60,'#ffc08064');
      ctx.save();
      ctx.globalAlpha=1-age;
      ctx.translate(x,y+Math.sin(age*Math.PI)*5);
      ctx.rotate(-heavenBossDefeat.face*heavenEase(age)*1.18);
      ctx.scale(1.52,1.52);
      drawHeavenOfficer(0,0,'general',heavenBossDefeat.face,false);
      ctx.restore();
    }
  }
  if(!heavenRewardsReady())return;
  for(const reward of heavenRewards){
    if(progress.skills?.[reward.id])continue;
    const x=reward.x-c,y=393+Math.sin(t*4)*3;
    glow(x,y,43,reward.color+'62');
    rect(x-15,y-15,30,30,'#233b42');
    rect(x-15,y-15,30,2,reward.color);
    if(reward.id==='critical'){
      rect(x-7,y-8,14,11,'#ffe6c7');
      rect(x-5,y-10,10,16,'#ffe6c7');
      rect(x-5,y-4,4,4,'#443842');rect(x+1,y-4,4,4,'#443842');
      rect(x-1,y+1,2,2,'#443842');
      for(const offset of [-4,0,4])rect(x+offset,y+6,1,3,'#e4c4a6');
    }else{
      for(const dy of [-5,3])poly([[x-8,y+dy+3],[x,y+dy-4],[x+8,y+dy+3],
        [x+4,y+dy+3],[x,y+dy],[x-4,y+dy+3]],reward.color);
    }
    drawBodhiLabel(reward.name,x,y-30);
    ctx.save();
    ctx.textAlign='center';ctx.font='11px sans-serif';ctx.fillStyle='#fff1cd';
    ctx.fillText(reward.detail,x,y+30);
    ctx.restore();
  }
}

let fourthFlagSequence=false, giantBoss;
function resetGiantBoss(){
  giantBoss={id:'giant',x:720,y:432,dir:-1,hp:400,maxHp:400,
    next:t+2.1,turn:0,phase:0,step:0,attack:null,impact:null,defeatedAt:null};
}
function startFourthFlagSequence(){
  fourthFlagSequence=true;
  chapterTwoDialogue([
    ['花果山 · 立旗','猴群把齐天大圣旗高高竖起，旗面迎着山风猎猎作响。'],
    ['天兵 · 回报','陛下，孙悟空打出南天门，逃回花果山，还自号齐天大圣！'],
    ['玉帝','好大的胆子！托塔李天王，着你领天兵下界，拿孙悟空来见朕！'],
    ['托塔李天王','臣领旨。巨灵神，你为先锋，先到花果山叫阵！'],
    ['巨灵神 · 花果山外','孙悟空，出来！吾乃天庭先锋巨灵神，奉命前来拿你！'],
    ['孙悟空','俺老孙在此！要收这面旗，先问过我的金箍棒！'],
    {q:'托塔李天王派谁做先锋，到花果山叫阵？',a:['哪吒','巨灵神','太白金星'],right:1,why:'托塔李天王派巨灵神先到花果山，哪吒随后才出战。'}
  ],()=>{
    fourthFlagSequence=false;
    switchFourthScene('giant');
  });
}
function updateGiantBoss(dt,route){
  const boss=giantBoss;
  const warning=$('heavenWarning');
  const px=player.x+12;
  $('heavenBossName').textContent='花果山 · 巨灵神';
  $('heavenBossMeter').max=boss.maxHp;
  $('heavenBossMeter').value=boss.hp;
  $('heavenBossValue').textContent=healthText(boss.hp)+' / '+healthText(boss.maxHp);
  $('heavenBossHud').hidden=false;
  if(boss.hp<=0){
    warning.hidden=true;
    if(boss.defeatedAt===null){
      boss.defeatedAt=t;
      boss.attack=null;
      scatter(boss.x,422,95,['#f1cf9c','#c28c68','#d9c8a5'],185);
      noiseHit(.5,.37,1200,70);
    }
    if(t-boss.defeatedAt>=1.15){
      chapterTwoDialogue([
        ['巨灵神','好一根金箍棒！今日且退兵，回去禀报李天王！'],
        ['猴群','大王击退了巨灵神！齐天大圣旗还立着呢！']
      ],startNezhaArrival);
    }
    return;
  }
  if(enemyBound(boss))return;
  if(!boss.attack){
    const gap=px-boss.x;
    boss.dir=Math.sign(gap)||boss.dir;
    const moved=Math.abs(gap)>86?Math.min(Math.abs(gap)-86,138*dt):0;
    boss.x=Math.max(124,Math.min(1316,boss.x+boss.dir*moved));
    boss.phase+=moved*.043;
    boss.step+=(Number(moved>0)-boss.step)*Math.min(1,dt*10);
    warning.hidden=true;
    if(t>=boss.next&&Math.abs(px-boss.x)<=205&&transformedForm?.id!=='fly'){
      const kind=['stomp','throw','chop'][boss.turn++%3];
      const reach=kind==='throw'?176:kind==='chop'?140:112;
      const offset=Math.max(-reach,Math.min(reach,px-boss.x));
      boss.attack={kind,x:Math.max(30,Math.min(1410,boss.x+offset)),at:t,
        ends:t+(kind==='stomp'?2:1),side:Math.sign(offset)||boss.dir};
      chirp(kind!=='stomp'?168:77,kind!=='stomp'?440:46,.36,0,.19,'triangle');
      noiseHit(.29,.16,kind!=='stomp'?2900:530,100);
    }
  }
  const attack=boss.attack;
  if(!attack)return;
  const left=attack.ends-t;
  if(left>0){
    const seconds=(Math.ceil((left-1e-6)*10)/10).toFixed(1);
    const text=({throw:'⚠ 向下掷斧',chop:'⚠ 握斧下劈',stomp:'⚠ 巨灵神踩踏'}[attack.kind])+' · '+seconds+' 秒';
    if(warning.textContent!==text)warning.textContent=text;
    warning.hidden=false;
    return;
  }
  const axe=attack.kind!=='stomp';
  const radius=attack.kind==='throw'?94:axe?79:65;
  boss.impact={...attack,at:t,radius};
  boss.attack=null;
  boss.next=t+(axe?1.45:1.1);
  warning.hidden=true;
  if(Math.abs(px-attack.x)<radius&&player.y+player.h>(axe?355:393))heavenPlayerHit(axe?100:50);
  if(attack.kind==='throw')emitGroundWaves(attack.x,432);
  shakeOnImpact(attack.x,axe?11:8,axe ? .32 : .25);
  damageClonesNear(attack.x,radius,axe?355:393,axe?100:50);
  scatter(attack.x,425,axe?91:67,['#ffe7a6','#d89a67','#8f7a59'],200);
  playBossGroundImpact(axe?'giant-axe':'giant-stomp');
  if(health<=0){
    boss.attack=null;
    boss.next=t+3;
    loseLife(route);
  }
}
function drawLiJing(x,y){
  drawHeavenOfficer(x,y,'general',-1,false);
  rect(x-22,y-39,5,8,'#d5aa76');
  for(let i=0;i<4;i++){
    const yy=y-46-i*6;
    rect(x-29+i*2,yy,19-i*4,4,'#deb270');
    rect(x-26+i*2,yy-2,13-i*4,3,'#96714f');
  }
  rect(x-20,y-72,2,6,'#f6d498');
}
function drawGiantArena(c){
  drawBackground();
  for(let i=0;i<6;i++){
    const x=i*280+45-c;
    if(x>-120&&x<W+120)tree(x,432,1.1+i%3*.11);
  }
  drawSurfaceFloor(fourthRoutes.giant[0],c,'field');
  const flag=162-c;
  rect(flag,212,6,220,'#9a704d');rect(flag+2,215,2,213,'#dfb177');
  poly([[flag+5,220],[flag+112,219],[flag+96,245],[flag+109,269],[flag+5,269]],'#a84b46');
  drawBodhiLabel('齐天大圣',flag+51,250);
  drawGroundWaves(c);
  if(fourthScene==='nezha'){drawNezhaBoss(c);return;}
  const boss=giantBoss;
  if(boss.attack){
    const radius=boss.attack.kind==='throw'?94:boss.attack.kind==='chop'?79:65;
    const x=boss.attack.x-c;
    const alpha=.22+.1*Math.sin(t*18);
    rect(x-radius,408,radius*2,24,`rgba(242,108,73,${alpha})`);
    rect(x-radius,428,radius*2,4,'#ffb574');
  }
  const impact=boss.impact;
  if(impact&&t-impact.at<.55){
    const age=(t-impact.at)/.55,x=impact.x-c;
    glow(x,427,impact.radius*(.6+age),'#ffd47d89');
    ctx.save();ctx.globalAlpha=1-age;
    const reach=impact.radius*(.38+age*.78);
    poly([[x-reach,432],[x-36,423],[x-12,424],[x,399+age*23],[x+17,421],[x+reach,432]],'#ffc779');
    for(const side of [-1,1]){
      poly([[x,432],[x+side*27,436],[x+side*48,433],[x+side*reach,441],
        [x+side*46,437],[x+side*25,440]],'#795048');
      for(let i=0;i<6;i++){
        const dx=side*(13+i*7+age*(35+i*13));
        const dy=Math.max(0,(82+i*13)*age-128*age*age);
        rect(x+dx,429-dy,4+i%3*2,3+i%2*2,i%2?'#d6aa80':'#9b785f');
        rect(x+dx*1.23,418-age*(27+i*6),11+i*3,4,i%2?'#c5aa876e':'#debd936b');
      }
    }
    ctx.restore();
  }
  if(boss.hp>0||boss.defeatedAt!==null&&t-boss.defeatedAt<1.15){
    const fade=boss.defeatedAt===null?0:heavenEase((t-boss.defeatedAt)/1.15);
    drawPixelatedBoss(()=>drawGiantLowerBody(boss,c,fade),3,1-fade);
  }
}
function drawGiantLowerBody(boss,c,fade){
  const x=boss.x-c;
  const ink='#2a3641', gold='#e2b66e';
  const attack=boss.attack, impact=boss.impact;
  ctx.save();
  ctx.translate(x,fade*42);
  ctx.rotate(fade*boss.dir*.24);
  const step=Math.sin(boss.phase)*boss.step;
  const sway=step*8;
  const stomp=attack?.kind==='stomp'?attack:null;
  const stompImpact=impact?.kind==='stomp'?Math.max(0,1-(t-impact.at)/.42):0;
  const brace=stompImpact*9;
  const waist=sway-(stomp?stomp.side*heavenEase((t-stomp.at)/.55)*11:0);
  const bronze='#ac764b', bright='#f5d194';
  poly([[-137+waist,-36],[-118+waist,115+brace],[-91,250],[99,252],[120+waist,105+brace],[135+waist,-35]],ink);
  poly([[-129+waist,-26],[-112+waist,117+brace],[-79,239],[87,240],[110+waist,110+brace],[128+waist,-25]],'#823f42');
  poly([[-118+waist,-10],[-86+waist,-5],[-61+waist,109],[-98+waist,103]],'#9c5650');
  poly([[96+waist,-10],[120+waist,-13],[102+waist,100],[78+waist,107]],'#c27660');
  for(const side of [-1,1]){
    ctx.save();
    ctx.scale(side,1);
    const motion=step*side;
    const stomping=stomp?.side===side;
    const time=stomping?(t-stomp.at)/2:0;
    const windup=stomping?heavenEase(time/.28):0;
    const lift=stomping?69*windup*(1-heavenEase((time-.87)/.13)):Math.max(0,motion)*23;
    const recovery=impact?.kind==='stomp'&&impact.side===side?heavenEase(stompImpact):0;
    const aimed=stomping?Math.abs(stomp.x-boss.x):recovery?Math.abs(impact.x-boss.x):58;
    const foot=58+motion*24+(aimed-58)*(stomping?windup:recovery);
    const knee=52+(foot-58)*.52+(lift*.29)*side*boss.dir;
    const kneeY=314-lift*.46+brace*.65;
    const ankleY=396-lift;
    const hip=57+waist*side*.55;
    // Separate thigh, knee and shin plates follow the foot through each step.
    poly([[hip-37,207],[hip+37,205],[knee+30,kneeY+13],[knee-31,kneeY+15]],ink);
    poly([[hip-29,217],[hip+29,214],[knee+23,kneeY+6],[knee-24,kneeY+8]],'#4a626d');
    poly([[hip+12,224],[hip+27,219],[knee+20,kneeY+1],[knee+6,kneeY+4]],'#849998');
    poly([[knee-32,kneeY-4],[knee+32,kneeY-3],[foot+31,ankleY],[foot-31,ankleY]],ink);
    poly([[knee-25,kneeY+5],[knee+25,kneeY+3],[foot+25,ankleY-3],[foot-24,ankleY-3]],'#657f83');
    poly([[knee+10,kneeY+6],[knee+23,kneeY+5],[foot+21,ankleY-5],[foot+8,ankleY-6]],'#a0ae9f');
    for(let i=1;i<=3;i++){
      const f=i/4, px=knee+(foot-knee)*f, yy=kneeY+(ankleY-kneeY)*f;
      rect(px-21,yy,43,4,'#354d57');rect(px-19,yy,39,1,bronze);
    }
    poly([[knee-31,kneeY-11],[knee-16,kneeY-22],[knee+19,kneeY-22],
      [knee+31,kneeY-9],[knee+23,kneeY+12],[knee,kneeY+19],[knee-23,kneeY+11]],'#334951');
    poly([[knee-23,kneeY-9],[knee-12,kneeY-16],[knee+17,kneeY-16],
      [knee+24,kneeY-7],[knee+17,kneeY+8],[knee,kneeY+13],[knee-17,kneeY+7]],bronze);
    poly([[knee-10,kneeY-4],[knee,kneeY-12],[knee+12,kneeY-4],[knee,kneeY+7]],bright);
    for(const dx of [-17,17])rect(knee+dx-1,kneeY-5,3,3,'#f1cd8f');
    poly([[foot-32,ankleY-6],[foot+29,ankleY-7],[foot+44,414-lift],
      [foot+48,430-lift],[foot+42,432-lift],[foot-42,432-lift],[foot-39,415-lift]],ink);
    poly([[foot-30,ankleY-2],[foot+26,ankleY-2],[foot+39,415-lift],
      [foot+41,424-lift],[foot-34,424-lift],[foot-34,417-lift]],'#637777');
    rect(foot-33,418-lift,73,4,bronze);
    rect(foot-31,418-lift,66,1,bright);
    rect(foot-34,428-lift,73,2,'#9b8d6c');
    for(let i=0;i<4;i++)rect(foot-25+i*17,423-lift,3,3,'#314952');
    ctx.restore();
  }
  const beltY=129+brace;
  poly([[-118+waist,106+brace],[-79+waist,121+brace],[79+waist,121+brace],[118+waist,106+brace],
    [110+waist,145+brace],[-110+waist,145+brace]],'#51373c');
  rect(-104+waist,beltY,208,7,bronze);
  rect(-101+waist,beltY,202,2,gold);
  poly([[waist-20,beltY+3],[waist,beltY-13],[waist+20,beltY+3],[waist,beltY+17]],'#4b3c3d');
  poly([[waist-14,beltY+3],[waist,beltY-8],[waist+14,beltY+3],[waist,beltY+12]],gold);
  rect(waist-4,beltY,8,7,'#a7544b');
  for(let i=0;i<7;i++){
    const left=-105+i*30+waist;
    const swish=step*(i-3)*3+Math.sin(t*5+i)*2;
    const yy=146+brace;
    poly([[left,yy],[left+29,yy],[left+27+swish,yy+58],[left+14+swish,yy+83],
      [left+2+swish,yy+58]],ink);
    poly([[left+2,yy+2],[left+26,yy+2],[left+24+swish,yy+57],
      [left+14+swish,yy+77],[left+5+swish,yy+56]],i%2?'#aa6e53':'#9d604c');
    rect(left+5,yy+7,19,3,gold);
    for(let row=0;row<4;row++){
      const rx=left+7+swish*row/5, ry=yy+19+row*10;
      rect(rx,ry,15,4,'#83494a');
      rect(rx+1,ry,12,1,'#d69869');
    }
    rect(left+12+swish,yy+62,4,8,gold);
  }
  const axe=attack&&attack.kind!=='stomp'?attack:impact&&impact.kind!=='stomp'&&t-impact.at<.42?impact:null;
  if(axe?.kind==='chop'){
    drawGiantTwoHandChop(axe,axe===attack,boss.x);
  }else if(axe){
    const down=axe===attack?heavenEase((t-attack.at-.55)/.45):1;
    const ax=axe.x-boss.x;
    const headY=32+down*365;
    if(down>0&&axe===attack){
      for(let i=1;i<=4;i++)rect(ax-i*4,headY-i*22,7+i*4,17,'#eac79485');
    }
    poly([[ax-7,headY-265],[ax+9,headY-267],[ax+12,headY+25],[ax-5,headY+25]],'#5e3e36');
    rect(ax,headY-244,5,262,'#bd875c');
    poly([[ax-10,headY-19],[ax-58,headY-35],[ax-91,headY-18],[ax-97,headY+10],
      [ax-71,headY+29],[ax-10,headY+12]],ink);
    poly([[ax-12,headY-14],[ax-59,headY-29],[ax-86,headY-14],[ax-90,headY+8],
      [ax-69,headY+23],[ax-12,headY+9]],'#a5b3b0');
    poly([[ax-59,headY-29],[ax-86,headY-14],[ax-90,headY+8],[ax-69,headY+23],
      [ax-79,headY+7],[ax-77,headY-9]],'#e2e8ce');
    rect(ax-16,headY-19,28,5,gold);
    poly([[ax-43,headY-16],[ax-27,headY-6],[ax-43,headY+8],[ax-59,headY-4]],'#677c83');
    rect(ax-45,headY-9,4,9,bright);
    for(let i=0;i<6;i++)rect(ax-4,headY-28-i*11,13,3,i%2?bronze:gold);
  }else{
    const shaft=115+step*5;
    rect(shaft,-75,16,253,'#66463c');
    rect(shaft+4,-60,4,225,'#a47958');
    for(let i=0;i<5;i++)rect(shaft-2,66+i*13,20,3,i%2?gold:bronze);
  }
  ctx.restore();
}

function drawGiantTwoHandChop(axe,attacking,bossX){
  const age=t-axe.at, side=axe.side;
  const lift=attacking?heavenEase(age/.43):1;
  const swing=attacking?heavenEase((age-.65)/.35):1;
  const recover=attacking?0:heavenEase(age/.42);
  const raisedX=side*(115-166*lift);
  const raisedY=171-248*lift;
  const headX=raisedX+(axe.x-bossX-raisedX)*swing;
  const headY=raisedY+(398-raisedY)*swing-recover*49;
  const angle=side*(.12+2.7*lift)*(1-swing)+side*(.1-recover*.37);
  const sin=Math.sin(angle), cos=Math.cos(angle);
  // Both gauntlets are attached to the same rotating shaft.
  const grips=[-113,-175].map((offset,i)=>({
    x:headX-offset*sin,y:headY+offset*cos,shoulder:i===0?side*104:-side*104
  }));
  for(const [i,grip] of grips.entries()){
    const shoulder={x:grip.shoulder,y:-12};
    const dx=grip.x-shoulder.x,dy=grip.y-shoulder.y;
    const length=Math.hypot(dx,dy)||1;
    const bend=Math.min(48,Math.max(14,58-length*.14))*(i===0?side:-side);
    const elbow={x:shoulder.x+dx*.48+dy/length*bend,y:shoulder.y+dy*.48-dx/length*bend};
    drawGiantArmSegment(shoulder,elbow,25,18,i!==0,false);
    poly([[elbow.x-18,elbow.y-5],[elbow.x-8,elbow.y-17],[elbow.x+10,elbow.y-16],
      [elbow.x+18,elbow.y-1],[elbow.x+11,elbow.y+13],[elbow.x-10,elbow.y+13]],'#354950');
    rect(elbow.x-5,elbow.y-8,10,8,'#ad835e');
    drawGiantArmSegment(elbow,grip,17,11,i!==0,true);
  }
  if(swing>0&&swing<1){
    poly([[headX-side*70,headY-81],[headX-side*27,headY-35],[headX+side*53,headY-17],
      [headX+side*33,headY+4],[headX-side*28,headY-10]],'#f1c58b74');
  }
  ctx.save();
  ctx.translate(headX,headY);
  ctx.rotate(angle);
  rect(-8,-230,16,249,'#533e37');
  rect(-5,-226,10,241,'#98694b');
  rect(-4,-224,3,235,'#c5905f');
  ctx.scale(side,1);
  poly([[-10,-18],[46,-32],[75,-22],[91,3],[73,31],[42,27],[-10,15]],'#2d414b');
  poly([[-6,-13],[45,-26],[70,-17],[84,3],[70,25],[42,21],[-6,11]],'#82999c');
  poly([[45,-26],[70,-17],[84,3],[70,25],[58,22],[73,3],[62,-13]],'#e9e6cc');
  rect(-13,-20,26,5,'#edc58a');
  rect(-13,14,26,5,'#b57a52');
  ctx.restore();
  for(const grip of grips){
    ctx.save();
    ctx.translate(grip.x,grip.y);
    ctx.rotate(angle);
    poly([[-13,-10],[7,-12],[13,-7],[13,7],[8,12],[-11,11],[-15,5]],'#533c38');
    poly([[-11,-8],[7,-10],[11,-6],[10,7],[5,9],[-10,8],[-12,4]],'#ba8259');
    for(let i=0;i<4;i++){
      rect(-9,-7+i*4,14-i%2*2,2,'#eac18c');
      rect(-9,-5+i*4,12,1,'#79564a');
    }
    rect(5,-6,5,10,'#d4a172');
    ctx.restore();
  }
}
function drawGiantArmSegment(from,to,near,far,inShadow,bracer){
  const dx=to.x-from.x,dy=to.y-from.y;
  const length=Math.hypot(dx,dy)||1;
  ctx.save();
  ctx.translate(from.x,from.y);
  ctx.rotate(Math.atan2(dy,dx));
  poly([[-5,-near],[length+4,-far],[length+5,far],[-5,near]],'#263942');
  poly([[0,-near+4],[length,-far+4],[length,far-3],[0,near-3]],inShadow?'#4c646e':'#728989');
  poly([[0,-near+4],[length,-far+4],[length,-far+10],[0,-near+12]],inShadow?'#728486':'#a1b1aa');
  poly([[0,near*.49],[length,far*.4],[length,far-3],[0,near-3]],'#40535b');
  for(const fraction of bracer?[.33,.57,.79]:[.24,.46]){
    const edge=near+(far-near)*fraction-3;
    const start=length*fraction;
    rect(start,-edge,5,edge*2,'#a57151');
    rect(start,-edge,2,edge*2,'#dfb67c');
    rect(start+1,-edge+4,3,3,'#ffe0a2');
  }
  ctx.restore();
}

let groundWaves=[];
function emitGroundWaves(x,y,damage=30,reach=22){
  for(const dir of [-1,1]){
    const edge=dir<0?Math.min(cam,x-18):Math.max(cam+W,x+18);
    groundWaves.push({x,y,dir,edge,hit:false,at:t,damage,reach});
  }
}
function updateGroundWaves(dt){
  const px=player.x+12, bottom=player.y+player.h;
  groundWaves=groundWaves.filter(wave=>{
    const before=wave.x;
    wave.x=wave.dir>0?Math.min(wave.edge,before+440*dt):Math.max(wave.edge,before-440*dt);
    if(!wave.hit&&px>=Math.min(before,wave.x)-wave.reach&&px<=Math.max(before,wave.x)+wave.reach&&
        bottom>=wave.y-21&&player.y<wave.y+8){
      wave.hit=true;
      heavenPlayerHit(wave.damage);
    }
    return wave.x!==wave.edge;
  });
}
function drawGroundWaves(c){
  for(const wave of groundWaves){
    const x=wave.x-c,y=wave.y,dir=wave.dir;
    glow(x,y-8,35,'#ffe09270');
    poly([[x-dir*52,y],[x-dir*18,y-7],[x-dir*4,y-22],[x+dir*13,y-19],
      [x+dir*26,y-5],[x+dir*22,y],[x-dir*15,y+3]],'#d3764a');
    poly([[x-dir*37,y-1],[x-dir*11,y-5],[x+dir*3,y-16],[x+dir*14,y-14],
      [x+dir*21,y-4],[x+dir*7,y]],'#fff0ad');
    for(let i=0;i<4;i++)rect(x-dir*(20+i*10),y-5-i%2*6,6,2,'#edb96e');
  }
}

const NEZHA_RIBBON_RANGE=150, NEZHA_RIBBON_COOLDOWN=12;
const NEZHA_DIVE_DURATION=.25;
const nezhaPatterns=[['spear','rain','ribbon'],['spear','ribbon','dive']];
let nezhaBoss, nezhaFireballs=[], nezhaFlames=[], nezhaBurn=null, nezhaCrackleAt=0, nezhaRibbonUntil=0;
function clearNezhaFire(){
  nezhaFireballs=[];
  nezhaFlames=[];
  nezhaBurn=null;
  nezhaRibbonUntil=0;
  for(const clone of combatClones)clone.nezhaBurn=null;
  nezhaCrackleAt=t;
}
function resetNezhaBoss(){
  clearNezhaFire();
  nezhaBoss={id:'nezha',x:719,y:432,dir:-1,hp:400,maxHp:400,armor:.2,phase:1,
    next:t+.8,move:null,transformAt:null,trail:-Infinity,turn:0,stride:0,walking:false,ribbonReadyAt:t};
}
function startNezhaArrival(){
  groundWaves=[];
  $('heavenBossHud').hidden=true;
  chapterTwoDialogue([
    ['天兵 · 李天王阵前','报！巨灵神败回来了，挡不住孙悟空！'],
    ['哪吒','父王，我去会会他！'],
    ['哪吒 · 花果山','孙悟空，看枪！让我试试你的金箍棒！']
  ],()=>switchFourthScene('nezha'));
}
function updateNezhaBoss(dt,route){
  const boss=nezhaBoss, px=player.x+12, warning=$('heavenWarning');
  $('heavenBossName').textContent=boss.phase===2?'哪吒 · 三头六臂':'哪吒 · 单头';
  $('heavenBossMeter').max=boss.maxHp;
  $('heavenBossMeter').value=boss.hp;
  $('heavenBossValue').textContent=healthText(boss.hp)+' / '+healthText(boss.maxHp);
  $('heavenBossHud').hidden=false;
  warning.hidden=true;
  if(boss.hp<=0){
    clearNezhaFire();
    $('heavenBossHud').hidden=true;
    scatter(boss.x,boss.y-20,78,['#ffdf94','#db7e5d','#eed5a2'],160);
    noiseHit(.42,.33,1800,80);
    chapterTwoDialogue([
      ['哪吒','这金箍棒果然厉害！今日暂且收兵。'],
      ['猴群','大王连哪吒也打退了！齐天大圣旗守住了！']
    ],startFourthLoot);
    return;
  }
  updateNezhaFire(dt);
  if(health<=0){resetNezhaAfterDeath(route);return;}
  if(enemyBound(boss))return;
  if(boss.phase===1&&boss.hp<=200){
    boss.phase=2;
    boss.armor=0;
    boss.move=null;
    boss.turn=0;
    boss.transformAt=t;
    boss.next=t+1.15;
    scatter(boss.x,boss.y-26,72,['#ffcf84','#ed795e','#f2e0a3'],180);
    chirp(145,660,.65,0,.23,'triangle');
    noiseHit(.5,.28,1550,3600);
  }
  if(boss.transformAt!==null&&t-boss.transformAt<.84){
    boss.y=432-Math.sin(Math.PI*(t-boss.transformAt)/.84)*55;
    warning.textContent='哪吒 · 三头六臂';
    warning.hidden=false;
    return;
  }
  boss.walking=false;
  if(!boss.move){
    boss.y=432;
    const clone=closestEnemyVictim(boss);
    const pattern=nezhaPatterns[boss.phase-1];
    const planned=pattern[boss.turn%pattern.length];
    const canCastRibbon=t>=boss.ribbonReadyAt&&player.ground&&!playerFrozen()&&
      Math.abs(px-boss.x)<=NEZHA_RIBBON_RANGE&&transformedForm?.id!=='fly';
    const kind=planned==='ribbon'&&!canCastRibbon?'spear':planned;
    const target=kind==='ribbon'?px:clone?.x??px;
    const gap=target-boss.x;
    boss.dir=Math.sign(gap)||boss.dir;
    const ranges={spear:boss.phase===1?145:215,rain:330,ribbon:NEZHA_RIBBON_RANGE,dive:420};
    const range=ranges[kind];
    if(t<boss.next||Math.abs(gap)>range||(!clone&&transformedForm?.id==='fly')){
      const step=Math.min(Math.max(0,Math.abs(gap)-64),dt*163);
      boss.x=Math.max(40,Math.min(1400,boss.x+boss.dir*step));
      boss.stride+=step*.11;
      boss.walking=step>0;
      return;
    }
    boss.turn++;
    if(kind==='ribbon')boss.ribbonReadyAt=t+NEZHA_RIBBON_COOLDOWN;
    const windups={spear:boss.phase===1?.26:.54,rain:.9,ribbon:.72,dive:.78};
    boss.move={kind,at:t,ends:t+windups[kind],dir:boss.dir,target,cloneHits:new Set()};
    chirp(kind==='spear'?200:120,kind==='spear'?720:445,.23,0,.13,'triangle');
  }
  const move=boss.move;
  if(move.kind==='ribbon'){
    updateNezhaRibbon(boss,move,warning);
  }else if(move.kind==='dive'){
    updateNezhaDive(boss,move,warning);
  }else if(move.kind==='rain'){
    if(!move.released){
      const lift=heavenEase((t-move.at)/.57);
      boss.y=432-lift*151;
      warning.textContent='⚠ 哪吒升空 · 三枚火球';
      warning.hidden=false;
      if(t<move.ends)return;
      const center=Math.max(105,Math.min(1335,move.target));
      for(const offset of [-92,0,92]){
        const x=center+offset, y=boss.y-15;
        nezhaFireballs.push({x:boss.x,y,vx:(x-boss.x)/.64,vy:(426-y)/.64,left:.64,target:x});
      }
      move.released=true;
      move.ends=t+.54;
      for(let i=0;i<3;i++){
        const offset=i*.032;
        noiseHit(.26,.15,3800+i*330,820,offset);
        chirp(590+i*73,165+i*18,.36,offset,.075,'triangle');
      }
    }else{
      boss.y=432-(432-281)*heavenEase((move.ends-t)/.54);
      if(t>=move.ends)finishNezhaMove(boss,.85);
    }
  }else if(!move.dashing){
    if(boss.phase===2){warning.textContent='⚠ 哪吒 · 贴地穿刺';warning.hidden=false;}
    if(t<move.ends)return;
    move.dashing=true;move.ends=t+(boss.phase===1?.30:.37);
    noiseHit(.28,.31,4900,210);
  }else{
    const before=boss.x;
    boss.x=Math.max(32,Math.min(1408,boss.x+move.dir*(boss.phase===1?370:680)*dt));
    boss.stride+=Math.abs(boss.x-before)*.14;
    boss.walking=boss.x!==before;
    boss.trail=t;
    const distance=(px-boss.x)*move.dir;
    const previous=(px-before)*move.dir;
    const damage=boss.phase===1?20:120;
    if(!move.hit&&distance>=-18&&previous<=72+Math.abs(boss.x-before)&&Math.abs(player.y+34-boss.y)<46){
      move.hit=true;heavenPlayerHit(damage);
    }
    hitNezhaClones(move,damage,clone=>
      (clone.x-boss.x)*move.dir>=-18&&(clone.x-before)*move.dir<=72+Math.abs(boss.x-before)&&
      Math.abs(clone.y-boss.y)<46);
    if(t>=move.ends||boss.x===32||boss.x===1408)finishNezhaMove(boss,boss.phase===1?.65:.95);
  }
  if(health<=0)resetNezhaAfterDeath(route);
}
function nezhaRibbonReach(move){
  return NEZHA_RIBBON_RANGE*heavenEase((t-move.releasedAt)/.27);
}
function updateNezhaRibbon(boss,move,warning){
  if(move.releasedAt===undefined){
    warning.textContent='⚠ 哪吒 · 混天绫';
    warning.hidden=false;
    if(t<move.ends)return;
    move.releasedAt=t;
    move.ends=t+.46;
    noiseHit(.26,.23,4100,490);
  }
  const ahead=(player.x+12-boss.x)*move.dir;
  if(!move.hit&&player.ground&&ahead>=0&&ahead<=nezhaRibbonReach(move)&&Math.abs(player.y+17-(boss.y-28))<=32&&
      transformedForm?.id!=='fly'&&!playerFrozen()){
    move.hit=true;
    nezhaRibbonUntil=t+5;
    clearTransformation();
    player.vx=0;
    slamActive=false;
    jumpRequestedUntil=-1;
    scatter(player.x+12,player.y+19,25,['#f49e8a','#c94f61','#ffe5aa'],82);
    toast('混天绫 · 缠绕 5 秒');
  }
  if(t>=move.ends)finishNezhaMove(boss,1.2);
}
function updateNezhaDive(boss,move,warning){
  if(move.diveAt===undefined){
    boss.y=432-205*heavenEase((t-move.at)/.38);
    const clone=closestEnemyVictim(boss);
    if(clone||transformedForm?.id!=='fly'){
      move.target=clone?.x??player.x+12;
      move.dir=Math.sign(move.target-boss.x)||move.dir;
      boss.dir=move.dir;
    }
    warning.textContent='⚠ 风火轮 · 正在瞄准';
    warning.hidden=false;
    if(t<move.ends)return;
    warning.textContent='⚠ 风火轮 · 落点已锁定';
    move.diveAt=t;
    move.fromX=boss.x;
    move.fromY=boss.y;
    move.ends=t+NEZHA_DIVE_DURATION;
    noiseHit(.32,.31,5300,190);
    chirp(610,95,.33,0,.16,'sawtooth');
  }
  const fromX=boss.x,fromY=boss.y;
  const progress=heavenEase((t-move.diveAt)/NEZHA_DIVE_DURATION);
  boss.x=move.fromX+(move.target-move.fromX)*progress;
  boss.y=move.fromY+(432-move.fromY)*progress;
  const dx=boss.x-fromX,dy=boss.y-fromY;
  const length=dx*dx+dy*dy||1;
  const inPath=(x,y)=>{
    const fraction=Math.max(0,Math.min(1,((x-fromX)*dx+(y-fromY)*dy)/length));
    return Math.hypot(x-(fromX+dx*fraction),y-(fromY+dy*fraction))<=45;
  };
  if(!move.hit&&inPath(player.x+12,player.y+player.h))move.hit=heavenPlayerHit(100);
  hitNezhaClones(move,100,clone=>inPath(clone.x,clone.y));
  if(t>=move.ends){
    scatter(boss.x,429,42,['#ffd786','#f29d55','#d66a62'],138);
    playBossGroundImpact('heaven');
    finishNezhaMove(boss,1.2);
  }
}
function hitNezhaClones(move,damage,inRange){
  for(const clone of combatClones){
    if(clone.hp<=0||move.cloneHits.has(clone)||!inRange(clone))continue;
    move.cloneHits.add(clone);
    damageCombatClone(clone,damage);
  }
}
function finishNezhaMove(boss,recovery){
  boss.y=432;
  boss.move=null;
  boss.next=t+recovery;
}
function resetNezhaAfterDeath(route){
  clearNezhaFire();
  finishNezhaMove(nezhaBoss,3);
  loseLife(route);
}
function updateNezhaFire(dt){
  let impacts=0;
  for(const shot of nezhaFireballs){
    shot.left-=dt;
    shot.x+=shot.vx*dt;
    shot.y+=shot.vy*dt;
    if(shot.left<=0){
      nezhaFlames.push({x:shot.target,at:t,until:t+4.6});
      scatter(shot.target,429,24,['#ffea9e','#ec8554','#b8564b'],118);
      impacts++;
    }
  }
  nezhaFireballs=nezhaFireballs.filter(shot=>shot.left>0);
  nezhaFlames=nezhaFlames.filter(fire=>fire.until>t);
  if(impacts){
    noiseHit(.12,.20,5200,1300);
    noiseHit(.23,.24,1300,120,.015);
    chirp(105,52,.16,0,.11);
  }
  if((nezhaBurn||nezhaFlames.some(fire=>Math.abs(fire.x-player.x)<500))&&t>=nezhaCrackleAt){
    const spark=.5+.5*Math.sin(t*13.71);
    nezhaCrackleAt=t+.07+spark*.21;
    noiseHit(.027+spark*.031,.034+spark*.063,3700+spark*5600,690+spark*550);
    if(spark>.57)noiseHit(.067,.046,1600+spark*4700,230,.018);
    if(spark>.84)noiseHit(.031,.064,9100,1400,.071);
  }
  const touching=player.y+player.h>=410&&player.y<432&&
    nezhaFlames.some(fire=>Math.abs(player.x+12-fire.x)<33);
  if(touching&&!nezhaBurn){
    nezhaBurn={next:t+1,ticks:3};
    noiseHit(.25,.14,2900,700);
    toast('灼烧 · 每秒失去 10 点生命，持续 3 秒');
  }
  while(nezhaBurn&&t>=nezhaBurn.next){
    hurtPlayer(10);
    noiseHit(.09,.095,4800,1300);
    scatter(player.x+12,player.y+20,13,['#ffcb70','#ec7954'],65);
    if(--nezhaBurn.ticks===0)nezhaBurn=null;
    else nezhaBurn.next+=1;
  }
  for(const clone of combatClones){
    if(clone.hp<=0)continue;
    const touchingFire=clone.y>=410&&clone.y-34<432&&nezhaFlames.some(fire=>Math.abs(clone.x-fire.x)<33);
    if(touchingFire&&!clone.nezhaBurn)clone.nezhaBurn={next:t+1,ticks:3};
    while(clone.nezhaBurn&&clone.hp>0&&t>=clone.nezhaBurn.next){
      damageCombatClone(clone,10);
      if(--clone.nezhaBurn.ticks===0)clone.nezhaBurn=null;
      else clone.nezhaBurn.next+=1;
    }
  }
}
function drawNezhaBoss(c){
  for(const shot of nezhaFireballs)drawHeavenFire(shot.x-c,shot.y,13,Math.atan2(shot.vy,shot.vx));
  for(const fire of nezhaFlames)drawNezhaGroundFire(fire,c);
  const boss=nezhaBoss;
  if(boss.hp<=0)return;
  const x=boss.x-c,y=boss.y, evolved=boss.phase===2, move=boss.move;
  contactShadow(x,432,34);
  if(move?.kind==='rain'&&!move.released){
    const center=Math.max(105,Math.min(1335,move.target));
    for(const dx of [-92,0,92])rect(center+dx-c-31,427,62,4,'#ffb77b9a');
  }
  if(move?.kind==='ribbon'&&move.releasedAt!==undefined){
    const end=x+move.dir*nezhaRibbonReach(move);
    drawNezhaRibbon(x,y-28,end,t-move.releasedAt);
  }
  if(move?.kind==='dive'){
    const landing=move.target-c;
    rect(landing-43,426,86,5,move.diveAt===undefined?'#ffb577bc':'#ff7753');
    if(move.diveAt!==undefined){
      for(let i=1;i<=4;i++)rect(x-move.dir*i*9,y-i*15,20,4,'#fd964b96');
    }
    for(const offset of [-12,12]){
      drawNezhaFlameTongue(x+offset,y+6,12,20,offset);
      rect(x+offset-7,y-1,14,4,'#fff0a3');
    }
  }
  if(move?.dashing){
    for(let i=1;i<6;i++)rect(x-boss.dir*i*13,y-34+i%2*9,19,3,'#f4ab6592');
  }
  if(y<415)glow(x,y-30,57,'#ffb36665');
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(boss.dir,1);
  const ink='#323041', robe='#ae4e54', gold='#edbf79', silk='#f08a78';
  const gait=boss.walking?Math.sin(boss.stride):0;
  for(const [hip,dir] of [[-7,-1],[6,1]]){
    const step=gait*dir;
    const foot=hip+step*12, lift=Math.max(0,step)*9;
    poly([[hip-5,-16],[hip+5,-16],[foot+5,-4-lift],[foot+9,-2-lift],[foot+7,1-lift],
      [foot-5,1-lift],[foot-6,-5-lift]],ink);
    rect(foot-3,-6-lift,7,3,'#8b6a6a');
    rect(foot-3,-2-lift,8,2,gold);
  }
  const lean=move?.dashing?6:0;
  ctx.translate(lean,Math.round(-Math.abs(gait)*2));
  poly([[-9,-43],[-25,-48],[-43,-40],[-58,-46],[-48,-32],[-31,-36],[-18,-30],[-9,-34]],'#803d52');
  poly([[-10,-41],[-25,-45],[-43,-37],[-51,-41],[-45,-35],[-31,-38],[-17,-33]],silk);
  poly([[-17,-9],[-14,-38],[-7,-48],[9,-48],[17,-36],[18,-11],[11,-7],[-12,-7]],ink);
  poly([[-14,-11],[-11,-37],[-6,-45],[8,-45],[14,-35],[15,-13],[8,-10],[-10,-10]],robe);
  poly([[-7,-43],[7,-43],[10,-36],[4,-30],[-4,-31],[-10,-36]],'#df8271');
  rect(-12,-19,26,4,gold);rect(-4,-20,8,6,'#926454');rect(-2,-19,4,4,'#ffe3a3');
  rect(-10,-13,21,2,'#f5ac78');
  const heads=evolved?[[-21,-49],[0,-57],[21,-49]]:[[0,-57]];
  for(const [hx,hy] of heads){
    poly([[hx-10,hy-4],[hx-8,hy-10],[hx+8,hy-10],[hx+11,hy-4],
      [hx+10,hy+8],[hx+4,hy+12],[hx-5,hy+11],[hx-9,hy+6]],ink);
    rect(hx-7,hy-4,15,12,'#e4ad83');rect(hx+1,hy+1,7,7,'#f5c597');
    rect(hx-8,hy-7,16,4,ink);rect(hx-11,hy-12,6,7,ink);rect(hx+5,hy-12,6,7,ink);
    rect(hx-9,hy-9,3,2,'#82545d');rect(hx+6,hy-10,3,2,'#82545d');
    rect(hx-6,hy-3,13,2,gold);
    rect(hx+2,hy+1,4,2,ink);rect(hx+4,hy+6,3,1,'#a96355');
  }
  const arms=evolved?[[-14,-44],[-18,-34],[-14,-24],[13,-44],[16,-34],[14,-24]]:[[-12,-34],[14,-31]];
  for(const [ax,ay] of arms){
    const side=Math.sign(ax), reach=move?.dashing&&side>0?19:13;
    poly([[ax,ay],[ax+side*reach,ay-5],[ax+side*(reach+6),ay+1],[ax+side*9,ay+6],[ax,ay+5]],ink);
    rect(ax+side*(reach-3)-2,ay-3,7,5,gold);
    rect(ax+side*(reach+2)-2,ay-4,5,5,'#ecb18b');
  }
  ctx.translate(move?.dashing?33:20,-30);
  ctx.rotate(move?.diveAt!==undefined ? .76 :move?.dashing?-.04:move?.kind==='rain'?-.85:.36);
  rect(-21,-2,76,4,'#573947');rect(-20,-2,74,1,'#c9885d');
  poly([[51,-7],[70,0],[51,7],[54,0]],'#e6d0ab');
  poly([[53,-4],[68,0],[54,1]],'#fff1c0');
  rect(49,-4,5,8,gold);rect(45,-5,4,10,'#c85b59');
  ctx.restore();
}

function drawNezhaRibbon(start,y,end,age){
  const points=Array.from({length:11},(_,i)=>[
    start+(end-start)*i/10,y+Math.sin(i*.86-age*17)*11*i/10
  ]);
  const band=points.slice().reverse().map(([x,yy])=>[x,yy+8]);
  poly([...points,...band],'#c4455c');
  poly([...points,...points.slice().reverse().map(([x,yy])=>[x,yy+2])],'#ffb591');
}
function drawNezhaRibbonWrap(c){
  const x=player.x+12-c,y=player.y;
  for(let i=0;i<3;i++){
    const yy=y+10+i*7;
    poly([[x-15,yy+4],[x+13,yy-3],[x+15,yy+1],[x-12,yy+9]],'#c4455c');
    poly([[x-15,yy+4],[x+13,yy-3],[x+14,yy-1],[x-13,yy+6]],'#ffad94');
  }
  drawBodhiLabel('混天绫 '+(nezhaRibbonUntil-t).toFixed(1)+' 秒',x,y-24);
}

// Each flame is rooted at the fuel surface, with a changing tip and a hotter core.
function drawNezhaFlameTongue(x,y,width,height,seed){
  const w=Math.round(width), h=Math.round(height);
  const lean=Math.round(Math.sin(t*12+seed)*w*.55);
  const curl=Math.round(Math.sin(t*19+seed*2)*w*.32);
  poly([[x-w,y],[x-w,y-h*.31],[x-w*.56,y-h*.48],[x-w*.36,y-h*.73],
    [x+lean,y-h],[x+lean+curl,y-h*.66],[x+w*.62,y-h*.48],[x+w,y-h*.27],[x+w,y]],'#b54a3d');
  poly([[x-w*.71,y],[x-w*.7,y-h*.30],[x-w*.35,y-h*.48],
    [x+lean*.72,y-h*.82],[x+lean*.77,y-h*.59],[x+w*.50,y-h*.39],[x+w*.65,y]],'#ed7840');
  poly([[x-w*.49,y],[x-w*.4,y-h*.24],[x+lean*.55,y-h*.60],
    [x+lean*.38+w*.3,y-h*.38],[x+w*.39,y-h*.14],[x+w*.36,y]],'#ffbb56');
  poly([[x-w*.25,y],[x-w*.2,y-h*.18],[x+lean*.34,y-h*.35],[x+w*.25,y-h*.11],[x+w*.24,y]],'#fff0a0');
}
function drawNezhaGroundFire(fire,c){
  const x=fire.x-c,y=432;
  const age=t-fire.at, fade=Math.min(1,(fire.until-t)/.65);
  const spread=heavenEase(age/.16);
  ctx.save();
  ctx.globalAlpha=Math.max(0,fade);
  glow(x,y-9,57,'#ff864857');
  rect(x-34,y-3,68,4,'#553a39');
  rect(x-29,y-2,58,2,'#f19050');
  for(let i=0;i<5;i++){
    const phase=(age*.55+i*.22)%1;
    const sx=x+(i-2)*11+Math.sin(t*4+i)*7;
    rect(sx-8,y-23-phase*39,15+i%2*5,4,'#62505254');
  }
  for(let i=-3;i<=3;i++){
    const h=(20+(3-Math.abs(i))*4+Math.sin(t*19+i*2)*6)*(.68+spread*.32);
    drawNezhaFlameTongue(x+i*9,y,6+(i%2===0?2:0),h,i+fire.x);
  }
  for(let i=0;i<9;i++){
    const life=(age*1.6+i*.17)%1;
    const px=x+(i%3-1)*18+Math.sin(i*4+life*3)*13;
    rect(px,y-9-life*46,2+(i%2),2,i%3?'#f69c52':'#ffe093');
  }
  if(age<.18){
    const splash=heavenEase(age/.18);
    const r=8+30*splash;
    poly([[x-r,y-1],[x-r*.62,y-7],[x,y-13],[x+r*.62,y-7],[x+r,y-1]],'#ffe7a1');
  }
  ctx.restore();
}
function drawNezhaBurn(c){
  if(!nezhaBurn)return;
  const x=player.x+12-c, y=player.y;
  glow(x,y+19,27,'#ff9a4c47');
  for(let i=0;i<4;i++){
    const side=i%2?1:-1;
    const px=x+side*(11+i%2*2)+Math.sin(t*14+i)*2;
    drawNezhaFlameTongue(px,y+31-i*6,3,11+Math.sin(t*19+i*1.7)*5,i);
  }
  for(let i=0;i<6;i++){
    const life=(t*2+i*.23)%1;
    rect(x+(i%2?1:-1)*(7+i)+Math.sin(t*8+i)*4,y+31-life*46,2,2,i%2?'#ffd98b':'#ef8b4b');
  }
}

let fourthLootSequence=false, fourthLootX=0;
function placeFourthLoot(){
  const ahead=player.x+12+player.face*118;
  return ahead>1360||ahead<80?player.x+12-player.face*118:ahead;
}
function startFourthLoot(savedX){
  if(progress.skills?.goldStaff&&progress.skills?.goldArmor){finishChapterFour();return;}
  nezhaBoss.hp=0;
  fourthComplete=false;
  fourthLootSequence=true;
  fourthLootX=Number.isFinite(savedX)?savedX:placeFourthLoot();
  $('heavenBossHud').hidden=true;
  $('heavenWarning').hidden=true;
  openFourthRoute();
}
function pickFourthLoot(){
  if(!nearFourth(fourthLootX,49)||transformedForm)return;
  progress.skills??={};
  if(!progress.skills.goldStaff){
    progress.skills.goldStaff=true;
    toast('已拾取 · 金箍棒攻击 +2');
    scatter(fourthLootX,362,40,['#fff0ad','#eab56c'],110);
    tone(660,.21);
    if(!progress.skills.goldArmor){
      fourthLootX=placeFourthLoot();
      chapterTwoQuest(fourthQuest());
      saveChapterFour();
      return;
    }
  }
  if(!progress.skills.goldArmor){
    progress.skills.goldArmor=true;
    maxHealth+=30;
    health=roundHealth(health+30);
    refreshHealth();
  }
  finishChapterFour();
}
function drawFourthLoot(c){
  const staff=!progress.skills?.goldStaff;
  const x=fourthLootX-c;
  const y=272+Math.sin(t*3.6)*7;
  glow(x,y,136,'#ffce765e');
  for(let i=0;i<16;i++){
    const angle=i*Math.PI/8+t*.48;
    const r=73+(i%3)*11;
    rect(x+Math.cos(angle)*r,y+Math.sin(angle)*r*.75,i%4===0?4:2,3,'#fff1b7');
  }
  if(staff){
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(.32);
    ctx.scale(2.2,2.2);
    drawStaffShaft(-43,86);
    ctx.restore();
  }else{
    poly([[x-36,y-25],[x-22,y-39],[x+23,y-39],[x+38,y-25],[x+29,y+43],[x-29,y+43]],'#5c4740');
    poly([[x-34,y-24],[x-20,y-36],[x+20,y-36],[x+34,y-24],[x+26,y+39],[x-26,y+39]],'#b97b47');
    poly([[x-29,y-29],[x-12,y-31],[x,y-18],[x+12,y-31],[x+29,y-29],
      [x+19,y+8],[x,y+20],[x-19,y+8]],'#ecc479');
    poly([[x-13,y-18],[x,y-6],[x+13,y-18],[x+10,y+4],[x,y+12],[x-10,y+4]],'#a65444');
    for(let i=0;i<3;i++)rect(x-24+i,y+20+i*6,48-i*2,3,'#f6d895');
    rect(x-17,y-64,34,18,'#d5a459');
    rect(x-13,y-69,26,8,'#f5d998');
    rect(x-16,y-47,32,4,'#f8db90');
  }
  drawBodhiLabel(staff?'金箍棒攻击 +2':'血量 +30',x,y-114);
  if(nearFourth(fourthLootX,49))drawBodhiLabel('[ E ] 拾取',x,y+103);
}


let nezhaFireBed;
function updateNezhaFireBed(active){
  const burning=active&&(nezhaBurn||nezhaFlames.some(fire=>Math.abs(fire.x-player.x)<500));
  if(burning&&!nezhaFireBed){
    const source=audio.createBufferSource();
    source.buffer=makeNoise();
    source.loop=true;
    const filter=audio.createBiquadFilter();
    filter.type='bandpass';
    filter.frequency.value=950;
    filter.Q.value=.64;
    nezhaFireBed=audio.createGain();
    nezhaFireBed.gain.value=0;
    source.connect(filter).connect(nezhaFireBed).connect(gameAudioOutput());
    source.start();
  }
  if(!nezhaFireBed)return;
  const flutter=.050+Math.sin(t*9.7)*.012+Math.sin(t*17.1)*.008;
  nezhaFireBed.gain.setTargetAtTime(burning?flutter:0,audio.currentTime,.075);
}

const groundThemes={
  stone:{top:'#9da677',middle:'#51654b',bottom:'#273d35',seam:'#334a40',rim:'#c6c78e',detail:'#809172'},
  field:{top:'#c2b07b',middle:'#657050',bottom:'#2a3d35',seam:'#465441',rim:'#e1cb95',detail:'#8f9a67'},
  jade:{top:'#a9cabc',middle:'#41676c',bottom:'#233e4d',seam:'#294e58',rim:'#d1e2ca',detail:'#729b96'},
  ember:{top:'#c08a72',middle:'#65464a',bottom:'#322a3a',seam:'#452e3b',rim:'#e3ab81',detail:'#9b655b'},
  timber:{top:'#d9b586',middle:'#8b684d',bottom:'#4c4037',seam:'#5f4b3b',rim:'#f0c995',detail:'#ad895f'}
};
function drawSurfaceFloor(floor,c,material){
  const {x:worldX,y,w}=floor;
  const x=worldX-c;
  if(x+w<0||x>W)return;
  const theme=groundThemes[material];
  const depth=112;
  rect(x,y,w,depth,lightGradient(0,y,0,y+depth,[[0,theme.top],[.09,theme.middle],[1,theme.bottom]]));
  rect(x,y,w,2,theme.rim);
  rect(x,y+7,w,2,theme.seam);
  const step=material==='timber'?70:46;
  const first=Math.max(0,Math.floor(-x/step)*step);
  const end=Math.min(w,W-x+step);
  for(let i=first;i<end;i+=step){
    const n=Math.floor((worldX+i)/step);
    const span=Math.min(step-4,w-i);
    if(span<9)continue;
    const px=x+i;
    const top=y+13+Math.abs(n*7%12);
    rect(px+2,top,span-2,2,theme.detail);
    rect(px+span-2,top+2,2,12+Math.abs(n%3)*4,theme.seam);
    rect(px+5,top+15,Math.min(16,span-5),2,theme.seam);
    rect(px+5,y+39+Math.abs(n*11%13),Math.min(span-5,25),1,theme.detail);
    rect(px+2,y+65+Math.abs(n*3%20),Math.min(span-2,34),2,theme.seam);
    if(material==='stone'||material==='field'){
      for(let j=0;j<4;j++){
        const dx=4+Math.abs((n*9+j*13)%(span-3));
        rect(px+dx,y+3+j%2,2,2,j%2?theme.detail:theme.rim);
      }
    }else if(material==='timber'){
      rect(px+6,top+8,Math.min(span-7,38),1,theme.seam);
      rect(px+span-8,top+5,2,2,theme.rim);
    }else if(material==='jade'){
      const sheen=.5+.5*Math.sin(t*1.7+n*.57);
      ctx.globalAlpha=.15+sheen*.25;
      rect(px+4,top+5,Math.min(span-4,26),2,theme.rim);
      ctx.globalAlpha=1;
    }else if(n%3===0){
      ctx.globalAlpha=.36+.18*Math.sin(t*2.2+n);
      rect(px+8,top+5,9,1,'#f1a276');
      ctx.globalAlpha=1;
    }
  }
}
function groundParticleMaterial(){
  if(chapter===2)return region==='hall'?'timber':'stone';
  if(chapter===3)return thirdScene==='palace'?'jade':thirdScene==='underworld'?'ember':'stone';
  if(chapter===5)return ['duel','gate','alchemyRoad'].includes(fifthScene)?'cloud':'jade';
  if(chapter===4)return fourthScene==='clouds'||fourthScene==='escape'?'cloud':
    fourthScene==='stable'?'timber':fourthScene==='cave'?'stone':'field';
  return null;
}
function emitGroundParticles(action){
  const surface=groundParticleMaterial();
  if(!surface)return;
  const theme=groundThemes[surface];
  const count=action==='slam'?23:action==='land'?12:action==='jump'?8:4;
  const airy=surface==='cloud'||surface==='jade'||surface==='ember';
  const floor=player.y+player.h;
  for(let i=0;i<count;i++){
    const side=action==='step'?-player.face:i%2?1:-1;
    const spread=action==='slam'?1.8:action==='step'?.63:1;
    const life=(airy?.42:.28)+Math.random()*.35;
    particles.push({
      x:player.x+12+side*(2+i%4*2),y:floor-2-i%2,
      vx:side*(18+Math.random()*65)*spread,vy:-(12+Math.random()*55)*spread,
      life,duration:life,size:1.5+Math.floor(Math.random()*4)*.6,surface,
      color:surface==='cloud'?'#ecf5e5':i%2?theme.rim:theme.detail,
      gravity:airy?surface==='ember'?17:31:195,groundY:airy?undefined:floor,
      rotation:(Math.random()-.5)*5
    });
  }
  if(particles.length>480)particles.splice(0,particles.length-480);
}
function drawGroundParticle(p,x,alpha){
  ctx.globalAlpha=alpha;
  const size=p.size, age=p.duration-p.life;
  if(p.surface==='cloud'){
    const s=size+age*8;
    ctx.globalAlpha=alpha*.66;
    rect(x-s,p.y,s*2.3,s*.7,p.color);
    rect(x-s*.45,p.y-s*.45,s*1.5,s*.55,'#f9f5d9');
  }else if(p.surface==='jade'){
    rect(x,p.y,size+2,1,'#d8f7e7');rect(x,p.y+size+1,size+2,1,'#90cbc8');
    rect(x-1,p.y+1,1,size,'#c3e8db');rect(x+size+2,p.y+1,1,size,'#91c8c4');
  }else if(p.surface==='ember'){
    ctx.globalAlpha=alpha*.33;rect(x-2,p.y-2,size+4,size+4,'#ef895c');
    ctx.globalAlpha=alpha;rect(x,p.y,size,1.5,'#ffbc77');
    rect(x-p.vx*.028,p.y-p.vy*.028,1,1,'#e88361');
  }else{
    const yaw=Math.sin(age*p.rotation+size);
    poly([[x-size,p.y],[x+yaw,p.y-size],[x+size,p.y+1],[x-size*.5,p.y+size*.65]],p.color);
  }
}

function updateStaffWaves(dt){
  if(!staffWaves.length)return;
  const targets=staffTargets();
  for(let i=staffWaves.length-1;i>=0;i--){
    const wave=staffWaves[i];
    const before=wave.x;
    wave.x+=wave.dir*445*dt;
    wave.left-=dt;
    for(const target of targets){
      if(target.hp<=0||wave.hits.has(target)||Math.abs(target.y-wave.y)>38)continue;
      if(target.x<Math.min(before,wave.x)-22||target.x>Math.max(before,wave.x)+22)continue;
      wave.hits.add(target);
      hitEnemy(target,10);
    }
    if(wave.left<=0)staffWaves.splice(i,1);
  }
}
function drawStaffWaves(camera){
  for(const wave of staffWaves){
    const {y,dir}=wave;
    const x=wave.x-camera;
    if(x<-55||x>W+55)continue;
    glow(x,y-10,38,'#ffe19a83');
    poly([[x-dir*52,y],[x-dir*18,y-8],[x+dir*8,y-32],[x+dir*25,y-22],
      [x+dir*31,y-5],[x+dir*19,y+2]],'#c9804b');
    poly([[x-dir*34,y],[x-dir*9,y-9],[x+dir*10,y-26],[x+dir*22,y-19],
      [x+dir*28,y-6],[x+dir*14,y]],'#ffdf8d');
    for(let i=0;i<6;i++){
      const age=(t*3+i*.18)%1;
      rect(x-dir*(10+age*47),y-2-age*(12+i%3*9),3+i%2,2,'#fff0ad');
    }
  }
  if(slamImpact?.giant&&t-slamImpact.at<.46){
    const age=(t-slamImpact.at)/.46;
    const x=slamImpact.x-camera, y=slamImpact.y;
    ctx.save();ctx.globalAlpha=1-age;
    const width=52+age*103;
    poly([[x-width,y],[x-19,y-5],[x,y-27+age*14],[x+23,y-5],[x+width,y]],'#ffe8ac');
    ctx.restore();
  }
}

let screenImpact=null;
function shakeOnImpact(x,strength,duration){
  const distance=Math.abs(x-(cam+W/2));
  const visible=1-Math.max(0,distance-W/2)/220;
  if(visible>0)screenImpact={at:t,strength:strength*visible,duration};
}
function applyImpactShake(){
  if(!screenImpact||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  const age=(t-screenImpact.at)/screenImpact.duration;
  if(age>=1)return;
  const power=screenImpact.strength*(1-age)*(1-age);
  rect(0,0,W,H,'#203932');
  ctx.translate(Math.round(Math.sin(age*39)*power),Math.round(Math.cos(age*33)*power*.73));
}
const combatClones=[];
function cloneRoute(){
  return chapter===3?currentThirdRoute():chapter===4?fourthRoutes[fourthScene]:fifthRoutes[fifthScene];
}
function castCombatClones(){
  if(!hasGiantStaffSkill()||mode!=='play'||paused||playerFrozen()||transformedForm||slamActive||(chapter===4&&fourthLootSequence)||(chapter===5&&!fifthCombat()))return;
  if(combatClones.some(clone=>clone.hp>0)){toast('分身仍在场上。');return;}
  if(energy<3){toast('分身术需要 3 点灵气。');return;}
  const route=cloneRoute();
  const px=player.x+12;
  const floor=route.find(p=>px>=p.x&&px<=p.x+p.w&&p.y>=player.y+player.h-4);
  if(!floor){toast('靠近平台再召唤分身。');return;}
  energy-=3;
  renderEnergy();
  combatClones.length=0;
  for(const [i,offset] of [-32,0,32].entries()){
    const x=Math.max(floor.x+8,Math.min(floor.x+floor.w-8,px+offset));
    combatClones.push({x,y:floor.y,hp:70,vy:0,ground:true,face:player.face,
      landing:null,moving:false,attackAt:t-1,nextAttack:t+i*.14});
    scatter(x,floor.y-16,21,['#a5dcbf','#e4f2c8','#f8e2a1'],80);
  }
  chirp(272,680,.36,0,.15,'triangle');
  toast('分身术 · 三个分身');
  saveCurrentCheckpoint();
}
function updateCombatClones(dt){
  if(!combatClones.length)return;
  const route=cloneRoute();
  const enemies=staffTargets().filter(enemy=>enemy.hp>0);
  for(let i=combatClones.length-1;i>=0;i--){
    const clone=combatClones[i];
    if(clone.hp<=0||clone.y>590){combatClones.splice(i,1);continue;}
    let target=null, closest=Infinity;
    for(const enemy of enemies){
      if(enemy.hp<=0)continue;
      const distance=Math.hypot(enemy.x-clone.x,enemy.y-clone.y);
      if(distance<closest){closest=distance;target=enemy;}
    }
    clone.target=target;
    const tx=target?.x??player.x+12+(i-1)*30;
    const ty=target?.y??player.y+player.h;
    const gap=tx-clone.x;
    if(gap)clone.face=Math.sign(gap);
    const inReach=target&&Math.abs(gap)<=53&&Math.abs(ty-clone.y)<=44;
    if(inReach&&t>=clone.nextAttack){
      clone.attackAt=t;
      clone.nextAttack=t+.8;
      const isBoss=isCombatBoss(target);
      if(!isBoss||!$('heavenBossHud').hidden)hitEnemy(target,10,false,clone);
    }
    let destination=clone.landing??tx;
    if(clone.ground&&!inReach){
      const floor=route.find(p=>clone.x>=p.x&&clone.x<=p.x+p.w&&Math.abs(clone.y-p.y)<2);
      if(floor&&!(tx>=floor.x+3&&tx<=floor.x+floor.w-3)){
        const edge=clone.face>0?floor.x+floor.w:floor.x;
        const other=route.filter(p=>p!==floor&&(clone.face>0?p.x>=edge-1:p.x+p.w<=edge+1))
          .sort((a,b)=>clone.face>0?a.x-b.x:(b.x+b.w)-(a.x+a.w))[0];
        const rim=edge-clone.face*10;
        destination=rim;
        if(other&&Math.abs(rim-clone.x)<6){
          const landing=clone.face>0?other.x+16:other.x+other.w-16;
          if(Math.abs(landing-rim)<=206&&floor.y-other.y<=93){
            clone.ground=false;
            clone.vy=-505;
            clone.landing=destination=landing;
          }
        }
      }
    }
    const dx=destination-clone.x;
    const speed=clone.landing!==null?270:200;
    const travel=inReach&&clone.landing===null?0:Math.sign(dx)*Math.min(Math.abs(dx),speed*dt);
    clone.x+=travel;
    clone.moving=Math.abs(travel)>.02;
    const oldY=clone.y;
    clone.vy+=1170*dt;
    clone.y+=clone.vy*dt;
    clone.ground=false;
    if(clone.vy>=0){
      let landed=Infinity;
      for(const floor of route){
        if(clone.x>=floor.x&&clone.x<=floor.x+floor.w&&oldY<=floor.y+3&&clone.y>=floor.y)landed=Math.min(landed,floor.y);
      }
      if(Number.isFinite(landed)){
        clone.y=landed;
        clone.vy=0;
        clone.ground=true;
        clone.landing=null;
      }
    }
  }
}
function closestEnemyVictim(demon){
  let nearest=null, best=transformedForm?.id==='fly'?Infinity:Math.hypot(player.x+12-demon.x,player.y+34-demon.y);
  for(const clone of combatClones){
    if(clone.hp<=0)continue;
    const distance=Math.hypot(clone.x-demon.x,clone.y-demon.y);
    if(distance<best){nearest=clone;best=distance;}
  }
  return nearest;
}
function damageCombatClone(clone,amount,reduce=true){
  if(clone.hp<=0)return;
  clone.hp=Math.max(0,roundHealth(clone.hp-amount*(reduce ? .95 : 1)));
  scatter(clone.x,clone.y-19,clone.hp?7:25,['#c0e9d5','#f2e5a4'],70);
}
function damageClonesNear(x,radius,floor,amount){
  for(const clone of combatClones)if(Math.abs(clone.x-x)<radius&&clone.y>floor)damageCombatClone(clone,amount);
}
function drawCombatClones(c){
  for(const clone of combatClones){
    if(clone.hp<=0)continue;
    const x=clone.x-c,y=clone.y;
    ctx.save();
    ctx.globalAlpha=.77;
    glow(x,y-15,28,'#b6ecd24a');
    monkey(x,y-31,clone.face,clone.ground&&clone.moving,.84,false,true);
    ctx.translate(x+clone.face*9,y-14);
    ctx.scale(clone.face,1);
    const age=t-clone.attackAt;
    ctx.rotate(age<.28?-.82+age*7:.32);
    drawStaffShaft(-19,37);
    ctx.restore();
    rect(x-13,y-44,26,3,'#314848');
    rect(x-13,y-44,26*clone.hp/70,3,'#a2e2c1');
  }
}

function drawTigerBody(moving){
  const stride=moving?Math.round(Math.sin(t*19)*6):0;
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
  if(moving){
    ctx.globalAlpha=.45;
    rect(-48,-14,9,2,'#f0bc75');rect(-55,-8,12,2,'#e6ab62');
    ctx.globalAlpha=1;
  }
}

const fifthRoutes={
  garden:[{x:0,y:430,w:470},{x:527,y:402,w:227},{x:808,y:430,w:554}],
  banquet:[{x:0,y:430,w:1010}],
  alchemyRoad:[{x:0,y:430,w:248},{x:309,y:404,w:132},{x:505,y:370,w:155},
    {x:726,y:402,w:144},{x:938,y:430,w:326}],
  alchemy:[{x:0,y:430,w:1040}],
  gate:[{x:0,y:430,w:290},{x:345,y:392,w:220},{x:620,y:422,w:212},{x:885,y:430,w:447}],
  duel:[{x:0,y:432,w:1430}],
  furnace:[{x:0,y:430,w:960}]
};
const fifthAreas={garden:'天宫 · 蟠桃园',banquet:'瑶池 · 蟠桃会',alchemyRoad:'天宫 · 兜率宫云阶',alchemy:'兜率宫 · 丹房',gate:'天宫 · 南天门',duel:'南天门外 · 二郎神',furnace:'兜率宫 · 八卦炉'};
const orchardPeaches=[{x:253,y:430},{x:636,y:402},{x:955,y:430}];
const FIFTH_GATE_X=1244, YAOCHI_ENTRY_X=1275, YAOCHI_EXIT_X=918;
const ALCHEMY_ENTRY_X=1152, ALCHEMY_EXIT_X=950;
const goldenElixirs=[488,560,632];
const banquetPosts=[
  {id:'banquet-fire',x:653,kind:'flame',maxHp:35,damage:20},
  {id:'banquet-thunder',x:749,kind:'thunder',maxHp:50,damage:25,armor:.10},
  {id:'banquet-ice',x:849,kind:'ice',maxHp:40,damage:20},
  {id:'banquet-fire-east',x:895,kind:'flame',maxHp:35,damage:20},
  {id:'banquet-thunder-east',x:960,kind:'thunder',maxHp:50,damage:25,armor:.10}
];
const ERLANG_HP=1000, ERLANG_CLONE_REACH=43;
const ERLANG_SLAM_REACH={normal:92,giant:147};
const erlangMelee=['slash','thrust','slam'];
const erlangCombo=['summon',...erlangMelee,'grow','tiger','clones'];
const erlangMusic=[146.83,0,146.83,174.61,196,146.83,220,0,146.83,261.63,246.94,196,174.61,164.81,146.83,0];
let fifthScene='garden', fifthIntro=false, fifthPeaches=new Set(), drankWine=false, eatenElixirs=new Set(), fifthComplete=false;
let banquetGuards=[], frozenUntil=0, orchardEncounter=false, orchardBindingAt=-Infinity;
let erlangBoss=null, erlangRetinue=[], erlangCapture=null, erlangMusicAt=0, erlangMusicBeat=0;

function fifthCombat(){
  return fifthScene==='duel'||(fifthScene==='banquet'&&drankWine);
}
function banquetCleared(){
  return banquetGuards.every(guard=>guard.hp<=0);
}
function playerFrozen(){
  return (chapter===5&&fifthScene==='banquet'&&t<frozenUntil)||
    (chapter===4&&fourthScene==='nezha'&&t<nezhaRibbonUntil);
}
function resetBanquetEffects(){
  frozenUntil=0;
  heavenFireballs=[];
  heavenBolts=[];
  for(const guard of banquetGuards){
    guard.frost=null;
    guard.castAt=0;
    guard.spellReadyAt=t+1.4;
  }
}
function updateBanquetCombat(dt,route){
  const ice=banquetGuards.find(guard=>guard.kind==='ice');
  const x=player.x+12;
  if(ice.hp>0&&!enemyBound(ice)){
    if(ice.frost&&t>=ice.frost.ends){
      const target=ice.frost.x;
      ice.frost=null;
      ice.spellReadyAt=t+4.2;
      scatter(target,418,35,['#c3e7f2','#eff8ff','#79badb'],100);
      chirp(940,260,.36,0,.13,'triangle');
      if(Math.abs(x-target)<42&&player.y+player.h>376&&transformedForm?.id!=='fly'){
        frozenUntil=t+2;
        player.vx=0;
        jumpRequestedUntil=-1;
        slamActive=false;
        toast('冰封 · 2 秒无法行动');
      }
    }else if(!ice.frost&&t>=ice.spellReadyAt&&!ice.strikeAt&&Math.abs(x-ice.x)<270&&
        !playerFrozen()&&transformedForm?.id!=='fly'){
      ice.frost={x,ends:t+.72};
      ice.dir=Math.sign(x-ice.x)||ice.dir;
      chirp(430,780,.3,0,.11,'triangle');
    }
  }else ice.frost=null;
  updateHeavenFireballs(dt,banquetGuards);
  updateFifthGuards(dt,route,banquetGuards.filter(guard=>!guard.frost));
  if(health<=0){resetBanquetEffects();loseLife(route);return;}
  const quest=fifthQuest();
  if($('questTitle').textContent!==quest){
    chapterTwoQuest(quest);
    saveChapterFive();
  }
}
function fifthCameraLimit(){
  const lastFloor=fifthRoutes[fifthScene].at(-1);
  return Math.max(0,lastFloor.x+lastFloor.w-W);
}
function saveChapterFive(){
  return writeGameSave({chapter:5,phase:mode==='capture'?'furnace':fifthScene,checkpoint,energy,
    peaches:[...fifthPeaches],drankWine,elixirs:[...eatenElixirs],fifthComplete,
    banquetDefeated:banquetGuards.filter(guard=>guard.hp<=0).map(guard=>guard.id),
    bossHp:fifthScene==='duel'?erlangBoss?.hp:undefined,
    bossThreshold:fifthScene==='duel'?erlangBoss?.playerReachedThreshold:undefined,...vitalSave()});
}
function resetErlang(hp=ERLANG_HP){
  groundWaves=[];
  erlangRetinue=[];
  erlangCapture=null;
  erlangBoss={x:765,y:432,hp:roundHealth(Math.max(100,Math.min(ERLANG_HP,hp))),maxHp:ERLANG_HP,armor:.20,
    dir:-1,scale:1,giant:false,giantUntil:0,giantTurn:0,playerReachedThreshold:false,turn:0,next:t+.75,move:null,impact:null,walkAmount:0,walkPhase:0,blockAt:-Infinity,weaponAngle:.54,poseLean:0,poseBrace:0};
  erlangMusicAt=t;
  erlangMusicBeat=0;
}
function fifthQuest(){
  switch(fifthScene){
    case 'garden':return fifthPeaches.size<orchardPeaches.length
      ? '靠近桃树按 E 吃蟠桃 · '+fifthPeaches.size+'/'+orchardPeaches.length
      : '前往蟠桃园东门，按 E 去瑶池';
    case 'banquet':
      if(!drankWine)return '走近酒桌，按 E 喝仙酒';
      return banquetCleared()?'走到瑶池出口，按 E 出门':'击退瑶池守卫 · '+banquetGuards.filter(guard=>guard.hp<=0).length+'/'+banquetGuards.length;
    case 'alchemyRoad':return '跳过云阶，到兜率宫门前按 E 进入';
    case 'alchemy':return eatenElixirs.size===goldenElixirs.length
      ? '走到丹房右侧，按 E 离开' : '靠近金丹按 E，逐颗吃下 · '+eatenElixirs.size+'/'+goldenElixirs.length;
    case 'gate':return '越过云阶，到南天门按 E 出天宫';
    case 'duel':return '迎战二郎神 · 注意兵刃和分身的预警';
    default:return '八卦炉';
  }
}
function showFifthRoute(){
  mode='play';
  for(const id of ['touch','hud','pause','energy','stamina','health','spellButton','cloudButton'])$(id).hidden=false;
  $('area').textContent=fifthAreas[fifthScene];
  const fighting=fifthCombat();
  $('counts').textContent=fighting?'如意金箍棒':'';
  $('staffButton').hidden=!fighting;
  $('giantStaffButton').hidden=!fighting||!hasGiantStaffSkill();
  $('cloneButton').hidden=!fighting||!hasGiantStaffSkill();
  $('bindButton').hidden=!progress.skills?.binding;
  $('heavenWarning').hidden=true;
  $('heavenBossHud').hidden=fifthScene!=='duel';
  if(fifthScene==='duel'){
    $('heavenBossMeter').setAttribute?.('aria-label','二郎神生命值');
    renderErlangHealth();
  }
  $('hint').textContent=fighting?'A 挥棒 · D 巨化棍棒 · G 分身术 · H 定身 · 空格跳跃':'← → 移动 · 空格跳跃 · E 互动';
  showHealth();
  renderEnergy();
  renderStamina();
  chapterTwoQuest(fifthQuest());
  $('stage').focus?.({preventScroll:true});
  saveChapterFive();
}
function switchFifthScene(scene){
  fifthIntro=false;
  orchardEncounter=false;
  fifthScene=scene;
  checkpoint=90;
  cam=0;
  keys.clear();
  clearTransformation();
  groundWaves=[];
  particles.length=0;
  damageNumbers.length=0;
  immuneUntil=0;
  placePlayerOnGround(fifthRoutes[scene],checkpoint);
  resetBanquetEffects();
  if(scene==='duel')resetErlang();
  showFifthRoute();
}
function startChapterFive(saved){
  reset();
  clearHeavenCombat();
  chapter=5;
  learned=true;
  hasStaff=true;
  swingAt=-Infinity;
  combo=0;
  restoreVitals(saved,150);
  energy=Math.max(0,Math.min(10,saved?.energy??5));
  fifthScene=Object.hasOwn(fifthRoutes,saved?.phase)?saved.phase:'garden';
  fifthPeaches=new Set(saved?.peaches??[]);
  drankWine=!!saved?.drankWine;
  eatenElixirs=new Set(saved?.elixirs??(saved?.ateElixir?goldenElixirs:[]));
  banquetGuards=banquetPosts.map(post=>({...post,...heavenSword,y:430,min:post.x-36,max:post.x+36,speed:88,
    hp:saved?.banquetDefeated?.includes(post.id)?0:post.maxHp,dir:-1,ground:true,vy:0,landing:null,
    strikeAt:0,readyAt:t+.6,castAt:0,spellReadyAt:t+1.4}));
  resetBanquetEffects();
  fifthComplete=!!saved?.fifthComplete;
  fifthIntro=!saved?.phase;
  orchardEncounter=false;
  orchardBindingAt=-Infinity;
  if(fifthScene!=='garden')unlockBinding();
  resetErlang(saved?.bossHp);
  erlangBoss.playerReachedThreshold=!!saved?.bossThreshold;
  checkpoint=saved?.checkpoint??90;
  placePlayerOnGround(fifthRoutes[fifthScene],checkpoint);
  cam=Math.max(0,Math.min(fifthCameraLimit(),player.x-310));
  $('cover').hidden=true;
  $('pause').hidden=false;
  $('chapterLabel').textContent='CHAPTER 05 / 大闹天宫';
  if(fifthComplete){finishChapterFive();return;}
  if(fifthScene==='furnace'){health=0;startFurnaceStory();return;}
  if(!fifthIntro){showFifthRoute();return;}
  chapterTwoDialogue([
    ['孙悟空 · 花果山','俺老孙已在花果山立了齐天大圣旗。若还要俺回去养马，休想！'],
    ['托塔李天王 · 凌霄宝殿','陛下，孙悟空神通太强。巨灵神、哪吒接连败阵，我们打不过他。'],
    ['太白金星','不如再招他上天，封作齐天大圣。只给他名号，不授实职，也不发俸禄。'],
    ['玉帝','便依卿所奏。再去花果山，请齐天大圣上天。'],
    ['太白金星 · 花果山','大圣，这回诏书写得明白。玉帝封你做齐天大圣，请随我上天。'],
    ['孙悟空','既然名号写的是齐天大圣，老孙便随你走一遭。'],
    ['玉帝 · 凌霄宝殿','大圣既已上天，朕便托你看守蟠桃园。园中仙桃，好生照看。'],
    {q:'太白金星起初建议怎样安置孙悟空？',a:['封齐天大圣，不授实职，也不发俸禄','让他重做弼马温','让他统领天兵'],right:0,why:'太白金星提议用齐天大圣的名号安抚孙悟空。玉帝后来才让他看守蟠桃园。'},
    ['蟠桃园 · 土地','这园里的蟠桃，过些日子要送到王母娘娘的蟠桃大会。'],
    ['孙悟空','蟠桃大会？俺既看着这一园子的桃，倒要先尝尝鲜。']
  ],()=>switchFifthScene('garden'));
}
function startOrchardEncounter(){
  orchardEncounter=true;
  orchardBindingAt=-Infinity;
  // Frame the whole group inside the narrower mobile viewport.
  cam=fifthCameraLimit();
  placePlayerOnGround(fifthRoutes.garden,YAOCHI_ENTRY_X-105);
  player.face=-1;
  chapterTwoDialogue([
    ['七仙女 · 蟠桃园','王母娘娘设蟠桃大会，命我们来摘桃。敢问大圣，这树上的仙桃怎么少了？'],
    ['孙悟空','先别忙着摘桃。蟠桃大会请了哪些仙家？可请俺齐天大圣？'],
    ['七仙女','三清、四御和各路仙家都在请帖上。我们未曾听说请大圣赴宴。'],
    ['孙悟空','好个蟠桃大会！诸位且站一站，待俺到瑶池看个究竟。']
  ],()=>{
    orchardBindingAt=t;
    unlockBinding();
    chirp(330,990,.42,0,.16,'triangle');
    talk('孙悟空 · 定身术','定！七仙女被定在原地。已解锁定身术，按 H 可定住敌人和首领 5 秒。',()=>switchFifthScene('banquet'));
  });
}
function interactChapterFive(){
  const near=(x,radius=54)=>player.ground&&Math.abs(player.x+12-x)<=radius;
  if(fifthScene==='garden'){
    const i=orchardPeaches.findIndex((peach,i)=>!fifthPeaches.has(i)&&near(peach.x));
    if(i>=0){
      const {x,y}=orchardPeaches[i];
      fifthPeaches.add(i);
      healFromPeach();
      energy=Math.min(10,energy+1);
      renderEnergy();
      scatter(x,y-31,24,['#f4b182','#f9e4aa','#e9989f'],90);
      chapterTwoQuest(fifthQuest());
      saveChapterFive();
    }else if(near(YAOCHI_ENTRY_X)){
      if(fifthPeaches.size<orchardPeaches.length){toast('还有桃树没去看。');return;}
      startOrchardEncounter();
    }
  }else if(fifthScene==='banquet'){
    if(near(480)&&!drankWine){
      drankWine=true;
      saveChapterFive();
      chapterTwoDialogue([
        ['瑶池 · 酒香四溢','宴席已经排好，宾客还未入座。孙悟空揭开酒坛，连饮数盏。'],
        ['孙悟空','好酒！怎么脚下的云也打起旋来了？'],
        ['瑶池守卫','有人偷喝了仙酒！守住出口，别让他跑了！']
      ],showFifthRoute);
    }else if(near(YAOCHI_EXIT_X)&&drankWine){
      if(!banquetCleared()){toast('先击退瑶池守卫。');return;}
      switchFifthScene('alchemyRoad');
    }
  }else if(fifthScene==='alchemyRoad'&&near(ALCHEMY_ENTRY_X)){
    switchFifthScene('alchemy');
  }else if(fifthScene==='alchemy'){
    const elixir=goldenElixirs.find(x=>!eatenElixirs.has(x)&&near(x,33));
    if(elixir!==undefined){
      eatenElixirs.add(elixir);
      const done=eatenElixirs.size===goldenElixirs.length;
      health=done?maxHealth:Math.min(maxHealth,roundHealth(health+20));
      energy=done?10:Math.min(10,energy+1);
      refreshHealth();
      renderEnergy();
      scatter(elixir,374,32,['#fff2a5','#df9d55','#f9daa4'],105);
      chirp(390,780,.24,0,.11,'triangle');
      toast('吃下金丹 · '+eatenElixirs.size+'/'+goldenElixirs.length);
      chapterTwoQuest(fifthQuest());
      saveChapterFive();
      if(done)chapterTwoDialogue([
        ['孙悟空','三颗金丹都吃下了，眼前也清楚了。趁南天门还没封，得赶快下界！']
      ],showFifthRoute);
    }else if(near(ALCHEMY_EXIT_X)&&eatenElixirs.size===goldenElixirs.length)switchFifthScene('gate');
  }else if(fifthScene==='gate'&&near(FIFTH_GATE_X)){
    chapterTwoDialogue([
      ['南天门 · 天兵','齐天大圣盗了蟠桃、仙酒和金丹，已经逃出南天门！'],
      ['二郎神','孙悟空，我奉玉帝之命拿你。可敢同我一战？'],
      ['孙悟空','来得正好，且看俺老孙的金箍棒！']
    ],()=>switchFifthScene('duel'));
  }
}
function updateChapterFive(dt){
  if(mode==='capture'){updateErlangCapture(dt);return;}
  if(mode!=='play')return;
  const route=fifthRoutes[fifthScene];
  if(!playerFrozen()&&!updateTransformation(dt,route))moveStaffPlayer(route,dt);
  if(player.y>590){fallAndRespawn(route);return;}
  if(fifthScene==='banquet'&&drankWine){
    updateBanquetCombat(dt,route);
    if(mode!=='play')return;
  }
  if(fifthScene==='duel'){
    updateGroundWaves(dt);
    updateFifthGuards(dt,route,erlangRetinue);
    updateErlangBoss(dt);
    if(mode!=='play')return;
  }
  if(['garden','alchemyRoad','gate'].includes(fifthScene)&&player.ground){
    const floor=route.find(p=>player.x>=p.x+18&&player.x+player.w<=p.x+p.w-18);
    if(floor&&floor.x+18>checkpoint){
      checkpoint=floor.x+18;
      saveChapterFive();
    }
  }
  cam+=(Math.max(0,Math.min(fifthCameraLimit(),player.x-310))-cam)*Math.min(1,dt*7);
}
function renderErlangHealth(){
  $('heavenBossName').textContent='二郎显圣真君';
  $('heavenBossValue').textContent=healthText(erlangBoss.hp)+' / '+ERLANG_HP;
  $('heavenBossMeter').max=ERLANG_HP;
  $('heavenBossMeter').value=erlangBoss.hp;
}
function erlangStep(x,dt,speed){
  const boss=erlangBoss;
  const delta=x-boss.x;
  if(delta)boss.dir=Math.sign(delta);
  const step=Math.min(Math.abs(delta),speed*dt);
  boss.x+=step*Math.sign(delta);
  boss.walkAmount=step>0?1:0;
  boss.walkPhase+=step*.15;
}
function beginErlangMove(kind,px){
  const boss=erlangBoss;
  const durations={slash:boss.giant?1.05:.47,thrust:boss.giant?1.12:.57,
    slam:boss.giant?1.6:1.14,grow:.92,shrink:.68,tiger:.78,clones:2,summon:1.2};
  const dir=Math.sign(px-boss.x)||boss.dir;
  const reach=boss.giant?140:77;
  const target=kind==='thrust'
    ? Math.max(30,Math.min(1400,boss.x+dir*(boss.giant?190:152)))
    : Math.max(30,Math.min(1400,kind==='slam'?px:boss.x+dir*(kind==='slash'?reach*.55:0)));
  boss.dir=dir;
  boss.walkAmount=0;
  $('heavenWarning').hidden=true;
  boss.move={kind,at:t,ends:t+durations[kind],from:boss.x,fromAngle:boss.weaponAngle,target,dir,aim:px};
  if(kind==='thrust')boss.move.tip=target+dir*(boss.giant?90:47);
  const pitch=kind==='clones'?290:kind==='tiger'?87:boss.giant?110:175;
  chirp(pitch,pitch*1.8,.33,0,.14,'triangle');
  if(kind==='grow'||kind==='tiger')scatter(boss.x,404,35,['#e9d0a1','#829fba','#ffd99a'],110);
}
function showErlangWarning(text){
  const label=$('heavenWarning');
  if(label.textContent!==text)label.textContent=text;
  label.hidden=false;
}
function erlangHitArea(x,radius,floor,amount){
  if(Math.abs(player.x+12-x)<=radius&&player.y+player.h>floor)heavenPlayerHit(amount);
  damageClonesNear(x,radius,floor,amount);
}
function erlangGroundImpact(x,radius,kind){
  erlangBoss.impact={x,radius,kind,at:t};
  shakeOnImpact(x,erlangBoss.giant?13:8,.32);
  scatter(x,427,erlangBoss.giant?100:64,['#fff5c1','#dba367','#9cb9cf'],185);
  playBossGroundImpact(erlangBoss.giant?'giant-axe':'heaven');
}
function updateErlangBoss(dt){
  const boss=erlangBoss;
  renderErlangHealth();
  if(health<=0||boss.playerReachedThreshold){beginErlangCapture(health>0);return;}
  if(enemyBound(boss))return;
  const px=player.x+12;
  const smooth=Math.min(1,dt*12);
  if(!boss.move){
    boss.weaponAngle+=(.54-boss.weaponAngle)*smooth;
    boss.poseLean*=1-smooth;
    boss.poseBrace*=1-smooth;
  }
  if(boss.giant&&t>=boss.giantUntil){
    boss.giant=false;
    boss.y=432;
    beginErlangMove('shrink',px);
  }
  if(!boss.move){
    let kind=boss.giant?erlangMelee[boss.giantTurn%erlangMelee.length]:erlangCombo[boss.turn%erlangCombo.length];
    if(kind==='summon'&&erlangRetinue.some(guard=>guard.hp>0))kind='slash';
    const range=kind==='slam'?280:boss.giant?190:123;
    if(['slash','thrust','slam'].includes(kind)&&Math.abs(px-boss.x)>range){
      erlangStep(px,dt,boss.giant?125:217);
    }else{
      boss.walkAmount=0;
      if(t>=boss.next){
        if(boss.giant)boss.giantTurn++;
        else boss.turn++;
        beginErlangMove(kind,px);
      }
    }
    return;
  }
  const move=boss.move;
  const {kind,target,from,dir,aim}=move;
  const age=Math.min(1,(t-move.at)/(move.ends-move.at));
  const left=Math.max(0,Math.ceil((move.ends-t-1e-6)*10)/10);
  animateErlangStrike(boss,move,age);
  if(kind==='grow'||kind==='shrink'){
    boss.scale=1+3.2*heavenEase(kind==='grow'?age:1-age);
  }else if(kind==='slam'){
    boss.x=from+(target-from)*heavenEase(age/.73);
    boss.y=432-(boss.giant?178:110)*(age<.28?heavenEase(age/.28):age<.73?1:1-heavenEase((age-.73)/.27));
    showErlangWarning('⚠ 跳斩下砸 · '+left.toFixed(1)+' 秒');
  }else if(kind==='thrust'){
    boss.x=from+(target-from)*heavenEase((age-.63)/.37);
  }else if(kind==='clones'){
    showErlangWarning('⚠ 三个分身已锁定 · '+left.toFixed(1)+' 秒');
  }else if(kind==='summon'){
    showErlangWarning('⚠ 二郎神召唤天兵 · '+left.toFixed(1)+' 秒');
  }else if(kind==='tiger'){
    showErlangWarning(move.rushing?'⚠ 猛虎扑咬':'⚠ 七十二变 · 猛虎');
    if(t>=move.ends){
      if(!move.rushing){
        move.rushing=true;
        move.stop=t+.68;
        move.hit=false;
        move.cloneHits=new Set();
        noiseHit(.40,.28,1750,95);
        chirp(143,61,.36,0,.22,'sawtooth');
      }
      const before=boss.x;
      boss.x=Math.max(27,Math.min(1403,boss.x+dir*610*dt));
      const swept=x=>x>=Math.min(before,boss.x)-49&&x<=Math.max(before,boss.x)+49;
      if(!move.hit&&swept(px)&&player.y+player.h>361){
        move.hit=heavenPlayerHit(55);
      }
      for(const clone of combatClones){
        if(clone.y>361&&swept(clone.x)&&!move.cloneHits.has(clone)){
          move.cloneHits.add(clone);
          damageCombatClone(clone,55);
        }
      }
      if(health<=0){beginErlangCapture(false);return;}
      if(t<move.stop&&boss.x>27&&boss.x<1403)return;
    }
  }
  if(t<move.ends)return;
  const damage=boss.giant?105:25;
  if(kind==='grow'||kind==='shrink'){
    boss.giant=kind==='grow';
    boss.scale=boss.giant?4.2:1;
    if(boss.giant){
      boss.giantUntil=t+10;
      boss.giantTurn=0;
      erlangGroundImpact(boss.x,67,'grow');
    }
  }else if(kind==='slash'){
    const radius=boss.giant?132:71;
    erlangHitArea(target,radius,boss.giant?311:371,damage);
    if(boss.giant)erlangGroundImpact(target,radius,'slash');
    else{boss.impact={x:target,radius,kind,at:t};noiseHit(.19,.20,3700,280);}
  }else if(kind==='thrust'){
    const tip=move.tip;
    erlangHitArea((from+tip)/2,Math.abs(tip-from)/2+22,boss.giant?346:373,damage);
    boss.impact={x:tip,radius:52,kind,at:t};
    noiseHit(.21,.23,4900,290);
  }else if(kind==='slam'){
    boss.y=432;
    const radius=boss.giant?ERLANG_SLAM_REACH.giant:ERLANG_SLAM_REACH.normal;
    erlangHitArea(target,radius,boss.giant?313:367,damage);
    erlangGroundImpact(target,radius,'slam');
    emitGroundWaves(target,432,35,32);
  }else if(kind==='clones'){
    for(const x of erlangCloneColumns(aim)){
      erlangHitArea(x,ERLANG_CLONE_REACH,322,30);
      scatter(x,419,31,['#c9e8f5','#fcf1b7','#809fc7'],130);
    }
    boss.impact={x:erlangCloneColumns(aim)[1],radius:112+ERLANG_CLONE_REACH,kind,at:t};
    noiseHit(.25,.26,4300,210);
  }
  if(kind==='summon')summonErlangRetinue();
  boss.move=null;
  boss.next=t+(boss.giant?1.32:.63);
  $('heavenWarning').hidden=true;
  if(health<=0)beginErlangCapture(false);
}
function erlangCloneColumns(x){
  const center=Math.max(145,Math.min(1285,x));
  return [center-112,center,center+112];
}
function beginErlangCapture(forced){
  clearTransformation();
  slamActive=false;
  combatClones.length=0;
  staffWaves.length=0;
  groundWaves=[];
  keys.clear();
  for(const id of ['touch','quest','heavenBossHud','heavenWarning'])$(id).hidden=true;
  const boss=erlangBoss;
  boss.move=null;
  boss.scale=1;
  boss.y=432;
  const center=player.x+12;
  const guards=[[-1,155,-15],[1,135,14],[1,222,31]].map(([side,distance,offset])=>({
    from:Math.max(0,Math.min(1420,center+side*distance)),offset
  }));
  erlangCapture={at:t,x:boss.x,y:boss.y,forced,guards,restrained:false,playerY:player.y};
  mode='capture';
  if(forced)showErlangWarning('二郎神 · 化虎擒拿');
}
function updateErlangCapture(){
  const {at,x,y,forced}=erlangCapture;
  const age=t-at;
  if(forced){
    const progress=heavenEase((age-.17)/.55);
    erlangBoss.dir=Math.sign(player.x+12-x)||1;
    erlangBoss.x=x+(player.x+12-x)*progress;
    erlangBoss.y=y+(player.y+player.h-y)*progress;
  }
  if(age<.78)return;
  if(health>0){
    health=0;
    refreshHealth();
    noiseHit(.38,.34,1700,95);
    shakeOnImpact(player.x+12,8,.30);
    scatter(player.x+12,player.y+12,40,['#f6cc8e','#d78664'],110);
  }
  const settle=heavenEase((age-.78)/.45);
  player.y=erlangCapture.playerY+(432-player.h-erlangCapture.playerY)*settle;
  if(age>=1.80&&!erlangCapture.restrained){
    erlangCapture.restrained=true;
    showErlangWarning('天兵合围 · 悟空被擒');
    noiseHit(.20,.14,1850,350);
    saveChapterFive();
  }
  if(age>=2.60)startFurnaceStory();
}
function startFurnaceStory(){
  fifthScene='furnace';
  cam=0;
  checkpoint=90;
  erlangCapture=null;
  placePlayerOnGround(fifthRoutes.furnace,560);
  for(const id of ['heavenWarning','heavenBossHud','health','stamina','energy','touch','quest','hud'])$(id).hidden=true;
  saveChapterFive();
  chapterTwoDialogue([
    ['南天门外 · 二郎神','已拿下孙悟空。先收了他的金箍棒，再将他押上天庭复命。'],
    ['南天门 · 押送','天兵给悟空缚上绳索，穿过南天门。一路云廊，守卫换了三班。'],
    ['孙悟空 · 云廊','俺老孙还醒着呢。你们这般急着赶路，是怕我再打出去么？'],
    ['凌霄宝殿 · 玉帝','将他押到兜率宫，交给太上老君。'],
    ['兜率宫 · 八卦炉','天兵将悟空押入炉中。铜门落锁，炉缝渐渐亮起。'],
    ['玉帝 · 兜率宫','老君，悟空已关进炉里。接下来如何处置？'],
    ['太上老君 · 兜率宫','他吞了金丹，我便用八卦炉炼化丹力。请陛下命人守住炉门，静候炉火。'],
    ['玉帝 · 兜率宫','准。兜率宫由你看守，炉中若有异动，即刻来报。']
  ],finishChapterFive);
}
function finishChapterFive(){
  fifthComplete=true;
  mode='end';
  for(const id of ['pause','touch','hud','quest','health','energy','stamina','dialog'])$(id).hidden=true;
  $('ending').hidden=false;
  $('ending').innerHTML='<span class="eyebrow">CHAPTER COMPLETE</span><h2>身 入 八 卦 炉</h2><div class="cn-title">第五关完成 · 大闹天宫</div><p>孙悟空被押入八卦炉。炉火已起，故事未完。</p><button class="primary" id="replayFifth">再游第五关 ↻</button>';
  $('replayFifth').onclick=()=>startChapterFive({intro:true,maxHealth,health:maxHealth,armorBonus:goldArmorBonus()});
  $('status').textContent='第五关完成 · 身入八卦炉';
  saveChapterFive();
  tone(392,.4);
}
function updateErlangMusic(){
  if(t<erlangMusicAt)return;
  const beat=erlangMusicBeat++%erlangMusic.length;
  erlangMusicAt=t+.19;
  const note=erlangMusic[beat];
  if(beat%4===0||beat===11){
    chirp(86,34,.32,0,.21);
    noiseHit(.16,.14,950,72);
  }
  if(beat%4===2)noiseHit(.08,.12,5100,700);
  if(note){
    chirp(note,note*.997,.17,0,.13,'sawtooth');
    chirp(note*2,note*2,.17,.015,.11,'triangle');
  }
}
function drawChapterFive(){
  if(fifthIntro){
    if([1,2,3,6,7].includes(secondDialogueLine))drawHeavenAudience();
    else if(secondDialogueLine<8){drawFourthCave(0);drawTaibai(295,432);drawPlayerMonkey(135,398,1,false,1,false,true);}
    else drawFifthLandscape('garden',0);
    return;
  }
  if(fifthScene==='furnace'&&mode==='talk'){drawErlangEscort();return;}
  drawFifthLandscape(fifthScene,cam);
  if(orchardEncounter)drawOrchardFairies(cam);
  if(fifthScene==='banquet'&&drankWine)drawBanquetCombat(cam);
  if(fifthScene==='duel'){
    drawGroundWaves(cam);
    for(const guard of erlangRetinue)if(guard.hp>0)drawFifthGuard(guard,cam);
    drawErlangBoss(cam);
  }
  if(transformedForm)drawTransformation(cam);
  else if(fifthScene!=='furnace'||(mode==='talk'&&secondDialogueLine===0)){
    if(mode==='capture'&&health===0){
      ctx.save();
      ctx.translate(player.x+12-cam,player.y+30);
      ctx.rotate(-Math.PI/2);
      monkey(0,-16,player.face,false,1,false,true);
      ctx.restore();
    }else if(mode==='capture'||t>=immuneUntil||Math.floor(t*22)%2===0){
      drawPlayerMonkey(player.x+12-cam,player.y+1,player.face,player.ground&&!!player.vx,1,false,true);
    }
    if(mode==='play'&&fifthCombat())drawStaff(cam);
  }
  if(mode==='capture')drawCaptureGuards(cam);
  if(playerFrozen())drawFrozenWukong(cam);
  drawParticles(cam);
}
function drawCaptureGuards(c){
  const age=t-erlangCapture.at;
  if(age<.58)return;
  const center=player.x+12;
  const y=player.y+player.h;
  for(const [i,guard] of erlangCapture.guards.entries()){
    const arrival=heavenEase((age-.58-i*.09)/.85);
    const target=center+guard.offset;
    const x=guard.from+(target-guard.from)*arrival;
    const face=Math.sign(center-x)||1;
    const holding=erlangCapture.restrained;
    drawHeavenOfficer(x-c,432,i===0?'thunder':'flame',face,holding,1,
      holding?1.42:.21,{walkAmount:holding?0:1-arrival*.6,walkPhase:age*17+i*2});
    if(holding){
      const start=x-c+face*6, end=center-c+guard.offset*.35;
      poly([[start,414],[start,420],[end,y-7],[end,y-12]],'#769299');
      rect(end-2,y-13,5,5,'#d6b195');
    }
  }
}
function drawBanquetCombat(c){
  drawHeavenHazards(c);
  for(const guard of banquetGuards){
    if(guard.hp<=0)continue;
    const x=guard.x-c;
    const color={ice:'#baeaff',thunder:'#d6d9ff',flame:'#ffb079'}[guard.kind];
    const frost=guard.frost;
    if(frost){
      const target=frost.x-c;
      rect(target-42,427,84,4,'#b1e6f7b8');
      glow(target,416,51,'#a8eaff77');
      for(let i=0;i<5;i++)rect(target-34+i*16,415+Math.sin(t*18+i)*5,3,4,'#e9fbff');
    }
    if(frost||guard.castAt)glow(x,guard.y-32,38,guard.kind==='ice'?'#96ddff99':'#ffc27677');
    drawFifthGuard(guard,c,color);
  }
}
function drawFrozenWukong(c){
  const x=player.x+12-c,y=player.y+player.h;
  glow(x,y-20,44,'#98e6ffa4');
  poly([[x-19,y],[x-23,y-27],[x-11,y-45],[x+7,y-48],[x+23,y-29],[x+18,y-1]],'#7ec8ec9e');
  poly([[x-19,y],[x-14,y-30],[x-11,y-45],[x-2,y-36],[x-6,y-8]],'#d7f8ffaf');
  poly([[x+7,y-48],[x+23,y-29],[x+18,y-1],[x+10,y-22]],'#b7edffb9');
  poly([[x-2,y-36],[x+9,y-22],[x+3,y-12],[x+9,y-3],[x+11,y-5],[x+7,y-13],[x+12,y-24]],'#e5fbffe0');
  drawBodhiLabel('冰封 '+((frozenUntil-t).toFixed(1))+' 秒',x,y-72);
}
function drawFifthLandscape(scene,c){
  if(scene==='alchemyRoad'){
    drawCloudRoadBackground(c,fifthRoutes.alchemyRoad);
    drawFifthDoor(65-c,430,'瑶池外',true);
    drawBodhiExterior(ALCHEMY_ENTRY_X-c,430,'兜率宫');
    if(mode==='play')drawBodhiLabel('[ E ] 进入兜率宫',ALCHEMY_ENTRY_X-c,234);
    return;
  }
  if(scene==='gate'){
    drawCloudRoadBackground(c,fifthRoutes.gate);
    drawSouthHeavenGate(FIFTH_GATE_X-c,430);
    if(mode==='play')drawBodhiLabel('[ E ] 出南天门',FIFTH_GATE_X-c,245);
    return;
  }
  const indoor=['alchemy','furnace'].includes(scene);
  const duel=scene==='duel';
  const palette=indoor?['#201c35','#504453','#b67c60']:duel?['#1d304b','#4e6a82','#d6ac84']:['#426980','#98bab7','#f0d7ab'];
  rect(0,0,W,H,lightGradient(0,0,0,H,[[0,palette[0]],[.55,palette[1]],[1,palette[2]]]));
  if(indoor){
    for(let i=0;i<6;i++){
      const x=i*220-c*.5;
      rect(x,108,21,331,'#3c2e3e');rect(x+4,108,7,331,'#6d4d4d');
      rect(x-7,106,36,7,'#bd8a65');rect(x-7,416,36,16,'#826262');
      drawBodhiLantern(x+82,168);
      for(let j=0;j<3;j++)rect(x+30,217+j*50,170,4,'#bd92744d');
    }
    rect(0,82,W,21,'#352a3c');
    rect(0,101,W,4,'#a77e61');
    glow(530-c*.7,312,238,scene==='furnace'?'#ff794e4c':'#ffdd9a44');
  }else{
    glow(705-c*.19,135,235,duel?'#fbc4905d':'#fff4bc79');
    for(let i=0;i<9;i++){
      const x=i*143-c*.27-95;
      const y=226+(i*53)%108;
      mountain(x,y,218,270,i%2?'#778b925e':'#cad1ba68');
      for(let j=0;j<3;j++)rect(x+19+j*17,y+112+j*10,118+j*19,4,'#f4e7c554');
    }
    for(let i=0;i<25;i++){
      const x=(i*127-c*.46-t*9)%1250;
      rect(x,382+i%5*22,76+(i%4)*28,3,i%3===0?'#fef1d078':'#dddfcb58');
    }
  }
  for(const floor of fifthRoutes[scene])drawSurfaceFloor(floor,c,scene==='furnace'?'ember':'jade');
  if(scene==='garden'){
    for(const [i,fruit] of orchardPeaches.entries())drawOrchardTree(fruit.x-c,fruit.y,!fifthPeaches.has(i),i);
    drawBodhiExterior(YAOCHI_ENTRY_X-c,430,'瑶池');
    for(const x of [128,410,1116]){
      drawBodhiLantern(x-c,319);
      rect(x-c-2,326,4,104,'#826f66');
      for(let i=0;i<4;i++)rect(x-c-21+i*12,426-i%2*4,4,3,'#d998a9');
    }
    if(mode==='play')drawBodhiLabel(fifthPeaches.size===orchardPeaches.length?'[ E ] 进入瑶池':'摘完蟠桃后进入瑶池',YAOCHI_ENTRY_X-c,230);
  }else if(scene==='banquet'){
    for(const lanternX of [116,357,621,874]){
      const x=lanternX-c;
      rect(x-35,154,9,276,'#586a75');
      rect(x-33,162,2,258,'#a6aa9d');
      rect(x-40,422,19,8,'#40555f');
      rect(x-38,152,52,7,'#785e58');
      rect(x-38,152,52,2,'#d7b77e');
      poly([[x-32,170],[x-14,159],[x-20,159],[x-32,164]],'#b18f73');
      rect(x-1,158,2,29,'#5e4746');
      drawBodhiLantern(x,187);
    }
    for(const x of [190,480,752]){
      rect(x-c-82,370,164,38,'#66434d');
      rect(x-c-85,369,170,7,'#e9ba82');
      rect(x-c-75,407,12,23,'#493648');rect(x-c+63,407,12,23,'#493648');
      rect(x-c-64,382,128,2,'#b77965');
      for(const dx of [-48,36,55]){rect(x-c+dx,361,9,9,'#abd2c1');rect(x-c+dx+2,361,6,2,'#f9e2aa');}
      poly([[x-c-21,364],[x-c+22,364],[x-c+15,369],[x-c-14,369]],'#d7c49d');
      for(const dx of [-12,-2,8]){rect(x-c+dx,359,7,5,'#ebad99');rect(x-c+dx+2,357,3,2,'#dc9283');}
    }
    if(!drankWine){
      poly([[466-c,338],[494-c,338],[492-c,344],[499-c,350],[496-c,368],[464-c,368],[461-c,350],[468-c,344]],'#753d57');
      rect(466-c,350,28,3,'#e6b37f');rect(470-c,335,20,4,'#d69b72');
      drawBodhiLabel('[ E ] 喝仙酒',480-c,313);
    }
    drawFifthDoor(YAOCHI_EXIT_X-c,430,'瑶池出口',drankWine&&banquetCleared());
    if(drankWine)drawBodhiLabel(banquetCleared()?'[ E ] 出瑶池':'守卫封锁出口',YAOCHI_EXIT_X-c,295);
  }else if(scene==='alchemy'){
    const x=560-c;
    rect(x-132,289,264,141,'#443545');
    rect(x-125,296,250,131,'#72504c');
    rect(x-136,292,272,9,'#cca06f');
    rect(x-136,382,272,9,'#d2a06a');
    for(const dx of [-120,120]){
      rect(x+dx-4,302,8,123,'#b68461');
      rect(x+dx-8,418,16,11,'#493844');
    }
    for(const elixir of goldenElixirs){
      const xx=elixir-c;
      const eaten=eatenElixirs.has(elixir);
      poly([[xx-19,372],[xx+19,372],[xx+13,381],[xx-13,381]],'#b8c9af');
      rect(xx-15,373,30,2,'#e3e5b9');
      if(eaten)continue;
      const yy=363+Math.sin(t*3+elixir)*2;
      glow(xx,yy,29,'#f9c56675');
      poly([[xx-7,yy-3],[xx-4,yy-7],[xx+4,yy-7],[xx+7,yy-3],[xx+7,yy+3],[xx+4,yy+6],[xx-4,yy+6],[xx-7,yy+3]],'#cd813e');
      rect(xx-4,yy-5,8,8,'#ffc564');rect(xx-3,yy-4,3,2,'#fff2b3');
      if(nearFourth(elixir,33))drawBodhiLabel('[ E ] 吃一颗金丹',xx,318);
    }
    const open=eatenElixirs.size===goldenElixirs.length;
    drawFifthDoor(ALCHEMY_EXIT_X-c,430,'兜率宫出口',open);
    if(open)drawBodhiLabel('[ E ] 出兜率宫',ALCHEMY_EXIT_X-c,295);
  }  else if(duel){
    for(const x of [114,1315]){
      rect(x-c-5,255,10,177,'#615761');
      poly([[x-c+5,260],[x-c+81,260],[x-c+69,285],[x-c+78,302],[x-c+5,302]],'#a75254');
      rect(x-c+5,262,69,3,'#e3a473');
      rect(x-c+22,271,26,2,'#dd9980');
    }
  }else if(scene==='furnace')drawFurnace();
}
function drawOrchardTree(x,y,hasFruit,index){
  contactShadow(x,y,97,true);
  poly([[x-22,y],[x-11,y-21],[x-7,y-88],[x-29,y-119],[x-18,y-123],[x+5,y-96],
    [x+20,y-129],[x+31,y-126],[x+12,y-76],[x+13,y-19],[x+27,y]],'#604c50');
  poly([[x-13,y],[x-4,y-25],[x+1,y-87],[x+13,y-105],[x+5,y-70],[x+8,y-16],[x+17,y]],'#a07766');
  for(const [dx,dy,w] of [[-64,-126,68],[-37,-158,81],[12,-145,65],[47,-116,53],[-47,-104,52]]){
    const xx=x+dx,yy=y+dy;
    poly([[xx-w/2,yy],[xx-w*.35,yy-21],[xx-w*.15,yy-29],[xx+w*.22,yy-29],
      [xx+w*.42,yy-18],[xx+w/2,yy+4],[xx+w*.22,yy+13],[xx-w*.26,yy+10]],'#936c86');
    rect(xx-w*.32,yy-22,w*.66,15,'#c995a8');
    rect(xx-w*.24,yy-25,w*.41,4,'#e1aeae');
    for(let j=0;j<5;j++)rect(xx-w*.33+(j*17)%w,yy-17+(j*13)%21,8,3,j%2?'#eec1b2':'#b17c96');
  }
  for(let j=0;j<8;j++){
    const px=x-53+(j*29)%104+Math.sin(t+j)*10;
    const py=y-122+(t*12+j*33+index*19)%116;
    rect(px,py,4,2,'#f3bcba');
  }
  if(hasFruit){
    peach(x-21,y-110);peach(x+41,y-96);
    glow(x,y-49,35,'#ffc89964');
    peach(x,y-47+Math.sin(t*3+index)*3);
    if(Math.abs(player.x+12-(x+cam))<65)drawBodhiLabel('[ E ] 吃蟠桃',x,y-202);
  }
}
function drawFurnace(){
  const x=548,y=413;
  glow(x,y-96,177,'#ff874b84');
  contactShadow(x,y+17,188);
  rect(x-64,y-13,128,13,'#53363e');
  for(const dx of [-52,38]){rect(x+dx,y-8,14,24,'#543b42');rect(x+dx-3,y+10,20,7,'#bc7c56');}
  poly([[x-77,y-27],[x-86,y-61],[x-66,y-105],[x-49,y-114],[x-45,y-135],[x+45,y-135],
    [x+49,y-114],[x+66,y-105],[x+86,y-61],[x+77,y-27],[x+54,y-9],[x-54,y-9]],'#64414b');
  poly([[x-72,y-31],[x-79,y-61],[x-59,y-98],[x+59,y-98],[x+79,y-61],[x+72,y-31],
    [x+46,y-17],[x-46,y-17]],'#af7457');
  rect(x-58,y-99,116,6,'#ebaa69');
  rect(x-56,y-129,112,10,'#d49b69');rect(x-34,y-144,68,11,'#84544e');
  for(const dx of [-63,57]){rect(x+dx,y-85,7,47,'#e3a367');rect(x+dx-2,y-53,11,4,'#fed08a');}
  rect(x-30,y-82,60,59,'#4a333e');
  rect(x-27,y-79,54,52,'#734b45');
  rect(x-2,y-76,4,46,'#ffc071');
  rect(x-20,y-54,10,4,'#ecb078');rect(x+10,y-54,10,4,'#ecb078');
  for(let i=0;i<9;i++){
    const h=(t*28+i*19)%128;
    const fx=x+(i*23)%74-36+Math.sin(t*3+i)*9;
    rect(fx,y-128-h,2+i%3,3,h>90?'#f4c29a6d':'#ffba6a');
  }
  drawBodhiLabel('八卦炉',x,y-175);
}

function drawErlangBoss(c){
  const boss=erlangBoss;
  if(!boss)return;
  const x=boss.x-c;
  const move=boss.move;
  const age=move?Math.min(1,(t-move.at)/(move.ends-move.at)):0;
  if(mode==='play'&&move){
    if(move.kind==='clones'){
      drawErlangSkyClones(move,c,age);
    }else if(move.kind==='slam'){
      const radius=boss.giant?ERLANG_SLAM_REACH.giant:ERLANG_SLAM_REACH.normal;
      const tx=move.target-c;
      rect(tx-radius,428,radius*2,4,'#ba645e');
      rect(tx-radius,426,radius*2*age,2,'#ffe2a4');
    }
  }
  contactShadow(x,432,38*boss.scale,true);
  if((move?.kind==='tiger'&&(move.rushing||age>.36))||erlangCapture?.forced){
    const running=move?.rushing||mode==='capture';
    drawPixelatedBoss(()=>{
      ctx.save();
      ctx.translate(x,boss.y);
      ctx.scale(boss.dir*1.48,1.48);
      drawTigerBody(running);
      ctx.restore();
    });
  }else{
    if(boss.scale>1)glow(x,boss.y-31*boss.scale,63*boss.scale,'#d5cbbd3e');
    drawPixelatedBoss(()=>drawErlangBody(x,boss.y,boss.dir,boss.scale*1.08,boss.weaponAngle,boss));
  }
  const sinceBlock=t-boss.blockAt;
  if(sinceBlock>=0&&sinceBlock<.42){
    const yy=boss.y-31*boss.scale;
    const radius=35*boss.scale+sinceBlock*40;
    ctx.save();
    ctx.globalAlpha=1-sinceBlock/.42;
    glow(x,yy,radius,'#ffe7ab86');
    poly([[x-radius,yy-6],[x-radius*.56,yy-radius*.74],[x,yy-radius],[x+radius*.56,yy-radius*.74],
      [x+radius,yy-6],[x+radius*.58,yy-radius*.68],[x,yy-radius+4],[x-radius*.58,yy-radius*.68]],'#fff0b2');
    drawBodhiLabel('格挡 · 反伤',x,yy-radius-16);
    ctx.restore();
  }
  const impact=boss.impact;
  if(impact&&t-impact.at<.35){
    const progress=(t-impact.at)/.35;
    const ix=impact.x-c;
    ctx.save();ctx.globalAlpha=1-progress;
    if(impact.kind==='thrust'){
      const end=ix+boss.dir*44*progress;
      poly([[end-boss.dir*88,398],[end,391],[end+boss.dir*22,395],[end,401]],'#ebf6df');
    }else{
      const width=impact.radius*(.55+progress*.8);
      poly([[ix-width,428],[ix-21,421],[ix,396+19*progress],[ix+25,420],[ix+width,428]],'#fff1bd');
      rect(ix-width,430,2*width,2,'#e9ad74');
    }
    ctx.restore();
  }
}
function drawErlangBody(x,y,face,scale,angle,gait,clone=false){
  ctx.save();
  ctx.translate(x,y);
  ctx.scale(face*scale,scale);
  const dark='#29364d', silver=clone?'#a5d2ee':'#d1d8d5', blue=clone?'#527b9e':'#47637c', gold='#e8c389';
  const stride=Math.sin(gait?.walkPhase??0)*(gait?.walkAmount??0)*8;
  const brace=gait?.poseBrace??0;
  const lean=gait?.poseLean??0;
  const silk=clone?'#577f9b':'#7b364e';
  const steelShade=clone?'#6f9db9':'#839ca7';
  const edge=clone?'#d7f5ff':'#fff6dc';
  const ribbon=Math.sin(t*4+x*.01)*4-stride*.4;
  poly([[-8,-37],[-25,-29],[-31+ribbon,-8],[-29+ribbon,1],[-17,-5],[-8,-28]],dark);
  poly([[-10,-35],[-23,-27],[-28+ribbon,-4],[-19,-8],[-10,-29]],silk);
  poly([[-14,-33],[-24,-24],[-27+ribbon,-7],[-22+ribbon,-12],[-18,-26]],'#ba6c72');
  poly([[-22,-26],[-26+ribbon,-7],[-26+ribbon,-3],[-20,-17]],clone?'#80aec4':'#cf8a85');
  poly([[-26+ribbon,-6],[-20,-7],[-17,-10],[-18,-6],[-27+ribbon,-2]],gold);
  for(const [hip,offset] of [[-8,stride-brace],[6,-stride+brace]]){
    const yy=-Math.max(0,offset)*.53;
    poly([[hip-4,-15],[hip+4,-15],[hip+4+offset,yy-5],[hip+7+offset,yy],[hip-5+offset,yy]],dark);
    rect(hip-2+offset,yy-10,6,6,blue);
    rect(hip-2+offset,yy-8,6,2,silver);
    rect(hip-1+offset,yy-10,2,4,edge);
    rect(hip-2+offset,yy-4,7,2,gold);
    rect(hip-3+offset,yy-1,8,1,'#151e30');
  }
  ctx.translate(lean,brace*.26);
  poly([[-17,-30],[-8,-38],[8,-38],[17,-30],[13,-10],[16,-6],[-15,-6]],dark);
  poly([[-14,-29],[-7,-35],[7,-35],[14,-29],[10,-13],[-11,-13]],blue);
  poly([[-11,-29],[-5,-33],[0,-31],[5,-33],[11,-29],[8,-23],[0,-20],[-8,-23]],steelShade);
  poly([[-10,-29],[-5,-32],[0,-29],[5,-32],[10,-29],[5,-26],[0,-26],[-5,-26]],silver);
  rect(-8,-29,3,1,edge);rect(5,-29,3,1,edge);
  for(const side of [-1,1]){
    ctx.save();
    ctx.scale(side,1);
    poly([[7,-37],[15,-38],[21,-32],[17,-28],[9,-29]],dark);
    poly([[8,-36],[15,-36],[19,-32],[16,-30],[10,-31]],silver);
    poly([[11,-36],[15,-36],[19,-32],[16,-31],[13,-33]],steelShade);
    poly([[10,-35],[14,-35],[16,-33],[13,-31],[11,-32]],edge);
    rect(13,-33,2,1,dark);
    rect(10,-29,7,2,gold);
    rect(10,-27,7,2,steelShade);
    rect(11,-24,5,2,silver);
    ctx.restore();
  }
  rect(-11,-20,22,3,gold);rect(-9,-20,18,1,edge);
  poly([[0,-31],[5,-28],[4,-24],[0,-22],[-4,-25],[-5,-28]],gold);
  rect(-1,-28,3,3,clone?'#5199b4':'#a05461');rect(0,-28,1,1,edge);
  for(let i=0;i<3;i++){
    const plate=-11+i*8;
    rect(plate,-16,6,7,silver);
    rect(plate,-11,6,2,blue);
    rect(plate+2,-15,2,1,edge);
    rect(plate,-9,6,1,gold);
  }
  poly([[-12,-46],[-8,-54],[5,-55],[10,-50],[12,-44],[8,-36],[-7,-36]],dark);
  rect(-8,-47,17,10,'#d4a68a');
  rect(-7,-51,14,5,blue);rect(-10,-47,21,2,gold);
  poly([[-10,-45],[-6,-45],[-5,-39],[-8,-34],[-11,-37]],steelShade);
  rect(-10,-44,2,7,silver);rect(-9,-36,2,1,edge);
  poly([[-10,-49],[-11,-55],[-6,-53],[-1,-61],[4,-53],[9,-56],[10,-49]],dark);
  poly([[-8,-50],[-8,-53],[-4,-51],[-1,-57],[3,-51],[7,-53],[8,-50]],silver);
  poly([[-6,-49],[-2,-51],[0,-55],[2,-51],[6,-49],[3,-48],[-3,-48]],gold);
  rect(-3,-47,7,2,edge);
  rect(-1,-47,3,2,'#a15450');
  rect(0,-47,1,1,'#fffadc');
  rect(4,-42,4,1,'#654c52');
  rect(5,-41,2,1,dark);
  rect(7,-39,3,1,'#e6b594');
  rect(4,-37,4,1,'#89605a');
  ctx.translate(12,-24);
  ctx.rotate(angle);
  rect(-2,-42,4,65,dark);rect(-1,-42,2,65,gold);
  rect(-5,-40,10,3,gold);
  rect(-2,-39,4,7,silver);
  rect(-3,16,6,4,silver);
  for(const band of [-31,-24,-14,7,13])rect(-2,band,4,1,'#b99770');
  const tassel=Math.sin(t*7+x*.04)*2;
  poly([[-4,-38],[-9,-31],[-9+tassel,-24],[-5+tassel,-26],[-5,-32]],dark);
  poly([[-4,-37],[-8,-31],[-8+tassel,-25],[-6+tassel,-27],[-5,-32]],silk);
  poly([[-4,-41],[-5,-50],[0,-62],[5,-50],[4,-41]],silver);
  poly([[-4,-41],[-9,-44],[-10,-54],[-6,-49],[-3,-47]],silver);
  poly([[4,-41],[9,-44],[10,-54],[6,-49],[3,-47]],silver);
  poly([[0,-60],[4,-50],[3,-42],[0,-43]],steelShade);
  poly([[0,-60],[2,-50],[0,-43],[-1,-48]],edge);
  poly([[-9,-52],[-7,-47],[-4,-44],[-7,-45]],edge);
  poly([[9,-52],[7,-47],[4,-44],[7,-45]],edge);
  rect(-3,-3,6,6,'#d4a68a');
  rect(-3,1,6,2,blue);
  ctx.restore();
}

function isCombatBoss(enemy){
  return enemy.id==='heaven-boss'||enemy===giantBoss||enemy===nezhaBoss||enemy===erlangBoss;
}
function enemyBound(enemy){
  return t<(enemy.boundUntil??0);
}
function interruptBoundBoss(boss){
  const resumeAt=boss.boundUntil+.15;
  if(boss.id==='heaven-boss'){
    heavenBossMove=null;
    heavenBossReady=resumeAt;
    boss.y=428;
  }else if(boss===giantBoss){
    boss.attack=null;
    boss.step=0;
    boss.next=resumeAt;
  }else{
    if(boss===erlangBoss&&boss.move?.kind==='summon')boss.turn--;
    boss.move=null;
    boss.next=resumeAt;
    boss.y=432;
    if(boss===nezhaBoss){boss.walking=false;boss.transformAt=null;}
    else{
      boss.walkAmount=0;
      boss.scale=boss.giant?4.2:1;
    }
  }
  $('heavenWarning').hidden=true;
}
function unlockBinding(){
  progress.skills??={};
  if(progress.skills.binding)return;
  progress.skills.binding=true;
  persistProgress();
}
function castBinding(){
  if(!progress.skills?.binding||mode!=='play'||paused||playerFrozen()||transformedForm||slamActive)return;
  const x=player.x+12,y=player.y+player.h;
  let nearest=null,boss=null,distance=240;
  for(const enemy of staffTargets()){
    if(enemy.hp<=0||enemyBound(enemy))continue;
    const gap=Math.hypot(enemy.x-x,enemy.y-y);
    if(gap>=240)continue;
    if(isCombatBoss(enemy))boss=enemy;
    else if(gap<distance){distance=gap;nearest=enemy;}
  }
  const target=boss??nearest;
  if(!target){toast('附近没有可定身的敌人。');return;}
  target.boundUntil=t+5;
  if(boss)interruptBoundBoss(boss);
  target.strikeAt=0;
  target.castAt=0;
  target.frost=null;
  scatter(target.x,target.y-22,30,['#efd095','#fff2c1','#afcfd0'],86);
  chirp(480,950,.33,0,.11,'triangle');
  toast(boss?'定身术 · 首领定身 5 秒':'定身术 · 5 秒');
}
function drawBoundEnemies(c){
  if(mode!=='play')return;
  for(const enemy of staffTargets()){
    if(enemy.hp>0&&enemyBound(enemy))drawBindingSeal(enemy.x-c,enemy.y,enemy.boundUntil-5);
  }
}
function drawBindingSeal(x,y,at){
  const age=Math.max(0,t-at);
  glow(x,y-24,42,'#ffe0a866');
  for(let i=0;i<7;i++){
    const turn=i*Math.PI*2/7+age*1.7;
    const px=x+Math.cos(turn)*25,py=y-23+Math.sin(turn)*13;
    rect(px,py,4,3,i%2?'#edb66c':'#fff4bc');
  }
  drawBodhiLabel('定',x,y-65);
}
const fairySilks=[
  ['#873f61','#c36d8a','#f2b7bc'],['#534a84','#8179b3','#c9b6e1'],
  ['#95624d','#c58b69','#f1c291'],['#39627b','#659ab4','#b6dae1'],
  ['#8c476f','#b871a0','#f2c2d4'],['#855c3c','#c19765','#f6d8a3'],
  ['#3b706f','#6a9f91','#c2dec4']
];
function drawOrchardFairies(c){
  const bound=Number.isFinite(orchardBindingAt);
  for(const [i,silk] of fairySilks.entries()){
    const x=YAOCHI_ENTRY_X-330+i*29-c;
    const y=430;
    contactShadow(x,y,24);
    drawOrchardFairy(x,y,i,silk,bound);
    if(bound)drawBindingSeal(x,y,orchardBindingAt);
  }
  if(bound){
    const x=player.x+12-c;
    glow(x,player.y+13,62,'#fdd08f9e');
    drawBodhiLabel('孙悟空 · 施展定身术',x,258);
  }
}
function drawOrchardFairy(x,y,index,[shadow,cloth,trim],bound){
  const drape=bound?0:Math.round(Math.sin(t*2.6+index)*2);
  const tall=index%3;
  const ink='#3b3044', gold='#f0cc89', skin='#ecc0a3';
  ctx.save();
  ctx.translate(x,y);
  poly([[-4,-42],[-13,-35],[-17,-25+drape],[-14,-14+drape],[-11,-21+drape],[-9,-32]],trim);
  poly([[4,-39],[13,-31],[18,-22-drape],[16,-15-drape],[13,-22-drape],[8,-32]],shadow);
  poly([[-6,-33],[-13,-27],[-9,-16],[-15,-1],[-10,0],[12,0],[15,-3],[9,-17],[13,-27],[6,-33]],ink);
  poly([[-7,-30],[-11,-26],[-7,-17],[-12,-2],[11,-2],[13,-4],[7,-17],[11,-26],[5,-30]],cloth);
  poly([[-6,-16],[-10,-4],[-5,-2],[-2,-16]],trim);
  poly([[3,-16],[6,-3],[11,-3],[7,-16]],shadow);
  poly([[-2,-16],[-4,-4],[2,-3],[3,-17]],cloth);
  rect(-11,-3,23,1,trim);
  for(const dx of [-8,-2,4,9]){
    rect(dx,-6+(index+dx)%2,2,1,gold);
  }
  poly([[-10,-26],[-8,-30],[-4,-27],[-6,-23],[-11,-20+drape],[-14,-22+drape]],trim);
  poly([[9,-28],[13,-25],[15,-20-drape],[12,-18-drape],[8,-23],[6,-26]],trim);
  rect(-8,-19,16,2,gold);
  rect(-1,-19,3,3,shadow);rect(0,-18,1,1,trim);
  rect(0,-16,2,5,gold);
  rect(-2,-33,5,4,skin);
  poly([[-7,-44-tall],[-4,-48-tall],[4,-48-tall],[8,-44-tall],[7,-35],[-6,-34]],ink);
  poly([[-5,-42-tall],[-2,-44-tall],[4,-44-tall],[6,-40],[4,-34],[-3,-34],[-5,-37]],skin);
  rect(-4,-40,2,1,ink);rect(2,-40,2,1,ink);
  rect(-1,-36,3,1,'#ac5d6c');rect(4,-37,1,2,'#e4a389');
  rect(-7,-40,2,5,ink);rect(6,-41,2,5,ink);
  rect(-6,-36,1,3,gold);rect(7,-37,1,3,gold);
  rect(-3-index%2,-51-tall,7+index%2,5,ink);
  rect(-1,-50-tall,4,1,'#63506a');
  rect(1,-47-tall,8,1,gold);
  rect(5,-49-tall,3,3,trim);rect(6,-48-tall,1,1,gold);
  if(index%2===0){
    poly([[7,-18],[16,-18],[15,-11],[8,-11]],'#99694f');
    rect(8,-19,8,2,'#dfaf77');rect(9,-22,4,3,'#eea989');
    rect(9,-16,5,1,gold);
  }else{
    poly([[-12,-20],[-15,-28],[-10,-29],[-7,-22]],trim);
    rect(-12,-22,1,5,gold);
  }
  ctx.restore();
}
function drawErlangEscort(){
  const line=secondDialogueLine;
  if(line===3){
    drawHeavenAudience();
    drawHeavenOfficer(430,426,'flame',1,false);
    drawBoundPrisoner(468,426,0);
    return;
  }
  if(line<3){
    drawCloudRoadBackground(340,[{x:0,y:430,w:1400}]);
    drawSouthHeavenGate(715,430);
    const stride=line===0?0:(t*34)%64;
    const x=352+stride;
    drawHeavenOfficer(x-47,430,'thunder',1,false,1,.21,{walkAmount:1,walkPhase:t*8});
    drawBoundPrisoner(x,430,line===0?0:t);
    drawHeavenOfficer(x+48,430,'flame',1,false,1,.21,{walkAmount:1,walkPhase:t*8});
    if(line===0)drawPixelatedBoss(()=>drawErlangBody(536,430,-1,1.08,.43,null));
    return;
  }
  drawFifthLandscape('furnace',0);
  drawTaibai(395,430);
  if(line===4)drawHeavenOfficer(675,430,'flame',-1,false);
  else drawJadeEmperor(703,430);
}
function drawBoundPrisoner(x,y,walk){
  drawPlayerMonkey(x,y-33,1,!!walk,1,false,true);
  rect(x-9,y-17,18,3,'#d0a577');
  rect(x-7,y-13,16,2,'#ae7854');
}

const erlangStrikePoses={
  slash:[-1.18,2.22,.59,7,5],
  thrust:[-.09,1.58,.63,10,7],
  slam:[-1.26,2.33,.73,9,6],
  clones:[-1.28,-.36,.67,3,3]
};
function animateErlangStrike(boss,move,age){
  const pose=erlangStrikePoses[move.kind];
  if(!pose)return;
  const [windup,end,release,lean,brace]=pose;
  const prep=heavenEase(age/release);
  const strike=heavenEase((age-release)/(1-release));
  boss.weaponAngle=move.fromAngle+(windup-move.fromAngle)*prep+(end-windup)*strike;
  boss.poseLean=-lean*.44*prep+lean*strike;
  boss.poseBrace=brace*Math.sin(Math.PI*(.68*prep+.26*strike));
}
function erlangCloneFlight(move,column,index,age){
  const side=index-1;
  const hoverX=column+side*45+(side===0?-30:0);
  const hoverY=199-index%2*42;
  const enter=heavenEase(age/.36);
  const dive=heavenEase((age-.72)/.28);
  const sx=move.from+side*30;
  const x=sx+(hoverX-sx)*enter+(column-hoverX)*dive;
  const y=360+(hoverY-360)*enter+(429-hoverY)*dive+Math.sin(t*6+index)*7*enter*(1-dive);
  return {x,y,dive};
}
function drawErlangSkyClones(move,c,age){
  const targets=erlangCloneColumns(move.aim);
  for(const [i,column] of targets.entries()){
    const tx=column-c;
    const {x,y,dive}=erlangCloneFlight(move,column,i,age);
    const px=x-c;
    rect(tx-ERLANG_CLONE_REACH,425,ERLANG_CLONE_REACH*2,4,'#ffdf9dcf');
    rect(tx-ERLANG_CLONE_REACH,429,ERLANG_CLONE_REACH*2,3,'#c56c62');
    glow(tx,423,42,'#b6dafa64');
    glow(px,y-27,58,'#b7e4fd87');
    poly([[px-18,y-13],[tx-28,426],[tx+28,426],[px+18,y-13]],'#bfdafa31');
    const face=Math.sign(column-x)||move.dir;
    const angle=.69+1.96*dive;
    for(let trail=4;trail>0;trail--){
      const past=Math.max(0,age-trail*.026);
      const p=erlangCloneFlight(move,column,i,past);
      ctx.save();
      ctx.globalAlpha=.065*(5-trail);
      drawErlangBody(p.x-c,p.y,face,1.19,angle,null,true);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha=.68+age*.29;
    drawErlangBody(px,y,face,1.24,angle,{poseBrace:3*dive,poseLean:6*dive},true);
    ctx.restore();
    if(dive>0)poly([[px-16,y-17],[px+17,y-13],[tx+8,429],[tx-7,429]],'#d7edff8a');
  }
}

let bossPixelLayer;
function drawPixelatedBoss(draw,pixelSize=2,opacity=1){
  if(!document.createElement){draw();return;}
  if(bossPixelLayer?.pixelSize!==pixelSize){
    const surface=document.createElement('canvas');
    surface.width=W/pixelSize;
    surface.height=H/pixelSize;
    bossPixelLayer={surface,context:surface.getContext('2d',{willReadFrequently:true}),pixelSize};
  }
  const {surface,context}=bossPixelLayer;
  if(!context){draw();return;}
  const sceneContext=ctx;
  context.setTransform(1,0,0,1,0,0);
  context.clearRect(0,0,surface.width,surface.height);
  context.setTransform(1/pixelSize,0,0,1/pixelSize,0,0);
  ctx=context;
  try{draw();}
  finally{ctx=sceneContext;}
  // Snap partially covered edge pixels to solid or transparent before scaling.
  const pixels=context.getImageData(0,0,surface.width,surface.height);
  for(let i=3;i<pixels.data.length;i+=4)pixels.data[i]=pixels.data[i]>=128?255:0;
  context.putImageData(pixels,0,0);
  ctx.save();
  ctx.globalAlpha*=opacity;
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(surface,0,0,W,H);
  ctx.restore();
}
function drunkenView(){
  return chapter===5&&drankWine&&['banquet','alchemyRoad','alchemy'].includes(fifthScene)&&
    eatenElixirs.size<goldenElixirs.length;
}
function swayDrunkenView(){
  if(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  ctx.translate(W/2+Math.sin(t*2)*7,H/2+Math.cos(t*1.7)*3);
  ctx.rotate(Math.sin(t*2.35)*.018);
  ctx.scale(1.045,1.045);
  ctx.translate(-W/2,-H/2);
}
function drawDrunkenEcho(){
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const shift=reduced?6:9+Math.sin(t*2.8)*5;
  ctx.save();
  ctx.globalAlpha=.26;
  ctx.drawImage(canvas,shift,2,W,H);
  ctx.restore();
}
function updateFifthGuards(dt,route,guards){
  const previousX=guards.map(guard=>guard.x);
  updateDemons(dt,route,guards);
  for(const [i,guard] of guards.entries()){
    const distance=Math.abs(guard.x-previousX[i]);
    const pace=dt>0&&distance>.01?Math.min(1,distance/(dt*80)):0;
    guard.walkAmount=enemyBound(guard)?0:(guard.walkAmount??0)+(pace-(guard.walkAmount??0))*Math.min(1,dt*19);
    guard.walkPhase=(guard.walkPhase??0)+distance*.18;
  }
}
function drawFifthGuard(guard,c,color='#eadcb8'){
  const x=guard.x-c,y=guard.y;
  contactShadow(x,y,36);
  drawHeavenOfficer(x,y,guard.kind,guard.dir,!!guard.strikeAt||!!guard.frost,1,
    guard.frost?-.58:guard.strikeAt?-.8:.21,guard);
  rect(x-15,y-63,30,3,'#293747');
  rect(x-15,y-63,30*guard.hp/guard.maxHp,3,color);
}
function summonErlangRetinue(){
  const center=Math.max(160,Math.min(1270,erlangBoss.x));
  erlangRetinue=[-136,-68,0,68,136].map((offset,i)=>{
    const x=center+offset,y=432;
    scatter(x,y-12,24,['#d5e3df','#a6b9d3','#fff0b6'],90);
    return {id:'erlang-guard-'+i,kind:'retinue',x,y,min:x-28,max:x+28,dir:Math.sign(player.x+12-x)||1,
      hp:50,maxHp:50,damage:15,...heavenSword,speed:105,aggro:true,ground:true,vy:0,landing:null,
      strikeAt:0,readyAt:t+.8+i*.1};
  });
  chirp(155,410,.44,0,.16,'triangle');
}
function drawFifthDoor(x,y,label,open){
  poly([[x-45,y],[x-45,y-79],[x-28,y-101],[x+28,y-101],[x+45,y-79],[x+45,y]],'#665064');
  poly([[x-36,y],[x-36,y-75],[x-22,y-90],[x+22,y-90],[x+36,y-75],[x+36,y]],'#c49772');
  rect(x-28,y-75,56,75,open?'#243945':'#7d4d54');
  if(open)glow(x,y-24,44,'#d3e8c863');
  else{
    rect(x-2,y-75,4,75,'#503747');
    rect(x-10,y-39,4,6,'#e0b67c');rect(x+6,y-39,4,6,'#e0b67c');
  }
  rect(x-45,y-4,90,4,'#e1bd88');
  drawBodhiLabel(label,x,y-103);
}
