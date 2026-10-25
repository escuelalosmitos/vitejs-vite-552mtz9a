// Fragmentos originales sintetizados localmente; sin micrófono ni archivos externos.
export const buildTempoAudioEvents = clip => {
  const beats = clip.beats || 8;
  const beatTimes = [0];
  const events = [];
  for (let beat = 0; beat < beats; beat++) {
    const bpm = clip.bpm + ((clip.endBpm || clip.bpm) - clip.bpm) * beat / Math.max(1, beats - 1);
    events.push({ frequency: 100, at: beatTimes[beat], duration: 0.09, gain: 0.20, type: 'sine' });
    beatTimes.push(beatTimes[beat] + 60 / bpm);
  }
  const timeAt = beat => {
    if (beat >= beats) return beatTimes[beats];
    const index = Math.floor(beat);
    return beatTimes[index] + (beat - index) * (beatTimes[index + 1] - beatTimes[index]);
  };
  const melody = clip.melody || [0, 4, 7, 4, 2, 5, 9, 7, 0, 2];
  const rhythm = clip.rhythm || [1];
  let position = 0;
  let index = 0;
  while (position < beats) {
    const next = Math.min(beats, position + rhythm[index % rhythm.length] / (clip.density || 1));
    const at = timeAt(position);
    const note = melody[index % melody.length] + (clip.semitones || 0);
    events.push({ frequency: 261.6256 * 2 ** (note / 12), at,
      duration: Math.min(0.30, (timeAt(next) - at) * 0.65), gain: clip.gain || 0.24, type: 'triangle' });
    position = next; index++;
  }
  return { events, duration: beatTimes[beats] };
};

export const playTempoClip = async (clip, { volume = 0.65, onEnd = () => {} } = {}) => {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error('Este navegador no permite reproducir el reto. Prueba con un navegador actualizado.');
  const context = new Context();
  try { await context.resume(); } catch (error) { await context.close(); throw error; }
  const master = context.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume));
  master.connect(context.destination);
  const sources = [];
  const start = context.currentTime + 0.10;
  const { events, duration: clipDuration } = buildTempoAudioEvents(clip);
  const tone = (frequency, at, duration, gain, type) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(gain, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    oscillator.connect(envelope); envelope.connect(master);
    oscillator.start(at); oscillator.stop(at + duration + 0.02);
    sources.push(oscillator);
  };
  events.forEach(event => tone(event.frequency, start + event.at, event.duration, event.gain, event.type));
  let finished = false;
  const finish = (completed = false) => {
    if (finished) return;
    finished = true;
    sources.forEach(source => { try { source.stop(); } catch { /* Ya terminó. */ } });
    void context.close();
    if (completed) onEnd();
  };
  // Un marcador silencioso espera el fragmento entero, incluida la duración
  // de su último pulso. No depende de cuál sea la última nota de la melodía.
  // El reloj de audio respeta las suspensiones del navegador.
  const endMarker = context.createOscillator();
  const silence = context.createGain(); silence.gain.value = 0;
  endMarker.connect(silence); silence.connect(master);
  endMarker.onended = () => finish(true);
  sources.push(endMarker);
  endMarker.start(start); endMarker.stop(start + clipDuration);
  return () => finish(false);
};
