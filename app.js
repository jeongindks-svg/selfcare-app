'use strict';
/* ================= 유틸 ================= */
const PAD = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + PAD(d.getMonth() + 1) + '-' + PAD(d.getDate());
const parseD = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const todayStr = () => ymd(new Date());
const dayDiff = (a, b) => Math.round((parseD(a) - parseD(b)) / 86400000);
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
function fmtN(n, dec) {
  dec = dec || 0;
  const s = Number(n).toFixed(dec).split('.');
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return s.join('.');
}
const won = n => '₩' + fmtN(n, 0);
function fmtDur(min) { min = Math.round(min); return Math.floor(min / 60) + '시간 ' + (min % 60) + '분'; }
function fmtDurShort(min) { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return m ? h + '시간 ' + m + '분' : h + '시간'; }
const toMin = s => { const p = String(s).split(':'); return (+p[0]) * 60 + (+p[1]); };
const hm = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return PAD(Math.floor(m / 60)) + ':' + PAD(m % 60); };
function dateLabel(d) {
  const t = todayStr();
  if (d === t) return '오늘';
  if (d === addDays(t, -1)) return '어제';
  const x = parseD(d);
  return (x.getMonth() + 1) + '월 ' + x.getDate() + '일 (' + WD[x.getDay()] + ')';
}
function weekKey(d) { const dow = (parseD(d).getDay() + 6) % 7; return addDays(d, -dow); }
function exVal(v, e, dec) {
  const d = dec != null ? dec : (e.decimals || 0);
  const s = fmtN(v, d);
  return e.unit === '회' ? s + '회' : s + ' ' + e.unit;
}
const exGoal = (v, e) => exVal(v, e, Number.isInteger(v) ? 0 : (e.decimals || 1));
const exBest = (v, e) => v > 0 ? exVal(v, e) : '–';
const wonBest = v => v > 0 ? won(v) : '–';
function fmtPace(p) {
  if (p == null || !isFinite(p)) return '–';
  const s = Math.round(p * 60);
  return Math.floor(s / 60) + "'" + PAD(s % 60) + '"';
}
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const sum = a => a.reduce((x, y) => x + y, 0);
const maxOf = a => a.length ? Math.max.apply(null, a) : 0;

/* ================= 상태 ================= */
const STORE_KEY = 'selfapp.v1';
function defaultState() {
  return {
    v: 1, updatedAt: 0, theme: 'auto',
    settings: {
      show: { exercise: true, sleep: true, money: true, faith: true },
      exercises: [
        { id: 'run', name: '러닝', unit: 'km', goal: 5, weekly: 20, cls: 'run', kind: 'cardio', decimals: 1, minutes: true },
        { id: 'push', name: '팔굽혀펴기', unit: '회', goal: 40, weekly: 200, cls: 'push', kind: 'strength', decimals: 0, minutes: false }
      ],
      sleepGoal: 7, rate: true,
      monthly: 800000,
      cats: [
        { id: 'c1', name: '식비', weekly: 70000 }, { id: 'c2', name: '교통', weekly: 30000 },
        { id: 'c3', name: '카페', weekly: 20000 }, { id: 'c4', name: '쇼핑', weekly: 25000 },
        { id: 'c5', name: '헌금·기부', weekly: 20000 }, { id: 'c6', name: '기타', weekly: 10000 }
      ],
      faith: [
        { id: 'f1', name: '말씀 읽기', on: true, track: 'read' }, { id: 'f2', name: '기도', on: true, track: 'pray' },
        { id: 'f3', name: '감사 일기', on: true, track: null }, { id: 'f4', name: '성경 암송', on: true, track: null },
        { id: 'f5', name: '예배 참석', on: false, track: null }
      ],
      topics: []
    },
    logs: { ex: {}, sleep: {}, exp: [], faith: {}, nospend: {} }
  };
}
function normalize(o) {
  const d = defaultState();
  if (!o || typeof o !== 'object') return d;
  const s = Object.assign({}, d, o);
  const os = o.settings || {};
  s.settings = Object.assign({}, d.settings, os);
  s.settings.show = Object.assign({}, d.settings.show, os.show || {});
  ['exercises', 'cats', 'faith', 'topics'].forEach(k => { if (!Array.isArray(s.settings[k])) s.settings[k] = d.settings[k]; });
  s.logs = Object.assign({}, d.logs, o.logs || {});
  ['ex', 'sleep', 'faith', 'nospend'].forEach(k => { if (!s.logs[k] || typeof s.logs[k] !== 'object' || Array.isArray(s.logs[k])) s.logs[k] = {}; });
  if (!Array.isArray(s.logs.exp)) s.logs.exp = [];
  return s;
}
let S = defaultState();
let VER = 0;
function loadLocal() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* 저장소를 못 읽으면 빈 상태로 시작 */ }
  return null;
}
function saveLocal() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
function commit() { S.updatedAt = Date.now(); VER++; saveLocal(); queueRemote(); }

/* 이 버전은 서버 없이 브라우저(localStorage)에만 저장해요. */
let SYNC = 'local';
function queueRemote() {}
function initRemote() {}

/* ================= 인덱스 & 지표 ================= */
let IX = { ver: -1 };
function ix() {
  if (IX.ver === VER) return IX;
  const o = { ver: VER, ex: {}, spend: {}, spendCat: {}, first: null };
  const upd = d => { if (!o.first || d < o.first) o.first = d; };
  Object.keys(S.logs.ex).forEach(id => {
    const m = {};
    (S.logs.ex[id] || []).forEach(r => { m[r.d] = (m[r.d] || 0) + r.v; upd(r.d); });
    o.ex[id] = m;
  });
  Object.keys(S.logs.sleep).forEach(upd);
  S.logs.exp.forEach(r => {
    o.spend[r.d] = (o.spend[r.d] || 0) + r.amt;
    const c = o.spendCat[r.cat] = o.spendCat[r.cat] || {};
    c[r.d] = (c[r.d] || 0) + r.amt;
    upd(r.d);
  });
  Object.keys(S.logs.faith).forEach(upd);
  Object.keys(S.logs.nospend).forEach(upd);
  IX = o;
  return o;
}
const hasAnyData = () => !!ix().first;
const exSum = (id, d) => (ix().ex[id] && ix().ex[id][d]) || 0;
const spendOn = d => ix().spend[d] || 0;
const spendCatOn = (c, d) => (ix().spendCat[c] && ix().spendCat[c][d]) || 0;
const sleepOn = d => S.logs.sleep[d] || null;
const faithRec = d => S.logs.faith[d] || {};
function faithDone(d, it) {
  const r = faithRec(d);
  if (r.done && r.done[it.id] !== undefined) return !!r.done[it.id];
  if (it.track === 'pray') return (r.pray || 0) > 0;
  if (it.track === 'read') return (r.read || 0) > 0;
  return false;
}
const faithItems = () => S.settings.faith.filter(f => f.on);
const faithCount = d => faithItems().filter(it => faithDone(d, it)).length;
function last7(end) { const e = end || todayStr(); const a = []; for (let i = 6; i >= 0; i--) a.push(addDays(e, -i)); return a; }

/* 오늘의 체크 (날짜별 계산) */
function checksFor(d) {
  const st = S.settings, list = [], isToday = d === todayStr();
  if (st.show.exercise) {
    st.exercises.forEach(e => {
      const v = exSum(e.id, d);
      list.push({ key: 'ex:' + e.id, kind: 'ex', cls: e.cls, title: e.name + ' ' + exGoal(e.goal, e) + ' 이상', sub: exVal(v, e) + ' / ' + exGoal(e.goal, e), done: v >= e.goal });
    });
  }
  if (st.show.sleep) {
    const r = sleepOn(d), g = st.sleepGoal * 60;
    list.push({ key: 'sleep', kind: 'sleep', cls: 'sleep', title: fmtDurShort(g) + ' 이상 수면', sub: r ? fmtDur(r.dur) + ' / ' + fmtDurShort(g) : '기록이 없어요', done: !!r && r.dur >= g });
  }
  if (st.show.money) {
    const sp = spendOn(d), ns = !!S.logs.nospend[d];
    list.push({ key: 'money', kind: 'money', cls: 'money', title: (isToday ? '오늘 ' : '') + '지출 기록', sub: sp > 0 ? '지출 ' + won(sp) : (ns ? '지출 없는 날' : '아직 입력하지 않았어요'), done: sp > 0 || ns });
  }
  if (st.show.faith) {
    faithItems().forEach(it => {
      const r = faithRec(d);
      let sub = '';
      if (it.track === 'pray' && r.pray) sub = r.pray + '분';
      if (it.track === 'read' && r.read) sub = r.read + '장';
      list.push({ key: 'faith:' + it.id, kind: 'faith', cls: 'faith', title: it.name, sub: sub, done: faithDone(d, it) });
    });
  }
  return list;
}
function fracFor(d) { const l = checksFor(d); return l.length ? l.filter(c => c.done).length / l.length : null; }

/* 능력치 (최근 7일 기준, 0~100) */
const ABIL = [
  { k: 'body', name: '체력', cls: 'run', src: '러닝 등 체력 운동' },
  { k: 'strength', name: '근력', cls: 'push', src: '팔굽혀펴기 등 근력 운동' },
  { k: 'rest', name: '회복', cls: 'sleep', src: '수면' },
  { k: 'steady', name: '꾸준함', cls: 'blue', src: '오늘의 체크' },
  { k: 'money', name: '재정', cls: 'money', src: '가계부' },
  { k: 'faith', name: '신앙', cls: 'faith', src: '신앙' }
];
function abilitiesAt(end) {
  const o = ix(), st = S.settings;
  const days = last7(end).filter(d => o.first && d >= o.first);
  if (!days.length) return null;
  const out = { body: null, strength: null, rest: null, steady: null, money: null, faith: null };
  const kindScore = kind => {
    if (!st.show.exercise) return null;
    const ex = st.exercises.filter(e => e.kind === kind && e.goal > 0);
    if (!ex.length) return null;
    const per = ex.map(e => sum(days.map(d => Math.min(1, exSum(e.id, d) / e.goal))) / days.length);
    return Math.round(100 * sum(per) / per.length);
  };
  out.body = kindScore('cardio');
  out.strength = kindScore('strength');
  if (st.show.sleep) {
    const recs = days.map(sleepOn).filter(Boolean);
    if (recs.length) {
      const g = st.sleepGoal * 60;
      const dur = sum(recs.map(r => Math.min(1, r.dur / g))) / recs.length;
      const rated = recs.filter(r => r.score > 0);
      const rate = (st.rate && rated.length) ? sum(rated.map(r => r.score)) / rated.length / 10 : null;
      out.rest = Math.round(100 * (rate == null ? dur : 0.6 * dur + 0.4 * rate));
    }
  }
  const fr = days.map(fracFor).filter(f => f != null);
  out.steady = fr.length ? Math.round(100 * sum(fr) / fr.length) : null;
  if (st.show.money) {
    const logged = days.filter(d => spendOn(d) > 0 || S.logs.nospend[d]).length;
    if (logged > 0) {
      const W = sum(st.cats.map(c => c.weekly));
      const spent = sum(days.map(spendOn));
      const ratio = W > 0 ? spent / (W * days.length / 7) : 0;
      const bScore = ratio <= 1 ? 1 : Math.max(0, 1 - (ratio - 1) * 2);
      out.money = Math.round(100 * (0.5 * bScore + 0.5 * logged / days.length));
    }
  }
  if (st.show.faith) {
    const items = faithItems();
    if (items.length) {
      const done = sum(days.map(faithCount));
      out.faith = Math.round(100 * done / (items.length * days.length));
    }
  }
  return out;
}
function visibleAbil() {
  const st = S.settings;
  return ABIL.filter(a => {
    if (a.k === 'body') return st.show.exercise && st.exercises.some(e => e.kind === 'cardio');
    if (a.k === 'strength') return st.show.exercise && st.exercises.some(e => e.kind === 'strength');
    if (a.k === 'rest') return st.show.sleep;
    if (a.k === 'money') return st.show.money;
    if (a.k === 'faith') return st.show.faith;
    return true;
  });
}
function composite(ab) {
  if (!ab) return null;
  const vs = visibleAbil().map(a => ab[a.k]).filter(v => v != null);
  return vs.length ? Math.round(sum(vs) / vs.length) : null;
}
function abilityHistory(weeks) {
  const t = todayStr(), h = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = addDays(t, -7 * i);
    const ab = abilitiesAt(end);
    h.push({ end, ab, comp: composite(ab) });
  }
  return h;
}

