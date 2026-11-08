'use strict';

if (location.hostname.endsWith('.netlify.app')) {
  document.body.classList.add('netlify-layout');
}

document.addEventListener('contextmenu', event => {
  if (event.target.closest('button, #touch')) event.preventDefault();
});

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
