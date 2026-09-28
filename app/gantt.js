// SVG Gantt chart of ownership periods with a shared time axis and hover tooltips.
import { NOW, esc } from "./data.js";

const tooltip = () => document.getElementById("tooltip");

export function showTooltip(evt, html) {
  const t = tooltip();
  t.innerHTML = html;
  t.hidden = false;
  const pad = 14;
  const { innerWidth: w, innerHeight: h } = window;
  const r = t.getBoundingClientRect();
  let x = evt.clientX + pad;
  let y = evt.clientY + pad;
  if (x + r.width > w - 8) x = evt.clientX - r.width - pad;
  if (y + r.height > h - 8) y = evt.clientY - r.height - pad;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}

export function hideTooltip() {
  tooltip().hidden = true;
}

function fit(text, px, charW) {
  const max = Math.floor(px / charW);
  const t = String(text ?? "");
  return t.length > max ? t.slice(0, Math.max(1, max - 1)) + "…" : t;
}

function niceTicks(min, max, width) {
  const span = max - min;
  const target = Math.max(2, Math.floor(width / 60));
  const step = [25, 50, 100, 200, 250, 500].find((s) => span / s <= target) || 500;
  const ticks = [];
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) ticks.push(y);
  return ticks;
}

/**
 * rows: [{label, sub, color, from, to, fromApprox, toApprox, tooltip, href, segments?: [{from, to, fromApprox, toApprox}]}]
 * events: [{year, text}] drawn as ticks under the axis.
 * opts: {labelWidth, min, max, marker: year}
 */
export function renderGantt(container, rows, events = [], opts = {}) {
  const width = container.clientWidth || 360;
  const labelW = opts.labelWidth ?? Math.min(width > 600 ? 260 : 150, Math.round(width * 0.38)); // wide panels: room for full names
  const rowH = 34;
  const top = 22;
  const years = rows.flatMap((r) => (r.segments || [r]).flatMap((g) => [g.from, g.to ?? NOW])).concat(events.map((e) => e.year)).filter((y) => y != null);
  const min = opts.min ?? Math.floor((Math.min(...years, NOW - 100) - 10) / 50) * 50;
  const max = opts.max ?? NOW;
  const plotX = labelW + 8;
  const plotW = Math.max(60, width - plotX - 8);
  const x = (y) => plotX + ((y - min) / (max - min)) * plotW;
  const evH = events.length ? 18 : 0;
  const height = top + rows.length * rowH + evH + 6;
  let uid = Math.random().toString(36).slice(2, 8);

  const ticks = niceTicks(min, max, plotW);
  let s = `<svg class="gantt" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img">`;
  s += `<defs>`;
  rows.forEach((r, i) => {
    (r.segments || [r]).forEach((g, j) => {
      if (!(g.fromApprox || g.toApprox)) return;
      s += `<linearGradient id="g${uid}${i}_${j}" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="${r.color}" stop-opacity="${g.fromApprox ? 0.15 : 1}"/>
        <stop offset="${g.fromApprox ? 0.25 : 0}" stop-color="${r.color}" stop-opacity="1"/>
        <stop offset="${g.toApprox ? 0.75 : 1}" stop-color="${r.color}" stop-opacity="1"/>
        <stop offset="1" stop-color="${r.color}" stop-opacity="${g.toApprox ? 0.15 : 1}"/></linearGradient>`;
    });
  });
  s += `</defs><g class="axis">`;
  for (const t of ticks) {
    s += `<line class="gridline" x1="${x(t)}" x2="${x(t)}" y1="${top - 4}" y2="${top + rows.length * rowH}"/>`;
    s += `<text x="${x(t)}" y="12" text-anchor="middle">${t}</text>`;
  }
  s += `</g>`;
  if (opts.marker != null && opts.marker >= min && opts.marker <= max) {
    s += `<line x1="${x(opts.marker)}" x2="${x(opts.marker)}" y1="${top - 6}" y2="${top + rows.length * rowH}" stroke="var(--text-primary)" stroke-width="1.5"/>`;
  }
  rows.forEach((r, i) => {
    const y = top + i * rowH;
    const segs = r.segments || [r];
    const labelText = esc(fit(r.label, labelW, 6.6));
    const lbl = r.href ? `<a href="${r.href}"><text class="label" x="0" y="${y + 12}">${labelText}</text></a>` : `<text class="label" x="0" y="${y + 12}">${labelText}</text>`;
    s += `<g class="row" data-i="${i}">`;
    s += `<rect class="hit" x="0" y="${y}" width="${width}" height="${rowH - 2}"/>`;
    s += lbl;
    if (r.sub) s += `<text class="sub" x="0" y="${y + 26}">${esc(fit(r.sub, labelW, 5.7))}</text>`;
    segs.forEach((g, j) => {
      if (g.from == null || (g.to == null && g.toUnknown)) return; // unknown years: no bar, the label says "?"
      const x0 = x(Math.max(min, g.from));
      const x1 = Math.max(x0 + 4, x(Math.min(max, g.to ?? NOW)));
      const fill = g.fromApprox || g.toApprox ? `url(#g${uid}${i}_${j})` : r.color;
      s += `<rect x="${x0}" y="${y + 10}" width="${x1 - x0}" height="10" rx="4" fill="${fill}"/>`;
    });
    s += `</g>`;
  });
  s += `<line class="baseline" x1="${plotX}" x2="${plotX + plotW}" y1="${top + rows.length * rowH}" y2="${top + rows.length * rowH}"/>`;
  events.forEach((e, i) => {
    if (e.year == null || e.year < min) return;
    const ex = x(e.year);
    const ey = top + rows.length * rowH + 4;
    s += `<g class="ev" data-e="${i}"><rect class="hit" x="${ex - 6}" y="${ey - 2}" width="12" height="16"/>`;
    s += `<path class="event" d="M${ex} ${ey} l5 9 h-10 z"/></g>`;
  });
  s += `</svg>`;
  container.innerHTML = s;

  const svg = container.querySelector("svg");
  svg.querySelectorAll(".row").forEach((g) => {
    const r = rows[+g.dataset.i];
    g.addEventListener("mousemove", (evt) => showTooltip(evt, r.tooltip));
    g.addEventListener("mouseleave", hideTooltip);
    if (r.href) g.addEventListener("click", (evt) => { if (!evt.target.closest("a")) location.hash = r.href; });
  });
  svg.querySelectorAll(".ev").forEach((g) => {
    const e = events[+g.dataset.e];
    g.addEventListener("mousemove", (evt) => showTooltip(evt, `<div class="t">${e.year}</div>${esc(e.text)}`));
    g.addEventListener("mouseleave", hideTooltip);
  });
}
