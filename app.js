/* Mon Assiette - application (donnees uniquement sur le telephone). */
"use strict";

const VERSION = "1.0 du 21/11/2026";
const KEY = "monassiette.v1";
const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/* Besoins energetiques moyens (kcal/j, activite moyenne), d'apres EFSA 2013 et SACN 2011, arrondis.
   Une "part" de recette = 2 300 kcal/j (adulte moyen). [garcon, fille] par age. */
const REF_KCAL = 2300;
const KCAL = { 1: [780, 720], 2: [1050, 980], 3: [1150, 1080], 4: [1300, 1220], 5: [1400, 1300], 6: [1550, 1450], 7: [1650, 1530],
  8: [1750, 1640], 9: [1850, 1750], 10: [1950, 1820], 11: [2050, 1900], 12: [2200, 2000], 13: [2350, 2100], 14: [2550, 2150],
  15: [2700, 2200], 16: [2800, 2250], 17: [2900, 2300] };
const ADULT_KCAL = { m: 2650, f: 2100 };
const APPETITE = { s: ["Petit appétit", 0.85], n: ["Appétit normal", 1], l: ["Gros appétit", 1.15] };
const WHO_KIND = { f: "Femme", m: "Homme", g: "Fille", b: "Garçon" };
const ACT_TYPES = { yoga: "Yoga", marche: "Marche", velo: "Vélo", autre: "Autre" };
const BYID = Object.fromEntries(RECIPES.map(r => [r.id, r]));
const SEQ = ["pg", "pm", "leg", "leg", "vol", "vr", "veg", "vol", "veg", "pm", "vol", "leg", "veg", "vr"];

/* ---------- Outils ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const dow = d => (d.getDay() + 6) % 7;
const monday = d => addDays(d, -dow(d));
const TEST_TODAY = new URLSearchParams(location.search).get("today");
const today = () => { if (TEST_TODAY) return fromIso(TEST_TODAY); const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const weekKey = (off = 0) => iso(addDays(monday(today()), 7 * off));
const nf = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const fmtDate = d => `${DAYS[dow(d)]} ${d.getDate()}${d.getDate() === 1 ? "er" : ""} ${MONTHS[d.getMonth()]}`;
const MONTHS_S = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const fmtShort = d => `${d.getDate()} ${MONTHS_S[d.getMonth()]}`;
const shuffle = a => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const uid = () => Math.random().toString(36).slice(2, 9);
const num = v => { if (v == null) return null; const n = parseFloat(String(v).replace(",", ".").replace(/\s/g, "")); return isFinite(n) ? n : null; };

/* ---------- Donnees ---------- */
const isChild = p => p.who === "g" || p.who === "b";
function defaults() {
  return {
    v: 1, onboarded: false,
    profile: { name: "", height: null, start: null, goal: null, pregnant: false, weighDay: 0, stepsGoal: 7000 },
    people: defaultPeople(),
    meals: { leftovers: true },
    excl: [], weeks: {}, weights: [], steps: {}, acts: [], lastExport: null, installSeen: false
  };
}
const ALLD = [0, 1, 2, 3, 4, 5, 6];
/* Semaine type par defaut : tout le monde le soir ; le midi, le week-end, plus le mercredi pour toi et les enfants */
function defHome(p) { return { l: (p.me || isChild(p)) ? [2, 5, 6] : [5, 6], d: ALLD.slice() }; }
function defaultPeople() {
  const y = new Date().getFullYear();
  const ps = [
    { id: "me", me: true, name: "", who: "f", app: "n" },
    { id: "p2", name: "", who: "m", app: "n" },
    { id: "p3", name: "", who: "g", born: y - 10, app: "n" },
    { id: "p4", name: "", who: "b", born: y - 7, app: "n" },
    { id: "p5", name: "", who: "g", born: y - 4, app: "n" }
  ];
  ps.forEach(p => { p.home = defHome(p); });
  return ps;
}
let S;
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    const d = defaults();
    if (!raw) return d;
    const s = JSON.parse(raw);
    const out = Object.assign(d, s, {
      profile: Object.assign(d.profile, s.profile || {}),
      meals: Object.assign(d.meals, s.meals || {})
    });
    if (!Array.isArray(out.people) || !out.people.some(x => x.me)) out.people = defaultPeople();
    out.people.forEach(p => { if (!p.home || !Array.isArray(p.home.l) || !Array.isArray(p.home.d)) p.home = defHome(p); });
    out.meals = { leftovers: out.meals.leftovers !== false };
    delete out.table;
    return out;
  } catch (e) { return defaults(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast("Impossible d'enregistrer sur ce téléphone"); }
}
S = load();
if (navigator.storage && navigator.storage.persist) { navigator.storage.persist().catch(() => {}); }

/* ---------- Portions ---------- */
const ageOf = p => isChild(p) && p.born ? today().getFullYear() - p.born : null;
const me = () => S.people.find(p => p.me);
function pname(p) {
  if (p.me) return S.profile.name || "Moi";
  if (p.name) return p.name;
  const same = S.people.filter(x => isChild(x) === isChild(p) && !x.me && !x.name);
  return (isChild(p) ? "Enfant " : "Adulte ") + (same.indexOf(p) + 1 + (isChild(p) ? 0 : 1));
}
function losing() {
  const pr = S.profile; if (pr.pregnant || !pr.goal) return false;
  const ws = S.weights.slice().sort((a, b) => a.d < b.d ? -1 : 1);
  const cur = ws.length ? ws[ws.length - 1].kg : pr.start;
  return cur != null && cur > pr.goal + 0.2;
}
/* Part de chacun, en "parts" de recette */
function coef(p) {
  let kcal;
  if (isChild(p)) {
    const a = ageOf(p);
    if (a == null) kcal = 1700;
    else if (a < 1) return 0;
    else if (a >= 18) kcal = ADULT_KCAL[p.who === "b" ? "m" : "f"];
    else kcal = KCAL[a][p.who === "b" ? 0 : 1];
  } else kcal = ADULT_KCAL[p.who === "m" ? "m" : "f"];
  let k = kcal / REF_KCAL;
  if (p.me) { if (S.profile.pregnant) k += 0.15; else if (losing()) k *= 0.85; }
  k *= (APPETITE[p.app] || APPETITE.n)[1];
  return Math.round(k * 20) / 20;
}
const baseParts = () => S.people.reduce((a, p) => a + coef(p), 0);
/* Presence : semaine type de chacun, modifiee semaine par semaine (w.pres) */
function isPresent(p, d, m, w) {
  const o = w && w.pres && w.pres[p.id], k = d + m;
  if (o && k in o) return o[k];
  return ((p.home || defHome(p))[m] || []).includes(d);
}
function setPresent(w, p, d, m, val) {
  w.pres = w.pres || {};
  const o = w.pres[p.id] = w.pres[p.id] || {};
  const def = ((p.home || defHome(p))[m] || []).includes(d);
  if (val === def) delete o[d + m]; else o[d + m] = val;
}
function presentPeople(s, w) { return S.people.filter(p => isPresent(p, s.d, s.m, w)); }
function absentPeople(s, w) { return S.people.filter(p => !isPresent(p, s.d, s.m, w)); }
const slotAt = (w, d, m) => w.slots.find(x => x.d === d && x.m === m);
const ownParts = (s, w) => presentPeople(s, w).reduce((a, p) => a + coef(p), 0) + (s.x || 0);
const isActive = (s, w) => ownParts(s, w) > 0;
/* Restes : le diner du lundi au jeudi peut nourrir le midi du lendemain (mardi au vendredi) */
function restSource(w, s) {
  if (!s.rest || s.m !== "l" || s.d < 1 || s.d > 4) return null;
  const src = slotAt(w, s.d - 1, "d");
  return src && src.id && BYID[src.id] && BYID[src.id].r && isActive(src, w) ? src : null;
}
function restLunch(w, s) {
  if (s.m !== "d" || s.d > 3) return null;
  const l = slotAt(w, s.d + 1, "l");
  return l && l.rest && isActive(l, w) && restSource(w, l) === s ? l : null;
}
function slotParts(s, w) {
  if (s.rest && restSource(w, s)) return 0;
  let t = ownParts(s, w);
  const l = restLunch(w, s); if (l) t += ownParts(l, w);
  return Math.round(t * 100) / 100;
}
function whoText(s, w) {
  const pr = presentPeople(s, w), ab = absentPeople(s, w);
  if (!pr.length) return "";
  if (!ab.length) return "";
  return ab.length <= 2 && pr.length > ab.length ? "sans " + ab.map(pname).join(", ") : "pour " + pr.map(pname).join(", ");
}
function frac(v) {
  const r = Math.round(v * 4) / 4, w = Math.floor(r), f = r - w;
  const fs = f === 0.25 ? "¼" : f === 0.5 ? "½" : f === 0.75 ? "¾" : "";
  if (w === 0) return fs || "¼";
  return w + (fs ? " " + fs : "");
}
function fmtMass(q, u) {
  if (u === "ml") { const v = q < 100 ? Math.round(q / 5) * 5 : Math.round(q / 10) * 10; return v >= 1000 ? nf.format(v / 1000) + " l" : v + " ml"; }
  const v = q < 100 ? Math.max(5, Math.round(q / 5) * 5) : Math.round(q / 10) * 10;
  return v >= 1000 ? nf.format(Math.round(v / 100) / 10) + " kg" : v + " g";
}
function recQty(name, q, u, parts) {
  const v = q * parts;
  if (u === "pc") return name === "Œufs" ? String(Math.max(1, Math.round(v))) : frac(v);
  if (u === "botte") return frac(v) + " botte" + (v > 1.2 ? "s" : "");
  return fmtMass(v, u);
}
function shopQty(it) {
  const pk = PACKS[it.n];
  if (it.u === "pc") {
    const n = Math.max(1, Math.ceil(it.q - 0.1));
    return { main: String(n), sub: pk && pk[0] > 1 ? `≈ ${Math.max(1, Math.ceil(n / pk[0] - 0.01))} × ${pk[1]}` : "" };
  }
  if (it.u === "botte") { const n = Math.max(1, Math.ceil(it.q - 0.15)); return { main: n + (n > 1 ? " bottes" : " botte"), sub: "" }; }
  return { main: fmtMass(it.q, it.u), sub: pk ? `≈ ${Math.max(1, Math.ceil(it.q / pk[0] - 0.08))} × ${pk[1]}` : "" };
}
function allergensOf(r) {
  const names = r.i.map(x => x[0]);
  return ALLERGENS.filter(([, re]) => names.some(n => re.test(n))).map(([l]) => l);
}

