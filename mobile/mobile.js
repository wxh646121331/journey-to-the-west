'use strict';

if (location.hostname.endsWith('.netlify.app')) {
  document.body.classList.add('netlify-layout');
}

// Keep native selection and Safari's pinch gesture out of the game surface.
document.addEventListener('selectstart', event => event.preventDefault());
document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('gesturestart', event => event.preventDefault(), {passive: false});

const mobilePad = $('touch');
const mobileStick = $('mobileStick');
setGameFullscreen(true);

// The layout is already fullscreen. After a tap, supported browsers can hide their chrome too.
function enterNativeMobileFullscreen() {
  if (!expandedGame || document.fullscreenElement || !document.fullscreenEnabled ||
      !window.matchMedia?.('(pointer: coarse)').matches || document.body.classList.contains('netlify-layout')) return;
  document.documentElement.requestFullscreen?.().catch(() => {});
}
for (const id of ['start', 'continue']) {
  $(id).addEventListener('click', enterNativeMobileFullscreen);
}
const toggleMobileFullscreen = $('fullscreen').onclick;
$('fullscreen').onclick = () => {
  toggleMobileFullscreen();
  if (expandedGame) enterNativeMobileFullscreen();
  else if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
};
const portraitViewport = window.matchMedia?.('(orientation: portrait)');
let stickPointer = null;
let stickDirection = null;
let stickCenter = 0;
let stickRadius = 0;
let stickRotated = false;

function moveMobileStick(dx) {
  const offset = Math.max(-stickRadius, Math.min(stickRadius, dx));
  const direction = Math.abs(offset) < 7 ? null : offset < 0 ? 'ArrowLeft' : 'ArrowRight';
  if (stickDirection && stickDirection !== direction) keys.delete(stickDirection);
  stickDirection = direction;
  if (direction) keys.add(direction);
  mobileStick.style.setProperty('--stick-x', offset + 'px');
}

function releaseMobileStick() {
  if (stickPointer === null) return;
  const pointer = stickPointer;
  stickPointer = null;
  moveMobileStick(0);
  if (mobileStick.hasPointerCapture(pointer)) mobileStick.releasePointerCapture(pointer);
}

mobileStick.addEventListener('pointerdown', event => {
  if (stickPointer !== null || event.button !== 0 || !mobileCanMove() || paused || playerFrozen() || slamActive) return;
  event.preventDefault();
  const bounds = mobileStick.getBoundingClientRect();
  stickRotated = expandedGame && !!portraitViewport?.matches;
  stickPointer = event.pointerId;
  const extent = stickRotated ? bounds.height : bounds.width;
  stickCenter = (stickRotated ? bounds.top : bounds.left) + extent / 2;
  stickRadius = extent * .29;
  mobileStick.setPointerCapture(stickPointer);
  moveMobileStick((stickRotated ? event.clientY : event.clientX) - stickCenter);
});
mobileStick.addEventListener('pointermove', event => {
  if (event.pointerId === stickPointer) moveMobileStick((stickRotated ? event.clientY : event.clientX) - stickCenter);
});
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  mobileStick.addEventListener(eventName, event => {
    if (event.pointerId === stickPointer) releaseMobileStick();
  });
}
window.addEventListener('blur', releaseMobileStick);
portraitViewport?.addEventListener?.('change', releaseMobileStick);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseMobileStick();
});

const mobileActions = Object.fromEntries([
  'mobileJump', 'mobileInteract', 'runButton', 'flightDown', 'staffButton',
  'giantStaffButton', 'bindButton', 'cloneButton', 'spellButton', 'cloudButton', 'powerButton', 'summonButton'
].map(id => [id, $(id)]));
mobileActions.cloudButton.onclick = castCloud;
mobileActions.powerButton.onclick = togglePowerUp;
mobileActions.summonButton.onclick = castDemonSummon;

function showMobileAction(id, available, label) {
  const button = mobileActions[id];
  if (button.hidden === available) button.hidden = !available;
  if (available && label && button.textContent !== label) button.textContent = label;
}

function mobileCanMove() {
  return mode === 'play' || erlangChaseActive();
}

