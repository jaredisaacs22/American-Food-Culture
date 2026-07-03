// Chart.js builders for the intervals module. Chart is a CDN global.
/* global Chart */

const ORANGE = '#FFA400';
const INK = '#1f2329';

const charts = new Map();

function replaceChart(canvas, config) {
  const prev = charts.get(canvas);
  if (prev) prev.destroy();
  const chart = new Chart(canvas, config);
  charts.set(canvas, chart);
  return chart;
}

export function renderDurationCurve(canvas, durationCurve, avgKw) {
  replaceChart(canvas, {
    type: 'line',
    data: {
      labels: durationCurve.pctHours.map((p) => p.toFixed(1)),
      datasets: [
        {
          label: 'Demand (kW)',
          data: durationCurve.kw,
          borderColor: ORANGE,
          backgroundColor: 'rgba(255,164,0,0.15)',
          fill: true,
          pointRadius: 0,
          borderWidth: 2,
        },
        {
          label: 'Average demand',
          data: durationCurve.kw.map(() => avgKw),
          borderColor: INK,
          borderDash: [6, 4],
          pointRadius: 0,
          borderWidth: 1.5,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          title: { display: true, text: '% of hours at or above' },
          ticks: { maxTicksLimit: 11, callback(v, i) { return `${Math.round(this.getLabelForValue(i))}%`; } },
        },
        y: { title: { display: true, text: 'kW' }, beginAtZero: true },
      },
      plugins: { legend: { position: 'bottom' } },
    },
  });
}

export function renderMonthlyPeaks(canvas, monthly) {
  replaceChart(canvas, {
    type: 'bar',
    data: {
      labels: monthly.map((m) => m.label),
      datasets: [
        { label: 'Peak kW', data: monthly.map((m) => m.peakKw), backgroundColor: ORANGE },
        { label: 'Average kW', data: monthly.map((m) => m.avgKw), backgroundColor: '#9aa3ad' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, title: { display: true, text: 'kW' } } },
      plugins: { legend: { position: 'bottom' } },
    },
  });
}

export function renderDayProfile(canvas, profile, title) {
  replaceChart(canvas, {
    type: 'line',
    data: {
      labels: profile.times.map((ms) => {
        const d = new Date(ms);
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }),
      datasets: [{
        label: 'Demand (kW)',
        data: profile.kw,
        borderColor: ORANGE,
        backgroundColor: 'rgba(255,164,0,0.15)',
        fill: true,
        pointRadius: 0,
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 13 } },
        y: { beginAtZero: true, title: { display: true, text: 'kW' } },
      },
      plugins: {
        legend: { display: false },
        title: { display: !!title, text: title },
      },
    },
  });
}
