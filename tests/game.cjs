const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:'',innerHTML:'',classList:{toggle(){},remove(){}},addEventListener(){},querySelectorAll(){return[];},getContext(){return{};}});return nodes.get(id);}
const storage=new Map();
const context=vm.createContext({document:{getElementById:node,querySelectorAll(){return[];},addEventListener(){}},window:{addEventListener(){}},localStorage:{getItem(key){return storage.get(key)??null;},setItem(key,value){storage.set(key,value);},removeItem(key){storage.delete(key);}},requestAnimationFrame(){},setTimeout(){},console});
vm.runInContext(fs.readFileSync('dist/game.js','utf8'),context);
vm.runInContext(`
start();pause();$('chapterSelect').onclick();
if(!$('selectChapter2').disabled||$('selectChapter1').disabled)throw Error('Fresh profile must lock chapters 2–4');
$('selectChapter2').onclick();
if(chapter!==1||$('chapterPanel').hidden)throw Error('Locked chapter must not open');
pause();if($('pausePanel').hidden||!paused)throw Error('Escape returns from selection to pause menu');
pause();
advance(); advance(); advance(); if(mode!=='quiz')throw Error('First quiz missing');answer(1);if(score!==0||!quizDone)throw Error('Incorrect answer handling');advance();for(let i=0;i<4;i++)advance();answer(1);advance();advance();if(mode!=='burst')throw Error('Birth transition');update(4);if(mode!=='play')throw Error('Control transition');
for(let i=0;i<60;i++)update(1/60);if(!player.ground)throw Error('Spawn landing');
const ceiling={x:100,y:320,w:95};
Object.assign(player,{x:125,y:352,vy:-390,ground:false});
resolvePlayerVertical([ceiling],1/25);
if(player.y!==342||player.vy!==0||player.ground)throw Error('Jump must stop at platform underside');
// Validate that every adjacent platform is reachable in both directions using the real physics.
challenged=true;
for(let direction of [1,-1])for(let index=0;index<platforms.length-1;index++){
const a=platforms[direction===1?index:index+1],b=platforms[direction===1?index+1:index];
if(a.x<0&&direction===-1)continue;
Object.assign(player,{x:direction===1?a.x+a.w-24:a.x+1,y:a.y-34,vy:0,vx:0,ground:true});keys.clear();keys.add(direction===1?'ArrowRight':'ArrowLeft');jump();let landed=false;
for(let j=0;j<140;j++){if(direction*(player.x-(b.x+b.w/2-12))>=0)keys.clear();update(1/120);if(player.ground&&player.x+player.w>b.x&&player.x<b.x+b.w&&Math.abs(player.y+34-b.y)<1){landed=true;break;}}
if(!landed)throw Error('Unreachable platform '+index+' direction '+direction);
}
challenged=false;keys.clear();player.x=2244;keys.add('ArrowRight');update(1/30);if(player.x>2245)throw Error('Waterfall accessible before first task');
keys.clear();player.x=1880;interact();if(challenged||mode!=='talk')throw Error('Challenge must wait for dialogue');closeDialog();if(!challenged)throw Error('Challenge completion');
player.x=3280;interact();closeDialog();if(!found)throw Error('Stone inscription');
player.x=1880;interact();closeDialog();if(!escort)throw Error('Escort objective');
player.x=3350;interact();if(mode!=='play')throw Error('Cannot finish before monkeys arrive');
player.y=398;player.vy=0;
for(let i=0;i<480;i++)update(1/60);
interact();if(mode!=='quiz'||!activeQuiz.final)throw Error('Throne objective');answer(2);advance();if(mode!=='talk')throw Error('Coronation dialogue');advance();if(mode!=='coronation')throw Error('Throne scene');for(let i=0;i<240;i++){t+=1/60;update(1/60);}if(mode!=='end'||seatedAt===null)throw Error('Seated ending');
startChapterTwo();
if(!player.ground||player.y+player.h!==secondRoutes.cave[0].y)throw Error('Second chapter must start grounded');
for(let i=0;i<6;i++)advance();
if(chapter!==2||region!=='cave'||mode!=='play'||$('questTitle').textContent!=='找到海边的帆船')throw Error('Second chapter opening');
Object.assign(player,{x:90,y:390,vy:120,ground:false});
jump();
for(let i=0;i<10&&player.vy>=0;i++){t+=1/120;update(1/120);}
if(player.vy>=0)throw Error('Jump pressed before landing was lost');
immuneUntil=t+10;
moveShoreLifts();
for(const route of Object.values(secondRoutes)){
  for(let i=0;i<route.length-1;i++){
    const a=route[i],b=route[i+1];
    region=route===secondRoutes.cave?'cave':'shore';
    Object.assign(player,{x:a.x+a.w-24,y:a.y-34,vy:0,ground:true});
    keys.clear();keys.add('ArrowRight');jump();
    let landed=false;
    for(let j=0;j<130;j++){
      if(player.x>=b.x+b.w/2-12)keys.clear();
      update(1/120);
      if(player.ground&&player.x>=b.x&&player.x<b.x+b.w&&player.y+34===b.y){landed=true;break;}
    }
    if(!landed)throw Error('Chapter two platform gap '+region+' '+i);
  }
}
keys.clear();
const lift=shoreLifts[0];
Object.assign(player,{x:lift.x+27,y:lift.y-34,ground:true});
t+=.5;moveShoreLifts();
if(Math.abs(player.x-lift.x-27)>.01)throw Error('Moving platform must carry Wukong');
immuneUntil=0;
const spike=shoreTraps[0];
t=3.1*Math.ceil(t/3.1)+2;
health=100;
Object.assign(player,{x:spike.x+6,y:spike.y-34,ground:true});
checkShoreTraps(secondRoutes.shore);
if(health!==85)throw Error('Extended spikes must damage Wukong');
health=100;
region='cave';
Object.assign(player,{x:1610,y:398,vy:0,ground:true});
for(let i=0;i<85;i++)update(1/60);
if(mode!=='voyage')throw Error('Boat boarding');
update(4);advance();
if(mode!=='quiz')throw Error('Voyage quiz');
answer(0);advance();advance();
if(region!=='shore'||mode!=='play'||$('questTitle').textContent!=='拜见菩提祖师')throw Error('Voyage arrival');
energy=10;
Object.assign(player,{x:210,y:408,vy:0,ground:true});
update(1/60);
if(!collected.has('shore0')||energy!==10)throw Error('Peach at full energy');
placePlayerOnGround(secondRoutes.shore,1640);interact();
if(region!=='shore'||mode!=='play')throw Error('Must reach the temple entrance before pressing E');
placePlayerOnGround(secondRoutes.shore,bodhiHall.door-12);
update(1/60);
if(region!=='shore'||mode!=='play')throw Error('Standing at the entrance must wait for E');
interact();
if(region!=='hall'||mode!=='play'||player.x!==bodhiHall.entry||!player.ground)throw Error('Temple interior entry');
keys.add('ArrowRight');
for(let i=0;i<360&&mode==='play';i++)update(1/60);
if(mode!=='talk'||Math.abs(player.x+12-bodhiHall.teacher)>78)throw Error('Walk to Bodhi to trigger dialogue');
advance();advance();advance();
if(mode!=='quiz')throw Error('Apprenticeship quiz');
answer(2);advance();
if(!learned||mode!=='play'||$('questTitle').textContent!=='出观练习七十二变')throw Error('Apprenticeship');
castTransform();
if(transformedForm||energy!==10)throw Error('Practice must be outdoors');
startChapterTwo({phase:'hall',learned:true,energy:10,peaches:[...collected]});
if(region!=='hall'||!learned||!player.ground||player.x!==bodhiHall.entry)throw Error('Resume after learning inside the temple');
interact();
if(region!=='shore'||mode!=='play'||$('spellButton').hidden)throw Error('Leave the temple to practice');
energy=1;castTransform();if(energy!==1||transformedUntil)throw Error('Insufficient energy');
const random=Math.random;
function castWithRoll(roll){
  Math.random=()=>roll;
  try{castTransform();}finally{Math.random=random;}
}
for(const [roll,id] of [[0,'crane'],[.249999,'crane'],[.25,'fly'],[.499999,'fly'],[.5,'tiger'],[.749999,'tiger'],[.75,'squirrel'],[.999999,'squirrel']]){
  energy=10;
  castWithRoll(roll);
  if(transformedForm?.id!==id)throw Error('Four equally sized transformation intervals');
  clearTransformation();
}
energy=10;castWithRoll(.01);if(transformedForm?.id!=='crane'||energy!==8||!transformedUntil)throw Error('Spell cost');
const beforeY=player.y;keys.add('ArrowUp');update(1/60);keys.clear();
if(player.y>=beforeY||Math.abs(transformedUntil-t-10)>.001)throw Error('Crane flight controls or duration');
t+=10.1;update(1/60);if(mode!=='end')throw Error('Chapter two ending');

$('freeSecond').onclick();
if(mode!=='play'||$('practiceNext').hidden)throw Error('Practice must provide next chapter access');
$('practiceNext').onclick();
if(!$('practiceNext').hidden)throw Error('Practice button must leave with chapter two');
advance();advance();advance();
if(chapter!==3||mode!=='play'||thirdScene!=='mountain')throw Error('Third chapter opening');
for(const route of Object.values(thirdRoutes)){
  for(let i=0;i<route.length-1;i++){
    const a=route[i],b=route[i+1];
    Object.assign(player,{x:a.x+a.w-24,y:a.y-34,vy:0,vx:205,ground:true});
    jump();
    let landed=false;
    for(let j=0;j<140;j++){
      if(player.x>=b.x+b.w/2-12)player.vx=0;
      moveOnPlatforms(route,1/120);
      if(player.ground&&player.x>=b.x&&player.x<b.x+b.w&&player.y+34===b.y){landed=true;break;}
    }
    if(!landed)throw Error('Chapter three platform gap '+i);
  }
}
player.x=300;interact();advance();advance();advance();
if(!trained)throw Error('Training the monkeys');
Object.assign(player,{x:963,y:400,ground:true,vy:0,vx:205});
for(let i=0;i<80;i++)moveOnPlatforms(mountainBridgeRoute,1/120);
if(!player.ground||!standingAboveRiver())throw Error('Wukong can walk up the arched bridge');
interact();
if(player.y+player.h!==454)throw Error('Bridge can reach the river below');
interact();
if(thirdScene!=='palace')throw Error('River entrance');
Object.assign(player,{x:670,y:339,vy:0,ground:true});
keys.add('ArrowRight');update(1/60);keys.clear();
if(player.x>671||mode!=='play'||hallEntered)throw Error('Crystal Palace door');
interact();
if(!hallEntered||mode!=='play'||dragonSpoken)throw Error('Entering the palace must not start dialogue');
Object.assign(player,{x:915,y:396,vy:0,ground:true});update(1/60);advance();advance();advance();
if(mode!=='quiz')throw Error('Dragon King quiz');
answer(0);advance();
if(!dragonSpoken||hasStaff)throw Error('Dragon throne dialogue');
player.x=1590;interact();advance();advance();advance();
if(!hasStaff||mode!=='play'||thirdCombatActive())throw Error('Obtaining the staff inside the peaceful hall');
Object.assign(player,{x:700,y:396,vy:0,ground:true});interact();
if(hallEntered||!thirdCombatActive()||demons.length!==6)throw Error('Palace guards only attack outside');
keys.add('KeyZ');keys.add('ArrowLeft');updateRun(.1);keys.clear();
if(player.vx>=-205||stamina>=100)throw Error('Sprinting stamina');
energy=4;castTransform();
if(energy!==2||t>=transformedUntil)throw Error('Transformation in chapter three');
t+=10.1;update(1/60);
if(mode!=='play')throw Error('Reusable transformation prematurely ended chapter');
if(health!==150||maxHealth!==150||demons.filter(d=>d.kind==='shrimp'&&d.hp===30).length!==3)throw Error('Palace gear and guards');
const shrimp=demons[0];
const startX=shrimp.x;
Object.assign(player,{x:shrimp.x+46,y:shrimp.y-34,ground:true});
shrimp.strikeAt=t+.22;
t+=.10;updateDemons(1/60);
if(shrimp.x<=startX||health!==150)throw Error('Spear moves before impact');
t+=.13;updateDemons(1/60);
if(shrimp.x<=startX||health!==132||damageNumbers.at(-1).amount!==18)throw Error('Spear lunge and armor');
const crab=demons.find(d=>d.kind==='crab');
Object.assign(player,{x:crab.x+16,y:crab.y-34,ground:true});
crab.strikeAt=t+.1;t+=1;updateDemons(1/60);
if(health!==105||damageNumbers.at(-1).amount!==27)throw Error('Crab claws and armor');
player.x=120;interact();if(thirdScene!=='palace')throw Error('Guards block the exit');
demons.forEach(d=>d.hp=0);
interact();advance();advance();advance();advance();
if(thirdScene!=='underworld'||health!==105)throw Error('Entering the underworld');
const watcher=demons[0];
Object.assign(player,{x:watcher.x-62,y:watcher.y-34,vy:0,ground:true});
energy=10;
watcher.aggro=true;watcher.strikeAt=t+.1;
castWithRoll(.30);updateDemons(1/60);
if(transformedForm?.id!=='fly'||watcher.aggro||watcher.strikeAt)throw Error('Fly must be ignored');
clearTransformation();
Object.assign(player,{x:watcher.x-62,y:watcher.y-34,vy:0,ground:true});
castWithRoll(.58);
const beforeFear=watcher.x;
updateDemons(1/60);
if(transformedForm?.id!=='tiger'||watcher.x<=beforeFear||watcher.aggro)throw Error('Tiger must scare enemies away');
clearTransformation();
watcher.fearUntil=0;
Object.assign(player,{x:watcher.x-62,y:watcher.y-120,vy:0,ground:false});
castWithRoll(.05);updateDemons(1/60);
if(!watcher.aggro)throw Error('Crane is visible to enemies');
clearTransformation();
resetDemons();
const chasing=demons[0];
Object.assign(chasing,{x:992,y:427,ground:true,aggro:true,vy:0});
Object.assign(player,{x:1090,y:356,ground:true});
updateDemons(1/60);
if(chasing.ground||chasing.vy>=0)throw Error('Chasing demon should jump a gap');
resetDemons();
const demon=demons[0];
Object.assign(player,{x:demon.x-27,y:demon.y-34,face:1,vx:0,vy:0,ground:true});
demon.dir=-1;demon.strikeAt=t+.1;t+=1;updateDemons(1/60);
if(health!==87)throw Error('Demon damage');
swingStaff();if(!demon.aggro||demon.hp!==13)throw Error('First strike damage');
t+=.26;swingStaff();if(demon.hp!==13)throw Error('Staff cooldown');
t+=.18;swingStaff();if(demon.hp!==3)throw Error('Second strike damage');
const thirdDemon=demons[1];
Object.assign(player,{x:thirdDemon.x-27,y:thirdDemon.y-34,face:1});
t+=.44;swingStaff();if(thirdDemon.hp!==8)throw Error('Third strike damage');
const slamTarget=demons[2];
Object.assign(player,{x:slamTarget.x-25,y:slamTarget.y-97,vy:-70,face:1,ground:false});
stamina=49;t+=.5;swingStaff();
if(slamActive||stamina!==49)throw Error('Slam must require 50 stamina');
stamina=90;swingStaff();
if(!slamActive||stamina!==40||slamTarget.hp!==36)throw Error('Slam activation');
const chargeY=player.y;
t+=.16;update(1/60);
if(player.y>=chargeY||player.vy!==0||!slamActive)throw Error('Air slam windup must lift Wukong');
for(let i=0;i<80&&slamActive;i++){t+=1/120;update(1/120);}
if(slamActive||slamTarget.hp!==6||damageNumbers.at(-1).amount!==30)throw Error('Slam landing damage');
Object.assign(player,{x:1330,y:396,vy:0,ground:true});
keys.add('ArrowRight');update(1/60);keys.clear();
if(player.x>1332||mode!=='play'||hallEntered)throw Error('Senluo Hall door');
interact();
if(!hallEntered||mode!=='play')throw Error('Entering Senluo Hall must not start dialogue');
Object.assign(player,{x:1610,y:396,vy:0,ground:true});update(1/60);advance();advance();
if(mode!=='quiz')throw Error('Underworld quiz');
answer(1);advance();
if(mode!=='book'||bookPage!==0)throw Error('Book interaction');
$('bookCross').onclick();if(namesCleared)throw Error('Wrong book page');
flipBook(1);flipBook(1);$('bookCross').onclick();$('bookClose').onclick();
if(!namesCleared||mode!=='play')throw Error('Crossing names off the book');
health=121;healFromPeach();
if(health!==141)throw Error('Peach heals 20');
healFromPeach();if(health!==150)throw Error('Peach respects maximum health');
Object.assign(player,{x:1356,y:396,vy:0,ground:true});interact();
if(hallEntered||thirdCombatActive())throw Error('Returning from Senluo Hall');
health=87;
fallAndRespawn(thirdRoutes.underworld);
if(health!==67||lives!==3||!player.ground)throw Error('Fall cost and respawn');
health=20;fallAndRespawn(thirdRoutes.underworld);
if(health!==150||lives!==2||!player.ground)throw Error('Death uses a life and restores health');
player.x=120;interact();advance();
if(thirdScene!=='mountain'||mode!=='play'||!player.ground||player.x<1215)throw Error('Grounded return at bridge');
interact();if(mode!=='play')throw Error('Must walk back to monkeys');
const trunk=climbTrees.mountain[0];
Object.assign(player,{x:trunk.x-12,y:trunk.y-34,vy:0,ground:true});
energy=10;castWithRoll(.9);
keys.add('ArrowRight');updateRun(1/60);keys.clear();
if(transformedForm?.id!=='squirrel'||player.vx<=326)throw Error('Squirrel running speed');
keys.add('ArrowUp');update(1/60);keys.clear();
if(climbingTree!==trunk||player.y>=trunk.y-34)throw Error('Squirrel climbs the trunk');
clearTransformation();
player.x=320;interact();advance();advance();advance();
if(mode!=='end')throw Error('Third chapter ending');
$('nextFourth').onclick();
if(chapter!==4||mode!=='talk'||!hasStaff||!player.ground)throw Error('Fourth chapter opening');
for(let i=0;i<4;i++)advance();
if(mode!=='play'||fourthScene!=='clouds')throw Error('Heaven invitation');
for(const scene of ['clouds','escape']){
  fourthScene=scene;
  const route=fourthRoutes[scene];
  for(let i=0;i<route.length-1;i++){
    const from=route[i], to=route[i+1];
    placePlayerOnGround(route,from.x+from.w-24);
    keys.add('ArrowRight');jump();
    let landed=false;
    for(let tick=0;tick<130;tick++){
      if(player.x>=to.x+to.w/2-12)keys.clear();
      t+=1/120;
      moveStaffPlayer(route,1/120);
      if(player.ground&&player.x>=to.x&&player.x<to.x+to.w&&player.y+34===to.y){landed=true;break;}
    }
    keys.clear();
    if(!landed)throw Error('Unreachable chapter four gap '+scene+' '+i);
  }
}
fourthScene='clouds';
placePlayerOnGround(fourthRoutes.clouds,1572);interact();advance();advance();
if(mode!=='play'||fourthScene!=='stable')throw Error('Imperial stable entry');
placePlayerOnGround(fourthRoutes.stable,917);interact();
if(mode!=='play')throw Error('Cannot skip caring for the horses');
for(const horse of heavenlyHorses){placePlayerOnGround(fourthRoutes.stable,horse.x-12);interact();interact();}
if(fedHorses.size!==3)throw Error('Each horse only counts once');
placePlayerOnGround(fourthRoutes.stable,917);interact();
for(let i=0;i<4;i++)advance();
if(mode!=='play'||fourthScene!=='escape')throw Error('Discover the rank and start escape');
placePlayerOnGround(fourthRoutes.escape,1613);interact();
if(mode!=='play')throw Error('Cannot leave South Heaven Gate with defenders undefeated');
for(const guard of heavenGuards){
  placePlayerOnGround(fourthRoutes.escape,guard.x-60);
  player.face=1;
  t+=1.1;swingStaff();
  if(guard.hp!==guard.maxHp-7)throw Error('Fourth chapter staff damage');
  while(guard.hp>0){t+=1.1;swingStaff();}
}
placePlayerOnGround(fourthRoutes.escape,1613);interact();advance();
if(mode!=='play'||fourthScene!=='cave'||!player.ground)throw Error('Return from the South Heaven Gate');
placePlayerOnGround(fourthRoutes.cave,643);interact();
for(let i=0;i<4;i++)advance();
if(mode!=='end'||!fourthComplete)throw Error('Crowned Great Sage in the Water Curtain Cave');
startChapterFour({phase:'escape',checkpoint:608,defeated:['keeper'],energy:5});
if(!player.ground||player.x!==608||heavenGuards[0].hp!==0||fourthScene!=='escape')throw Error('Resume fourth chapter combat checkpoint');

pause();$('saveNow').onclick();
if(!$('saveResult').textContent.includes('已保存'))throw Error('Manual save feedback');
$('chapterSelect').onclick();
if([1,2,3,4].some(n=>$('selectChapter'+n).disabled))throw Error('Completed chapters unlock selection');
$('selectChapter1').onclick();
if(chapter!==1||paused||!$('chapterPanel').hidden)throw Error('Select an unlocked chapter from pause');
pause();$('chapterSelect').onclick();$('selectChapter4').onclick();
if(chapter!==4||fourthScene!=='escape'||checkpoint!==608||heavenGuards[0].hp!==0)throw Error('Switching chapters preserves independent saves');
const disk=loadGameProgress();
if(disk.active!==4||disk.unlocked!==4||disk.slots[4].checkpoint!==608||!disk.slots[1])throw Error('Persisted profile across reloads');
localStorage.removeItem(PROGRESS);
localStorage.setItem(SAVE,JSON.stringify({chapter:3,scene:'underworld',checkpoint:1440}));
const migrated=loadGameProgress();
if(migrated.unlocked!==3||migrated.active!==3||migrated.slots[3].checkpoint!==1440)throw Error('Keep legacy single save');


`,context);
console.log('PASS: story, incorrect/correct answers, birth, physics, all platforms in both directions, challenge, discovery, return, chapter four, saves and chapter selection.');
