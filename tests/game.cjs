const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map();function node(id){if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:'',innerHTML:'',classList:{toggle(){},remove(){}},addEventListener(){},querySelectorAll(){return[];},getContext(){return{};}});return nodes.get(id);}
const context=vm.createContext({document:{getElementById:node,querySelectorAll(){return[];},addEventListener(){}},window:{addEventListener(){}},localStorage:{getItem(){return null;},setItem(){},removeItem(){}},requestAnimationFrame(){},setTimeout(){},console});
vm.runInContext(fs.readFileSync('dist/game.js','utf8'),context);
vm.runInContext(`
start(); advance(); advance(); advance(); if(mode!=='quiz')throw Error('First quiz missing');answer(1);if(score!==0||!quizDone)throw Error('Incorrect answer handling');advance();for(let i=0;i<4;i++)advance();answer(1);advance();advance();if(mode!=='burst')throw Error('Birth transition');update(4);if(mode!=='play')throw Error('Control transition');
for(let i=0;i<60;i++)update(1/60);if(!player.ground)throw Error('Spawn landing');
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
interact();if(mode!=='quiz'||!activeQuiz.final)throw Error('Throne objective');answer(2);advance();if(mode!=='talk')throw Error('Coronation dialogue');advance();if(mode!=='end')throw Error('Ending');
`,context);
console.log('PASS: story, incorrect/correct answers, birth, physics, all platforms in both directions, challenge, discovery, return and ending.');
