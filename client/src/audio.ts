export type GameSound = 'firstStart' | 'countdown' | 'toolClick' | 'turnStart' | 'correct';

const soundSources:Record<GameSound,string> = {
  firstStart:'/sounds/primerinicio.mp3',
  countdown:'/sounds/10segundos.mp3',
  toolClick:'/sounds/click.mp3',
  turnStart:'/sounds/iniciopartida2.mp3',
  correct:'/sounds/correcto.mp3'
};

const music = new Audio('/sounds/musicfondo.mp3');
music.loop = true;
music.volume = .14;
music.preload = 'auto';

const effects = new Map<GameSound,HTMLAudioElement>();
let muted = localStorage.getItem('garabato-audio-muted') === 'true';

function effect(name:GameSound):HTMLAudioElement {
  const existing = effects.get(name);
  if (existing) return existing;
  const audio = new Audio(soundSources[name]);
  audio.volume = name === 'toolClick' ? .45 : .72;
  audio.preload = 'auto';
  effects.set(name,audio);
  return audio;
}

music.load();
(Object.keys(soundSources) as GameSound[]).forEach(name=>effect(name).load());

function play(audio:HTMLAudioElement,restart=false) {
  if (muted) return;
  if (restart) audio.currentTime = 0;
  void audio.play().catch(()=>undefined);
}

export function startBackgroundMusic() {
  play(music);
}

export function playGameSound(name:GameSound) {
  play(effect(name),true);
}

export function stopGameSound(name:GameSound) {
  const audio = effects.get(name);
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}

export function audioIsMuted() {
  return muted;
}

export function setAudioMuted(value:boolean) {
  muted = value;
  localStorage.setItem('garabato-audio-muted',String(value));
  if (muted) {
    music.pause();
    effects.forEach(audio=>audio.pause());
  } else {
    startBackgroundMusic();
  }
}
