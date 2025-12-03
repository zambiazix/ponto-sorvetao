// src/utils/payroll.js
import { parseTimeToMinutes, minutesDiff, overlapMinutesWithWindow } from "./timeUtils";

/**
 * computeMonthlyPayroll(monthObj, salaryBase, options)
 * monthObj: { monthKey, label, days: [ { id: 'YYYY-MM-DD', entrada, intervaloSaida, intervaloVolta, saida, status } ] }
 * salaryBase: number (ex: 1660.63)
 * options: { diarioMinutos: 440, feriadosMap: Map(iso->obj), nightStart: 1320, nightEnd: 299 }
 */
export const computeMonthlyPayroll = (monthObj, salaryBase, options = {}) => {
  const diarioMinutos = options.diarioMinutos ?? 440; // 7:20 = 440 min
  const feriadosMap = options.feriadosMap || new Map();
  const nightStart = options.nightStart ?? 22 * 60; // 1320
  const nightEnd = options.nightEnd ?? (4 * 60 + 59); // 299

  const valorHora = salaryBase / 220;
  const valorMinutoBase = valorHora / 60;

  const rateExtra50 = valorMinutoBase * 1.5;
  const rateExtra100 = valorMinutoBase * 2.0;
  const nightMultiplier = 1.2 / 0.875; // fator para converter minuto noturno
  const rateNightBasePerMin = valorMinutoBase * nightMultiplier;

  let totalMinWorked = 0;
  let totalMinNormal = 0;
  let totalMinExtra50 = 0;
  let totalMinExtra100 = 0;
  let totalMinNight = 0;
  let totalMinNightWithinExtra50 = 0;
  let totalMinNightWithinExtra100 = 0;
  const perDayDetails = [];

  // helper interno: calcMinutesWorkedForDay (idêntico ao usado na UI)
  const calcMinutesWorkedForDay = (p) => {
    const toMin = (t) => {
      if (!t) return null;
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const e = toMin(p.entrada),
      isOut = toMin(p.intervaloSaida),
      iv = toMin(p.intervaloVolta),
      s = toMin(p.saida);
    let total = 0;
    if (e != null && isOut != null) total += minutesDiff(e, isOut);
    if (iv != null && s != null) total += minutesDiff(iv, s);
    return total;
  };

  for (const day of (monthObj.days || [])) {
    const diaIso = day.id;
    const isFeriado = !!(feriadosMap.get(diaIso) || feriadosMap.get(formatDateToDDMM(diaIso)));
    const worked = calcMinutesWorkedForDay(day);
    totalMinWorked += worked;

    let normal = Math.min(worked, diarioMinutos);
    let overtime = Math.max(0, worked - diarioMinutos);

    let extra50 = 0;
    let extra100 = 0;
    if (isFeriado) {
      extra100 = worked;
      normal = 0;
      overtime = worked;
    } else {
      extra50 = Math.min(overtime, 120);
      extra100 = Math.max(0, overtime - 120);
    }

    // segments
    const e = parseTimeToMinutes(day.entrada);
    const isOut = parseTimeToMinutes(day.intervaloSaida);
    const iv = parseTimeToMinutes(day.intervaloVolta);
    const s = parseTimeToMinutes(day.saida);
    const segs = [];
    if (e != null && isOut != null) segs.push([e, isOut]);
    if (iv != null && s != null) segs.push([iv, s]);

    // total night in day
    let nightMinForDay = 0;
    for (const [a, b] of segs) {
      nightMinForDay += overlapMinutesWithWindow(a, b, nightStart, nightEnd);
    }

    // assign night minutes to normal/50/100 following chronological allocation
    let remainingNormal = normal;
    let remaining50 = extra50;
    let remaining100 = extra100;
    let nightAssignedNormal = 0;
    let nightAssigned50 = 0;
    let nightAssigned100 = 0;

    // build chronological subsegments (no cross-midnight pieces)
    const chronologicalSegs = [];
    for (const [a, b] of segs) {
      if (b >= a) chronologicalSegs.push({ start: a, end: b, len: b - a });
      else {
        chronologicalSegs.push({ start: a, end: 1440, len: 1440 - a });
        chronologicalSegs.push({ start: 0, end: b + 1, len: b + 1 });
      }
    }
    chronologicalSegs.sort((x, y) => x.start - y.start);

    for (const seg of chronologicalSegs) {
      const segLen = seg.len;
      const nightHere = overlapMinutesWithWindow(seg.start, seg.end - 1, nightStart, nightEnd);
      let remainingSeg = segLen;
      let remainingNightHere = nightHere;

      const allocate = (bucketRemaining) => {
        if (bucketRemaining <= 0 || remainingSeg <= 0) return { taken: 0, nightTaken: 0 };
        const take = Math.min(bucketRemaining, remainingSeg);
        let nightTaken = 0;
        if (segLen > 0 && nightHere > 0) {
          const ratio = take / segLen;
          nightTaken = Math.round(remainingNightHere * ratio);
          nightTaken = Math.min(nightTaken, remainingNightHere);
          remainingNightHere -= nightTaken;
        }
        remainingSeg -= take;
        return { taken: take, nightTaken };
      };

      if (remainingSeg > 0 && remainingNormal > 0) {
        const res = allocate(remainingNormal);
        remainingNormal -= res.taken;
        nightAssignedNormal += res.nightTaken;
      }
      if (remainingSeg > 0 && remaining50 > 0) {
        const res = allocate(remaining50);
        remaining50 -= res.taken;
        nightAssigned50 += res.nightTaken;
      }
      if (remainingSeg > 0 && remaining100 > 0) {
        const res = allocate(remaining100);
        remaining100 -= res.taken;
        nightAssigned100 += res.nightTaken;
      }
      if (remainingSeg > 0) {
        // fallback to normal
        nightAssignedNormal += Math.min(remainingNightHere, remainingSeg);
        remainingSeg = 0;
        remainingNightHere = 0;
      }
    }

    totalMinNormal += normal;
    totalMinExtra50 += extra50;
    totalMinExtra100 += extra100;
    totalMinNight += nightMinForDay;
    totalMinNightWithinExtra50 += nightAssigned50;
    totalMinNightWithinExtra100 += nightAssigned100;

    perDayDetails.push({
      date: diaIso,
      workedMin: worked,
      normalMin: normal,
      extra50Min: extra50,
      extra100Min: extra100,
      nightMin: nightMinForDay,
      nightMinInExtra50: nightAssigned50,
      nightMinInExtra100: nightAssigned100,
      isFeriado,
    });
  }

  // monetary calculation
  const normalNonNightMin = totalMinNormal - (totalMinNight - (totalMinNightWithinExtra50 + totalMinNightWithinExtra100));
  const totalNightInNormal = totalMinNight - (totalMinNightWithinExtra50 + totalMinNightWithinExtra100);

  const normalNonNightPay = normalNonNightMin * (valorHora / 60);
  const normalNightPay = totalNightInNormal * (valorHora / 60) * (1.2 / 0.875);

  const extra50NonNight = totalMinExtra50 - totalMinNightWithinExtra50;
  const extra50NonNightPay = extra50NonNight * rateExtra50;
  const extra50NightEffectivePay = totalMinNightWithinExtra50 * (rateExtra50 * nightMultiplier);

  const extra100NonNight = totalMinExtra100 - totalMinNightWithinExtra100;
  const extra100NonNightPay = extra100NonNight * rateExtra100;
  const extra100NightEffectivePay = totalMinNightWithinExtra100 * (rateExtra100 * nightMultiplier);

  const totalGross =
    normalNonNightPay +
    normalNightPay +
    extra50NonNightPay +
    extra50NightEffectivePay +
    extra100NonNightPay +
    extra100NightEffectivePay;

  return {
    totals: {
      totalMinWorked,
      totalMinNormal,
      totalMinExtra50,
      totalMinExtra100,
      totalMinNight,
    },
    pays: {
      normalNonNightPay,
      normalNightPay,
      extra50NonNightPay,
      extra50NightEffectivePay,
      extra100NonNightPay,
      extra100NightEffectivePay,
      totalGross,
    },
    perDayDetails,
    meta: {
      valorHora,
      valorMinutoBase,
      rateExtra50,
      rateExtra100,
      nightMultiplier,
    },
  };
};

// util helper para formato DD/MM
export function formatDateToDDMM(isoDate) {
  try {
    const d = new Date(isoDate + "T00:00:00");
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
  } catch {
    return isoDate;
  }
}