/* 기간별 버킷: week(7일) / month(5주) / half(6개월) */
function buckets(range, valFn, agg) {
  const t = todayStr(), out = [];
  const reduce = vals => {
    const v = vals.filter(x => x != null);
    if (!v.length) return null;
    return agg === 'avg' ? sum(v) / v.length : sum(v);
  };
  if (range === 'week') {
    for (let i = 6; i >= 0; i--) {
      const d = addDays(t, -i);
      out.push({ label: WD[parseD(d).getDay()], value: reduce([valFn(d)]), today: i === 0 });
    }
  } else if (range === 'month') {
    for (let b = 4; b >= 0; b--) {
      const vals = [];
      for (let i = 6; i >= 0; i--) vals.push(valFn(addDays(t, -7 * b - i)));
      out.push({ label: b === 0 ? '이번 주' : b + '주 전', value: reduce(vals), today: b === 0 });
    }
  } else {
    const now = parseD(t);
    for (let k = 5; k >= 0; k--) {
      const first = new Date(now.getFullYear(), now.getMonth() - k, 1);
      const last = new Date(now.getFullYear(), now.getMonth() - k + 1, 0);
      const vals = [];
      for (let d = new Date(first); d <= last && ymd(d) <= t; d.setDate(d.getDate() + 1)) vals.push(valFn(ymd(d)));
      out.push({ label: (first.getMonth() + 1) + '월', value: reduce(vals), today: k === 0 });
    }
  }
  return out;
}
const RANGE = {
  week: { seg: '주', avgLabel: '7일 평균 (하루)', per: '/ 일', sumLabel: '최근 7일 합계' },
  month: { seg: '월', avgLabel: '5주 평균 (주간)', per: '/ 주', sumLabel: '최근 5주 합계' },
  half: { seg: '6개월', avgLabel: '6개월 평균 (월간)', per: '/ 월', sumLabel: '최근 6개월 합계' }
};
function bucketAvg(bs) { const v = bs.map(b => b.value).filter(x => x != null); return v.length ? sum(v) / v.length : null; }
function bucketSum(bs) { return sum(bs.map(b => b.value || 0)); }

/* 운동 */
function exStats(e) {
  const days = last7(), vals = days.map(d => exSum(e.id, d));
  const sum7 = sum(vals);
  const entries = S.logs.ex[e.id] || [];
  const e7 = entries.filter(r => days.indexOf(r.d) >= 0);
  const o = ix().ex[e.id] || {};
  const wk = {};
  Object.keys(o).forEach(d => { const k = weekKey(d); wk[k] = (wk[k] || 0) + o[d]; });
  let pace7 = null, pbPace = null;
  if (e.minutes) {
    let km = 0, mn = 0;
    e7.forEach(r => { if (r.m > 0) { km += r.v; mn += r.m; } });
    if (km > 0) pace7 = mn / km;
    entries.forEach(r => { if (r.m > 0 && r.v > 0) { const p = r.m / r.v; if (pbPace == null || p < pbPace) pbPace = p; } });
  }
  return {
    days, vals, sum7, avg: sum7 / 7, bestDay7: maxOf(vals),
    pbDay: maxOf(Object.keys(o).map(k => o[k])), pbEntry: maxOf(entries.map(r => r.v)),
    pbWeek: maxOf(Object.keys(wk).map(k => wk[k])),
    avgEntry: e7.length ? sum(e7.map(r => r.v)) / e7.length : null, count7: e7.length, pace7, pbPace
  };
}

/* 수면 */
function sleepList() { return Object.keys(S.logs.sleep).sort().map(d => Object.assign({ d: d }, S.logs.sleep[d])); }
function sleepStats() {
  const days = last7(), recs = days.map(sleepOn), have = recs.filter(Boolean);
  const rated = have.filter(r => r.score > 0), all = sleepList();
  const g = S.settings.sleepGoal * 60;
  return {
    days, recs, have,
    avgDur: have.length ? sum(have.map(r => r.dur)) / have.length : null,
    longest7: have.length ? maxOf(have.map(r => r.dur)) : null,
    avgScore: rated.length ? sum(rated.map(r => r.score)) / rated.length : null,
    best7: rated.length ? maxOf(rated.map(r => r.score)) : null,
    pbLong: all.length ? maxOf(all.map(r => r.dur)) : null,
    pbScore: maxOf(all.filter(r => r.score > 0).map(r => r.score)) || null,
    achieved: have.filter(r => r.dur >= g).length
  };
}
function sleepInsight() {
  const rated = sleepList().filter(n => n.score > 0);
  const res = { n: rated.length, ok: false };
  if (rated.length < 3) return res;
  const durs = rated.map(n => n.dur);
  const lo0 = Math.floor(Math.min.apply(null, durs) / 15) * 15, hi0 = Math.max.apply(null, durs);
  const minCount = Math.max(2, Math.ceil(rated.length * 0.25));
  let best = null;
  for (let lo = lo0; lo <= hi0; lo += 15) {
    const inn = rated.filter(n => n.dur >= lo && n.dur <= lo + 60);
    if (inn.length < minCount) continue;
    const avg = sum(inn.map(n => n.score)) / inn.length;
    if (!best || avg > best.avg + 1e-9 || (Math.abs(avg - best.avg) < 1e-9 && inn.length > best.nights.length)) best = { avg, nights: inn };
  }
  if (!best) return res;
  const ds = best.nights.map(n => n.dur);
  const bed = best.nights.map(n => { const m = toMin(n.bed); return m < 12 * 60 ? m + 1440 : m; });
  const wake = best.nights.map(n => toMin(n.wake));
  const r5 = m => Math.round(m / 5) * 5;
  res.ok = true;
  res.min = r5(Math.min.apply(null, ds)); res.max = r5(Math.max.apply(null, ds));
  res.avg = best.avg; res.count = best.nights.length;
  res.bed = sum(bed) / bed.length; res.wake = sum(wake) / wake.length;
  const defs = [['6시간 미만', 0, 360], ['6시간대', 360, 420], ['7시간대', 420, 480], ['8시간 이상', 480, 99999]];
  res.groups = defs.map(g => {
    const inn = rated.filter(n => n.dur >= g[1] && n.dur < g[2]);
    return { name: g[0], count: inn.length, avg: inn.length ? sum(inn.map(n => n.score)) / inn.length : null };
  }).filter(g => g.count > 0);
  return res;
}

/* 가계부 */
function moneyStats() {
  const days = last7(), vals = days.map(spendOn), o = ix();
  const sum7 = sum(vals);
  const prev = sum(last7(addDays(todayStr(), -7)).map(spendOn));
  const ym = todayStr().slice(0, 7);
  const month = sum(Object.keys(o.spend).filter(d => d.slice(0, 7) === ym).map(d => o.spend[d]));
  const tracked = days.filter(d => spendOn(d) > 0 || S.logs.nospend[d]);
  let minD = null, maxD = null;
  tracked.forEach(d => {
    if (minD == null || spendOn(d) < spendOn(minD)) minD = d;
    if (maxD == null || spendOn(d) > spendOn(maxD)) maxD = d;
  });
  const wk = {};
  Object.keys(o.spend).forEach(d => { const k = weekKey(d); wk[k] = (wk[k] || 0) + o.spend[d]; });
  return {
    days, vals, sum7, avg: sum7 / 7, prev, month, minD, maxD,
    pbDay: maxOf(Object.keys(o.spend).map(d => o.spend[d])),
    pbWeek: maxOf(Object.keys(wk).map(k => wk[k])),
    avgWeek: Object.keys(wk).length ? sum(Object.keys(wk).map(k => wk[k])) / Object.keys(wk).length : null
  };
}
function catSpent7(c) { return sum(last7().map(d => spendCatOn(c.id, d))); }

/* 신앙 */
function faithStats() {
  const days = last7(), items = faithItems();
  const prayed = days.map(d => faithRec(d).pray || 0), read = days.map(d => faithRec(d).read || 0);
  const counts = days.map(faithCount);
  const total = items.length * 7;
  const any = d => faithCount(d) > 0;
  const o = ix(), t = todayStr();
  let cur = 0, d = any(t) ? t : addDays(t, -1);
  while (any(d)) { cur++; d = addDays(d, -1); }
  let best = 0, run = 0;
  if (o.first) {
    for (let x = o.first; x <= t; x = addDays(x, 1)) { if (any(x)) { run++; best = Math.max(best, run); } else run = 0; }
  }
  const all = Object.keys(S.logs.faith);
  return {
    days, items, prayed, read, counts,
    rate: total ? sum(counts) / total : null, doneTotal: sum(counts), total,
    avgPray: sum(prayed) / 7, avgRead: sum(read) / 7, avgCount: sum(counts) / 7,
    pbPray: maxOf(all.map(k => faithRec(k).pray || 0)), pbRead: maxOf(all.map(k => faithRec(k).read || 0)),
    pbCount: maxOf(all.map(faithCount)), streak: cur, bestStreak: best
  };
}

/* 예시 데이터 */
function seedSample() {
  let a = 20260101;
  const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const ri = (lo, hi) => Math.floor(lo + rnd() * (hi - lo + 1));
  const t = todayStr();
  const logs = { ex: {}, sleep: {}, exp: [], faith: {}, nospend: {} };
  S.settings.exercises.forEach(e => { logs.ex[e.id] = []; });
  const cats = S.settings.cats, faith = S.settings.faith;
  for (let i = 55; i >= 0; i--) {
    const d = addDays(t, -i), today = i === 0;
    S.settings.exercises.forEach(e => {
      if (e.id === 'run' && rnd() < 0.62) {
        const km = Math.round((3 + rnd() * 5 + (55 - i) * 0.02) * 10) / 10;
        logs.ex.run.push({ id: uid(), d: d, v: km, m: Math.round(km * (5.1 + rnd() * 1.1)) });
      } else if (e.id === 'push' && !today && rnd() < 0.7) {
        const sets = ri(2, 4);
        for (let s = 0; s < sets; s++) logs.ex.push.push({ id: uid(), d: d, v: ri(8, 14) + Math.floor((55 - i) / 10) });
      } else if (e.id !== 'run' && e.id !== 'push' && rnd() < 0.5) {
        logs.ex[e.id].push({ id: uid(), d: d, v: Math.max(1, Math.round(e.goal * (0.6 + rnd() * 0.7))) });
      }
    });
    const bed = 23 * 60 + ri(-40, 70), wake = 6 * 60 + ri(10, 80);
    const dur = (wake - bed + 1440) % 1440;
    const score = clamp(Math.round(9.5 - Math.abs(dur - 450) / 25 + (rnd() * 2 - 1)), 2, 10);
    logs.sleep[d] = { bed: hm(bed), wake: hm(wake), dur: dur, score: score };
    if (!today) {
      const n = ri(1, 4);
      for (let k = 0; k < n; k++) {
        const c = cats[ri(0, cats.length - 1)];
        logs.exp.push({ id: uid(), d: d, cat: c.id, amt: Math.round(c.weekly / ri(6, 12) / 100) * 100, memo: '' });
      }
    }
    const done = {};
    faith.forEach(f => { done[f.id] = rnd() < 0.78; });
    const rec = { done: done };
    if (rnd() < 0.8) rec.pray = ri(8, 35);
    if (rnd() < 0.7) rec.read = ri(1, 5);
    logs.faith[d] = rec;
  }
  S.logs = logs;
  commit();
}