/* ---------- Semaine de menus ---------- */
const allowed = () => RECIPES.filter(r => !r.x.some(f => S.excl.includes(f)));
const isLong = r => r.we || r.t > 40;
function emptySlots() { const out = []; ALLD.forEach(d => { out.push({ d, m: "l", id: null, rest: false, x: 0 }); out.push({ d, m: "d", id: null, rest: false, x: 0 }); }); return out; }
function nearIds(wk) {
  const ids = new Set();
  [-14, -7, 7].forEach(o => { const w = S.weeks[iso(addDays(fromIso(wk), o))]; if (w) w.slots.forEach(s => s.id && ids.add(s.id)); });
  return ids;
}
const needsRecipe = (s, w) => isActive(s, w) && !(s.rest && restSource(w, s));
function generateWeek(wk, keep) {
  const w = { slots: emptySlots(), checked: {}, extras: [], pres: keep && keep.pres ? keep.pres : {}, created: iso(today()) };
  const act = w.slots.filter(s => isActive(s, w));
  const restCand = S.meals.leftovers ? act.filter(s => s.m === "l" && s.d >= 1 && s.d <= 4 && isActive(slotAt(w, s.d - 1, "d"), w)) : [];
  const need = act.filter(s => !restCand.includes(s));
  const n = need.length, pool = allowed(), near = nearIds(wk);
  const chosen = []; let vr = 0;
  const pickFrom = list => { const fresh = list.filter(r => !near.has(r.id)); const src = fresh.length ? fresh : list; return src[Math.floor(Math.random() * src.length)]; };
  const byCat = c => pool.filter(r => r.c === c && !chosen.includes(r) && !(c === "vr" && vr >= 2));
  for (const c of SEQ) {
    if (chosen.length >= n) break;
    let cands = byCat(c);
    if (!cands.length) for (const f of ["vol", "leg", "veg", "pm", "pg"]) { cands = byCat(f); if (cands.length) break; }
    if (!cands.length) break;
    const r = pickFrom(cands); chosen.push(r); if (r.c === "vr") vr++;
  }
  while (chosen.length < n) {
    const rest = pool.filter(r => !chosen.includes(r) && !(r.c === "vr" && vr >= 2));
    /* peu de recettes possibles : on accepte de refaire un plat rapide plutot que trop de viande */
    const rep = pool.filter(r => r.c !== "vr" && !isLong(r));
    const r = rest.length ? pickFrom(rest) : rep.length ? rep[Math.floor(Math.random() * rep.length)] : (pool[0] || null);
    if (!r) break; chosen.push(r); if (r.c === "vr") vr++;
  }
  const weekend = need.filter(s => s.d >= 5), wdLunch = need.filter(s => s.d < 5 && s.m === "l"), wdDin = need.filter(s => s.d < 5 && s.m === "d");
  let longs = shuffle(chosen.filter(isLong)), shorts = shuffle(chosen.filter(r => !isLong(r)));
  while (longs.length > weekend.length) {
    const r = longs.pop();
    const alt = pool.find(a => !isLong(a) && !chosen.includes(a) && a.c === r.c) || pool.find(a => !isLong(a) && !chosen.includes(a) && a.c !== "vr")
      || shuffle(pool.filter(a => !isLong(a) && a.c !== "vr"))[0];
    if (alt) { chosen.splice(chosen.lastIndexOf(r), 1, alt); shorts.push(alt); if (r.c === "vr") vr--; } else shorts.push(r);
  }
  const queueWE = longs.concat(shorts.splice(0, Math.max(0, weekend.length - longs.length)));
  weekend.forEach(s => { s.id = (queueWE.shift() || shorts.shift() || {}).id; });
  const wd = shorts.concat(queueWE);
  /* assez de plats qui se gardent pour les diners qui nourrissent un midi : on echange a categorie egale */
  const needR = new Set(restCand.map(s => s.d - 1)).size;
  for (let guard = 0; guard < 10 && wd.filter(r => r.r).length < needR; guard++) {
    const out = wd.find(r => !r.r && pool.some(a => a.r && !isLong(a) && a.c === r.c && !chosen.includes(a) && !wd.includes(a)));
    if (!out) break;
    const inn = shuffle(pool.filter(a => a.r && !isLong(a) && a.c === out.c && !chosen.includes(a) && !wd.includes(a)))[0];
    wd.splice(wd.indexOf(out), 1, inn); chosen.splice(chosen.indexOf(out), 1, inn);
  }
  /* semaine : les diners d'abord (poisson et legumes secs pour toute la famille), les midis prennent les plats les plus rapides ;
     un diner qui nourrit le midi du lendemain prend un plat qui se garde ; pas deux fois la meme famille deux soirs de suite */
  const fam = r => r.c === "pm" ? "pg" : r.c;
  const srcDays = new Set(restCand.map(s => s.d - 1));
  const slotsWD = wdDin.concat(wdLunch);
  let best = null;
  for (let t = 0; t < 120; t++) {
    const cand = shuffle(wd).slice(0, slotsWD.length);
    const din = cand.slice(0, wdDin.length), lun = cand.slice(wdDin.length);
    const badR = wdDin.filter((s, i) => srcDays.has(s.d) && din[i] && !din[i].r).length;
    const badF = din.filter((r, i) => i && r && din[i - 1] && wdDin[i].d === wdDin[i - 1].d + 1 && fam(r) === fam(din[i - 1])).length;
    const badL = lun.filter(r => r && (r.t > 25 || ["pg", "pm", "leg"].includes(r.c))).length;
    const score = badR * 4 + badF * 2 + badL;
    if (!best || score < best.score) best = { score, cand };
    if (!score) break;
  }
  slotsWD.forEach((s, i) => { s.id = (best && best.cand[i] || {}).id || null; });
  restCand.forEach(s => { s.rest = true; });
  normalize(w);
  return w;
}
function pickOne(w, s) {
  const inWeek = new Set(w.slots.filter(x => x.id).map(x => x.id)), st = weekStats(w), near = nearIds(weekKeyOf(w));
  let cands = allowed().filter(r => !inWeek.has(r.id) && !(r.c === "vr" && st.vr >= 2));
  if (s.d < 5) cands = cands.filter(r => !isLong(r));
  if (s.d < 5 && s.m === "l") { const q = cands.filter(r => r.t <= 25); if (q.length) cands = q; }
  const fresh = cands.filter(r => !near.has(r.id)); if (fresh.length) cands = fresh;
  if (!cands.length) cands = allowed();
  return cands.length ? cands[Math.floor(Math.random() * cands.length)].id : null;
}
function weekKeyOf(w) { return Object.keys(S.weeks).find(k => S.weeks[k] === w) || weekKey(0); }
/* Remet la semaine d'aplomb apres un changement de presence ou de plat */
function normalize(w) {
  w.slots.forEach(s => {
    if (!isActive(s, w)) return;
    if (s.rest && restSource(w, s)) return;
    if (s.rest && !restSource(w, s)) s.rest = false;
    if (!s.id && S.meals.leftovers && s.m === "l" && s.d >= 1 && s.d <= 4) {
      s.rest = true; if (restSource(w, s)) return; s.rest = false;
    }
    if (!s.id) s.id = pickOne(w, s);
  });
}
function getWeek(off, create) {
  const k = weekKey(off);
  let w = S.weeks[k];
  if (w && (!Array.isArray(w.slots) || w.slots.length !== 14)) { const nw = generateWeek(k); nw.checked = w.checked || {}; nw.extras = w.extras || []; S.weeks[k] = w = nw; save(); }
  if (!w && create) { S.weeks[k] = w = generateWeek(k); pruneWeeks(); save(); }
  return w || null;
}
function pruneWeeks() {
  const min = iso(addDays(monday(today()), -35));
  Object.keys(S.weeks).forEach(k => { if (k < min) delete S.weeks[k]; });
}
function cooked(w) { return w.slots.filter(s => needsRecipe(s, w) && s.id && BYID[s.id]); }
function weekStats(w) {
  const act = cooked(w).map(s => BYID[s.id]);
  const vrG = act.filter(r => r.c === "vr").reduce((a, r) => a + r.i.filter(i => i[3] === "V").reduce((b, i) => b + i[1], 0), 0);
  return {
    fish: act.filter(r => r.c === "pg" || r.c === "pm").length,
    fat: act.filter(r => r.c === "pg").length,
    leg: act.filter(r => r.l).length,
    vr: act.filter(r => r.c === "vr").length, vrG
  };
}
function shopping(w) {
  const map = new Map(), placard = new Map();
  cooked(w).forEach(s => {
    const r = BYID[s.id], p = slotParts(s, w);
    if (p <= 0) return;
    r.i.forEach(([n, q, u, ray]) => {
      if (ray === "P" || !u) { if (!placard.has(n)) placard.set(n, new Set()); placard.get(n).add(r.n); return; }
      const k = n + "|" + u;
      const it = map.get(k) || { k, n, u, ray, q: 0, for: new Set() };
      it.q += q * p; it.for.add(r.n); map.set(k, it);
    });
  });
  return { items: [...map.values()], placard: [...placard.keys()].sort((a, b) => a.localeCompare(b, "fr")) };
}

