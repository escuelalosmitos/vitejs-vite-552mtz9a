import { buildTempoAudioEvents } from './tempoChallengeAudio.js';

export const buildMusicAudioEvents = clip => {
  if (!clip.notes) return buildTempoAudioEvents(clip);
  const seconds = 60 / clip.bpm;
  const gains = { melody: 0.16, bass: 0.16, harmony: 0.045, percussion: 0.10, pulse: 0.16 };
  const types = { melody: 'triangle', bass: 'sine', harmony: 'sine', percussion: 'triangle', pulse: 'sine' };
  return { duration: clip.beats * seconds, events: clip.notes.map(event => ({
    frequency: 261.6256 * 2 ** (event.note / 12), at: event.at * seconds,
    duration: Math.max(0.035, event.beats * seconds), gain: gains[event.layer], type: types[event.layer]
  })) };
};
export const playMusicClip = async (clip, { volume = 0.65, onEnd = () => {} } = {}) => {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error('Este navegador no permite reproducir audio. Prueba con un navegador actualizado.');
  const schedule = buildMusicAudioEvents(clip);
  const context = new Context();
  const sources = [];
  let finished = false;
  const finish = completed => {
    if (finished) return;
    finished = true;
    sources.forEach(source => { try { source.stop(); } catch { /* Ya terminó. */ } });
    void context.close();
    if (completed) onEnd();
  };
  try {
    await context.resume();
    const master = context.createGain(); master.gain.value = Math.max(0, Math.min(1, volume)); master.connect(context.destination);
    const start = context.currentTime + 0.1;
    schedule.events.forEach(event => {
      const oscillator = context.createOscillator(), envelope = context.createGain();
      oscillator.type = event.type; oscillator.frequency.value = event.frequency;
      const at = start + event.at;
      envelope.gain.setValueAtTime(0, at); envelope.gain.linearRampToValueAtTime(event.gain, at + 0.01);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + event.duration);
      oscillator.connect(envelope); envelope.connect(master); oscillator.start(at); oscillator.stop(at + event.duration + 0.01); sources.push(oscillator);
    });
    const marker = context.createOscillator(), silence = context.createGain(); silence.gain.value = 0;
    marker.connect(silence); silence.connect(master); marker.onended = () => finish(true); sources.push(marker);
    marker.start(start); marker.stop(start + schedule.duration);
    return () => finish(false);
  } catch (error) { finish(false); throw error; }
};