/* ================= 차트 (SVG / CSS) ================= */
const ICONS = {
  run: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  push: '<path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12"/>',
  sleep: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  money: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10.5h18M16 15h2"/>',
  faith: '<path d="M12 3v18M7 8.5h10"/>',
  today: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  trend: '<path d="M3 17l5-6 4 3 8-9"/><path d="M15 5h5v5"/>',
  bars: '<path d="M5 20V11M12 20V5M19 20v-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'
};
function ico(name, size, sw) {
  return '<svg width="' + (size || 24) + '" height="' + (size || 24) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
}
const STAR = '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9 6.8 19.7l1-5.9L3.5 9.7l5.9-.8z"/>';
const star = size => '<svg class="star" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" aria-hidden="true">' + STAR + '</svg>';
const CHEV = '<svg class="chev" width="8" height="14" viewBox="0 0 8 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg>';

/* 막대 차트 */
function barChart(o) {
  const H = 130, belowH = o.belowH || 24;
  const vals = o.items.map(i => i.value || 0);
  const mx = Math.max(1e-9, maxOf(vals), o.avg || 0, o.goal || 0);
  const sc = H / mx;
  let h = '<div class="bars c-' + o.cls + '" style="height:' + (H + 20 + belowH + 6) + 'px">';
  if (o.avg != null && o.avg > 0) h += '<div class="bline" style="bottom:' + (belowH + o.avg * sc).toFixed(1) + 'px"></div>';
  if (o.goal != null && o.goal > 0) h += '<div class="bline goal" style="bottom:' + (belowH + o.goal * sc).toFixed(1) + 'px"></div>';
  o.items.forEach(it => {
    const has = it.value != null && it.value > 0;
    const bh = has ? Math.max(4, Math.round(it.value * sc)) : 4;
    h += '<div class="bcol"><div class="bval">' + (has ? esc(o.fmt(it.value)) : '') + '</div>' +
      '<div class="bar' + (it.today ? ' hi' : '') + (has ? '' : ' none') + '" style="height:' + bh + 'px"></div>' +
      '<div class="bbelow" style="height:' + belowH + 'px">' + esc(it.label) + (it.below || '') + '</div></div>';
  });
  return h + '</div>';
}

/* 곡선 */
function smooth(pts, t) {
  t = t == null ? 0.18 : t;
  const n = pts.length;
  let d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ' C' + c1[0].toFixed(1) + ' ' + c1[1].toFixed(1) + ' ' + c2[0].toFixed(1) + ' ' + c2[1].toFixed(1) + ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
  }
  return d;
}
/* null 이 끼어 있어도 끊어서 그리는 경로 */
function segPaths(pts) {
  const runs = []; let cur = [];
  pts.forEach(p => { if (p) cur.push(p); else { if (cur.length) runs.push(cur); cur = []; } });
  if (cur.length) runs.push(cur);
  return runs;
}
function yRange(vals, minSpan) {
  const v = vals.filter(x => x != null);
  if (!v.length) return [0, 100];
  let lo = Math.floor((Math.min.apply(null, v) - 5) / 10) * 10, hi = Math.ceil((Math.max.apply(null, v) + 5) / 10) * 10;
  lo = Math.max(0, lo); hi = Math.min(100, hi);
  if (hi - lo < (minSpan || 30)) { hi = Math.min(100, lo + (minSpan || 30)); lo = Math.max(0, hi - (minSpan || 30)); }
  return [lo, hi];
}

/* 종합 점수 영역 차트 */
function areaChart(hist, labelsOn) {
  const vals = hist.map(h => h.comp);
  const [lo, hi] = yRange(vals, 20);
  const W = 326, top = 18, bot = 116, left = 8, right = 318;
  const n = hist.length;
  const X = i => left + i * (right - left) / Math.max(1, n - 1);
  const Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
  const pts = vals.map((v, i) => v == null ? null : [X(i), Y(v)]);
  const runs = segPaths(pts);
  let s = '<svg class="chart c-sleep" viewBox="0 0 ' + W + ' 142" role="img" aria-label="종합 능력치 변화">';
  [top, (top + bot) / 2, bot].forEach(y => { s += '<path class="grid" d="M0 ' + y + ' H' + W + '"/>'; });
  runs.forEach(r => {
    if (r.length > 1) {
      const line = smooth(r);
      s += '<path class="area" d="' + line + ' L' + r[r.length - 1][0].toFixed(1) + ' ' + bot + ' L' + r[0][0].toFixed(1) + ' ' + bot + ' Z"/>';
      s += '<path class="line" d="' + line + '"/>';
    } else s += '<circle class="dot" cx="' + r[0][0].toFixed(1) + '" cy="' + r[0][1].toFixed(1) + '" r="4"/>';
  });
  const first = pts.findIndex(p => p), lastIdx = (() => { for (let i = n - 1; i >= 0; i--) if (pts[i]) return i; return -1; })();
  if (first >= 0) s += '<text class="lbl" x="' + pts[first][0].toFixed(1) + '" y="' + (pts[first][1] - 10).toFixed(1) + '">' + vals[first] + '</text>';
  if (lastIdx >= 0) {
    s += '<circle class="endDot" cx="' + pts[lastIdx][0].toFixed(1) + '" cy="' + pts[lastIdx][1].toFixed(1) + '" r="5.5"/>';
    if (lastIdx !== first) s += '<text class="lbl" text-anchor="end" x="' + (pts[lastIdx][0] - 2).toFixed(1) + '" y="' + (pts[lastIdx][1] - 12).toFixed(1) + '">' + vals[lastIdx] + '</text>';
  }
  if (labelsOn !== false) {
    s += '<text class="axis" x="8" y="136">' + (n - 1) + '주 전</text><text class="axis" text-anchor="end" x="318" y="136">이번 주</text>';
  }
  return s + '</svg>';
}

/* 능력치 선 그래프 */
function skillsChart(hist, vis, abils) {
  const all = [];
  abils.forEach((a, i) => { if (vis[a.k] !== false) hist.forEach(h => { if (h.ab && h.ab[a.k] != null) all.push(h.ab[a.k]); }); });
  const [lo, hi] = yRange(all.length ? all : [40, 100], 30);
  const W = 326, left = 32, right = 318, top = 10, bot = 160, n = hist.length;
  const X = i => left + i * (right - left) / Math.max(1, n - 1);
  const Y = v => bot - (v - lo) / (hi - lo) * (bot - top);
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' 186" role="img" aria-label="능력치 변화 선 그래프">';
  for (let k = 0; k <= 3; k++) {
    const v = lo + (hi - lo) * k / 3, y = Y(v);
    s += '<path class="grid" d="M' + left + ' ' + y.toFixed(1) + ' H' + right + '"/><text class="axis" text-anchor="end" x="24" y="' + (y + 4).toFixed(1) + '">' + Math.round(v) + '</text>';
  }
  abils.forEach(a => {
    if (vis[a.k] === false) return;
    const pts = hist.map((h, i) => (h.ab && h.ab[a.k] != null) ? [X(i), Y(h.ab[a.k])] : null);
    s += '<g class="c-' + a.cls + ' ser">';
    segPaths(pts).forEach(r => {
      if (r.length > 1) s += '<path class="sline" d="' + smooth(r) + '"/>';
      else s += '<circle class="sdot" cx="' + r[0][0].toFixed(1) + '" cy="' + r[0][1].toFixed(1) + '" r="3"/>';
    });
    let li = -1; for (let i = n - 1; i >= 0; i--) if (pts[i]) { li = i; break; }
    if (li >= 0) s += '<circle class="send" cx="' + pts[li][0].toFixed(1) + '" cy="' + pts[li][1].toFixed(1) + '" r="4.5"/>';
    s += '</g>';
  });
  s += '<text class="axis" x="' + left + '" y="180">' + (n - 1) + '주 전</text><text class="axis" text-anchor="end" x="' + right + '" y="180">이번 주</text>';
  return s + '</svg>';
}

/* ================= 화면 ================= */
let NAV = { route: 'today', arg: null, range: 'week', vis: {}, weeks: 8 };

const DONE_SVG = '<svg class="on" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13"/><path d="M8.5 14.5l3.8 3.8 7.2-8" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TODO_SVG = '<svg class="off" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="none" stroke-width="2"/></svg>';
const exIcon = e => e.cls === 'run' ? 'run' : 'push';

function hdr(title, sub) { return '<header class="hdr">' + (sub ? '<div class="date">' + esc(sub) + '</div>' : '') + '<h1>' + title + '</h1></header>'; }
function backHdr(label, route, title, icon, cls, right) {
  return '<header class="hdr"><div class="hrow"><a href="#" class="back" data-act="go" data-arg="' + route + '"><svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1L2 8l6 7"/></svg>' + label + '</a>' + (right || '') + '</div>' +
    '<h1 class="withico c-' + cls + '">' + (icon ? '<span class="hico">' + ico(icon, 28, 2) + '</span>' : '') + title + '</h1></header>';
}
function segCtl() {
  return '<div class="seg" role="group" aria-label="기간 선택">' + ['week', 'month', 'half'].map(k =>
    '<button type="button" data-act="range" data-arg="' + k + '" aria-pressed="' + (NAV.range === k) + '">' + RANGE[k].seg + '</button>').join('') + '</div>';
}
function miniCards(cards) {
  return '<section class="mini">' + cards.map(c => '<div class="mcard"><div class="ml">' + c[0] + '</div><div class="mv">' + c[1] + '</div><div class="mc">' + c[2] + '</div></div>').join('') + '</section>';
}
function statTable(c1, c2, rows, cls) {
  return '<section class="card tbl c-' + cls + '" aria-label="평균과 최고 기록"><div class="trow th"><span></span><span>' + c1 + '</span><span>' + c2 + '</span></div>' +
    rows.map(r => '<div class="trow"><span class="tl">' + r[0] + '</span><span class="ta">' + r[1] + '</span><span class="tb">' + r[2] + '</span></div>').join('') + '</section>';
}
const unitHtml = (n, u) => n + '<span class="u">' + u + '</span>';
const dash = '–';
function empty(msg, btn) { return '<section class="card emptyc"><div class="et">' + msg + '</div>' + (btn || '') + '</section>'; }
function checkRow(c) {
  return '<button type="button" class="crow c-' + c.cls + '" data-act="check" data-arg="' + esc(c.key) + '" aria-pressed="' + c.done + '">' +
    '<span class="cmark">' + (c.done ? DONE_SVG : TODO_SVG) + '</span><span class="ctext"><span class="ct1">' + esc(c.title) + '</span><span class="ct2">' + esc(c.sub) + '</span></span>' +
    '<span class="cstat' + (c.done ? ' ok' : '') + '">' + (c.done ? '완료' : '남음') + '</span></button>';
}
function entryRow(act, arg, left, sub, right) {
  return '<button type="button" class="erow" data-act="' + act + '" data-arg="' + esc(arg) + '"><span class="el"><span class="e1">' + left + '</span><span class="e2">' + sub + '</span></span><span class="er">' + right + '</span></button>';
}
const delta = (a, b) => (a == null || b == null) ? '' : (a - b >= 0 ? '+' : '−') + Math.abs(a - b);
const deltaCls = (a, b) => (a == null || b == null) ? '' : (a - b >= 0 ? 'up' : 'down');

