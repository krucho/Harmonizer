window.ChordMaster = window.ChordMaster || {};

(function (CM) {
  const { mod, pcToName } = CM.utils;

  const SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11],
    naturalMinor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
    melodicMinor: [0, 2, 3, 5, 7, 9, 11]
  };

  const DEGREE_QUALITY = {
    major: ["maj", "min", "min", "maj", "dom", "min", "dim"],
    naturalMinor: ["min", "dim", "maj", "min", "min", "maj", "maj"],
    dorian: ["min", "min", "maj", "dom", "min", "dim", "maj"],
    mixolydian: ["maj", "min", "dim", "maj", "min", "min", "maj"],
    harmonicMinor: ["min", "dim", "aug", "min", "dom", "maj", "dom"],
    melodicMinor: ["min", "min", "aug", "maj", "dom", "dim", "dim"]
  };

  const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

  function mapItem(label, rootOffset, quality, role, degree) {
    return { label, rootOffset, quality, role, degree };
  }

  const DEGREE_MAP_MAJOR = [
    mapItem("I", 0, "maj", "tonic", 0),
    mapItem("bII", 1, "maj", "neapolitan color", null),
    mapItem("ii", 2, "min", "predominant", 1),
    mapItem("V/vi", 4, "dom", "secondary dominant", null),
    mapItem("iii", 4, "min", "tonic color", 2),
    mapItem("IV", 5, "maj", "predominant", 3),
    mapItem("V/V", 2, "dom", "secondary dominant", null),
    mapItem("V", 7, "dom", "dominant", 4),
    mapItem("bVI", 8, "maj", "borrowed", null),
    mapItem("vi", 9, "min", "tonic color", 5),
    mapItem("bVII", 10, "maj", "borrowed", null),
    mapItem("vii°", 11, "dim", "leading tone", 6)
  ];

  const DEGREE_MAP_NATURAL_MINOR = [
    mapItem("i", 0, "min", "tonic", 0),
    mapItem("ii°", 2, "dim", "predominant", 1),
    mapItem("bIII", 3, "maj", "borrowed", 2),
    mapItem("iv", 5, "min", "predominant", 3),
    mapItem("v", 7, "min", "dominant color", 4),
    mapItem("V", 7, "dom", "dominant", 4),
    mapItem("bVI", 8, "maj", "borrowed", 5),
    mapItem("bVII", 10, "maj", "borrowed", 6),
    mapItem("V7", 7, "dom", "dominant", 4),
    mapItem("bII", 1, "maj", "neapolitan", null),
    mapItem("III", 4, "maj", "relative major", 2),
    mapItem("VII", 10, "maj", "subtonic", 6)
  ];

  const DEGREE_MAP_DORIAN = [
    mapItem("i", 0, "min", "tonic", 0),
    mapItem("ii", 2, "min", "predominant", 1),
    mapItem("bIII", 3, "maj", "borrowed", 2),
    mapItem("IV", 5, "maj", "predominant", 3),
    mapItem("v", 7, "min", "dominant color", 4),
    mapItem("vi°", 9, "dim", "color", 5),
    mapItem("bVII", 10, "maj", "borrowed", 6),
    mapItem("V", 7, "dom", "borrowed dominant", 4),
    mapItem("iii", 4, "maj", "color", 2),
    mapItem("IV7", 5, "dom", "predominant", 3),
    mapItem("ii7", 2, "min", "predominant", 1),
    mapItem("i7", 0, "min", "tonic", 0)
  ];

  const DEGREE_MAP_MIXOLYDIAN = [
    mapItem("I", 0, "maj", "tonic", 0),
    mapItem("ii", 2, "min", "predominant", 1),
    mapItem("iii°", 4, "dim", "color", 2),
    mapItem("IV", 5, "maj", "predominant", 3),
    mapItem("v", 7, "min", "dominant color", 4),
    mapItem("vi", 9, "min", "tonic color", 5),
    mapItem("bVII", 10, "maj", "borrowed", 6),
    mapItem("V", 7, "dom", "borrowed dominant", 4),
    mapItem("I7", 0, "dom", "tonic dominant", 0),
    mapItem("bIII", 3, "maj", "borrowed", 2),
    mapItem("IV7", 5, "dom", "predominant", 3),
    mapItem("vi7", 9, "min", "tonic color", 5)
  ];

  const DEGREE_MAP_HARMONIC_MINOR = [
    mapItem("i", 0, "min", "tonic", 0),
    mapItem("ii°", 2, "dim", "predominant", 1),
    mapItem("III+", 3, "aug", "color", 2),
    mapItem("iv", 5, "min", "predominant", 3),
    mapItem("V", 7, "dom", "dominant", 4),
    mapItem("VI", 8, "maj", "borrowed", 5),
    mapItem("vii°", 11, "dim", "leading tone", 6),
    mapItem("V7", 7, "dom", "dominant", 4),
    mapItem("bVI", 8, "maj", "borrowed", 5),
    mapItem("iv7", 5, "min", "predominant", 3),
    mapItem("ii°7", 2, "dim", "predominant", 1),
    mapItem("i6", 0, "min", "tonic", 0)
  ];

  const DEGREE_MAP_MELODIC_MINOR = [
    mapItem("i", 0, "min", "tonic", 0),
    mapItem("ii", 2, "min", "predominant", 1),
    mapItem("III+", 4, "aug", "color", 2),
    mapItem("IV", 5, "maj", "predominant", 3),
    mapItem("V", 7, "dom", "dominant", 4),
    mapItem("vi°", 9, "dim", "color", 5),
    mapItem("vii°", 11, "dim", "leading tone", 6),
    mapItem("V7", 7, "dom", "dominant", 4),
    mapItem("IV7", 5, "dom", "predominant", 3),
    mapItem("bVI", 8, "maj", "borrowed", 5),
    mapItem("bVII", 10, "maj", "borrowed", 6),
    mapItem("i6", 0, "min", "tonic", 0)
  ];

  const DEGREE_MAPS = {
    major: DEGREE_MAP_MAJOR,
    naturalMinor: DEGREE_MAP_NATURAL_MINOR,
    dorian: DEGREE_MAP_DORIAN,
    mixolydian: DEGREE_MAP_MIXOLYDIAN,
    harmonicMinor: DEGREE_MAP_HARMONIC_MINOR,
    melodicMinor: DEGREE_MAP_MELODIC_MINOR
  };

  const CHORD_INTERVALS = {
    maj: {
      0: [0, 4, 7],
      1: [0, 4, 7, 11],
      2: [0, 4, 7, 11, 14],
      3: [0, 4, 11, 14, 16]
    },
    min: {
      0: [0, 3, 7],
      1: [0, 3, 7, 10],
      2: [0, 3, 7, 10, 14],
      3: [0, 3, 10, 14, 15]
    },
    dom: {
      0: [0, 4, 7],
      1: [0, 4, 7, 10],
      2: [0, 4, 7, 10, 14],
      3: [0, 4, 10, 14, 17]
    },
    dim: {
      0: [0, 3, 6],
      1: [0, 3, 6, 9],
      2: [0, 3, 6, 9, 14],
      3: [0, 3, 9, 14, 15]
    },
    aug: {
      0: [0, 4, 8],
      1: [0, 4, 8, 11],
      2: [0, 4, 8, 11, 14],
      3: [0, 4, 11, 14, 16]
    }
  };

  function qualitySuffix(quality, complexity) {
    const suffixes = {
      maj: ["maj", "maj7", "maj9", "maj9"],
      min: ["m", "m7", "m9", "m11"],
      dom: ["", "7", "9", "13"],
      dim: ["dim", "dim7", "dim9", "dim11"],
      aug: ["aug", "aug7", "aug9", "aug9"]
    };
    return suffixes[quality]?.[complexity] || "";
  }

  function getScaleIntervals(scaleName) {
    return SCALES[scaleName] || SCALES.major;
  }

  function getDegreeQuality(scaleName, degree) {
    const table = DEGREE_QUALITY[scaleName] || DEGREE_QUALITY.major;
    return table[mod(degree, 7)];
  }

  function chordIntervalsFor(quality, complexity, role) {
    const level = Math.min(3, Math.max(0, complexity));
    let intervals = CHORD_INTERVALS[quality]?.[level] || CHORD_INTERVALS.maj[level];
    if (level >= 1 && intervals.length > 3 && (role === "dominant" || quality === "dom")) {
      intervals = intervals.filter((iv) => iv !== 7 || level < 2);
    }
    if (level >= 2 && intervals.length > 4) {
      const hasSeventh = intervals.some((iv) => iv === 10 || iv === 11);
      if (hasSeventh) intervals = intervals.filter((iv) => iv !== 7);
    }
    return intervals.slice();
  }

  function chordFromMapItem(item, keyRoot, complexity) {
    const rootPc = mod(keyRoot + item.rootOffset, 12);
    const intervals = chordIntervalsFor(item.quality, complexity, item.role);
    return {
      label: item.label,
      rootPc,
      quality: item.quality,
      role: item.role,
      degree: item.degree,
      intervals,
      name: `${pcToName(rootPc)}${qualitySuffix(item.quality, complexity)}`
    };
  }

  function getDegreeChord(index, keyRoot, scaleName, complexity) {
    const map = DEGREE_MAPS[scaleName] || DEGREE_MAP_MAJOR;
    const item = map[mod(index, 12)];
    return chordFromMapItem(item, keyRoot, complexity);
  }

  function findDegreeForPc(relativePc, scaleIntervals) {
    if (scaleIntervals.includes(relativePc)) {
      return scaleIntervals.indexOf(relativePc);
    }
    return null;
  }

  function nearestScalePc(relativePc, scaleIntervals, snapMode) {
    if (scaleIntervals.includes(relativePc)) return relativePc;
    if (snapMode === "passing") return relativePc;
    let best = scaleIntervals[0];
    let bestDist = 99;
    scaleIntervals.forEach((pc) => {
      const dist = Math.min(mod(relativePc - pc, 12), mod(pc - relativePc, 12));
      if (dist < bestDist) {
        bestDist = dist;
        best = pc;
      }
    });
    return best;
  }

  function inferQualityForPc(rootPc, keyRoot, scaleName, snapMode) {
    const scale = getScaleIntervals(scaleName);
    let relative = mod(rootPc - keyRoot, 12);
    const degree = findDegreeForPc(relative, scale);
    if (degree == null) {
      relative = nearestScalePc(relative, scale, snapMode || "strict");
      const snappedDegree = findDegreeForPc(relative, scale);
      if (snappedDegree != null) return getDegreeQuality(scaleName, snappedDegree);
      return "maj";
    }
    return getDegreeQuality(scaleName, degree);
  }

  function getRootChord(inputNote, keyRoot, scaleName, complexity, snapMode) {
    const rootPc = mod(inputNote, 12);
    const quality = inferQualityForPc(rootPc, keyRoot, scaleName, snapMode);
    const intervals = chordIntervalsFor(quality, complexity, "absolute root");
    return {
      label: pcToName(rootPc),
      rootPc,
      quality,
      role: "absolute root",
      degree: null,
      intervals,
      name: `${pcToName(rootPc)}${qualitySuffix(quality, complexity)}`
    };
  }

  function quantizeToScale(note, keyRoot, scaleName, options) {
    const opts = options || {};
    const scale = getScaleIntervals(scaleName);
    const octave = Math.floor(note / 12);
    const relative = mod(note - keyRoot, 12);
    let targetPc = relative;

    if (!scale.includes(relative)) {
      if (opts.snapMode === "passing") return note;
      let best = scale[0];
      let bestDist = 99;
      scale.forEach((pc) => {
        let dist = Math.abs(pc - relative);
        if (dist > 6) dist = 12 - dist;
        if (dist < bestDist) {
          bestDist = dist;
          best = pc;
        } else if (dist === bestDist && opts.snapBias === "up" && pc > best) {
          best = pc;
        } else if (dist === bestDist && opts.snapBias === "down" && pc < best) {
          best = pc;
        }
      });
      targetPc = best;
    }

    if (opts.legatoPrev != null && opts.legatoPrev >= 0) {
      const prevRel = mod(opts.legatoPrev - keyRoot, 12);
      const prevIdx = scale.indexOf(prevRel);
      const targetIdx = scale.indexOf(targetPc);
      if (prevIdx >= 0 && targetIdx >= 0 && Math.abs(targetIdx - prevIdx) === 1) {
        targetPc = scale[targetIdx];
      }
    }

    const quantized = octave * 12 + mod(keyRoot + targetPc, 12);
    if (opts.preserveOctave !== false) {
      return quantized;
    }
    return quantized;
  }

  function getMelodicLabel(note, keyRoot, scaleName) {
    const scale = getScaleIntervals(scaleName);
    const rel = mod(note - keyRoot, 12);
    const idx = scale.indexOf(rel);
    if (idx < 0) return pcToName(rel);
    const q = getDegreeQuality(scaleName, idx);
    const roman = q === "min" ? ROMAN[idx].toLowerCase() : q === "dim" ? `${ROMAN[idx].toLowerCase()}°` : ROMAN[idx];
    return roman;
  }

  function getScalePitchClasses(scaleName, keyRoot) {
    const scale = getScaleIntervals(scaleName);
    return scale.map((offset) => mod(keyRoot + offset, 12));
  }

  function chordFifthInterval(quality) {
    if (quality === "dim") return 6;
    if (quality === "aug") return 8;
    return 7;
  }

  CM.theory = {
    SCALES,
    DEGREE_QUALITY,
    DEGREE_MAPS,
    CHORD_INTERVALS,
    ROMAN,
    getScaleIntervals,
    getDegreeQuality,
    getDegreeChord,
    getRootChord,
    quantizeToScale,
    getMelodicLabel,
    getScalePitchClasses,
    chordFromMapItem,
    chordIntervalsFor,
    chordFifthInterval,
    qualitySuffix,
    inferQualityForPc,
    nearestScalePc
  };
})(window.ChordMaster);
