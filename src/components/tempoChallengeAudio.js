// Fragmentos originales sintetizados localmente; sin micrófono ni archivos externos.
export const playTempoClip = async (clip, { volume = 0.65, onEnd = () => {} } = {}) => {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) throw new Error('Este navegador no permite reproducir el reto. Prueba con un navegador actualizado.');
  const context = new Context();
  try { await context.resume(); } catch (error) { await context.close(); throw error; }
  const master = context.createGain();
  master.gain.value = Math.max(0, Math.min(1, volume));
  master.connect(context.destination);
  const sources = [];
  const melody = [0, 4, 7, 4, 2, 5, 9, 7, 0, 2];
  let cursor = context.currentTime + 0.10;
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
  const beats = clip.beats || 8;
  for (let beat = 0; beat < beats; beat++) {
    const bpm = clip.bpm + ((clip.endBpm || clip.bpm) - clip.bpm) * beat / Math.max(1, beats - 1);
    const interval = 60 / bpm;
    // El pulso grave conserva altura e intensidad entre ejemplos.
    tone(100, cursor, 0.09, 0.20, 'sine');
    for (let part = 0; part < (clip.density || 1); part++) {
      const note = melody[(beat * (clip.density || 1) + part) % melody.length] + (clip.semitones || 0);
      tone(261.6256 * 2 ** (note / 12), cursor + part * interval / (clip.density || 1), Math.min(0.30, interval * 0.65 / (clip.density || 1)), clip.gain || 0.24, 'triangle');
    }
    cursor += interval;
  }
  let finished = false;
  const finish = (completed = false) => {
    if (finished) return;
    finished = true;
    sources.forEach(source => { try { source.stop(); } catch { /* Ya terminó. */ } });
    void context.close();
    if (completed) onEnd();
  };
  // El evento de audio respeta suspensiones del navegador. Un temporizador de
  // pared podría dar por escuchado un fragmento mientras el audio está parado.
  sources[sources.length - 1].onended = () => finish(true);
  return () => finish(false);
};