/* ---------- 오늘 ---------- */
function viewToday() {
  const now = new Date(), st = S.settings;
  const sub = (now.getMonth() + 1) + '월 ' + now.getDate() + '일 ' + WD[now.getDay()] + '요일';
  const hist = abilityHistory(8), cur = hist[7], prev = hist[6];
  const abils = visibleAbil();
  let abil;
  if (cur.comp == null) {
    abil = empty('아직 기록이 없어요.<br>아래 빠른 기록으로 시작하거나, 예시 데이터로 먼저 둘러볼 수 있어요.',
      '<div class="btnrow"><button type="button" class="btn" data-act="seed">예시 데이터로 둘러보기</button></div>');
  } else {
    const dl = (cur.comp != null && prev.comp != null) ? '지난주보다 ' + delta(cur.comp, prev.comp) : '첫 기록 주간이에요';
    abil = '<a href="#" class="card abil" data-act="go" data-arg="skills"><div class="atop"><div class="a1">능력치 · 7일 평균</div>' + CHEV + '</div>' +
      '<div class="abig"><span class="n">' + cur.comp + '</span><span class="d ' + deltaCls(cur.comp, prev.comp) + '">' + dl + '</span></div>' + areaChart(hist) +
      '<div class="legend">' + abils.map(a => '<div class="lg c-' + a.cls + '"><i></i><span>' + a.name + '</span><b>' + (cur.ab[a.k] == null ? dash : cur.ab[a.k]) + '</b></div>').join('') + '</div></a>';
  }
  const pills = [];
  if (st.show.exercise) st.exercises.forEach(e => pills.push('<button type="button" class="pill c-' + e.cls + '" data-act="logEx" data-arg="' + e.id + '">' + ico('plus', 14, 2.4) + esc(e.name) + '</button>'));
  if (st.show.sleep) pills.push('<button type="button" class="pill c-sleep" data-act="logSleep" data-arg="">' + ico('plus', 14, 2.4) + '수면</button>');
  if (st.show.money) pills.push('<button type="button" class="pill c-money" data-act="logMoney" data-arg="">' + ico('plus', 14, 2.4) + '지출</button>');
  if (st.show.faith) pills.push('<button type="button" class="pill c-faith" data-act="logFaith" data-arg="">' + ico('plus', 14, 2.4) + '신앙</button>');
  const checks = checksFor(todayStr());
  const doneN = checks.filter(c => c.done).length;
  const tiles = [];
  if (st.show.exercise && st.exercises.length) {
    const e = st.exercises[0], s = exStats(e);
    tiles.push(tile('ex|' + e.id, exIcon(e), '운동', e.cls, s.count7 || s.sum7 ? exVal(s.avg, e) : dash, e.name + ' 하루 평균 · 최고 ' + exBest(s.pbDay, e)));
  }
  if (st.show.sleep) {
    const s = sleepStats();
    tiles.push(tile('sleep', 'sleep', '수면', 'sleep', s.avgDur == null ? dash : fmtDur(s.avgDur), s.avgScore == null ? '평균 수면 시간' : '평균 · 별점 ' + s.avgScore.toFixed(1) + ' / 10'));
  }
  if (st.show.money) {
    const m = moneyStats();
    tiles.push(tile('money', 'money', '가계부', 'money', m.sum7 || m.pbDay ? won(m.avg) : dash, '하루 평균 · 최고 ' + wonBest(m.pbDay)));
  }
  if (st.show.faith) {
    const f = faithStats();
    tiles.push(tile('faith', 'faith', '신앙', 'faith', f.rate == null ? dash : Math.round(f.rate * 100) + '%', '7일 실천률 · 연속 ' + f.streak + '일'));
  }
  return hdr('오늘', sub) + abil +
    '<div class="pills" aria-label="빠른 기록">' + pills.join('') + '</div>' +
    '<section><div class="sh"><h2>오늘의 체크</h2><div class="shr"><span>' + doneN + ' / ' + checks.length + ' 달성</span><a href="#" class="lnk" data-act="go" data-arg="settings">편집</a></div></div>' +
    '<div class="group">' + (checks.length ? checks.map(checkRow).join('') : '<div class="emptyrow">표시할 체크가 없어요. 설정에서 분야를 켜 주세요.</div>') + '</div></section>' +
    '<section><div class="sh"><h2>분야</h2><a href="#" class="lnk" data-act="go" data-arg="cats">모두 보기</a></div><div class="tiles">' + tiles.join('') + '</div></section>';
}
function tile(arg, icon, name, cls, big, sub) {
  return '<a href="#" class="tile c-' + cls + '" data-act="go" data-arg="' + arg + '"><div class="tn">' + ico(icon, 18, 2) + name + '</div><div class="tb">' + esc(big) + '</div><div class="ts">' + esc(sub) + '</div></a>';
}

/* ---------- 분야 ---------- */
function viewCats() {
  const st = S.settings;
  const sect = (icon, name, cls, rows, extra) => '<section class="group sect c-' + cls + '"><div class="sech"><span class="sico">' + ico(icon, 18, 2) + '</span><span class="sn">' + name + '</span><a href="#" class="lnk" data-act="go" data-arg="settings">편집</a></div>' + rows + (extra || '') + '</section>';
  const row = (arg, t, s) => '<a href="#" class="lrow" data-act="go" data-arg="' + arg + '"><span class="lt"><span class="l1">' + t + '</span><span class="l2">' + s + '</span></span>' + CHEV + '</a>';
  let h = '<header class="hdr hrow2"><h1>분야</h1><a href="#" class="lnk big" data-act="go" data-arg="settings">설정</a></header>';
  if (st.show.exercise) {
    const rows = st.exercises.map(e => { const s = exStats(e); return row('ex|' + e.id, esc(e.name), '하루 평균 ' + exVal(s.avg, e) + ' · 최고 ' + exBest(s.pbDay, e)); }).join('');
    h += sect('run', '운동', 'run', rows, '<button type="button" class="addrow" data-act="addEx">' + ico('plus', 18, 2) + '운동 종목 추가</button>');
  }
  if (st.show.sleep) {
    const s = sleepStats(), all = sleepList();
    h += sect('sleep', '수면', 'sleep',
      row('sleep', '수면 시간', '평균 ' + (s.avgDur == null ? dash : fmtDur(s.avgDur)) + ' · 최장 ' + (s.pbLong == null ? dash : fmtDur(s.pbLong))) +
      row('sleep', '수면 별점', '평균 ' + (s.avgScore == null ? dash : s.avgScore.toFixed(1)) + ' · 최고 ' + (s.pbScore == null ? dash : s.pbScore + '점') + ' (10점 만점)'));
  }
  if (st.show.money) {
    const m = moneyStats();
    h += sect('money', '가계부', 'money',
      row('money', '지출 관리', '하루 평균 ' + won(m.avg) + ' · 최고 ' + wonBest(m.pbDay)) +
      row('money', '예산', ymNow() + ' 예산 ' + won(st.monthly) + ' 중 ' + Math.round(m.month / st.monthly * 100) + '% 사용'));
  }
  if (st.show.faith) {
    const f = faithStats();
    h += sect('faith', '신앙', 'faith',
      row('faith', '말씀 · 기도', '기도 평균 ' + Math.round(f.avgPray) + '분 · 최고 ' + f.pbPray + '분') +
      row('faith', '기도 제목', st.topics.length + '개'));
  }
  h += '<a href="#" class="dashbtn" data-act="go" data-arg="settings">' + ico('gear', 18, 2) + '분야 설정</a>';
  return h;
}
const ymNow = () => (new Date().getMonth() + 1) + '월';

/* ---------- 능력치 ---------- */
function viewSkills() {
  const abils = visibleAbil(), hist = abilityHistory(8), cur = hist[7].ab, prev = hist[6].ab;
  let h = hdr('능력치', '최근 7일 평균 기준');
  if (!cur) return h + empty('기록이 쌓이면 능력치 그래프가 그려져요.', '<div class="btnrow"><button type="button" class="btn" data-act="seed">예시 데이터로 둘러보기</button></div>');
  h += '<section class="card" aria-label="8주 능력치 변화"><div class="sh2"><div class="a1b">8주 변화</div><div class="hint">항목을 눌러 켜고 끄기</div></div>' + skillsChart(hist, NAV.vis, abils) +
    '<div class="chips">' + abils.map(a => {
      const on = NAV.vis[a.k] !== false;
      return '<button type="button" class="chip c-' + a.cls + (on ? ' on' : '') + '" data-act="vis" data-arg="' + a.k + '" aria-pressed="' + on + '"><i></i><span>' + a.name + '</span><b>' + (cur[a.k] == null ? dash : cur[a.k]) + '</b></button>';
    }).join('') + '</div></section>';
  h += '<section class="card list" aria-label="항목별 점수">' + abils.map(a => {
    const v = cur[a.k], p = prev ? prev[a.k] : null;
    return '<div class="brow c-' + a.cls + '"><div class="bn"><div class="b1">' + a.name + '</div><div class="b2">' + a.src + '</div></div><div class="btrack"><div style="width:' + (v == null ? 0 : v) + '%"></div></div><div class="bv">' + (v == null ? dash : v) + '</div><div class="bd ' + deltaCls(v, p) + '">' + delta(v, p) + '</div></div>';
  }).join('') + '</section>';
  h += '<p class="foot">체력·근력은 하루 목표 달성률, 회복은 수면 시간과 별점, 꾸준함은 오늘의 체크 달성률, 재정은 예산 준수와 기록, 신앙은 항목 실천률의 최근 7일 평균이에요. 종합 점수는 표시된 항목의 평균이에요.</p>';
  return h;
}

/* ---------- 통계 ---------- */
function viewStats() {
  const st = S.settings, t = todayStr();
  const weeks = NAV.weeks, hist = abilityHistory(weeks);
  const first = hist.find(x => x.comp != null), cur = hist[hist.length - 1];
  let h = hdr('통계');
  h += '<div class="seg" role="group" aria-label="기간 선택">' + [4, 8, 12].map(w => '<button type="button" data-act="weeks" data-arg="' + w + '" aria-pressed="' + (weeks === w) + '">' + w + '주</button>').join('') + '</div>';
  if (cur.comp == null) {
    h += empty('아직 통계를 낼 기록이 없어요.', '<div class="btnrow"><button type="button" class="btn" data-act="seed">예시 데이터로 둘러보기</button></div>');
  } else {
    const diff = first && first !== cur ? cur.comp - first.comp : null;
    h += '<section class="card c-sleep" aria-label="종합 능력치"><div class="a1 ind">종합 능력치</div><div class="abig"><span class="n">' + cur.comp + '</span>' + (diff == null ? '' : '<span class="d ' + (diff >= 0 ? 'up' : 'down') + '">' + (weeks - 1) + '주 전보다 ' + (diff >= 0 ? '+' : '−') + Math.abs(diff) + '</span>') + '</div>' + areaChart(hist, true) + '</section>';
  }
  // 체크 달성 기록 (5주)
  const start = weekKey(addDays(t, -28)), o = ix();
  let cells = '', full = 0;
  for (let i = 0; i < 35; i++) {
    const d = addDays(start, i);
    if (d > t) { cells += '<span class="hc fut"></span>'; continue; }
    const f = (o.first && d >= o.first) ? fracFor(d) : null;
    if (f === 1) full++;
    const lv = f == null || f === 0 ? 0 : f < 0.34 ? 1 : f < 0.67 ? 2 : 3;
    cells += '<span class="hc l' + lv + '"></span>';
  }
  h += '<section class="card" aria-label="체크 달성 기록"><div class="sh2"><div class="a1b">체크 달성 기록</div><div class="hint">최근 5주 · 만점 ' + full + '일</div></div>' +
    '<div class="heatd">' + '월화수목금토일'.split('').map(x => '<span>' + x + '</span>').join('') + '</div><div class="heat">' + cells + '</div>' +
    '<div class="legend2"><span>적음</span><i class="hc l0"></i><i class="hc l1"></i><i class="hc l2"></i><i class="hc l3"></i><span>많음</span></div></section>';
  // 분야별 요약
  let rows = '';
  const srow = (arg, cls, name, val, sub) => '<a href="#" class="srow c-' + cls + '" data-act="go" data-arg="' + arg + '"><span class="sl"><span class="s1">' + name + '</span><span class="s2">' + sub + '</span></span><span class="sv">' + val + '</span>' + CHEV + '</a>';
  if (st.show.exercise) st.exercises.forEach(e => { const s = exStats(e); rows += srow('ex|' + e.id, e.cls, esc(e.name), exVal(s.sum7, e), '하루 평균 ' + exVal(s.avg, e) + ' · 최고 ' + exBest(s.bestDay7, e)); });
  if (st.show.sleep) { const s = sleepStats(); rows += srow('sleep', 'sleep', '수면', s.avgDur == null ? dash : fmtDur(s.avgDur), '최장 ' + (s.longest7 == null ? dash : fmtDur(s.longest7)) + ' · 별점 평균 ' + (s.avgScore == null ? dash : s.avgScore.toFixed(1)) + ' / 10'); }
  if (st.show.money) { const m = moneyStats(); const mx = m.maxD ? spendOn(m.maxD) : 0; rows += srow('money', 'money', '가계부', won(m.sum7), '하루 평균 ' + won(m.avg) + ' · 최고 ' + won(mx)); }
  if (st.show.faith) { const f = faithStats(); rows += srow('faith', 'faith', '신앙', f.rate == null ? dash : Math.round(f.rate * 100) + '%', '기도 평균 ' + Math.round(f.avgPray) + '분 · 최고 ' + maxOf(f.prayed) + '분'); }
  h += '<section class="group"><div class="gh">이번 주 · 평균과 최고</div>' + (rows || '<div class="emptyrow">표시할 분야가 없어요.</div>') + '</section>';
  return h;
}