/* ---------- Suivi ---------- */
function sortedWeights() { return S.weights.slice().sort((a, b) => a.d < b.d ? -1 : 1); }
function trendSeries(ws) { let e = null; return ws.map(w => { e = e == null ? w.kg : e + 0.35 * (w.kg - e); return { d: w.d, kg: w.kg, t: e }; }); }
function weightRate(ws) {
  const end = ws.length ? fromIso(ws[ws.length - 1].d) : null;
  if (!end) return null;
  const pts = ws.filter(w => (end - fromIso(w.d)) / 864e5 <= 28);
  if (pts.length < 3) return null;
  const span = (end - fromIso(pts[0].d)) / 864e5;
  if (span < 13) return null;
  const xs = pts.map(w => (fromIso(w.d) - fromIso(pts[0].d)) / 864e5), ys = pts.map(w => w.kg);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let nume = 0, den = 0; xs.forEach((x, i) => { nume += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return den ? nume / den * 7 : null; /* kg par semaine */
}
function weightMessage(ws) {
  if (S.profile.pregnant) return { cls: "", t: "Enceinte ou allaitante : on suit sans viser de perte de poids. Ta sage-femme ou ton médecin reste la bonne référence." };
  if (ws.length < 3) return { cls: "", t: "Une pesée par semaine, même jour, même heure, à jeun. La tendance apparaît après 3 pesées sur deux semaines." };
  const last = trendSeries(ws).pop().t, rate = weightRate(ws), goal = S.profile.goal;
  if (goal && last <= goal + 0.2) return { cls: "ok", t: "Objectif atteint. On passe en stabilisation : mêmes repères, une assiette un peu plus généreuse en féculents si tu as faim." };
  if (rate == null) return { cls: "", t: "Encore quelques pesées pour calculer ton rythme." };
  const pct = rate / last * 100;
  if (pct < -1) return { cls: "warn", t: `Tu descends vite (${nf.format(rate)} kg par semaine). Pas besoin d'aller plus vite : garde tes féculents à chaque repas et mange à ta faim.` };
  if (pct <= -0.2) return { cls: "ok", t: `Bon rythme : ${nf.format(rate)} kg par semaine. Régulier, c'est ce qui tient dans la durée.` };
  if (pct <= 0.2) return { cls: "", t: "Stable ces dernières semaines : c'est normal par moments. Regarde les portions de féculents et le grignotage, et ajoute 1 000 pas par jour." };
  return { cls: "warn", t: "Ça remonte un peu : rien de grave. Reviens aux bases, la moitié de l'assiette en légumes, et sers les assiettes en cuisine." };
}
function stepsAvg(days) {
  let sum = 0, n = 0;
  for (let i = 0; i < days; i++) { const v = S.steps[iso(addDays(today(), -i))]; if (v != null) { sum += v; n++; } }
  return n ? Math.round(sum / n) : null;
}
function weekActMin(off = 0) {
  const start = weekKey(off), end = iso(addDays(fromIso(start), 7));
  return S.acts.filter(a => a.d >= start && a.d < end).reduce((s, a) => s + a.min, 0);
}

/* ---------- Icones ---------- */
const IC = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>',
  menus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7.5"/><circle cx="12" cy="13" r="4"/><path d="M3 3v5a2 2 0 0 0 2 2M5 3v18M21 3c-1.5 1-2 3-2 5s1 2 2 2v11"/></svg>',
  cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18l-1.6 10.2a2 2 0 0 1-2 1.8H6.6a2 2 0 0 1-2-1.8z"/><path d="M8 9l3-6M16 9l-3-6M9 13v4M15 13v4"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M4 15l5-5 4 3 7-7"/><path d="M15 6h5v5"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.2-4 4.4-6 8-6s6.8 2 8 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19l8-8"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  swap: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h14l-4-4M20 16H6l4 4"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>'
};
function catArt(c, color, detail) {
  const f = color || "currentColor", k = detail || "#fff";
  const shapes = {
    fish: `<ellipse cx="37" cy="32" rx="20" ry="12.5" fill="${f}"/><path d="M19 32 5 20v24z" fill="${f}"/><circle cx="47" cy="29" r="2.6" fill="${k}"/><path d="M33 24c3 5 3 11 0 16" stroke="${k}" stroke-width="2" fill="none" opacity=".55"/>`,
    bean: `<g fill="${f}"><path d="M14 34c-4-9 3-19 12-16 5 2 6 7 10 8 6 2 9 8 5 13-6 7-23 5-27-5z"/><path d="M36 20c-2-7 5-13 12-10 4 2 4 6 7 8 4 3 4 9-1 11-6 3-16-2-18-9z" opacity=".7"/></g>`,
    drum: `<g fill="${f}"><path d="M10 26c0-11 9-18 18-15 9 3 12 12 9 19-2 5-8 8-13 9-9 2-14-5-14-13z"/><path d="M32 34l14 14" stroke="${f}" stroke-width="7" stroke-linecap="round"/><circle cx="50" cy="47" r="5"/><circle cx="46" cy="52" r="5"/></g>`,
    meat: `<g><path d="M8 30c0-12 13-20 27-18 13 2 22 10 21 20-1 11-12 18-25 18C17 50 8 42 8 30z" fill="${f}"/><circle cx="40" cy="28" r="6" fill="${k}" opacity=".85"/><path d="M16 36c6 4 16 5 24 2" stroke="${k}" stroke-width="2" fill="none" opacity=".45"/></g>`,
    egg: `<g><path d="M10 34c-2-10 6-18 15-17 5-6 16-6 20 2 9 1 13 11 8 18-4 7-13 7-18 9-9 4-23 1-25-12z" fill="${f}"/><circle cx="31" cy="31" r="8.5" fill="#F4B63F"/><circle cx="28.5" cy="28.5" r="2.4" fill="#fff" opacity=".6"/></g>`
  };
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${shapes[CATS[c].icon]}</svg>`;
}
function tint(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }

/* ---------- Interface ---------- */
const ui = { tab: "today", wk: 0, sheet: null, ob: 0, showPlacard: false };
function toast(t) {
  const el = document.createElement("div"); el.className = "toast"; el.textContent = t;
  document.body.appendChild(el); setTimeout(() => el.remove(), 2200);
}
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.navigator.standalone === true || matchMedia("(display-mode: standalone)").matches;

function render() {
  const app = $("#app"), tabs = $("#tabs");
  if (!S.onboarded) {
    tabs.classList.add("hidden");
    if (isIOS() && !isStandalone() && !sessionStorage.getItem("skipInstall")) { app.innerHTML = viewInstall(); return; }
    app.innerHTML = viewOnboarding(); return;
  }
  tabs.classList.remove("hidden");
  tabs.innerHTML = [["today", "Aujourd'hui"], ["menus", "Menus"], ["cart", "Courses"], ["chart", "Suivi"], ["me", "Moi"]]
    .map(([k, l]) => `<button data-a="tab" data-v="${k}" class="${ui.tab === k ? "on" : ""}" aria-label="${l}">${IC[k === "cart" ? "cart" : k]}<span>${l}</span></button>`).join("");
  const views = { today: viewToday, menus: viewMenus, cart: viewCourses, chart: viewSuivi, me: viewMoi };
  app.innerHTML = views[ui.tab]();
  renderSheet();
}

/* ----- Installation (iPhone, Safari) ----- */
function viewInstall() {
  return `<div class="center ob">
    <img class="logo" src="icon-180.png" alt="">
    <h1>Installe Mon Assiette</h1>
    <p>Ajoute-la à ton écran d'accueil d'abord : elle s'ouvrira comme une vraie appli, marchera sans réseau, et tes données y seront bien rangées.</p>
    <ol class="howto">
      <li><span>Touche le bouton <b>Partager</b> en bas de Safari (le carré avec une flèche).</span></li>
      <li><span>Descends et choisis <b>Sur l'écran d'accueil</b>.</span></li>
      <li><span>Touche <b>Ajouter</b>, puis ouvre l'appli depuis ton écran d'accueil.</span></li>
    </ol>
    <button class="btn ghost" data-a="skipInstall">Continuer dans Safari</button>
    <p class="small muted" style="margin-top:8px">Attention : ce que tu notes dans Safari ne passe pas dans l'appli installée.</p>
  </div>`;
}

/* ----- Premier lancement ----- */
function viewOnboarding() {
  const p = S.profile, st = ui.ob;
  const head = (n, t, sub) => `<div class="ob-step">Étape ${n} sur 4</div><h1>${t}</h1><p>${sub}</p>`;
  let body = "";
  if (st === 0) {
    body = `${head(1, "Bonjour !", "Mon Assiette compose tes menus de la semaine, fait ta liste de courses et suit ton poids et ton activité. Tout reste sur ton téléphone.")}
    <label class="field"><span>Ton prénom</span><input class="inp" data-f="name" value="${esc(p.name)}" autocomplete="given-name" placeholder="Ton prénom"></label>
    <button class="btn pri" data-a="ob" data-v="1">Continuer</button>`;
  } else if (st === 1) {
    body = `${head(2, "Qui mange à la maison ?", "Chacun a sa part selon son âge : les quantités des recettes et des courses sont calculées pour toute la table.")}
    ${peopleEditor()}
    <div class="actions"><button class="btn pri" data-a="ob" data-v="2">Continuer</button><button class="btn ghost" data-a="ob" data-v="0">Retour</button></div>`;
  } else if (st === 2) {
    body = `${head(3, "Ce qu'on évite", "Allergies ou simplement pas aimé : ces recettes ne sortiront pas. Tu pourras changer ça plus tard.")}
    ${exclEditor()}
    <div class="actions"><button class="btn pri" data-a="ob" data-v="3">Continuer</button><button class="btn ghost" data-a="ob" data-v="1">Retour</button></div>`;
  } else {
    body = `${head(4, "Ton objectif", "Facultatif. Pas de régime ni de calories : des assiettes équilibrées et un suivi en douceur.")}
    ${goalEditor(true)}
    <div class="actions"><button class="btn pri" data-a="obDone">C'est parti</button><button class="btn ghost" data-a="ob" data-v="2">Retour</button></div>`;
  }
  return `<div class="ob" style="padding-top:18px">${body}</div>`;
}
function peopleEditor() {
  const y = today().getFullYear();
  const years = [...Array(19)].map((_, i) => y - i);
  return S.people.map(p => {
    const child = isChild(p), a = ageOf(p);
    const kinds = p.me ? ["f", "m"] : ["f", "m", "g", "b"];
    return `<div class="card person">
      <div class="row">
        ${p.me ? `<div style="flex:1"><b>${esc(pname(p))}</b> <span class="small muted">(toi)</span></div>`
               : `<input class="inp" style="flex:1" data-f="pName" data-p="${p.id}" value="${esc(p.name || "")}" placeholder="${esc(pname(p))}" aria-label="Prénom">
                  <button class="btn-sm" data-a="pDel" data-p="${p.id}" aria-label="Retirer">${IC.x}</button>`}
      </div>
      <div class="pgrid">
        <select class="inp" data-f="pWho" data-p="${p.id}" aria-label="Femme, homme, fille ou garçon">${kinds.map(k => `<option value="${k}" ${p.who === k ? "selected" : ""}>${WHO_KIND[k]}</option>`).join("")}</select>
        ${child ? `<select class="inp" data-f="pBorn" data-p="${p.id}" aria-label="Année de naissance">${years.map(v => `<option value="${v}" ${p.born === v ? "selected" : ""}>${v} · ${y - v} an${y - v > 1 ? "s" : ""}</option>`).join("")}</select>`
                : `<select class="inp" data-f="pApp" data-p="${p.id}" aria-label="Appétit">${Object.entries(APPETITE).map(([k, v]) => `<option value="${k}" ${p.app === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select>`}
        ${child ? `<select class="inp" data-f="pApp" data-p="${p.id}" aria-label="Appétit" style="grid-column:1/-1">${Object.entries(APPETITE).map(([k, v]) => `<option value="${k}" ${p.app === k ? "selected" : ""}>${v[0]}</option>`).join("")}</select>` : ""}
      </div>
      <div class="small muted" style="margin:12px 0 2px">Semaine type à la maison</div>
      ${["l", "d"].map(m => `<div class="pres-row"><span class="pres-name small">${m === "l" ? "Midi" : "Soir"}</span>${ALLD.map(d => {
        const on = (p.home || defHome(p))[m].includes(d);
        return `<button class="dchip ${on ? "" : "off"}" data-a="homeT" data-p="${p.id}" data-m="${m}" data-d="${d}" aria-label="${m === "l" ? "midi" : "soir"} ${DAYS[d]} : ${on ? "à la maison" : "absent"}">${DAYS[d][0].toUpperCase()}</button>`;
      }).join("")}</div>`).join("")}
      <div class="small muted" style="margin-top:8px">${coef(p) ? `Sa part : <b>${nf2.format(coef(p))}</b> part de recette` : "Moins d'un an : repas à part"}${p.me && losing() ? " (allégée pour ton objectif)" : ""}${p.me && S.profile.pregnant ? " (grossesse ou allaitement)" : ""}${child && a != null ? ` · ${a} an${a > 1 ? "s" : ""}` : ""}</div>
    </div>`;
  }).join("") + `<button class="btn sec" data-a="pAdd">+ Ajouter quelqu'un</button>
  <p class="small muted" style="margin:10px 4px 0">Les quantités suivent les besoins moyens de chacun selon l'âge et le sexe (repères européens). Une part = un adulte moyen. La semaine type dit qui mange à la maison chaque midi et chaque soir (cantine, travail…) ; les exceptions se notent chaque semaine dans Menus.</p>`;
}
function exclEditor() {
  return `<div class="chips">${EXCLUSIONS.map(([k, l]) => `<button class="chip ${S.excl.includes(k) ? "on" : ""}" data-a="excl" data-v="${k}">${l}</button>`).join("")}</div>
  <p class="small muted">${allowed().length} recettes sur ${RECIPES.length} restent au menu.</p>`;
}
function goalEditor(ob) {
  const p = S.profile;
  return `<div class="card">
    <label class="field"><span>Ton poids aujourd'hui (kg)</span><input class="inp" data-f="start" inputmode="decimal" value="${p.start != null ? esc(nf.format(p.start)) : ""}" placeholder="ex. 68,5"></label>
    <label class="field"><span>Ton objectif (kg)</span><input class="inp" data-f="goal" inputmode="decimal" value="${p.goal != null ? esc(nf.format(p.goal)) : ""}" placeholder="facultatif"></label>
    <label class="field"><span>Ta taille (cm), pour vérifier que l'objectif reste sain</span><input class="inp" data-f="height" inputmode="numeric" value="${p.height || ""}" placeholder="ex. 165"></label>
    <div id="goalWarn">${goalWarning()}</div>
    <button class="toggle ${p.pregnant ? "on" : ""}" data-a="flag" data-v="pregnant"><span>Je suis enceinte ou j'allaite</span><span class="sw"></span></button>
  </div>`;
}
function goalWarning() {
  const p = S.profile;
  if (p.pregnant) return `<div class="msg">Enceinte ou allaitante, on ne vise pas de perte de poids : l'appli suit sans objectif. Parles-en à ta sage-femme ou ton médecin.</div>`;
  if (p.goal && p.height) {
    const min = Math.ceil(18.5 * (p.height / 100) ** 2 * 10) / 10;
    if (p.goal < min) return `<div class="msg warn">Cet objectif est sous le poids de santé pour ta taille. Vise au moins ${nf.format(min)} kg.</div>`;
  }
  if (p.goal && p.start && p.start - p.goal > 0) return `<div class="msg ok">Objectif : −${nf.format(p.start - p.goal)} kg. Le bon rythme : 0,25 à 0,75 kg par semaine.</div>`;
  return "";
}

/* ----- Aujourd'hui ----- */
function mealCard(s, label, extraClass) {
  const w = S.weeks[weekKey(s._wk)];
  if (s.rest && restSource(w, s)) {
    const src = restSource(w, s), r = BYID[src.id], wt = whoText(s, w);
    return `<button class="meal ${extraClass || ""}" data-a="openRest" data-wk="${s._wk}" data-si="${s._i}">
      <div class="art" style="background:var(--olive-soft);color:var(--olive)">${IC.leaf}</div>
      <div class="body"><div class="when">${label} · restes</div><div class="name">${esc(r.n)}</div>
      <div class="with">Cuisiné en plus la veille au soir, à réchauffer</div>
      <div class="meta"><span class="pill ok">0 min</span>${wt ? `<span class="pill warn">${esc(wt)}</span>` : ""}</div></div></button>`;
  }
  const r = BYID[s.id]; if (!r) return "";
  const c = CATS[r.c], wt = whoText(s, w), feeds = restLunch(w, s);
  return `<button class="meal ${extraClass || ""}" data-a="open" data-wk="${s._wk}" data-si="${s._i}">
    <div class="art" style="background:${tint(c.color, .14)};color:${c.color}">${catArt(r.c)}</div>
    <div class="body">
      <div class="when">${label}</div>
      <div class="name">${esc(r.n)}</div>
      <div class="with">${esc(r.sub)}</div>
      <div class="meta"><span class="pill">${IC.clock} ${r.t >= 60 ? Math.floor(r.t / 60) + " h " + (r.t % 60 ? pad(r.t % 60) : "") : r.t + " min"}</span><span class="pill catpill" style="color:${c.color}">${c.label}</span>${feeds ? '<span class="pill ok">+ midi de demain</span>' : ""}${wt ? `<span class="pill warn">${esc(wt)}</span>` : ""}</div>
    </div></button>`;
}
function slotsOf(off) {
  const w = getWeek(off, false); if (!w) return [];
  return w.slots.map((s, i) => Object.assign({}, s, { _wk: off, _i: i }));
}
function viewToday() {
  const t = today(), d = dow(t), p = S.profile;
  const w = getWeek(0, true);
  const todays = w ? slotsOf(0).filter(s => s.d === d && isActive(s, w)) : [];
  const lunch = todays.find(s => s.m === "l"), dinner = todays.find(s => s.m === "d");
  const tip = TIPS[(Math.floor(t / 864e5)) % TIPS.length];
  const stepsToday = S.steps[iso(t)];
  const goal = p.stepsGoal || 7000;
  const pct = Math.min(100, Math.round((stepsToday || 0) / goal * 100));
  const actsToday = S.acts.filter(a => a.d === iso(t));
  const ws = sortedWeights();
  const lastW = ws[ws.length - 1];
  const weighedThisWeek = ws.some(x => x.d >= weekKey(0));
  const isWeighDay = d === (p.weighDay || 0);
  let banners = "";
  if (isIOS() && !isStandalone()) banners += `<div class="banner">Pour garder tes données au chaud, installe l'appli : <b>Partager</b> puis <b>Sur l'écran d'accueil</b>.</div>`;
  const needBackup = (!S.lastExport && (S.weights.length >= 4 || Object.keys(S.steps).length >= 14)) || (S.lastExport && (t - fromIso(S.lastExport)) / 864e5 > 30);
  if (needBackup) banners += `<button class="banner" style="width:100%;text-align:left" data-a="tab" data-v="me">Pense à faire une sauvegarde de tes données : <b>Moi › Sauvegarder</b>.</button>`;

  return `<div class="top"><div><h1>Bonjour${p.name ? " " + esc(p.name) : ""}</h1><div class="sub">${fmtDate(t)}</div></div></div>
  ${banners}
  <div class="card tip"><b>Repère du jour</b><div style="margin-top:4px">${esc(tip)}</div></div>
  <div class="sec-title">Au menu</div>
  ${lunch ? mealCard(lunch, "Midi") : ""}
  ${dinner ? mealCard(dinner, "Dîner") : ""}
  ${!w ? `<div class="card empty">Pas encore de menus.<br><button class="btn pri" style="margin-top:12px" data-a="gen" data-v="0">Composer la semaine</button></div>` : !lunch && !dinner ? `<div class="card empty">Personne à la maison aujourd'hui.</div>` : ""}
  <div class="sec-title">Bouger</div>
  <div class="card">
    <div class="row between"><b>Pas aujourd'hui</b><span class="small muted">objectif ${nf0.format(goal)}</span></div>
    <div class="steps-input"><input data-f="stepsToday" inputmode="numeric" pattern="[0-9]*" placeholder="0" value="${stepsToday != null ? stepsToday : ""}" aria-label="Pas aujourd'hui"></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <p class="small muted" style="margin:8px 0 0">Le chiffre est dans l'app Santé de l'iPhone, rubrique Pas.</p>
    <div style="margin-top:14px"><b>Activité</b></div>
    <div class="chips" style="margin-top:8px">
      <button class="chip" data-a="act" data-v="yoga" data-m="20">Yoga 20 min</button>
      <button class="chip" data-a="act" data-v="yoga" data-m="45">Yoga 45 min</button>
      <button class="chip" data-a="act" data-v="marche" data-m="30">Marche 30 min</button>
      <button class="chip" data-a="actOther">Autre…</button>
    </div>
    ${actsToday.length ? `<div style="margin-top:10px">${actsToday.map(a => `<div class="list-item"><span>${ACT_TYPES[a.type] || "Activité"}</span><span class="it-q">${a.min} min</span><button class="btn-sm" data-a="actDel" data-v="${a.id}" aria-label="Supprimer">${IC.trash}</button></div>`).join("")}</div>` : ""}
    <div class="small muted" style="margin-top:10px">Cette semaine : <b>${weekActMin(0)} min</b> d'activité sur 150 conseillées.</div>
  </div>
  <div class="sec-title">Poids</div>
  <div class="card">
    ${isWeighDay && !weighedThisWeek ? `<div class="pill acc" style="margin-bottom:10px">C'est ton jour de pesée</div>` : ""}
    ${lastW ? `<div class="row between"><div><div class="big-num tnum">${nf.format(lastW.kg)} <small>kg</small></div><div class="small muted">dernière pesée, ${fmtDate(fromIso(lastW.d))}</div></div></div>` : `<p class="muted" style="margin-top:0">Pas encore de pesée.</p>`}
    <div class="row" style="margin-top:12px"><input class="inp" id="wIn" inputmode="decimal" placeholder="Poids du jour (kg)"><button class="btn-sm acc" style="min-height:48px" data-a="weigh">Noter</button></div>
  </div>`;
}

/* ----- Menus ----- */
function weekSeg() {
  return `<div class="seg"><button class="${ui.wk === 0 ? "on" : ""}" data-a="wk" data-v="0">Cette semaine</button><button class="${ui.wk === 1 ? "on" : ""}" data-a="wk" data-v="1">Semaine prochaine</button></div>`;
}
function viewMenus() {
  const off = ui.wk, wk = weekKey(off), w = getWeek(off, false), start = fromIso(wk);
  let body;
  if (!w) {
    body = `<div class="card empty"><p>La semaine du ${fmtDate(start)} n'est pas encore composée.</p><button class="btn pri" data-a="gen" data-v="${off}">Composer la semaine</button></div>`;
  } else {
    const st = weekStats(w), fishOk = S.excl.includes("poisson");
    const pills = [
      fishOk ? "" : `<span class="pill ${st.fish >= 2 && st.fat >= 1 ? "ok" : "warn"}">Poisson ${st.fish}${st.fat ? ", dont " + st.fat + " gras" : ""}</span>`,
      `<span class="pill ${st.leg >= 2 ? "ok" : "warn"}">Légumes secs ${st.leg}</span>`,
      `<span class="pill ${st.vr <= 2 ? "ok" : "warn"}">Viande rouge ${st.vr}</span>`
    ].join("");
    const all = slotsOf(off);
    const days = [0, 1, 2, 3, 4, 5, 6].map(d => {
      const date = addDays(start, d), isT = iso(date) === iso(today());
      const list = all.filter(s => s.d === d && isActive(s, w));
      return `<div class="day-label ${isT ? "today" : ""}"><span>${fmtDate(date)}</span>${isT ? "<span>aujourd'hui</span>" : ""}</div>
        ${list.length ? list.map(s => mealCard(s, s.m === "l" ? "Midi" : "Dîner")).join("") : `<div class="small muted" style="margin:0 4px 6px">Personne à la maison</div>`}`;
    }).join("");
    body = `${presenceCard(w, start)}<div class="card"><div class="small muted" style="margin-bottom:8px">Repères de la semaine (Manger Bouger)</div><div class="pills">${pills}</div></div>
      ${days}
      <div class="actions"><button class="btn sec" data-a="regen" data-v="${off}">${IC.swap} Composer une autre semaine</button></div>`;
  }
  return `<div class="top"><div><h1>Menus</h1><div class="sub">semaine du ${fmtShort(start)} au ${fmtShort(addDays(start, 6))}</div></div>
    <button class="btn-sm" data-a="library">Toutes les recettes</button></div>
    ${weekSeg()}${body}`;
}

function presenceCard(w, start) {
  const mode = ui.presMode || "j";
  const cell = (p, d) => {
    const l = isPresent(p, d, "l", w), dn = isPresent(p, d, "d", w);
    let on, txt;
    if (mode === "l") { on = l; txt = l ? IC.check : "–"; }
    else if (mode === "d") { on = dn; txt = dn ? IC.check : "–"; }
    else { on = l || dn; txt = l && dn ? IC.check : l ? "M" : dn ? "S" : "–"; }
    const lab = `${pname(p)} ${DAYS[d]} : midi ${l ? "à la maison" : "absent"}, soir ${dn ? "à la maison" : "absent"}`;
    return `<button class="dchip ${on ? "" : "off"} ${mode === "j" && on && !(l && dn) ? "half" : ""}" data-a="pres" data-p="${p.id}" data-d="${d}" aria-label="${esc(lab)}">${txt}</button>`;
  };
  return `<div class="card">
    <h3 style="margin-bottom:4px">Qui est là cette semaine ?</h3>
    <p class="small muted" style="margin:0 0 10px">Part de la semaine type de chacun (Moi › À table). Touche une case pour noter une absence ou un retour : les menus, les quantités et les courses suivent.</p>
    <div class="seg" style="margin-bottom:10px">${[["j", "Journée"], ["l", "Midi"], ["d", "Soir"]].map(([k, l]) => `<button class="${mode === k ? "on" : ""}" data-a="presMode" data-v="${k}">${l}</button>`).join("")}</div>
    <div class="pres-head"><span></span>${ALLD.map(d => `<span>${DAYS[d].slice(0, 2)}<br>${addDays(start, d).getDate()}</span>`).join("")}</div>
    ${S.people.map(p => `<div class="pres-row"><span class="pres-name">${esc(pname(p))}</span>${ALLD.map(d => cell(p, d)).join("")}</div>`).join("")}
    ${mode === "j" ? `<p class="small muted" style="margin:8px 0 0">M : là le midi seulement · S : là le soir seulement</p>` : ""}
  </div>`;
}

/* ----- Courses ----- */
function viewCourses() {
  const off = ui.wk, w = getWeek(off, false), start = fromIso(weekKey(off));
  const top = `<div class="top"><div><h1>Courses</h1><div class="sub">pour la semaine du ${fmtShort(start)}</div></div>${w ? `<button class="btn-sm" data-a="shareList">${IC.share} Partager</button>` : ""}</div>${weekSeg()}`;
  if (!w) return top + `<div class="card empty"><p>Compose d'abord les menus de cette semaine.</p><button class="btn pri" data-a="gen" data-v="${off}">Composer la semaine</button></div>`;
  const { items, placard } = shopping(w);
  const done = items.filter(it => w.checked[it.k]).length + w.extras.filter(e => e.done).length;
  const total = items.length + w.extras.length;
  const groups = RAYON_ORDER.map(r => {
    const list = items.filter(it => it.ray === r).sort((a, b) => a.n.localeCompare(b.n, "fr"));
    if (!list.length) return "";
    return `<div class="sec-title">${RAYONS[r]}</div><div class="card" style="padding:4px 16px">${list.map(it => {
      const q = shopQty(it), on = !!w.checked[it.k];
      return `<button class="list-item ${on ? "done" : ""}" data-a="chk" data-v="${esc(it.k)}"><span class="check">${IC.check}</span>
        <span style="min-width:0"><div class="it-name">${esc(it.n)}</div><div class="it-for">${esc([...it.for].join(", "))}</div></span>
        <span class="it-q">${esc(q.main)}${q.sub ? `<small>${esc(q.sub)}</small>` : ""}</span></button>`;
    }).join("")}</div>`;
  }).join("");
  const extras = `<div class="sec-title">En plus</div><div class="card" style="padding:4px 16px">
    ${w.extras.map(e => `<div class="list-item ${e.done ? "done" : ""}"><button class="row" style="flex:1;text-align:left" data-a="exChk" data-v="${e.id}"><span class="check">${IC.check}</span><span class="it-name">${esc(e.t)}</span></button><button class="btn-sm" data-a="exDel" data-v="${e.id}" aria-label="Supprimer">${IC.trash}</button></div>`).join("")}
    <div class="row" style="padding:10px 0"><input class="inp" id="exIn" placeholder="Fruits, lait, petit-déjeuner…" enterkeyhint="done"><button class="btn-sm acc" style="min-height:48px" data-a="exAdd">Ajouter</button></div></div>`;
  const plac = `<div class="sec-title">À avoir chez soi</div><div class="card"><button class="row between" style="width:100%" data-a="placard"><span>${placard.length} produits du placard à vérifier</span><span class="link">${ui.showPlacard ? "Masquer" : "Voir"}</span></button>
    ${ui.showPlacard ? `<p class="small" style="margin:10px 0 0">${placard.map(esc).join(" · ")}</p>` : ""}</div>`;
  return top + `<div class="card row between"><span><b>${done}</b> sur ${total} dans le panier</span>${done ? `<button class="btn-sm" data-a="unchk">Tout décocher</button>` : ""}</div>${groups}${extras}${plac}`;
}
function listText(w, off) {
  const { items, placard } = shopping(w);
  const lines = [`Courses, semaine du ${fmtShort(fromIso(weekKey(off)))}`];
  RAYON_ORDER.forEach(r => {
    const list = items.filter(it => it.ray === r && !w.checked[it.k]).sort((a, b) => a.n.localeCompare(b.n, "fr"));
    if (!list.length) return;
    lines.push("", RAYONS[r].toUpperCase());
    list.forEach(it => { const q = shopQty(it); lines.push(`- ${it.n} : ${q.main}${q.sub ? " (" + q.sub + ")" : ""}`); });
  });
  const ex = w.extras.filter(e => !e.done);
  if (ex.length) { lines.push("", "EN PLUS"); ex.forEach(e => lines.push("- " + e.t)); }
  lines.push("", "À vérifier au placard : " + placard.join(", "));
  return lines.join("\n");
}

/* ----- Suivi ----- */
function weightChart(ws) {
  const W = 320, H = 170, P = { l: 34, r: 10, t: 12, b: 22 };
  const pts = trendSeries(ws).slice(-26);
  if (pts.length < 2) return "";
  const x0 = fromIso(pts[0].d), x1 = fromIso(pts[pts.length - 1].d), span = Math.max(1, (x1 - x0) / 864e5);
  let lo = Math.min(...pts.map(p => p.kg)), hi = Math.max(...pts.map(p => p.kg));
  const g = S.profile.goal; if (g && !S.profile.pregnant && g > lo - 3) lo = Math.min(lo, g);
  lo = Math.floor(lo - 0.5); hi = Math.ceil(hi + 0.5);
  const X = d => P.l + (fromIso(d) - x0) / 864e5 / span * (W - P.l - P.r);
  const Y = v => P.t + (hi - v) / (hi - lo) * (H - P.t - P.b);
  const grid = [lo, (lo + hi) / 2, hi].map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--line)"/><text x="${P.l - 6}" y="${Y(v) + 4}" text-anchor="end" font-size="10" fill="var(--muted)">${nf.format(v)}</text>`).join("");
  const goal = g && !S.profile.pregnant && g >= lo ? `<line x1="${P.l}" x2="${W - P.r}" y1="${Y(g)}" y2="${Y(g)}" stroke="var(--olive)" stroke-dasharray="4 4"/><text x="${W - P.r}" y="${Y(g) - 4}" text-anchor="end" font-size="10" fill="var(--olive)">objectif</text>` : "";
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.d).toFixed(1)},${Y(p.t).toFixed(1)}`).join(" ");
  const dots = pts.map(p => `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(p.kg).toFixed(1)}" r="3" fill="var(--muted)" opacity=".55"/>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Courbe du poids">${grid}${goal}${dots}<path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="${P.l}" y="${H - 6}" font-size="10" fill="var(--muted)">${fmtShort(x0)}</text><text x="${W - P.r}" y="${H - 6}" font-size="10" fill="var(--muted)" text-anchor="end">${fmtShort(x1)}</text></svg>`;
}
function stepsChart() {
  const W = 320, H = 130, P = { l: 6, r: 6, t: 10, b: 18 }, n = 14, goal = S.profile.stepsGoal || 7000;
  const days = [...Array(n)].map((_, i) => addDays(today(), i - n + 1));
  const vals = days.map(d => S.steps[iso(d)] || 0);
  const max = Math.max(goal * 1.2, ...vals);
  const bw = (W - P.l - P.r) / n;
  const Y = v => P.t + (1 - v / max) * (H - P.t - P.b);
  const bars = days.map((d, i) => { const v = vals[i]; const y = Y(v); return `<rect x="${(P.l + i * bw + 3).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 6).toFixed(1)}" height="${(H - P.b - y).toFixed(1)}" rx="3" fill="${v >= goal ? "var(--olive)" : "var(--accent)"}" opacity="${v ? 1 : .15}"/>
    <text x="${(P.l + i * bw + bw / 2).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-size="9" fill="var(--muted)">${DAYS[dow(d)][0].toUpperCase()}</text>`; }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Pas des 14 derniers jours"><line x1="${P.l}" x2="${W - P.r}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--olive)" stroke-dasharray="4 4"/>${bars}</svg>`;
}
function viewSuivi() {
  const ws = sortedWeights(), p = S.profile, ser = trendSeries(ws), last = ser.length ? ser[ser.length - 1].t : null;
  const startKg = p.start || (ws[0] && ws[0].kg) || null, m = weightMessage(ws);
  const lost = startKg && last ? startKg - last : null;
  const toGo = p.goal && last && !p.pregnant ? last - p.goal : null;
  const avg7 = stepsAvg(7), goal = p.stepsGoal || 7000;
  const actW = weekActMin(0), actPrev = weekActMin(-1);
  const recentActs = S.acts.slice().sort((a, b) => a.d < b.d ? 1 : -1).slice(0, 6);
  return `<div class="top"><div><h1>Suivi</h1><div class="sub">poids, pas et activité</div></div></div>
  <div class="card">
    <div class="row between"><h2 style="margin:0">Poids</h2>${last ? `<span class="pill">tendance ${nf.format(last)} kg</span>` : ""}</div>
    ${ws.length >= 2 ? weightChart(ws) : `<p class="muted">La courbe apparaît dès la deuxième pesée.</p>`}
    <div class="stats">
      <div class="stat"><b>${startKg ? nf.format(startKg) : "–"}</b><span>départ</span></div>
      <div class="stat"><b>${lost != null ? (lost >= 0 ? "−" : "+") + nf.format(Math.abs(lost)) : "–"}</b><span>depuis le début</span></div>
      <div class="stat"><b>${toGo != null ? (toGo > 0 ? nf.format(toGo) : "0") : "–"}</b><span>jusqu'à l'objectif</span></div>
    </div>
    <div class="msg ${m.cls}">${esc(m.t)}</div>
    ${ws.length ? `<details style="margin-top:12px"><summary class="link">Toutes les pesées (${ws.length})</summary>${ws.slice().reverse().map(x => `<div class="list-item"><span>${fmtDate(fromIso(x.d))}</span><span class="it-q">${nf.format(x.kg)} kg</span><button class="btn-sm" data-a="wDel" data-v="${x.d}" aria-label="Supprimer">${IC.trash}</button></div>`).join("")}</details>` : ""}
  </div>
  <div class="card">
    <div class="row between"><h2 style="margin:0">Pas</h2><span class="pill ${avg7 && avg7 >= goal ? "ok" : ""}">${avg7 ? nf0.format(avg7) + " par jour" : "pas encore de données"}</span></div>
    ${stepsChart()}
    <p class="small muted" style="margin:6px 0 0">Moyenne sur 7 jours. Objectif ${nf0.format(goal)} : les bénéfices pour la santé augmentent jusqu'à 8 000 à 10 000 pas par jour avant 60 ans.</p>
  </div>
  <div class="card">
    <div class="row between"><h2 style="margin:0">Activité</h2><span class="pill ${actW >= 150 ? "ok" : ""}">${actW} min cette semaine</span></div>
    <div class="bar" style="margin-top:6px"><i style="width:${Math.min(100, actW / 150 * 100)}%"></i></div>
    <p class="small muted" style="margin:8px 0 0">Repère : 150 minutes par semaine (OMS). Semaine dernière : ${actPrev} min.</p>
    ${recentActs.length ? recentActs.map(a => `<div class="list-item"><span>${ACT_TYPES[a.type] || "Activité"} · <span class="muted">${fmtShort(fromIso(a.d))}</span></span><span class="it-q">${a.min} min</span><button class="btn-sm" data-a="actDel" data-v="${a.id}" aria-label="Supprimer">${IC.trash}</button></div>`).join("") : ""}
  </div>`;
}

/* ----- Moi ----- */
function viewMoi() {
  const p = S.profile, m = S.meals;
  const tg = (key, label, on, sub) => `<button class="toggle ${on ? "on" : ""}" data-a="meal" data-v="${key}"><span>${label}${sub ? `<div class="small muted">${sub}</div>` : ""}</span><span class="sw"></span></button>`;
  return `<div class="top"><div><h1>Moi</h1><div class="sub">réglages et sauvegarde</div></div></div>
  <div class="card"><label class="field" style="margin:0"><span>Prénom</span><input class="inp" data-f="name" value="${esc(p.name)}"></label></div>
  <div class="sec-title">À table</div>${peopleEditor()}
  <div class="sec-title">Repas à prévoir</div>
  <div class="card" style="padding:4px 16px">
    <div class="toggle"><span>Midi et soir, selon la semaine type de chacun<div class="small muted">Un repas est prévu dès que quelqu'un mange à la maison.</div></span></div>
    ${tg("leftovers", "Cuisiner le soir pour le midi du lendemain", m.leftovers, "Du lundi au jeudi soir, quand quelqu'un mange à la maison le lendemain midi et que le plat se garde.")}
  </div>
  <div class="sec-title">On évite</div><div class="card">${exclEditor()}</div>
  <div class="sec-title">Objectif</div>${goalEditor(false)}
  <div class="card">
    <label class="field"><span>Jour de pesée</span><select class="inp" data-f="weighDay">${DAYS.map((d, i) => `<option value="${i}" ${i === (p.weighDay || 0) ? "selected" : ""}>${d}</option>`).join("")}</select></label>
    <label class="field" style="margin:0"><span>Objectif de pas par jour</span><input class="inp" data-f="stepsGoal" inputmode="numeric" value="${p.stepsGoal || 7000}"></label>
  </div>
  <div class="sec-title">Sauvegarde</div>
  <div class="card stack">
    <p style="margin:0">Tes données ne sont que sur ce téléphone. Une sauvegarde de temps en temps (dans Fichiers ou par message) évite de tout perdre.</p>
    <p class="small muted" style="margin:0">${S.lastExport ? "Dernière sauvegarde : " + fmtDate(fromIso(S.lastExport)) : "Aucune sauvegarde pour l'instant."}</p>
    <button class="btn pri" data-a="export">Sauvegarder mes données</button>
    <label class="btn sec" style="position:relative">Restaurer une sauvegarde<input type="file" accept="application/json,.json" data-f="import" style="position:absolute;opacity:0;width:1px;height:1px;pointer-events:none"></label>
  </div>
  <div class="sec-title">À propos</div>
  <div class="card small">
    <p style="margin-top:0">Mon Assiette, version ${VERSION}. ${RECIPES.length} recettes, imaginées par un chef.</p>
    <p>Les repères viennent de Santé publique France (Manger Bouger) et de l'OMS pour l'activité. Cette appli ne remplace pas l'avis d'un médecin ou d'un diététicien.</p>
    <button class="btn danger" data-a="reset">Tout effacer</button>
  </div>`;
}

/* ----- Feuilles ----- */
function openSheet(s) { ui.sheet = s; renderSheet(); }
function closeSheet() { ui.sheet = null; renderSheet(); }
function renderSheet() {
  const L = $("#layer");
  if (!ui.sheet) { L.innerHTML = ""; document.body.style.overflow = ""; return; }
  document.body.style.overflow = "hidden";
  const s = ui.sheet;
  let inner = "", full = true, title = "";
  if (s.type === "recipe") inner = sheetRecipe(s);
  else if (s.type === "rest") inner = sheetRest(s);
  else if (s.type === "swap") { inner = sheetSwap(s); title = "Changer de plat"; }
  else if (s.type === "library") { inner = sheetLibrary(); title = "Toutes les recettes"; }
  else if (s.type === "confirm") { inner = `<div class="sheet-in" style="padding-top:20px"><p style="font-size:1.05rem">${esc(s.text)}</p><div class="actions"><button class="btn ${s.danger ? "danger" : "pri"}" data-a="confirmOk">${esc(s.ok)}</button><button class="btn sec" data-a="close">Annuler</button></div></div>`; full = false; }
  else if (s.type === "act") { inner = sheetAct(); title = "Ajouter une activité"; full = false; }
  const prev = L.querySelector(".sheet"), keep = prev ? prev.scrollTop : 0, na = prev && s.keepScroll ? " noanim" : "";
  L.innerHTML = `<div class="sheet-wrap${na}" data-a="backdrop"><div class="sheet ${full ? "full" : ""}${na}" role="dialog" aria-modal="true">
    <div class="sheet-bar"><button class="link" data-a="close">Fermer</button><span class="t">${esc(title)}</span><span style="width:52px"></span></div>${inner}</div></div>`;
  if (s.keepScroll) L.querySelector(".sheet").scrollTop = keep;
  s.keepScroll = false;
}
function sheetRecipe(s) {
  const slot = s.wk != null ? S.weeks[weekKey(s.wk)].slots[s.si] : null;
  const r = BYID[slot ? slot.id : s.id], c = CATS[r.c];
  const wk = slot ? S.weeks[weekKey(s.wk)] : null;
  const parts = slot ? slotParts(slot, wk) : baseParts();
  const qParts = parts > 0 ? parts : 1;
  const present = slot ? presentPeople(slot, wk) : S.people;
  const ing = r.i.filter(i => i[3] !== "P" && i[2]), pl = r.i.filter(i => i[3] === "P" || !i[2]);
  const date = slot ? addDays(fromIso(weekKey(s.wk)), slot.d) : null;
  const nextL = slot && slot.m === "d" && slot.d <= 3 ? slotAt(wk, slot.d + 1, "l") : null;
  const canRest = nextL && isActive(nextL, wk) && r.r && isActive(slot, wk);
  const feeds = slot ? restLunch(wk, slot) : null;
  const alg = allergensOf(r);
  return `<div class="sheet-in">
    <div class="hero" style="background:linear-gradient(135deg,${c.color},${tint(c.color, .75)})">
      <svg class="pat" width="100%" height="100%"><defs><pattern id="dots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="#fff"/></pattern></defs><rect width="100%" height="100%" fill="url(#dots)"/></svg>
      <svg class="big" viewBox="0 0 64 64">${catArt(r.c, "#fff", c.color).replace(/^<svg[^>]*>|<\/svg>$/g, "")}</svg>
      <span class="badge">${c.label}</span>
    </div>
    ${date ? `<div class="small muted cap" style="margin-bottom:4px">${fmtDate(date)} · ${slot.m === "l" ? "midi" : "dîner"}</div>` : ""}
    <h2 class="r-title">${esc(r.n)}</h2>
    <div class="r-sub">${esc(r.sub)}</div>
    <div class="facts">
      <div class="fact"><b>${r.t >= 60 ? Math.floor(r.t / 60) + " h" + (r.t % 60 ? " " + pad(r.t % 60) : "") : r.t + " min"}</b><span>en tout</span></div>
      <div class="fact"><b>${r.diff}</b><span>difficulté</span></div>
      <div class="fact"><b>${parts > 0 ? frac(parts) : "0"}</b><span>parts</span></div>
    </div>
    ${slot && parts <= 0 ? `<div class="msg warn" style="margin-bottom:12px">Personne à table pour ce repas : il n'est pas dans les courses. Quantités ci-dessous pour 1 part.</div>` : ""}
    <div class="part">${IC.leaf}<div><b>Ta part</b><div>${esc(r.p)}</div></div></div>

    <div class="sec-title">Ingrédients</div>
    <div class="card">
      ${slot ? `<div class="small muted" style="margin-bottom:6px">À table pour ce ${slot.m === "l" ? "midi" : "soir"}</div>
        <div class="chips">${S.people.map(p => `<button class="chip ${present.includes(p) ? "on" : ""}" data-a="who" data-p="${p.id}">${esc(pname(p))}</button>`).join("")}</div>
        <div class="row between" style="margin:12px 0 8px"><span>Invités${slot.x ? ` : <b>${slot.x}</b>` : ""}</span>
        <div class="stepper"><button data-a="guests" data-v="-1" aria-label="Un invité de moins">−</button><button data-a="guests" data-v="1" aria-label="Un invité de plus">+</button></div></div>` : ""}
      <div class="small muted" style="margin-bottom:8px">${present.map(p => `${esc(pname(p))} ${nf2.format(coef(p))}`).join(" · ")}${slot && slot.x ? ` · invités ${slot.x}` : ""}${feeds ? ` · midi de demain : ${presentPeople(feeds, wk).map(p => `${esc(pname(p))} ${nf2.format(coef(p))}`).join(", ")}` : ""} = <b>${frac(qParts)} parts</b></div>
      ${ing.map(([n, q, u]) => `<div class="ing"><span class="q">${esc(recQty(n, q, u, qParts))}</span><span>${esc(n)}</span></div>`).join("")}
      <div class="placard"><b>À avoir chez soi :</b> ${pl.map(i => esc(i[0])).join(", ")}, sel, poivre.</div>
    </div>
    <div class="sec-title">Ustensiles</div>
    <div class="pills">${r.u.map(u => `<span class="pill">${esc(u)}</span>`).join("")}</div>
    <div class="sec-title">Préparation</div>
    <div class="card">${r.s.map(([t, x], i) => `<div class="step"><span class="n">${i + 1}</span><div><div class="st">${esc(t)}</div><div>${esc(x)}</div></div></div>`).join("")}</div>
    <div class="tip"><b>L'astuce du chef</b><div style="margin-top:4px">${esc(r.tip)}</div></div>
    ${alg.length ? `<p class="small muted">Allergènes : ${alg.join(", ")}.</p>` : ""}
    ${slot ? `<div class="actions">
      ${canRest ? `<button class="toggle ${feeds ? "on" : ""}" data-a="restToggle"><span>Cuisiner aussi pour le midi de demain<div class="small muted">${esc(presentPeople(nextL, wk).map(pname).join(", "))} : les restes, réchauffés</div></span><span class="sw"></span></button>` : ""}
      <button class="btn sec" data-a="swapOpen">${IC.swap} Changer de plat</button>
      ${parts > 0 ? `<button class="btn sec" data-a="nobody">Personne à la maison pour ce repas</button>` : ""}
    </div>` : ""}
  </div>`;
}
function sheetRest(s) {
  const w = S.weeks[weekKey(s.wk)], slot = w.slots[s.si], src = restSource(w, slot);
  if (!src) return `<div class="sheet-in"><p>Plus de restes prévus pour ce midi.</p></div>`;
  const r = BYID[src.id], c = CATS[r.c], date = addDays(fromIso(weekKey(s.wk)), slot.d), present = presentPeople(slot, w);
  return `<div class="sheet-in">
    <div class="small muted cap" style="margin-bottom:4px">${fmtDate(date)} · midi</div>
    <h2 class="r-title">Restes : ${esc(r.n)}</h2>
    <div class="r-sub">Cuisiné en plus la veille au soir (${DAYS[src.d]}).</div>
    <div class="part" style="margin-top:14px">${IC.leaf}<div><b>À réchauffer</b><div>Une seule fois, bien chaud à cœur, dans une assiette ou un plat en verre.</div></div></div>
    <div class="sec-title">À table pour ce midi</div>
    <div class="card"><div class="chips">${S.people.map(p => `<button class="chip ${present.includes(p) ? "on" : ""}" data-a="who" data-p="${p.id}">${esc(pname(p))}</button>`).join("")}</div>
      <p class="small muted" style="margin:10px 0 0">Les quantités du dîner de la veille comptent ces parts en plus.</p></div>
    <div class="actions">
      <button class="btn sec" data-a="openSlot" data-si="${w.slots.indexOf(src)}">Voir la recette</button>
      <button class="btn sec" data-a="restOff">Cuisiner autre chose ce midi</button>
    </div>
  </div>`;
}
function sheetSwap(s) {
  const w = S.weeks[weekKey(s.wk)], slot = w.slots[s.si], cur = BYID[slot.id];
  const inWeek = new Set(w.slots.map(x => x.id));
  const cands = allowed().filter(r => !inWeek.has(r.id));
  const same = cands.filter(r => r.c === cur.c), other = cands.filter(r => r.c !== cur.c).sort((a, b) => a.c.localeCompare(b.c) || a.n.localeCompare(b.n, "fr"));
  const item = r => `<button class="list-item" data-a="swapTo" data-v="${r.id}"><span class="art" style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:${tint(CATS[r.c].color, .14)};color:${CATS[r.c].color};flex:none">${catArt(r.c).replace("<svg ", '<svg width="30" height="30" ')}</span>
    <span style="min-width:0"><div class="it-name">${esc(r.n)}</div><div class="it-for">${esc(r.sub)} · ${r.t} min</div></span></button>`;
  return `<div class="sheet-in">
    <p class="muted" style="margin-top:0">À la place de <b>${esc(cur.n)}</b>.</p>
    ${same.length ? `<div class="sec-title">${CATS[cur.c].label}</div><div class="card" style="padding:4px 16px">${same.map(item).join("")}</div>` : ""}
    <div class="sec-title">Autres idées</div><div class="card" style="padding:4px 16px">${other.map(item).join("")}</div>
  </div>`;
}
function sheetLibrary() {
  const list = allowed();
  return `<div class="sheet-in">${Object.keys(CATS).map(c => {
    const rs = list.filter(r => r.c === c); if (!rs.length) return "";
    return `<div class="sec-title">${CATS[c].label}</div><div class="card" style="padding:4px 16px">${rs.map(r => `<button class="list-item" data-a="openId" data-v="${r.id}"><span style="width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:${tint(CATS[c].color, .14)};color:${CATS[c].color};flex:none">${catArt(c).replace("<svg ", '<svg width="30" height="30" ')}</span><span style="min-width:0"><div class="it-name">${esc(r.n)}</div><div class="it-for">${esc(r.sub)} · ${r.t} min</div></span></button>`).join("")}</div>`;
  }).join("")}</div>`;
}
function sheetAct() {
  return `<div class="sheet-in">
    <label class="field"><span>Activité</span><select class="inp" id="actType">${Object.entries(ACT_TYPES).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select></label>
    <label class="field"><span>Durée (minutes)</span><input class="inp" id="actMin" inputmode="numeric" value="30"></label>
    <label class="field"><span>Jour</span><input class="inp" id="actDay" type="date" value="${iso(today())}" max="${iso(today())}"></label>
    <button class="btn pri" data-a="actSave">Ajouter</button></div>`;
}
function ask(text, ok, fn, danger) { openSheet({ type: "confirm", text, ok, fn, danger }); }

/* ---------- Actions ---------- */
const A = {
  tab(el) { ui.tab = el.dataset.v; ui.sheet = null; render(); window.scrollTo(0, 0); },
  skipInstall() { sessionStorage.setItem("skipInstall", "1"); render(); },
  ob(el) {
    const v = +el.dataset.v;
    if (ui.ob === 0 && v === 1 && !S.profile.name.trim()) { toast("Écris ton prénom"); return; }
    ui.ob = v; save(); render(); window.scrollTo(0, 0);
  },
  obDone() {
    const p = S.profile;
    if (p.goal && p.height && p.goal < 18.5 * (p.height / 100) ** 2 && !p.pregnant) { toast("Ajuste ton objectif"); return; }
    S.onboarded = true;
    if (p.start && !S.weights.length) S.weights.push({ d: iso(today()), kg: p.start });
    getWeek(0, true);
    if (dow(today()) >= 4) getWeek(1, true);
    save(); ui.tab = "today"; render(); window.scrollTo(0, 0);
  },
  pAdd() {
    if (S.people.length >= 12) return;
    const p = { id: uid(), name: "", who: "g", born: today().getFullYear() - 8, app: "n" }; p.home = defHome(p);
    S.people.push(p); refreshWeeks(); save(); render();
  },
  pDel(el) {
    const p = S.people.find(x => x.id === el.dataset.p); if (!p || p.me) return;
    ask(`Retirer ${pname(p)} de la table ?`, "Retirer", () => {
      S.people = S.people.filter(x => x.id !== p.id);
      Object.values(S.weeks).forEach(w => { if (w.pres) delete w.pres[p.id]; });
      refreshWeeks(); save();
    }, true);
  },
  presMode(el) { ui.presMode = el.dataset.v; render(); },
  pres(el) {
    const w = getWeek(ui.wk, false); if (!w) return;
    const p = S.people.find(x => x.id === el.dataset.p), d = +el.dataset.d, mode = ui.presMode || "j";
    if (!p) return;
    if (mode === "j") { const both = isPresent(p, d, "l", w) && isPresent(p, d, "d", w); setPresent(w, p, d, "l", !both); setPresent(w, p, d, "d", !both); }
    else setPresent(w, p, d, mode, !isPresent(p, d, mode, w));
    normalize(w); save(); render();
  },
  homeT(el) {
    const p = S.people.find(x => x.id === el.dataset.p); if (!p) return;
    const m = el.dataset.m, d = +el.dataset.d; p.home = p.home || defHome(p);
    const arr = p.home[m], i = arr.indexOf(d); if (i >= 0) arr.splice(i, 1); else arr.push(d);
    refreshWeeks(); save(); render();
  },
  who(el) {
    const s = ui.sheet, w = S.weeks[weekKey(s.wk)], slot = w.slots[s.si], p = S.people.find(x => x.id === el.dataset.p);
    if (!p) return;
    setPresent(w, p, slot.d, slot.m, !isPresent(p, slot.d, slot.m, w));
    normalize(w); save(); s.keepScroll = true; render();
  },
  nobody() {
    const s = ui.sheet, w = S.weeks[weekKey(s.wk)], slot = w.slots[s.si];
    S.people.forEach(p => setPresent(w, p, slot.d, slot.m, false)); slot.x = 0;
    normalize(w); save(); closeSheet(); render(); toast("Repas retiré des courses");
  },
  restToggle() {
    const s = ui.sheet, w = S.weeks[weekKey(s.wk)], slot = w.slots[s.si], l = slotAt(w, slot.d + 1, "l");
    if (!l) return;
    l.rest = !restLunch(w, slot);
    normalize(w); save(); s.keepScroll = true; render();
  },
  restOff() {
    const s = ui.sheet, w = S.weeks[weekKey(s.wk)], slot = w.slots[s.si];
    slot.rest = false; if (!slot.id) slot.id = pickOne(w, slot);
    save(); ui.sheet = { type: "recipe", wk: s.wk, si: s.si }; render();
  },
  openRest(el) { openSheet({ type: "rest", wk: +el.dataset.wk, si: +el.dataset.si }); },
  openSlot(el) { openSheet({ type: "recipe", wk: ui.sheet.wk, si: +el.dataset.si }); },
  excl(el) { const k = el.dataset.v, i = S.excl.indexOf(k); if (i >= 0) S.excl.splice(i, 1); else S.excl.push(k); save(); render(); },
  flag(el) { S.profile[el.dataset.v] = !S.profile[el.dataset.v]; save(); render(); },
  meal(el) {
    const k = el.dataset.v; S.meals[k] = !S.meals[k]; save();
    if (k === "leftovers") { [0, 1].forEach(o => { const w = getWeek(o, false); if (w) { w.slots.forEach(sl => { if (sl.m === "l" && sl.d >= 1 && sl.d <= 4) sl.rest = S.meals.leftovers; }); normalize(w); } }); save(); }
    render();
  },
  wk(el) { ui.wk = +el.dataset.v; render(); },
  gen(el) { getWeek(+el.dataset.v, true); render(); },
  regen(el) {
    const off = +el.dataset.v;
    ask("Composer une autre semaine ? Les menus et la liste de courses de cette semaine seront remplacés.", "Composer", () => {
      const old = S.weeks[weekKey(off)], nw = generateWeek(weekKey(off), old);
      S.weeks[weekKey(off)] = nw; save(); toast("Nouvelle semaine composée");
    });
  },
  open(el) { openSheet({ type: "recipe", wk: +el.dataset.wk, si: +el.dataset.si }); },
  openId(el) { openSheet({ type: "recipe", id: el.dataset.v }); },
  library() { openSheet({ type: "library" }); },
  close() { closeSheet(); },
  backdrop(el, e) { if (e.target === el) closeSheet(); },
  guests(el) {
    const s = ui.sheet, slot = S.weeks[weekKey(s.wk)].slots[s.si];
    const nx = (slot.x || 0) + +el.dataset.v;
    if (nx < 0 || nx > 10) return;
    slot.x = nx; save(); s.keepScroll = true; render();
  },
  swapOpen() { const s = ui.sheet; openSheet({ type: "swap", wk: s.wk, si: s.si }); },
  swapTo(el) {
    const s = ui.sheet, slot = S.weeks[weekKey(s.wk)].slots[s.si];
    const w = S.weeks[weekKey(s.wk)];
    slot.id = el.dataset.v; slot.rest = false;
    normalize(w); save(); ui.sheet = { type: "recipe", wk: s.wk, si: s.si }; render(); toast("Plat changé");
  },
  chk(el) { const w = getWeek(ui.wk, false), k = el.dataset.v; if (w.checked[k]) delete w.checked[k]; else w.checked[k] = true; save(); render(); },
  unchk() { const w = getWeek(ui.wk, false); w.checked = {}; w.extras.forEach(e => e.done = false); save(); render(); },
  exAdd() { const inp = $("#exIn"), t = inp.value.trim(); if (!t) return; getWeek(ui.wk, false).extras.push({ id: uid(), t: t.slice(0, 80), done: false }); save(); render(); setTimeout(() => { const i = $("#exIn"); if (i) i.focus(); }, 30); },
  exChk(el) { const e = getWeek(ui.wk, false).extras.find(x => x.id === el.dataset.v); if (e) { e.done = !e.done; save(); render(); } },
  exDel(el) { const w = getWeek(ui.wk, false); w.extras = w.extras.filter(x => x.id !== el.dataset.v); save(); render(); },
  placard() { ui.showPlacard = !ui.showPlacard; render(); },
  async shareList() {
    const w = getWeek(ui.wk, false), text = listText(w, ui.wk);
    try {
      if (navigator.share) { await navigator.share({ title: "Liste de courses", text }); return; }
      await navigator.clipboard.writeText(text); toast("Liste copiée");
    } catch (e) { if (e && e.name !== "AbortError") toast("Partage impossible"); }
  },
  act(el) { addAct(el.dataset.v, +el.dataset.m, iso(today())); },
  actOther() { openSheet({ type: "act" }); },
  actSave() {
    const min = Math.round(num($("#actMin").value) || 0), d = $("#actDay").value || iso(today());
    if (min < 1 || min > 600) { toast("Durée entre 1 et 600 minutes"); return; }
    closeSheet(); addAct($("#actType") ? $("#actType").value : "autre", min, d);
  },
  actDel(el) { S.acts = S.acts.filter(a => a.id !== el.dataset.v); save(); render(); },
  weigh() {
    const v = num($("#wIn").value);
    if (v == null || v < 30 || v > 250) { toast("Poids entre 30 et 250 kg"); return; }
    const d = iso(today()); S.weights = S.weights.filter(x => x.d !== d); S.weights.push({ d, kg: Math.round(v * 10) / 10 });
    if (!S.profile.start) S.profile.start = Math.round(v * 10) / 10;
    save(); render(); toast("Pesée notée");
  },
  wDel(el) { const d = el.dataset.v; ask(`Supprimer la pesée du ${fmtDate(fromIso(d))} ?`, "Supprimer", () => { S.weights = S.weights.filter(x => x.d !== d); save(); }, true); },
  confirmOk() { const fn = ui.sheet && ui.sheet.fn; closeSheet(); if (fn) fn(); render(); },
  async export() {
    const data = JSON.stringify({ app: "Mon Assiette", version: VERSION, date: new Date().toISOString(), data: S }, null, 1);
    const name = `mon-assiette-${iso(today())}.json`;
    try {
      const file = new File([data], name, { type: "application/json" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: "Sauvegarde Mon Assiette" }); }
      else { const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
      S.lastExport = iso(today()); save(); render(); toast("Sauvegarde prête");
    } catch (e) { if (e && e.name !== "AbortError") toast("Sauvegarde impossible"); }
  },
  reset() { ask("Tout effacer ? Menus, pesées, pas et réglages disparaîtront de ce téléphone.", "Tout effacer", () => { localStorage.removeItem(KEY); S = defaults(); ui.ob = 0; ui.tab = "today"; }, true); }
};
function refreshWeeks() { [0, 1].forEach(o => { const w = S.weeks[weekKey(o)]; if (w && w.slots) normalize(w); }); }
function addAct(type, min, d) {
  S.acts.push({ id: uid(), d, type, min }); save(); render();
  toast(`${ACT_TYPES[type] || "Activité"} : ${min} min notées`);
}

document.addEventListener("click", e => {
  const el = e.target.closest("[data-a]");
  if (!el) return;
  const fn = A[el.dataset.a];
  if (fn) fn(el, e);
});
document.addEventListener("change", e => {
  const el = e.target, f = el.dataset && el.dataset.f;
  if (!f) return;
  const p = S.profile;
  if (f === "name") { p.name = el.value.trim().slice(0, 30); save(); if (S.onboarded) render(); return; }
  if (f === "pName" || f === "pWho" || f === "pBorn" || f === "pApp") {
    const pp = S.people.find(x => x.id === el.dataset.p); if (!pp) return;
    if (f === "pName") { pp.name = el.value.trim().slice(0, 24); save(); render(); return; }
    if (f === "pWho") { const wasChild = isChild(pp); pp.who = el.value; if (isChild(pp) && !pp.born) pp.born = today().getFullYear() - 8; if (wasChild !== isChild(pp)) pp.home = defHome(pp); refreshWeeks(); }
    if (f === "pBorn") pp.born = +el.value;
    if (f === "pApp") pp.app = el.value;
    refreshWeeks();
    save(); render(); return;
  }
  if (f === "start" || f === "goal") { const v = num(el.value); p[f] = v && v >= 30 && v <= 250 ? Math.round(v * 10) / 10 : null; save(); const g = $("#goalWarn"); if (g) g.innerHTML = goalWarning(); return; }
  if (f === "height") { const v = num(el.value); p.height = v && v >= 120 && v <= 220 ? Math.round(v) : null; save(); const g = $("#goalWarn"); if (g) g.innerHTML = goalWarning(); return; }
  if (f === "weighDay") { p.weighDay = +el.value; save(); return; }
  if (f === "stepsGoal") { const v = num(el.value); p.stepsGoal = v && v >= 1000 && v <= 30000 ? Math.round(v) : 7000; save(); return; }
  if (f === "stepsToday") {
    const v = num(el.value), d = iso(today());
    if (v == null || el.value.trim() === "") delete S.steps[d];
    else if (v >= 0 && v <= 100000) S.steps[d] = Math.round(v);
    save(); render(); return;
  }
  if (f === "import") {
    const file = el.files && el.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const j = JSON.parse(rd.result), d = j && j.data;
        if (!d || !d.profile || !Array.isArray(d.weights)) throw new Error("format");
        ask(`Restaurer la sauvegarde du ${j.date ? fmtDate(new Date(j.date)) : "fichier choisi"} ? Ce qui est sur le téléphone sera remplacé.`, "Restaurer", () => {
          localStorage.setItem(KEY, JSON.stringify(d)); S = load(); S.onboarded = true; save(); toast("Sauvegarde restaurée");
        });
      } catch (err) { toast("Ce fichier n'est pas une sauvegarde Mon Assiette"); }
    };
    rd.readAsText(file);
    el.value = "";
  }
});
document.addEventListener("keydown", e => {
  if (e.key !== "Enter") return;
  if (e.target.id === "exIn") { e.preventDefault(); A.exAdd(); }
  if (e.target.id === "wIn") { e.preventDefault(); A.weigh(); }
  if (e.target.dataset && e.target.dataset.f === "stepsToday") e.target.blur();
});

/* ---------- Demarrage ---------- */
render();
if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
