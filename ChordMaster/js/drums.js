window.ChordMaster = window.ChordMaster || {};

(function (CM) {
  const DRUM_TYPES = ["kick", "snare", "hat", "perc"];
  const DRUM_LABELS = ["Kick", "Snare", "Hat", "Perc"];
  const DRUM_MIDI_CH = 10;

  let getCtx = null;

  function init(getAudioContext) {
    getCtx = getAudioContext;
  }

  function playKick(ctx, dest, velocity, time) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const peak = (velocity / 127) * 0.95;
    osc.type = "sine";
    osc.frequency.setValueAtTime(148, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.11);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.34);
  }

  function playSnare(ctx, dest, velocity, time) {
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 900;
    const gain = ctx.createGain();
    const peak = (velocity / 127) * 0.62;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.16);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.start(time);
    noise.stop(time + 0.18);

    const tone = ctx.createOscillator();
    const toneGain = ctx.createGain();
    tone.type = "triangle";
    tone.frequency.value = 185;
    toneGain.gain.setValueAtTime(peak * 0.35, time);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
    tone.connect(toneGain);
    toneGain.connect(dest);
    tone.start(time);
    tone.stop(time + 0.1);
  }

  function playHat(ctx, dest, velocity, time) {
    const noise = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.06, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 6200;
    const gain = ctx.createGain();
    const peak = (velocity / 127) * 0.38;
    gain.gain.setValueAtTime(peak, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.start(time);
    noise.stop(time + 0.05);
  }

  function playPerc(ctx, dest, velocity, time) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const peak = (velocity / 127) * 0.48;
    osc.type = "square";
    osc.frequency.setValueAtTime(320, time);
    osc.frequency.exponentialRampToValueAtTime(210, time + 0.04);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(time);
    osc.stop(time + 0.14);
  }

  function playDrum(typeIndex, velocity, when) {
    const ctx = getCtx?.();
    if (!ctx) return;
    const master = CM.audio?.audio?.master;
    if (!master) return;
    const time = when ?? ctx.currentTime;
    const v = velocity || 100;
    const idx = Math.max(0, Math.min(DRUM_TYPES.length - 1, typeIndex));
    const type = DRUM_TYPES[idx];
    if (type === "kick") playKick(ctx, master, v, time);
    else if (type === "snare") playSnare(ctx, master, v, time);
    else if (type === "hat") playHat(ctx, master, v, time);
    else playPerc(ctx, master, v, time);
  }

  CM.drums = {
    DRUM_TYPES,
    DRUM_LABELS,
    DRUM_MIDI_CH,
    init,
    playDrum
  };
})(window.ChordMaster);
