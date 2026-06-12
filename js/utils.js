/* eslint-disable no-unused-vars */
window.ChordMaster = window.ChordMaster || {};

(function (CM) {
  const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

  function mod(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function pcToName(pc) {
    return NOTE_NAMES[mod(pc, 12)];
  }

  function midiToName(midiNumber) {
    const octave = Math.floor(midiNumber / 12) - 1;
    return `${pcToName(midiNumber)}${octave}`;
  }

  function midiToFrequency(midiNumber) {
    return 440 * Math.pow(2, (midiNumber - 69) / 12);
  }

  function nearestMidiForPc(pc, target) {
    let note = Math.floor(target / 12) * 12 + mod(pc, 12);
    while (note - target > 6) note -= 12;
    while (target - note > 6) note += 12;
    return note;
  }

  function clampMidiNotes(notes) {
    return notes.map((note) => clamp(Math.round(note), 0, 127));
  }

  function scaleCC(value, min, max, integer) {
    const scaled = min + (value / 127) * (max - min);
    return integer ? Math.round(scaled) : Number(scaled.toFixed(2));
  }

  function processVelocity(velocity, options) {
    const opts = options || {};
    if (!opts.enabled) return velocity;
    const min = clamp(opts.min ?? 1, 1, 127);
    const max = clamp(opts.max ?? 127, 1, 127);
    const floor = Math.min(min, max);
    const ceil = Math.max(min, max);
    let v = clamp(velocity, floor, ceil);
    const compress = clamp(opts.compress ?? 0, 0, 1);
    if (compress > 0) {
      const center = (floor + ceil) * 0.5;
      v = center + (v - center) * (1 - compress);
      v = clamp(Math.round(v), floor, ceil);
    }
    return v;
  }

  CM.utils = {
    NOTE_NAMES,
    mod,
    clamp,
    pcToName,
    midiToName,
    midiToFrequency,
    nearestMidiForPc,
    clampMidiNotes,
    scaleCC,
    processVelocity
  };
})(window.ChordMaster);