/* ---------- 운동 상세 ---------- */
function viewEx(id) {
  const e = S.settings.exercises.find(x => x.id === id);
  if (!e) return viewCats();
  const r = NAV.range, info = RANGE[r], s = exStats(e);
  const bs = buckets(r, d => exSum(e.id, d), 'sum');
  const avg = bucketAvg(bs) || 0;
  const dec = e.decimals || 0;
  let h = backHdr('분야', 'cats', esc(e.name), exIcon(e), e.cls, '<a href="#" class="lnk" data-act="logEx" data-arg="' + e.id + '">기록 추가</a>') + segCtl();
  h += '<section class="card c-' + e.cls + '"><div class="ml">' + info.avgLabel + '</div><div class="big">' + exVal(avg, e) + '<span class="u">' + info.per + '</span></div>' +
    '<div class="sm">' + info.sumLabel + ' ' + exVal(bucketSum(bs), e) + '</div>';
  if (r === 'week') {
    const pct = e.weekly > 0 ? Math.min(100, s.sum7 / e.weekly * 100) : 0;
    h += '<div class="gl"><span>주간 목표</span><span>' + exGoal(e.weekly, e) + '</span></div><div class="track"><div style="width:' + pct.toFixed(1) + '%"></div></div>';
  }
  h += barChart({ items: bs, cls: e.cls, avg: avg, fmt: v => fmtN(v, dec) }) + '<div class="sm cap">점선은 평균</div></section>';
  const rows = [
    ['하루 합계', exVal(s.avg, e), exBest(s.pbDay, e)],
    [e.unit === '회' ? '한 세트' : '1회 기록', s.avgEntry == null ? dash : exVal(s.avgEntry, e), s.pbEntry ? exVal(s.pbEntry, e) : dash],
    ['주간 합계', exVal(s.sum7, e), s.pbWeek ? exVal(s.pbWeek, e) : dash]
  ];
  if (e.minutes) rows.splice(2, 0, ['페이스', fmtPace(s.pace7), fmtPace(s.pbPace)]);
  h += statTable('이번 주 평균', '개인 최고', rows, e.cls);
  const list = (S.logs.ex[e.id] || []).slice().reverse().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0).slice(0, 8);
  h += '<section class="group"><div class="gh">최근 기록 <span class="hint">눌러서 삭제</span></div>' + (list.length ? list.map(x =>
    entryRow('delEntry', 'ex|' + e.id + '|' + x.id, dateLabel(x.d), (x.m > 0 ? x.m + '분 · 페이스 ' + fmtPace(x.m / x.v) : ' '), exVal(x.v, e))).join('') : '<div class="emptyrow">아직 기록이 없어요.</div>') + '</section>';
  h += '<button type="button" class="btn full c-' + e.cls + '" data-act="logEx" data-arg="' + e.id + '">기록 추가</button>';
  return h;
}

/* ---------- 수면 ---------- */
function viewSleep() {
  const st = S.settings, r = NAV.range, info = RANGE[r], s = sleepStats(), goal = st.sleepGoal * 60;
  const bs = buckets(r, d => S.logs.sleep[d] ? S.logs.sleep[d].dur : null, 'avg');
  const items = bs.map((b, i) => {
    let below = '';
    if (r === 'week' && st.rate) { const rec = s.recs[i]; below = '<span class="rt">' + star(10) + (rec && rec.score ? rec.score : '–') + '</span>'; }
    return { label: b.label, value: b.value, today: b.today, below: below };
  });
  const fmtB = v => Math.floor(v / 60) + ':' + PAD(Math.round(v % 60));
  const avg = bucketAvg(bs);
  let h = backHdr('분야', 'cats', '수면', 'sleep', 'sleep', '<a href="#" class="lnk" data-act="logSleep" data-arg="">기록 추가</a>') + segCtl();
  h += '<section class="card c-sleep"><div class="ml">' + (r === 'week' ? '7일 평균' : info.avgLabel.replace(' (하루)', '')) + '</div><div class="bigrow"><div class="big">' + (avg == null ? dash : fmtDur(avg)) + '</div>' +
    (st.rate && s.avgScore != null ? '<div class="rate">' + star(16) + s.avgScore.toFixed(1) + '<span class="u">/ 10</span></div>' : '') + '</div>' +
    '<div class="sm">점선은 목표 ' + fmtDurShort(goal) + (r === 'week' ? ' · 7일 중 ' + s.achieved + '일 달성' : '') + (r === 'week' && st.rate ? ' · 막대 아래는 별점' : '') + '</div>' +
    barChart({ items: items, cls: 'sleep', goal: goal, fmt: fmtB, belowH: (r === 'week' && st.rate) ? 44 : 24 }) + '</section>';
  h += miniCards([
    ['평균 수면', s.avgDur == null ? dash : fmtDur(s.avgDur), '이번 주 7일 기준'],
    ['최장 수면', s.longest7 == null ? dash : fmtDur(s.longest7), '개인 최고 ' + (s.pbLong == null ? dash : fmtDur(s.pbLong))]
  ].concat(st.rate ? [
    ['평균 별점', s.avgScore == null ? dash : unitHtml(s.avgScore.toFixed(1), '/ 10'), '이번 주 7일 기준'],
    ['최고 별점', s.best7 == null ? dash : unitHtml(s.best7, '/ 10'), '개인 최고 ' + (s.pbScore == null ? dash : s.pbScore + '점')]
  ] : []));
  const t = todayStr(), rec = sleepOn(t);
  let last = '<section class="card c-sleep" aria-label="어젯밤 수면"><div class="a1">어젯밤</div>';
  if (rec) {
    last += '<div class="g3"><div><div class="ml">취침</div><div class="t22">' + esc(rec.bed) + '</div></div><div><div class="ml">기상</div><div class="t22">' + esc(rec.wake) + '</div></div><div><div class="ml">수면</div><div class="t22">' + fmtDur(rec.dur) + '</div></div></div>';
    if (st.rate) {
      const sc = rec.score || 0;
      last += '<hr><div class="qrow"><div><div class="q1">잘 잤나요?</div><div class="q2">' + (sc ? (sc >= 9 ? '아주 개운해요' : sc >= 7 ? '잘 잤어요' : sc >= 5 ? '보통이에요' : sc >= 3 ? '피곤해요' : '매우 피곤해요') : '점수를 눌러 기록해요') + '</div></div><div class="qn">' + (sc || dash) + '<span class="u">/ 10</span></div></div>' +
        '<div class="scores">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => '<button type="button" class="sc' + (n === sc ? ' on' : '') + '" data-act="score" data-arg="' + n + '" aria-pressed="' + (n === sc) + '" aria-label="' + n + '점">' + n + '</button>').join('') + '</div>' +
        '<div class="sm cap">10점 만점 · 점수를 남길수록 나에게 맞는 수면을 더 정확히 찾아요</div>';
    }
    last += '<div class="btnrow"><button type="button" class="btn ghost" data-act="logSleep" data-arg="' + t + '">기록 수정</button></div>';
  } else {
    last += '<div class="emptyin">오늘 아침 기록이 아직 없어요.</div><div class="btnrow"><button type="button" class="btn" data-act="logSleep" data-arg="' + t + '">수면 기록하기</button></div>';
  }
  h += last + '</section>';
  if (st.rate) {
    const ins = sleepInsight();
    h += '<section class="card c-sleep" aria-label="나에게 맞는 수면"><div class="a1 withi">' + ico('sleep', 18, 2) + '나에게 맞는 수면</div>';
    if (!ins.ok) {
      h += '<div class="emptyin">별점을 3일 이상 기록하면 잘 잔 날의 수면 시간과 취침 시각을 찾아드려요.</div>';
    } else {
      const range = ins.min === ins.max ? fmtDur(ins.min) + ' 전후' : fmtDur(ins.min).replace(' 0분', '') + ' ~ ' + fmtDur(ins.max).replace(' 0분', '');
      const axis = 660, a0 = 1320;
      const bedN = Math.max(a0, ins.bed), p1 = clamp((bedN - a0) / axis, 0, 1), p2 = clamp((ins.wake + 1440 - a0) / axis, 0, 1);
      h += '<div class="ml top">별점이 가장 높았던 수면 시간</div><div class="big sm26">' + range + '</div><div class="rate2">' + star(13) + '이 구간의 평균 별점 ' + ins.avg.toFixed(1) + ' / 10 · ' + ins.count + '일 기록</div><hr>' +
        '<div class="qrow"><div class="ml">추천 취침 · 기상</div><div class="q1">' + hm(ins.bed) + ' → ' + hm(ins.wake) + '</div></div>' +
        '<div class="tl"><div class="tltrack"></div><div class="tlband" style="left:' + (p1 * 100).toFixed(1) + '%;width:' + (Math.max(2, (p2 - p1) * 100)).toFixed(1) + '%"></div></div>' +
        '<div class="tlax">' + [['22시', 0], ['0시', 18.2], ['2시', 36.4], ['4시', 54.5], ['6시', 72.7], ['8시', 90.9]].map(a => '<span style="left:' + a[1] + '%">' + a[0] + '</span>').join('') + '</div><hr>' +
        '<div class="ml">수면 시간별 평균 별점 (10점 만점)</div>' + ins.groups.map(g => '<div class="grow"><div class="gn"><div class="g1">' + g.name + '</div><div class="g2">' + g.count + '일 기록' + (g.count < 2 ? ' · 참고용' : '') + '</div></div><div class="btrack"><div style="width:' + (g.avg * 10).toFixed(0) + '%"></div></div><div class="gv">' + g.avg.toFixed(1) + '</div></div>').join('');
    }
    const prog = Math.min(100, ins.n / 14 * 100);
    h += '<hr><div class="qrow"><div class="ml">분석에 쓰인 기록</div><div class="q3">' + ins.n + '일 / 14일</div></div><div class="track"><div style="width:' + prog.toFixed(0) + '%"></div></div><div class="sm cap">14일 이상 쌓이면 취침 시각과 수면 시간 추천이 더 정확해져요.</div></section>';
  }
  const list = sleepList().slice().reverse().slice(0, 7);
  h += '<section class="group"><div class="gh">최근 기록 <span class="hint">눌러서 수정</span></div>' + (list.length ? list.map(x =>
    entryRow('logSleep', x.d, dateLabel(x.d), esc(x.bed) + ' → ' + esc(x.wake), fmtDur(x.dur) + (x.score ? ' · ' + x.score + '점' : ''))).join('') : '<div class="emptyrow">아직 기록이 없어요.</div>') + '</section>';
  return h;
}

