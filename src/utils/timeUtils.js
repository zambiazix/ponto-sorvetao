// src/utils/timeUtils.js

export const parseTimeToMinutes = (t) => {
  if (!t) return null;
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + mm; // 0..1439
};

// diff em minutos entre start e end, considera virada de dia
export const minutesDiff = (startMin, endMin) => {
  if (startMin == null || endMin == null) return 0;
  if (endMin >= startMin) return endMin - startMin;
  // cross midnight
  return (endMin + 1440) - startMin;
};

// calcula overlap entre segmento [segStart, segEnd) e janela [winStart, winEnd] podendo ser win cruzando meia-noite
export const overlapMinutesWithWindow = (segStart, segEnd, winStart, winEnd) => {
  // normaliza janelas
  const winSegments = [];
  if (winEnd >= winStart) {
    winSegments.push([winStart, winEnd + 1]); // +1 para fim exclusivo
  } else {
    winSegments.push([winStart, 1440]);
    winSegments.push([0, winEnd + 1]);
  }

  // normaliza segmentos do trabalhador (possível cruzar meia-noite)
  const segs = [];
  if (segEnd >= segStart) segs.push([segStart, segEnd]);
  else {
    segs.push([segStart, 1440]);
    segs.push([0, segEnd + 1]);
  }

  let overlap = 0;
  for (const [s0, s1] of segs) {
    for (const [w0, w1] of winSegments) {
      const s = Math.max(s0, w0);
      const e = Math.min(s1, w1);
      if (e > s) overlap += e - s;
    }
  }
  return overlap;
};
