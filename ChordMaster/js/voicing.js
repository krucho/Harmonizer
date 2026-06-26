window.ChordMaster = window.ChordMaster || {};

(function (CM) {
  const { mod, clamp, nearestMidiForPc, clampMidiNotes } = CM.utils;
  const { getScaleIntervals, chordFifthInterval } = CM.theory;

  function getEffectiveBaseOctave(inputNote, followInputOctave, baseOctave) {
    if (followInputOctave) return Math.floor(inputNote / 12) - 1;
    return baseOctave;
  }

  function fixLowCluster(notes, minBottom) {
    const result = notes.slice();
    const floor = minBottom || 52;
    if (result.length > 1 && result[0] < floor && result[1] - result[0] < 7) {
      result[0] += 12;
    }
    result.sort((a, b) => a - b);
    return result;
  }

  function assignVoicesGreedy(candidate, previous) {
    if (!previous || !previous.length) return voiceLeadingCostSimple(candidate, []);
    const sortedPrev = previous.slice().sort((a, b) => a - b);
    const sortedCand = candidate.slice().sort((a, b) => a - b);
    const used = new Set();
    let cost = 0;
    sortedPrev.forEach((prevNote) => {
      let best = null;
      let bestDist = Infinity;
      sortedCand.forEach((note, idx) => {
        if (used.has(idx)) return;
        const dist = Math.abs(note - prevNote);
        if (dist < bestDist) {
          bestDist = dist;
          best = idx;
        }
      });
      if (best != null) {
        used.add(best);
        cost += bestDist;
      } else {
        cost += 6;
      }
    });
    sortedCand.forEach((note, idx) => {
      if (!used.has(idx)) cost += Math.max(0, 52 - note) * 0.5;
    });
    return cost;
  }

  function voiceLeadingCostSimple(candidate, previous) {
    return assignVoicesGreedy(candidate, previous);
  }

  function buildVoicing(chordIntervals, options) {
    const rootMidi = nearestMidiForPc(options.rootPc, (options.baseOctave + 1) * 12);
    let intervals = chordIntervals.slice(0, options.maxNotes || chordIntervals.length);

    if (options.omitFifth && intervals.length > 3) {
      intervals = intervals.filter((iv) => iv !== 7 && iv !== 6 && iv !== 8);
    }

    let source = intervals.map((interval) => rootMidi + interval).sort((a, b) => a - b);

    const keysFloor = options.bassActive ? 55 : 48;
    while (source[0] < keysFloor) source = source.map((note) => note + 12);
    while (source[0] > 72) source = source.map((note) => note - 12);

    const candidates = [];
    for (let inv = 0; inv < Math.min(source.length, 4); inv += 1) {
      let candidate = source.slice();
      for (let i = 0; i < inv; i += 1) {
        candidate.push(candidate.shift() + 12);
      }
      candidate = candidate.map((note, idx) => {
        const spreadBoost = idx > 0 ? 12 * Math.min(options.spread || 0, idx % 2 === 0 ? 2 : 1) : 0;
        return note + spreadBoost;
      });
      if (options.voicing > 0) {
        candidate = candidate.map((note, idx) => note + (idx < options.voicing ? 12 : 0));
      }
      candidate.sort((a, b) => a - b);
      candidate = fixLowCluster(candidate, keysFloor);
      candidates.push(candidate);
    }

    const previous = options.previousVoicing;
    if (!previous || !previous.length) {
      const pick = candidates[options.voicing % candidates.length] || candidates[0];
      return clampMidiNotes(pick);
    }

    candidates.sort((a, b) => assignVoicesGreedy(a, previous) - assignVoicesGreedy(b, previous));
    return clampMidiNotes(candidates[0]);
  }

  function scaleDegreeBelow(rootPc, keyRoot, scaleName) {
    const scale = getScaleIntervals(scaleName);
    const rel = mod(rootPc - keyRoot, 12);
    const idx = scale.indexOf(rel);
    if (idx < 0) return mod(rootPc - 1, 12);
    const belowIdx = mod(idx - 1, scale.length);
    return mod(keyRoot + scale[belowIdx], 12);
  }

  function buildBass(rootPc, chordInfo, bassMode, keyRoot, scaleName) {
    if (bassMode <= 0) return [];
    const root = nearestMidiForPc(rootPc, 36);
    const fifthIv = chordFifthInterval(chordInfo.quality);

    if (bassMode === 1) return clampMidiNotes([clamp(root, 28, 48)]);
    if (bassMode === 2) {
      return clampMidiNotes([clamp(root, 28, 48), clamp(root + fifthIv, 28, 52)]);
    }
    if (bassMode === 3) {
      const approachPc = scaleDegreeBelow(rootPc, keyRoot, scaleName);
      const approach = nearestMidiForPc(approachPc, root - 1);
      return clampMidiNotes([clamp(approach, 28, 48), clamp(root, 28, 48)]);
    }

    const chordIntervals = chordInfo.intervals || [0, 4, 7];
    const walk = chordIntervals
      .slice(0, 4)
      .map((iv) => clamp(root + iv, 28, 52))
      .filter((note, idx, arr) => arr.indexOf(note) === idx);
    return clampMidiNotes(walk.length ? walk : [root]);
  }

  function buildScaleArpNotes(rootPc, keyRoot, scaleName, baseOctave) {
    const scale = getScaleIntervals(scaleName);
    const center = nearestMidiForPc(rootPc, (baseOctave + 1) * 12);
    const notes = [];
    scale.forEach((offset) => {
      const pc = mod(keyRoot + offset, 12);
      notes.push(nearestMidiForPc(pc, center));
      notes.push(nearestMidiForPc(pc, center + 12));
    });
    return [...new Set(notes)].sort((a, b) => a - b);
  }

  CM.voicing = {
    getEffectiveBaseOctave,
    buildVoicing,
    buildBass,
    buildScaleArpNotes,
    assignVoicesGreedy,
    fixLowCluster
  };
})(window.ChordMaster);