/* ---------- 가계부 ---------- */
function viewMoney() {
  const st = S.settings, r = NAV.range, info = RANGE[r], m = moneyStats();
  const bs = buckets(r, d => spendOn(d), 'sum');
  const avg = bucketAvg(bs) || 0;
  const fmtM = v => (v / 10000).toFixed(1) + '만';
  let h = backHdr('분야', 'cats', '가계부', 'money', 'money', '<a href="#" class="lnk" data-act="logMoney" data-arg="">지출 추가</a>') + segCtl();
  h += '<section class="card c-money"><div class="ml">' + info.avgLabel + '</div><div class="big">' + won(avg) + '<span class="u">' + info.per + '</span></div><div class="sm">' + info.sumLabel + ' ' + won(bucketSum(bs)) + ' · 점선은 평균</div>' +
    barChart({ items: bs, cls: 'money', avg: avg, fmt: fmtM }) + '</section>';
  const pct = st.monthly > 0 ? m.month / st.monthly * 100 : 0;
  h += '<section class="card c-money" aria-label="월 예산"><div class="bigrow"><div class="a1">' + ymNow() + ' 예산</div><div class="sm nm">남은 ' + won(Math.max(0, st.monthly - m.month)) + '</div></div>' +
    '<div class="big sm28">' + won(m.month) + '<span class="u">/ ' + won(st.monthly) + '</span></div><div class="track"><div style="width:' + Math.min(100, pct).toFixed(1) + '%"></div></div></section>';
  const mx = m.maxD ? spendOn(m.maxD) : null, mn = m.minD ? spendOn(m.minD) : null;
  h += miniCards([
    ['하루 평균', won(m.avg), '최근 7일 기준'],
    ['하루 최고 지출', mx == null ? dash : won(mx), (m.maxD ? WD[parseD(m.maxD).getDay()] + '요일 · ' : '') + '개인 최고 ' + wonBest(m.pbDay)],
    ['7일 합계', won(m.sum7), '지난 7일 ' + won(m.prev)],
    ['하루 최저 지출', mn == null ? dash : won(mn), m.minD ? WD[parseD(m.minD).getDay()] + '요일' + (m.minD === todayStr() ? ' · 오늘 진행 중' : '') : '기록 없음']
  ]);
  h += '<section class="card list c-money" aria-label="카테고리별 지출"><div class="sh2"><div class="a1b">카테고리별 · 주간 예산</div><a href="#" class="lnk" data-act="go" data-arg="settings">편집</a></div>' + st.cats.map(c => {
    const sp = catSpent7(c), p = c.weekly > 0 ? Math.round(sp / c.weekly * 100) : (sp > 0 ? 100 : 0);
    return '<div class="catrow"><div class="cr1"><span class="cn">' + esc(c.name) + '</span><span class="cv"><b>' + won(sp) + '</b> / ' + won(c.weekly) + '</span></div><div class="track' + (p >= 90 ? ' hot' : '') + '"><div style="width:' + Math.min(100, p) + '%"></div></div></div>';
  }).join('') + '</section>';
  const catName = id => { const c = st.cats.find(x => x.id === id); return c ? c.name : '기타'; };
  const ex = S.logs.exp.slice().reverse().sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0).slice(0, 12);
  let rows = '', lastD = null;
  ex.forEach(x => {
    if (x.d !== lastD) { lastD = x.d; rows += '<div class="dgh"><span>' + dateLabel(x.d) + '</span><span>−' + won(spendOn(x.d)) + '</span></div>'; }
    rows += entryRow('delEntry', 'exp|' + x.id, esc(x.memo || catName(x.cat)), esc(catName(x.cat)), '−' + won(x.amt));
  });
  h += '<section class="group"><div class="gh">최근 내역 <span class="hint">눌러서 삭제</span></div>' + (rows || '<div class="emptyrow">아직 내역이 없어요.</div>') + '</section>';
  h += '<button type="button" class="btn full c-money" data-act="logMoney" data-arg="">지출 추가</button>';
  return h;
}

/* ---------- 신앙 ---------- */
function viewFaith() {
  const st = S.settings, r = NAV.range, info = RANGE[r], f = faithStats();
  const bs = buckets(r, d => faithRec(d).pray || 0, 'sum');
  const avg = bucketAvg(bs) || 0;
  let h = backHdr('분야', 'cats', '신앙', 'faith', 'faith', '<a href="#" class="lnk" data-act="logFaith" data-arg="">기록 추가</a>') + segCtl();
  const grid = f.items.map(it => {
    const cells = f.days.map(d => '<span class="fc' + (faithDone(d, it) ? ' on' : '') + '"></span>').join('');
    const n = f.days.filter(d => faithDone(d, it)).length;
    return '<div class="frow" role="img" aria-label="' + esc(it.name) + ': 7일 중 ' + n + '일 실천"><span class="fn">' + esc(it.name) + '</span>' + cells + '</div>';
  }).join('');
  h += '<section class="card c-faith" aria-label="7일 실천 기록"><div class="ml">7일 실천률</div><div class="bigrow"><div class="big">' + (f.rate == null ? dash : Math.round(f.rate * 100) + '%') + '</div><div class="sm nm">' + f.doneTotal + ' / ' + f.total + ' 완료 · 연속 ' + f.streak + '일</div></div>' +
    '<div class="fhead"><span></span>' + f.days.map(d => '<span>' + WD[parseD(d).getDay()] + '</span>').join('') + '</div>' + (grid || '<div class="emptyin">설정에서 신앙 항목을 켜 주세요.</div>') + '</section>';
  h += '<section class="card c-faith"><div class="ml">기도 시간 · ' + info.avgLabel + '</div><div class="big">' + fmtN(avg, 0) + '<span class="u">분 ' + info.per + '</span></div><div class="sm">이번 기간 최고 ' + maxOf(bs.map(b => b.value || 0)) + '분 · 점선은 평균</div>' +
    barChart({ items: bs, cls: 'faith', avg: avg, fmt: v => fmtN(v, 0) }) + '</section>';
  const checks = checksFor(todayStr()).filter(c => c.kind === 'faith');
  h += '<section><div class="sh"><h2>오늘의 신앙 체크</h2><div class="shr"><span>' + checks.filter(c => c.done).length + ' / ' + checks.length + ' 완료</span><a href="#" class="lnk" data-act="go" data-arg="settings">편집</a></div></div><div class="group">' +
    (checks.length ? checks.map(checkRow).join('') : '<div class="emptyrow">표시할 항목이 없어요.</div>') + '</div></section>';
  h += miniCards([['현재 연속 실천', unitHtml(f.streak, '일'), '하나라도 실천한 날 기준'], ['최고 연속 실천', unitHtml(f.bestStreak, '일'), '개인 최고']]);
  h += statTable('이번 주 평균', '개인 최고', [
    ['기도 시간', Math.round(f.avgPray) + '분', f.pbPray + '분'],
    ['말씀 읽기', f.avgRead.toFixed(1) + '장 / 일', f.pbRead + '장'],
    ['하루 실천 항목', f.avgCount.toFixed(1) + '개', f.pbCount + '개']
  ], 'faith');
  h += '<section class="group c-faith"><div class="sech"><span class="sn">기도 제목</span></div>' + (st.topics.length ? st.topics.map(t =>
    '<div class="trow2"><span class="tt">' + esc(t.text) + '</span><button type="button" class="ibtn" data-act="delTopic" data-arg="' + t.id + '" aria-label="' + esc(t.text) + ' 삭제">' + ico('trash', 18, 1.8) + '</button></div>').join('') : '<div class="emptyrow">기도 제목을 추가해 보세요.</div>') +
    '<button type="button" class="addrow" data-act="addTopic">' + ico('plus', 18, 2) + '기도 제목 추가</button></section>';
  h += '<button type="button" class="btn full c-faith" data-act="logFaith" data-arg="">기도·말씀 기록</button>';
  return h;
}

