// Analysis of the normalized 15-min kW series. Pure functions (Node-testable).
//
// Flagged assumption: "billing period" = calendar month. Real billing cycles
// (e.g. mid-month reads) can shift which day is worst; revisit if needed.

const STEP_MS = 15 * 60000;
const STEP_HOURS = 0.25;

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function dayKey(d) {
  return `${monthKey(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

export function timesOf(normalized) {
  const { startMs, kw } = normalized;
  return kw.map((_, i) => startMs + i * STEP_MS);
}

export function analyzeIntervals(normalized) {
  const { startMs, kw } = normalized;
  const n = kw.length;

  // ---- Overall stats + per-month / per-day accumulation (single pass) ----
  const months = new Map(); // key -> { sum, n, peakKw, peakMs, days: Map }
  let peakKw = -Infinity, peakMs = startMs, sum = 0;

  for (let i = 0; i < n; i++) {
    const v = kw[i];
    const ms = startMs + i * STEP_MS;
    const d = new Date(ms);
    sum += v;
    if (v > peakKw) { peakKw = v; peakMs = ms; }

    const mk = monthKey(d);
    let m = months.get(mk);
    if (!m) { m = { sum: 0, n: 0, peakKw: -Infinity, peakMs: ms, days: new Map() }; months.set(mk, m); }
    m.sum += v; m.n += 1;
    if (v > m.peakKw) { m.peakKw = v; m.peakMs = ms; }

    const dk = dayKey(d);
    let day = m.days.get(dk);
    if (!day) { day = { sum: 0, n: 0, peakKw: -Infinity, peakMs: ms, firstIdx: i }; m.days.set(dk, day); }
    day.sum += v; day.n += 1;
    if (v > day.peakKw) { day.peakKw = v; day.peakMs = ms; }
  }

  const avgKw = sum / n;
  const totalKwh = sum * STEP_HOURS;

  // ---- Monthly table + worst day per billing period (calendar month) ----
  const monthly = [];
  for (const [key, m] of [...months.entries()].sort()) {
    // Worst day = the day containing this month's peak demand
    const worstDayKey = dayKey(new Date(m.peakMs));
    const wd = m.days.get(worstDayKey);
    const profileStart = wd.firstIdx;
    const profileLen = wd.n;
    monthly.push({
      key,
      label: new Date(m.peakMs).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }),
      peakKw: m.peakKw,
      peakMs: m.peakMs,
      avgKw: m.sum / m.n,
      loadFactor: m.sum / m.n / m.peakKw,
      energyKwh: m.sum * STEP_HOURS,
      intervals: m.n,
      worstDay: {
        dateKey: worstDayKey,
        peakKw: wd.peakKw,
        peakMs: wd.peakMs,
        avgKw: wd.sum / wd.n,
        energyKwh: wd.sum * STEP_HOURS,
        profileStartIdx: profileStart,
        profileLength: profileLen,
      },
    });
  }

  // ---- Load duration curve (downsampled to ~400 points) ----
  const sortedDesc = [...kw].sort((a, b) => b - a);
  const ldPoints = 400;
  const durationCurve = { pctHours: [], kw: [] };
  for (let p = 0; p < ldPoints; p++) {
    const idx = Math.min(n - 1, Math.round((p / (ldPoints - 1)) * (n - 1)));
    durationCurve.pctHours.push((idx / (n - 1)) * 100);
    durationCurve.kw.push(sortedDesc[idx]);
  }

  // ---- Seasonal heat map: month × hour average kW ----
  const hmAcc = new Map(); // monthKey -> [24] {sum, n}
  for (let i = 0; i < n; i++) {
    const d = new Date(startMs + i * STEP_MS);
    const mk = monthKey(d);
    let arr = hmAcc.get(mk);
    if (!arr) { arr = Array.from({ length: 24 }, () => ({ sum: 0, n: 0 })); hmAcc.set(mk, arr); }
    const cell = arr[d.getHours()];
    cell.sum += kw[i]; cell.n += 1;
  }
  const hmMonths = [...hmAcc.keys()].sort();
  let hmMax = 0;
  const hmValues = hmMonths.map((mk) =>
    hmAcc.get(mk).map((c) => {
      const v = c.n ? c.sum / c.n : null;
      if (v !== null && v > hmMax) hmMax = v;
      return v;
    }),
  );

  return {
    overall: {
      startMs,
      endMs: startMs + (n - 1) * STEP_MS,
      intervals: n,
      days: n / 96,
      peakKw,
      peakMs,
      avgKw,
      loadFactor: avgKw / peakKw,
      totalKwh,
    },
    monthly,
    durationCurve,
    heatmap: { months: hmMonths, values: hmValues, max: hmMax },
  };
}

/** Slice a worst-day 15-min profile out of the normalized series. */
export function worstDayProfile(normalized, monthEntry) {
  const { profileStartIdx, profileLength } = monthEntry.worstDay;
  const times = [];
  const kw = [];
  for (let i = 0; i < profileLength; i++) {
    times.push(normalized.startMs + (profileStartIdx + i) * STEP_MS);
    kw.push(normalized.kw[profileStartIdx + i]);
  }
  return { times, kw };
}