function updateMobileControls() {
  const playing = !mobilePad.hidden && mobileCanMove() && !paused;
  const ready = playing && !playerFrozen() && !slamActive;
  mobilePad.classList.toggle('controls-inactive', !playing);
  mobileStick.classList.toggle('stick-locked', !ready);
  if (!ready) releaseMobileStick();
  if (playing && mode === 'capture') {
    for (const id of Object.keys(mobileActions)) showMobileAction(id, ready && (id === 'mobileJump' || id === 'runButton'), id === 'mobileJump' ? '跳跃' : undefined);
  } else if (playing) {
    const flight = !!transformedForm?.flight;
    const climbing = transformedForm?.id === 'squirrel' && !!(climbingTree || nearClimbTree());
    const travel = canCastTravelSpell() && !(chapter === 2 && region === 'hall') &&
      !(chapter === 4 && fourthScene === 'stable');
    const combat = ready && !transformedForm && hasStaff && staffTargets().some(enemy => enemy.hp > 0);
    const advanced = combat && !powerUpActive() && hasGiantStaffSkill() && !(chapter === 4 && fourthLootSequence);
    const interaction = ready ? interact(true) : undefined;
    const bindingTarget = energy >= 2 && combat && !powerUpActive() && progress.skills?.binding && staffTargets().some(enemy =>
      enemy.hp > 0 && !enemyBound(enemy) && Math.hypot(enemy.x - player.x - 12, enemy.y - player.y - player.h) < 240);
    const cloneFloor = combat && hasGiantStaffSkill() && !(chapter === 4 && fourthLootSequence) && energy >= 3 && !combatClones.some(clone => clone.hp > 0 && !clone.summoned) &&
      cloneRoute().some(floor => player.x + 12 >= floor.x && player.x + 12 <= floor.x + floor.w &&
        floor.y >= player.y + player.h - 4);

    showMobileAction('runButton', ready && !transformedForm);
    showMobileAction('mobileJump', ready, flight ? '上升' : climbing ? '攀爬' : '跳跃');
    showMobileAction('flightDown', ready && (flight || climbing));
    showMobileAction('mobileInteract', !!interaction, interaction);
    showMobileAction('staffButton', combat && (stamina >= SLAM_STAMINA_COST || (player.ground && !(combo === 4 && t - swingAt < 1.02))));
    showMobileAction('giantStaffButton', advanced && player.ground && energy >= 1 && stamina >= 100);
    showMobileAction('bindButton', !!bindingTarget);
    showMobileAction('cloneButton', cloneFloor);
    showMobileAction('spellButton', ready && ((transformedForm && transformedForm.id !== 'cloud') || (travel && energy >= 2)),
      transformedForm && transformedForm.id !== 'cloud' ? '解除变化' : '变化');
    showMobileAction('summonButton', combat && energy >= 7 && canSummonDemons() && !!summonFloor() && !combatClones.some(unit => unit.hp > 0 && unit.summoned));
    showMobileAction('powerButton', !!progress.skills?.powerUp && (powerUpActive() || (ready && !transformedForm && energy >= 3)), powerUpActive() ? '解除聚化' : '聚化');
    showMobileAction('cloudButton', ready && (transformedForm?.id === 'cloud' || (canCastTravelSpell(true) && !(chapter === 2 && region === 'hall') && !(chapter === 4 && fourthScene === 'stable') && energy >= 5)));
  }
  requestAnimationFrame(updateMobileControls);
}
requestAnimationFrame(updateMobileControls);

const mobileDialogue = document.getElementById('dialog');

new MutationObserver(() => {
  const prompt = mobileDialogue.querySelector('span.next');
  if (!prompt) return;
  const next = document.createElement('button');
  next.type = 'button';
  next.className = 'mobile-next';
  next.textContent = '继续 ›';
  next.addEventListener('click', event => {
    event.stopPropagation();
    advance();
  });
  prompt.replaceWith(next);
}).observe(mobileDialogue, {childList: true, subtree: true});

const mobileSound = document.getElementById('sound');
let observedMobileAudio = null;

function showMobileSoundState() {
  const running = audio?.state === 'running';
  mobileSound.textContent = muted ? '♫ 声音：关' : running ? '♫ 声音：开' : '♫ 点击开启声音';
  mobileSound.setAttribute('aria-label', mobileSound.textContent.slice(2));
  mobileSound.setAttribute('aria-pressed', String(!muted && running));
}

function setMobileAudioSession(type) {
  try {
    if (navigator.audioSession && navigator.audioSession.type !== type) {
      navigator.audioSession.type = type;
    }
  } catch {}
}

function unlockMobileAudio(confirm = false) {
  if (muted) return;
  // On iOS, the default Web Audio session can follow the ringer mute switch.
  setMobileAudioSession('playback');
  const needsUnlock = audio?.state !== 'running';
  enableGameAudio();
  if (audio && audio !== observedMobileAudio) {
    observedMobileAudio?.removeEventListener('statechange', showMobileSoundState);
    observedMobileAudio = audio;
    audio.addEventListener('statechange', showMobileSoundState);
  }
  if (audio?.state === 'interrupted') audio.resume().catch(() => {});
  if (audio && (needsUnlock || confirm)) {
    try {
      // Schedule a short source inside the gesture, alongside resume().
      if (confirm) tone(660, .24);
      else {
        const primer = audio.createBufferSource();
        primer.buffer = audio.createBuffer(1, 1, audio.sampleRate);
        primer.connect(audio.destination);
        primer.start();
      }
    } catch {}
  }
  showMobileSoundState();
}

// A completed tap can activate audio even when touch pointerdown cannot.
document.removeEventListener('pointerdown', enableGameAudio);
document.removeEventListener('keydown', enableGameAudio);
function unlockAudioOnTap(event) {
  if (!mobileSound.contains(event.target)) unlockMobileAudio();
}
document.addEventListener('touchend', unlockAudioOnTap, {capture: true, passive: true});
document.addEventListener('click', unlockAudioOnTap, {capture: true});
document.addEventListener('keydown', unlockAudioOnTap, {capture: true});

mobileSound.onclick = () => {
  if (!muted && audio?.state === 'running') {
    muted = true;
    setMobileAudioSession('auto');
    showMobileSoundState();
  } else {
    muted = false;
    unlockMobileAudio(true);
  }
};
showMobileSoundState();