/* ---------- 설정 ---------- */
function sw(label, on, act, arg) {
  return '<div class="srow2"><span class="sl2">' + label + '</span><button type="button" role="switch" aria-checked="' + on + '" aria-label="' + label + '" class="swt' + (on ? ' on' : '') + '" data-act="' + act + '" data-arg="' + arg + '"><span></span></button></div>';
}
function stepRow(title, sub, display, act, arg, minus, plus) {
  return '<div class="strow"><div class="stt"><div class="st1">' + title + '</div>' + (sub ? '<div class="st2">' + sub + '</div>' : '') + '</div>' +
    '<button type="button" class="sbt" data-act="' + act + '" data-arg="' + arg + '|-1" aria-label="' + esc(title) + ' 줄이기">' + ico('minus', 16, 2.4) + '</button><span class="sval">' + display + '</span>' +
    '<button type="button" class="sbt" data-act="' + act + '" data-arg="' + arg + '|1" aria-label="' + esc(title) + ' 늘리기">' + ico('plus', 16, 2.4) + '</button></div>';
}
function viewSettings() {
  const st = S.settings;
  let h = backHdr('분야', 'cats', '분야 설정', null, 'blue') + '<p class="subline">각 분야에 들어갈 항목과 목표를 바꿔요. 바꾼 내용은 체크·능력치·통계에 바로 반영돼요.</p>';
  const lab = t => '<h2 class="gl2">' + t + '</h2>';
  h += lab('분야 표시') + '<section class="group">' +
    sw('운동', st.show.exercise, 'tgShow', 'exercise') + sw('수면', st.show.sleep, 'tgShow', 'sleep') + sw('가계부', st.show.money, 'tgShow', 'money') + sw('신앙', st.show.faith, 'tgShow', 'faith') + '</section>';
  h += lab('운동 종목') + st.exercises.map(e => {
    const stepG = e.unit === 'km' ? 1 : 5, stepW = e.unit === 'km' ? 5 : 20;
    return '<section class="group c-' + e.cls + '"><div class="nmrow"><input class="nm" value="' + esc(e.name) + '" aria-label="종목 이름" data-chg="renEx" data-arg="' + e.id + '"><button type="button" class="ibtn" data-act="delEx" data-arg="' + e.id + '" aria-label="' + esc(e.name) + ' 삭제">' + ico('trash', 18, 1.8) + '</button></div>' +
      stepRow('하루 목표', '오늘의 체크 기준', exGoal(e.goal, e), 'stepEx', e.id + '|goal|' + stepG + '|1|1000', 0, 0) +
      stepRow('주간 목표', '진행 바 기준', exGoal(e.weekly, e), 'stepEx', e.id + '|weekly|' + stepW + '|1|5000', 0, 0) + '</section>';
  }).join('') + '<button type="button" class="dashbtn" data-act="addEx">' + ico('plus', 18, 2) + '운동 종목 추가</button>';
  h += lab('수면') + '<section class="group">' + stepRow('목표 수면 시간', '수면 화면의 점선 기준', fmtDurShort(st.sleepGoal * 60), 'stepSet', 'sleepGoal|0.5|4|12', 0, 0) +
    sw('수면 별점 기록 (10점 만점)', st.rate, 'tgRate', '') + '</section>';
  h += lab('가계부 예산') + '<section class="group">' + stepRow('월 예산', ymNow() + ' 전체 예산', won(st.monthly), 'stepSet', 'monthly|50000|100000|20000000', 0, 0) +
    st.cats.map(c => '<div class="nmrow slim"><input class="nm" value="' + esc(c.name) + '" aria-label="카테고리 이름" data-chg="renCat" data-arg="' + c.id + '"><button type="button" class="ibtn" data-act="delCat" data-arg="' + c.id + '" aria-label="' + esc(c.name) + ' 삭제">' + ico('trash', 18, 1.8) + '</button></div>' +
      stepRow('주간 예산', '', won(c.weekly), 'stepCat', c.id + '|5000', 0, 0)).join('') +
    '<button type="button" class="addrow" data-act="addCat">' + ico('plus', 18, 2) + '카테고리 추가</button></section>';
  h += lab('신앙 항목') + '<section class="group">' + st.faith.map(f =>
    '<div class="srow2"><input class="nm inl" value="' + esc(f.name) + '" aria-label="항목 이름" data-chg="renFaith" data-arg="' + f.id + '"><button type="button" role="switch" aria-checked="' + f.on + '" aria-label="' + esc(f.name) + ' 표시" class="swt' + (f.on ? ' on' : '') + '" data-act="tgFaith" data-arg="' + f.id + '"><span></span></button>' +
    (f.track ? '' : '<button type="button" class="ibtn" data-act="delFaith" data-arg="' + f.id + '" aria-label="' + esc(f.name) + ' 삭제">' + ico('trash', 18, 1.8) + '</button>') + '</div>').join('') +
    '<button type="button" class="addrow" data-act="addFaith">' + ico('plus', 18, 2) + '항목 추가</button></section>';
  h += lab('화면') + '<div class="seg" role="group" aria-label="화면 모드">' + [['auto', '자동'], ['light', '라이트'], ['dark', '다크']].map(x => '<button type="button" data-act="theme" data-arg="' + x[0] + '" aria-pressed="' + (S.theme === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
  h += lab('데이터') + '<section class="group"><div class="dnote">기록은 이 브라우저에만 저장돼요. 브라우저 데이터를 지우면 사라지니, 가끔 내보내기로 백업해 두세요.</div>' +
    '<button type="button" class="drow" data-act="seed">예시 데이터 채우기</button><button type="button" class="drow" data-act="exportData">데이터 내보내기 (JSON 백업)</button><button type="button" class="drow" data-act="importData">데이터 가져오기 (JSON 백업)</button><button type="button" class="drow danger" data-act="resetAll">모든 데이터 지우기</button></section>';
  return h;
}

const VIEWS = {
  today: () => viewToday(), cats: () => viewCats(), skills: () => viewSkills(), stats: () => viewStats(),
  ex: () => viewEx(NAV.arg), sleep: () => viewSleep(), money: () => viewMoney(), faith: () => viewFaith(), settings: () => viewSettings()
};
const TAB_OF = { today: 'today', cats: 'cats', skills: 'skills', stats: 'stats', ex: 'cats', sleep: 'cats', money: 'cats', faith: 'cats', settings: 'cats' };

/* ================= 시트(입력 창) ================= */
let SHEET = null;
const byId = id => document.getElementById(id);
const val = id => { const el = byId(id); return el ? el.value : ''; };
function field(label, id, type, value, attrs) {
  return '<div class="fld"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + type + '" value="' + esc(value) + '" ' + (attrs || '') + '></div>';
}
function chipsHtml(grp, options, sel) {
  return '<div class="chipsel" role="group">' + options.map(o => '<button type="button" class="cs' + (String(o.v) === String(sel) ? ' on' : '') + '" data-act="pickVal" data-arg="' + grp + '|' + esc(o.v) + '" data-grp="' + grp + '" aria-pressed="' + (String(o.v) === String(sel)) + '">' + esc(o.l) + '</button>').join('') + '</div>';
}
const ERR = '<div class="err" id="serr" role="alert"></div>';
function setErr(msg) { const el = byId('serr'); if (el) el.textContent = msg; }
function openSheet(title, body, onSave, o) {
  o = o || {};
  SHEET = { vals: o.vals || {}, onSave: onSave };
  const el = byId('sheet');
  el.innerHTML = '<div class="sbg" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
    '<div class="shh"><button type="button" class="sb" data-act="closeSheet">취소</button><div class="stt2">' + esc(title) + '</div><button type="button" class="sb strong' + (o.danger ? ' danger' : '') + '" data-act="sheetSave">' + esc(o.save || '저장') + '</button></div>' +
    '<div class="shb">' + body + '</div></div>';
  el.classList.add('open');
  document.documentElement.classList.add('noscroll');
  setTimeout(() => { const f = el.querySelector('input:not([type=hidden])'); if (f && o.focus !== false) f.focus(); }, 60);
}
function closeSheet() {
  SHEET = null;
  const el = byId('sheet');
  el.classList.remove('open'); el.innerHTML = '';
  document.documentElement.classList.remove('noscroll');
}
let toastTimer = null;
function toast(msg) {
  const el = byId('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}
function confirmSheet(title, msg, label, fn) {
  openSheet(title, '<p class="cmsg">' + msg + '</p>', () => { fn(); }, { save: label, danger: true, focus: false });
}

function sheetLogEx(id) {
  const e = S.settings.exercises.find(x => x.id === id);
  if (!e) return;
  const t = todayStr();
  const body = field('날짜', 'f-date', 'date', t, 'max="' + t + '"') +
    field(esc(e.name) + ' (' + esc(e.unit) + ')', 'f-val', 'number', '', 'inputmode="decimal" step="' + (e.decimals ? '0.1' : '1') + '" min="0" placeholder="목표 ' + e.goal + '"') +
    (e.minutes ? field('걸린 시간 (분, 선택)', 'f-min', 'number', '', 'inputmode="numeric" step="1" min="0"') : '') +
    '<p class="fhint">오늘 합계 ' + exVal(exSum(e.id, t), e) + ' · 목표 ' + exGoal(e.goal, e) + '</p>' + ERR;
  openSheet(esc(e.name) + ' 기록', body, () => {
    const d = val('f-date'), v = parseFloat(val('f-val'));
    if (!d || d > t) return setErr('날짜를 확인해 주세요.');
    if (!(v > 0)) return setErr('값을 입력해 주세요.');
    const rec = { id: uid(), d: d, v: v };
    const m = e.minutes ? parseFloat(val('f-min')) : NaN;
    if (m > 0) rec.m = Math.round(m);
    (S.logs.ex[e.id] = S.logs.ex[e.id] || []).push(rec);
    commit(); closeSheet(); toast('저장했어요'); render();
  });
}
function sheetSleep(date) {
  const t = todayStr(), d0 = date || t, ex = S.logs.sleep[d0];
  const vals = { score: ex && ex.score ? ex.score : '' };
  const body = field('기상한 날', 'f-date', 'date', d0, 'max="' + t + '"') +
    '<div class="two">' + field('취침 시각', 'f-bed', 'time', ex ? ex.bed : '23:30') + field('기상 시각', 'f-wake', 'time', ex ? ex.wake : '07:00') + '</div>' +
    (S.settings.rate ? '<div class="fld"><label>잘 잤나요? (10점 만점)</label><div class="scoregrid" role="group">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => '<button type="button" class="cs' + (n === vals.score ? ' on' : '') + '" data-act="pickVal" data-arg="score|' + n + '" data-grp="score" aria-pressed="' + (n === vals.score) + '">' + n + '</button>').join('') + '</div></div>' : '') +
    (ex ? '<button type="button" class="btn ghost danger" data-act="delSleep" data-arg="' + d0 + '">이 기록 삭제</button>' : '') + ERR;
  openSheet('수면 기록', body, () => {
    const d = val('f-date'), bed = val('f-bed'), wake = val('f-wake');
    if (!d || d > t) return setErr('날짜를 확인해 주세요.');
    if (!bed || !wake) return setErr('취침과 기상 시각을 입력해 주세요.');
    const dur = (toMin(wake) - toMin(bed) + 1440) % 1440;
    if (dur < 60 || dur > 18 * 60) return setErr('수면 시간이 너무 짧거나 길어요. 시각을 확인해 주세요.');
    const rec = { bed: bed, wake: wake, dur: dur };
    if (S.settings.rate && SHEET.vals.score) rec.score = Number(SHEET.vals.score);
    S.logs.sleep[d] = rec;
    commit(); closeSheet(); toast('저장했어요'); render();
  }, { vals: vals, focus: false });
}
function sheetMoney() {
  const t = todayStr(), cats = S.settings.cats;
  const vals = { cat: cats.length ? cats[0].id : '' };
  const showNo = !spendOn(t) && !S.logs.nospend[t];
  const body = field('금액 (원)', 'f-amt', 'number', '', 'inputmode="numeric" step="100" min="0" placeholder="0"') +
    '<div class="fld"><label>카테고리</label>' + chipsHtml('cat', cats.map(c => ({ v: c.id, l: c.name })), vals.cat) + '</div>' +
    field('메모 (선택)', 'f-memo', 'text', '', 'maxlength="40" placeholder="예: 점심"') +
    field('날짜', 'f-date', 'date', t, 'max="' + t + '"') +
    (showNo ? '<button type="button" class="btn ghost" data-act="noSpend">오늘은 지출 없음</button>' : '') + ERR;
  openSheet('지출 추가', body, () => {
    const d = val('f-date'), amt = Math.round(parseFloat(val('f-amt')));
    if (!d || d > t) return setErr('날짜를 확인해 주세요.');
    if (!(amt > 0)) return setErr('금액을 입력해 주세요.');
    S.logs.exp.push({ id: uid(), d: d, cat: SHEET.vals.cat, amt: amt, memo: val('f-memo').trim() });
    commit(); closeSheet(); toast('저장했어요'); render();
  }, { vals: vals });
}
function sheetFaith() {
  const t = todayStr(), rec = faithRec(t), items = S.settings.faith.filter(f => f.on);
  const pray = items.some(f => f.track === 'pray'), read = items.some(f => f.track === 'read');
  if (!pray && !read) { toast('설정에서 말씀 읽기나 기도 항목을 켜 주세요'); return; }
  const body = field('날짜', 'f-date', 'date', t, 'max="' + t + '"') +
    (pray ? field('기도 시간 (분)', 'f-pray', 'number', rec.pray || '', 'inputmode="numeric" step="1" min="0"') : '') +
    (read ? field('말씀 읽기 (장)', 'f-read', 'number', rec.read || '', 'inputmode="numeric" step="1" min="0"') : '') + ERR;
  openSheet('기도·말씀 기록', body, () => {
    const d = val('f-date');
    if (!d || d > t) return setErr('날짜를 확인해 주세요.');
    const r = S.logs.faith[d] = S.logs.faith[d] || {};
    if (pray && val('f-pray') !== '') r.pray = Math.max(0, Math.round(parseFloat(val('f-pray')) || 0));
    if (read && val('f-read') !== '') r.read = Math.max(0, Math.round(parseFloat(val('f-read')) || 0));
    commit(); closeSheet(); toast('저장했어요'); render();
  });
}
function sheetAddEx() {
  const vals = { unit: 'km', kind: 'cardio' };
  const body = field('종목 이름', 'f-name', 'text', '', 'maxlength="14" placeholder="예: 자전거"') +
    '<div class="fld"><label>단위</label>' + chipsHtml('unit', [{ v: 'km', l: 'km' }, { v: '회', l: '회' }, { v: '분', l: '분' }], 'km') + '</div>' +
    '<div class="fld"><label>어느 능력치에 반영할까요?</label>' + chipsHtml('kind', [{ v: 'cardio', l: '체력' }, { v: 'strength', l: '근력' }], 'cardio') + '</div>' +
    field('하루 목표', 'f-goal', 'number', '', 'inputmode="decimal" step="any" min="0" placeholder="예: 5"') + ERR;
  openSheet('운동 종목 추가', body, () => {
    const name = val('f-name').trim(), goal = parseFloat(val('f-goal'));
    if (!name) return setErr('종목 이름을 입력해 주세요.');
    if (!(goal > 0)) return setErr('하루 목표를 입력해 주세요.');
    const custom = S.settings.exercises.filter(e => /^x/.test(e.cls)).length;
    const unit = SHEET.vals.unit;
    S.settings.exercises.push({ id: 'x' + uid(), name: name, unit: unit, goal: goal, weekly: Math.round(goal * 5 * 10) / 10, cls: 'x' + (custom % 3 + 1), kind: SHEET.vals.kind, decimals: unit === 'km' ? 1 : 0, minutes: unit === 'km' });
    commit(); closeSheet(); toast('추가했어요'); render();
  }, { vals: vals });
}
function sheetAddCat() {
  const body = field('카테고리 이름', 'f-name', 'text', '', 'maxlength="12" placeholder="예: 문화생활"') +
    field('주간 예산 (원)', 'f-w', 'number', '', 'inputmode="numeric" step="1000" min="0" placeholder="30000"') + ERR;
  openSheet('카테고리 추가', body, () => {
    const name = val('f-name').trim(), w = Math.round(parseFloat(val('f-w')));
    if (!name) return setErr('이름을 입력해 주세요.');
    S.settings.cats.push({ id: 'c' + uid(), name: name, weekly: w > 0 ? w : 0 });
    commit(); closeSheet(); toast('추가했어요'); render();
  });
}
function sheetAddFaith() {
  const body = field('항목 이름', 'f-name', 'text', '', 'maxlength="14" placeholder="예: 큐티"') + ERR;
  openSheet('신앙 항목 추가', body, () => {
    const name = val('f-name').trim();
    if (!name) return setErr('이름을 입력해 주세요.');
    S.settings.faith.push({ id: 'f' + uid(), name: name, on: true, track: null });
    commit(); closeSheet(); toast('추가했어요'); render();
  });
}
function sheetAddTopic() {
  const body = field('기도 제목', 'f-text', 'text', '', 'maxlength="40" placeholder="예: 가족의 건강"') + ERR;
  openSheet('기도 제목 추가', body, () => {
    const text = val('f-text').trim();
    if (!text) return setErr('내용을 입력해 주세요.');
    S.settings.topics.push({ id: 't' + uid(), text: text });
    commit(); closeSheet(); toast('추가했어요'); render();
  });
}

/* ================= 동작 & 시작 ================= */
const ACT = {
  go(arg) {
    const p = arg.split('|');
    NAV.route = p[0]; NAV.arg = p[1] || null;
    if (['ex', 'sleep', 'money', 'faith'].indexOf(p[0]) >= 0) NAV.range = 'week';
    render(true);
  },
  range(arg) { NAV.range = arg; render(); },
  weeks(arg) { NAV.weeks = Number(arg); render(); },
  vis(arg) { NAV.vis[arg] = NAV.vis[arg] === false; render(); },
  logEx(arg) { sheetLogEx(arg); },
  logSleep(arg) { sheetSleep(arg || todayStr()); },
  logMoney() { sheetMoney(); },
  logFaith() { sheetFaith(); },
  check(arg) {
    const t = todayStr(), p = arg.split(':');
    if (p[0] === 'ex') sheetLogEx(p[1]);
    else if (p[0] === 'sleep') sheetSleep(t);
    else if (p[0] === 'money') sheetMoney();
    else if (p[0] === 'faith') {
      const it = S.settings.faith.find(f => f.id === p[1]);
      if (!it) return;
      const r = S.logs.faith[t] = S.logs.faith[t] || {};
      r.done = r.done || {};
      r.done[it.id] = !faithDone(t, it);
      commit(); render();
    }
  },
  score(arg) {
    const t = todayStr(), r = S.logs.sleep[t];
    if (!r) return;
    r.score = Number(arg); commit(); render();
  },
  delEntry(arg) {
    const p = arg.split('|');
    confirmSheet('기록 삭제', '이 기록을 삭제할까요?', '삭제', () => {
      if (p[0] === 'ex') S.logs.ex[p[1]] = (S.logs.ex[p[1]] || []).filter(x => x.id !== p[2]);
      else S.logs.exp = S.logs.exp.filter(x => x.id !== p[1]);
      commit(); closeSheet(); toast('삭제했어요'); render();
    });
  },
  delSleep(arg) { delete S.logs.sleep[arg]; commit(); closeSheet(); toast('삭제했어요'); render(); },
  noSpend() { S.logs.nospend[todayStr()] = true; commit(); closeSheet(); toast('오늘은 지출 없음으로 기록했어요'); render(); },
  seed() {
    const run = () => { seedSample(); closeSheet(); toast('예시 데이터를 채웠어요'); render(); };
    if (hasAnyData()) confirmSheet('예시 데이터 채우기', '지금까지의 기록이 예시 데이터로 바뀌어요. 설정은 그대로 유지돼요.', '바꾸기', run);
    else run();
  },
  exportData() {
    try {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = '자기관리-백업-' + todayStr() + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('백업 파일을 저장했어요');
    } catch (e) { toast('내보내기에 실패했어요'); }
  },
  importData() { const f = byId('importFile'); if (f) f.click(); },
  resetAll() {
    confirmSheet('모든 데이터 지우기', '기록과 설정이 모두 초기화돼요. 되돌릴 수 없어요.', '지우기', () => {
      const theme = S.theme;
      S = defaultState(); S.theme = theme; commit(); closeSheet(); toast('초기화했어요'); render();
    });
  },
  theme(arg) { S.theme = arg; applyTheme(); commit(); render(); },
  tgShow(arg) { S.settings.show[arg] = !S.settings.show[arg]; commit(); render(); },
  tgRate() { S.settings.rate = !S.settings.rate; commit(); render(); },
  tgFaith(arg) { const f = S.settings.faith.find(x => x.id === arg); if (f) { f.on = !f.on; commit(); render(); } },
  stepEx(arg) {
    const p = arg.split('|'), e = S.settings.exercises.find(x => x.id === p[0]);
    if (!e) return;
    const step = Number(p[2]), lo = Number(p[3]), hi = Number(p[4]), dir = Number(p[5]);
    e[p[1]] = clamp(Math.round((e[p[1]] + dir * step) * 10) / 10, lo, hi);
    commit(); render();
  },
  stepSet(arg) {
    const p = arg.split('|'), step = Number(p[1]), lo = Number(p[2]), hi = Number(p[3]), dir = Number(p[4]);
    S.settings[p[0]] = clamp(Math.round((S.settings[p[0]] + dir * step) * 10) / 10, lo, hi);
    commit(); render();
  },
  stepCat(arg) {
    const p = arg.split('|'), c = S.settings.cats.find(x => x.id === p[0]);
    if (!c) return;
    c.weekly = clamp(c.weekly + Number(p[2]) * Number(p[1]), 0, 2000000);
    commit(); render();
  },
  addEx() { sheetAddEx(); }, addCat() { sheetAddCat(); }, addFaith() { sheetAddFaith(); }, addTopic() { sheetAddTopic(); },
  delEx(arg) {
    const e = S.settings.exercises.find(x => x.id === arg);
    if (!e) return;
    confirmSheet('종목 삭제', '‘' + esc(e.name) + '’ 종목과 그 기록이 모두 삭제돼요.', '삭제', () => {
      S.settings.exercises = S.settings.exercises.filter(x => x.id !== arg);
      delete S.logs.ex[arg];
      commit(); closeSheet(); render();
    });
  },
  delCat(arg) {
    const c = S.settings.cats.find(x => x.id === arg);
    if (!c) return;
    confirmSheet('카테고리 삭제', '‘' + esc(c.name) + '’ 카테고리를 삭제할까요? 이미 입력한 지출은 ‘기타’로 보여요.', '삭제', () => {
      S.settings.cats = S.settings.cats.filter(x => x.id !== arg);
      commit(); closeSheet(); render();
    });
  },
  delFaith(arg) { S.settings.faith = S.settings.faith.filter(x => x.id !== arg); commit(); render(); },
  delTopic(arg) { S.settings.topics = S.settings.topics.filter(x => x.id !== arg); commit(); render(); },
  closeSheet() { closeSheet(); },
  sheetSave() { if (SHEET && SHEET.onSave) SHEET.onSave(); },
  pickVal(arg, el) {
    if (!SHEET) return;
    const i = arg.indexOf('|'), grp = arg.slice(0, i), v = arg.slice(i + 1);
    SHEET.vals[grp] = v;
    byId('sheet').querySelectorAll('[data-grp="' + grp + '"]').forEach(b => {
      const on = b === el;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    });
  }
};
const CHG = {
  renEx(arg, v) { const e = S.settings.exercises.find(x => x.id === arg); if (e && v.trim()) e.name = v.trim(); commit(); render(); },
  renCat(arg, v) { const c = S.settings.cats.find(x => x.id === arg); if (c && v.trim()) c.name = v.trim(); commit(); render(); },
  renFaith(arg, v) { const f = S.settings.faith.find(x => x.id === arg); if (f && v.trim()) f.name = v.trim(); commit(); render(); }
};

function applyTheme() {
  const r = document.documentElement;
  if (S.theme === 'dark' || S.theme === 'light') r.setAttribute('data-theme', S.theme); else r.removeAttribute('data-theme');
}
let LAST = null;
function render(top) {
  const v = byId('view');
  let html;
  try { html = VIEWS[NAV.route](); }
  catch (err) {
    if (typeof console !== 'undefined') console.error(err);
    html = '<section class="card emptyc"><div class="et">화면을 그리다 문제가 생겼어요.</div><div class="btnrow"><button type="button" class="btn" data-act="go" data-arg="today">처음으로</button></div></section>';
  }
  const y = window.scrollY, same = LAST && LAST.route === NAV.route && LAST.arg === NAV.arg;
  v.innerHTML = html;
  LAST = { route: NAV.route, arg: NAV.arg };
  const tab = TAB_OF[NAV.route];
  document.querySelectorAll('#tabs [data-tab]').forEach(a => {
    const on = a.getAttribute('data-tab') === tab;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  if (top || !same) window.scrollTo(0, 0); else window.scrollTo(0, y);
}
function init() {
  const loaded = loadLocal();
  if (loaded) S = loaded;
  applyTheme();
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = ACT[el.getAttribute('data-act')];
    if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    fn(el.getAttribute('data-arg') || '', el, e);
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-chg]');
    if (!el) return;
    const fn = CHG[el.getAttribute('data-chg')];
    if (fn) fn(el.getAttribute('data-arg'), el.value, el);
  });
  const imp = byId('importFile');
  if (imp) imp.addEventListener('change', () => {
    const file = imp.files && imp.files[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const o = JSON.parse(String(rd.result));
        if (!o || typeof o !== 'object' || !o.settings || !o.logs) throw new Error('bad');
        confirmSheet('데이터 가져오기', '현재 기록과 설정이 가져온 파일의 내용으로 바뀌어요.', '가져오기', () => {
          S = normalize(o); commit(); applyTheme(); closeSheet(); toast('가져왔어요'); render(true);
        });
      } catch (e) { toast('올바른 백업 파일이 아니에요'); }
      imp.value = '';
    };
    rd.readAsText(file);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && SHEET) closeSheet(); });
  render(true);
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(() => {});
}
if (typeof document !== 'undefined' && document.getElementById('view')) init();

