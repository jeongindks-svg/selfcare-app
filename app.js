'use strict';
const APP_VERSION = 10;   // sw.js 의 CACHE 숫자와 같이 올려요
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
function fmtMS(min) {
  const t = Math.round(min * 60), m = Math.floor(t / 60), s = t % 60;
  return m === 0 ? s + '초' : (s ? m + '분 ' + s + '초' : m + '분');
}
function fmtRec(min) {
  const t = Math.round(min * 60);
  return t >= 3600 ? Math.floor(t / 3600) + ':' + PAD(Math.floor(t % 3600 / 60)) + ':' + PAD(t % 60) : fmtMS(min);
}
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
      show: { exercise: true, sleep: true, money: true, faith: true, bucket: true, wish: true },
      exercises: [
        { id: 'run', name: '러닝', unit: 'km', goal: 5, weekly: 20, cls: 'run', kind: 'cardio', decimals: 1, minutes: true, goals: [] },
        { id: 'push', name: '팔굽혀펴기', unit: '회', goal: 40, weekly: 200, cls: 'push', kind: 'strength', decimals: 0, minutes: false, goals: [] }
      ],
      sleepGoal: 7, rate: true,
      monthly: 800000, monthBudgets: {},
      cats: [
        { id: 'c1', name: '식비', monthly: 300000, subs: [] }, { id: 'c2', name: '교통', monthly: 100000, subs: [] },
        { id: 'c3', name: '카페', monthly: 80000, subs: [] }, { id: 'c4', name: '쇼핑', monthly: 100000, subs: [] },
        { id: 'c5', name: '헌금·기부', monthly: 100000, subs: [] }, { id: 'c6', name: '기타', monthly: 50000, subs: [] }
      ],
      faith: [
        { id: 'f1', name: '말씀 읽기', on: true, track: 'read' }, { id: 'f2', name: '기도', on: true, track: 'pray' },
        { id: 'f3', name: '감사 일기', on: true, track: null }, { id: 'f4', name: '성경 암송', on: true, track: null },
        { id: 'f5', name: '예배 참석', on: false, track: null }
      ],
      topics: [], fixed: []
    },
    logs: { ex: {}, sleep: {}, exp: [], faith: {}, nospend: {}, inc: [], notes: [] },
    bucket: [], wish: []
  };
}
function normalize(o) {
  const d = defaultState();
  if (!o || typeof o !== 'object') return d;
  const s = Object.assign({}, d, o);
  const os = o.settings || {};
  s.settings = Object.assign({}, d.settings, os);
  s.settings.show = Object.assign({}, d.settings.show, os.show || {});
  ['exercises', 'cats', 'faith', 'topics', 'fixed'].forEach(k => { if (!Array.isArray(s.settings[k])) s.settings[k] = d.settings[k]; });
  s.settings.exercises = s.settings.exercises.map(e => Object.assign({}, e, { cls: e.kind === 'strength' ? 'push' : 'run', goals: Array.isArray(e.goals) ? e.goals : [] }));
  if (!s.settings.monthBudgets || typeof s.settings.monthBudgets !== 'object' || Array.isArray(s.settings.monthBudgets)) s.settings.monthBudgets = {};
  s.settings.topics = s.settings.topics.map(t => ({ id: t.id, text: t.text, done: !!t.done }));
  s.settings.fixed = s.settings.fixed.map(f => Object.assign({}, f, { applied: f.applied || {} }));
  s.settings.cats = s.settings.cats.map(c => ({ id: c.id, name: c.name, monthly: c.monthly != null ? c.monthly : (c.weekly || 0) * 4, subs: Array.isArray(c.subs) ? c.subs : [] }));
  s.logs = Object.assign({}, d.logs, o.logs || {});
  ['ex', 'sleep', 'faith', 'nospend'].forEach(k => { if (!s.logs[k] || typeof s.logs[k] !== 'object' || Array.isArray(s.logs[k])) s.logs[k] = {}; });
  ['exp', 'inc', 'notes'].forEach(k => { if (!Array.isArray(s.logs[k])) s.logs[k] = []; });
  ['bucket', 'wish'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
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
function commit() { S.updatedAt = Date.now(); VER++; saveLocal(); queueSync(); }


/* ================= 인덱스 & 지표 ================= */
let IX = { ver: -1 };
function ix() {
  if (IX.ver === VER) return IX;
  const o = { ver: VER, ex: {}, spend: {}, spendCat: {}, inc: {}, first: null };
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
  S.logs.inc.forEach(r => { o.inc[r.d] = (o.inc[r.d] || 0) + r.amt; upd(r.d); });
  S.logs.notes.forEach(r => upd(r.d));
  Object.keys(S.logs.faith).forEach(upd);
  Object.keys(S.logs.nospend).forEach(upd);
  IX = o;
  return o;
}
const hasAnyData = () => !!ix().first;
const exSum = (id, d) => (ix().ex[id] && ix().ex[id][d]) || 0;
const spendOn = d => ix().spend[d] || 0;
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

/* 고정 지출: 매달 정해진 날짜에 자동으로 지출 내역을 만들어요 */
function nextYM(ym) { const p = ym.split('-').map(Number); const d = new Date(p[0], p[1], 1); return d.getFullYear() + '-' + PAD(d.getMonth() + 1); }
function applyFixed() {
  const t = todayStr(), nowYM = t.slice(0, 7);
  let changed = false;
  S.settings.fixed.forEach(f => {
    f.applied = f.applied || {};
    for (let ym = f.since; ym <= nowYM; ym = nextYM(ym)) {
      if (f.applied[ym]) continue;
      const p = ym.split('-').map(Number), last = new Date(p[0], p[1], 0).getDate();
      const d = ym + '-' + PAD(Math.min(f.day, last));
      if (d > t) break;
      const rec = { id: 'fx-' + f.id + '-' + ym, d: d, cat: f.cat, amt: f.amt, memo: f.name, fixed: f.id };
      if (f.sub) rec.sub = f.sub;
      S.logs.exp.push(rec);
      f.applied[ym] = true; changed = true;
    }
  });
  return changed;
}

/* 하루 활동: 켜 둔 분야 중 몇 곳에 기록이 있는지 */
function activityFor(d) {
  const st = S.settings;
  let n = 0, total = 0;
  if (st.show.exercise) { total++; if (st.exercises.some(e => exSum(e.id, d) > 0)) n++; }
  if (st.show.sleep) { total++; if (sleepOn(d)) n++; }
  if (st.show.money) { total++; if (spendOn(d) > 0 || S.logs.nospend[d]) n++; }
  if (st.show.faith) { total++; if (faithCount(d) > 0) n++; }
  return { n: n, total: total };
}

/* ================= Growth 점수 =================
   모두 "내가 정한 기준을 얼마나 지켰는가"를 0~100%로 보여줘요. 기록이 3일 미만이면 점수를 내지 않아요. */
const MIN_DAYS = 3;
const ABIL = [
  { k: 'body', name: '체력', cls: 'run', src: '체력 운동 · 주간 목표 달성도', how: '러닝처럼 체력을 쓰는 운동의 최근 7일 합계를 주간 목표로 나눈 값이에요. 목표를 넘겨도 100점까지만 계산해요. 참고로 WHO는 성인에게 주 150분 이상의 유산소 활동을 권고해요.' },
  { k: 'strength', name: '근력', cls: 'push', src: '근력 운동 · 주간 목표 달성도', how: '팔굽혀펴기처럼 근력 운동의 최근 7일 합계를 주간 목표로 나눈 값이에요. 참고로 WHO는 성인에게 주 2일 이상의 근력 운동을 권고해요.' },
  { k: 'rest', name: '회복', cls: 'sleep', src: '수면 · 목표 시간을 채운 날', how: '기록한 밤 중 목표 수면 시간 이상 잔 밤의 비율이에요. 성인은 하루 7시간 이상을 규칙적으로 자라고 권고돼요(미국수면의학회·수면연구학회). 평점은 점수에 넣지 않고 따로 보여드려요.' },
  { k: 'steady', name: '꾸준함', cls: 'blue', src: '기록 · 7일 중 기록한 날', how: '최근 7일 중 하나라도 기록한 날의 비율이에요. 얼마나 잘했는지가 아니라 얼마나 꾸준히 챙겼는지를 봐요.' },
  { k: 'money', name: '재정', cls: 'money', src: '가계부 · 월 예산 페이스', how: '최근 30일 지출을 그 기간의 월 예산 몫과 비교한 값이에요. 예산 안이면 100점이고, 넘을수록 낮아져요. 지출을 기록한 날이 3일 이상일 때만 계산해요.' },
  { k: 'faith', name: '신앙', cls: 'faith', src: '신앙 · 항목 실천률', how: '켜 둔 신앙 항목을 최근 7일 동안 얼마나 실천했는지의 비율이에요.' }
];
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
function minDate(list) { return list.length ? list.reduce((a, b) => a < b ? a : b) : null; }
function growthAt(end) {
  const o = ix(), st = S.settings;
  const win = last7(end);
  const daysFrom = start => win.filter(d => start && d >= start);   // 그 분야를 쓰기 시작한 날부터
  const days = daysFrom(o.first), n = days.length;
  const out = {};
  ABIL.forEach(a => { out[a.k] = { v: null, basis: '', n: n }; });
  if (n === 0) return out;
  const exScore = (key, kind) => {
    const ex = st.exercises.filter(e => e.kind === kind && e.weekly > 0);
    if (!st.show.exercise || !ex.length) return;
    const dk = daysFrom(minDate([].concat.apply([], ex.map(e => Object.keys(o.ex[e.id] || {})))));
    out[key].n = dk.length;
    if (dk.length < MIN_DAYS) return;
    const parts = ex.map(e => { const s = sum(dk.map(d => exSum(e.id, d))); return { e: e, s: s, a: Math.min(1, s / (e.weekly * dk.length / 7)) }; });
    out[key].v = Math.round(100 * sum(parts.map(p => p.a)) / parts.length);
    out[key].basis = parts.map(p => p.e.name + ' ' + exVal(p.s, p.e) + ' / 주간 목표 ' + exGoal(p.e.weekly, p.e)).join(' · ') + (dk.length < 7 ? ' (' + dk.length + '일 기준)' : '');
  };
  exScore('body', 'cardio'); exScore('strength', 'strength');
  if (st.show.sleep) {
    const recs = days.map(sleepOn).filter(Boolean);
    out.rest.n = recs.length;
    if (recs.length >= MIN_DAYS) {
      const ok = recs.filter(r => r.dur >= st.sleepGoal * 60).length;
      out.rest.v = Math.round(100 * ok / recs.length);
      out.rest.basis = recs.length + '일 기록 중 ' + ok + '일 ' + fmtDurShort(st.sleepGoal * 60) + ' 이상';
    }
  }
  const act = days.filter(d => activityFor(d).n > 0).length;
  if (n >= MIN_DAYS) { out.steady.v = Math.round(100 * act / n); out.steady.basis = n + '일 중 ' + act + '일 기록'; }
  if (st.show.money && budgetTotal() > 0) {
    const logged = days.filter(d => spendOn(d) > 0 || S.logs.nospend[d]).length;
    out.money.n = logged;
    if (logged >= MIN_DAYS) {
      const d30 = []; for (let i = 29; i >= 0; i--) { const d = addDays(end, -i); if (d >= o.first) d30.push(d); }
      const spent = sum(d30.map(spendOn)), expected = budgetTotal() * d30.length / 30.4, pace = spent / expected;
      out.money.v = pace <= 1 ? 100 : Math.max(0, Math.round(100 * (2 - pace)));
      out.money.basis = '최근 ' + d30.length + '일 지출 ' + won(spent) + ' · 예산 ' + won(Math.round(expected)) + ' 기준';
    }
  }
  if (st.show.faith) {
    const items = faithItems();
    const df = daysFrom(minDate(Object.keys(S.logs.faith).concat(S.logs.notes.map(x => x.d))));
    out.faith.n = df.length;
    if (items.length && df.length >= MIN_DAYS) {
      const done = sum(df.map(faithCount));
      out.faith.v = Math.round(100 * done / (items.length * df.length));
      out.faith.basis = df.length + '일 동안 ' + done + ' / ' + (items.length * df.length) + '번 실천';
    }
  }
  return out;
}
function compositeG(g) {
  const vs = visibleAbil().map(a => g[a.k].v).filter(v => v != null);
  return vs.length >= 2 ? Math.round(sum(vs) / vs.length) : null;
}
function growthHistory(weeks) {
  const t = todayStr(), h = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = addDays(t, -7 * i), g = growthAt(end);
    h.push({ end: end, g: g, comp: compositeG(g) });
  }
  return h;
}
function growthSeries(hist, key) { return hist.map(h => key === 'all' ? h.comp : h.g[key].v); }

/* 기간별 버킷: week(7일) / month(5주) / half(6개월) */
function bucketDays(range) {
  const t = todayStr(), out = [];
  if (range === 'week') {
    for (let i = 6; i >= 0; i--) { const d = addDays(t, -i); out.push({ label: WD[parseD(d).getDay()], today: i === 0, days: [d] }); }
  } else if (range === 'month') {
    for (let b = 4; b >= 0; b--) {
      const days = [];
      for (let i = 6; i >= 0; i--) days.push(addDays(t, -7 * b - i));
      out.push({ label: b === 0 ? '이번 주' : b + '주 전', today: b === 0, days: days });
    }
  } else {
    const now = parseD(t);
    for (let k = 5; k >= 0; k--) {
      const first = new Date(now.getFullYear(), now.getMonth() - k, 1), last = new Date(now.getFullYear(), now.getMonth() - k + 1, 0);
      const days = [];
      for (let d = new Date(first); d <= last && ymd(d) <= t; d.setDate(d.getDate() + 1)) days.push(ymd(d));
      out.push({ label: (first.getMonth() + 1) + '월', today: k === 0, days: days });
    }
  }
  return out;
}
function buckets(range, valFn, agg) {
  const reduce = vals => {
    const v = vals.filter(x => x != null);
    if (!v.length) return null;
    return agg === 'avg' ? sum(v) / v.length : sum(v);
  };
  return bucketDays(range).map(b => ({ label: b.label, today: b.today, value: reduce(b.days.map(valFn)) }));
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

/* 운동 목표: 일간·주간·월간 합계, 또는 "주 2일, 하루 5km 이상" 같은 횟수 목표 */
const GOAL_LABEL = { day: '일간', week: '주간', month: '월간' };
function goalDays(period) {
  const t = todayStr();
  if (period === 'day') return [t];
  const start = period === 'week' ? weekKey(t) : t.slice(0, 7) + '-01', out = [];
  for (let d = start; d <= t; d = addDays(d, 1)) out.push(d);
  return out;
}
function goalProgress(e, g) {
  const vals = goalDays(g.period).map(d => exSum(e.id, d));
  const cur = g.type === 'days' ? vals.filter(v => v > 0 && v >= (g.min || 0)).length : sum(vals);
  return { cur: cur, pct: g.target > 0 ? Math.min(100, cur / g.target * 100) : 0, done: cur >= g.target };
}
function goalTitle(e, g) {
  if (g.type === 'days') return (g.period === 'week' ? '주 ' : '월 ') + g.target + '일 · 하루 ' + exGoal(g.min, e) + ' 이상';
  return GOAL_LABEL[g.period] + ' 목표 ' + exGoal(g.target, e);
}
const goalCur = (e, g, p) => g.type === 'days' ? p.cur + ' / ' + g.target + '일' : exVal(p.cur, e) + ' / ' + exGoal(g.target, e);
function goalRow(e, g, withName) {
  const p = goalProgress(e, g);
  return '<div class="gcrow c-' + e.cls + '"><div class="gc1"><span class="gct">' + (withName ? esc(e.name) + ' · ' : '') + esc(goalTitle(e, g)) + '</span><span class="gcv' + (p.done ? ' ok' : '') + '">' + (p.done ? '달성 · ' : '') + esc(goalCur(e, g, p)) + '</span></div><div class="track' + (p.done ? ' done' : '') + '"><div style="width:' + p.pct.toFixed(1) + '%"></div></div></div>';
}
function goalsCard(e) {
  if (!e.goals.length) return '';
  const order = { day: 0, week: 1, month: 2 };
  return '<section class="card c-' + e.cls + '"><div class="sh2"><div class="a1b">목표</div>' + editLink('exercise:' + e.id) + '</div>' + e.goals.slice().sort((a, b) => order[a.period] - order[b.period]).map(g => goalRow(e, g, false)).join('') + '</section>';
}

/* 러닝처럼 거리와 시간을 함께 적는 운동은 합계보다 "기록"을 봐요 */
const RUN_DISTS = [{ d: 3, label: '3km' }, { d: 5, label: '5km' }, { d: 10, label: '10km' }, { d: 21.0975, label: '하프' }];
const timedRuns = e => (S.logs.ex[e.id] || []).filter(r => r.m > 0 && r.v > 0);
function paceOf(list) { const km = sum(list.map(r => r.v)), mn = sum(list.map(r => r.m)); return km > 0 ? mn / km : null; }
function runStats(e) {
  const all = timedRuns(e), t = todayStr(), from30 = addDays(t, -29);
  const r30 = all.filter(r => r.d >= from30);
  const fast = all.reduce((b, r) => (!b || r.m / r.v < b.m / b.v) ? r : b, null);
  const dists = e.id !== 'run' ? [] : RUN_DISTS.map(D => {
    const inn = all.filter(r => r.v >= D.d * 0.9 && r.v <= D.d * 1.1).map(r => ({ id: r.id, d: r.d, t: r.m * D.d / r.v }));
    const in30 = inn.filter(r => r.d >= from30);
    const best = inn.length ? inn.reduce((b, r) => r.t < b.t ? r : b) : null;
    return { D: D, n: inn.length, avg30: in30.length ? sum(in30.map(r => r.t)) / in30.length : null, best: best ? best.t : null, bestId: best ? best.id : null };
  });
  return {
    all: all, n30: r30.length, pace30: paceOf(r30), pbPace: fast ? fast.m / fast.v : null, pbPaceId: fast ? fast.id : null,
    avgDist30: r30.length ? sum(r30.map(r => r.v)) / r30.length : null, pbDist: maxOf(all.map(r => r.v)) || null, dists: dists
  };
}
function paceBuckets(e, range) {
  const all = timedRuns(e);
  return bucketDays(range).map(b => { const set = b.days; const runs = all.filter(r => set.indexOf(r.d) >= 0); return { label: b.label, today: b.today, value: paceOf(runs), n: runs.length }; });
}
/* 목록·타일에 쓰는 한 줄 요약 */
function exSummary(e) {
  if (e.minutes) {
    const r = runStats(e);
    if (r.pace30 != null) return '평균 페이스 ' + fmtPace(r.pace30) + ' /km' + (r.pbPace ? ' · 최고 ' + fmtPace(r.pbPace) : '');
    const s = exStats(e);
    return s.avgEntry != null ? '1회 평균 ' + exVal(s.avgEntry, e) + ' · 시간도 함께 기록해 보세요' : '아직 기록이 없어요';
  }
  const s = exStats(e);
  return '하루 평균 ' + exVal(s.avg, e) + ' · 최고 ' + exBest(s.pbDay, e);
}

/* 버킷리스트 · 위시리스트 */
function bucketStats() { const done = S.bucket.filter(x => x.done).length; return { total: S.bucket.length, done: done, open: S.bucket.length - done }; }
function wishStats() { const open = S.wish.filter(x => !x.done); return { total: S.wish.length, open: open.length, done: S.wish.length - open.length, sum: sum(open.map(x => x.price || 0)) }; }

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
function monthOf(offset) { const n = new Date(); const d = new Date(n.getFullYear(), n.getMonth() + offset, 1); return d.getFullYear() + '-' + PAD(d.getMonth() + 1); }
function sumPrefix(map, prefix, maxDay) { return sum(Object.keys(map).filter(d => d.slice(0, 7) === prefix && (!maxDay || +d.slice(8) <= maxDay)).map(d => map[d])); }
function moneyStats() {
  const days = last7(), vals = days.map(spendOn), o = ix();
  const sum7 = sum(vals);
  const prev = sum(last7(addDays(todayStr(), -7)).map(spendOn));
  const thisM = monthOf(0), lastM = monthOf(-1), dom = new Date().getDate();
  const month = sumPrefix(o.spend, thisM), income = sumPrefix(o.inc, thisM);
  const lastTotal = sumPrefix(o.spend, lastM), lastSame = sumPrefix(o.spend, lastM, dom);
  const tracked = days.filter(d => spendOn(d) > 0 || S.logs.nospend[d]);
  let minD = null, maxD = null;
  tracked.forEach(d => {
    if (minD == null || spendOn(d) < spendOn(minD)) minD = d;
    if (maxD == null || spendOn(d) > spendOn(maxD)) maxD = d;
  });
  const wk = {};
  Object.keys(o.spend).forEach(d => { const k = weekKey(d); wk[k] = (wk[k] || 0) + o.spend[d]; });
  return {
    days, vals, sum7, avg: sum7 / 7, prev, month, income, lastTotal, lastSame, minD, maxD,
    pbDay: maxOf(Object.keys(o.spend).map(d => o.spend[d])),
    pbWeek: maxOf(Object.keys(wk).map(k => wk[k]))
  };
}
function catSpentMonth(cid, ym) { const p = ym || monthOf(0); return sum(S.logs.exp.filter(x => x.cat === cid && x.d.slice(0, 7) === p).map(x => x.amt)); }
function subSpentMonth(cid, sid) { const p = monthOf(0); return sum(S.logs.exp.filter(x => x.cat === cid && (x.sub || '') === sid && x.d.slice(0, 7) === p).map(x => x.amt)); }

/* 월별 예산: 따로 정한 달은 그 값을, 아니면 기본 예산을 써요 */
const budgetOf = ym => S.settings.monthBudgets[ym] || null;
function budgetTotal(ym) { const b = budgetOf(ym || monthOf(0)); return b && b.total != null ? b.total : S.settings.monthly; }
function budgetCat(c, ym) { const b = budgetOf(ym || monthOf(0)); return b && b.cats && b.cats[c.id] != null ? b.cats[c.id] : c.monthly; }
function ensureBudget(ym) {
  const mb = S.settings.monthBudgets;
  if (!mb[ym]) { const cats = {}; S.settings.cats.forEach(c => { cats[c.id] = c.monthly; }); mb[ym] = { total: S.settings.monthly, cats: cats }; }
  return mb[ym];
}
function monthShift(ym, n) { const p = ym.split('-').map(Number), d = new Date(p[0], p[1] - 1 + n, 1); return d.getFullYear() + '-' + PAD(d.getMonth() + 1); }
const ymLabel = ym => ym.slice(0, 4) + '년 ' + (+ym.slice(5)) + '월';
/* 한 달 수입·지출 집계 */
function monthData(ym) {
  const exp = S.logs.exp.filter(x => x.d.slice(0, 7) === ym), inc = S.logs.inc.filter(x => x.d.slice(0, 7) === ym);
  const spent = sum(exp.map(x => x.amt)), income = sum(inc.map(x => x.amt));
  const known = {}; S.settings.cats.forEach(c => { known[c.id] = c; });
  const byCat = {}; exp.forEach(x => { const k = known[x.cat] ? x.cat : '__etc'; byCat[k] = (byCat[k] || 0) + x.amt; });
  const byDay = {}; exp.forEach(x => { byDay[x.d] = (byDay[x.d] || 0) + x.amt; });
  const p = ym.split('-').map(Number), dim = new Date(p[0], p[1], 0).getDate(), t = todayStr();
  const elapsed = ym === t.slice(0, 7) ? +t.slice(8) : (ym < t.slice(0, 7) ? dim : 0);
  return { ym: ym, exp: exp, inc: inc, spent: spent, income: income, byCat: byCat, byDay: byDay, dim: dim, elapsed: elapsed, count: exp.length };
}

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

/* ================= 분야 간 연결 (주간 리뷰) =================
   같은 사람의 하루 기록을 둘로 나눠 평균을 비교해요. 각 그룹이 4일 이상이고 차이가 뚜렷할 때만 보여주며,
   "원인"이 아니라 "함께 나타난 경향"이에요. */
const LINK_MIN = 4;
function compareDays(groupFn, metricFn, shift) {
  const o = ix(), t = todayStr(), A = [], B = [];
  if (!o.first) return { A, B };
  for (let i = 56; i >= 1; i--) {
    const d = addDays(t, -i);
    if (d < o.first) continue;
    const g = groupFn(d);
    if (g == null) continue;
    const m = metricFn(addDays(d, shift || 0));
    if (m == null) continue;
    (g ? A : B).push(m);
  }
  return { A, B };
}
function crossInsights() {
  const st = S.settings, goalMin = st.sleepGoal * 60, useScore = st.rate;
  const sleepMetric = d => { const r = sleepOn(d); return r ? (useScore ? (r.score > 0 ? r.score : null) : r.dur) : null; };
  const exDay = d => st.exercises.some(e => exSum(e.id, d) > 0);
  const slept = d => { const r = sleepOn(d); return r ? r.dur >= goalMin : null; };
  const runEx = st.exercises.find(e => e.minutes);
  const defs = [];
  if (st.show.exercise && st.show.sleep) defs.push({
    id: 'ex-sleep', tags: ['exercise', 'sleep'], a: '운동한 날', b: '안 한 날', unitKind: useScore ? 'score' : 'dur',
    title: up => '운동한 날 다음 아침, 수면 ' + (useScore ? '평점' : '시간') + '이 ' + (up ? '더 높았어요' : '더 낮았어요'),
    cmp: compareDays(d => exDay(d), d => sleepMetric(d), 1)
  });
  if (st.show.exercise && st.show.sleep) defs.push({
    id: 'sleep-ex', tags: ['exercise', 'sleep'], a: '충분히 잔 날', b: '못 잔 날', unitKind: 'prob',
    title: up => '잘 잔 날은 운동할 확률이 ' + (up ? '더 높았어요' : '더 낮았어요'),
    cmp: compareDays(d => slept(d), d => exDay(d) ? 1 : 0, 0)
  });
  if (st.show.exercise && st.show.sleep && runEx) defs.push({
    id: 'sleep-pace', tags: ['exercise', 'sleep'], a: '충분히 잔 날', b: '못 잔 날', unitKind: 'pace',
    title: up => '잘 잔 날은 ' + runEx.name + ' 페이스가 ' + (up ? '더 느렸어요' : '더 빨랐어요'),
    cmp: compareDays(d => slept(d), d => paceOf(timedRuns(runEx).filter(r => r.d === d)), 0)
  });
  if (st.show.faith && st.show.sleep) defs.push({
    id: 'faith-sleep', tags: ['faith', 'sleep'], a: '신앙 실천한 날', b: '안 한 날', unitKind: useScore ? 'score' : 'dur',
    title: up => '신앙 항목을 실천한 날 다음 아침, 수면 ' + (useScore ? '평점' : '시간') + '이 ' + (up ? '더 높았어요' : '더 낮았어요'),
    cmp: compareDays(d => faithCount(d) > 0, d => sleepMetric(d), 1)
  });
  if (st.show.money && st.show.sleep) defs.push({
    id: 'sleep-spend', tags: ['money', 'sleep'], a: '충분히 잔 날', b: '못 잔 날', unitKind: 'won',
    title: up => '잘 잔 날은 지출이 ' + (up ? '더 많았어요' : '더 적었어요'),
    cmp: compareDays(d => slept(d), d => (spendOn(d) > 0 || S.logs.nospend[d]) ? spendOn(d) : null, 0)
  });
  return defs.map(df => {
    const A = df.cmp.A, B = df.cmp.B;
    const r = { id: df.id, tags: df.tags, a: df.a, b: df.b, kind: df.unitKind, nA: A.length, nB: B.length, ready: A.length >= LINK_MIN && B.length >= LINK_MIN };
    if (!r.ready) { r.need = df.a + ' ' + A.length + '일 · ' + df.b + ' ' + B.length + '일 (각각 ' + LINK_MIN + '일 이상 필요)'; return r; }
    r.avgA = sum(A) / A.length; r.avgB = sum(B) / B.length;
    const diff = r.avgA - r.avgB;
    const k = df.unitKind;
    r.strong = k === 'score' ? Math.abs(diff) >= 0.7 : k === 'dur' ? Math.abs(diff) >= 20 : k === 'prob' ? Math.abs(diff) >= 0.15 : k === 'pace' ? Math.abs(diff) >= 0.15 : Math.abs(diff) >= 0.15 * Math.max(1, r.avgB, r.avgA);
    r.diff = diff; r.title = df.title(diff > 0);
    r.mag = k === 'score' ? Math.abs(diff) / 3 : k === 'dur' ? Math.abs(diff) / 60 : k === 'prob' ? Math.abs(diff) : k === 'pace' ? Math.abs(diff) / 0.8 : Math.abs(diff) / Math.max(1, r.avgA, r.avgB);
    return r;
  });
}
/* 한 분야 화면에 보여줄 연결 (가장 뚜렷한 것부터) */
function insightsFor(tag, max) {
  return crossInsights().filter(r => r.ready && r.strong && r.tags.indexOf(tag) >= 0).sort((x, y) => y.mag - x.mag).slice(0, max || 1);
}

/* ---- 버킷리스트 ↔ 운동 기록 ---- */
function bucketLinkInfo(it) {
  const L = it.link;
  if (!L) return null;
  const e = S.settings.exercises.find(x => x.id === L.ex);
  if (!e) return null;
  const entries = (S.logs.ex[e.id] || []).slice().sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  if (L.type === 'dist') {
    const cur = maxOf(entries.map(r => r.v));
    const hit = entries.find(r => r.v >= L.target);
    return { e: e, pct: Math.min(100, cur / L.target * 100), text: '지금 최고 ' + exVal(cur, e) + ' / 목표 ' + exVal(L.target, e), goal: '한 번에 ' + exVal(L.target, e), done: !!hit, date: hit ? hit.d : null };
  }
  if (L.type === 'day') {
    const o = ix().ex[e.id] || {};
    const days = Object.keys(o).sort();
    const cur = maxOf(days.map(d => o[d]));
    const hit = days.find(d => o[d] >= L.target);
    return { e: e, pct: Math.min(100, cur / L.target * 100), text: '하루 최고 ' + exVal(cur, e) + ' / 목표 ' + exVal(L.target, e), goal: '하루 ' + exVal(L.target, e), done: !!hit, date: hit || null };
  }
  if (L.type === 'time') {
    const D = RUN_DISTS.find(x => Math.abs(x.d - L.dist) < 0.01);
    if (!D) return null;
    const tm = L.sec / 60;
    const cand = timedRuns(e).filter(r => r.v >= D.d * 0.9 && r.v <= D.d * 1.1).map(r => ({ d: r.d, t: r.m * D.d / r.v })).sort((a, b) => a.d < b.d ? -1 : 1);
    const best = cand.length ? Math.min.apply(null, cand.map(r => r.t)) : null;
    const hit = cand.find(r => r.t <= tm + 1e-9);
    return { e: e, pct: best == null ? 0 : Math.min(100, tm / best * 100), text: best == null ? '아직 ' + D.label + ' 기록이 없어요' : '지금 최고 ' + fmtRec(best) + ' / 목표 ' + fmtRec(tm), goal: D.label + ' ' + fmtRec(tm) + ' 이내', done: !!hit, date: hit ? hit.d : null };
  }
  return null;
}
/* 운동 기록이 목표에 닿으면 버킷리스트를 자동으로 이뤄요 (한 번만) */
function applyBucketLinks() {
  const got = [];
  S.bucket.forEach(it => {
    if (!it.link || it.done || it.autoSeen) return;
    const info = bucketLinkInfo(it);
    if (info && info.done) { it.done = true; it.doneAt = info.date || todayStr(); it.autoSeen = true; got.push(it.title); }
  });
  return got;
}
/* 위시리스트 ↔ 가계부: 이번 달 남은 예산 안에서 살 수 있는지 */
function wishFit(it) {
  if (!S.settings.show.money || it.done || !(it.price > 0)) return null;
  const left = budgetTotal() - moneyStats().month;
  return it.price <= left ? 'ok' : 'over';
}

/* 주간 요약 (선택한 7일 vs 직전 7일) */
function weekSummary(end) {
  const st = S.settings, days = last7(end), prevDays = last7(addDays(end, -7));
  const rows = [];
  if (st.show.exercise) st.exercises.forEach(e => {
    if (e.minutes) {
      const all = timedRuns(e);
      const a = paceOf(all.filter(r => days.indexOf(r.d) >= 0)), b = paceOf(all.filter(r => prevDays.indexOf(r.d) >= 0));
      rows.push({ cls: e.cls, name: e.name, sub: '평균 페이스', value: a == null ? '–' : fmtPace(a) + ' /km', has: a != null, delta: a != null && b != null ? a - b : null, deltaText: a != null && b != null ? Math.round(Math.abs(a - b) * 60) + '초' : '', good: 'down', go: 'ex|' + e.id });
      return;
    }
    const a = sum(days.map(d => exSum(e.id, d))), b = sum(prevDays.map(d => exSum(e.id, d)));
    rows.push({ cls: e.cls, name: e.name, value: exVal(a, e), has: a > 0 || b > 0, delta: b > 0 || a > 0 ? a - b : null, deltaText: exVal(Math.abs(a - b), e), good: 'up', go: 'ex|' + e.id });
  });
  if (st.show.sleep) {
    const ra = days.map(sleepOn).filter(Boolean), rb = prevDays.map(sleepOn).filter(Boolean);
    const sa = ra.filter(r => r.score > 0), sb = rb.filter(r => r.score > 0);
    const avgS = l => l.length ? sum(l.map(r => r.score)) / l.length : null;
    if (st.rate && (sa.length || sb.length)) {
      const a = avgS(sa), b = avgS(sb), d = a != null && b != null ? Math.round((a - b) * 10) / 10 : null;
      rows.push({ cls: 'sleep', name: '수면', sub: '평균 평점', value: a == null ? '–' : a.toFixed(1) + ' / 10', has: a != null, delta: d, deltaText: d != null ? Math.abs(d).toFixed(1) + '점' : '', good: 'up', go: 'sleep' });
    } else {
      const a = ra.length ? sum(ra.map(r => r.dur)) / ra.length : null, b = rb.length ? sum(rb.map(r => r.dur)) / rb.length : null;
      rows.push({ cls: 'sleep', name: '수면', sub: '평균 시간', value: a == null ? '–' : fmtDur(a), has: a != null, delta: a != null && b != null ? a - b : null, deltaText: a != null && b != null ? Math.round(Math.abs(a - b)) + '분' : '', good: 'up', go: 'sleep' });
    }
  }
  if (st.show.money) {
    const a = sum(days.map(spendOn)), b = sum(prevDays.map(spendOn));
    rows.push({ cls: 'money', name: '지출', value: won(a), has: a > 0 || b > 0, delta: a > 0 && b > 0 ? a - b : null, deltaText: won(Math.abs(a - b)), good: 'down', go: 'money' });
  }
  if (st.show.faith) {
    const items = faithItems();
    const a = days.filter(d => faithCount(d) > 0).length, b = prevDays.filter(d => faithCount(d) > 0).length;
    rows.push({ cls: 'faith', name: '신앙', value: a + '일 실천', has: items.length > 0 && (a > 0 || b > 0), delta: a > 0 || b > 0 ? a - b : null, deltaText: Math.abs(a - b) + '일', good: 'up', go: 'faith' });
  }
  const inWin = x => x.done && x.doneAt && x.doneAt >= days[0] && x.doneAt <= days[6];
  const nb = st.show.bucket ? S.bucket.filter(inWin).length : 0, nw = st.show.wish ? S.wish.filter(inWin).length : 0;
  if (nb + nw > 0) rows.push({ cls: 'bucket', name: '이룬 리스트', value: (nb ? '버킷 ' + nb : '') + (nb && nw ? ' · ' : '') + (nw ? '위시 ' + nw : ''), has: true, delta: null, deltaText: '', good: 'up', go: nb ? 'bucket' : 'wish' });
  return rows;
}

/* 예시 데이터 */
function seedSample() {
  let a = 20260101;
  const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const ri = (lo, hi) => Math.floor(lo + rnd() * (hi - lo + 1));
  const t = todayStr();
  const logs = { ex: {}, sleep: {}, exp: [], faith: {}, nospend: {}, inc: [], notes: [] };
  S.settings.exercises.forEach(e => { logs.ex[e.id] = []; });
  const cats = S.settings.cats, faith = S.settings.faith;
  if (!cats.some(c => c.subs && c.subs.length)) {
    cats.push({ id: 'c' + uid(), name: '데이트', monthly: 150000, subs: ['식비', '주차비', '문화생활', '교통비'].map(n => ({ id: 's' + uid(), name: n })) });
  }
  for (let i = 55; i >= 0; i--) {
    const d = addDays(t, -i), today = i === 0;
    let exercised = false;
    S.settings.exercises.forEach(e => {
      if (e.id === 'run' && rnd() < 0.5) {
        const km = Math.round((3 + rnd() * 5 + (55 - i) * 0.02) * 10) / 10;
        logs.ex.run.push({ id: uid(), d: d, v: km, m: Math.round(km * (5.1 + rnd() * 1.1) * 60) / 60 }); exercised = true;
      } else if (e.id === 'push' && !today && rnd() < 0.5) {
        const sets = ri(2, 4);
        for (let s = 0; s < sets; s++) logs.ex.push.push({ id: uid(), d: d, v: ri(8, 14) + Math.floor((55 - i) / 10) });
        exercised = true;
      } else if (e.id !== 'run' && e.id !== 'push' && rnd() < 0.5) {
        logs.ex[e.id].push({ id: uid(), d: d, v: Math.max(1, Math.round(e.weekly / 5 * (0.6 + rnd() * 0.7))) }); exercised = true;
      }
    });
    // 어젯밤 운동했다면 오늘 아침 수면이 조금 더 좋아지는 경향 (예시)
    const prevEx = S.settings.exercises.some(e => (logs.ex[e.id] || []).some(r => r.d === addDays(d, -1)));
    const bed = 23 * 60 + ri(-40, 70), wake = 6 * 60 + ri(10, 80);
    const dur = (wake - bed + 1440) % 1440;
    const score = clamp(Math.round(9 - Math.abs(dur - 450) / 28 + (prevEx ? 1.5 : 0) + (rnd() * 2 - 1)), 2, 10);
    logs.sleep[d] = { bed: hm(bed), wake: hm(wake), dur: dur, score: score };
    if (!today) {
      const n = ri(1, 4);
      for (let k = 0; k < n; k++) {
        const c = cats[ri(0, cats.length - 1)];
        const sb = c.subs && c.subs.length ? c.subs[ri(0, c.subs.length - 1)].id : undefined;
        logs.exp.push({ id: uid(), d: d, cat: c.id, sub: sb, amt: Math.max(1000, Math.round(c.monthly / ri(12, 26) / 100) * 100), memo: '' });
      }
    }
    const done = {};
    faith.forEach(f => { done[f.id] = rnd() < 0.78; });
    const rec = { done: done };
    if (rnd() < 0.8) rec.pray = ri(8, 35);
    if (rnd() < 0.7) rec.read = ri(1, 5);
    logs.faith[d] = rec;
    if (d.slice(8) === '25') logs.inc.push({ id: uid(), d: d, amt: 2800000, memo: '급여' });
  }
  if (logs.ex.run) {
    logs.ex.run = logs.ex.run.filter(r => r.d !== addDays(t, -14));
    logs.ex.run.push({ id: uid(), d: addDays(t, -14), v: 10.1, m: Math.round(58 * 60 + 40) / 60 });
  }
  const notes = [['감사', '아침 산책을 할 수 있어서 감사했다.', 1], ['묵상', '조급해하지 않고 한 걸음씩 가기로 했다.', 3], ['기도', '이번 주 만나는 사람들을 위해 기도했다.', 6], ['감사', '가족과 저녁을 함께 먹었다.', 9]];
  notes.forEach(n => logs.notes.push({ id: uid(), d: addDays(t, -n[2]), type: n[0], text: n[1] }));
  S.logs = logs;
  if (!S.bucket.length) S.bucket = [
    { id: 'b' + uid(), title: '한라산 등반', memo: '', when: '올해', done: false, doneAt: null },
    { id: 'b' + uid(), title: '하프마라톤 완주', memo: '10km를 편하게 달릴 수 있을 때', when: '내년', done: false, doneAt: null },
    { id: 'b' + uid(), title: '혼자 여행 가기', memo: '', when: '언젠가', done: false, doneAt: null },
    { id: 'b' + uid(), title: '책 12권 읽기', memo: '', when: '올해', done: true, doneAt: addDays(t, -3) }];
  if (!S.wish.length) S.wish = [
    { id: 'w' + uid(), name: '러닝화', price: 189000, prio: '높음', link: '', memo: '쿠션이 두꺼운 것', done: false, doneAt: null },
    { id: 'w' + uid(), name: '무선 이어폰', price: 129000, prio: '보통', link: '', memo: '', done: false, doneAt: null },
    { id: 'w' + uid(), name: '러닝 벨트', price: 25000, prio: '보통', link: '', memo: '', done: true, doneAt: addDays(t, -10) }];
  if (!S.settings.topics.length) S.settings.topics = [{ id: 't' + uid(), text: '가족의 건강', done: false }, { id: 't' + uid(), text: '일과 학업', done: false }, { id: 't' + uid(), text: '마음의 평안', done: true }];
  if (!S.settings.fixed.length) {
    const c6 = cats.find(c => c.name === '기타') || cats[0];
    S.settings.fixed = [{ id: 'x' + uid(), name: '통신비', amt: 55000, day: 5, cat: c6 ? c6.id : '', since: monthOf(-2), applied: {} }];
  }
  applyFixed();
  commit();
}

/* ================= 차트 (SVG / CSS) ================= */
const ICONS = {
  run: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  push: '<path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12"/>',
  sleep: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  money: '<rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10.5h18M16 15h2"/>',
  faith: '<path d="M12 3v18M7 8.5h10"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4M8 14h.01M12 14h.01M16 14h.01M8 17.5h.01M12 17.5h.01"/>',
  today: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  trend: '<path d="M3 17l5-6 4 3 8-9"/><path d="M15 5h5v5"/>',
  bars: '<path d="M5 20V11M12 20V5M19 20v-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  review: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 9h6M9 13h6M9 17h3"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  flag: '<path d="M5 21V4M5 5h11l-2 4 2 4H5"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8M8 8a2.5 2.5 0 1 1 0-5c2.5 0 4 3 4 5M16 8a2.5 2.5 0 1 0 0-5c-2.5 0-4 3-4 5"/>'
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

/* Growth 8주 막대 (기록이 부족한 주는 비워 둬요) */
function growthBars(vals, label) {
  const W = 326, left = 28, right = 318, top = 14, bot = 160;
  const Y = v => bot - v / 100 * (bot - top);
  const n = vals.length, step = (right - left) / n;
  let s = '<svg class="chart" viewBox="0 0 ' + W + ' 190" role="img" aria-label="' + esc(label) + ' 최근 ' + n + '주 막대 그래프">';
  [0, 50, 100].forEach(v => { s += '<path class="grid" d="M' + left + ' ' + Y(v).toFixed(1) + ' H' + right + '"/><text class="axis" text-anchor="end" x="20" y="' + (Y(v) + 4).toFixed(1) + '">' + v + '</text>'; });
  const real = vals.filter(v => v != null);
  vals.forEach((v, i) => {
    const x = left + i * step + (step - 24) / 2, last = i === n - 1;
    if (v == null) { s += '<rect class="gap" x="' + x.toFixed(1) + '" y="' + (bot - 4) + '" width="24" height="4" rx="2"/>'; return; }
    s += '<rect class="gbar' + (last ? ' hi' : '') + '" x="' + x.toFixed(1) + '" y="' + Y(v).toFixed(1) + '" width="24" height="' + Math.max(2, bot - Y(v)).toFixed(1) + '" rx="6"/>';
    if (last) s += '<text class="lbl" text-anchor="middle" x="' + (x + 12).toFixed(1) + '" y="' + (Y(v) - 6).toFixed(1) + '">' + v + '</text>';
  });
  if (real.length > 1) { const avg = sum(real) / real.length; s += '<path class="avg" d="M' + left + ' ' + Y(avg).toFixed(1) + ' H' + right + '"/>'; }
  s += '<text class="axis" x="' + left + '" y="182">' + (n - 1) + '주 전</text><text class="axis" text-anchor="end" x="' + right + '" y="182">이번 주</text>';
  return s + '</svg>';
}

/* 이어진 구간만 선으로 잇는 도우미 (빈 날은 끊어서 그려요) */
function segPaths(pts) {
  const runs = []; let cur = [];
  pts.forEach(p => { if (p) cur.push(p); else { if (cur.length) runs.push(cur); cur = []; } });
  if (cur.length) runs.push(cur);
  return runs;
}
/* 페이스 그래프: 위쪽일수록 더 빨라요 */
function paceChart(items) {
  const vals = items.map(i => i.value).filter(v => v != null);
  if (!vals.length) return '<div class="emptyin">시간을 함께 기록하면 페이스 그래프가 그려져요.</div>';
  let lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
  const pad = Math.max(0.2, (hi - lo) * 0.3); lo -= pad; hi += pad;
  const left = 44, right = 318, top = 20, bot = 154, n = items.length;
  const X = i => left + (i + 0.5) * (right - left) / n, Y = v => top + (v - lo) / (hi - lo) * (bot - top);
  let s = '<svg class="chart c-run" viewBox="0 0 326 190" role="img" aria-label="페이스 변화 그래프. 위쪽이 더 빨라요">';
  [0, 1, 2].forEach(k => { const v = lo + (hi - lo) * k / 2, y = Y(v); s += '<path class="grid" d="M' + left + ' ' + y.toFixed(1) + ' H' + right + '"/><text class="axis" text-anchor="end" x="38" y="' + (y + 4).toFixed(1) + '">' + fmtPace(v) + '</text>'; });
  const pts = items.map((it, i) => it.value == null ? null : [X(i), Y(it.value)]);
  segPaths(pts).forEach(r => { if (r.length > 1) s += '<path class="pline" d="M' + r.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L') + '"/>'; });
  const best = Math.min.apply(null, vals);
  items.forEach((it, i) => {
    if (!pts[i]) return;
    const isBest = it.value === best;
    s += '<circle class="pdot' + (isBest ? ' pb' : '') + '" cx="' + pts[i][0].toFixed(1) + '" cy="' + pts[i][1].toFixed(1) + '" r="' + (isBest ? 6 : 4.5) + '"/>';
    if (isBest) s += '<text class="lbl" text-anchor="middle" x="' + pts[i][0].toFixed(1) + '" y="' + (pts[i][1] - 12).toFixed(1) + '">' + fmtPace(it.value) + '</text>';
  });
  items.forEach((it, i) => { s += '<text class="axis" text-anchor="middle" x="' + X(i).toFixed(1) + '" y="182">' + esc(it.label) + '</text>'; });
  return s + '</svg>';
}

/* ================= 화면 ================= */
let NAV = { route: 'today', arg: null, range: 'week', stack: [], open: {}, roff: 0, cal: { ym: '', sel: '' }, stat: '', bm: '', bmode: 'month' };
const ROUTE_TITLE = { today: '오늘', cats: '분야', growth: 'Growth', growthd: 'Growth', review: '리뷰', cal: '캘린더', mstat: '통계', exlist: '운동', sleep: '수면', money: '가계부', faith: '신앙', bucket: '버킷리스트', wish: '위시리스트', settings: '설정' };
function backLabel() {
  const top = NAV.stack[NAV.stack.length - 1];
  if (!top) return '분야';
  if (top.route === 'ex') { const e = S.settings.exercises.find(x => x.id === top.arg); return e ? e.name : '운동'; }
  return ROUTE_TITLE[top.route] || '뒤로';
}

const DONE_SVG = '<svg class="on" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13"/><path d="M8.5 14.5l3.8 3.8 7.2-8" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const TODO_SVG = '<svg class="off" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="none" stroke-width="2"/></svg>';
const exIcon = e => e.cls === 'run' ? 'run' : 'push';

function hdr(title, sub) { return '<header class="hdr">' + (sub ? '<div class="date">' + esc(sub) + '</div>' : '') + '<h1>' + title + '</h1></header>'; }
function backHdr(title, icon, cls, right) {
  return '<header class="hdr"><div class="hrow"><a href="#" class="back' + (NAV.stack.length ? '' : ' back-root') + '" data-act="back"><svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1L2 8l6 7"/></svg>' + esc(backLabel()) + '</a>' + (right || '') + '</div>' +
    '<h1 class="withico c-' + cls + '">' + (icon ? '<span class="hico">' + ico(icon, 28, 2) + '</span>' : '') + title + '</h1></header>';
}
const editLink = arg => '<a href="#" class="lnk" data-act="go" data-arg="settings|' + arg + '">편집</a>';
function segCtl() {
  return '<div class="seg rangeseg" role="group" aria-label="기간 선택">' + ['week', 'month', 'half'].map(k =>
    '<button type="button" data-act="range" data-arg="' + k + '" aria-pressed="' + (NAV.range === k) + '">' + RANGE[k].seg + '</button>').join('') + '</div>';
}
function statTable(c1, c2, rows, cls) {
  return '<section class="card tbl c-' + cls + '" aria-label="평균과 최고 기록"><div class="trow th"><span></span><span>' + c1 + '</span><span>' + c2 + '</span></div>' +
    rows.map(r => '<div class="trow"><span class="tl">' + r[0] + '</span><span class="ta">' + r[1] + '</span><span class="tb">' + r[2] + '</span></div>').join('') + '</section>';
}
const unitHtml = (n, u) => n + '<span class="u">' + u + '</span>';
const dash = '–';
const swon = n => n < 0 ? '−' + won(-n) : won(n);
function empty(msg, btn) { return '<section class="card emptyc"><div class="et">' + msg + '</div>' + (btn || '') + '</section>'; }
const seedBtn = '<div class="btnrow"><button type="button" class="btn" data-act="seed">예시 데이터로 둘러보기</button></div>';
function checkRow(c) {
  return '<button type="button" class="crow c-' + c.cls + '" data-act="check" data-arg="' + esc(c.key) + '" aria-pressed="' + c.done + '">' +
    '<span class="cmark">' + (c.done ? DONE_SVG : TODO_SVG) + '</span><span class="ctext"><span class="ct1">' + esc(c.title) + '</span><span class="ct2">' + esc(c.sub) + '</span></span>' +
    '<span class="cstat' + (c.done ? ' ok' : '') + '">' + (c.done ? '완료' : '남음') + '</span></button>';
}
const EDIT_IC = '<span class="eic">' + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></span>';
function entryRow(arg, left, sub, right, cls) {
  return '<button type="button" class="erow" data-act="editEntry" data-arg="' + esc(arg) + '"><span class="el"><span class="e1">' + left + '</span><span class="e2">' + sub + '</span></span><span class="er' + (cls ? ' ' + cls : '') + '">' + right + '</span>' + EDIT_IC + '</button>';
}
const bigBtn = (act, arg, cls, text) => '<button type="button" class="btn full c-' + cls + '" data-act="' + act + '" data-arg="' + arg + '">' + text + '</button>';
const delta = (a, b) => (a == null || b == null) ? '' : (a - b >= 0 ? '+' : '−') + Math.abs(a - b);
const deltaCls = (a, b) => (a == null || b == null) ? '' : (a - b >= 0 ? 'up' : 'down');
const ymNow = () => (new Date().getMonth() + 1) + '월';
const byDateDesc = (a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0;
const md = d => { const x = parseD(d); return (x.getMonth() + 1) + '월 ' + x.getDate() + '일'; };

/* ---------- 오늘 ---------- */
function growthSentence(g) {
  const rows = visibleAbil().filter(a => g[a.k].v != null).sort((a, b) => g[b.k].v - g[a.k].v);
  if (rows.length < 2) return null;
  const best = rows[0], worst = rows[rows.length - 1];
  if (g[best.k].v === g[worst.k].v) return '영역별 점수가 모두 비슷해요.';
  return '이번 주는 <b class="c-' + best.cls + '">' + best.name + '</b>이 가장 좋았고,<br><b class="c-' + worst.cls + '">' + worst.name + '</b>이 가장 아쉬웠어요.';
}
function tile(arg, icon, name, cls, big, sub) {
  return '<a href="#" class="tile c-' + cls + '" data-act="go" data-arg="' + arg + '"><div class="tn">' + ico(icon, 18, 2) + name + '</div><div class="tb">' + esc(big) + '</div><div class="ts">' + esc(sub) + '</div></a>';
}
function viewToday() {
  const now = new Date(), st = S.settings, t = todayStr();
  const sub = (now.getMonth() + 1) + '월 ' + now.getDate() + '일 ' + WD[now.getDay()] + '요일';
  const g = growthAt(t), comp = compositeG(g), cp = compositeG(growthAt(addDays(t, -7)));
  let top;
  if (comp == null) {
    top = empty('기록이 3일 이상 쌓이면<br>Growth 점수가 나와요.<br>아래 분야에서 첫 기록을 남겨 보세요.', seedBtn);
  } else {
    top = '<a href="#" class="card gcard" data-act="go" data-arg="growth"><div class="atop"><div class="a1">Growth · 최근 7일</div>' + CHEV + '</div>' +
      '<div class="abig"><span class="n">' + comp + '</span><span class="d ' + deltaCls(comp, cp) + '">' + (cp == null ? '첫 점수예요' : '지난주보다 ' + delta(comp, cp)) + '</span></div>' +
      (growthSentence(g) ? '<div class="gsum">' + growthSentence(g) + '</div>' : '') + '</a>';
  }
  const tiles = [];
  if (st.show.exercise && st.exercises.length) {
    const logged = st.exercises.filter(e => exSum(e.id, t) > 0);
    const pcts = st.exercises.filter(e => e.weekly > 0).map(e => Math.min(1, exStats(e).sum7 / e.weekly));
    const e0 = st.exercises[0], rs0 = e0.minutes ? runStats(e0) : null;
    tiles.push(tile('exlist', 'run', '운동', 'run', logged.length ? logged[0].name + ' ' + exVal(exSum(logged[0].id, t), logged[0]) : dash,
      rs0 && rs0.pace30 != null ? e0.name + ' 평균 페이스 ' + fmtPace(rs0.pace30) + ' /km' : (pcts.length ? '이번 주 목표 ' + Math.round(100 * sum(pcts) / pcts.length) + '%' : '오늘 기록 없음')));
  }
  if (st.show.sleep) {
    const r = sleepOn(t);
    tiles.push(tile('sleep', 'sleep', '수면', 'sleep', r ? fmtDur(r.dur) : dash, r ? (st.rate && r.score ? '평점 ' + r.score + ' / 10' : '오늘 아침 기록') : '오늘 아침 기록 없음'));
  }
  if (st.show.money) {
    const sp = spendOn(t), m = moneyStats();
    tiles.push(tile('money', 'money', '가계부', 'money', sp > 0 ? won(sp) : (S.logs.nospend[t] ? '지출 없음' : dash), ymNow() + ' ' + won(m.month) + ' / ' + won(budgetTotal())));
  }
  if (st.show.faith) {
    const f = faithStats();
    tiles.push(tile('faith', 'faith', '신앙', 'faith', f.items.length ? faithCount(t) + ' / ' + f.items.length : dash, '오늘 실천 · 연속 ' + f.streak + '일'));
  }
  const bs = bucketStats(), ws = wishStats(), lp = [];
  if (st.show.bucket && bs.total) lp.push('버킷리스트 ' + bs.done + ' / ' + bs.total);
  if (st.show.wish && ws.open) lp.push('위시 ' + ws.open + '개');
  const lists = lp.length ? '<a href="#" class="group lstrow" data-act="go" data-arg="cats"><span class="l1">리스트</span><span class="l2r">' + lp.join(' · ') + '</span>' + CHEV + '</a>' : '';
  const gl = [];
  if (st.show.exercise) st.exercises.forEach(e => e.goals.forEach(g => gl.push(goalRow(e, g, true))));
  const goalsToday = gl.length ? '<section class="card"><div class="sh2"><div class="a1b">운동 목표</div><a href="#" class="lnk" data-act="go" data-arg="exlist">운동</a></div>' + gl.join('') + '</section>' : '';
  return hdr('오늘', sub) + '<!--cols-->' + top + goalsToday + '<!--col-->' +
    (tiles.length ? '<section><div class="sh"><h2>분야</h2><a href="#" class="lnk" data-act="go" data-arg="cats">모두 보기</a></div><div class="tiles">' + tiles.join('') + '</div></section>' : '<section class="card emptyc"><div class="et">켜져 있는 분야가 없어요.</div><div class="btnrow"><button type="button" class="btn" data-act="go" data-arg="settings">설정 열기</button></div></section>') + lists;
}

/* ---------- 분야 (목록) ---------- */
function hubRow(arg, icon, cls, name, sub) {
  return '<a href="#" class="hrw c-' + cls + '" data-act="go" data-arg="' + arg + '"><span class="hico2">' + ico(icon, 22, 2) + '</span><span class="hlt"><span class="h1">' + name + '</span><span class="h2">' + esc(sub) + '</span></span>' + CHEV + '</a>';
}
function viewCats() {
  const st = S.settings;
  let rows = '', lrows = '';
  if (st.show.exercise) {
    const ex = st.exercises;
    let sub = '종목을 추가해 보세요';
    if (ex.length) sub = ex[0].name + ' ' + exSummary(ex[0]).replace(/ · .*$/, '') + (ex.length > 1 ? ' 외 ' + (ex.length - 1) + '개' : '');
    rows += hubRow('exlist', 'run', 'run', '운동', sub);
  }
  if (st.show.sleep) {
    const s = sleepStats();
    rows += hubRow('sleep', 'sleep', 'sleep', '수면', s.avgDur == null ? '아직 기록이 없어요' : '평균 ' + fmtDur(s.avgDur) + (s.avgScore != null ? ' · 평점 ' + s.avgScore.toFixed(1) : ''));
  }
  if (st.show.money) {
    const m = moneyStats();
    rows += hubRow('money', 'money', 'money', '가계부', ymNow() + ' 지출 ' + won(m.month) + ' / ' + won(budgetTotal()));
  }
  if (st.show.faith) {
    const f = faithStats();
    rows += hubRow('faith', 'faith', 'faith', '신앙', f.rate == null ? '설정에서 항목을 켜 주세요' : '7일 실천률 ' + Math.round(f.rate * 100) + '% · 연속 ' + f.streak + '일');
  }
  if (st.show.bucket) { const b = bucketStats(); lrows += hubRow('bucket', 'flag', 'bucket', '버킷리스트', b.total ? '이룬 ' + b.done + ' / ' + b.total : '하고 싶은 일을 적어 보세요'); }
  if (st.show.wish) { const w = wishStats(); lrows += hubRow('wish', 'gift', 'wish', '위시리스트', w.total ? (w.open ? w.open + '개 · 합계 ' + won(w.sum) : '모두 구입했어요') : '갖고 싶은 것을 적어 보세요'); }
  return '<header class="hdr hrow2"><h1>분야</h1><a href="#" class="lnk big" data-act="go" data-arg="settings">설정</a></header><!--cols-->' +
    (rows ? '<h2 class="gl2">기록</h2><section class="group">' + rows + '</section>' : '') +
    '<!--col-->' + (lrows ? '<h2 class="gl2">리스트</h2><section class="group">' + lrows + '</section>' : '') +
    (rows || lrows ? '' : '<section class="group"><div class="emptyrow">켜져 있는 분야가 없어요. 설정에서 켜 주세요.</div></section>');
}

/* ---------- 운동 목록 ---------- */
function viewExList() {
  const st = S.settings;
  let h = backHdr('운동', 'run', 'run', editLink('exercise'));
  const rows = st.exercises.map(e => {
    return '<a href="#" class="lrow c-' + e.cls + '" data-act="go" data-arg="ex|' + e.id + '"><span class="lico">' + ico(exIcon(e), 18, 2) + '</span><span class="lt"><span class="l1">' + esc(e.name) + '</span><span class="l2">' + esc(exSummary(e)) + '</span></span>' + CHEV + '</a>';
  }).join('');
  h += '<section class="group">' + (rows || '<div class="emptyrow">아직 종목이 없어요.</div>') + '<button type="button" class="addrow" data-act="addEx">' + ico('plus', 18, 2) + '운동 종목 추가</button></section>';
  return h;
}

/* ---------- Growth (한 줄 요약) ---------- */
function viewGrowth() {
  const g = growthAt(todayStr()), gp = growthAt(addDays(todayStr(), -7)), comp = compositeG(g), cp = compositeG(gp);
  const abils = visibleAbil();
  let h = hdr('Growth', '최근 7일 기준') + '<!--cols-->';
  const sent = growthSentence(g);
  if (comp == null) {
    h += '<section class="card gsent"><div class="gs1">기록이 쌓이면 이번 주를 한 줄로 알려드려요.</div><div class="gs2">영역마다 3일 이상 기록해야 점수가 나와요.</div>' + seedBtn + '</section>';
  } else {
    h += '<a href="#" class="card gsent" data-act="go" data-arg="growthd|all"><div class="gs1">' + (sent || '점수가 나온 영역이 한 곳이에요.') + '</div><div class="gs2">Growth ' + comp + '점 · ' + (cp == null ? '첫 점수예요' : '지난주보다 ' + delta(comp, cp)) + '</div></a>';
  }
  const ok = abils.filter(a => g[a.k].v != null).sort((a, b) => g[b.k].v - g[a.k].v), wait = abils.filter(a => g[a.k].v == null);
  const row = (a, wait2) => {
    const x = g[a.k];
    return '<a href="#" class="glr c-' + a.cls + (wait2 ? ' wait' : '') + '" data-act="go" data-arg="growthd|' + a.k + '"><span class="gn"><span class="g1">' + a.name + '</span><span class="g2">' + (wait2 ? '기록 모으는 중 · ' + Math.min(x.n, MIN_DAYS) + ' / ' + MIN_DAYS + '일' : esc(x.basis.split(' · ')[0])) + '</span></span>' +
      '<span class="gtrack"><span style="width:' + (wait2 ? 0 : x.v) + '%"></span></span><span class="gv">' + (wait2 ? dash : x.v) + '</span>' + CHEV + '</a>';
  };
  h += '<p class="foot">점수는 내가 정한 목표를 얼마나 지켰는지를 0~100으로 보여줘요. 영역을 누르면 8주 흐름과 계산 근거가 나와요.</p><!--col-->';
  h += '<section class="group">' + ok.map(a => row(a, false)).join('') + wait.map(a => row(a, true)).join('') + '</section>';
  return h;
}

/* ---------- Growth (한 번에 하나) ---------- */
function viewGrowthD() {
  const key = NAV.arg || 'all', hist = growthHistory(8), ser = growthSeries(hist, key), abils = visibleAbil();
  const meta = key === 'all' ? { name: '종합', cls: 'sleep', how: 'Growth 점수는 기록이 3일 이상 쌓인 영역 점수의 평균이에요(최소 2개 영역). 점수는 건강이나 재산을 진단하는 값이 아니라 내가 정한 목표를 얼마나 지켰는지예요. 기록이 적은 주는 점수를 내지 않고 비워 둬요.' } : (ABIL.find(a => a.k === key) || { name: '종합', cls: 'sleep', how: '' });
  const cur = ser[7], prev = ser[6], real = ser.filter(v => v != null);
  const avg8 = real.length ? Math.round(sum(real) / real.length) : null, max8 = real.length ? maxOf(real) : null;
  let h = backHdr('Growth', 'trend', meta.cls, '');
  h += '<div class="gpills" role="group" aria-label="영역 선택">' + [{ k: 'all', name: '종합', cls: 'sleep' }].concat(abils).map(a =>
    '<button type="button" class="gp c-' + a.cls + (a.k === key ? ' on' : '') + '" data-act="gpick" data-arg="' + a.k + '" aria-pressed="' + (a.k === key) + '">' + a.name + '</button>').join('') + '</div><!--cols-->';
  h += '<section class="card c-' + meta.cls + '"><div class="a1">' + meta.name + '</div><div class="abig"><span class="n">' + (cur == null ? dash : cur) + '</span>' +
    (cur != null ? '<span class="d ' + deltaCls(cur, prev) + '">' + (prev == null ? '첫 점수예요' : '지난주보다 ' + delta(cur, prev)) + '</span>' : '<span class="d">기록이 더 필요해요</span>') + '</div>' +
    growthBars(ser, meta.name) +
    '<div class="gstat">' + [['이번 주', cur], ['지난주', prev], ['8주 평균', avg8], ['8주 최고', max8]].map(x => '<div><div class="gl1">' + x[0] + '</div><div class="gl2">' + (x[1] == null ? dash : x[1]) + '</div></div>').join('') + '</div></section>';
  const g = hist[7].g;
  h += '<!--col--><section class="group"><div class="gh">근거</div>';
  if (key === 'all') {
    h += abils.map(a => '<div class="brow2 c-' + a.cls + '"><span class="b1">' + a.name + '</span><span class="b2">' + (g[a.k].v == null ? '기록 모으는 중 (' + Math.min(g[a.k].n, MIN_DAYS) + ' / ' + MIN_DAYS + '일)' : esc(g[a.k].basis)) + '</span><span class="b3">' + (g[a.k].v == null ? dash : g[a.k].v) + '</span></div>').join('');
  } else {
    const x = g[key];
    h += '<div class="brow2 c-' + meta.cls + '"><span class="b2 wide">' + (x.v == null ? '아직 점수를 낼 수 없어요. 기록이 ' + MIN_DAYS + '일 이상 필요해요 (지금 ' + Math.min(x.n, MIN_DAYS) + '일).' : esc(x.basis)) + '</span></div>';
    if (key === 'rest' && S.settings.rate) { const s = sleepStats(); h += '<div class="brow2"><span class="b2 wide">평균 평점 ' + (s.avgScore == null ? dash : s.avgScore.toFixed(1) + ' / 10') + ' · 점수에는 넣지 않아요</span></div>'; }
  }
  h += '</section><section class="card howc"><div class="gh2">이 점수는 이렇게 계산돼요</div><p>' + meta.how + '</p></section>';
  const go = { body: 'exlist', strength: 'exlist', rest: 'sleep', money: 'money', faith: 'faith' }[key];
  if (go) h += '<a href="#" class="dashbtn" data-act="go" data-arg="' + go + '">기록 보러 가기</a>';
  return h;
}

/* ---------- 리뷰 ---------- */
function heatCells() {
  const t = todayStr(), start = weekKey(addDays(t, -28)), o = ix();
  let cells = '', full = 0;
  for (let i = 0; i < 35; i++) {
    const d = addDays(start, i);
    if (d > t) { cells += '<span class="hc fut"></span>'; continue; }
    const a = (o.first && d >= o.first) ? activityFor(d) : { n: 0, total: 0 };
    const f = a.total ? a.n / a.total : 0;
    if (a.total && a.n === a.total) full++;
    cells += '<span class="hc l' + (f === 0 ? 0 : f <= 0.34 ? 1 : f <= 0.67 ? 2 : 3) + '"></span>';
  }
  return { cells, full };
}
function insightCard(r) {
  const fmt = v => r.kind === 'score' ? v.toFixed(1) + '점' : r.kind === 'dur' ? fmtDur(v) : r.kind === 'prob' ? Math.round(v * 100) + '%' : r.kind === 'pace' ? fmtPace(v) + ' /km' : won(Math.round(v));
  const mx = Math.max(r.avgA, r.avgB, 1e-9), fastest = Math.min(r.avgA, r.avgB) || 1;
  const w = v => (r.kind === 'score' ? v / 10 * 100 : r.kind === 'prob' ? v * 100 : r.kind === 'pace' ? (1 / v) / (1 / fastest) * 100 : v / mx * 100).toFixed(0);
  return '<section class="card ins"><div class="i1">' + r.title + '</div>' +
    '<div class="ibar"><span class="in">' + r.a + ' <i>' + r.nA + '일</i></span><span class="itrack"><span class="hi" style="width:' + w(r.avgA) + '%"></span></span><span class="iv">' + fmt(r.avgA) + '</span></div>' +
    '<div class="ibar"><span class="in">' + r.b + ' <i>' + r.nB + '일</i></span><span class="itrack"><span style="width:' + w(r.avgB) + '%"></span></span><span class="iv">' + fmt(r.avgB) + '</span></div></section>';
}
function linkSection(tag, max) {
  const list = insightsFor(tag, max || 1);
  if (!list.length) return '';
  return '<section><div class="sh"><h2>다른 분야와의 연결</h2><a href="#" class="lnk" data-act="go" data-arg="review">리뷰</a></div><div class="stackc">' + list.map(insightCard).join('') + '</div><p class="foot">최근 8주 기록 기준 · 원인이 아니라 함께 나타난 경향이에요.</p></section>';
}
function bucketGoalsFor(e) {
  if (!S.settings.show.bucket) return '';
  const goals = S.bucket.map(it => ({ it: it, info: it.done ? null : bucketLinkInfo(it) })).filter(g => g.info && g.info.e.id === e.id);
  if (!goals.length) return '';
  return '<section class="group c-bucket"><div class="gh">버킷리스트 목표 <span class="hint">기록이 목표에 닿으면 자동으로 이뤄요</span></div>' + goals.map(g =>
    '<a href="#" class="lrow" data-act="go" data-arg="bucket"><span class="lt"><span class="l1">' + esc(g.it.title) + '</span><span class="l2">' + esc(g.info.goal) + ' · ' + esc(g.info.text) + '</span><span class="lprog"><span style="width:' + g.info.pct.toFixed(0) + '%"></span></span></span>' + CHEV + '</a>').join('') + '</section>';
}
function viewReview() {
  const off = NAV.roff || 0, t = todayStr(), end = addDays(t, -7 * off), start = addDays(end, -6);
  const g = growthAt(end), comp = compositeG(g), cp = compositeG(growthAt(addDays(end, -7)));
  let h = hdr('리뷰', md(start) + ' ~ ' + md(end));
  h += '<div class="wknav"><button type="button" data-act="week" data-arg="1" aria-label="이전 주"><svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1L2 8l6 7"/></svg></button><span>' + (off === 0 ? '이번 주' : off === 1 ? '지난주' : off + '주 전') + '</span>' +
    '<button type="button" data-act="week" data-arg="-1" aria-label="다음 주"' + (off === 0 ? ' disabled' : '') + '><svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 1l6 7-6 7"/></svg></button></div><!--cols-->';
  const sent = growthSentence(g);
  if (comp != null) {
    h += '<section class="card gsent"><div class="gs1">' + (sent || 'Growth 점수가 나온 영역이 한 곳이에요.') + '</div><div class="gs2">Growth ' + comp + '점 · ' + (cp == null ? '비교할 지난주 점수가 없어요' : '지난주보다 ' + delta(comp, cp)) + '</div></section>';
  }
  const rows = weekSummary(end);
  h += '<section class="group"><div class="gh">지난 7일 기록 <span class="hint">직전 7일과 비교</span></div>' + (rows.length ? rows.map(r => {
    let dl = '';
    if (r.delta != null && r.delta !== 0) { const better = r.good === 'up' ? r.delta > 0 : r.delta < 0; dl = '<span class="rd ' + (better ? 'up' : 'down') + '">' + (r.delta > 0 ? '+' : '−') + r.deltaText + '</span>'; }
    else if (r.delta === 0) dl = '<span class="rd">변화 없음</span>';
    return '<a href="#" class="rrow c-' + r.cls + '" data-act="go" data-arg="' + r.go + '"><span class="rn">' + esc(r.name) + (r.sub ? '<i>' + r.sub + '</i>' : '') + '</span><span class="rv">' + (r.has ? r.value : dash) + '</span>' + dl + '</a>';
  }).join('') : '<div class="emptyrow">켜져 있는 분야가 없어요.</div>') + '</section>';
  h += '<!--col-->';
  const ins = crossInsights(), good = ins.filter(r => r.ready && r.strong).sort((a, b) => b.mag - a.mag).slice(0, 3);
  h += '<section><div class="sh"><h2>분야 간 연결</h2></div>';
  if (good.length) h += '<div class="stackc">' + good.map(insightCard).join('') + '</div>';
  else {
    const waiting = ins.find(r => !r.ready);
    h += '<section class="card emptyc"><div class="et">' + (ins.length ? (waiting ? '아직 연결이 보이지 않아요.<br><span class="need">' + esc(waiting.need) + '</span>' : '뚜렷한 연결은 아직 없어요.') : '수면과 다른 분야를 함께 켜 두면 연결을 찾아드려요.') + '</div></section>';
  }
  h += '<p class="foot">최근 8주 기록을 둘로 나눠 비교한 값이에요. 각 그룹이 ' + LINK_MIN + '일 이상이고 차이가 뚜렷할 때만 보여드려요. 원인이 아니라 함께 나타난 경향이라 참고용이에요.</p></section>';
  const hc = heatCells();
  h += '<section class="card" aria-label="최근 5주 기록한 날"><div class="sh2"><div class="a1b">최근 5주 기록한 날</div><div class="hint">모두 기록한 날 ' + hc.full + '일</div></div>' +
    '<div class="heatd">' + '월화수목금토일'.split('').map(x => '<span>' + x + '</span>').join('') + '</div><div class="heat">' + hc.cells + '</div>' +
    '<div class="legend2"><span>적음</span><i class="hc l0"></i><i class="hc l1"></i><i class="hc l2"></i><i class="hc l3"></i><span>많음</span></div></section>';
  return h;
}

function monthNav(label, act, canNext, mid) {
  const L = '<svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1L2 8l6 7"/></svg>';
  const R = '<svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 1l6 7-6 7"/></svg>';
  return '<div class="wknav"><button type="button" data-act="' + act + '" data-arg="-1" aria-label="이전 달">' + L + '</button>' +
    (mid ? '<button type="button" class="wkmid" data-act="' + mid + '">' + label + '</button>' : '<span>' + label + '</span>') +
    '<button type="button" data-act="' + act + '" data-arg="1" aria-label="다음 달"' + (canNext ? '' : ' disabled') + '>' + R + '</button></div>';
}

/* ---------- 캘린더 ---------- */
function dayMarks(d) {
  const st = S.settings, m = [];
  if (st.show.exercise && st.exercises.some(e => exSum(e.id, d) > 0)) m.push('run');
  if (st.show.sleep && sleepOn(d)) m.push('sleep');
  if (st.show.money && (spendOn(d) > 0 || (ix().inc[d] || 0) > 0)) m.push('money');
  if (st.show.faith && (faithCount(d) > 0 || S.logs.notes.some(n => n.d === d))) m.push('faith');
  return m;
}
function calDetail(d) {
  const st = S.settings, rows = [];
  if (st.show.exercise) st.exercises.forEach(e => (S.logs.ex[e.id] || []).filter(r => r.d === d).forEach(x =>
    rows.push(entryRow('ex|' + e.id + '|' + x.id, esc(e.name), x.m > 0 ? fmtMS(x.m) + ' · 페이스 ' + fmtPace(x.m / x.v) + ' /km' : '운동', exVal(x.v, e)))));
  const sl = st.show.sleep ? sleepOn(d) : null;
  if (sl) rows.push('<button type="button" class="erow" data-act="logSleep" data-arg="' + d + '"><span class="el"><span class="e1">수면</span><span class="e2">' + esc(sl.bed) + ' → ' + esc(sl.wake) + '</span></span><span class="er">' + fmtDur(sl.dur) + (sl.score ? ' · ' + sl.score + '점' : '') + '</span>' + EDIT_IC + '</button>');
  if (st.show.money) {
    S.logs.exp.filter(x => x.d === d).forEach(x => { const sn = x.sub ? subName(x.cat, x.sub) : ''; rows.push(entryRow('exp|' + x.id, esc(x.memo || sn || catName(x.cat)), esc(catName(x.cat)) + (sn ? ' · ' + esc(sn) : ''), '−' + won(x.amt))); });
    S.logs.inc.filter(x => x.d === d).forEach(x => rows.push(entryRow('inc|' + x.id, esc(x.memo || '수입'), '수입', '+' + won(x.amt), 'inc')));
  }
  if (st.show.faith) {
    const done = faithItems().filter(it => faithDone(d, it)), r = faithRec(d);
    if (done.length) rows.push('<div class="erow static"><span class="el"><span class="e1">신앙</span><span class="e2">' + esc(done.map(x => x.name).join(' · ')) + '</span></span><span class="er">' + done.length + '개' + (r.pray ? ' · 기도 ' + r.pray + '분' : '') + '</span></div>');
    S.logs.notes.filter(n => n.d === d).forEach(n => rows.push('<button type="button" class="nrow" data-act="editEntry" data-arg="note|' + n.id + '"><span class="ntag">' + esc(n.type) + '</span><span class="ntext">' + esc(n.text) + '</span></button>'));
  }
  return rows;
}
function viewCal() {
  const t = todayStr(), cur = t.slice(0, 7), c = NAV.cal;
  if (!c.ym) c.ym = cur;
  if (!c.sel || c.sel.slice(0, 7) !== c.ym) c.sel = c.ym === cur ? t : c.ym + '-01';
  const p = c.ym.split('-').map(Number), first = new Date(p[0], p[1] - 1, 1), dim = new Date(p[0], p[1], 0).getDate();
  let cells = '', active = 0, spent = 0, earned = 0;
  for (let i = 0; i < first.getDay(); i++) cells += '<span class="calc blank"></span>';
  for (let n = 1; n <= dim; n++) {
    const d = c.ym + '-' + PAD(n), mk = dayMarks(d);
    if (mk.length) active++;
    spent += spendOn(d); earned += ix().inc[d] || 0;
    cells += '<button type="button" class="calc' + (d === t ? ' today' : '') + (d === c.sel ? ' sel' : '') + '" data-act="calSel" data-arg="' + d + '" aria-pressed="' + (d === c.sel) + '" aria-label="' + md(d) + (mk.length ? ' 기록 있음' : '') + '"><span class="cn">' + n + '</span><span class="cdots">' + mk.map(k => '<i class="cd c-' + k + '"></i>').join('') + '</span></button>';
  }
  const st = S.settings;
  let h = hdr('캘린더', ymLabel(c.ym)) + monthNav(ymLabel(c.ym), 'calMonth', c.ym < cur, c.ym === cur ? '' : 'calToday') + '<!--cols-->';
  h += '<section class="card" aria-label="월간 캘린더"><div class="calh">' + WD.map((w, i) => '<span' + (i === 0 ? ' class="sun"' : '') + '>' + w + '</span>').join('') + '</div><div class="calg">' + cells + '</div>' +
    '<div class="callg">' + [['run', '운동', st.show.exercise], ['sleep', '수면', st.show.sleep], ['money', '가계부', st.show.money], ['faith', '신앙', st.show.faith]].filter(x => x[2]).map(x => '<span class="c-' + x[0] + '"><i class="cd"></i>' + x[1] + '</span>').join('') + '</div>' +
    '<div class="calsum"><div><div class="gl1">기록한 날</div><div class="gl2">' + active + '일</div></div>' + (st.show.money ? '<div><div class="gl1">지출</div><div class="gl2">' + won(spent) + '</div></div><div><div class="gl1">수입</div><div class="gl2">' + (earned ? won(earned) : dash) + '</div></div>' : '') + '</div></section><!--col-->';
  const rows = calDetail(c.sel), sp = spendOn(c.sel);
  h += '<section class="group"><div class="gh">' + dateLabel(c.sel) + (c.sel === t ? '' : ' · ' + md(c.sel)) + ' <span class="hint">' + (sp > 0 ? '지출 ' + won(sp) + ' · ' : '') + '눌러서 수정</span></div>' + (rows.length ? rows.join('') : '<div class="emptyrow">이 날은 기록이 없어요.</div>') + '</section>';
  return h;
}

/* ---------- 가계부 통계 ---------- */
function viewMStat() {
  const cur = monthOf(0);
  if (!NAV.stat || NAV.stat > cur) NAV.stat = cur;
  const ym = NAV.stat, D = monthData(ym), prev = monthData(monthShift(ym, -1)), st = S.settings;
  const bal = D.income - D.spent, budget = budgetTotal(ym), pct = budget > 0 ? D.spent / budget * 100 : 0;
  let h = backHdr('가계부 통계', 'money', 'money', '') + monthNav(ymLabel(ym), 'statMonth', ym < cur) + '<!--cols-->';
  h += '<section class="card c-money"><div class="kv3"><div><div class="gl1">수입</div><div class="gl2 inc">' + (D.income > 0 ? won(D.income) : dash) + '</div></div><div><div class="gl1">지출</div><div class="gl2">' + (D.spent > 0 ? won(D.spent) : dash) + '</div></div><div><div class="gl1">수지</div><div class="gl2 ' + (bal >= 0 ? 'inc' : 'neg') + '">' + (D.income > 0 || D.spent > 0 ? swon(bal) : dash) + '</div></div></div>' +
    '<div class="gl"><span>' + ymLabel(ym) + ' 예산 ' + Math.round(pct) + '% 사용</span><span>' + won(D.spent) + ' / ' + won(budget) + '</span></div><div class="track' + (pct >= 100 ? ' hot' : '') + '"><div style="width:' + Math.min(100, pct).toFixed(1) + '%"></div></div>' +
    '<div class="sm cap">' + (D.income > 0 ? '저축률 ' + Math.round(bal / D.income * 100) + '% · ' : '') + (budget > 0 ? (budget - D.spent >= 0 ? '남은 예산 ' + won(budget - D.spent) : '예산 초과 ' + won(D.spent - budget)) : '예산이 없어요') + '</div></section>';
  // 최근 6개월 수입 vs 지출
  const months = []; for (let i = 5; i >= 0; i--) months.push(monthShift(ym, -i));
  const md6 = months.map(m => monthData(m));
  h += '<section class="card c-money"><div class="sh2"><div class="a1b">최근 6개월 수입 · 지출</div></div>' + flowChart(md6) + '<div class="callg"><span class="lg-inc"><i class="cd"></i>수입</span><span class="lg-exp"><i class="cd"></i>지출</span></div></section>';
  // 요약 지표
  const days = D.elapsed, avgDay = days > 0 ? D.spent / days : 0;
  const topDay = Object.keys(D.byDay).sort((a, b) => D.byDay[b] - D.byDay[a])[0], biggest = D.exp.reduce((b, x) => !b || x.amt > b.amt ? x : b, null);
  const fixedSum = sum(D.exp.filter(x => x.fixed).map(x => x.amt)), vs = prev.spent > 0 ? Math.round((D.spent - prev.spent) / prev.spent * 100) : null;
  const rows = [
    ['하루 평균 지출', days > 0 ? won(Math.round(avgDay)) : dash],
    ['지출 건수', D.count + '건'],
    ['가장 많이 쓴 날', topDay ? md(topDay) + ' · ' + won(D.byDay[topDay]) : dash],
    ['가장 큰 지출', biggest ? esc(biggest.memo || catName(biggest.cat)) + ' · ' + won(biggest.amt) : dash],
    ['고정 지출', fixedSum > 0 ? won(fixedSum) + ' (' + Math.round(fixedSum / D.spent * 100) + '%)' : dash],
    ['지난달 대비 지출', vs == null ? dash : (vs > 0 ? '+' : vs < 0 ? '−' : '') + Math.abs(vs) + '%']
  ];
  h += '<section class="card tbl c-money" aria-label="지출 요약">' + rows.map(r => '<div class="trow2"><span class="tl">' + r[0] + '</span><span class="tv">' + r[1] + '</span></div>').join('') + '</section><!--col-->';
  // 카테고리별
  const ids = Object.keys(D.byCat).sort((a, b) => D.byCat[b] - D.byCat[a]);
  h += '<section class="card list c-money" aria-label="카테고리별 지출"><div class="sh2"><div class="a1b">카테고리별 지출</div></div>' + (ids.length ? ids.map(id => {
    const cat = st.cats.find(x => x.id === id), v = D.byCat[id], share = D.spent > 0 ? v / D.spent * 100 : 0, cb = cat ? budgetCat(cat, ym) : 0;
    return '<div class="catrow"><div class="cr1"><span class="cn">' + esc(cat ? cat.name : '기타') + '</span><span class="cv"><b>' + won(v) + '</b> · ' + share.toFixed(0) + '%</span></div><div class="track"><div style="width:' + share.toFixed(1) + '%"></div></div>' +
      (cb > 0 ? '<div class="sm cap">예산 ' + won(cb) + ' 중 ' + Math.round(v / cb * 100) + '%' + (v > cb ? ' · 초과' : '') + '</div>' : '') + '</div>';
  }).join('') : '<div class="emptyrow">이 달 지출 내역이 없어요.</div>') + '</section>';
  // 요일별
  const wd = [0, 0, 0, 0, 0, 0, 0];
  Object.keys(D.byDay).forEach(d => { wd[parseD(d).getDay()] += D.byDay[d]; });
  if (D.spent > 0) h += '<section class="card c-money"><div class="sh2"><div class="a1b">요일별 지출 합계</div></div>' + barChart({ items: wd.map((v, i) => ({ label: WD[i], value: v })), cls: 'money', fmt: v => (v / 10000).toFixed(1) + '만' }) + '</section>';
  // 수입 내역
  const inc = D.inc.slice().sort(byDateDesc);
  h += '<section class="group c-money"><div class="gh">수입 내역 <span class="hint">' + (inc.length ? inc.length + '건 · 눌러서 수정' : '') + '</span></div>' + (inc.length ? inc.slice(0, 10).map(x => entryRow('inc|' + x.id, esc(x.memo || '수입'), md(x.d), '+' + won(x.amt), 'inc')).join('') : '<div class="emptyrow">이 달 수입 내역이 없어요.</div>') +
    '<button type="button" class="addrow" data-act="logIncome">' + ico('plus', 18, 2) + '수입 추가</button></section>';
  return h;
}
/* 수입(초록)·지출(금색) 두 막대 */
function flowChart(list) {
  const W = 326, left = 6, right = 320, top = 18, bot = 150, n = list.length, step = (right - left) / n;
  const mx = Math.max(1, maxOf(list.map(x => x.income)), maxOf(list.map(x => x.spent)));
  const Y = v => bot - v / mx * (bot - top);
  let s = '<svg class="chart flow" viewBox="0 0 ' + W + ' 176" role="img" aria-label="최근 6개월 수입과 지출 막대 그래프"><path class="grid" d="M' + left + ' ' + bot + ' H' + right + '"/>';
  list.forEach((m, i) => {
    const x0 = left + i * step + (step - 40) / 2, last = i === n - 1;
    [[m.income, 'finc'], [m.spent, 'fexp']].forEach((b, k) => {
      const x = x0 + k * 21, h = b[0] > 0 ? Math.max(3, bot - Y(b[0])) : 0;
      if (h) s += '<rect class="' + b[1] + (last ? ' hi' : '') + '" x="' + x.toFixed(1) + '" y="' + (bot - h).toFixed(1) + '" width="19" height="' + h.toFixed(1) + '" rx="5"/>';
      if (last && b[0] > 0) s += '<text class="lbl" text-anchor="middle" x="' + (x + 9.5).toFixed(1) + '" y="' + (bot - h - 5).toFixed(1) + '">' + (b[0] / 10000).toFixed(b[0] >= 100000 ? 0 : 1) + '만</text>';
    });
    s += '<text class="axis" text-anchor="middle" x="' + (x0 + 20).toFixed(1) + '" y="168">' + (+m.ym.slice(5)) + '월</text>';
  });
  return s + '</svg>';
}

/* ---------- 운동 상세 ---------- */
function viewEx(id) {
  const e = S.settings.exercises.find(x => x.id === id);
  if (!e) return viewExList();
  if (e.minutes) return viewRun(e);
  const r = NAV.range, info = RANGE[r], s = exStats(e);
  const bs = buckets(r, d => exSum(e.id, d), 'sum');
  const avg = bucketAvg(bs) || 0;
  const dec = e.decimals || 0;
  let h = backHdr(esc(e.name), exIcon(e), e.cls, editLink('exercise:' + e.id)) + segCtl() + '<!--cols-->';
  h += '<section class="card c-' + e.cls + '"><div class="ml">' + info.avgLabel + '</div><div class="big">' + exVal(avg, e) + '<span class="u">' + info.per + '</span></div>' +
    '<div class="sm">' + info.sumLabel + ' ' + exVal(bucketSum(bs), e) + '</div>';
  if (r === 'week') {
    const pct = e.weekly > 0 ? Math.min(100, s.sum7 / e.weekly * 100) : 0;
    h += '<div class="gl"><span>주간 목표 ' + Math.round(pct) + '%</span><span>' + exVal(s.sum7, e) + ' / ' + exGoal(e.weekly, e) + '</span></div><div class="track"><div style="width:' + pct.toFixed(1) + '%"></div></div>';
  }
  h += barChart({ items: bs, cls: e.cls, avg: avg, fmt: v => fmtN(v, dec) }) + '<div class="sm cap">점선은 평균</div></section>';
  h += bigBtn('logEx', e.id, e.cls, '기록 추가');
  const rows = [
    ['하루 합계', exVal(s.avg, e), exBest(s.pbDay, e)],
    [e.unit === '회' ? '한 세트' : '1회 기록', s.avgEntry == null ? dash : exVal(s.avgEntry, e), s.pbEntry ? exVal(s.pbEntry, e) : dash],
    ['주간 합계', exVal(s.sum7, e), s.pbWeek ? exVal(s.pbWeek, e) : dash]
  ];
  if (e.minutes) rows.splice(2, 0, ['페이스', fmtPace(s.pace7) + (s.pace7 ? ' /km' : ''), fmtPace(s.pbPace) + (s.pbPace ? ' /km' : '')]);
  h += statTable('이번 주 평균', '개인 최고', rows, e.cls) + '<!--col-->' + goalsCard(e) + bucketGoalsFor(e);
  const list = (S.logs.ex[e.id] || []).slice().sort(byDateDesc).slice(0, 8);
  h += '<section class="group"><div class="gh">최근 기록 <span class="hint">눌러서 수정</span></div>' + (list.length ? list.map(x =>
    entryRow('ex|' + e.id + '|' + x.id, dateLabel(x.d), (x.m > 0 ? fmtMS(x.m) + ' · 페이스 ' + fmtPace(x.m / x.v) + ' /km' : ' '), exVal(x.v, e))).join('') : '<div class="emptyrow">아직 기록이 없어요.</div>') + '</section>';
  h += linkSection('exercise');
  return h;
}

/* ---------- 러닝 (기록 중심) ---------- */
function viewRun(e) {
  const r = NAV.range, rs = runStats(e), items = paceBuckets(e, r);
  const set = [].concat.apply([], bucketDays(r).map(b => b.days));
  const inRange = rs.all.filter(x => set.indexOf(x.d) >= 0);
  const pRange = paceOf(inRange), fast = inRange.length ? Math.min.apply(null, inRange.map(x => x.m / x.v)) : null;
  const label = { week: '7일 평균 페이스', month: '5주 평균 페이스', half: '6개월 평균 페이스' }[r];
  let h = backHdr(esc(e.name), exIcon(e), e.cls, editLink('exercise:' + e.id)) + segCtl() + '<!--cols-->';
  h += '<section class="card c-' + e.cls + '"><div class="ml">' + label + '</div><div class="big">' + (pRange == null ? dash : fmtPace(pRange) + '<span class="u">/km</span>') + '</div>' +
    '<div class="sm">' + (inRange.length ? inRange.length + '회 기록 · 가장 빠른 페이스 ' + fmtPace(fast) + ' /km' : '이 기간에 시간을 적은 기록이 없어요') + '</div>' +
    '<div class="pacebox">' + paceChart(items) + '</div>' + (rs.all.length ? '<div class="sm cap">위쪽이 더 빨라요 · 점이 없는 곳은 기록이 없는 구간이에요</div>' : '') + '</section>';
  h += bigBtn('logEx', e.id, e.cls, '기록 추가');
  const bestRun = rs.pbPaceId ? rs.all.find(x => x.id === rs.pbPaceId) : null;
  if (bestRun) h += '<section class="card bestcard" aria-label="최고 페이스"><div class="bc1">' + star(16) + '최고 페이스 · 내 가장 좋은 기록</div><div class="bcbig">' + fmtPace(rs.pbPace) + '<span class="u">/km</span></div><div class="bc2">' + md(bestRun.d) + ' · ' + exVal(bestRun.v, e) + ' · ' + fmtRec(bestRun.m) + '</div></section>';
  const rows = [];
  rs.dists.filter(d => d.n > 0).forEach(d => rows.push([d.D.label + ' 기록', d.avg30 == null ? dash : fmtRec(d.avg30), fmtRec(d.best)]));
  rows.push(['페이스', rs.pace30 == null ? dash : fmtPace(rs.pace30) + ' /km', rs.pbPace == null ? dash : '<span class="pbgold">' + fmtPace(rs.pbPace) + ' /km</span>']);
  rows.push(['1회 거리', rs.avgDist30 == null ? dash : exVal(rs.avgDist30, e), rs.pbDist ? exVal(rs.pbDist, e) : dash]);
  h += statTable('평균 (30일)', '최고', rows, e.cls);
  if (rs.dists.some(d => d.n > 0)) h += '<p class="foot">거리별 기록은 그 거리의 ±10% 안에서 달린 기록을 해당 거리로 환산한 값이에요.</p>';
  h += '<!--col-->' + goalsCard(e) + bucketGoalsFor(e);
  const pbMap = {};
  rs.dists.forEach(d => { if (d.bestId) pbMap[d.bestId] = d.D.label + ' 최고'; });
  if (rs.pbPaceId) pbMap[rs.pbPaceId] = (pbMap[rs.pbPaceId] ? pbMap[rs.pbPaceId] + ' · ' : '') + '최고 페이스';
  const allRuns = (S.logs.ex[e.id] || []).slice().sort(byDateDesc), allOpen = !!NAV.open['all:' + e.id];
  const list = allOpen ? allRuns.slice(0, 300) : allRuns.slice(0, 8);
  h += '<section class="group"><div class="gh">최근 기록 <span class="hint">눌러서 수정 · 삭제</span></div>' + (list.length ? list.map(x =>
    entryRow('ex|' + e.id + '|' + x.id, dateLabel(x.d), exVal(x.v, e) + (x.m > 0 ? ' · ' + fmtMS(x.m) : '') + (pbMap[x.id] ? ' <span class="pbtag' + (x.id === rs.pbPaceId ? ' gold' : '') + '">' + pbMap[x.id] + '</span>' : ''), x.m > 0 ? fmtPace(x.m / x.v) + ' /km' : dash, x.id === rs.pbPaceId ? 'pbgold' : '')).join('') : '<div class="emptyrow">아직 기록이 없어요. 거리와 시간을 함께 적어 보세요.</div>') +
    (allRuns.length > 8 ? '<button type="button" class="addrow" data-act="toggleAll" data-arg="' + e.id + '">' + (allOpen ? '접기' : '모든 기록 보기 (' + allRuns.length + ')') + '</button>' : '') + '</section>';
  h += linkSection('exercise');
  return h;
}

/* ---------- 버킷리스트 · 위시리스트 ---------- */
const whenOf = x => (x.when === '올해' || x.when === '내년') ? x.when : '언젠가';
const safeUrl = u => /^https?:\/\/\S+$/i.test(u || '') ? u : '';
function listRow(kind, it) {
  const bucket = kind === 'bucket', act = bucket ? 'Bucket' : 'Wish', title = bucket ? it.title : it.name;
  const info = bucket && !it.done ? bucketLinkInfo(it) : null;
  const fit = !bucket ? wishFit(it) : null;
  const sub = it.done ? (bucket && it.autoSeen ? '운동 기록으로 이뤘어요 · ' : (bucket ? '이룬 날 ' : '구입한 날 ')) + (it.doneAt ? md(it.doneAt) : '')
    : (info ? esc(info.goal) + ' · ' + esc(info.text) : (it.memo ? esc(it.memo) : '')) + (fit ? ' <span class="fit ' + fit + '">' + (fit === 'ok' ? '이번 달 예산 안' : '이번 달 예산 초과') + '</span>' : '');
  const price = !bucket && it.price > 0 ? '<span class="liprice">' + won(it.price) + '</span>' : '';
  const link = !bucket && safeUrl(it.link) ? '<a class="lilink" href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(title) + ' 링크 열기">링크</a>' : '';
  return '<div class="lirow c-' + kind + '"><button type="button" class="lick" data-act="tg' + act + '" data-arg="' + it.id + '" aria-pressed="' + !!it.done + '" aria-label="' + esc(title) + (it.done ? ' 다시 진행 중으로' : (bucket ? ' 이뤘어요' : ' 구입했어요')) + '">' + (it.done ? DONE_SVG : TODO_SVG) + '</button>' +
    '<button type="button" class="litext" data-act="edit' + act + '" data-arg="' + it.id + '"><span class="li1' + (it.done ? ' dn' : '') + '">' + esc(title) + '</span>' + (sub ? '<span class="li2">' + sub + '</span>' : '') + (info ? '<span class="lprog"><span style="width:' + info.pct.toFixed(0) + '%"></span></span>' : '') + '</button>' + link + price + '</div>';
}
function viewBucket() {
  const st = bucketStats(), pct = st.total ? Math.round(100 * st.done / st.total) : 0;
  let h = backHdr('버킷리스트', 'flag', 'bucket', '') + '<!--cols-->';
  h += '<section class="card c-bucket"><div class="ml">이룬 것</div><div class="bigrow"><div class="big">' + st.done + '<span class="u">/ ' + st.total + '</span></div><div class="sm nm">' + pct + '%</div></div><div class="track"><div style="width:' + pct + '%"></div></div></section>';
  h += bigBtn('addBucket', '', 'bucket', '버킷리스트 추가') + '<!--col-->';
  if (!st.total) return h + empty('하고 싶은 일을 하나씩 적어 보세요.<br>올해·내년·언젠가로 나눠 둘 수 있어요.');
  ['올해', '내년', '언젠가'].forEach(w => {
    const list = S.bucket.filter(x => !x.done && whenOf(x) === w);
    if (list.length) h += '<section class="group"><div class="gh">' + w + ' <span class="hint">' + list.length + '개</span></div>' + list.map(x => listRow('bucket', x)).join('') + '</section>';
  });
  const dn = S.bucket.filter(x => x.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  if (dn.length) h += '<section class="group"><div class="gh">이룬 것 <span class="hint">' + dn.length + '개</span></div>' + dn.map(x => listRow('bucket', x)).join('') + '</section>';
  return h;
}
function viewWish() {
  const st = wishStats(), m = S.settings.show.money ? moneyStats() : null;
  let h = backHdr('위시리스트', 'gift', 'wish', '') + '<!--cols-->';
  h += '<section class="card c-wish"><div class="ml">갖고 싶은 것</div><div class="bigrow"><div class="big">' + st.open + '<span class="u">개</span></div><div class="sm nm">합계 ' + won(st.sum) + '</div></div>' +
    (m ? '<div class="sm cap">' + ymNow() + ' 남은 예산 ' + swon(budgetTotal() - m.month) + '</div>' : '') + '</section>';
  h += bigBtn('addWish', '', 'wish', '위시리스트 추가') + '<!--col-->';
  if (!st.total) return h + empty('갖고 싶은 것을 적어 두고,<br>정말 필요한지 천천히 생각해 보세요.');
  ['높음', '보통'].forEach(p => {
    const list = S.wish.filter(x => !x.done && (x.prio === '높음' ? '높음' : '보통') === p);
    if (list.length) h += '<section class="group"><div class="gh">우선순위 ' + p + ' <span class="hint">' + list.length + '개</span></div>' + list.map(x => listRow('wish', x)).join('') + '</section>';
  });
  const dn = S.wish.filter(x => x.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  if (dn.length) h += '<section class="group"><div class="gh">구입함 <span class="hint">' + dn.length + '개</span></div>' + dn.map(x => listRow('wish', x)).join('') + '</section>';
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
  let h = backHdr('수면', 'sleep', 'sleep', editLink('sleep')) + segCtl() + '<!--cols-->';
  h += '<section class="card c-sleep"><div class="ml">' + (r === 'week' ? '7일 평균' : info.avgLabel.replace(' (하루)', '')) + '</div><div class="bigrow"><div class="big">' + (avg == null ? dash : fmtDur(avg)) + '</div>' +
    (st.rate && s.avgScore != null ? '<div class="rate">' + star(16) + s.avgScore.toFixed(1) + '<span class="u">/ 10</span></div>' : '') + '</div>' +
    '<div class="sm">점선은 목표 ' + fmtDurShort(goal) + (r === 'week' ? ' · 7일 중 ' + s.achieved + '일 달성' : '') + (r === 'week' && st.rate ? ' · 막대 아래는 평점' : '') + '</div>' +
    barChart({ items: items, cls: 'sleep', goal: goal, fmt: fmtB, belowH: (r === 'week' && st.rate) ? 44 : 24 }) + '</section>';
  const t = todayStr(), rec = sleepOn(t);
  let last = '<section class="card c-sleep" aria-label="어젯밤 수면"><div class="a1">어젯밤</div>';
  if (rec) {
    last += '<div class="g3"><div><div class="ml">취침</div><div class="t22">' + esc(rec.bed) + '</div></div><div><div class="ml">기상</div><div class="t22">' + esc(rec.wake) + '</div></div><div><div class="ml">수면</div><div class="t22">' + fmtDur(rec.dur) + '</div></div></div>';
    if (st.rate) {
      const sc = rec.score || 0;
      last += '<hr><div class="qrow"><div><div class="q1">잘 잤나요?</div><div class="q2">' + (sc ? (sc >= 9 ? '아주 개운해요' : sc >= 7 ? '잘 잤어요' : sc >= 5 ? '보통이에요' : sc >= 3 ? '피곤해요' : '매우 피곤해요') : '점수를 눌러 기록해요') + '</div></div><div class="qn">' + (sc || dash) + '<span class="u">/ 10</span></div></div>' +
        '<div class="scores">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => '<button type="button" class="sc' + (n === sc ? ' on' : '') + '" data-act="score" data-arg="' + n + '" aria-pressed="' + (n === sc) + '" aria-label="' + n + '점">' + n + '</button>').join('') + '</div>';
    }
    last += '<div class="btnrow"><button type="button" class="btn ghost" data-act="logSleep" data-arg="' + t + '">기록 수정</button></div>';
  } else {
    last += '<div class="emptyin">오늘 아침 기록이 아직 없어요.</div><div class="btnrow"><button type="button" class="btn" data-act="logSleep" data-arg="' + t + '">수면 기록하기</button></div>';
  }
  h += last + '</section>';
  const trows = [['수면 시간', s.avgDur == null ? dash : fmtDur(s.avgDur), s.pbLong == null ? dash : fmtDur(s.pbLong)]];
  if (st.rate) trows.push(['평점 (10점)', s.avgScore == null ? dash : s.avgScore.toFixed(1), s.pbScore == null ? dash : s.pbScore + '점']);
  h += statTable('이번 주 평균', '개인 최고', trows, 'sleep');
  h += '<!--col-->';
  if (st.rate) {
    const ins = sleepInsight();
    h += '<section class="card c-sleep" aria-label="나에게 맞는 수면"><div class="a1 withi">' + ico('sleep', 18, 2) + '나에게 맞는 수면</div>';
    if (!ins.ok) {
      h += '<div class="emptyin">평점을 3일 이상 기록하면 잘 잔 날의 수면 시간과 취침 시각을 찾아드려요.</div>';
    } else {
      const range = ins.min === ins.max ? fmtDur(ins.min) + ' 전후' : fmtDur(ins.min).replace(' 0분', '') + ' ~ ' + fmtDur(ins.max).replace(' 0분', '');
      const axis = 660, a0 = 1320;
      const bedN = Math.max(a0, ins.bed), p1 = clamp((bedN - a0) / axis, 0, 1), p2 = clamp((ins.wake + 1440 - a0) / axis, 0, 1);
      h += '<div class="ml top">평점이 가장 높았던 수면 시간</div><div class="big sm26">' + range + '</div><div class="rate2">' + star(13) + '이 구간의 평균 평점 ' + ins.avg.toFixed(1) + ' / 10 · ' + ins.count + '일 기록</div><hr>' +
        '<div class="qrow"><div class="ml">추천 취침 · 기상</div><div class="q1">' + hm(ins.bed) + ' → ' + hm(ins.wake) + '</div></div>' +
        '<div class="tl"><div class="tltrack"></div><div class="tlband" style="left:' + (p1 * 100).toFixed(1) + '%;width:' + (Math.max(2, (p2 - p1) * 100)).toFixed(1) + '%"></div></div>' +
        '<div class="tlax">' + [['22시', 0], ['0시', 18.2], ['2시', 36.4], ['4시', 54.5], ['6시', 72.7], ['8시', 90.9]].map(a => '<span style="left:' + a[1] + '%">' + a[0] + '</span>').join('') + '</div><hr>' +
        '<div class="ml">수면 시간별 평균 평점 (10점 만점)</div>' + ins.groups.map(g => '<div class="grow"><div class="gn"><div class="g1">' + g.name + '</div><div class="g2">' + g.count + '일 기록' + (g.count < 2 ? ' · 참고용' : '') + '</div></div><div class="btrack"><div style="width:' + (g.avg * 10).toFixed(0) + '%"></div></div><div class="gv">' + g.avg.toFixed(1) + '</div></div>').join('');
    }
    const prog = Math.min(100, ins.n / 14 * 100);
    h += '<hr><div class="qrow"><div class="ml">분석에 쓰인 기록</div><div class="q3">' + ins.n + '일 / 14일</div></div><div class="track"><div style="width:' + prog.toFixed(0) + '%"></div></div><div class="sm cap">14일 이상 쌓이면 추천이 더 정확해져요.</div></section>';
  }
  const list = sleepList().slice().reverse().slice(0, 7);
  h += '<section class="group"><div class="gh">최근 기록 <span class="hint">눌러서 수정</span></div>' + (list.length ? list.map(x =>
    '<button type="button" class="erow" data-act="logSleep" data-arg="' + x.d + '"><span class="el"><span class="e1">' + dateLabel(x.d) + '</span><span class="e2">' + esc(x.bed) + ' → ' + esc(x.wake) + '</span></span><span class="er">' + fmtDur(x.dur) + (x.score ? ' · ' + x.score + '점' : '') + '</span>' + EDIT_IC + '</button>').join('') : '<div class="emptyrow">아직 기록이 없어요.</div>') + '</section>';
  h += linkSection('sleep', 2);
  return h;
}

/* ---------- 가계부 ---------- */
const catName = id => { const c = S.settings.cats.find(x => x.id === id); return c ? c.name : '기타'; };
const subName = (cid, sid) => { const c = S.settings.cats.find(x => x.id === cid); const s = c && c.subs.find(x => x.id === sid); return s ? s.name : ''; };
function viewMoney() {
  const st = S.settings, r = NAV.range, info = RANGE[r], m = moneyStats();
  const bs = buckets(r, d => spendOn(d), 'sum');
  const avg = bucketAvg(bs) || 0;
  const fmtM = v => (v / 10000).toFixed(1) + '만';
  let h = backHdr('가계부', 'money', 'money', editLink('money')) + segCtl() + '<!--cols-->';
  h += '<section class="card c-money"><div class="ml">' + info.avgLabel + '</div><div class="big">' + won(avg) + '<span class="u">' + info.per + '</span></div><div class="sm">' + info.sumLabel + ' ' + won(bucketSum(bs)) + ' · 점선은 평균</div>' +
    barChart({ items: bs, cls: 'money', avg: avg, fmt: fmtM }) + '</section>';
  h += '<div class="btnpair"><button type="button" class="btn c-money" data-act="logMoney" data-arg="">지출 추가</button><button type="button" class="btn ghost c-money" data-act="logIncome" data-arg="">수입 추가</button></div>';
  h += '<a href="#" class="group lstrow c-money" data-act="go" data-arg="mstat"><span class="l1">수입·지출 통계</span><span class="l2r">월별 종합 보기</span>' + CHEV + '</a>';
  const pct = budgetTotal() > 0 ? m.month / budgetTotal() * 100 : 0;
  const vs = m.lastSame > 0 ? Math.round((m.month - m.lastSame) / m.lastSame * 100) : null;
  h += '<section class="card c-money" aria-label="이번 달"><div class="bigrow"><div class="a1">' + ymNow() + '</div><div class="sm nm">남은 예산 ' + swon(budgetTotal() - m.month) + '</div></div>' +
    '<div class="big">' + won(m.month) + '<span class="u">/ ' + won(budgetTotal()) + '</span></div><div class="track' + (pct >= 100 ? ' hot' : '') + '"><div style="width:' + Math.min(100, pct).toFixed(1) + '%"></div></div>' +
    '<div class="kv3"><div><div class="gl1">수입</div><div class="gl2">' + (m.income > 0 ? won(m.income) : dash) + '</div></div><div><div class="gl1">남은 돈</div><div class="gl2">' + (m.income > 0 ? swon(m.income - m.month) : dash) + '</div></div><div><div class="gl1">지난달 대비</div><div class="gl2">' + (vs == null ? dash : (vs > 0 ? '+' : vs < 0 ? '−' : '') + Math.abs(vs) + '%') + '</div></div></div>' +
    (m.lastTotal > 0 ? '<div class="sm cap">지난달 같은 날까지 ' + won(m.lastSame) + ' · 지난달 전체 ' + won(m.lastTotal) + '</div>' : '') + '</section>';
  h += statTable('이번 주 평균', '개인 최고', [['하루 지출', won(m.avg), wonBest(m.pbDay)], ['주간 합계', won(m.sum7), wonBest(m.pbWeek)]], 'money');
  h += '<!--col--><section class="card list c-money" aria-label="카테고리별 지출"><div class="sh2"><div class="a1b">카테고리 · ' + ymNow() + ' 예산</div>' + editLink('money') + '</div>' + (st.cats.length ? st.cats.map(c => {
    const sp = catSpentMonth(c.id), cb = budgetCat(c), p = cb > 0 ? Math.round(sp / cb * 100) : (sp > 0 ? 100 : 0);
    const has = c.subs.length > 0, open = !!NAV.open[c.id];
    const head = '<span class="cn">' + esc(c.name) + (has ? '<span class="cex' + (open ? ' o' : '') + '">' + CHEV + '</span>' : '') + '</span><span class="cv"><b>' + won(sp) + '</b> / ' + won(cb) + '</span>';
    let r2 = '<div class="catrow">' + (has ? '<button type="button" class="cr1 asbtn" data-act="toggleCat" data-arg="' + c.id + '" aria-expanded="' + open + '">' + head + '</button>' : '<div class="cr1">' + head + '</div>') +
      '<div class="track' + (p >= 90 ? ' hot' : '') + '"><div style="width:' + Math.min(100, p) + '%"></div></div>';
    if (has && open) {
      const un = subSpentMonth(c.id, '');
      r2 += '<div class="subs">' + c.subs.map(s => '<div class="sr"><span>' + esc(s.name) + '</span><b>' + won(subSpentMonth(c.id, s.id)) + '</b></div>').join('') + (un > 0 ? '<div class="sr"><span>미분류</span><b>' + won(un) + '</b></div>' : '') + '</div>';
    }
    return r2 + '</div>';
  }).join('') : '<div class="emptyrow">카테고리가 없어요. 편집에서 추가해 보세요.</div>') + '</section>';
  const fx = st.fixed, fxSum = sum(fx.map(f => f.amt));
  h += '<section class="group c-money"><div class="gh">고정 지출 <span class="hint">매달 정해진 날 자동으로 입력돼요' + (fx.length ? ' · 합계 ' + won(fxSum) : '') + '</span></div>' + fx.map(f =>
    '<button type="button" class="erow" data-act="editFixed" data-arg="' + f.id + '"><span class="el"><span class="e1">' + esc(f.name) + '</span><span class="e2">매월 ' + f.day + '일 · ' + esc(catName(f.cat)) + (f.sub ? ' · ' + esc(subName(f.cat, f.sub)) : '') + '</span></span><span class="er">' + won(f.amt) + '</span></button>').join('') +
    '<button type="button" class="addrow" data-act="addFixed">' + ico('plus', 18, 2) + '고정 지출 추가</button></section>';
  const ws = wishStats();
  if (st.show.wish && ws.open) h += '<a href="#" class="group lstrow c-wish" data-act="go" data-arg="wish"><span class="l1">위시리스트</span><span class="l2r">' + ws.open + '개 · 합계 ' + won(ws.sum) + '</span>' + CHEV + '</a>';
  const items = S.logs.exp.map(x => Object.assign({ t: 'exp' }, x)).concat(S.logs.inc.map(x => Object.assign({ t: 'inc' }, x))).sort(byDateDesc).slice(0, 14);
  let rows = '', lastD = null;
  items.forEach(x => {
    if (x.d !== lastD) { lastD = x.d; const sp = spendOn(x.d); rows += '<div class="dgh"><span>' + dateLabel(x.d) + '</span><span>' + (sp > 0 ? '−' + won(sp) : '') + '</span></div>'; }
    if (x.t === 'inc') rows += entryRow('inc|' + x.id, esc(x.memo || '수입'), '수입', '+' + won(x.amt), 'inc');
    else {
      const sn = x.sub ? subName(x.cat, x.sub) : '';
      rows += entryRow('exp|' + x.id, esc(x.memo || sn || catName(x.cat)), esc(catName(x.cat)) + (sn ? ' · ' + esc(sn) : '') + (x.fixed ? ' · 고정' : ''), '−' + won(x.amt));
    }
  });
  h += '<section class="group"><div class="gh">최근 내역 <span class="hint">눌러서 수정</span></div>' + (rows || '<div class="emptyrow">아직 내역이 없어요.</div>') + '</section>';
  h += linkSection('money');
  return h;
}

/* ---------- 신앙 ---------- */
const NOTE_TYPES = ['묵상', '감사', '기도'];
function viewFaith() {
  const st = S.settings, r = NAV.range, info = RANGE[r], f = faithStats();
  const bs = buckets(r, d => faithRec(d).pray || 0, 'sum');
  const avg = bucketAvg(bs) || 0;
  let h = backHdr('신앙', 'faith', 'faith', editLink('faith')) + '<!--cols-->';
  const grid = f.items.map(it => {
    const cells = f.days.map(d => '<span class="fc' + (faithDone(d, it) ? ' on' : '') + '"></span>').join('');
    const n = f.days.filter(d => faithDone(d, it)).length;
    return '<div class="frow" role="img" aria-label="' + esc(it.name) + ': 7일 중 ' + n + '일 실천"><span class="fn">' + esc(it.name) + '</span>' + cells + '</div>';
  }).join('');
  h += '<section class="card c-faith" aria-label="7일 실천 기록"><div class="ml">7일 실천률</div><div class="bigrow"><div class="big">' + (f.rate == null ? dash : Math.round(f.rate * 100) + '%') + '</div><div class="sm nm">' + f.doneTotal + ' / ' + f.total + ' 완료 · 연속 ' + f.streak + '일</div></div>' +
    '<div class="fhead"><span></span>' + f.days.map(d => '<span>' + WD[parseD(d).getDay()] + '</span>').join('') + '</div>' + (grid || '<div class="emptyin">설정에서 신앙 항목을 켜 주세요.</div>') + '</section>';
  const checks = f.items.map(it => {
    const rec = faithRec(todayStr());
    return { key: 'faith:' + it.id, cls: 'faith', title: it.name, sub: it.track === 'pray' && rec.pray ? rec.pray + '분' : it.track === 'read' && rec.read ? rec.read + '장' : '', done: faithDone(todayStr(), it) };
  });
  h += '<section><div class="sh"><h2>오늘</h2><div class="shr"><span>' + checks.filter(c => c.done).length + ' / ' + checks.length + ' 완료</span></div></div><div class="group">' +
    (checks.length ? checks.map(checkRow).join('') : '<div class="emptyrow">표시할 항목이 없어요.</div>') + '</div></section>';
  h += bigBtn('logFaith', '', 'faith', '기도·말씀 기록');
  const notes = S.logs.notes.slice().sort(byDateDesc).slice(0, 5);
  h += '<section class="group c-faith"><div class="gh">신앙 메모 <span class="hint">눌러서 수정</span></div>' + (notes.length ? notes.map(n =>
    '<button type="button" class="nrow" data-act="editEntry" data-arg="note|' + n.id + '"><span class="ntag">' + esc(n.type) + '</span><span class="ntext">' + esc(n.text) + '</span><span class="ndate">' + md(n.d) + '</span></button>').join('') : '<div class="emptyrow">묵상이나 감사한 일을 한두 줄 남겨 보세요.</div>') +
    '<button type="button" class="addrow" data-act="addNote">' + ico('plus', 18, 2) + '메모 추가</button></section>';
  h += '<!--col-->';
  const topics = st.topics.slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
  h += '<section class="group c-faith"><div class="gh">기도 제목 <span class="hint">눌러서 수정 · 응답받으면 표시해요</span></div>' + (topics.length ? topics.map(t =>
    '<button type="button" class="trow2b" data-act="editEntry" data-arg="topic|' + t.id + '"><span class="tmark">' + (t.done ? DONE_SVG : TODO_SVG) + '</span><span class="tt' + (t.done ? ' dn' : '') + '">' + esc(t.text) + '</span>' + (t.done ? '<span class="tstat">응답받음</span>' : '') + '</button>').join('') : '<div class="emptyrow">기도 제목을 추가해 보세요.</div>') +
    '<button type="button" class="addrow" data-act="addTopic">' + ico('plus', 18, 2) + '기도 제목 추가</button></section>';
  h += '<h2 class="gl2">기도 시간</h2>' + segCtl();
  h += '<section class="card c-faith"><div class="ml">기도 시간 · ' + info.avgLabel + '</div><div class="big">' + fmtN(avg, 0) + '<span class="u">분 ' + info.per + '</span></div><div class="sm">이번 기간 최고 ' + maxOf(bs.map(b => b.value || 0)) + '분 · 점선은 평균</div>' +
    barChart({ items: bs, cls: 'faith', avg: avg, fmt: v => fmtN(v, 0) }) + '</section>';
  h += statTable('이번 주 평균', '개인 최고', [
    ['기도 시간', Math.round(f.avgPray) + '분', f.pbPray + '분'],
    ['말씀 읽기', f.avgRead.toFixed(1) + '장 / 일', f.pbRead + '장'],
    ['하루 실천 항목', f.avgCount.toFixed(1) + '개', f.pbCount + '개'],
    ['연속 실천 (현재)', f.streak + '일', f.bestStreak + '일']
  ], 'faith');
  const giving = st.cats.find(c => /헌금|기부/.test(c.name));
  if (st.show.money && giving) h += '<a href="#" class="group lstrow c-money" data-act="go" data-arg="money"><span class="l1">이번 달 ' + esc(giving.name) + '</span><span class="l2r">' + won(catSpentMonth(giving.id)) + (budgetCat(giving) ? ' / ' + won(budgetCat(giving)) : '') + '</span>' + CHEV + '</a>';
  h += linkSection('faith');
  return h;
}

/* ---------- 설정 ---------- */
function sw(label, on, act, arg) {
  return '<div class="srow2"><span class="sl2">' + label + '</span><button type="button" role="switch" aria-checked="' + on + '" aria-label="' + label + '" class="swt' + (on ? ' on' : '') + '" data-act="' + act + '" data-arg="' + arg + '"><span></span></button></div>';
}
function stepRow(title, sub, display, act, arg) {
  return '<div class="strow"><div class="stt"><div class="st1">' + title + '</div>' + (sub ? '<div class="st2">' + sub + '</div>' : '') + '</div>' +
    '<button type="button" class="sbt" data-act="' + act + '" data-arg="' + arg + '|-1" aria-label="' + esc(title) + ' 줄이기">' + ico('minus', 16, 2.4) + '</button><span class="sval">' + display + '</span>' +
    '<button type="button" class="sbt" data-act="' + act + '" data-arg="' + arg + '|1" aria-label="' + esc(title) + ' 늘리기">' + ico('plus', 16, 2.4) + '</button></div>';
}
const trashBtn = (act, arg, name) => '<button type="button" class="ibtn" data-act="' + act + '" data-arg="' + arg + '" aria-label="' + esc(name) + ' 삭제">' + ico('trash', 18, 1.8) + '</button>';
const dashAdd = (act, text) => '<button type="button" class="dashbtn" data-act="' + act + '">' + ico('plus', 18, 2) + text + '</button>';
const glabel = t => '<h2 class="gl2">' + t + '</h2>';

function setExercise(only) {
  const st = S.settings;
  const list = only ? st.exercises.filter(e => e.id === only) : st.exercises;
  const title = only && list[0] ? list[0].name + ' 설정' : '운동 설정';
  let h = backHdr(title, null, 'blue');
  h += list.map(e => {
    const stepW = e.unit === 'km' ? 5 : 20;
    return '<section class="group c-' + e.cls + '"><div class="nmrow"><input class="nm" value="' + esc(e.name) + '" aria-label="종목 이름" data-chg="renEx" data-arg="' + e.id + '">' + trashBtn('delEx', e.id, e.name) + '</div>' +
      stepRow('주간 목표', 'Growth 점수의 기준이에요', exGoal(e.weekly, e), 'stepEx', e.id + '|weekly|' + stepW + '|1|5000') +
      '<div class="gh2s">일간·주간·월간 목표</div>' +
      e.goals.map(g => entryRow('goal|' + e.id + '|' + g.id, esc(goalTitle(e, g)), g.type === 'days' ? '횟수 목표' : '합계 목표', '')).join('') +
      '<button type="button" class="addrow" data-act="addGoal" data-arg="' + e.id + '">' + ico('plus', 18, 2) + '목표 추가</button></section>';
  }).join('');
  if (!only) h += dashAdd('addEx', '운동 종목 추가');
  return h;
}
function setSleep() {
  const st = S.settings;
  return backHdr('수면 설정', null, 'blue') + '<section class="group">' + stepRow('목표 수면 시간', '성인 권고는 하루 7시간 이상이에요', fmtDurShort(st.sleepGoal * 60), 'stepSet', 'sleepGoal|0.5|4|12') +
    sw('수면 평점 기록 (10점 만점)', st.rate, 'tgRate', '') + '</section>';
}
function setMoney() {
  const st = S.settings, base = NAV.bmode === 'base', cur = monthOf(0);
  if (!NAV.bm) NAV.bm = cur;
  const ym = NAV.bm, own = !!budgetOf(ym);
  let h = backHdr('가계부 설정', null, 'blue') + '<p class="subline">예산은 월 단위예요. 달마다 다르게 정하거나, 따로 정하지 않은 달에 쓰는 기본 예산을 바꿀 수 있어요.</p>';
  h += '<div class="seg" role="group" aria-label="예산 종류">' + [['month', '월별 예산'], ['base', '기본 예산']].map(x => '<button type="button" data-act="bmode" data-arg="' + x[0] + '" aria-pressed="' + (NAV.bmode === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
  if (!base) h += monthNav(ymLabel(ym) + (ym === cur ? ' · 이번 달' : ''), 'bmMonth', true) + '<p class="subline">' + (own ? ymLabel(ym) + '만 따로 정한 예산이에요.' : '따로 정하지 않아 기본 예산을 쓰고 있어요. 아래 값을 바꾸면 이 달만 따로 저장돼요.') + '</p>';
  const tot = base ? st.monthly : budgetTotal(ym);
  h += '<section class="group">' + stepRow('월 예산', base ? '기본 전체 예산' : ymLabel(ym) + ' 전체 예산', won(tot), base ? 'stepSet' : 'stepBudget', base ? 'monthly|50000|100000|50000000' : 'total|50000') + '</section>';
  if (!base && own) h += '<div class="btnpair"><button type="button" class="btn ghost" data-act="bmBase">기본 예산으로 저장</button><button type="button" class="btn ghost danger" data-act="bmReset">이 달 설정 지우기</button></div><p class="fhint">‘기본 예산으로 저장’은 이 달 값을 따로 정하지 않은 모든 달에 쓰는 값으로 바꿔요.</p>';
  h += glabel('카테고리');
  h += st.cats.map(c => '<section class="group c-money"><div class="nmrow"><input class="nm" value="' + esc(c.name) + '" aria-label="카테고리 이름" data-chg="renCat" data-arg="' + c.id + '">' + trashBtn('delCat', c.id, c.name) + '</div>' +
    (base ? stepRow('월 예산', '', won(c.monthly), 'stepCat', c.id + '|10000') : stepRow('월 예산', '', won(budgetCat(c, ym)), 'stepBudget', 'c:' + c.id + '|10000')) +
    c.subs.map(s => '<div class="subrow"><input class="nm inl" value="' + esc(s.name) + '" aria-label="세부 항목 이름" data-chg="renSub" data-arg="' + c.id + '|' + s.id + '">' + trashBtn('delSub', c.id + '|' + s.id, s.name) + '</div>').join('') +
    '<button type="button" class="addrow" data-act="addSub" data-arg="' + c.id + '">' + ico('plus', 18, 2) + '세부 항목 추가</button></section>').join('');
  h += dashAdd('addCat', '카테고리 추가');
  return h;
}
function setFaith() {
  const st = S.settings;
  return backHdr('신앙 설정', null, 'blue') + '<section class="group">' + st.faith.map(f =>
    '<div class="srow2"><input class="nm inl" value="' + esc(f.name) + '" aria-label="항목 이름" data-chg="renFaith" data-arg="' + f.id + '"><button type="button" role="switch" aria-checked="' + f.on + '" aria-label="' + esc(f.name) + ' 표시" class="swt' + (f.on ? ' on' : '') + '" data-act="tgFaith" data-arg="' + f.id + '"><span></span></button>' +
    (f.track ? '' : trashBtn('delFaith', f.id, f.name)) + '</div>').join('') +
    '<button type="button" class="addrow" data-act="addFaith">' + ico('plus', 18, 2) + '항목 추가</button></section>';
}
function viewSettings() {
  const st = S.settings, a = (NAV.arg || '').split(':');
  if (a[0] === 'exercise') return setExercise(a[1] || null);
  if (a[0] === 'sleep') return setSleep();
  if (a[0] === 'money') return setMoney();
  if (a[0] === 'faith') return setFaith();
  let h = backHdr('설정', null, 'blue') + '<!--cols-->';
  h += glabel('분야 표시') + '<section class="group">' +
    sw('운동', st.show.exercise, 'tgShow', 'exercise') + sw('수면', st.show.sleep, 'tgShow', 'sleep') + sw('가계부', st.show.money, 'tgShow', 'money') + sw('신앙', st.show.faith, 'tgShow', 'faith') + sw('버킷리스트', st.show.bucket, 'tgShow', 'bucket') + sw('위시리스트', st.show.wish, 'tgShow', 'wish') + '</section>';
  const link = (arg, t, s) => '<a href="#" class="lrow" data-act="go" data-arg="settings|' + arg + '"><span class="lt"><span class="l1">' + t + '</span><span class="l2">' + s + '</span></span>' + CHEV + '</a>';
  let ls = '';
  if (st.show.exercise) ls += link('exercise', '운동', st.exercises.map(e => esc(e.name)).join(' · ') || '종목 없음');
  if (st.show.sleep) ls += link('sleep', '수면', '목표 ' + fmtDurShort(st.sleepGoal * 60));
  if (st.show.money) ls += link('money', '가계부', '월 예산 ' + won(budgetTotal()));
  if (st.show.faith) ls += link('faith', '신앙', st.faith.filter(f => f.on).length + '개 항목');
  if (ls) h += glabel('분야별 설정') + '<section class="group">' + ls + '</section>';
  const vp = viewportSize();
  h += '<!--col-->' + glabel('화면') + '<div class="seg" role="group" aria-label="화면 모드">' + [['auto', '자동'], ['light', '라이트'], ['dark', '다크']].map(x => '<button type="button" data-act="theme" data-arg="' + x[0] + '" aria-pressed="' + (S.theme === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
  h += glabel('화면 배치 (이 기기에만 적용)') + '<div class="seg" role="group" aria-label="화면 배치">' + [['auto', '자동'], ['phone', '폰'], ['tablet', '태블릿']].map(x => '<button type="button" data-act="layoutPref" data-arg="' + x[0] + '" aria-pressed="' + (LAYOUT_PREF === x[0]) + '">' + x[1] + '</button>').join('') + '</div>' +
    '<p class="subline">지금 화면 크기 ' + vp.w + ' × ' + vp.h + ' · ' + LAYOUT_NAME[LAYOUT] + '</p>' +
    '<p class="subline">앱 버전 ' + APP_VERSION + ' · ' + (isStandalone() ? '설치한 앱' : '브라우저') + (deviceOrientation() ? ' · 기기 방향 ' + deviceOrientation() : '') + '</p>';
  let sy = '<section class="group"><div class="dnote">' + esc(syncStatusText()) + '</div>';
  if (PROV) sy += '<button type="button" class="drow" data-act="syncNow">지금 동기화</button>' + (PROV.name === 'gist' ? '<button type="button" class="drow danger" data-act="syncOff">이 기기 연결 해제</button>' : '');
  else if (!inClaude()) sy += '<button type="button" class="drow" data-act="syncSetup">다른 기기와 연결하기</button><div class="dnote">폰·태블릿·컴퓨터를 같은 GitHub 계정으로 연결하면 기록이 자동으로 이어져요. 기록은 비밀번호로 암호화돼요.</div>';
  h += glabel('기기 간 동기화') + sy + '</section>';
  h += glabel('데이터') + '<section class="group"><button type="button" class="drow" data-act="seed">예시 데이터 채우기</button><button type="button" class="drow" data-act="exportData">데이터 내보내기 (JSON 백업)</button><button type="button" class="drow" data-act="importData">데이터 가져오기 (JSON 백업)</button><button type="button" class="drow danger" data-act="resetAll">모든 데이터 지우기</button></section>';
  return h;
}

const VIEWS = {
  today: () => viewToday(), cats: () => viewCats(), growth: () => viewGrowth(), growthd: () => viewGrowthD(), review: () => viewReview(), cal: () => viewCal(), mstat: () => viewMStat(), exlist: () => viewExList(),
  ex: () => viewEx(NAV.arg), sleep: () => viewSleep(), money: () => viewMoney(), faith: () => viewFaith(), bucket: () => viewBucket(), wish: () => viewWish(), settings: () => viewSettings()
};
const TAB_OF = { today: 'today', cats: 'cats', growth: 'growth', growthd: 'growth', review: 'review', cal: 'cal', mstat: 'cats', exlist: 'cats', ex: 'cats', sleep: 'cats', money: 'cats', faith: 'cats', bucket: 'cats', wish: 'cats', settings: 'cats' };

/* ================= 시트(입력·수정 창) ================= */
let SHEET = null;
const byId = id => document.getElementById(id);
const val = id => { const el = byId(id); return el ? el.value : ''; };
function field(label, id, type, value, attrs) {
  return '<div class="fld"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + type + '" value="' + esc(value) + '" ' + (attrs || '') + '></div>';
}
function area(label, id, value, attrs) {
  return '<div class="fld"><label for="' + id + '">' + label + '</label><textarea id="' + id + '" rows="5" ' + (attrs || '') + '>' + esc(value) + '</textarea></div>';
}
function chipsHtml(grp, options, sel) {
  return '<div class="chipsel" role="group">' + options.map(o => '<button type="button" class="cs' + (String(o.v) === String(sel) ? ' on' : '') + '" data-act="pickVal" data-arg="' + grp + '|' + esc(o.v) + '" data-grp="' + grp + '" aria-pressed="' + (String(o.v) === String(sel)) + '">' + esc(o.l) + '</button>').join('') + '</div>';
}
const ERR = '<div class="err" id="serr" role="alert"></div>';
const delBtn = arg => '<button type="button" class="btn ghost danger" data-act="delRec" data-arg="' + arg + '">이 기록 삭제</button>';
function setErr(msg) { const el = byId('serr'); if (el) el.textContent = msg; }
function openSheet(title, body, onSave, o) {
  o = o || {};
  SHEET = { vals: o.vals || {}, onSave: onSave, onPick: o.onPick };
  const el = byId('sheet');
  el.innerHTML = '<div class="sbg" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
    '<div class="shh"><button type="button" class="sb" data-act="closeSheet">' + esc(o.cancel || '취소') + '</button><div class="stt2">' + esc(title) + '</div><button type="button" class="sb strong' + (o.danger ? ' danger' : '') + '" data-act="sheetSave">' + esc(o.save || '저장') + '</button></div>' +
    '<div class="shb">' + body + '</div></div>';
  el.classList.add('open');
  document.documentElement.classList.add('noscroll');
  setTimeout(() => { const f = el.querySelector('input:not([type=hidden]), textarea'); if (f && o.focus !== false) f.focus(); }, 60);
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
const done = msg => { commit(); closeSheet(); toast(msg || '저장했어요'); render(); };

/* ---- 운동 기록 (추가·수정) ---- */
const digits = v => String(v).replace(/[^0-9]/g, '');
const decimal = v => { const s = String(v).replace(/,/g, '.').replace(/[^0-9.]/g, ''), i = s.indexOf('.'); return i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, ''); };
function tfield(label, id, value, max) {
  return '<div class="fld"><label for="' + id + '">' + label + '</label><input id="' + id + '" class="tin" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="' + max + '" autocomplete="off" placeholder="0" value="' + esc(value) + '" data-inp="runPrev" data-chg="runNorm"></div>';
}
function timeFieldsHtml(v) {
  if (v.tmode === 'pace') return '<div class="two">' + tfield('1km당 페이스 · 분', 'f-pmin', v.pmin, 3) + tfield('초', 'f-psec', v.psec, 2) + '</div>';
  return '<div class="two">' + tfield('걸린 시간 · 분', 'f-min', v.min, 3) + tfield('초', 'f-sec', v.sec, 2) + '</div>';
}
/* 시트에 지금 보이는 입력 방식 기준으로 거리와 총 시간(초)을 읽어요 */
function readRun() {
  const v = SHEET ? SHEET.vals : {}, km = parseFloat(decimal(val('f-val'))) || 0, n = id => parseInt(digits(val(id)), 10) || 0;
  let sec = 0;
  if (v.shown === 'pace') sec = Math.round((n('f-pmin') * 60 + n('f-psec')) * km);
  else sec = n('f-min') * 60 + n('f-sec');
  return { km: km, sec: sec };
}
function runPreviewText(r, mode) {
  if (!(r.km > 0)) return '거리를 입력하면 페이스를 계산해 드려요.';
  if (!(r.sec > 0)) return mode === 'pace' ? '페이스를 입력하면 총 시간을 계산해 드려요.' : '시간(분·초)을 입력하면 페이스를 계산해 드려요.';
  const kmh = r.km / (r.sec / 3600);
  return mode === 'pace' ? '총 시간 ' + fmtMS(r.sec / 60) + ' · 시속 ' + kmh.toFixed(1) + ' km/h' : '페이스 ' + fmtPace(r.sec / 60 / r.km) + ' /km · 시속 ' + kmh.toFixed(1) + ' km/h';
}
function updateRunPreview() { if (!SHEET) return; const el = byId('runprev'); if (el) el.textContent = runPreviewText(readRun(), SHEET.vals.shown); }
function switchTimeMode() {
  const v = SHEET.vals, r = readRun();     // 입력칸은 아직 이전 방식이에요
  v.shown = v.tmode;
  if (v.tmode === 'pace') { const p = r.km > 0 && r.sec > 0 ? Math.round(r.sec / r.km) : 0; v.pmin = p ? Math.floor(p / 60) : ''; v.psec = p ? p % 60 : ''; }
  else { v.min = r.sec ? Math.floor(r.sec / 60) : ''; v.sec = r.sec ? r.sec % 60 : ''; }
  const w = byId('timewrap'); if (w) w.innerHTML = timeFieldsHtml(v);
  updateRunPreview();
}
function sheetLogRun(e, cur, eid, t) {
  const total = cur && cur.m > 0 ? Math.round(cur.m * 60) : 0;
  const vals = { tmode: 'time', shown: 'time', min: total ? Math.floor(total / 60) : '', sec: total ? total % 60 : '', pmin: '', psec: '' };
  const body = field('날짜', 'f-date', 'date', cur ? cur.d : t, 'max="' + t + '"') +
    '<div class="fld"><label for="f-val">거리 (' + esc(e.unit) + ')</label><input id="f-val" class="tin" type="text" inputmode="decimal" autocomplete="off" placeholder="예: 5.0" value="' + esc(cur ? cur.v : '') + '" data-inp="runPrev"></div>' +
    '<div class="fld"><label>시간 입력 방식</label>' + chipsHtml('tmode', [{ v: 'time', l: '걸린 시간' }, { v: 'pace', l: '페이스' }], 'time') + '</div>' +
    '<div id="timewrap">' + timeFieldsHtml(vals) + '</div>' +
    '<div class="runprev" id="runprev" aria-live="polite">' + esc(runPreviewText({ km: cur ? cur.v : 0, sec: total }, 'time')) + '</div>' +
    '<p class="fhint">시간은 비워 둬도 돼요. 시간을 적으면 페이스와 거리별 기록이 계산돼요.</p>' + (cur ? delBtn('ex|' + e.id + '|' + eid) : '') + ERR;
  openSheet(esc(e.name) + (cur ? ' 기록 수정' : ' 기록'), body, () => {
    const d = val('f-date');
    if (!d || d > t) return setErr('날짜를 확인해 주세요.');
    const r = readRun();
    if (!(r.km > 0)) return setErr('거리를 입력해 주세요.');
    const rec = cur || { id: uid() };
    rec.d = d; rec.v = r.km; delete rec.m;
    if (r.sec > 0) rec.m = r.sec / 60;
    if (!cur) (S.logs.ex[e.id] = S.logs.ex[e.id] || []).push(rec);
    done();
  }, { vals: vals, focus: !cur, onPick: grp => { if (grp === 'tmode') switchTimeMode(); } });
}
function sheetLogEx(id, eid) {
  const e = S.settings.exercises.find(x => x.id === id);
  if (!e) return;
  const t = todayStr(), cur = eid ? (S.logs.ex[id] || []).find(x => x.id === eid) : null;
  if (eid && !cur) return;
  if (e.minutes) return sheetLogRun(e, cur, eid, t);
  const body = field('날짜', 'f-date', 'date', cur ? cur.d : t, 'max="' + t + '"') +
    field(esc(e.name) + ' (' + esc(e.unit) + ')', 'f-val', 'text', cur ? cur.v : '', 'inputmode="decimal" autocomplete="off" placeholder="0" data-inp="num"') +
    '<p class="fhint">오늘 합계 ' + exVal(exSum(e.id, t), e) + ' · 주간 목표 ' + exGoal(e.weekly, e) + '</p>' + (cur ? delBtn('ex|' + id + '|' + eid) : '') + ERR;
  openSheet(esc(e.name) + (cur ? ' 기록 수정' : ' 기록'), body, () => {
    const d = val('f-date'), v = parseFloat(decimal(val('f-val')));
    if (!d || d > t) return setErr('날짜를 확인해 주세요.');
    if (!(v > 0)) return setErr('값을 입력해 주세요.');
    const rec = cur || { id: uid() };
    rec.d = d; rec.v = v;
    if (!cur) (S.logs.ex[e.id] = S.logs.ex[e.id] || []).push(rec);
    done();
  });
}

/* ---- 수면 ---- */
function sheetSleep(date) {
  const t = todayStr(), d0 = date || t, ex = S.logs.sleep[d0];
  const vals = { score: ex && ex.score ? ex.score : '' };
  const body = field('기상한 날', 'f-date', 'date', d0, 'max="' + t + '"') +
    '<div class="two">' + field('취침 시각', 'f-bed', 'time', ex ? ex.bed : '23:30') + field('기상 시각', 'f-wake', 'time', ex ? ex.wake : '07:00') + '</div>' +
    (S.settings.rate ? '<div class="fld"><label>잘 잤나요? (10점 만점)</label><div class="scoregrid" role="group">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => '<button type="button" class="cs' + (n === vals.score ? ' on' : '') + '" data-act="pickVal" data-arg="score|' + n + '" data-grp="score" aria-pressed="' + (n === vals.score) + '">' + n + '</button>').join('') + '</div></div>' : '') +
    (ex ? '<button type="button" class="btn ghost danger" data-act="delSleep" data-arg="' + d0 + '">이 기록 삭제</button>' : '') + ERR;
  openSheet(ex ? '수면 기록 수정' : '수면 기록', body, () => {
    const d = val('f-date'), bed = val('f-bed'), wake = val('f-wake');
    if (!d || d > t) return setErr('날짜를 확인해 주세요.');
    if (!bed || !wake) return setErr('취침과 기상 시각을 입력해 주세요.');
    const dur = (toMin(wake) - toMin(bed) + 1440) % 1440;
    if (dur < 60 || dur > 18 * 60) return setErr('수면 시간이 너무 짧거나 길어요. 시각을 확인해 주세요.');
    const rec = { bed: bed, wake: wake, dur: dur };
    if (S.settings.rate && SHEET.vals.score) rec.score = Number(SHEET.vals.score);
    if (d !== d0) delete S.logs.sleep[d0];
    S.logs.sleep[d] = rec;
    done();
  }, { vals: vals, focus: false });
}

/* ---- 지출 (추가·수정) ---- */
function subChips(cid, sel) {
  const c = S.settings.cats.find(x => x.id === cid);
  if (!c || !c.subs.length) return '';
  return '<label>세부 항목 (선택)</label>' + chipsHtml('sub', [{ v: '', l: '선택 안 함' }].concat(c.subs.map(x => ({ v: x.id, l: x.name }))), sel || '');
}
function sheetMoney(eid) {
  const t = todayStr(), cats = S.settings.cats, cur = eid ? S.logs.exp.find(x => x.id === eid) : null;
  if (eid && !cur) return;
  const vals = { cat: cur ? cur.cat : (cats.length ? cats[0].id : ''), sub: cur && cur.sub ? cur.sub : '' };
  const showNo = !cur && !spendOn(t) && !S.logs.nospend[t];
  const body = field('금액 (원)', 'f-amt', 'number', cur ? cur.amt : '', 'inputmode="numeric" step="100" min="0" placeholder="0"') +
    '<div class="fld"><label>카테고리</label>' + chipsHtml('cat', cats.map(c => ({ v: c.id, l: c.name })), vals.cat) + '</div>' +
    '<div class="fld" id="subwrap">' + subChips(vals.cat, vals.sub) + '</div>' +
    field('메모 (선택)', 'f-memo', 'text', cur ? cur.memo : '', 'maxlength="40" placeholder="예: 점심"') +
    field('날짜', 'f-date', 'date', cur ? cur.d : t, 'max="' + t + '"') +
    (showNo ? '<button type="button" class="btn ghost" data-act="noSpend">오늘은 지출 없음</button>' : '') + (cur ? delBtn('exp|' + eid) : '') + ERR;
  openSheet(cur ? '지출 수정' : '지출 추가', body, () => {
    const d = val('f-date'), amt = Math.round(parseFloat(val('f-amt')));
    if (!d || d > t) return setErr('날짜를 확인해 주세요.');
    if (!(amt > 0)) return setErr('금액을 입력해 주세요.');
    const rec = cur || { id: uid() };
    rec.d = d; rec.cat = SHEET.vals.cat; rec.amt = amt; rec.memo = val('f-memo').trim();
    if (SHEET.vals.sub) rec.sub = SHEET.vals.sub; else delete rec.sub;
    if (!cur) S.logs.exp.push(rec);
    done();
  }, { vals: vals, focus: !cur, onPick: grp => {
    if (grp === 'cat') { SHEET.vals.sub = ''; const w = byId('subwrap'); if (w) w.innerHTML = subChips(SHEET.vals.cat, ''); }
  } });
}

/* ---- 수입 ---- */
function sheetIncome(eid) {
  const t = todayStr(), cur = eid ? S.logs.inc.find(x => x.id === eid) : null;
  if (eid && !cur) return;
  const body = field('금액 (원)', 'f-amt', 'number', cur ? cur.amt : '', 'inputmode="numeric" step="1000" min="0" placeholder="0"') +
    field('메모 (선택)', 'f-memo', 'text', cur ? cur.memo : '', 'maxlength="40" placeholder="예: 급여, 용돈"') +
    field('날짜', 'f-date', 'date', cur ? cur.d : t, 'max="' + t + '"') + (cur ? delBtn('inc|' + eid) : '') + ERR;
  openSheet(cur ? '수입 수정' : '수입 추가', body, () => {
    const d = val('f-date'), amt = Math.round(parseFloat(val('f-amt')));
    if (!d || d > t) return setErr('날짜를 확인해 주세요.');
    if (!(amt > 0)) return setErr('금액을 입력해 주세요.');
    const rec = cur || { id: uid() };
    rec.d = d; rec.amt = amt; rec.memo = val('f-memo').trim();
    if (!cur) S.logs.inc.push(rec);
    done();
  }, { focus: !cur });
}

/* ---- 고정 지출 ---- */
function sheetFixed(fid) {
  const cats = S.settings.cats, cur = fid ? S.settings.fixed.find(x => x.id === fid) : null;
  if (fid && !cur) return;
  const vals = { cat: cur ? cur.cat : (cats.length ? cats[0].id : ''), sub: cur && cur.sub ? cur.sub : '' };
  const body = field('이름', 'f-name', 'text', cur ? cur.name : '', 'maxlength="20" placeholder="예: 월세, 통신비"') +
    '<div class="two">' + field('금액 (원)', 'f-amt', 'number', cur ? cur.amt : '', 'inputmode="numeric" step="1000" min="0"') + field('매월 몇 일', 'f-day', 'number', cur ? cur.day : '', 'inputmode="numeric" step="1" min="1" max="31" placeholder="1~31"') + '</div>' +
    '<div class="fld"><label>카테고리</label>' + chipsHtml('cat', cats.map(c => ({ v: c.id, l: c.name })), vals.cat) + '</div>' +
    '<div class="fld" id="subwrap">' + subChips(vals.cat, vals.sub) + '</div>' +
    '<p class="fhint">정한 날이 되면 지출 내역에 자동으로 들어가요. 말일보다 큰 날짜는 그 달의 마지막 날에 들어가요.</p>' +
    (cur ? '<button type="button" class="btn ghost danger" data-act="delRec" data-arg="fixed|' + fid + '">고정 지출 삭제</button>' : '') + ERR;
  openSheet(cur ? '고정 지출 수정' : '고정 지출 추가', body, () => {
    const name = val('f-name').trim(), amt = Math.round(parseFloat(val('f-amt'))), day = Math.round(parseFloat(val('f-day')));
    if (!name) return setErr('이름을 입력해 주세요.');
    if (!(amt > 0)) return setErr('금액을 입력해 주세요.');
    if (!(day >= 1 && day <= 31)) return setErr('날짜는 1~31 사이로 입력해 주세요.');
    const rec = cur || { id: 'x' + uid(), since: monthOf(0), applied: {} };
    rec.name = name; rec.amt = amt; rec.day = day; rec.cat = SHEET.vals.cat;
    if (SHEET.vals.sub) rec.sub = SHEET.vals.sub; else delete rec.sub;
    if (!cur) S.settings.fixed.push(rec);
    applyFixed();
    done(cur ? '저장했어요' : '추가했어요');
  }, { vals: vals, focus: !cur, onPick: grp => {
    if (grp === 'cat') { SHEET.vals.sub = ''; const w = byId('subwrap'); if (w) w.innerHTML = subChips(SHEET.vals.cat, ''); }
  } });
}

/* ---- 신앙 ---- */
function fillFaith(d) {
  const r = faithRec(d);
  const p = byId('f-pray'), q = byId('f-read');
  if (p) p.value = r.pray || '';
  if (q) q.value = r.read || '';
}
function sheetFaith() {
  const t = todayStr(), rec = faithRec(t), items = S.settings.faith.filter(f => f.on);
  const pray = items.some(f => f.track === 'pray'), read = items.some(f => f.track === 'read');
  if (!pray && !read) { toast('설정에서 말씀 읽기나 기도 항목을 켜 주세요'); return; }
  const body = '<div class="fld"><label for="f-date">날짜</label><input id="f-date" type="date" value="' + t + '" max="' + t + '" data-chg="faithDate" data-arg=""></div>' +
    (pray ? field('기도 시간 (분)', 'f-pray', 'number', rec.pray || '', 'inputmode="numeric" step="1" min="0"') : '') +
    (read ? field('말씀 읽기 (장)', 'f-read', 'number', rec.read || '', 'inputmode="numeric" step="1" min="0"') : '') + ERR;
  openSheet('기도·말씀 기록', body, () => {
    const d = val('f-date');
    if (!d || d > t) return setErr('날짜를 확인해 주세요.');
    const r = S.logs.faith[d] = S.logs.faith[d] || {};
    if (pray && val('f-pray') !== '') r.pray = Math.max(0, Math.round(parseFloat(val('f-pray')) || 0));
    if (read && val('f-read') !== '') r.read = Math.max(0, Math.round(parseFloat(val('f-read')) || 0));
    done();
  });
}
function sheetNote(nid) {
  const t = todayStr(), cur = nid ? S.logs.notes.find(x => x.id === nid) : null;
  if (nid && !cur) return;
  const vals = { type: cur ? cur.type : '묵상' };
  const body = '<div class="fld"><label>종류</label>' + chipsHtml('type', NOTE_TYPES.map(x => ({ v: x, l: x })), vals.type) + '</div>' +
    area('내용', 'f-text', cur ? cur.text : '', 'maxlength="600" placeholder="오늘의 묵상이나 감사한 일을 적어 보세요"') +
    field('날짜', 'f-date', 'date', cur ? cur.d : t, 'max="' + t + '"') + (cur ? delBtn('note|' + nid) : '') + ERR;
  openSheet(cur ? '메모 수정' : '메모 추가', body, () => {
    const text = val('f-text').trim(), d = val('f-date');
    if (!d || d > t) return setErr('날짜를 확인해 주세요.');
    if (!text) return setErr('내용을 입력해 주세요.');
    const rec = cur || { id: uid() };
    rec.d = d; rec.type = SHEET.vals.type; rec.text = text;
    if (!cur) S.logs.notes.push(rec);
    done();
  }, { vals: vals, focus: !cur });
}
function sheetTopic(tid) {
  const cur = tid ? S.settings.topics.find(x => x.id === tid) : null;
  if (tid && !cur) return;
  const vals = { status: cur && cur.done ? 'done' : 'open' };
  const body = field('기도 제목', 'f-text', 'text', cur ? cur.text : '', 'maxlength="40" placeholder="예: 가족의 건강"') +
    '<div class="fld"><label>상태</label>' + chipsHtml('status', [{ v: 'open', l: '기도 중' }, { v: 'done', l: '응답받음' }], vals.status) + '</div>' +
    (cur ? delBtn('topic|' + tid) : '') + ERR;
  openSheet(cur ? '기도 제목 수정' : '기도 제목 추가', body, () => {
    const text = val('f-text').trim();
    if (!text) return setErr('내용을 입력해 주세요.');
    const rec = cur || { id: 't' + uid() };
    rec.text = text; rec.done = SHEET.vals.status === 'done';
    if (!cur) S.settings.topics.push(rec);
    done();
  }, { vals: vals, focus: !cur });
}

/* ---- 설정에서 쓰는 추가 창 ---- */
function sheetAddEx() {
  const vals = { unit: 'km', kind: 'cardio' };
  const body = field('종목 이름', 'f-name', 'text', '', 'maxlength="14" placeholder="예: 자전거"') +
    '<div class="fld"><label>단위</label>' + chipsHtml('unit', [{ v: 'km', l: 'km' }, { v: '회', l: '회' }, { v: '분', l: '분' }], 'km') + '</div>' +
    '<div class="fld"><label>어느 영역에 반영할까요?</label>' + chipsHtml('kind', [{ v: 'cardio', l: '체력' }, { v: 'strength', l: '근력' }], 'cardio') + '</div>' +
    field('주간 목표', 'f-goal', 'number', '', 'inputmode="decimal" step="any" min="0" placeholder="예: 20"') + ERR;
  openSheet('운동 종목 추가', body, () => {
    const name = val('f-name').trim(), goal = parseFloat(val('f-goal'));
    if (!name) return setErr('종목 이름을 입력해 주세요.');
    if (!(goal > 0)) return setErr('주간 목표를 입력해 주세요.');
    const unit = SHEET.vals.unit;
    S.settings.exercises.push({ id: 'x' + uid(), name: name, unit: unit, goal: Math.round(goal / 5 * 10) / 10, weekly: goal, cls: SHEET.vals.kind === 'strength' ? 'push' : 'run', kind: SHEET.vals.kind, decimals: unit === 'km' ? 1 : 0, minutes: unit === 'km', goals: [] });
    done('추가했어요');
  }, { vals: vals });
}
/* ---- 운동 목표 (추가·수정) ---- */
function goalFieldsHtml(e, v) {
  const max = v.gper === 'week' ? 7 : 31;
  let h = '<div class="fld"><label>기간</label>' + chipsHtml('gper', [{ v: 'day', l: '일간' }, { v: 'week', l: '주간' }, { v: 'month', l: '월간' }], v.gper) + '</div>';
  if (v.gper !== 'day') h += '<div class="fld"><label>목표 방식</label>' + chipsHtml('gtype', [{ v: 'total', l: '합계 달성' }, { v: 'days', l: '며칠 이상 하기' }], v.gtype) + '</div>';
  if (v.gper !== 'day' && v.gtype === 'days') {
    h += '<div class="two">' + field(GOAL_LABEL[v.gper] + ' 며칠 (최대 ' + max + ')', 'f-gt', 'number', v.gt, 'inputmode="numeric" step="1" min="1" max="' + max + '" placeholder="예: 2"') + field('하루 최소 (' + esc(e.unit) + ')', 'f-gmin', 'number', v.gmin, 'inputmode="decimal" step="any" min="0" placeholder="예: 5"') + '</div>' +
      '<p class="fhint">예: ' + (v.gper === 'week' ? '주 2일, 하루 5km 이상 달리기' : '한 달에 8일, 하루 5km 이상 달리기') + '</p>';
  } else h += field(GOAL_LABEL[v.gper] + ' 목표 (' + esc(e.unit) + ')', 'f-gt', 'number', v.gt, 'inputmode="decimal" step="any" min="0" placeholder="예: ' + (v.gper === 'day' ? '3' : v.gper === 'week' ? '15' : '60') + '"');
  return h;
}
function syncGoal() {
  const v = SHEET.vals, a = byId('f-gt'), b = byId('f-gmin');
  if (a) v.gt = a.value;
  if (b) v.gmin = b.value;
}
function sheetGoal(eid, gid) {
  const e = S.settings.exercises.find(x => x.id === eid);
  if (!e) return;
  const cur = gid ? e.goals.find(x => x.id === gid) : null;
  if (gid && !cur) return;
  const vals = { gper: cur ? cur.period : 'week', gtype: cur ? cur.type : 'total', gt: cur ? cur.target : '', gmin: cur && cur.type === 'days' ? cur.min : '' };
  const body = '<div id="goalwrap">' + goalFieldsHtml(e, vals) + '</div>' + (cur ? delBtn('goal|' + eid + '|' + gid) : '') + ERR;
  openSheet(esc(e.name) + (cur ? ' 목표 수정' : ' 목표 추가'), body, () => {
    syncGoal();
    const V = SHEET.vals, type = V.gper === 'day' ? 'total' : V.gtype, target = parseFloat(V.gt);
    if (!(target > 0)) return setErr('목표 값을 입력해 주세요.');
    const g = cur || { id: 'g' + uid() };
    g.period = V.gper; g.type = type; g.target = target;
    if (type === 'days') {
      const min = parseFloat(V.gmin);
      if (!(min > 0)) return setErr('하루 최소 값을 입력해 주세요.');
      if (target !== Math.round(target) || target > (V.gper === 'week' ? 7 : 31)) return setErr('며칠은 ' + (V.gper === 'week' ? '1~7' : '1~31') + ' 사이 정수로 입력해 주세요.');
      g.min = min;
    } else delete g.min;
    if (!cur) e.goals.push(g);
    done();
  }, { vals: vals, focus: !cur, onPick: grp => {
    if (grp === 'gper' || grp === 'gtype') { syncGoal(); const V = SHEET.vals; if (V.gper === 'day') V.gtype = 'total'; const w = byId('goalwrap'); if (w) w.innerHTML = goalFieldsHtml(e, V); }
  } });
}
const splitNames = txt => { const out = []; String(txt).split(/[,，、\n]/).forEach(x => { x = x.trim(); if (x && out.indexOf(x) < 0 && out.length < 12) out.push(x); }); return out; };
function sheetAddCat() {
  const body = field('카테고리 이름', 'f-name', 'text', '', 'maxlength="12" placeholder="예: 데이트"') +
    field('월 예산 (원)', 'f-w', 'number', '', 'inputmode="numeric" step="10000" min="0" placeholder="150000"') +
    field('세부 항목 (선택, 쉼표로 구분)', 'f-subs', 'text', '', 'placeholder="예: 식비, 주차비, 문화생활, 교통비"') + ERR;
  openSheet('카테고리 추가', body, () => {
    const name = val('f-name').trim(), w = Math.round(parseFloat(val('f-w')));
    if (!name) return setErr('이름을 입력해 주세요.');
    S.settings.cats.push({ id: 'c' + uid(), name: name, monthly: w > 0 ? w : 0, subs: splitNames(val('f-subs')).map(n => ({ id: 's' + uid(), name: n })) });
    done('추가했어요');
  });
}
function sheetAddSub(cid) {
  const c = S.settings.cats.find(x => x.id === cid);
  if (!c) return;
  const body = '<p class="fhint">‘' + esc(c.name) + '’ 안에 들어갈 세부 항목이에요.</p>' + field('이름 (쉼표로 여러 개)', 'f-subs', 'text', '', 'placeholder="예: 식비, 주차비"') + ERR;
  openSheet('세부 항목 추가', body, () => {
    const names = splitNames(val('f-subs'));
    if (!names.length) return setErr('이름을 입력해 주세요.');
    names.forEach(n => { if (!c.subs.some(x => x.name === n)) c.subs.push({ id: 's' + uid(), name: n }); });
    done('추가했어요');
  });
}
function sheetAddFaith() {
  const body = field('항목 이름', 'f-name', 'text', '', 'maxlength="14" placeholder="예: 큐티"') + ERR;
  openSheet('신앙 항목 추가', body, () => {
    const name = val('f-name').trim();
    if (!name) return setErr('이름을 입력해 주세요.');
    S.settings.faith.push({ id: 'f' + uid(), name: name, on: true, track: null });
    done('추가했어요');
  });
}

/* ---- 버킷리스트 ---- */
const showDone = v => { const w = byId('donewrap'); if (w && w.style) w.style.display = v === 'done' ? 'block' : 'none'; };
function linkFieldsHtml(v) {
  const e = v.lex ? S.settings.exercises.find(x => x.id === v.lex) : null;
  if (!e) return '';
  let h = '';
  if (e.minutes) {
    const types = [{ v: 'dist', l: '한 번에 달린 거리' }].concat(e.id === 'run' ? [{ v: 'time', l: '거리·시간 목표' }] : []);
    h += '<div class="fld"><label>달성 조건</label>' + chipsHtml('ltype', types, v.ltype) + '</div>';
    if (v.ltype === 'time' && e.id === 'run') {
      h += '<div class="fld"><label>거리</label>' + chipsHtml('ldist', RUN_DISTS.map(d => ({ v: d.d, l: d.label })), v.ldist) + '</div>' +
        '<div class="two">' + field('목표 시간 · 분', 'f-lmin', 'number', v.lmin, 'inputmode="numeric" step="1" min="0"') + field('초', 'f-lsec', 'number', v.lsec, 'inputmode="numeric" step="1" min="0" max="59"') + '</div>';
    } else h += field('목표 거리 (' + e.unit + ')', 'f-ltarget', 'number', v.ltarget, 'inputmode="decimal" step="any" min="0" placeholder="예: 21.1"');
  } else h += field('하루 목표 (' + e.unit + ')', 'f-ltarget', 'number', v.ltarget, 'inputmode="numeric" step="1" min="0" placeholder="예: 100"');
  return h;
}
function syncLink() {
  const v = SHEET.vals;
  ['f-ltarget', 'f-lmin', 'f-lsec'].forEach(id => { const el = byId(id); if (el) v[{ 'f-ltarget': 'ltarget', 'f-lmin': 'lmin', 'f-lsec': 'lsec' }[id]] = el.value; });
}
function refreshLink() { syncLink(); const w = byId('linkwrap'); if (w) w.innerHTML = linkFieldsHtml(SHEET.vals); }
function sheetBucket(bid) {
  const t = todayStr(), cur = bid ? S.bucket.find(x => x.id === bid) : null;
  if (bid && !cur) return;
  const L = cur && cur.link, exs = S.settings.show.exercise ? S.settings.exercises : [];
  const vals = { when: cur ? whenOf(cur) : '올해', status: cur && cur.done ? 'done' : 'open',
    lex: L && exs.some(e => e.id === L.ex) ? L.ex : '', ltype: L ? L.type : 'dist', ldist: L && L.dist ? L.dist : 5,
    lmin: L && L.type === 'time' ? Math.floor(L.sec / 60) : '', lsec: L && L.type === 'time' ? L.sec % 60 : '', ltarget: L && L.type !== 'time' ? L.target : '' };
  const body = field('하고 싶은 일', 'f-title', 'text', cur ? cur.title : '', 'maxlength="60" placeholder="예: 하프마라톤 완주"') +
    '<div class="fld"><label>언제쯤?</label>' + chipsHtml('when', ['올해', '내년', '언젠가'].map(x => ({ v: x, l: x })), vals.when) + '</div>' +
    area('메모 (선택)', 'f-memo', cur ? cur.memo : '', 'maxlength="200" rows="3" placeholder="이유나 준비할 것을 적어 두세요"') +
    (exs.length ? '<div class="fld"><label>운동 기록과 연결 (선택)</label>' + chipsHtml('lex', [{ v: '', l: '연결 안 함' }].concat(exs.map(e => ({ v: e.id, l: e.name }))), vals.lex) + '<p class="fhint">기록이 목표에 닿으면 자동으로 이룬 것으로 바뀌어요.</p></div><div id="linkwrap">' + linkFieldsHtml(vals) + '</div>' : '') +
    '<div class="fld"><label>상태</label>' + chipsHtml('status', [{ v: 'open', l: '진행 중' }, { v: 'done', l: '이뤘어요' }], vals.status) + '</div>' +
    '<div id="donewrap" style="display:' + (vals.status === 'done' ? 'block' : 'none') + '">' + field('이룬 날', 'f-date', 'date', cur && cur.doneAt ? cur.doneAt : t, 'max="' + t + '"') + '</div>' +
    (cur ? delBtn('bucket|' + bid) : '') + ERR;
  openSheet(cur ? '버킷리스트 수정' : '버킷리스트 추가', body, () => {
    const title = val('f-title').trim();
    if (!title) return setErr('내용을 입력해 주세요.');
    syncLink();
    const V = SHEET.vals, e = V.lex ? S.settings.exercises.find(x => x.id === V.lex) : null;
    let link = null;
    if (e) {
      if (e.minutes && V.ltype === 'time' && e.id === 'run') {
        const sc = parseFloat(V.lsec) || 0, sec = Math.round((parseFloat(V.lmin) || 0) * 60 + sc);
        if (sc > 59) return setErr('초는 0~59 사이로 입력해 주세요.');
        if (!(sec > 0)) return setErr('목표 시간을 입력해 주세요.');
        link = { ex: e.id, type: 'time', dist: Number(V.ldist), sec: sec };
      } else {
        const target = parseFloat(V.ltarget);
        if (!(target > 0)) return setErr('운동 연결의 목표 값을 입력해 주세요.');
        link = { ex: e.id, type: e.minutes ? 'dist' : 'day', target: target };
      }
    }
    const rec = cur || { id: 'b' + uid() };
    if (JSON.stringify(link) !== JSON.stringify(cur ? cur.link || null : null)) rec.autoSeen = false;
    rec.title = title; rec.memo = val('f-memo').trim(); rec.when = V.when; rec.link = link;
    rec.done = V.status === 'done';
    rec.doneAt = rec.done ? (val('f-date') || t) : null;
    if (!cur) S.bucket.push(rec);
    done();
  }, { vals: vals, focus: !cur, onPick: grp => {
    if (grp === 'status') showDone(SHEET.vals.status);
    else if (grp === 'lex') { const e = S.settings.exercises.find(x => x.id === SHEET.vals.lex); SHEET.vals.ltype = e && e.minutes ? 'dist' : 'day'; SHEET.vals.ltarget = ''; refreshLink(); }
    else if (grp === 'ltype') refreshLink();
  } });
}

/* ---- 위시리스트 ---- */
function sheetWish(wid) {
  const t = todayStr(), cur = wid ? S.wish.find(x => x.id === wid) : null;
  if (wid && !cur) return;
  const vals = { prio: cur && cur.prio === '높음' ? '높음' : '보통', status: cur && cur.done ? 'done' : 'open' };
  const body = field('갖고 싶은 것', 'f-title', 'text', cur ? cur.name : '', 'maxlength="60" placeholder="예: 러닝화"') +
    field('예상 가격 (원, 선택)', 'f-price', 'number', cur && cur.price ? cur.price : '', 'inputmode="numeric" step="1000" min="0" placeholder="0"') +
    '<div class="fld"><label>우선순위</label>' + chipsHtml('prio', ['높음', '보통'].map(x => ({ v: x, l: x })), vals.prio) + '</div>' +
    field('링크 (선택)', 'f-link', 'url', cur ? cur.link : '', 'maxlength="300" placeholder="https://"') +
    area('메모 (선택)', 'f-memo', cur ? cur.memo : '', 'maxlength="200" rows="3" placeholder="사려는 이유, 색상, 사이즈 등"') +
    '<div class="fld"><label>상태</label>' + chipsHtml('status', [{ v: 'open', l: '갖고 싶어요' }, { v: 'done', l: '구입했어요' }], vals.status) + '</div>' +
    '<div id="donewrap" style="display:' + (vals.status === 'done' ? 'block' : 'none') + '">' + field('구입한 날', 'f-date', 'date', cur && cur.doneAt ? cur.doneAt : t, 'max="' + t + '"') + '</div>' +
    (cur ? delBtn('wish|' + wid) : '') + ERR;
  openSheet(cur ? '위시리스트 수정' : '위시리스트 추가', body, () => {
    const name = val('f-title').trim(), price = Math.round(parseFloat(val('f-price')) || 0), link = val('f-link').trim();
    if (!name) return setErr('이름을 입력해 주세요.');
    if (link && !safeUrl(link)) return setErr('링크는 http:// 또는 https:// 로 시작해야 해요.');
    const rec = cur || { id: 'w' + uid() }, wasDone = !!(cur && cur.done);
    rec.name = name; rec.price = price > 0 ? price : 0; rec.prio = SHEET.vals.prio; rec.link = link; rec.memo = val('f-memo').trim();
    rec.done = SHEET.vals.status === 'done';
    rec.doneAt = rec.done ? (val('f-date') || t) : null;
    if (!cur) S.wish.push(rec);
    done();
    if (rec.done && !wasDone) askWishExpense(rec);
  }, { vals: vals, focus: !cur, onPick: grp => { if (grp === 'status') showDone(SHEET.vals.status); } });
}
/* 구입으로 바꾸면 가계부에 지출로 남길지 물어봐요 */
function askWishExpense(it) {
  const linked = it.expId && S.logs.exp.some(x => x.id === it.expId);
  if (!(it.price > 0) || !S.settings.show.money || linked) return;
  const cats = S.settings.cats, vals = { cat: cats.length ? cats[0].id : '' };
  const body = '<p class="cmsg">‘' + esc(it.name) + '’을(를) 샀어요. 가계부에도 지출로 남길까요?</p>' +
    field('금액 (원)', 'f-amt', 'number', it.price, 'inputmode="numeric" step="1000" min="0"') +
    '<div class="fld"><label>카테고리</label>' + chipsHtml('cat', cats.map(c => ({ v: c.id, l: c.name })), vals.cat) + '</div>' + ERR;
  openSheet('가계부에 기록할까요?', body, () => {
    const amt = Math.round(parseFloat(val('f-amt')));
    if (!(amt > 0)) return setErr('금액을 입력해 주세요.');
    const rec = { id: uid(), d: it.doneAt || todayStr(), cat: SHEET.vals.cat, amt: amt, memo: it.name };
    S.logs.exp.push(rec); it.expId = rec.id;
    done('가계부에 기록했어요');
  }, { vals: vals, save: '기록', cancel: '건너뛰기', focus: false });
}

/* ---- 다른 기기와 연결 (GitHub) ---- */
function sheetSync() {
  const body = '<p class="cmsg">폰·태블릿·컴퓨터를 같은 GitHub 계정과 비밀번호로 연결하면 기록이 자동으로 이어져요. 기록은 비밀번호로 암호화해서 비공개 Gist에 올라가요.</p>' +
    '<p class="fhint"><a class="lnk" href="https://github.com/settings/tokens/new?scopes=gist&description=Growth%20sync" target="_blank" rel="noopener noreferrer">GitHub 토큰 만들기</a> — 열리는 화면에서 gist 권한만 체크된 채로 만들고, 만료 기간은 길게 정하세요.</p>' +
    field('GitHub 토큰', 'f-token', 'password', '', 'autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="ghp_…"') +
    field('동기화 비밀번호', 'f-pass', 'password', '', 'autocomplete="new-password" placeholder="6자 이상"') +
    field('비밀번호 다시 입력', 'f-pass2', 'password', '', 'autocomplete="new-password"') +
    '<p class="fhint">토큰과 비밀번호는 이 기기에만 저장돼요. 다른 기기에서도 같은 비밀번호를 입력해야 하고, 잃어버리면 클라우드 기록은 복구할 수 없어요.</p>' + ERR;
  openSheet('다른 기기와 연결', body, async () => {
    const mine = SHEET;
    if (mine.busy) return;
    const token = val('f-token').trim(), pass = val('f-pass'), pass2 = val('f-pass2');
    if (!token) return setErr('GitHub 토큰을 입력해 주세요.');
    if (pass.length < 6) return setErr('비밀번호는 6자 이상이어야 해요.');
    if (pass !== pass2) return setErr('비밀번호가 서로 달라요.');
    mine.busy = true; setErr('연결하는 중이에요…');
    const r = await connectGist(token, pass);
    if (SHEET !== mine) return;
    mine.busy = false;
    if (r.ok) { closeSheet(); toast('연결했어요'); render(); }
    else setErr(r.code === 'pass' ? '이미 연결된 기록의 비밀번호와 달라요. 다른 기기에서 정한 비밀번호를 입력해 주세요.' : r.msg);
  }, { save: '연결' });
}

/* ================= 기기 간 동기화 =================
   · Claude 안에서 열면: 내 Claude 계정(db)에 자동 저장하고 다른 기기의 변경을 바로 반영해요.
   · 그 밖(GitHub Pages 등)에서 열면: 내 GitHub 비공개 Gist에 비밀번호로 암호화해서 저장해요.
     (토큰과 비밀번호는 이 기기에만 저장돼요. 기록 파일에는 들어가지 않아요.)
   두 곳에서 동시에 고쳤다면 기록은 합치고, 설정은 더 최근 쪽을 따라요. */
const SYNC_KEY = 'selfapp.sync';
const SM0 = () => ({ provider: '', token: '', pass: '', gistId: '', salt: '', lastRemoteAt: 0, syncedLocalAt: 0, lastSyncAt: 0 });
let SM = SM0();
let PROV = null, SUI = { state: 'off', msg: '' }, syncBusy = false, syncAgain = false, syncTimer = null, trigOn = false;
function loadSM() { try { const raw = localStorage.getItem(SYNC_KEY); if (raw) SM = Object.assign(SM0(), JSON.parse(raw)); } catch (e) { /* 새로 시작 */ } }
function saveSM() { try { localStorage.setItem(SYNC_KEY, JSON.stringify(SM)); } catch (e) { /* ignore */ } }
const inClaude = () => typeof window !== 'undefined' && !!window.claude && typeof window.claude.use === 'function';
function serr(code, msg) { const e = new Error(msg); e.code = code; return e; }

/* ---- 암호화 (Web Crypto: PBKDF2 → AES-GCM) ---- */
function b64enc(buf) { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return btoa(s); }
function b64dec(str) { const s = atob(str), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
const KEYS = {};
const cryptoOK = () => typeof crypto !== 'undefined' && !!crypto.subtle && typeof TextEncoder !== 'undefined';
async function getKey(pass, saltB64) {
  const id = saltB64 + '|' + pass;
  if (KEYS[id]) return KEYS[id];
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  KEYS[id] = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64dec(saltB64), iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  return KEYS[id];
}
async function encryptText(text, pass, saltB64) {
  const key = await getKey(pass, saltB64), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(text));
  return { iv: b64enc(iv), data: b64enc(ct) };
}
async function decryptText(env, pass) {
  const key = await getKey(pass, env.salt);
  try { return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64dec(env.iv) }, key, b64dec(env.data))); }
  catch (e) { throw serr('pass', '비밀번호가 달라서 열 수 없어요.'); }
}

/* ---- GitHub Gist ---- */
const GIST_FILE = 'growth-data.json';
async function ghFetch(path, opt) {
  opt = opt || {};
  const headers = { Authorization: 'Bearer ' + SM.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (opt.body) headers['Content-Type'] = 'application/json';
  let r;
  try { r = await fetch('https://api.github.com' + path, { method: opt.method || 'GET', headers: headers, body: opt.body }); }
  catch (e) { throw serr('net', '인터넷에 연결할 수 없어요.'); }
  if (r.status === 401) throw serr('auth', 'GitHub 토큰이 올바르지 않거나 만료됐어요.');
  if (r.status === 404 && opt.allow404) return null;
  if (r.status === 403 || r.status === 429) throw serr('limit', 'GitHub가 요청을 막았어요. 토큰에 gist 권한이 있는지 확인하고, 잠시 뒤 다시 시도해 주세요.');
  if (!r.ok) throw serr('http', 'GitHub 응답에 문제가 있어요 (' + r.status + ').');
  return r.json();
}
async function gistFind() {
  for (let p = 1; p <= 5; p++) {
    const list = await ghFetch('/gists?per_page=100&page=' + p);
    if (!list || !list.length) break;
    const hit = list.find(g => g.files && g.files[GIST_FILE]);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return '';
}
const gistProv = {
  name: 'gist',
  async fetch() {
    if (!SM.gistId) SM.gistId = await gistFind();
    if (!SM.gistId) return null;
    const g = await ghFetch('/gists/' + SM.gistId, { allow404: true });
    if (!g) { SM.gistId = ''; saveSM(); return null; }
    const f = g.files && g.files[GIST_FILE];
    if (!f) return null;
    let text = f.content;
    if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url)).text();
    const env = JSON.parse(text), state = JSON.parse(await decryptText(env, SM.pass));
    SM.salt = env.salt;
    return { updatedAt: env.updatedAt, state: state };
  },
  async push(state) {
    const salt = SM.salt || b64enc(crypto.getRandomValues(new Uint8Array(16)));
    const enc = await encryptText(JSON.stringify(state), SM.pass, salt);
    const files = {}; files[GIST_FILE] = { content: JSON.stringify({ v: 1, alg: 'PBKDF2-SHA256/AES-GCM', salt: salt, iv: enc.iv, data: enc.data, updatedAt: state.updatedAt }) };
    let done = false;
    if (SM.gistId) { const r = await ghFetch('/gists/' + SM.gistId, { method: 'PATCH', body: JSON.stringify({ files: files }), allow404: true }); done = !!r; }
    if (!done) { const g = await ghFetch('/gists', { method: 'POST', body: JSON.stringify({ description: 'Growth 앱 동기화 (암호화됨)', public: false, files: files }) }); SM.gistId = g.id; }
    SM.salt = salt; saveSM();
  }
};

/* ---- Claude 계정 (db) ---- */
function chunkString(text, size) {
  const out = []; let i = 0;
  while (i < text.length) {
    let j = Math.min(text.length, i + size);
    if (j < text.length) { const c = text.charCodeAt(j); if (c >= 0xDC00 && c <= 0xDFFF) j++; }   // 이모지 같은 글자를 반으로 자르지 않아요
    out.push(text.slice(i, j)); i = j;
  }
  return out.length ? out : [''];
}
async function makeDbProvider() {
  const db = await window.claude.use('db'), user = await window.claude.use('user');
  if (!db || !user) return null;
  const id = await user.id();
  if (!id) return null;
  const meta = db.doc('data/users/' + id + '/app'), chunk = i => db.doc('data/users/' + id + '/app-' + i);
  return {
    name: 'db',
    async fetch() {
      const snap = await meta.get();
      if (!snap.exists) return null;
      const m = snap.data();
      if (typeof m.state === 'string') return { updatedAt: m.updatedAt, state: JSON.parse(m.state) };   // 예전 저장 방식
      const parts = await Promise.all(Array.from({ length: m.n }, (_, i) => chunk(i).get()));
      return { updatedAt: m.updatedAt, state: JSON.parse(parts.map(p => p.data().s).join('')) };
    },
    async push(state) {
      const parts = chunkString(JSON.stringify(state), 60000);
      let prevN = 0;
      try { const ps = await meta.get(); if (ps.exists && ps.data().n) prevN = ps.data().n; } catch (e) { /* 처음이에요 */ }
      for (let i = 0; i < parts.length; i++) await chunk(i).set({ s: parts[i] });
      await meta.set({ v: 2, n: parts.length, updatedAt: state.updatedAt });
      for (let i = parts.length; i < prevN; i++) { try { await chunk(i).delete(); } catch (e) { /* ignore */ } }
    },
    subscribe(cb) { return meta.onSnapshot(s => { if (s.exists) cb(s.data().updatedAt); }, () => { /* 연결이 끊기면 다음 동기화 때 다시 시도해요 */ }); }
  };
}

/* ---- 합치기: 기록은 양쪽 모두, 설정은 더 최근 쪽 ---- */
function unionById(into, from) {
  const have = new Set(into.map(x => x.id));
  (from || []).forEach(x => { if (!have.has(x.id)) into.push(JSON.parse(JSON.stringify(x))); });
}
function mergeStates(a, b) {
  const newer = a.updatedAt >= b.updatedAt ? a : b, older = newer === a ? b : a;
  const out = normalize(JSON.parse(JSON.stringify(newer))), O = normalize(JSON.parse(JSON.stringify(older)));
  ['exercises', 'cats', 'faith', 'topics', 'fixed'].forEach(k => unionById(out.settings[k], O.settings[k]));
  out.settings.fixed.forEach(f => { const o = O.settings.fixed.find(x => x.id === f.id); if (o) f.applied = Object.assign({}, o.applied, f.applied); });
  Object.keys(O.settings.monthBudgets).forEach(k => { if (!out.settings.monthBudgets[k]) out.settings.monthBudgets[k] = O.settings.monthBudgets[k]; });
  out.settings.exercises.forEach(e => { const o = O.settings.exercises.find(x => x.id === e.id); if (o) unionById(e.goals, o.goals); });
  Object.keys(O.logs.ex).forEach(id => { out.logs.ex[id] = out.logs.ex[id] || []; unionById(out.logs.ex[id], O.logs.ex[id]); });
  ['exp', 'inc', 'notes'].forEach(k => unionById(out.logs[k], O.logs[k]));
  ['sleep', 'nospend'].forEach(k => Object.keys(O.logs[k]).forEach(d => { if (!(d in out.logs[k])) out.logs[k][d] = O.logs[k][d]; }));
  Object.keys(O.logs.faith).forEach(d => {
    const n = out.logs.faith[d], o = O.logs.faith[d];
    out.logs.faith[d] = n ? Object.assign({}, o, n, { done: Object.assign({}, o.done, n.done) }) : o;
  });
  unionById(out.bucket, O.bucket); unionById(out.wish, O.wish);
  out.theme = a.theme;
  out.updatedAt = Math.max(a.updatedAt, b.updatedAt) + 1;
  return out;
}
const hasLocalData = () => hasAnyData() || S.bucket.length > 0 || S.wish.length > 0 || S.settings.topics.length > 0 || S.settings.fixed.length > 0;

/* ---- 동기화 본체 ---- */
function setSyncUI(state, msg) {
  const changed = SUI.state !== state || SUI.msg !== (msg || '');
  SUI = { state: state, msg: msg || '' };
  if (changed && typeof NAV !== 'undefined' && NAV.route === 'settings' && typeof byId === 'function' && byId('view')) render();
}
function queueSync(delay) {
  if (!PROV) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => syncNow('change'), delay == null ? 1500 : delay);
}
async function pushState() {
  const snap = S.updatedAt;
  await PROV.push(S);
  SM.lastRemoteAt = snap; SM.syncedLocalAt = snap; saveSM();
}
function adoptRemote(remote) {
  const theme = S.theme;
  S = normalize(remote.state); S.theme = theme; S.updatedAt = remote.updatedAt;
  VER++; saveLocal();
  SM.lastRemoteAt = remote.updatedAt; SM.syncedLocalAt = remote.updatedAt; saveSM();
  if (typeof applyTheme === 'function') applyTheme();
}
async function syncCore() {
  const remote = await PROV.fetch();
  const dirty = S.updatedAt !== SM.syncedLocalAt;
  let changedLocal = false;
  if (!remote) {
    if (hasLocalData()) await pushState(); else { SM.syncedLocalAt = S.updatedAt; saveSM(); }
  } else {
    const changed = remote.updatedAt !== SM.lastRemoteAt;
    if (!changed && dirty) await pushState();
    else if (changed && !dirty) { adoptRemote(remote); changedLocal = true; }
    else if (changed && dirty) {
      const merged = mergeStates(S, normalize(remote.state));
      S = merged; VER++; saveLocal(); changedLocal = true;
      await pushState();
    }
  }
  SM.lastSyncAt = Date.now(); saveSM();
  if (changedLocal && typeof render === 'function' && typeof byId === 'function' && byId('view')) render();
}
async function syncNow() {
  if (!PROV) return;
  if (syncBusy) { syncAgain = true; return; }
  syncBusy = true; setSyncUI('syncing');
  try { await syncCore(); setSyncUI('ok'); }
  catch (e) { setSyncUI('err', e && e.message ? e.message : '동기화하지 못했어요.'); }
  finally { syncBusy = false; if (syncAgain) { syncAgain = false; queueSync(300); } }
}
function startSyncTriggers() {
  if (trigOn || !PROV) return;
  trigOn = true;
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') queueSync(400); });
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', () => queueSync(400));
  let live = false;
  if (PROV.subscribe) { try { PROV.subscribe(at => { if (at !== SM.lastRemoteAt) queueSync(200); }); live = true; } catch (e) { live = false; } }
  if (!live) setInterval(() => { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') syncNow(); }, 60000);
}
async function initSync() {
  loadSM();
  if (inClaude()) {
    try { const p = await makeDbProvider(); if (p) { PROV = p; SM.provider = 'db'; } } catch (e) { /* 로그인하지 않았어요 */ }
  } else if (SM.provider === 'gist' && SM.token && SM.pass && cryptoOK()) PROV = gistProv;
  if (!PROV) { setSyncUI('off'); return; }
  startSyncTriggers();
  await syncNow();
}
/* 설정 화면에서 GitHub 연결 */
async function connectGist(token, pass) {
  if (!cryptoOK()) return { ok: false, msg: '이 주소에서는 암호화를 쓸 수 없어요. https 주소(예: GitHub Pages)에서 열어 주세요.' };
  if (syncBusy) return { ok: false, msg: '동기화 중이에요. 잠시 뒤 다시 시도해 주세요.' };
  const prev = Object.assign({}, SM), prevProv = PROV;
  SM = Object.assign(SM0(), { provider: 'gist', token: token.trim(), pass: pass, syncedLocalAt: -1 });
  PROV = gistProv; syncBusy = true;
  try { await syncCore(); saveSM(); syncBusy = false; setSyncUI('ok'); startSyncTriggers(); return { ok: true }; }
  catch (e) { SM = prev; PROV = prevProv; saveSM(); syncBusy = false; return { ok: false, msg: e && e.message ? e.message : '연결하지 못했어요.', code: e && e.code }; }
}
function disconnectSync() { SM = SM0(); PROV = null; saveSM(); setSyncUI('off'); }
function agoText(ts) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  return s < 60 ? '방금' : s < 3600 ? Math.floor(s / 60) + '분 전' : s < 86400 ? Math.floor(s / 3600) + '시간 전' : md(ymd(new Date(ts)));
}
function syncStatusText() {
  if (SUI.state === 'syncing') return '동기화 중…';
  if (SUI.state === 'err') return '동기화 문제: ' + SUI.msg + ' 이 기기에는 저장돼요.';
  const when = SM.lastSyncAt ? ' · 마지막 동기화 ' + agoText(SM.lastSyncAt) : '';
  if (PROV && PROV.name === 'db') return '내 Claude 계정과 자동으로 동기화돼요' + when;
  if (PROV && PROV.name === 'gist') return 'GitHub에 암호화해서 동기화돼요' + when;
  if (inClaude()) return '이 기기에만 저장돼요. Claude에 로그인한 상태로 열면 폰·태블릿·컴퓨터가 자동으로 이어져요.';
  return '이 기기에만 저장돼요.';
}

/* ================= 동작 & 시작 ================= */
const ACT = {
  go(arg, el) {
    const p = arg.split('|');
    if (el && el.hasAttribute && el.hasAttribute('data-tab')) NAV.stack = [];
    else { NAV.stack.push({ route: NAV.route, arg: NAV.arg }); if (NAV.stack.length > 40) NAV.stack.shift(); }
    NAV.route = p[0]; NAV.arg = p[1] || null;
    if (['ex', 'sleep', 'money', 'faith'].indexOf(p[0]) >= 0) NAV.range = 'week';
    if (p[0] === 'review') NAV.roff = 0;
    if (p[0] === 'cal') NAV.cal = { ym: '', sel: '' };
    if (p[0] === 'mstat') NAV.stat = '';
    if (p[0] === 'settings') NAV.bm = '';
    render(true);
  },
  back() {
    const t = NAV.stack.pop() || { route: 'cats', arg: null };
    NAV.route = t.route; NAV.arg = t.arg;
    render(true);
  },
  toggleCat(arg) { NAV.open[arg] = !NAV.open[arg]; render(); },
  toggleAll(arg) { NAV.open['all:' + arg] = !NAV.open['all:' + arg]; render(); },
  range(arg) { NAV.range = arg; render(); },
  gpick(arg) { NAV.arg = arg; render(); },
  week(arg) { NAV.roff = Math.max(0, (NAV.roff || 0) + Number(arg)); render(); },
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
  editEntry(arg) {
    const p = arg.split('|');
    if (p[0] === 'ex') sheetLogEx(p[1], p[2]);
    else if (p[0] === 'exp') sheetMoney(p[1]);
    else if (p[0] === 'inc') sheetIncome(p[1]);
    else if (p[0] === 'note') sheetNote(p[1]);
    else if (p[0] === 'topic') sheetTopic(p[1]);
    else if (p[0] === 'goal') sheetGoal(p[1], p[2]);
  },
  addGoal(arg) { sheetGoal(arg); },
  calMonth(arg) { NAV.cal.ym = monthShift(NAV.cal.ym || monthOf(0), Number(arg)); NAV.cal.sel = ''; render(); },
  calToday() { NAV.cal = { ym: '', sel: '' }; render(); },
  calSel(arg) { NAV.cal.sel = arg; render(); },
  statMonth(arg) { NAV.stat = monthShift(NAV.stat || monthOf(0), Number(arg)); render(); },
  bmode(arg) { NAV.bmode = arg; render(); },
  bmMonth(arg) { NAV.bm = monthShift(NAV.bm || monthOf(0), Number(arg)); render(); },
  stepBudget(arg) {
    const p = arg.split('|'), dir = Number(p[1]) , ym = NAV.bm || monthOf(0), b = ensureBudget(ym);
    if (p[0] === 'total') b.total = clamp(b.total + dir * 50000, 0, 50000000);
    else { const id = p[0].slice(2), c = S.settings.cats.find(x => x.id === id); if (!c) return; b.cats[id] = clamp((b.cats[id] != null ? b.cats[id] : c.monthly) + dir * 10000, 0, 50000000); }
    commit(); render();
  },
  bmReset() { delete S.settings.monthBudgets[NAV.bm || monthOf(0)]; commit(); toast('이 달 설정을 지웠어요'); render(); },
  bmBase() {
    const b = budgetOf(NAV.bm || monthOf(0));
    if (!b) return;
    S.settings.monthly = b.total;
    S.settings.cats.forEach(c => { if (b.cats && b.cats[c.id] != null) c.monthly = b.cats[c.id]; });
    commit(); toast('기본 예산으로 저장했어요'); render();
  },
  addBucket() { sheetBucket(); }, editBucket(arg) { sheetBucket(arg); },
  addWish() { sheetWish(); }, editWish(arg) { sheetWish(arg); },
  tgBucket(arg) {
    const it = S.bucket.find(x => x.id === arg);
    if (!it) return;
    it.done = !it.done; it.doneAt = it.done ? todayStr() : null;
    commit(); toast(it.done ? '이뤘어요' : '다시 진행 중으로 바꿨어요'); render();
  },
  tgWish(arg) {
    const it = S.wish.find(x => x.id === arg);
    if (!it) return;
    it.done = !it.done; it.doneAt = it.done ? todayStr() : null;
    commit(); render();
    if (it.done) askWishExpense(it);
  },
  delRec(arg) {
    const p = arg.split('|');
    if (p[0] === 'ex') S.logs.ex[p[1]] = (S.logs.ex[p[1]] || []).filter(x => x.id !== p[2]);
    else if (p[0] === 'exp') S.logs.exp = S.logs.exp.filter(x => x.id !== p[1]);
    else if (p[0] === 'inc') S.logs.inc = S.logs.inc.filter(x => x.id !== p[1]);
    else if (p[0] === 'note') S.logs.notes = S.logs.notes.filter(x => x.id !== p[1]);
    else if (p[0] === 'topic') S.settings.topics = S.settings.topics.filter(x => x.id !== p[1]);
    else if (p[0] === 'fixed') S.settings.fixed = S.settings.fixed.filter(x => x.id !== p[1]);
    else if (p[0] === 'goal') { const e = S.settings.exercises.find(x => x.id === p[1]); if (e) e.goals = e.goals.filter(x => x.id !== p[2]); }
    else if (p[0] === 'bucket') S.bucket = S.bucket.filter(x => x.id !== p[1]);
    else if (p[0] === 'wish') S.wish = S.wish.filter(x => x.id !== p[1]);
    commit(); closeSheet(); toast('삭제했어요'); render();
  },
  logIncome() { sheetIncome(); },
  addFixed() { sheetFixed(); },
  editFixed(arg) { sheetFixed(arg); },
  addNote() { sheetNote(); },
  delSleep(arg) { delete S.logs.sleep[arg]; commit(); closeSheet(); toast('삭제했어요'); render(); },
  noSpend() { S.logs.nospend[todayStr()] = true; commit(); closeSheet(); toast('오늘은 지출 없음으로 기록했어요'); render(); },
  seed() {
    const run = () => { seedSample(); closeSheet(); toast('예시 데이터를 채웠어요'); render(); };
    if (hasAnyData()) confirmSheet('예시 데이터 채우기', '지금까지의 기록이 예시 데이터로 바뀌어요. 예시용 ‘데이트’ 카테고리와 고정 지출이 추가될 수 있어요.', '바꾸기', run);
    else run();
  },
  async exportData() {
    const text = JSON.stringify(S, null, 2), name = '자기관리-백업-' + todayStr() + '.json';
    try {
      if (inClaude()) { const dl = await window.claude.use('downloads'); if (dl) { await dl.save({ filename: name, data: text }); return; } }
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      toast('백업 파일을 저장했어요');
    } catch (e) { if (!e || e.code !== 'declined') toast('내보내기에 실패했어요'); }
  },
  importData() { const f = byId('importFile'); if (f) f.click(); },
  syncSetup() { sheetSync(); },
  syncNow() { syncNow().then(() => { if (SUI.state === 'ok') toast('동기화했어요'); }); },
  syncOff() { confirmSheet('연결 해제', '이 기기에서만 연결이 해제돼요. 이 기기의 기록과 클라우드에 올라간 기록은 그대로 남아요.', '해제', () => { disconnectSync(); closeSheet(); toast('연결을 해제했어요'); render(); }); },
  resetAll() {
    confirmSheet('모든 데이터 지우기', '기록과 설정이 모두 초기화돼요. 되돌릴 수 없어요.', '지우기', () => {
      const theme = S.theme;
      S = defaultState(); S.theme = theme; commit(); closeSheet(); toast('초기화했어요'); render();
    });
  },
  layoutPref(arg) { LAYOUT_PREF = arg; try { localStorage.setItem(LAYOUT_KEY, arg); } catch (e) { /* ignore */ } render(); },
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
    c.monthly = clamp(c.monthly + Number(p[2]) * Number(p[1]), 0, 50000000);
    commit(); render();
  },
  addEx() { sheetAddEx(); }, addCat() { sheetAddCat(); }, addSub(arg) { sheetAddSub(arg); },
  delSub(arg) { const p = arg.split('|'), c = S.settings.cats.find(x => x.id === p[0]); if (c) { c.subs = c.subs.filter(x => x.id !== p[1]); commit(); render(); } }, addFaith() { sheetAddFaith(); }, addTopic() { sheetTopic(); },
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
    confirmSheet('카테고리 삭제', '‘' + esc(c.name) + '’ 카테고리와 세부 항목을 삭제할까요? 이미 입력한 지출은 ‘기타’로 보여요.', '삭제', () => {
      S.settings.cats = S.settings.cats.filter(x => x.id !== arg);
      commit(); closeSheet(); render();
    });
  },
  delFaith(arg) { S.settings.faith = S.settings.faith.filter(x => x.id !== arg); commit(); render(); },
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
    if (SHEET.onPick) SHEET.onPick(grp);
  }
};
const INP = {
  runPrev(arg, el) { const c = el.id === 'f-val' ? decimal(el.value) : digits(el.value); if (c !== el.value) el.value = c; updateRunPreview(); },
  num(arg, el) { const c = decimal(el.value); if (c !== el.value) el.value = c; }
};
const CHG = {
  runNorm() {
    if (!SHEET) return;
    const ids = SHEET.vals.shown === 'pace' ? ['f-pmin', 'f-psec'] : ['f-min', 'f-sec'], a = byId(ids[0]), b = byId(ids[1]);
    if (!a || !b) return;
    const mi = parseInt(digits(a.value), 10) || 0, se = parseInt(digits(b.value), 10) || 0;
    if (se >= 60) { const tot = mi * 60 + se; a.value = String(Math.floor(tot / 60)); b.value = String(tot % 60); }
    updateRunPreview();
  },
  renEx(arg, v) { const e = S.settings.exercises.find(x => x.id === arg); if (e && v.trim()) e.name = v.trim(); commit(); render(); },
  renCat(arg, v) { const c = S.settings.cats.find(x => x.id === arg); if (c && v.trim()) c.name = v.trim(); commit(); render(); },
  renSub(arg, v) { const p = arg.split('|'), c = S.settings.cats.find(x => x.id === p[0]); const s = c && c.subs.find(x => x.id === p[1]); if (s && v.trim()) s.name = v.trim(); commit(); render(); },
  faithDate(arg, v) { if (v) fillFaith(v); },
  renFaith(arg, v) { const f = S.settings.faith.find(x => x.id === arg); if (f && v.trim()) f.name = v.trim(); commit(); render(); }
};

function applyTheme() {
  const r = document.documentElement;
  if (S.theme === 'dark' || S.theme === 'light') r.setAttribute('data-theme', S.theme); else r.removeAttribute('data-theme');
}
let LAST = null, LAYOUT = 'phone';
/* 화면 배치: phone(한 줄 + 아래 탭) / wide(사이드 메뉴 + 넓은 한 줄) / two(사이드 메뉴 + 2단)
   창의 실제 크기로 정해요. 태블릿에서 자동 판단이 안 맞으면 설정에서 직접 고를 수 있어요(이 기기에만 저장). */
const LAYOUT_KEY = 'selfapp.layout';
let LAYOUT_PREF = 'auto';
function loadLayoutPref() { try { const v = localStorage.getItem(LAYOUT_KEY); if (v === 'phone' || v === 'tablet' || v === 'auto') LAYOUT_PREF = v; } catch (e) { /* 기본값 사용 */ } }
function viewportSize() {
  const r = typeof document !== 'undefined' && document.documentElement ? document.documentElement : {};
  const w = (typeof window !== 'undefined' && window.innerWidth) || r.clientWidth || 0;
  const h = (typeof window !== 'undefined' && window.innerHeight) || r.clientHeight || 0;
  return { w: w, h: h };
}
function layoutMode() {
  const v = viewportSize();
  if (LAYOUT_PREF === 'phone') return 'phone';
  if (LAYOUT_PREF === 'tablet') return v.w >= 960 ? 'two' : 'wide';
  if (v.w < 800 || v.h < 440 || v.w < v.h) return 'phone';   // 세로로 든 화면은 예전처럼 한 줄
  return v.w >= 960 ? 'two' : 'wide';
}
function applyLayout() {
  const m = layoutMode(), r = document.documentElement;
  r.setAttribute('data-layout', m);
  if (m === 'phone') r.removeAttribute('data-side'); else r.setAttribute('data-side', '');
  return m;
}
function isStandalone() {
  return (typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || (typeof navigator !== 'undefined' && navigator.standalone === true);
}
function deviceOrientation() {
  const t = typeof screen !== 'undefined' && screen.orientation && screen.orientation.type;
  return t ? (/landscape/.test(t) ? '가로' : '세로') : '';
}
const LAYOUT_NAME = { phone: '폰 (한 줄)', wide: '태블릿 (넓은 한 줄)', two: '태블릿 (2단)' };
function layout(html) {
  const clean = html.replace(/<!--(cols|col)-->/g, '');
  if (LAYOUT === 'phone') return clean;
  const k = html.indexOf('<!--cols-->');
  if (LAYOUT === 'wide' || k < 0) return '<div class="onecol">' + clean + '</div>';
  const head = html.slice(0, k), parts = html.slice(k + 11).split('<!--col-->');
  return head.replace(/<!--col-->/g, '') + '<div class="twocol"><div class="col">' + parts[0] + '</div><div class="col">' + parts.slice(1).join('') + '</div></div>';
}
function renderSide() {
  const st = S.settings, cur = NAV.route;
  const on = r => r === cur || (r === 'exlist' && cur === 'ex') || (r === 'money' && cur === 'mstat') || (r === 'growth' && cur === 'growthd');
  const item = (r, t, ic) => '<a href="#" class="' + (on(r) ? 'on' : '') + '" data-act="go" data-arg="' + r + '" data-tab="' + r + '"' + (on(r) ? ' aria-current="page"' : '') + '>' + ico(ic, 22, 1.8) + t + '</a>';
  let h = '<div class="sbrand">Growth</div>' + item('today', '오늘', 'today') + item('cal', '캘린더', 'cal') + item('growth', 'Growth', 'trend') + item('review', '리뷰', 'review');
  const rec = [];
  if (st.show.exercise) rec.push(item('exlist', '운동', 'run'));
  if (st.show.sleep) rec.push(item('sleep', '수면', 'sleep'));
  if (st.show.money) rec.push(item('money', '가계부', 'money'));
  if (st.show.faith) rec.push(item('faith', '신앙', 'faith'));
  if (rec.length) h += '<div class="slab">기록</div>' + rec.join('');
  const lst = [];
  if (st.show.bucket) lst.push(item('bucket', '버킷리스트', 'flag'));
  if (st.show.wish) lst.push(item('wish', '위시리스트', 'gift'));
  if (lst.length) h += '<div class="slab">리스트</div>' + lst.join('');
  return h + '<div class="sgrow"></div>' + item('settings', '설정', 'gear');
}
function render(top) {
  LAYOUT = applyLayout();
  const fixedChanged = applyFixed(), got = applyBucketLinks();
  if (fixedChanged || got.length) commit();
  if (got.length) toast('버킷리스트를 이뤘어요: ' + got[0]);
  const v = byId('view');
  let html;
  try { html = layout(VIEWS[NAV.route]()); }
  catch (err) {
    if (typeof console !== 'undefined') console.error(err);
    html = '<section class="card emptyc"><div class="et">화면을 그리다 문제가 생겼어요.</div><div class="btnrow"><button type="button" class="btn" data-act="go" data-arg="today">처음으로</button></div></section>';
  }
  const y = window.scrollY, same = LAST && LAST.route === NAV.route && LAST.arg === NAV.arg;
  v.innerHTML = html;
  const sd = byId('side');
  if (sd) sd.innerHTML = renderSide();
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
  document.addEventListener('input', e => {
    const el = e.target && e.target.closest ? e.target.closest('[data-inp]') : null;
    if (!el) return;
    const fn = INP[el.getAttribute('data-inp')];
    if (fn) fn(el.getAttribute('data-arg') || '', el);
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
          const theme = S.theme;
          S = normalize(o); S.theme = theme; commit(); applyTheme(); closeSheet(); toast('가져왔어요'); render(true);
        });
      } catch (e) { toast('올바른 백업 파일이 아니에요'); }
      imp.value = '';
    };
    rd.readAsText(file);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && SHEET) closeSheet(); });
  loadLayoutPref();
  if (typeof window !== 'undefined' && window.addEventListener) {
    let rt = null;
    const again = () => { clearTimeout(rt); rt = setTimeout(() => { if (layoutMode() !== LAYOUT) render(); }, 150); };
    window.addEventListener('resize', again);
    window.addEventListener('orientationchange', again);
  }
  render(true);
  initSync();
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && /^https?:$/.test(location.protocol) && document.querySelector && document.querySelector('link[rel="manifest"]')) navigator.serviceWorker.register('./sw.js').catch(() => { /* 오프라인 캐시 없이 사용 */ });
}
if (typeof document !== 'undefined' && document.getElementById('view')) init();

