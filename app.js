'use strict';
const APP_VERSION = 58;   // sw.js 의 CACHE 숫자와 같이 올려요
/* ================= 유틸 ================= */
const PAD = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + PAD(d.getMonth() + 1) + '-' + PAD(d.getDate());
const parseD = s => { const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const addDays = (s, n) => { const d = parseD(s); d.setDate(d.getDate() + n); return ymd(d); };
const todayStr = () => ymd(new Date());
/* 하루의 기준은 새벽 3시: 00:00~02:59에는 아직 전날이에요 (오늘 할 일·타임테이블) */
const DAY_CUT_H = 3;
const dayStr = () => ymd(new Date(Date.now() - DAY_CUT_H * 3600000));
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
      monthly: 800000, subOn: true, subV: 1, showBudget: true, catView: 'budget', monthBudgets: {}, cmpCats: [], bible: null,
      wheel: [{ id: 'w1', name: '말씀', on: true }, { id: 'w2', name: '기도', on: true }, { id: 'w3', name: '교제', on: true }, { id: 'w4', name: '증거', on: true }],
      cats: [
        { id: 'c1', name: '식비', monthly: 300000, subs: [] }, { id: 'c2', name: '교통', monthly: 100000, subs: [{ id: 's1', name: '대중교통' }, { id: 's2', name: '택시' }, { id: 's3', name: '킥보드' }] },
        { id: 'c3', name: '카페', monthly: 80000, subs: [] }, { id: 'c4', name: '쇼핑', monthly: 100000, subs: [] },
        { id: 'c5', name: '헌금·기부', monthly: 100000, subs: [] }, { id: 'c6', name: '기타', monthly: 50000, subs: [] }
      ],
      faith: [
        { id: 'f1', name: '말씀 읽기', on: true, track: 'read' }, { id: 'f2', name: '기도', on: true, track: 'pray' },
        { id: 'f3', name: '감사 일기', on: true, track: null }, { id: 'f4', name: '성경 암송', on: true, track: null },
        { id: 'f5', name: '예배 참석', on: false, track: null }, { id: 'f6', name: '성경 통독', on: true, track: 'bible' }
      ],
      topics: [], fixed: []
    },
    logs: { ex: {}, sleep: {}, exp: [], faith: {}, nospend: {}, inc: [], notes: [], bible: {}, wheel: {} },
    bucket: [], wish: [], plans: [], todos: [], reminders: [], sched: [], someday: []
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
  if (!Array.isArray(s.settings.cmpCats)) s.settings.cmpCats = [];
  if (!Array.isArray(s.settings.wheel)) s.settings.wheel = d.settings.wheel;
  if (!s.settings.monthBudgets || typeof s.settings.monthBudgets !== 'object' || Array.isArray(s.settings.monthBudgets)) s.settings.monthBudgets = {};
  s.settings.topics = s.settings.topics.map(t => ({ id: t.id, text: t.text, done: !!t.done, doneAt: t.done && t.doneAt ? t.doneAt : null }));
  if (!s.settings.faith.some(f => f.track === 'bible')) s.settings.faith.push({ id: 'f6', name: '성경 통독', on: true, track: 'bible' });
  if (s.settings.bible && typeof s.settings.bible !== 'object') s.settings.bible = null;
  s.settings.fixed = s.settings.fixed.map(f => Object.assign({}, f, { applied: f.applied || {} }));
  s.settings.cats = s.settings.cats.map(c => ({ id: c.id, name: c.name, monthly: c.monthly != null ? c.monthly : (c.weekly || 0) * 4, subs: Array.isArray(c.subs) ? c.subs : [] }));
  s.logs = Object.assign({}, d.logs, o.logs || {});
  ['ex', 'sleep', 'faith', 'nospend', 'bible', 'wheel'].forEach(k => { if (!s.logs[k] || typeof s.logs[k] !== 'object' || Array.isArray(s.logs[k])) s.logs[k] = {}; });
  ['exp', 'inc', 'notes'].forEach(k => { if (!Array.isArray(s.logs[k])) s.logs[k] = []; });
  if (typeof s.settings.showBudget !== 'boolean') s.settings.showBudget = true;
  if (['budget', 'prev', 'none'].indexOf(s.settings.catView) < 0) s.settings.catView = s.settings.showBudget ? 'budget' : 'none';
  if (typeof s.settings.subOn !== 'boolean') s.settings.subOn = true;
  if (!s.settings.subV) {   // 카테고리 → 세부 선택 흐름: 한 번만 켜고, 교통에 기본 선택지를 넣어 둬요
    s.settings.subOn = true; s.settings.subV = 1;
    const tr = s.settings.cats.find(c => c.name === '교통');
    if (tr && !tr.subs.length) tr.subs = [{ id: 's' + uid(), name: '대중교통' }, { id: 's' + uid(), name: '택시' }, { id: 's' + uid(), name: '킥보드' }];
  }
  ['bucket', 'wish', 'plans', 'todos', 'reminders', 'sched', 'someday'].forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
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
  const o = { ver: VER, ex: {}, corp: {}, inv: {}, spend: {}, spendCat: {}, inc: {}, first: null };
  const upd = d => { if (!o.first || d < o.first) o.first = d; };
  Object.keys(S.logs.ex).forEach(id => {
    const m = {};
    (S.logs.ex[id] || []).forEach(r => { m[r.d] = (m[r.d] || 0) + r.v; upd(r.d); });
    o.ex[id] = m;
  });
  Object.keys(S.logs.sleep).forEach(upd);
  S.logs.exp.forEach(r => {
    if (r.corp || r.inv) { const k = r.inv ? o.inv : o.corp; k[r.d] = (k[r.d] || 0) + r.amt; upd(r.d); return; }   // 회사카드·투자는 내 지출에 넣지 않아요
    o.spend[r.d] = (o.spend[r.d] || 0) + r.amt;
    const c = o.spendCat[r.cat] = o.spendCat[r.cat] || {};
    c[r.d] = (c[r.d] || 0) + r.amt;
    upd(r.d);
  });
  S.logs.inc.forEach(r => { o.inc[r.d] = (o.inc[r.d] || 0) + r.amt; upd(r.d); });
  S.logs.notes.forEach(r => upd(r.d));
  Object.keys(S.logs.faith).forEach(upd);
  Object.keys(S.logs.bible).forEach(upd);
  Object.keys(S.logs.wheel).forEach(upd);
  Object.keys(S.logs.nospend).forEach(upd);
  IX = o;
  return o;
}
const hasAnyData = () => !!ix().first;
const exSum = (id, d) => (ix().ex[id] && ix().ex[id][d]) || 0;
const spendOn = d => ix().spend[d] || 0;
const corpOn = d => (ix().corp[d] || 0) + (ix().inv[d] || 0);
const sleepOn = d => S.logs.sleep[d] || null;
const faithRec = d => S.logs.faith[d] || {};
function faithDone(d, it) {
  if (it.track === 'bible') return (S.logs.bible[d] || 0) > 0;
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
const GOAL_LABEL = { day: '일간', week: '주간', month: '월간', year: '연간' };
const GOAL_MAXD = { week: 7, month: 31, year: 366 };
function goalDays(period) {
  const t = todayStr();
  if (period === 'day') return [t];
  const start = period === 'week' ? weekKey(t) : period === 'year' ? t.slice(0, 4) + '-01-01' : t.slice(0, 7) + '-01', out = [];
  for (let d = start; d <= t; d = addDays(d, 1)) out.push(d);
  return out;
}
function goalProgress(e, g) {
  const vals = goalDays(g.period).map(d => exSum(e.id, d));
  const cur = g.type === 'days' ? vals.filter(v => v > 0 && v >= (g.min || 0)).length : sum(vals);
  return { cur: cur, pct: g.target > 0 ? Math.min(100, cur / g.target * 100) : 0, done: cur >= g.target };
}
function goalTitle(e, g) {
  if (g.type === 'days') return (g.period === 'week' ? '주 ' : g.period === 'month' ? '월 ' : '연 ') + g.target + '일 · 하루 ' + exGoal(g.min, e) + ' 이상';
  return GOAL_LABEL[g.period] + ' 목표 ' + exGoal(g.target, e);
}
const goalCur = (e, g, p) => g.type === 'days' ? p.cur + ' / ' + g.target + '일' : exVal(p.cur, e) + ' / ' + exGoal(g.target, e);
function goalRow(e, g, withName) {
  const p = goalProgress(e, g);
  return '<div class="gcrow c-' + e.cls + '"><div class="gc1"><span class="gct">' + (withName ? esc(e.name) + ' · ' : '') + esc(goalTitle(e, g)) + '</span><span class="gcv' + (p.done ? ' ok' : '') + '">' + (p.done ? '달성 · ' : '') + esc(goalCur(e, g, p)) + '</span></div><div class="track' + (p.done ? ' done' : '') + '"><div style="width:' + p.pct.toFixed(1) + '%"></div></div></div>';
}
function goalsCard(e) {
  if (!e.goals.length) return '';
  const order = { day: 0, week: 1, month: 2, year: 3 };
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

/* 주간·월간·연간 목표: 기간마다 새로 세우고, 숫자 목표는 +/−로 쌓아요 */
const PLAN_LABEL = { week: '주간', month: '월간', year: '연간' };
function planKey(period, off) {
  const t = todayStr(), o = off || 0;
  if (period === 'week') return addDays(t, -parseD(t).getDay() - 7 * o);
  if (period === 'month') return monthShift(t.slice(0, 7), -o);
  return String(+t.slice(0, 4) - o);
}
function planWhen(period, off) {
  const pk = planKey(period, off);
  if (period === 'week') { const e = addDays(pk, 6), f = d => (+d.slice(5, 7)) + '.' + (+d.slice(8)); return (off === 0 ? '이번 주' : off === 1 ? '지난주' : off === -1 ? '다음 주' : '') + ' ' + f(pk) + ' ~ ' + f(e); }
  if (period === 'month') return (off === 0 ? '이번 달 ' : off === 1 ? '지난달 ' : off === -1 ? '다음 달 ' : '') + ymLabel(pk);
  return (off === 0 ? '올해 ' : off === 1 ? '작년 ' : off === -1 ? '내년 ' : '') + pk + '년';
}
const plansFor = (period, pk) => S.plans.filter(x => x.period === period && x.pk === pk);
const planDone = x => x.target > 0 ? x.cur >= x.target : !!x.done;
/* 날짜 입력 (2020 · 2020.03 · 2020.03.15). 월·일은 몰라도 돼요. */
function parseDoneDate(v, needFull) {
  const d = String(v == null ? '' : v).replace(/\D/g, ''), t = todayStr();
  if (!(d.length === 4 || d.length === 6 || d.length === 8) || (needFull && d.length !== 8)) return null;
  const y = +d.slice(0, 4), mo = d.length >= 6 ? +d.slice(4, 6) : 0, dy = d.length === 8 ? +d.slice(6, 8) : 0;
  if (!(y >= 1900 && y <= +t.slice(0, 4)) || (d.length >= 6 && !(mo >= 1 && mo <= 12)) || (d.length === 8 && !(dy >= 1 && dy <= 31))) return null;
  const at = y + '-' + (mo ? PAD(mo) : '01') + '-' + (dy ? PAD(dy) : '01');
  if (d.length === 8 && at > t) return null;
  return { y: y, at: at, text: d.slice(0, 4) + (mo ? '.' + d.slice(4, 6) : '') + (dy ? '.' + d.slice(6, 8) : '') };
}
const planFailed = x => !!x.failed;
function planPct(period) {
  const l = plansFor(period, planKey(period, 0));
  return l.length ? Math.round(100 * sum(l.map(x => x.failed ? 0 : x.target > 0 ? Math.min(1, x.cur / x.target) : (x.done ? 1 : 0))) / l.length) : null;
}

/* 오늘 할 일: 기록과 연결하면 체크할 때 바로 기록 창이 열리고, 기록하면 자동으로 완료돼요 */
function todoLinkDone(l, day) {
  const t = day || dayStr();
  if (!l) return false;
  if (l.k === 'ex') return exSum(l.id, t) > 0;
  if (l.k === 'sleep') return !!sleepOn(t);
  if (l.k === 'money') return spendOn(t) > 0 || corpOn(t) > 0 || !!S.logs.nospend[t];
  if (l.k === 'wheel') return wheelDone(t, l.id);
  if (l.k === 'faith') { const r = faithRec(t); return faithCount(t) > 0 || (r.pray || 0) > 0 || (r.read || 0) > 0; }
  return false;
}
function todoLinkName(l) {
  if (!l) return '';
  if (l.k === 'ex') { const e = S.settings.exercises.find(x => x.id === l.id); return e ? e.name + ' 기록' : ''; }
  if (l.k === 'wheel') { const w = S.settings.wheel.find(x => x.id === l.id); return w ? '수레바퀴의 삶 · ' + w.name : ''; }
  return { sleep: '수면 기록', money: '가계부 입력', faith: '기도·말씀 기록' }[l.k] || '';
}
const TD_COLORS = [['red', '빨강'], ['run', '주황'], ['money', '노랑'], ['push', '초록'], ['bucket', '청록'], ['blue', '파랑'], ['sleep', '남색'], ['wish', '보라'], ['faith', '분홍']];
function tdColor(x) {
  if (x.color && TD_COLORS.some(c => c[0] === x.color)) return x.color;
  const l = x.link, k = l && l.k;
  return k === 'ex' ? (S.settings.exercises.find(e => e.id === l.id) || {}).cls || 'blue' : ({ sleep: 'sleep', money: 'money', faith: 'faith', wheel: 'faith' }[k] || 'blue');
}
const todoByColor = (a, b) => TD_COLORS.findIndex(c => c[0] === tdColor(a)) - TD_COLORS.findIndex(c => c[0] === tdColor(b));
const todoCounted = x => x.target > 1 && !(x.link && todoLinkName(x.link));
const todoCount = (x, d) => (x.cnt && x.cnt[d || dayStr()]) || 0;
function todoDone(x) {
  const t = dayStr();
  if (todoCounted(x)) return todoCount(x, t) >= x.target;
  if (x.link && todoLinkName(x.link)) return todoLinkDone(x.link);
  return x.daily ? !!(x.dn && x.dn[t]) : !!x.done;
}
function todoDoneOn(x, d) {
  if (todoCounted(x)) return todoCount(x, d) >= x.target;
  if (x.link && todoLinkName(x.link)) return todoLinkDone(x.link, d);
  return x.daily ? !!(x.dn && x.dn[d]) : (!!x.done && x.doneAt === d);
}
/* 최근 4일 기록: ✓ 했음 · ✕ 못 함 · – 건너뜀 (만든 날 이전과 한 번만 하는 일은 비워 둬요) */
function todoMark(x, d) {
  if (x.daily && !todoDue(x, d)) return '';
  if (x.sk && x.sk[d]) return 's';
  if (!x.daily && !(x.link && todoLinkName(x.link))) return d === dayStr() ? (todoDoneOn(x, d) ? 'y' : 'n') : '';
  if ((x.d || d) > d) return '';
  return todoDoneOn(x, d) ? 'y' : 'n';
}
const todoDays = () => [0, 1, 2, 3].map(i => addDays(dayStr(), -i));
const todoSkipped = x => !!(x.sk && x.sk[dayStr()]);
const todoDue = (x, d) => !x.every || (dayDiff(d, x.d || d) >= 0 && dayDiff(d, x.d || d) % x.every === 0);
function todoVisible(x) { const t = dayStr(); return x.daily ? todoDue(x, t) : (x.done ? x.doneAt === t : (x.d || t) <= t); }
function syncTodos() {
  const t = dayStr(); let ch = false;
  S.todos.forEach(x => { if (!x.daily && !x.done && x.link && todoLinkDone(x.link)) { x.done = true; x.doneAt = t; ch = true; } });
  const keep = S.todos.filter(x => x.daily || !x.done || !x.doneAt || dayDiff(t, x.doneAt) <= 30);
  if (keep.length !== S.todos.length) { S.todos = keep; ch = true; }
  return ch;
}
const MARK = { y: '✓', n: '✕', s: '–' };
const SKIP_SVG = '<svg class="sk" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="12" fill="none" stroke-width="2"/><path d="M9 14h10" stroke-width="2.4" stroke-linecap="round"/></svg>';
const PART_SVG = f => '<svg class="part" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle class="bg" cx="14" cy="14" r="12" fill="none" stroke-width="2.5"/><circle cx="14" cy="14" r="12" fill="none" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="' + (f * 75.4).toFixed(1) + ' 75.4" transform="rotate(-90 14 14)"/></svg>';
/* ---- 오늘의 타임테이블 ---- */
function schOn(x, day) {
  const wd = new Date(day + 'T00:00:00').getDay();
  if (x.rep === 'daily') return true;
  if (x.rep === 'wk') return wd >= 1 && wd <= 5;
  if (x.rep === 'days') return (x.days || []).indexOf(wd) >= 0;
  return x.d === day;
}
const schLabel = x => x.rep === 'daily' ? '매일' : x.rep === 'wk' ? '평일' : x.rep === 'days' ? (x.days || []).slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(i => WD[i]).join('·') : '';
/* 하루는 새벽 3시에 끝나요: 00:00~02:59는 전날 일정의 마지막 시간으로 봐요 */
const SCH_CUT = DAY_CUT_H * 60;
const schMin = t => { const m = +t.slice(0, 2) * 60 + +t.slice(3, 5); return m < SCH_CUT ? m + 1440 : m; };
const schToday = dayStr;
function schCard() {
  const today = schToday(), sd = NAV.sd || today, t = sd, now = new Date(), nm = schMin(PAD(now.getHours()) + ':' + PAD(now.getMinutes()));
  const list = S.sched.filter(x => schOn(x, t)).sort((a, b) => schMin(a.t) - schMin(b.t));
  const nxt = sd === today ? list.find(x => schMin(x.e || x.t) >= nm) : null;
  const rows = list.map(x => {
    return '<div class="ttrow' + (nxt === x ? ' nx' : '') + '"><span class="ttt">' + x.t + (x.e ? '<i>' + x.e + '</i>' : '') + '</span><span class="ttd"></span>' +
      '<button type="button" class="ttx" data-act="editSch" data-arg="' + x.id + '"><span class="li1">' + esc(x.title) + '</span>' + (schLabel(x) ? '<span class="li2">' + schLabel(x) + '</span>' : '') + '</button></div>';
  }).join('');
  const mon = addDays(today, -((new Date(today + 'T00:00:00').getDay() + 6) % 7));
  const strip = '<div class="schweek" role="group" aria-label="요일 선택">' + Array.from({ length: 7 }, (_, i) => { const d = addDays(mon, i), n = S.sched.filter(x => schOn(x, d)).length; return '<button type="button" class="swd' + (d === sd ? ' on' : '') + (d === today ? ' tdy' : '') + '" data-act="schDay" data-arg="' + d + '" aria-pressed="' + (d === sd) + '"><span>' + WD[new Date(d + 'T00:00:00').getDay()] + '</span><b>' + (+d.slice(8)) + '</b><i' + (n ? '' : ' class="z"') + '></i></button>'; }).join('') + '</div>';
  return '<section class="group sched" aria-label="타임테이블"><div class="gh">타임테이블' + (sd === today ? '' : ' <span class="hint">' + md(sd) + '</span>') + '</div>' + strip + rows + '<button type="button" class="addrow" data-act="addSch">' + ico('plus', 18, 2) + '시간대별 일정 추가</button></section>';
}
function sheetSch(sid) {
  const cur = sid ? S.sched.find(x => x.id === sid) : null;
  if (sid && !cur) return;
  const sd = NAV.sd || schToday(), vals = { rep: cur ? (['daily', 'wk', 'days'].indexOf(cur.rep) >= 0 ? cur.rep : 'once') : 'once', days: cur && cur.rep === 'days' ? (cur.days || []).slice() : [new Date(sd + 'T00:00:00').getDay()] };
  const body = '<div class="two">' + field('시작 (예: 0900, 새벽은 0130)', 'f-t', 'text', cur ? cur.t : '', 'inputmode="numeric" maxlength="5" autocomplete="off" data-inp="timeFmt" placeholder="09:00"') + field('끝 (선택)', 'f-e', 'text', cur ? cur.e || '' : '', 'inputmode="numeric" maxlength="5" autocomplete="off" data-inp="timeFmt" placeholder="10:00"') + '</div>' +
    field('할 일', 'f-title', 'text', cur ? cur.title : '', 'maxlength="40" placeholder="예: 러닝"') +
    '<div class="fld"><label>반복</label>' + chipsHtml('rep', [{ v: 'once', l: cur && cur.d && cur.d !== schToday() ? md(cur.d) + '만' : (!cur && sd !== schToday() ? md(sd) + '만' : '오늘만') }, { v: 'days', l: '요일 선택' }, { v: 'wk', l: '평일' }, { v: 'daily', l: '매일' }], vals.rep) + '</div>' +
    '<div class="fld" id="dayswrap" style="display:' + (vals.rep === 'days' ? 'block' : 'none') + '"><label>요일</label><div class="chipsel" role="group">' + [1, 2, 3, 4, 5, 6, 0].map(i => '<button type="button" class="cs' + (vals.days.indexOf(i) >= 0 ? ' on' : '') + '" data-act="schDays" data-arg="' + i + '" aria-pressed="' + (vals.days.indexOf(i) >= 0) + '">' + WD[i] + '</button>').join('') + '</div></div>' +
    (cur ? delBtn('sch|' + sid) : '') + ERR;
  openSheet(cur ? '일정 수정' : '일정 추가', body, () => {
    const t = parseHM(val('f-t')), e = String(val('f-e')).trim() ? parseHM(val('f-e')) : '', title = val('f-title').trim();
    if (!t) return setErr('시작 시간을 24시간 형식으로 적어 주세요. 예: 0900');
    if (e === null) return setErr('끝 시간 형식이 맞지 않아요. 예: 1000');
    if (e && schMin(e) <= schMin(t)) return setErr('끝 시간은 시작보다 늦어야 해요. (새벽 3시 전은 같은 날 밤으로 봐요)');
    if (!title) return setErr('할 일을 입력해 주세요.');
    const rec = cur || { id: 'sc' + uid(), dn: {} };
    if (SHEET.vals.rep === 'days' && !SHEET.vals.days.length) return setErr('요일을 하나 이상 골라 주세요.');
    rec.t = t; rec.e = e; rec.title = title; rec.rep = SHEET.vals.rep; rec.days = SHEET.vals.rep === 'days' ? SHEET.vals.days.slice() : []; rec.d = cur && cur.d ? cur.d : sd;
    if (!cur) S.sched.push(rec);
    done();
  }, { vals: vals, focus: !cur, onPick: grp => { if (grp === 'rep') { const w = byId('dayswrap'); if (w) w.style.display = SHEET.vals.rep === 'days' ? 'block' : 'none'; } } });
}
function todoRow(x) {
  const cnt = todoCounted(x) ? todoCount(x) : -1;
  const d = todoDone(x), sk = todoSkipped(x), ln = todoLinkName(x.link), lk = x.link && x.link.k;
  const cls = tdColor(x), note = (x.nt && x.nt[dayStr()]) || '';
  return '<div class="todo c-' + cls + (sk ? ' skipped' : '') + '"><button type="button" class="tdck" data-act="' + (sk ? 'todoSkip' : 'todoTg') + '" data-arg="' + x.id + '" aria-pressed="' + d + '" aria-label="' + esc(x.title) + (sk ? ' 건너뜀 취소' : d ? ' 완료' : ln ? ' 기록하러 가기' : cnt >= 0 ? ' 한 번 더 (' + cnt + '/' + x.target + ')' : ' 체크') + '">' + (sk ? SKIP_SVG : d ? DONE_SVG : cnt > 0 ? PART_SVG(cnt / x.target) : TODO_SVG) + '</button>' +
    '<button type="button" class="tdt" data-act="editTodo" data-arg="' + x.id + '"><span class="td1">' + esc(x.title) + '</span>' + (!x.daily && !d && !sk && (x.d || '') < dayStr() ? '<i class="carry" title="이월">↪</i>' : '') + '</button>' + '<input type="text" class="tdn' + (note ? ' has' : '') + '" value="' + esc(note) + '" maxlength="60" autocomplete="off" enterkeyhint="done" data-chg="tdNote" data-arg="' + x.id + '" aria-label="' + esc(x.title) + ' 비고">' + (cnt >= 0 ? '<button type="button" class="tdc" data-act="todoNum" data-arg="' + x.id + '" aria-label="횟수 직접 입력">' + cnt + ' / ' + x.target + '</button>' : '') +
    '<span class="tdm" aria-hidden="true">' + todoDays().map(day => { const m = todoMark(x, day); return '<i class="mk ' + m + '">' + (m === 'n' && todoCounted(x) && todoCount(x, day) > 0 ? todoCount(x, day) : (MARK[m] || '')) + '</i>'; }).join('') + '</span></div>';
}
function todoHead() { return '<div class="todo thead" aria-hidden="true"><span class="tdck"></span><span class="tdt"></span><span class="tdm">' + todoDays().map(d => '<i class="mk">' + WD[parseD(d).getDay()] + '<br>' + (+d.slice(8)) + '</i>').join('') + '</span></div>'; }
function planSummary(period) { const l = plansFor(period, planKey(period, 0)); return { n: l.length, done: l.filter(x => planDone(x) && !x.failed).length, failed: l.filter(planFailed).length }; }

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
function catSpentMonth(cid, ym) { const p = ym || monthOf(0); return sum(S.logs.exp.filter(x => x.cat === cid && !x.corp && !x.inv && x.d.slice(0, 7) === p).map(x => x.amt)); }
function subSpentMonth(cid, sid, ym) { const p = ym || monthOf(0); return sum(S.logs.exp.filter(x => x.cat === cid && (x.sub || '') === sid && !x.corp && !x.inv && x.d.slice(0, 7) === p).map(x => x.amt)); }

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
  const all = S.logs.exp.filter(x => x.d.slice(0, 7) === ym), exp = all.filter(x => !x.corp && !x.inv), corp = all.filter(x => x.corp), invs = all.filter(x => x.inv), inc = S.logs.inc.filter(x => x.d.slice(0, 7) === ym);
  const spent = sum(exp.map(x => x.amt)), income = sum(inc.map(x => x.amt));
  const known = {}; S.settings.cats.forEach(c => { known[c.id] = c; });
  const byCat = {}; exp.forEach(x => { const k = known[x.cat] ? x.cat : '__etc'; byCat[k] = (byCat[k] || 0) + x.amt; });
  const byDay = {}; exp.forEach(x => { byDay[x.d] = (byDay[x.d] || 0) + x.amt; });
  const p = ym.split('-').map(Number), dim = new Date(p[0], p[1], 0).getDate(), t = todayStr();
  const elapsed = ym === t.slice(0, 7) ? +t.slice(8) : (ym < t.slice(0, 7) ? dim : 0);
  return { ym: ym, exp: exp, corp: corp, corpSum: sum(corp.map(x => x.amt)), invs: invs, invSum: sum(invs.map(x => x.amt)), inc: inc, spent: spent, income: income, byCat: byCat, byDay: byDay, dim: dim, elapsed: elapsed, count: exp.length };
}

/* 신앙 */
/* 신앙은 일요일부터 토요일까지를 한 주로 봐요 */
function weekDaysSun(off) { const t = todayStr(), start = addDays(t, -parseD(t).getDay() - 7 * (off || 0)), a = []; for (let i = 0; i < 7; i++) a.push(addDays(start, i)); return a; }
function faithStats(off) {
  const t = todayStr(), days = weekDaysSun(off), items = faithItems(), el = days.filter(d => d <= t);
  const prayed = days.map(d => faithRec(d).pray || 0), read = days.map(d => faithRec(d).read || 0);
  const counts = days.map(d => d <= t ? faithCount(d) : 0);
  const total = items.length * el.length;
  const any = d => faithCount(d) > 0;
  const o = ix();
  let cur = 0, d = any(t) ? t : addDays(t, -1);
  while (any(d)) { cur++; d = addDays(d, -1); }
  let best = 0, run = 0;
  if (o.first) {
    for (let x = o.first; x <= t; x = addDays(x, 1)) { if (any(x)) { run++; best = Math.max(best, run); } else run = 0; }
  }
  const all = Object.keys(S.logs.faith), n = Math.max(1, el.length);
  return {
    days, items, prayed, read, counts, elapsed: el.length,
    rate: total ? sum(counts) / total : null, doneTotal: sum(counts), total,
    avgPray: sum(prayed) / n, avgRead: sum(read) / n, avgCount: sum(counts) / n,
    pbPray: maxOf(all.map(k => faithRec(k).pray || 0)), pbRead: maxOf(all.map(k => faithRec(k).read || 0)),
    pbCount: maxOf(all.map(faithCount)), streak: cur, bestStreak: best
  };
}

/* 수레바퀴의 삶: 오늘 체크리스트와 따로 기록하는 한 주(일~토) 실천표 */
const wheelItems = () => S.settings.wheel.filter(w => w.on);
const wheelDone = (d, id) => !!(S.logs.wheel[d] && S.logs.wheel[d][id]);
function wheelStats(off) {
  const t = todayStr(), days = weekDaysSun(off), items = wheelItems(), el = days.filter(d => d <= t);
  const done = sum(el.map(d => items.filter(w => wheelDone(d, w.id)).length)), total = items.length * el.length;
  return { days: days, items: items, done: done, total: total, rate: total ? done / total : null };
}
function resetFaithData() {
  S.logs.faith = {}; S.logs.bible = {}; S.logs.wheel = {}; S.logs.notes = [];
  S.settings.topics = []; S.settings.bible = null;
  commit();
}
const FAITH_ASK_KEY = 'selfapp.faithResetAsked';
function maybeAskFaithReset() {
  let asked = false;
  try { asked = !!localStorage.getItem(FAITH_ASK_KEY); localStorage.setItem(FAITH_ASK_KEY, '1'); } catch (e) { /* 저장소를 못 쓰면 한 번만 물어봐요 */ }
  const has = Object.keys(S.logs.faith).length || Object.keys(S.logs.bible).length || Object.keys(S.logs.wheel).length || S.logs.notes.length || S.settings.topics.length;
  if (asked || !has) return;
  confirmSheet('신앙 기록을 새로 시작할까요?', '지금 들어 있는 신앙 기록(체크, 메모, 기도 제목, 성경 통독 기록)이 모두 지워지고 처음부터 시작해요. 항목 이름과 설정은 그대로예요. 나중에 설정 → 신앙에서도 할 수 있어요.', '초기화', () => { resetFaithData(); closeSheet(); toast('신앙 기록을 초기화했어요'); render(true); });
}

/* 성경 통독: 하루치를 읽으면 1, 이틀치를 읽으면 2를 기록해서 예상 완독일이 앞당겨져요 */
const BIBLE_END = '2027-05-03';
const dotDate = d => String(d || '').replace(/-/g, '.');
function ensureBible() {
  if (S.settings.bible) return false;
  S.settings.bible = { end: BIBLE_END, remaining0: Math.max(1, dayDiff(BIBLE_END, todayStr()) + 1) };
  return true;
}
function bibleInfo() {
  const b = S.settings.bible;
  if (!b) return null;
  const t = todayStr(), log = S.logs.bible, days = Object.keys(log), got = sum(days.map(d => log[d]));
  const left = Math.max(0, b.remaining0 - got), next = (log[t] || 0) > 0 ? addDays(t, 1) : t;
  const exp = left > 0 ? addDays(next, left - 1) : (days.length ? days.sort().pop() : t);
  return { b: b, got: got, left: left, exp: exp, ahead: dayDiff(b.end, exp), today: log[t] || 0, pct: b.remaining0 > 0 ? Math.min(100, got / b.remaining0 * 100) : 0 };
}
function setBibleEnd(end) {
  const b = S.settings.bible, t = todayStr(), log = S.logs.bible, got = sum(Object.keys(log).map(d => log[d])), next = (log[t] || 0) > 0 ? addDays(t, 1) : t;
  b.end = end; b.remaining0 = Math.max(1, dayDiff(end, next) + 1) + got;
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

/* 내 버킷리스트 (처음 한 번 넣어 드려요). 'title|이룬 날짜' 형식이고, 날짜가 있으면 이룬 항목이에요. */
const BUCKET_SEED = ["자전거 사기|2020.07.06", "가족과 해외여행 가기|", "혼자 여행하기|2024.03.25", "일본에서 벚꽃 보기|", "볼리비아 우유니 소금사막 가기|", "두바이 부르즈 할리파 올라가기|", "뉴질랜드 여행하기|", "호주 여행하기|", "홍콩 여행하기|", "일본 오키나와 여행하기|", "일출 보기|2020.01.01", "일몰 보기|2026.01.21", "혼자 기차 타기|2021.03.11", "혼자 비행기 타기|2025.09.06", "사막 가기|", "코끼리 타기|", "낙타 타기|", "크루즈 여행 가기|", "부모님 여행 보내 드리기|", "퍼스트 클래스 타기|", "비즈니스 클래스 타기|", "헬리콥터 타기|", "해외에서 3개월 살기|", "열기구 타기|", "잠수함 타기|", "에펠탑 가기|2025.09.14", "나이아가라 폭포 가기|", "일본 온천 가기|2025.01.21", "월드컵 직관하기|", "올림픽 직관하기|", "토트넘 경기 직관하기|", "손흥민 선수 사인 받기|", "카누 타기|", "별 보며 야외에서 자기|", "자막 없이 외국 영화 보기|", "아르바이트 하기|2018.10.08", "스쿠버다이빙 하기|", "머리 염색하기|", "24시간 깨어 있기|2018.08.04", "GTA6 해 보기|", "1년 동안 매일 같은 장소에서 사진 찍기|", "운전면허 따기|2019.10.10", "별똥별 보기|2020.09.22", "호주에서 스테이크 먹기|", "루브르 박물관 가기|2025.09.15", "5성급 호텔에서 묵기|2023.11.22", "LA 가기|", "여수 밤바다 가기|", "인도에서 카레 먹기|", "독일에서 소시지 먹기|", "외국인 친구 사귀기|", "침대 기차 타기|", "성경 1독 하기|2022.09.16", "필리핀 선교 여행 가기|", "친구에게 전도하기|2018.05.26", "로마 콜로세움 가기|", "하와이 해변에서 일몰 보기|", "마음에 드는 PC 조립하기|2020.04.04", "무중력 체험하기|", "모태솔로 탈출하기 (첫 연애)|2018.07.06", "수영 배우기|2024.07.02", "강아지 키우기|", "피아노 배우기|", "기타 배우기|2020.03", "100만 원 모으기|2022.05.10", "여드름 완치하기|2019", "키 180cm 이상 되기|", "주식 투자 방법 배우기|2021.05.21", "헌혈하기|2018.08.07", "자동차 운전하기|2019.10", "롤러코스터 타기|2020.08.13", "렌즈 껴 보기|2019.05.29", "천문대 가기|", "현지에서 대화할 수 있을 만큼 일본어 배우기|", "현지에서 대화할 수 있을 만큼 중국어 배우기|", "현지에서 대화할 수 있을 만큼 영어 배우기|", "세계 100개 나라 이름 외우기|", "최신 휴대폰으로 바꾸기|2020.04.13", "영어책을 번역하며 읽기|", "LoL 골드 티어 달성하기|2018.03.14", "영상 편집해서 유튜브에 올리기|", "만년필 갖기|", "게임 상위 1% 되기|", "영어 단어장 한 권 통째로 외우기|", "방언 은사 받기|2020", "연예인과 사진 찍기|", "인천공항에서 출발하기|2025.09.13", "3시간 집중해서 공부하기|2025.04.09", "자동차 갖기|", "독립해서 살기|", "내 집 마련하기|", "여권 페이지 가득 채우기|", "국가대표 축구 경기 직관하기|", "가족사진 찍기|", "하루 동안 죄짓지 않고 지내기|", "여자친구와 해외여행 가기|", "양손잡이 되기|", "통장에 1,000만 원 모으기|", "통장에 1억 원 모으기|", "헬스장 다니기|2021.11.09", "TV에 출연하기|", "애니메이션 원피스 정주행하기|", "해리포터 시리즈 정주행하기|2021.05", "어벤져스 시리즈 정주행하기|", "반지의 제왕 시리즈 정주행하기|", "풀코스 마라톤 완주하기|", "오사카 가기|2023.11.29", "삿포로 가기|2026.02.10", "두바이 여행하기|", "학점 A 이상 받기|2019.12", "일기장 한 권 다 쓰기|", "스마트폰 없이 하루 살기|", "자신 있는 요리 10가지 만들기|", "시베리아 횡단 열차 타기|", "유니버설 스튜디오 가기|", "오로라 보기|", "패러글라이딩 하기|", "해저 호텔 가기|", "주식으로 10만 원 벌기|2021.07", "드라이브인 극장 가기|", "주식으로 100만 원 벌기|2024.01.08", "사격 해 보기|2022.12.27", "여자친구와 화이트 크리스마스 보내기|", "공항 VIP 라운지 이용하기|2025.09.22", "결혼하기|", "한강 다리 혼자 걸어서 건너기|", "혼자 서울 여행하기|2022.12.01", "복싱 배우기|", "디즈니랜드 가기|", "한라산 정상 오르기|", "설악산 정상 오르기|", "폭설 오는 날 눈사람 만들기|", "요트 타기|", "건물주 되기|", "제주도에서 한 달 살기|", "반딧불이 보기|", "은하수 보기|", "낚시하기|", "여행 사진을 포토북으로 만들기|", "10대 앨범 만들기|", "20대 앨범 만들기|", "30대 앨범 만들기|", "성지순례 가기|", "캠핑 가기|", "몸무게 75kg 이상 되기|", "수화 배우기|", "카페에서 책 한 권 다 읽기|", "청혼하기|", "입욕제 써 보기|2022.10.29", "장기 기증 서약하기|", "싱가포르 마리나 베이 샌즈에서 묵기|", "CAD 자격증 따기|", "농구 경기 보러 가기|", "시 쓰기|", "서울에서 한 달 넘게 살기|", "방청객으로 TV 프로그램 녹화 참여하기|", "로켓 발사 직관하기|", "돈 걱정 없이 외식하기|", "스포츠카 운전하기|", "청와대 가기|", "북한 가기|", "북극 가기|", "유럽 배낭여행 하기|", "일본에서 한 달 살기|", "호주에서 한 달 살기|", "뉴욕에서 한 달 살기|", "등불 축제 가기|", "공조냉동기계 자격증 따기|2025.09.12", "여행 브이로그 만들기|", "솔로 캠핑 하기|", "스페인 바르셀로나 자전거 여행하기|", "대학교 졸업하기|", "조용한 바닷가에서 기타 치며 노래하기|", "천일 작정기도 완주하기|", "소방시설 자격증 따기|", "독후감 50편 쓰기|", "한 달 동안 빠짐없이 큐티하기|", "레고 반 고흐 별이 빛나는 밤 사기|", "지브리 파크 가기|", "지샥 시계 사기|", "IWC 시계 사기|", "성경 2독 하기|2023.04.21", "포르쉐 타이칸 운전하기|", "샤넬 넘버5 향수 사기|", "주사율 144Hz 이상 모니터 사기|", "천일 작정헌금 완납하기|", "영어 단어 1,000개 외우기|", "영어 단어 3,000개 외우기|", "지리산 정상 오르기|", "태블릿 파우치 사기|", "킬리안 엔젤스 쉐어 향수 사기|", "아더에러 옷 사기|2023.07.10", "팝업스토어 가 보기|2022.11.29", "양화진 외국인 선교사 묘원 가기|2022.11.28", "클라이밍 해 보기|2023.04.10", "기도원 가서 기도하기|", "카메라 사기|2025.02.19", "자전거로 전국 일주하기 (부산에서 서울까지)|2024.03.25", "소니 A7C II 카메라 사기|2025.02.19", "새 자전거 사기 (500달러 이상)|", "닌텐도 게임기 사기|2023.09.18", "아더에러 가방 사기|", "스투시 옷 사기|2023.04.25", "마음에 드는 신발 10켤레 모으기|2024.02.27", "선글라스 사기|", "오마카세 먹기|", "미슐랭 레스토랑에서 식사하기|2024.11.28", "성경 3독 하기|2025.10.14", "한 달 동안 매일 팔굽혀펴기 100개 이상 하기|", "앵무새 카페 가기|", "고양이 카페 가기|", "강아지 카페 가기|", "퍼스널 컬러 진단받기|", "식물 키우기|", "원데이 클래스 듣기|", "3km를 12분 30초에 달리기|", "휴먼메이드 옷 사기|2024.01.29", "유도 배우기|", "콘서트 가기|", "365일 동안 일기 쓰기|", "우리 셀 모임 분가(두 개로 나누기)시키기|", "아크테릭스 제품 사기|2024.02.10", "차박 해 보기|", "법원 재판 방청하기|", "빵 만들기|", "서핑 배우기|", "풍차의 나라 네덜란드 여행하기|", "모든 대륙에 발 디뎌 보기|", "그랜드 하얏트 후쿠오카에서 묵기|", "뉴욕 센트럴파크 걷기|", "몽골 넓은 초원에서 캠핑하기|", "화산 투어 하기|", "통일전망대 가기|", "아이폰 써 보기|", "젠틀몬스터 제품 사기|", "좋아하는 향수 브랜드 10개 모으기|", "칼하트 제품 사기|", "시계 10개 모으기|", "세계 3대 진미 캐비어 먹기|", "드론 배워서 촬영하기|", "뉴욕 타임스스퀘어 가기|", "심폐소생술(CPR) 자격증 따기|", "스피어(거대 돔 공연장) 가기|", "영화에 출연하기|", "한국 100대 명산 정복하기|", "미스치프 제품 사기|", "1,000피스 이상 레고 사기|", "탕후루 만들기|", "파스타 만들기|", "블루투스 스피커 사기|", "기장 아난티에서 묵기|", "서울 롯데월드타워 전망대 올라가기|", "우리 셀 모임에 10명 이상 모이기|2025.04.02", "부산 BIFC 올라가기|", "바이레도 향수 사기|", "딥티크 향수 사기|", "조 말론 향수 사기|", "톰 포드 향수 사기|", "파타고니아 제품 사기|", "밀양까지 자전거로 다녀오기|", "젤다의 전설 해 보기|2025.09.13", "마리오 오디세이 완전 클리어하기|", "광안리 요트 투어 해 보기|", "스키장에서 스노보드 타기|2025.01.22", "동해선 타고 태화강 가기|", "어린이대공원에서 출발해 금정산 정상 오르기|2024.06.05", "LoL 플래티넘 티어 달성하기|", "해외여행 20번 다녀오기|", "해외여행 30번 다녀오기|", "당근마켓에서 물건 팔기|2026.01.30", "크로스핏 해 보기|", "시력 0.8 이상 되기|", "패션쇼 보러 가기|", "내 감성에 맞는 소설 쓰기|", "스냅 사진 찍어 보기|", "나만의 서명 만들기|2024.03.05", "무신사 오프라인 매장 가기|2024.03.08", "지금 내 방에 있는 책 전부 읽기 (24.03.01 기준)|", "볼링 200점 넘기|", "이집트 피라미드 보기|", "그랜드 캐니언 가기|", "그리스 가기|", "진짜 고래 보기|", "진짜 돌고래 보기|", "오토바이 타는 법 배우기|", "취직하기|", "소개팅 해 보기|2025.06.13", "울릉도 가기|", "독도 가기|", "테니스 배우기|", "동남아에서 2주 살기|", "장산 등산하기|", "신문 한 부 통째로 읽기|", "해외에서 운전하기|", "골프 배우기|", "만화카페에서 하루 종일 보내기|", "동해 레일바이크 타기|", "동해안 따라 자전거 타기|", "슈프림 제품 사기|", "스파이 패밀리 시리즈 정주행하기|", "스투시 옷 5벌 갖기|", "일본 가고시마 최남단 요론섬 가기|", "자전거로 전국 일주하기 (서울에서 부산까지, 남쪽 방향)|", "나 혼자만 레벨업 끝까지 읽기|", "인명구조원 자격증 따기|", "부산국악원 공연 보기|", "부산콘서트홀 공연 보기|", "해남 땅끝마을 가기|", "영어 일기 쓰기|", "배당금 10만 원 이상 받기|", "꿈 일기 쓰기|", "혼자 영화 보러 가기|", "헤드폰 사기|2025.07.19", "이사야 61 예배 참석하기|", "TFT 마스터 티어 달성하기|", "해물파전 만들어 먹기|", "금강 자전거길 달리기|", "영산강 자전거길 달리기|", "섬진강 자전거길 달리기|", "미슐랭 레스토랑 모수에서 식사하기|", "제주 환상 자전거길 달리기|", "국토종주 자전거길 그랜드슬램 완주하기|", "회동수원지에서 캠핑 의자에 앉아 멍 때리기|2026.01.17", "미래의 나에게 이메일 보내기|", "내 인생 연대기 정리하기|", "30일 동안 '하루 한 문장' 일기 쓰기|", "낯선 동네에서 랜덤 버스 타고 하루 보내기|", "실제로 쓸 수 있는 나만의 명언 5개 만들기|", "셀프 인터뷰 영상 찍기|", "이름 없이 익명 편지 남기기|", "한 달 동안 좋아하는 문장만 모으기 (책, 영화, 대화)|", "나만의 필체 3가지 만들기|", "7일 동안 '여름 감성 노트' 쓰기 (온도, 기분, 냄새, 색, 소리)|", "비 오는 날 카페에서 책 읽기|", "필름 카메라로 사진 찍고 현상하기|", "아무것도 안 하고 창밖 30분 멍 때리기|", "포르쉐 마칸 EV 실물로 보기|", "혼자 일본 소도시 여행하기|", "일본에서 자동차 운전하기|", "닌텐도 스위치로 포켓몬 하기|", "스위치로 동물의 숲 하기|", "매미 소리 들으며 낮잠 자기|", "한 종목에서 300% 수익 내기|2025.01.03", "계곡에서 다이빙하며 수영하기|", "재즈 피아노 배우기|", "눈 감고 지도에서 찍은 곳, 1년 안에 가 보기|", "배 위에서 불꽃놀이 보기|", "맞춤 정장 맞추기|", "포르쉐 파나메라 운전하기|", "철인 3종 경기 참가하기|"];
/* 예전에 영어로 넣었던 제목 (아직 고치지 않은 항목만 한국어로 바꿔요) */
const BUCKET_EN = ["Get a bicycle", "Travel abroad with family", "Travel alone", "See cherry blossoms in Japan", "Visit Salar de Uyuni, Bolivia", "Go up the Burj Khalifa, Dubai", "Travel to New Zealand", "Travel to Australia", "Travel to Hong Kong", "Travel to Okinawa, Japan", "Watch a sunrise", "Watch a sunset", "Ride a train alone", "Fly alone", "Go to a desert", "Ride an elephant", "Ride a camel", "Go on a cruise", "Send my parents on a trip", "Fly first class", "Fly business class", "Ride a helicopter", "Live abroad for 3 months", "Ride a hot air balloon", "Ride a submarine", "Visit the Eiffel Tower", "Visit Niagara Falls", "Japanese hot spring", "Watch a World Cup live", "Watch an Olympics live", "Watch a Tottenham match live", "Get Son Heung-min's autograph", "Go canoeing", "Sleep under the stars", "Watch a foreign movie without subtitles", "Part-time job", "Scuba diving", "Dye my hair", "Stay awake 24 hours", "Play GTA6", "Take a photo at the same place every day for a year", "Get a driver's license", "See a shooting star", "Eat steak in Australia", "Visit the Louvre", "Stay at a 5-star hotel", "Go to LA", "Yeosu night sea", "Eat curry in India", "Eat sausage in Germany", "Make a foreign friend", "Ride a sleeper train", "Read the Bible once", "Go on a mission trip to the Philippines", "Evangelize a friend", "Visit the Colosseum in Rome", "Watch a sunset on a Hawaii beach", "Build a PC I'm satisfied with", "Experience zero gravity", "Escape being single (first relationship)", "Learn to swim", "Raise a puppy", "Learn piano", "Learn guitar", "Save 1 million won", "Cure acne completely", "Reach 180cm or taller", "Learn how to invest in stocks", "Donate blood", "Drive a car", "Ride a roller coaster", "Try contact lenses", "Visit an observatory", "Learn Japanese well enough for local conversation", "Learn Chinese well enough for local conversation", "Learn English well enough for local conversation", "Memorize the names of 100 countries", "Switch to the latest phone", "Read an English book by translating it", "Reach Gold tier in LoL", "Edit a video and upload it to YouTube", "Own a fountain pen", "Be in the top 1% of a game", "Memorize an entire English vocab book", "Receive the gift of tongues", "Take a photo with a celebrity", "Fly from Incheon Airport", "Study focused for 3 hours", "Own a car", "Move out on my own", "Buy my own home", "Fill up my passport pages", "Watch a national team match live (soccer)", "Take a family photo", "Go one day without sinning", "Travel abroad with a girlfriend", "Become ambidextrous", "Save 10 million won in my account", "Save 100 million won in my account", "Go to the gym", "Appear on TV", "Finish watching anime One Piece", "Finish the Harry Potter series", "Finish the Avengers series", "Finish the Lord of the Rings series", "Run a full marathon", "Visit Osaka", "Visit Sapporo", "Travel to Dubai", "Get an A or higher GPA", "Finish a whole diary", "Live one day without a smartphone", "Learn 10 dishes I'm confident making", "Ride the Trans-Siberian Railway", "Visit Universal Studios", "See the aurora", "Go paragliding", "Visit an undersea hotel", "Earn 100,000 won from stocks", "Go to a drive-in theater", "Earn 1 million won from stocks", "Try shooting", "White Christmas with a girlfriend", "Visit an airport VIP lounge", "Marriage", "Walk across a Han River bridge alone", "Travel around Seoul alone", "Learn boxing", "Visit Disneyland", "Climb to the top of Hallasan", "Climb to the top of Seoraksan", "Build a snowman on a heavy snow day", "Sail a yacht", "Become a building owner", "Live a month on Jeju Island", "See fireflies", "See the Milky Way", "Go fishing", "Organize travel photos into a photobook", "Make my teen years album", "Make my 20s album", "Make my 30s album", "Go on a pilgrimage", "Go camping", "Reach 75kg or more", "Learn sign language", "Read a whole book at a cafe", "Propose", "Use bath bombs", "Pledge organ donation", "Stay at Marina Bay Sands, Singapore", "Get a CAD certification", "Go see a basketball game", "Write a poem", "Live in Seoul for over a month", "Attend a TV show taping as audience", "Watch a rocket launch live", "Eat out without worrying about money", "Drive a sports car", "Visit the Blue House", "Visit North Korea", "Go to the Arctic", "Backpack through Europe", "Live a month in Japan", "Live a month in Australia", "Live a month in New York", "Go to a lantern festival", "Get Air-Conditioning & Refrigeration Machinery certification", "Make a travel vlog", "Solo camping", "Cycle around Barcelona, Spain", "Graduate from university", "Sing with a guitar in front of a quiet beach", "Complete the 1000-day prayer offering", "Get Fire Protection Facilities certification", "Write 50 book reports", "Do daily devotions (QT) for a full month without missing", "Buy Lego Van Gogh Starry Night", "Visit Ghibli Park", "Buy a G-Shock watch", "Buy an IWC watch", "Read the Bible twice", "Drive a Porsche Taycan", "Buy Chanel No. 5 perfume", "Buy a monitor with 144Hz or higher refresh rate", "Fully pay the 1000-day prayer offering", "Memorize 1,000 English words", "Memorize 3,000 English words", "Climb to the top of Jirisan", "Buy a tablet pouch", "Buy Kilian Angels' Share perfume", "Buy ADER ERROR clothing", "Visit a pop-up store", "Visit Yanghwajin Foreign Missionaries Cemetery", "Try climbing", "Go to a prayer retreat and pray", "Buy a camera", "Cycle the whole country (Busan to Seoul)", "Buy a Sony A7C II camera", "Buy a new bicycle (500$+)", "Buy a Nintendo console", "Buy an ADER ERROR bag", "Buy STUSSY clothing", "Own 10 pairs of shoes I like", "Buy sunglasses", "Eat omakase", "Eat at a Michelin restaurant", "Read the Bible three times", "Do 100+ push-ups daily for a month", "Visit a parrot cafe", "Visit a cat cafe", "Visit a dog cafe", "Get a personal color diagnosis", "Grow a plant", "Take a one-day class", "Run 3km in 12:30", "Buy Human Made clothing", "Learn judo", "Go to a concert", "Write a diary for 365 days", "Multiply our cell group (split into two)", "Buy Arc'teryx products", "Try car camping", "Attend a court trial", "Bake bread", "Learn surfing", "Travel to the Netherlands, land of windmills", "Set foot on every continent", "Stay at Grand Hyatt Fukuoka", "Walk in Central Park, New York", "Camp on a wide ranch in Mongolia", "Go on a volcano tour", "Visit Tongil Observatory", "Try an iPhone", "Buy Gentle Monster products", "Collect 10 favorite perfume brands", "Buy carhartt products", "Collect 10 watches", "Eat caviar, one of the world's three great delicacies", "Learn drone and film with it", "Visit Times Square, New York", "Get a CPR certification", "Visit the Sphere (giant dome venue)", "Appear in a movie", "Conquer Korea's 100 famous mountains", "Buy Mischief products", "Buy a Lego set of 1,000+ pieces", "Make tanghulu", "Make pasta", "Buy a Bluetooth speaker", "Stay at Ananti, Gijang", "Go up Lotte World Tower observatory, Seoul", "Get 10+ people at our cell group meeting", "Go up BIFC", "Buy Byredo perfume", "Buy Diptyque perfume", "Buy Jo Malone perfume", "Buy Tom Ford perfume", "Buy patagonia products", "Cycle to Miryang and back", "Play The Legend of Zelda", "Clear Mario Odyssey completely", "Try a Gwangalli yacht tour", "Snowboard at a ski resort", "Take the Donghae Line to Taehwagang", "Start from Children's Grand Park and climb Geumjeongsan summit", "Reach Platinum tier in LoL", "Travel abroad 20 times", "Travel abroad 30 times", "Sell something on Danggeun Market", "Try CrossFit", "Get eyesight of 0.8 or better", "Go see a fashion show", "Write a novel that fits my sensibility", "Try taking snapshots", "Create my own signature", "Visit a Musinsa offline store", "Read all the books currently in my room (24.03.01)", "Bowl over 200", "See the Egyptian pyramids", "Visit the Grand Canyon", "Visit Greece", "See a real whale", "See a real dolphin", "Learn to ride a motorcycle", "Get a job", "Go on a blind date", "Visit Ulleungdo", "Visit Dokdo", "Learn tennis", "Live in Southeast Asia for 2 weeks", "Hike Jangsan", "Read a whole newspaper", "Drive abroad", "Learn golf", "Spend a whole day at a manga cafe", "Ride the East Sea Rail Bike", "Cycle along the east coast", "Buy Supreme products", "Finish the SPY x FAMILY series", "Own 5 Stussy clothing items", "Visit Yoron Island, southernmost Kagoshima, Japan", "Cycle the whole country southbound (Seoul to Busan)", "Finish reading Solo Leveling", "Get a lifeguard certification", "Watch a performance at Busan National Gugak Center", "Watch a performance at Busan Concert Hall", "Visit Ttangkkeut Village, Haenam", "Write in an English diary", "Receive 100,000+ won in dividends", "Keep a dream journal", "Go to a movie alone", "Buy headphones", "Attend an Isaiah 61 worship", "Reach Master tier in TFT", "Cook haemul pajeon (seafood pancake)", "Cycle the Geum River bike path", "Cycle the Yeongsan River bike path", "Cycle the Seomjin River bike path", "Eat at Michelin restaurant Mosu", "Cycle the Jeju circuit bike path", "Complete the Grand Slam of Korean bike trails", "Zone out in a camping chair at Hoedong Reservoir", "Send an email to my future self", "Organize my life chronicle", "Write a \"one sentence a day\" diary for 30 days", "Spend a day riding a random bus in an unfamiliar neighborhood", "Make 5 quotes I can actually use", "Film a self-interview video", "Leave an anonymous letter without my name", "Collect only sentences I like for a month (books, movies, conversations)", "Create 3 handwriting styles of my own", "Keep a \"summer emotion notebook\" for 7 days (temperature, mood, smell, color, sound)", "Read a book at a cafe on a heavy rainy day", "Take photos and develop a film camera", "Zone out looking out the window for 30 minutes doing nothing", "See a Porsche Macan EV in person", "Travel to a small Japanese town alone", "Drive a car in Japan", "Play Pokémon on Nintendo Switch", "Play Animal Crossing on Switch", "Nap while listening to cicadas", "Get 300% return on one stock", "Dive and swim in a valley stream", "Learn jazz piano", "Visit a place I pick on a map with my eyes closed, within a year", "Watch fireworks from a boat", "Get a tailored suit", "Drive a Porsche Panamera", "Take part in a triathlon"];
function importBucketSeed() {
  const v = S.bucketSeedV || 0;
  if (v >= 3) return false;
  let res = v < 2 ? 'ko' : 'date';
  if (v < 1) {
    const have = new Set(S.bucket.map(x => x.title));
    BUCKET_SEED.forEach((row, i) => {
      const k = row.lastIndexOf('|'), title = row.slice(0, k), dt = row.slice(k + 1);
      if (have.has(title) || have.has(BUCKET_EN[i])) return;
      const p = dt ? dt.split('.') : [], rec = { id: 'bks' + i, title: title, memo: '', when: '언젠가', done: !!dt, doneAt: null, doneYear: null, addedAt: null };
      if (dt) { rec.doneYear = +p[0]; rec.doneDate = dt; rec.doneAt = p[0] + '-' + (p[1] || '01') + '-' + (p[2] || '01'); }
      S.bucket.push(rec);
    });
    res = 'new';
  } else {
    BUCKET_SEED.forEach((row, i) => {
      const it = S.bucket.find(x => x.id === 'bks' + i), k = row.lastIndexOf('|'), dt = row.slice(k + 1);
      if (!it) return;
      if (v < 2 && it.title === BUCKET_EN[i]) it.title = row.slice(0, k);
      if (dt && it.done && !it.doneDate && it.doneYear === +dt.slice(0, 4)) it.doneDate = dt;   // 월·일을 모르는 날짜도 적힌 그대로 보여요
    });
  }
  S.bucketSeedV = 3;
  return res;
}

/* 예시 데이터 */
function seedSample() {
  let a = 20260101;
  const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const ri = (lo, hi) => Math.floor(lo + rnd() * (hi - lo + 1));
  const t = todayStr();
  const logs = { ex: {}, sleep: {}, exp: [], faith: {}, nospend: {}, inc: [], notes: [], bible: {}, wheel: {} };
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
  later: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/>',
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
let NAV = { route: 'today', arg: null, range: 'week', stack: [], open: {}, roff: 0, cal: { ym: '', sel: '' }, stat: '', bm: '', bmode: 'base', lm: '', im: '', fw: 0, gper: 'week', goff: 0, yoff: 0, bf: 'open', bq: '', bsort: 'no' };
const ROUTE_TITLE = { today: '오늘', cats: '기록', growth: 'Growth', growthd: 'Growth', review: '리뷰', cal: '캘린더', goals: 'Someday List', remind: '알림', yearly: '연간 목표', mstat: '통계', exlist: '운동', sleep: '수면', money: '가계부', faith: '신앙', bucket: '버킷리스트', wish: '위시리스트', settings: '설정' };
function backLabel() {
  const top = NAV.stack[NAV.stack.length - 1];
  if (!top) return '기록';
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
function segCtl(withAll) {
  const all = withAll && NAV.exall;
  return '<div class="seg rangeseg" role="group" aria-label="기간 선택">' + ['week', 'month', 'half'].map(k =>
    '<button type="button" data-act="range" data-arg="' + k + '" aria-pressed="' + (!all && NAV.range === k) + '">' + RANGE[k].seg + '</button>').join('') +
    (withAll ? '<button type="button" data-act="exAll" aria-pressed="' + all + '">전체</button>' : '') + '</div>';
}
/* 지금까지의 모든 기록을 날짜 순으로 이은 그래프 (주·월로 묶지 않고 기록 하나하나) */
function allChart(pts, o) {
  if (!pts.length) return '<div class="emptyin">' + (o.empty || '기록이 쌓이면 그래프가 그려져요.') + '</div>';
  const vs = pts.map(p => p.v), lo0 = Math.min.apply(null, vs), hi0 = Math.max.apply(null, vs), pad = Math.max((hi0 - lo0) * 0.25, hi0 * 0.02, 0.1);
  const lo = lo0 - pad, hi = hi0 + pad, left = 44, right = 318, top = 20, bot = 154;
  const t0 = parseD(pts[0].d).getTime(), t1 = parseD(pts[pts.length - 1].d).getTime(), span = t1 - t0;
  const X = p => span > 0 ? left + 8 + (parseD(p.d).getTime() - t0) / span * (right - left - 16) : (left + right) / 2;
  const Y = v => o.better === 'low' ? top + (v - lo) / (hi - lo) * (bot - top) : bot - (v - lo) / (hi - lo) * (bot - top);
  const best = o.better === 'low' ? lo0 : hi0, small = pts.length > 40;
  let g = '<svg class="chart c-' + o.cls + '" viewBox="0 0 326 190" role="img" aria-label="' + esc(o.label) + '">';
  [0, 1, 2].forEach(k => { const v = lo + (hi - lo) * k / 2, y = Y(v); g += '<path class="grid" d="M' + left + ' ' + y.toFixed(1) + ' H' + right + '"/><text class="axis" text-anchor="end" x="38" y="' + (y + 4).toFixed(1) + '">' + o.fmt(v) + '</text>'; });
  if (pts.length > 1) g += '<path class="sline" d="M' + pts.map(p => X(p).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join(' L') + '"/>';
  let bestDone = false;
  pts.forEach(p => {
    const isBest = p.v === best && !bestDone; if (isBest) bestDone = true;
    g += '<circle class="sdot" cx="' + X(p).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="' + (isBest ? 6 : small ? 2.5 : 4) + '"' + (isBest ? ' style="fill:#E0A800"' : '') + '/>';
    if (isBest) g += '<text class="lbl" text-anchor="middle" x="' + Math.min(300, Math.max(50, X(p))).toFixed(1) + '" y="' + (Y(p.v) - 12).toFixed(1) + '">' + o.fmt(p.v) + '</text>';
  });
  const dl = d => d.slice(2, 4) + '.' + d.slice(5, 7) + '.' + d.slice(8);
  g += '<text class="axis" text-anchor="start" x="' + left + '" y="182">' + dl(pts[0].d) + '</text>' + (pts.length > 1 ? '<text class="axis" text-anchor="end" x="' + right + '" y="182">' + dl(pts[pts.length - 1].d) + '</text>' : '');
  return g + '</svg>';
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
  const t = dayStr(), now = new Date(t + 'T00:00:00');
  const sub = (now.getMonth() + 1) + '월 ' + now.getDate() + '일 ' + WD[now.getDay()] + '요일';
  const tds = S.todos.filter(todoVisible), skd = tds.filter(todoSkipped), act = tds.filter(x => !todoSkipped(x)), dn = act.filter(todoDone), open = act.filter(x => !todoDone(x));
  const dayPct = act.length ? Math.round(100 * dn.length / act.length) : null;
  const pcol = (label, v, sub, act2, arg) => '<' + (act2 ? 'button type="button" data-act="' + act2 + '" data-arg="' + arg + '"' : 'div') + ' class="pcol"><span class="pl">' + label + '</span><span class="pp">' + (v == null ? dash : v + '<i>%</i>') + '</span><span class="ptrack"><span style="width:' + (v || 0) + '%"></span></span><span class="ps">' + sub + '</span></' + (act2 ? 'button' : 'div') + '>';
  const pcols = pcol('일간', dayPct, act.length ? dn.length + ' / ' + act.length + ' 완료' : '할 일 없음', '', '') +
    ['week', 'month', 'year'].map(per => { const v = planPct(per), q = planSummary(per); return pcol(PLAN_LABEL[per], v, q.n ? q.done + ' / ' + q.n + ' 달성' : '목표 세우기', per === 'year' ? 'go' : 'goPlan', per === 'year' ? 'yearly' : per); }).join('');
  const top = '<section class="card c-blue" aria-label="계획 달성률"><div class="sh2"><div class="a1b">계획 달성률</div><a href="#" class="lnk" data-act="go" data-arg="goals">목표 관리</a></div><div class="pcols">' + pcols + '</div></section>';
  const todoCard = '<section class="group" aria-label="오늘 할 일"><div class="gh">오늘 할 일</div>' + (open.length ? todoHead() + open.slice().sort(todoByColor).map(todoRow).join('') : '') +
    '<div class="addpair"><button type="button" class="addrow" data-act="addTodo">' + ico('plus', 18, 2) + '할 일</button><button type="button" class="addrow" data-act="addRem">' + ico('bell', 18, 2) + '알림</button></div>' +
    (S.todos.length ? '' : '<button type="button" class="addrow" data-act="todoSeed">추천 할 일 넣기</button>') + '</section>' +
    (dn.length || skd.length ? '<section class="group done" aria-label="완료한 일"><div class="gh">완료</div>' + dn.slice().sort(todoByColor).map(todoRow).join('') + skd.slice().sort(todoByColor).map(todoRow).join('') + '</section>' : '');
  const rems = S.reminders.filter(remActive).sort((a, b) => a.due < b.due ? -1 : 1);
  const remCard = rems.length ? '<section class="group rems" aria-label="알림"><div class="gh row"><span>알림</span><a href="#" class="lnk" data-act="go" data-arg="remind">모두 보기</a></div>' + rems.map(remRow).join('') + '</section>' : '';
  return hdr('오늘', sub) + top + remCard + '<!--cols-->' + todoCard.split('<section class="group done"')[0] + '<!--col-->' + schCard() + (todoCard.indexOf('<section class="group done"') >= 0 ? '<section class="group done"' + todoCard.split('<section class="group done"')[1] : '');
}

/* ---------- 분야 (목록) ---------- */
function hubRow(arg, icon, cls, name, sub) {
  return '<a href="#" class="hrw c-' + cls + '" data-act="go" data-arg="' + arg + '"><span class="hico2">' + ico(icon, 22, 2) + '</span><span class="hlt"><span class="h1">' + name + '</span><span class="h2">' + esc(sub) + '</span></span>' + CHEV + '</a>';
}
/* 기록: 컴퓨터 바탕화면처럼 아이콘을 눌러서 열어요 */
function deskIcon(arg, icon, cls, name, sub) {
  return '<a href="#" class="dicon c-' + cls + '" data-act="go" data-arg="' + arg + '" aria-label="' + esc(name) + ' 열기"><span class="dbox">' + ico(icon, 30, 1.9) + '</span><span class="dn1">' + esc(name) + '</span><span class="dn2">' + esc(sub) + '</span></a>';
}
function viewCats() {
  const st = S.settings, list = [];
  if (st.show.exercise) {
    const ex = st.exercises;
    list.push(deskIcon('exlist', 'run', 'run', '운동', ex.length ? ex[0].name + ' ' + exSummary(ex[0]).replace(/ · .*$/, '').replace('평균 페이스 ', '') : '종목 추가'));
  }
  if (st.show.sleep) { const sl = sleepStats(); list.push(deskIcon('sleep', 'sleep', 'sleep', '수면', sl.avgDur == null ? '기록 없음' : '평균 ' + fmtDur(sl.avgDur))); }
  if (st.show.money) { const m = moneyStats(); list.push(deskIcon('money', 'money', 'money', '가계부', ymNow() + ' ' + won(m.month))); }
  if (st.show.faith) { const w = wheelStats(); list.push(deskIcon('faith', 'faith', 'faith', '신앙', w.rate == null ? '항목 켜기' : '수레바퀴 ' + Math.round(w.rate * 100) + '%')); }
  const a = planSummary('week'), b2 = planSummary('month'), y = planSummary('year'), nr = S.reminders.filter(x => !x.done).length;
  { const so = S.someday.filter(x => !x.done).length; list.push(deskIcon('goals', 'later', 'blue', 'Someday List', '주 ' + a.done + '/' + a.n + ' · 월 ' + b2.done + '/' + b2.n + ' · 연 ' + y.done + '/' + y.n + (so ? ' · 대기 ' + so : ''))); }
  list.push(deskIcon('remind', 'bell', 'red', '알림', nr ? '예정 ' + nr + '개' : '없음'));
  if (st.show.bucket) { const bk = bucketStats(); list.push(deskIcon('bucket', 'flag', 'bucket', '버킷리스트', bk.total ? '이룬 ' + bk.done + ' / ' + bk.total : '비어 있음')); }
  if (st.show.wish) { const w = wishStats(); list.push(deskIcon('wish', 'gift', 'wish', '위시리스트', w.total ? (w.open ? w.open + '개' : '모두 구입') : '비어 있음')); }
  const now = new Date();
  return '<header class="hdr hrow2"><h1>기록</h1><a href="#" class="lnk big" data-act="go" data-arg="settings">설정</a></header>' +
    '<section class="desk" aria-label="기록 바탕화면"><div class="deskbar"><span>기록</span><span>' + (now.getMonth() + 1) + '월 ' + now.getDate() + '일 ' + WD[now.getDay()] + '</span></div><div class="dgrid">' + list.join('') + '</div></section>';
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
    h += '<section class="card gsent"><div class="gs1">기록이 쌓이면 이번 주를 한 줄로 알려드려요.</div>' + seedBtn + '</section>';
  } else {
    h += '<a href="#" class="card gsent" data-act="go" data-arg="growthd|all"><div class="gs1">' + (sent || '점수가 나온 영역이 한 곳이에요.') + '</div><div class="gs2">Growth ' + comp + '점 · ' + (cp == null ? '첫 점수예요' : '지난주보다 ' + delta(comp, cp)) + '</div></a>';
  }
  const ok = abils.filter(a => g[a.k].v != null).sort((a, b) => g[b.k].v - g[a.k].v), wait = abils.filter(a => g[a.k].v == null);
  const row = (a, wait2) => {
    const x = g[a.k];
    return '<a href="#" class="glr c-' + a.cls + (wait2 ? ' wait' : '') + '" data-act="go" data-arg="growthd|' + a.k + '"><span class="gn"><span class="g1">' + a.name + '</span><span class="g2">' + (wait2 ? '기록 ' + Math.min(x.n, MIN_DAYS) + ' / ' + MIN_DAYS + '일' : esc(x.basis.split(' · ')[0])) + '</span></span>' +
      '<span class="gtrack"><span style="width:' + (wait2 ? 0 : x.v) + '%"></span></span><span class="gv">' + (wait2 ? dash : x.v) + '</span>' + CHEV + '</a>';
  };
  h += '<!--col-->';
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
  if (good.length) h += '<section><div class="sh"><h2>분야 간 연결</h2></div><div class="stackc">' + good.map(insightCard).join('') + '</div></section>';
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
  if (st.show.money && (spendOn(d) > 0 || corpOn(d) > 0 || (ix().inc[d] || 0) > 0)) m.push('money');
  if (st.show.faith && (faithCount(d) > 0 || S.logs.notes.some(n => n.d === d))) m.push('faith');
  return m;
}
function calDetail(d) {
  const st = S.settings, rows = [];
  if (st.show.exercise) st.exercises.forEach(e => (S.logs.ex[e.id] || []).filter(r => r.d === d).forEach(x =>
    rows.push(entryRow('ex|' + e.id + '|' + x.id, esc(e.name), x.m > 0 ? fmtMS(x.m) + ' · 페이스 ' + fmtPace(x.m / x.v) + ' /km' : '운동', exVal(x.v, e)))));
  const sl = st.show.sleep ? sleepOn(d) : null;
  if (st.show.sleep && !sl && d <= todayStr()) rows.push('<button type="button" class="addrow" data-act="logSleep" data-arg="' + d + '">' + ico('plus', 18, 2) + '이 날 수면 기록 추가</button>');
  if (sl) rows.push('<button type="button" class="erow" data-act="logSleep" data-arg="' + d + '"><span class="el"><span class="e1">수면</span><span class="e2">' + esc(sl.bed) + ' → ' + esc(sl.wake) + '</span></span><span class="er">' + fmtDur(sl.dur) + (sl.score ? ' · ' + sl.score + '점' : '') + '</span>' + EDIT_IC + '</button>');
  if (st.show.money) {
    S.logs.exp.filter(x => x.d === d).forEach(x => rows.push(expRow(x)));
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
/* 카테고리 월별 비교에 쓰는 작은 막대 */
function miniBars(vals, labels) {
  const mx = Math.max(1, maxOf(vals));
  return '<div class="mini">' + vals.map((v, i) => '<div class="mcol"><div class="mv">' + (v > 0 ? (v >= 100000 ? Math.round(v / 10000) : (v / 10000).toFixed(1)) + '만' : '') + '</div><div class="mbar' + (i === vals.length - 1 ? ' hi' : '') + '" style="height:' + Math.max(3, Math.round(v / mx * 56)) + 'px"></div><div class="ml2">' + labels[i] + '</div></div>').join('') + '</div>';
}
const diffText = (a, b, goodUp) => { if (b == null || (!a && !b)) return ''; const d = a - b; return '<span class="df ' + (d === 0 ? '' : ((d > 0) === goodUp ? 'up' : 'down')) + '">' + (d === 0 ? '변화 없음' : (d > 0 ? '▲ ' : '▼ ') + won(Math.abs(d))) + '</span>'; };
function viewMStat() {
  const cur = monthOf(0);
  if (!NAV.stat || NAV.stat > cur) NAV.stat = cur;
  const ym = NAV.stat, D = monthData(ym), prev = monthData(monthShift(ym, -1)), st = S.settings;
  const rest = D.income - D.spent - D.invSum, budget = budgetTotal(ym), pct = budget > 0 ? D.spent / budget * 100 : 0;
  const months = []; for (let i = 5; i >= 0; i--) months.push(monthShift(ym, -i));
  const md6 = months.map(m => monthData(m)), mlab = months.map(m => (+m.slice(5)) + '월');
  let h = backHdr('가계부 통계', 'money', 'money', '') + monthNav(ymLabel(ym), 'statMonth', ym < cur) + '<!--cols-->';
  // 1) 최종 남는 금액 (수입 − 지출 − 투자)
  h += '<section class="card c-money" aria-label="최종 남는 금액"><div class="ml">' + ymLabel(ym) + ' 최종 남는 금액</div><div class="big ' + (rest >= 0 ? 'inc' : 'neg') + '">' + (D.income > 0 || D.spent > 0 || D.invSum > 0 ? swon(rest) : dash) + '</div>' +
    '<div class="sm">수입 − 지출 − 투자' + (D.income > 0 ? ' · 수입의 ' + Math.round(rest / D.income * 100) + '%' : '') + '</div>' +
    '<div class="calc3"><div class="cl"><span>수입</span><b class="inc">+' + won(D.income) + '</b></div><div class="cl"><span>지출</span><b>−' + won(D.spent) + '</b></div><div class="cl"><span>투자</span><b>−' + won(D.invSum) + '</b></div><div class="cl tot"><span>남는 돈</span><b class="' + (rest >= 0 ? 'inc' : 'neg') + '">' + swon(rest) + '</b></div></div>' +
    '<div class="gl"><span>예산 ' + Math.round(pct) + '% 사용</span><span>' + won(D.spent) + ' / ' + won(budget) + '</span></div><div class="track' + (pct >= 100 ? ' hot' : '') + '"><div style="width:' + Math.min(100, pct).toFixed(1) + '%"></div></div>' +
    (D.corpSum > 0 ? '<div class="sm cap">회사카드 ' + won(D.corpSum) + '은 별도라 계산에 넣지 않았어요</div>' : '') + '</section>';
  // 2) 도넛
  if (D.income > 0 || D.spent > 0 || D.invSum > 0) {
    const base = Math.max(D.income, D.spent + D.invSum);
    const parts = [{ name: '지출', v: D.spent, color: DONUT_COLORS[0] }, { name: '투자', v: D.invSum, color: DONUT_COLORS[1] }, { name: '남는 돈', v: Math.max(0, D.income - D.spent - D.invSum), color: DONUT_COLORS[5] }].filter(x => x.v > 0);
    h += '<section class="card c-money"><div class="sh2"><div class="a1b">수입은 어디로 갔나요</div></div>' + donut(parts, won(base), D.income > 0 ? '총 수입' : '총 사용', '수입 사용 비중') + '</section>';
  }
  const ids0 = Object.keys(D.byCat).sort((a, b) => D.byCat[b] - D.byCat[a]);
  if (ids0.length) {
    const top = ids0.slice(0, 7).map((id, i) => { const c = st.cats.find(x => x.id === id); return { name: c ? c.name : '기타', v: D.byCat[id], color: DONUT_COLORS[i] }; });
    const restV = sum(ids0.slice(7).map(id => D.byCat[id]));
    if (restV > 0) top.push({ name: '그 외', v: restV, color: DONUT_COLORS[7] });
    h += '<section class="card c-money"><div class="sh2"><div class="a1b">지출 카테고리 비중</div></div>' + donut(top, won(D.spent), '총 지출', '카테고리별 지출 비중') + '</section>';
  }
  h += '<!--col-->';
  // 3) 월별 한눈에 표
  h += '<section class="card c-money"><div class="sh2"><div class="a1b">최근 6개월 한눈에</div></div><div class="mtab"><div class="mr th"><span>월</span><span>수입</span><span>지출</span><span>투자</span><span>남는 돈</span></div>' + md6.slice().reverse().map(m => {
    const r = m.income - m.spent - m.invSum, k = v => v > 0 ? (v / 10000).toFixed(v >= 100000 ? 0 : 1) + '만' : dash;
    return '<div class="mr' + (m.ym === ym ? ' cur' : '') + '"><span>' + (+m.ym.slice(5)) + '월</span><span>' + k(m.income) + '</span><span>' + k(m.spent) + '</span><span>' + k(m.invSum) + '</span><span class="' + (r >= 0 ? 'inc' : 'neg') + '">' + (m.income > 0 || m.spent > 0 || m.invSum > 0 ? (r < 0 ? '−' : '') + k(Math.abs(r)) : dash) + '</span></div>';
  }).join('') + '</div></section>';
  // 4) 수입 월별 비교
  const incs = md6.map(m => m.income), avgInc = sum(incs) / Math.max(1, incs.filter(v => v > 0).length);
  const src = {}; [D, prev].forEach((m, k) => m.inc.forEach(x => { const n = x.memo || '수입'; (src[n] = src[n] || [0, 0])[k] += x.amt; }));
  const srcNames = Object.keys(src).sort((a, b) => src[b][0] + src[b][1] - src[a][0] - src[a][1]).slice(0, 6);
  h += '<section class="card c-money"><div class="sh2"><div class="a1b">수입 월별 비교</div></div>' + miniBars(incs, mlab) +
    '<div class="trow2"><span class="tl">이번 달 vs 지난달</span><span class="tv">' + (D.income > 0 || prev.income > 0 ? diffText(D.income, prev.income, true) : dash) + '</span></div>' +
    '<div class="trow2"><span class="tl">6개월 평균 (수입 있는 달)</span><span class="tv">' + (sum(incs) > 0 ? won(Math.round(avgInc)) : dash) + '</span></div>' +
    (srcNames.length ? '<div class="srch"><span>수입 종류</span><span>' + (+ym.slice(5)) + '월</span><span>지난달</span></div>' + srcNames.map(n => '<div class="srow"><span>' + esc(n) + '</span><span>' + (src[n][0] ? won(src[n][0]) : dash) + '</span><span>' + (src[n][1] ? won(src[n][1]) : dash) + '</span></div>').join('') : '<div class="emptyin">수입을 입력하면 월별로 비교해 드려요.</div>') + '</section>';
  // 5) 카테고리 월별 비교
  const cmp = st.cmpCats.filter(id => st.cats.some(c => c.id === id)), shown = cmp.length ? cmp : ids0.filter(id => id !== '__etc').slice(0, 2);
  h += '<section class="card c-money"><div class="sh2"><div class="a1b">카테고리 월별 비교</div></div><p class="fhint cmphint">비교할 카테고리를 눌러 고르세요</p><div class="chipsel">' + st.cats.map(c => '<button type="button" class="cs' + (shown.indexOf(c.id) >= 0 ? ' on' : '') + '" data-act="cmpCat" data-arg="' + c.id + '" aria-pressed="' + (shown.indexOf(c.id) >= 0) + '">' + esc(c.name) + '</button>').join('') + '</div>' +
    (shown.length ? shown.map(id => {
      const c = st.cats.find(x => x.id === id), vals = months.map(m => catSpentMonth(id, m)), a = vals[5], b = vals[4];
      return '<div class="cmpc"><div class="cmph"><b>' + esc(c.name) + '</b><span>' + won(a) + ' ' + diffText(a, b, false) + '</span></div>' + miniBars(vals, mlab) + '</div>';
    }).join('') : '<div class="emptyin">카테고리를 골라 보세요.</div>') + '</section>';
  // 6) 요약
  const days = D.elapsed, fixedSum = sum(D.exp.filter(x => x.fixed).map(x => x.amt)), vs = prev.spent > 0 ? Math.round((D.spent - prev.spent) / prev.spent * 100) : null;
  const rows = [
    ['하루 평균 지출', days > 0 ? won(Math.round(D.spent / days)) : dash],
    ['지난달 대비 지출', vs == null ? dash : (vs > 0 ? '+' : vs < 0 ? '−' : '') + Math.abs(vs) + '%'],
    ['고정 지출', fixedSum > 0 ? won(fixedSum) + ' (' + Math.round(fixedSum / D.spent * 100) + '%)' : dash],
    ['회사카드 (별도)', D.corpSum > 0 ? won(D.corpSum) + ' · ' + D.corp.length + '건' : dash]
  ];
  h += '<section class="card tbl c-money" aria-label="요약">' + rows.map(r => '<div class="trow2"><span class="tl">' + r[0] + '</span><span class="tv">' + r[1] + '</span></div>').join('') + '</section>';
  return h;
}
/* 도넛 그래프: 조각마다 색이 달라서 한눈에 비중이 보여요 */
const DONUT_COLORS = ['#B7791F', '#5E5CE6', '#E0568F', '#0E8F8F', '#F26A21', '#2FA866', '#A855F7', '#2F7FEA'];
function donut(parts, centerTop, centerBot, label) {
  const total = sum(parts.map(x => x.v));
  if (!(total > 0)) return '';
  const R = 70, C = 2 * Math.PI * R, gap = parts.length > 1 ? 2 : 0;
  let off = 0, svg = '<svg class="donut" viewBox="0 0 200 200" role="img" aria-label="' + esc(label) + '"><circle cx="100" cy="100" r="' + R + '" fill="none" stroke="var(--track)" stroke-width="28"/>';
  parts.forEach(x => {
    const len = x.v / total * C;
    svg += '<circle cx="100" cy="100" r="' + R + '" fill="none" stroke="' + x.color + '" stroke-width="28" stroke-dasharray="' + Math.max(0, len - gap).toFixed(2) + ' ' + (C - Math.max(0, len - gap)).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 100 100)"/>';
    off += len;
  });
  svg += '<text class="dt1" x="100" y="96" text-anchor="middle">' + esc(centerTop) + '</text><text class="dt2" x="100" y="118" text-anchor="middle">' + esc(centerBot) + '</text></svg>';
  return '<div class="donutwrap">' + svg + '<div class="dlegend">' + parts.map(x => '<div class="dl"><i style="background:' + x.color + '"></i><span class="dn">' + esc(x.name) + '</span><span class="dv">' + Math.round(x.v / total * 100) + '%</span></div>').join('') + '</div></div>';
}

/* ---------- 운동 상세 ---------- */
function viewEx(id) {
  const e = S.settings.exercises.find(x => x.id === id);
  if (!e) return viewExList();
  if (e.minutes) return viewRun(e);
  if (NAV.exall) {
    const days = Object.keys(ix().ex[e.id] || {}).sort(), o = ix().ex[e.id] || {}, pts = days.map(d => ({ d: d, v: o[d] })).filter(p => p.v > 0);
    const dec = e.decimals || 0, last = pts.length ? pts[pts.length - 1].v : null, best = pts.length ? Math.max.apply(null, pts.map(p => p.v)) : null;
    let h2 = backHdr(esc(e.name), exIcon(e), e.cls, editLink('exercise:' + e.id)) + segCtl(true) + '<!--cols-->';
    h2 += '<section class="card c-' + e.cls + '"><div class="ml">지금까지 기록 · ' + pts.length + '일</div><div class="big">' + (last == null ? dash : exVal(last, e)) + '</div>' +
      '<div class="sm">' + (best == null ? '아직 기록이 없어요' : '하루 최고 ' + exVal(best, e) + ' · 맨 오른쪽이 가장 최근이에요') + '</div><div class="pacebox">' + allChart(pts, { cls: e.cls, fmt: v => fmtN(v, dec), better: 'high', label: '지금까지의 하루 기록' }) + '</div></section>';
    h2 += bigBtn('logEx', e.id, e.cls, '기록 추가');
    return h2 + '<!--col-->' + goalsCard(e);
  }
  const r = NAV.range, info = RANGE[r], s = exStats(e);
  const bs = buckets(r, d => exSum(e.id, d), 'sum');
  const avg = bucketAvg(bs) || 0;
  const dec = e.decimals || 0;
  let h = backHdr(esc(e.name), exIcon(e), e.cls, editLink('exercise:' + e.id)) + segCtl(true) + '<!--cols-->';
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
    ['주간 합계', exVal(s.sum7, e), s.pbWeek ? exVal(s.pbWeek, e) : dash]
  ];
  if (e.unit !== '회') rows.splice(1, 0, ['1회 기록', s.avgEntry == null ? dash : exVal(s.avgEntry, e), s.pbEntry ? exVal(s.pbEntry, e) : dash]);
  if (e.minutes) rows.splice(2, 0, ['페이스', fmtPace(s.pace7) + (s.pace7 ? ' /km' : ''), fmtPace(s.pbPace) + (s.pbPace ? ' /km' : '')]);
  h += statTable('이번 주 평균', '개인 최고', rows, e.cls) + '<!--col-->' + goalsCard(e);
  const list = (S.logs.ex[e.id] || []).slice().sort(byDateDesc).slice(0, 8);
  h += '<section class="group"><div class="gh">최근 기록 <span class="hint">눌러서 수정</span></div>' + (list.length ? list.map(x =>
    entryRow('ex|' + e.id + '|' + x.id, dateLabel(x.d), (x.m > 0 ? fmtMS(x.m) + ' · 페이스 ' + fmtPace(x.m / x.v) + ' /km' : ' '), exVal(x.v, e))).join('') : '<div class="emptyrow">아직 기록이 없어요.</div>') + '</section>';
  h += linkSection('exercise');
  return h;
}

/* ---------- 러닝 (기록 중심) ---------- */
function viewRunAll(e) {
  const rs = runStats(e), m = NAV.rm === 'dist' ? 'dist' : 'pace', recs = (S.logs.ex[e.id] || []).slice().sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : 0);
  const pts = (m === 'pace' ? recs.filter(x => x.m > 0 && x.v > 0).map(x => ({ d: x.d, v: x.m / x.v })) : recs.filter(x => x.v > 0).map(x => ({ d: x.d, v: x.v })));
  const last = pts.length ? pts[pts.length - 1].v : null, best = pts.length ? (m === 'pace' ? Math.min : Math.max).apply(null, pts.map(p => p.v)) : null;
  const fm = v => m === 'pace' ? fmtPace(v) : fmtN(v, 1);
  let h = backHdr(esc(e.name), exIcon(e), e.cls, editLink('exercise:' + e.id)) + segCtl(true) + '<!--cols-->';
  h += '<section class="card c-' + e.cls + '"><div class="ml">지금까지 기록 · ' + pts.length + '회</div><div class="big">' + (last == null ? dash : fm(last) + '<span class="u">' + (m === 'pace' ? '/km' : 'km') + '</span>') + '</div>' +
    '<div class="sm">' + (best == null ? '아직 기록이 없어요' : '가장 좋은 기록 ' + fm(best) + (m === 'pace' ? ' /km' : ' km') + ' · 맨 오른쪽이 가장 최근이에요') + '</div>' +
    '<div class="chipsel" role="group" aria-label="보기">' + [['pace', '페이스'], ['dist', '거리']].map(x => '<button type="button" class="cs' + (m === x[0] ? ' on' : '') + '" data-act="runMetric" data-arg="' + x[0] + '" aria-pressed="' + (m === x[0]) + '">' + x[1] + '</button>').join('') + '</div>' +
    '<div class="pacebox">' + allChart(pts, { cls: e.cls, fmt: fm, better: m === 'pace' ? 'low' : 'high', label: '지금까지의 ' + (m === 'pace' ? '페이스' : '거리') + ' 기록', empty: m === 'pace' ? '시간을 함께 기록하면 페이스 그래프가 그려져요.' : '' }) + '</div>' + (m === 'pace' ? '<div class="sm cap">위쪽이 더 빨라요</div>' : '') + '</section>';
  h += bigBtn('logEx', e.id, e.cls, '기록 추가');
  return h + '<!--col-->' + goalsCard(e);
}
function viewRun(e) {
  if (NAV.exall) return viewRunAll(e);
  const r = NAV.range, rs = runStats(e), items = paceBuckets(e, r);
  const set = [].concat.apply([], bucketDays(r).map(b => b.days));
  const inRange = rs.all.filter(x => set.indexOf(x.d) >= 0);
  const pRange = paceOf(inRange), fast = inRange.length ? Math.min.apply(null, inRange.map(x => x.m / x.v)) : null;
  const label = { week: '7일 평균 페이스', month: '5주 평균 페이스', half: '6개월 평균 페이스' }[r];
  let h = backHdr(esc(e.name), exIcon(e), e.cls, editLink('exercise:' + e.id)) + segCtl(true) + '<!--cols-->';
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
  h += '<!--col-->' + goalsCard(e);
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

/* ---------- 알림 (날짜가 정해진 일: D-10, D-3, 당일, 미루기) ---------- */
const REM_BEFORE = [14, 10, 7, 3, 1];
const remDiff = x => dayDiff(x.due, todayStr());
function remActive(x) {
  const t = todayStr();
  if (x.done) return false;
  if (x.snooze && x.snooze > t) return false;
  if (x.snooze === t) return true;
  const d = remDiff(x);
  return d <= 0 || (x.before || []).indexOf(d) >= 0;
}
const remBadge = x => { const d = remDiff(x); return d > 0 ? 'D-' + d : d === 0 ? 'D-day' : 'D+' + (-d); };
const remCls = x => remDiff(x) <= 0 ? 'late' : remDiff(x) <= 3 ? 'soon' : '';
function remRow(x) {
  return '<div class="todo c-blue rem"><button type="button" class="tdck" data-act="remDone" data-arg="' + x.id + '" aria-label="' + esc(x.title) + ' 완료">' + TODO_SVG + '</button>' +
    '<button type="button" class="tdt" data-act="editEntry" data-arg="rem|' + x.id + '"><span class="td1">' + esc(x.title) + '</span><span class="rb ' + remCls(x) + '">' + remBadge(x) + '</span></button>' +
    '<button type="button" class="tdsnz" data-act="remSnooze" data-arg="' + x.id + '">미루기</button></div>';
}
function viewRemind() {
  const open = S.reminders.filter(x => !x.done).sort((a, b) => a.due < b.due ? -1 : a.due > b.due ? 1 : 0), dn = S.reminders.filter(x => x.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  let h = backHdr('알림', 'bell', 'blue', '') + bigBtn('addRem', '', 'blue', '알림 추가') + '<!--cols-->';
  h += '<section class="group"><div class="gh">다가오는 일정</div>' + (open.length ? open.map(x => entryRow('rem|' + x.id, esc(x.title), md(x.due) + ' (' + WD[parseD(x.due).getDay()] + ') · ' + ((x.before || []).length ? (x.before || []).map(b => 'D-' + b).join(' ') + ' · ' : '') + '당일' + (x.snooze && x.snooze > todayStr() ? ' · ' + md(x.snooze) + '까지 미룸' : ''), '<span class="rb ' + remCls(x) + '">' + remBadge(x) + '</span>')).join('') : '<div class="emptyrow">예정된 알림이 없어요.</div>') + '</section><!--col-->';
  if (dn.length) h += '<section class="group"><div class="gh">완료</div>' + dn.slice(0, 20).map(x => entryRow('rem|' + x.id, esc(x.title), md(x.due), '')).join('') + '</section>';
  return h;
}
function sheetRem(rid) {
  const cur = rid ? S.reminders.find(x => x.id === rid) : null;
  if (rid && !cur) return;
  const vals = { before: cur ? (cur.before || []).slice() : [7, 1] };
  const chips = '<div class="chipsel" role="group">' + REM_BEFORE.map(n => '<button type="button" class="cs' + (vals.before.indexOf(n) >= 0 ? ' on' : '') + '" data-act="togBefore" data-arg="' + n + '" aria-pressed="' + (vals.before.indexOf(n) >= 0) + '">D-' + n + '</button>').join('') + '</div>';
  const body = field('알림 제목', 'f-title', 'text', cur ? cur.title : '', 'maxlength="40" placeholder="예: 미용실 가기"') +
    field('날짜', 'f-due', 'date', cur ? cur.due : todayStr(), '') +
    '<div class="fld"><label>미리 알릴 시점 (당일에는 항상 알려요)</label>' + chips + '</div>' +
    field('그 밖의 시점 — 며칠 전 (쉼표로 여러 개)', 'f-extra', 'text', '', 'inputmode="numeric" placeholder="예: 5, 20"') +
    field('미루기 기본 일수', 'f-snz', 'number', cur && cur.snoozeDays ? cur.snoozeDays : 3, 'inputmode="numeric" step="1" min="1" max="365"') +
    (cur ? delBtn('rem|' + rid) : '') + ERR;
  openSheet(cur ? '알림 수정' : '알림 추가', body, () => {
    const title = val('f-title').trim(), due = val('f-due');
    if (!title) return setErr('알림 제목을 입력해 주세요.');
    if (!due) return setErr('날짜를 입력해 주세요.');
    const extra = String(val('f-extra')).split(/[^0-9]+/).map(Number).filter(n => n >= 1 && n <= 365);
    const before = Array.from(new Set(SHEET.vals.before.concat(extra))).sort((a, b) => b - a);
    const rec = cur || { id: 'rm' + uid(), done: false, doneAt: null, snooze: null };
    if (cur && cur.due !== due) rec.snooze = null;
    rec.title = title; rec.due = due; rec.before = before; rec.snoozeDays = Math.max(1, Math.round(parseFloat(val('f-snz')) || 3));
    if (!cur) S.reminders.push(rec);
    done();
  }, { vals: vals, focus: !cur });
}
function sheetSnooze(rid) {
  const x = S.reminders.find(y => y.id === rid);
  if (!x) return;
  const body = '<p class="cmsg">‘' + esc(x.title) + '’을(를) 며칠 뒤에 다시 알려 드릴까요?</p>' +
    '<div class="chipsel" role="group">' + [1, 2, 3, 7, 14].map(n => '<button type="button" class="cs" data-act="snzPick" data-arg="' + n + '">' + n + '일 뒤</button>').join('') + '</div>' +
    field('직접 입력 (일)', 'f-snz', 'number', x.snoozeDays || 3, 'inputmode="numeric" step="1" min="1" max="365"') + ERR;
  openSheet('알림 미루기', body, () => {
    const n = Math.round(parseFloat(val('f-snz')));
    if (!(n >= 1)) return setErr('1 이상의 숫자를 입력해 주세요.');
    x.snooze = addDays(todayStr(), n); x.snoozeDays = n;
    done(n + '일 뒤에 다시 알려요');
  }, { focus: false });
}

/* ---------- 오늘 할 일 (추가·수정) ---------- */
function todoLinks() {
  const st = S.settings, o = [{ v: '', l: '연결 안 함' }];
  if (st.show.exercise) st.exercises.forEach(e => o.push({ v: 'ex:' + e.id, l: e.name }));
  if (st.show.sleep) o.push({ v: 'sleep', l: '수면' });
  if (st.show.money) o.push({ v: 'money', l: '가계부' });
  if (st.show.faith) st.wheel.forEach(w => o.push({ v: 'wheel:' + w.id, l: '수레바퀴 · ' + w.name }));
  return o;
}
const linkStr = l => !l ? '' : (l.k === 'ex' || l.k === 'wheel') ? l.k + ':' + l.id : l.k;
function sheetTodo(tid) {
  const cur = tid ? S.todos.find(x => x.id === tid) : null;
  if (tid && !cur) return;
  const t0 = dayStr();
  const vals = { lk: cur ? linkStr(cur.link) : '', rep: cur && cur.daily ? (cur.every ? 'every' : 'daily') : 'once', color: cur && cur.color ? cur.color : '' };
  const linkName = v => (todoLinks().find(o => o.v === v) || {}).l || '연결 안 함';
  const sw = [['', '자동']].concat(TD_COLORS).map(c => '<button type="button" class="swt2 c-' + (c[0] || 'blue') + (c[0] === '' ? ' auto' : '') + (vals.color === c[0] ? ' on' : '') + '" data-act="pickVal" data-arg="color|' + c[0] + '" data-grp="color" aria-pressed="' + (vals.color === c[0]) + '" aria-label="' + c[1] + '"></button>').join('');
  const body = field('할 일', 'f-title', 'text', cur ? cur.title : '', 'maxlength="40" placeholder="예: 러닝, 청소, 전화하기"') +
    '<div class="fld"><label>색상</label><div class="swatches" role="group" aria-label="색상">' + sw + '</div></div>' +
    '<div class="fld"><label>반복</label>' + chipsHtml('rep', [{ v: 'once', l: '하루 (못 하면 내일로)' }, { v: 'daily', l: '매일' }, { v: 'every', l: '며칠마다' }], vals.rep) + '</div><div id="evwrap" style="display:' + (vals.rep === 'every' ? 'block' : 'none') + '">' + field('몇 일마다 알릴까요?', 'f-every', 'number', cur && cur.every ? cur.every : 3, 'inputmode="numeric" step="1" min="2" max="365" placeholder="예: 3"') + '</div>' +
    '<div id="cntwrap" style="display:' + (vals.lk ? 'none' : 'block') + '">' + field('하루 목표 횟수 (선택)', 'f-cnt', 'number', cur && cur.target > 1 ? cur.target : '', 'inputmode="numeric" step="1" min="2" max="99" placeholder="예: 5 (체크할 때마다 1회씩)"') + '</div>' +
    field('오늘 비고 (내일이면 비워져요)', 'f-note', 'text', cur && cur.nt && cur.nt[t0] ? cur.nt[t0] : '', 'maxlength="60" placeholder="예: 5km 천천히"') +
    '<div class="fld"><button type="button" class="foldrow" data-act="toggleLink" aria-expanded="false"><span>기록과 연결</span><span class="fsum" id="linksum">' + esc(linkName(vals.lk)) + '</span>' + CHEV + '</button><div id="linkpanel" style="display:none">' + chipsHtml('lk', todoLinks(), vals.lk) + '<p class="fhint">운동·수면·가계부는 체크하면 그 기록 창이 열리고, 수레바퀴 항목은 바로 기록돼요.</p></div></div>' +
    (cur ? '<button type="button" class="btn ghost" data-act="todoSkipSheet" data-arg="' + tid + '">' + (todoSkipped(cur) ? '오늘 건너뛰기 취소' : '오늘 건너뛰기') + '</button>' + delBtn('todo|' + tid) : '') + ERR;
  openSheet(cur ? '할 일 수정' : '할 일 추가', body, () => {
    const lk = SHEET.vals.lk, k = lk.split(':');
    let title = val('f-title').trim();
    if (!title && lk) { const w = k[0] === 'wheel' ? S.settings.wheel.find(x => x.id === k[1]) : null; title = w ? w.name : linkName(lk); }
    if (!title) return setErr('할 일을 입력해 주세요.');
    const rec = cur || { id: 'td' + uid(), d: t0, done: false, doneAt: null, dn: {} };
    rec.target = lk ? 0 : Math.min(99, Math.max(0, Math.round(parseFloat(val('f-cnt')) || 0))); if (rec.target < 2) rec.target = 0;
    rec.title = title; rec.link = lk ? ((k[0] === 'ex' || k[0] === 'wheel') ? { k: k[0], id: k[1] } : { k: k[0] }) : null; rec.daily = SHEET.vals.rep !== 'once';
    if (SHEET.vals.color) rec.color = SHEET.vals.color; else delete rec.color;
    const ev = SHEET.vals.rep === 'every' ? Math.min(365, Math.round(parseFloat(val('f-every')) || 0)) : 0;
    if (SHEET.vals.rep === 'every' && ev < 2) return setErr('2 이상의 숫자를 입력해 주세요.');
    if (ev && (!cur || cur.every !== ev)) rec.d = t0;
    rec.every = ev;
    rec.nt = rec.nt || {}; const nt = val('f-note').trim(); if (nt) rec.nt[t0] = nt; else delete rec.nt[t0];
    if (!cur) S.todos.push(rec);
    done();
  }, { vals: vals, focus: !cur, onPick: grp => {
    if (grp === 'lk') { const w = byId('cntwrap'), m = byId('linksum'); if (w) w.style.display = SHEET.vals.lk ? 'none' : 'block'; if (m) m.textContent = linkName(SHEET.vals.lk); }
    if (grp === 'rep') { const w = byId('evwrap'); if (w) w.style.display = SHEET.vals.rep === 'every' ? 'block' : 'none'; }
  } });
}

/* ---------- 목표 (주간·월간·연간) ---------- */
const FAIL_SVG = '<svg class="fail" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="14" r="13"/><path d="M9.5 9.5l9 9M18.5 9.5l-9 9" fill="none" stroke="#FFFFFF" stroke-width="2.4" stroke-linecap="round"/></svg>';
function planRow(x) {
  const f = planFailed(x), d = planDone(x) && !f, pct = x.target > 0 ? Math.min(100, x.cur / x.target * 100) : 0;
  const meta = [];
  if (x.target > 0) meta.push(fmtN(x.cur, 0) + ' / ' + fmtN(x.target, 0) + (x.unit ? ' ' + esc(x.unit) : ''));
  if (f) meta.push('실패 ' + dotDate(x.failedAt)); else if (d && x.doneAt) meta.push('달성 ' + dotDate(x.doneAt));
  const dots = x.target > 0 && x.target <= 10 && !f ? '<span class="pldots" role="group" aria-label="체크">' + Array.from({ length: Math.round(x.target) }, (_, k) => '<button type="button" class="pld' + (k < x.cur ? ' on' : '') + '" data-act="planDot" data-arg="' + x.id + '|' + (k + 1) + '" aria-pressed="' + (k < x.cur) + '" aria-label="' + (k + 1) + '번째 체크">' + (k < x.cur ? '✓' : '') + '</button>').join('') + '</span>' : '';
  return '<div class="lirow c-blue' + (f ? ' failed' : '') + '"><button type="button" class="lick" data-act="planTg" data-arg="' + x.id + '" aria-pressed="' + d + '" aria-label="' + esc(x.title) + (f ? ' 실패 취소' : d ? ' 다시 진행 중으로' : ' 달성') + '">' + (f ? FAIL_SVG : d ? DONE_SVG : TODO_SVG) + '</button>' +
    '<div class="ltcol"><button type="button" class="litext" data-act="editPlan" data-arg="' + x.id + '"><span class="li1' + (d || f ? ' dn' : '') + '">' + esc(x.title) + '</span>' + (meta.length ? '<span class="li2">' + meta.join(' · ') + '</span>' : '') + (x.target > 0 && !f && !dots ? '<span class="lprog"><span style="width:' + pct.toFixed(0) + '%"></span></span>' : '') + '</button>' + dots + '</div>' +
    (x.target > 0 && !f ? '<span class="plstep"><button type="button" data-act="planStep" data-arg="' + x.id + '|-1" aria-label="하나 줄이기">−</button><button type="button" class="plnum" data-act="planNum" data-arg="' + x.id + '" aria-label="숫자로 직접 입력">' + fmtN(x.cur, 0) + '</button><button type="button" data-act="planStep" data-arg="' + x.id + '|1" aria-label="하나 늘리기">+</button></span>' : '') + '</div>';
}
/* 달성·실패를 체크할 때 날짜를 함께 적어요 (기본은 오늘) */
function sheetPlanDate(x, kind) {
  const fail = kind === 'fail', t = todayStr();
  const body = '<p class="cmsg">‘' + esc(x.title) + '’ ' + (fail ? '실패한 날짜를 적어 주세요.' : '달성한 날짜를 적어 주세요.') + '</p>' +
    field((fail ? '실패' : '달성') + ' 날짜 (연도.월.일)', 'f-ddate', 'text', dotDate(t), 'inputmode="numeric" maxlength="10" autocomplete="off" data-inp="ddate"') + ERR;
  openSheet(fail ? '실패 날짜' : '달성 날짜', body, () => {
    const pr = parseDoneDate(val('f-ddate'), true);
    if (!pr) return setErr('연도.월.일을 모두 적어 주세요. 오늘이나 지난 날짜여야 해요. 예: ' + dotDate(t));
    if (fail) { x.failed = true; x.failedAt = pr.at; x.done = false; }
    else { x.failed = false; x.failedAt = null; if (x.target > 0) x.cur = Math.max(x.cur, x.target); else x.done = true; x.doneAt = pr.at; }
    done(fail ? '실패로 기록했어요' : '달성했어요');
  }, { focus: false });
}
function curPlan() {
  const per = ['month', 'year'].indexOf(NAV.gper) >= 0 ? NAV.gper : 'week';
  return { per: per, off: (per === 'year' ? NAV.yoff : NAV.goff) || 0 };
}
function viewGoals() {
  const cp = curPlan(), sdTab = NAV.gper === 'someday', per = cp.per, off = cp.off, yearly = per === 'year', pk = planKey(per, off), list = plansFor(per, pk), dn = list.filter(planDone).length;
  const curTab = sdTab ? 'someday' : per;
  let h = backHdr('Someday List', 'later', 'blue', '') + '<div class="seg rangeseg" role="group" aria-label="보기">' + [['someday', 'Someday'], ['week', '주간'], ['month', '월간'], ['year', '연간']].map(k => '<button type="button" data-act="planPer" data-arg="' + k[0] + '" aria-pressed="' + (curTab === k[0]) + '">' + k[1] + '</button>').join('') + '</div>';
  if (sdTab) return h + somedayBody();
  h += '<div class="wknav"><button type="button" data-act="planOff" data-arg="1" aria-label="이전 기간"><svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1L2 8l6 7"/></svg></button><span>' + planWhen(per, off) + '</span><button type="button" data-act="planOff" data-arg="-1" aria-label="다음 기간"><svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 1l6 7-6 7"/></svg></button></div><!--cols-->';
  h += '<section class="card c-blue"><div class="ml">' + PLAN_LABEL[per] + ' 목표 달성</div><div class="bigrow"><div class="big">' + dn + '<span class="u">/ ' + list.length + '</span></div><div class="sm nm">' + (list.length ? Math.round(100 * dn / list.length) + '%' : '목표를 세워 보세요') + '</div></div><div class="track"><div style="width:' + (list.length ? 100 * dn / list.length : 0).toFixed(0) + '%"></div></div></section>';
  h += bigBtn('addPlan', '', 'blue', (yearly ? '연간' : PLAN_LABEL[per]) + ' 목표 추가') + '<!--col-->';
  h += '<section class="group">' + (list.length ? list.map(planRow).join('') : '<div class="emptyrow">이 기간의 목표가 없어요.</div>') + '</section>';
  const pool = S.someday.filter(x => !x.done);
  if (pool.length) h += '<section class="group"><div class="gh">Someday에서 가져오기 <span class="hint">눌러서 이 기간 목표로</span></div>' + pool.map(x => '<div class="lirow c-push"><span class="litext" style="padding-left:12px"><span class="li1">' + esc(x.title) + '</span></span><button type="button" class="plfail" data-act="sdPull" data-arg="' + x.id + '">추가</button></div>').join('') + '</section>';
  const prev = plansFor(per, planKey(per, off + 1)).filter(x => !planDone(x));
  if (off <= 0 && prev.length) h += '<button type="button" class="dashbtn" data-act="planCarry">지난 기간에 못 한 목표 ' + prev.length + '개 가져오기</button>';
  return h;
}
/* 숫자를 키보드로 바로 입력하는 작은 창 */
function numSheet(title, label, value, apply) {
  const body = '<div class="fld"><label for="f-num">' + esc(label) + '</label><input id="f-num" class="tin" type="text" inputmode="decimal" autocomplete="off" value="' + esc(value) + '" data-inp="num" placeholder="숫자를 입력"></div>' + ERR;
  openSheet(title, body, () => {
    const v = parseFloat(decimal(val('f-num')));
    if (!(v >= 0)) return setErr('숫자를 입력해 주세요.');
    apply(v); done();
  });
}
function sheetPlan(pid) {
  const cur = pid ? S.plans.find(x => x.id === pid) : null;
  if (pid && !cur) return;
  const cpl = curPlan(), allowed = (cur ? cur.period : cpl.per) === 'year' ? ['year'] : ['week', 'month'];
  const vals = { per: cur ? cur.period : cpl.per };
  const body = (allowed.length > 1 ? '<div class="fld"><label>기간</label>' + chipsHtml('per', allowed.map(k => ({ v: k, l: PLAN_LABEL[k] })), vals.per) + '</div>' : '') +
    field('목표', 'f-title', 'text', cur ? cur.title : '', 'maxlength="60" placeholder="예: 책 1권 읽기"') +
    '<div class="two">' + field('목표 횟수·양 (선택)', 'f-target', 'number', cur && cur.target ? cur.target : '', 'inputmode="decimal" step="any" min="0" placeholder="예: 4"') + field('단위 (선택)', 'f-unit', 'text', cur ? cur.unit : '', 'maxlength="6" placeholder="예: 권, 회"') + '</div>' +
    '<p class="fhint">숫자를 적으면 체크 칸(10 이하)이나 +/− 로 채우고, 비워 두면 체크 한 번이에요.</p>' + (cur && !planDone(cur) || cur && planFailed(cur) ? '<button type="button" class="btn ghost" data-act="planFail" data-arg="' + pid + '">' + (planFailed(cur) ? '실패 되돌리기' : '실패로 표시') + '</button>' : '') + (cur ? delBtn('plan|' + pid) : '') + ERR;
  openSheet(cur ? '목표 수정' : (allowed[0] === 'year' ? '연간 목표 추가' : '목표 추가'), body, () => {
    const title = val('f-title').trim(), target = Math.max(0, parseFloat(val('f-target')) || 0);
    if (!title) return setErr('목표를 입력해 주세요.');
    const rec = cur || { id: 'p' + uid(), pk: planKey(SHEET.vals.per, cpl.per === SHEET.vals.per ? cpl.off : 0), cur: 0, done: false, doneAt: null };
    if (cur && cur.period !== SHEET.vals.per) rec.pk = planKey(SHEET.vals.per, 0);
    rec.period = SHEET.vals.per; rec.title = title; rec.target = target; rec.unit = val('f-unit').trim();
    if (!cur) S.plans.push(rec);
    done();
  }, { vals: vals, focus: !cur });
}

/* ---------- 버킷리스트 · 위시리스트 ---------- */
const whenOf = x => (x.when === '올해' || x.when === '내년') ? x.when : '언젠가';
const safeUrl = u => /^https?:\/\/\S+$/i.test(u || '') ? u : '';
function listRow(kind, it, idx, total) {
  const bucket = kind === 'bucket', act = bucket ? 'Bucket' : 'Wish', title = bucket ? it.title : it.name;
  const fit = !bucket ? wishFit(it) : null;
  const dd = it.doneDate || (it.doneAt ? it.doneAt.replace(/-/g, '.') : '');
  const sub = it.done ? (bucket ? esc(dd) : '구입한 날 ' + (it.doneAt ? md(it.doneAt) : ''))
    : (it.memo ? esc(it.memo) : '') + (bucket && it.addedAt ? (it.memo ? ' · ' : '') + '기록 ' + md(it.addedAt) : '') + (fit ? ' <span class="fit ' + fit + '">' + (fit === 'ok' ? '이번 달 예산 안' : '이번 달 예산 초과') + '</span>' : '');
  const price = !bucket && it.price > 0 ? '<span class="liprice">' + won(it.price) + '</span>' : '';
  const link = !bucket && safeUrl(it.link) ? '<a class="lilink" href="' + esc(it.link) + '" target="_blank" rel="noopener noreferrer" aria-label="' + esc(title) + ' 링크 열기">링크</a>' : '';
  return '<div class="lirow c-' + kind + '">' + (idx ? '<button type="button" class="lino" data-act="bucketNum" data-arg="' + it.id + '|' + idx + '" aria-label="번호 ' + idx + ' 바꾸기">' + idx + '</button>' : '') + '<button type="button" class="lick" data-act="tg' + act + '" data-arg="' + it.id + '" aria-pressed="' + !!it.done + '" aria-label="' + esc(title) + (it.done ? ' 다시 진행 중으로' : (bucket ? ' 이뤘어요' : ' 구입했어요')) + '">' + (it.done ? DONE_SVG : TODO_SVG) + '</button>' +
    '<button type="button" class="litext" data-act="edit' + act + '" data-arg="' + it.id + '"><span class="li1' + (it.done ? ' dn' : '') + '">' + esc(title) + '</span>' + (sub ? '<span class="li2">' + sub + '</span>' : '') + '</button>' + link + price + '</div>';
}
/* 번호는 항목마다 하나뿐인 고유번호예요. 진행 중이든 이룬 것이든 같은 번호표를 써요. */
function ensureBucketNos() {
  const seen = new Set(), need = [];
  S.bucket.forEach(x => { if (x.no > 0 && !seen.has(x.no)) seen.add(x.no); else need.push(x); });
  let n = seen.size ? Math.max.apply(null, Array.from(seen)) : 0;
  need.forEach(x => { x.no = ++n; });
  return need.length > 0;
}
function bucketSetNo(id, n) {
  const it = S.bucket.find(x => x.id === id);
  if (!it) return;
  const other = S.bucket.find(x => x.no === n && x.id !== id);
  if (other) other.no = it.no;      // 이미 쓰는 번호면 서로 바꿔요
  it.no = n;
}
const byNo = (a, b) => a.no - b.no;
function sheetAchieve(it) {
  const t = todayStr();
  const body = '<p class="cmsg">‘' + esc(it.title) + '’ 언제 이뤘나요?</p>' +
    field('달성 날짜 (연도.월.일)', 'f-ddate', 'text', dotDate(t), 'inputmode="numeric" maxlength="10" autocomplete="off" data-inp="ddate" placeholder="예: 2020.07.06 (월·일을 몰라도 돼요)"') + ERR;
  openSheet('이뤘어요', body, () => {
    const pr = parseDoneDate(val('f-ddate'), false);
    if (!pr) return setErr('연도 4자리, 필요하면 월·일까지 입력해 주세요. 예: 2020.07.06');
    it.done = true; it.doneYear = pr.y; it.doneDate = pr.text; it.doneAt = pr.at;
    done('이뤘어요');
  }, { focus: false });
}
function bucketBody() {
  const st = bucketStats(), q = String(NAV.bq || '').trim().toLowerCase();
  if (!st.total) return empty('하고 싶은 일을 하나씩 적어 보세요.<br>올해·내년·언젠가로 나눠 둘 수 있어요.');
  if (q) {
    const list = S.bucket.filter(x => x.title.toLowerCase().indexOf(q) >= 0).sort(byNo);
    return '<section class="group"><div class="gh">검색 결과 <span class="hint">' + list.length + '개</span></div>' + (list.length ? list.map(x => listRow('bucket', x, x.no)).join('') : '<div class="emptyrow">찾는 항목이 없어요.</div>') + '</section>';
  }
  const f = NAV.bf === 'done' ? 'done' : NAV.bf === 'year' ? 'year' : 'open';
  const ty = +todayStr().slice(0, 4), yOpen = S.bucket.filter(x => !x.done && whenOf(x) === '올해'), yDone = S.bucket.filter(x => x.done && x.doneYear === ty), yPct = yOpen.length + yDone.length ? Math.round(100 * yDone.length / (yOpen.length + yDone.length)) : 0;
  let h = '<div class="seg rangeseg" role="group" aria-label="보기">' + [['year', ty + '년 ' + yPct + '%'], ['open', '진행 중 ' + st.open], ['done', '이룬 것 ' + st.done]].map(x => '<button type="button" data-act="bucketFilter" data-arg="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
  if (f === 'year') {
    const yd = yDone.slice().sort(byNo);
    h += '<section class="group"><div class="gh">' + ty + '년에 이루고 싶은 것 <span class="hint">달성 ' + yPct + '% · ' + yDone.length + ' / ' + (yOpen.length + yDone.length) + '</span></div>' + (yOpen.length ? yOpen.slice().sort(byNo).map(x => listRow('bucket', x, x.no)).join('') : '<div class="emptyrow">올해로 정한 버킷리스트가 없어요. ‘언제쯤?’을 올해로 바꿔 보세요.</div>') + '</section>';
    if (yd.length) h += '<section class="group"><div class="gh">올해 이룬 것 <span class="hint">' + yd.length + '개</span></div>' + yd.map(x => listRow('bucket', x, x.no)).join('') + '</section>';
  } else if (f === 'open') {
    ['올해', '내년', '언젠가'].forEach(w => {
      const list = S.bucket.filter(x => !x.done && whenOf(x) === w);
      if (list.length) h += '<section class="group"><div class="gh">' + w + ' <span class="hint">' + list.length + '개 · 번호를 누르면 바꿔요</span></div>' + list.slice().sort(byNo).map(x => listRow('bucket', x, x.no)).join('') + '</section>';
    });
    if (!st.open) h += empty('모두 이뤘어요!');
  } else {
    const so = NAV.bsort || 'no', key = x => x.doneAt || '';
    const dn = S.bucket.filter(x => x.done).sort(so === 'new' ? (a, b) => key(b).localeCompare(key(a)) || a.no - b.no : so === 'old' ? (a, b) => key(a).localeCompare(key(b)) || a.no - b.no : byNo);
    h += '<div class="chipsel sortchips" role="group" aria-label="정렬">' + [['no', '번호순'], ['new', '최근 날짜순'], ['old', '오래된 날짜순']].map(x => '<button type="button" class="cs' + (so === x[0] ? ' on' : '') + '" data-act="bucketSort" data-arg="' + x[0] + '" aria-pressed="' + (so === x[0]) + '">' + x[1] + '</button>').join('') + '</div>' +
      '<section class="group"><div class="gh">이룬 것 <span class="hint">' + dn.length + '개</span></div>' + (dn.length ? dn.map(x => listRow('bucket', x, x.no)).join('') : '<div class="emptyrow">아직 이룬 것이 없어요.</div>') + '</section>';
  }
  return h;
}
/* 버킷리스트 첫머리: 오로라가 흐르는 밤하늘 · 눈 덮인 산 · 마을 불빛 (코드로 그려요) */
function bucketHero() {
  let seed = 7;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  let stars = '', lights = '';
  for (let i = 0; i < 70; i++) {
    const r = rnd() < 0.12 ? 1.5 : 0.5 + rnd() * 0.8;
    stars += '<circle class="' + (i % 7 === 0 ? 'tw' : '') + '" cx="' + (rnd() * 400).toFixed(1) + '" cy="' + (rnd() * 150).toFixed(1) + '" r="' + r.toFixed(2) + '" fill="#fff" opacity="' + (0.35 + rnd() * 0.65).toFixed(2) + '"/>';
  }
  for (let i = 0; i < 34; i++) lights += '<circle cx="' + (6 + rnd() * 388).toFixed(1) + '" cy="' + (196 + rnd() * 20).toFixed(1) + '" r="' + (0.7 + rnd() * 1.1).toFixed(2) + '" fill="#FFB347" opacity="' + (0.6 + rnd() * 0.4).toFixed(2) + '"/>';
  return '<svg class="bksvg" viewBox="0 0 400 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs>' +
    '<linearGradient id="bks" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#040b24"/><stop offset=".55" stop-color="#0a2a4d"/><stop offset="1" stop-color="#0e5560"/></linearGradient>' +
    '<linearGradient id="bka" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#37e6b0"/><stop offset=".6" stop-color="#5df2c8"/><stop offset="1" stop-color="#7a8cff"/></linearGradient>' +
    '<linearGradient id="bkn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9f3fb"/><stop offset="1" stop-color="#9dbad4"/></linearGradient>' +
    '<filter id="bkb" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="9"/></filter></defs>' +
    '<rect width="400" height="260" fill="url(#bks)"/>' + stars +
    '<g class="aur" filter="url(#bkb)"><path d="M-30 96C70 10 150 130 240 62S390 24 440 86V150C350 104 280 176 190 134S60 196 -30 140Z" fill="url(#bka)" opacity=".62"/><path d="M-30 60C60 -10 140 70 230 28S380 -6 440 40V84C350 56 280 110 190 80S50 120 -30 90Z" fill="#6bf0cf" opacity=".4"/></g>' +
    '<path d="M0 196L48 150 92 178 150 126 212 184 268 150 330 190 400 160V260H0Z" fill="#17395a"/>' +
    '<path d="M0 214L40 178 84 202 132 160 190 206 250 176 316 208 400 184V260H0Z" fill="#244f78"/>' +
    '<path d="M150 126l-13 17 8-3 6 9 7-9 8 4zM48 150l-10 14 7-3 5 8 6-8 7 3z" fill="#e9f3fb" opacity=".9"/>' + lights +
    '<path d="M0 238C70 220 140 230 220 218S350 214 400 228V260H0Z" fill="url(#bkn)"/><path d="M0 252C90 240 170 248 260 238S360 240 400 246V260H0Z" fill="#cfe1f1"/></svg>';
}
function viewBucket() {
  const st = bucketStats(), pct = st.total ? Math.round(100 * st.done / st.total) : 0;
  const chev = '<svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1L2 8l6 7"/></svg>';
  return '<div class="bkpage"><div class="bkhero">' + bucketHero() + '<div class="bkhd"><a href="#" class="back bkback" data-act="back">' + chev + esc(backLabel()) + '</a>' +
    '<h1>버킷리스트</h1><p>하고 싶은 일을, 하나씩</p>' +
    '<div class="bkstat"><div class="bks1"><b>' + st.done + '</b><span> / ' + st.total + ' 이룸</span><em>' + pct + '%</em></div><div class="bktrack"><span style="width:' + pct + '%"></span></div></div></div></div>' +
    '<div class="bkbody"><div class="searchbar"><input type="search" id="bq" class="tin" value="' + esc(NAV.bq || '') + '" placeholder="버킷리스트 검색" autocomplete="off" enterkeyhint="search" aria-label="버킷리스트 검색" data-inp="bsearch"></div>' +
    '<button type="button" class="btn full bkadd" data-act="addBucket" data-arg="">버킷리스트 추가</button><div id="bres" class="stackc">' + bucketBody() + '</div></div></div>';
}
/* ---------- Someday List: 언젠가는 해야 할 일. 나중에 체크하거나 오늘·주·월 목표로 옮겨요 ---------- */
function sdRow(x) {
  const d = !!x.done;
  return '<div class="lirow c-push"><button type="button" class="lick" data-act="sdTg" data-arg="' + x.id + '" aria-pressed="' + d + '" aria-label="' + esc(x.title) + (d ? ' 다시 대기로' : ' 했어요') + '">' + (d ? DONE_SVG : TODO_SVG) + '</button>' +
    '<button type="button" class="litext" data-act="editSd" data-arg="' + x.id + '"><span class="li1' + (d ? ' dn' : '') + '">' + esc(x.title) + '</span>' + (d ? (x.doneAt ? '<span class="li2">' + dotDate(x.doneAt) + ' 완료</span>' : '') : x.memo ? '<span class="li2">' + esc(x.memo) + '</span>' : '') + '</button>' +
    (d ? '' : '<button type="button" class="plfail" data-act="moveSd" data-arg="' + x.id + '">이동</button>') + '</div>';
}
function somedayBody() {
  const open = S.someday.filter(x => !x.done), dn = S.someday.filter(x => x.done).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  let h = '<!--cols-->';
  h += '<section class="card c-push"><div class="ml">언젠가는</div><div class="bigrow"><div class="big">' + open.length + '<span class="u">개</span></div><div class="sm nm">' + (dn.length ? '완료 ' + dn.length + '개' : '') + '</div></div></section>';
  h += bigBtn('addSd', '', 'push', '추가') + '<!--col-->';
  if (!S.someday.length) return h + empty('언젠가는 해야 할 일을 적어 두세요.<br>주간·월간·연간 목표로 옮겨서 세울 수 있어요.');
  if (open.length) h += '<section class="group"><div class="gh">대기 <span class="hint">' + open.length + '개</span></div>' + open.map(sdRow).join('') + '</section>';
  if (dn.length) h += '<section class="group"><div class="gh">완료 <span class="hint">' + dn.length + '개</span></div>' + dn.map(sdRow).join('') + '</section>';
  return h;
}
function viewSomeday() { NAV.gper = 'someday'; return viewGoals(); }
/* 완료할 때 달성한 날짜를 함께 적어요 (기본은 오늘) */
function sheetSdDate(x) {
  const t = todayStr();
  openSheet('달성 날짜', '<p class="cmsg">‘' + esc(x.title) + '’ 달성한 날짜를 적어 주세요.</p>' + field('달성 날짜 (연도.월.일)', 'f-ddate', 'text', dotDate(t), 'inputmode="numeric" maxlength="10" autocomplete="off" data-inp="ddate"') + ERR, () => {
    const pr = parseDoneDate(val('f-ddate'), true);
    if (!pr) return setErr('연도.월.일을 모두 적어 주세요. 오늘이나 지난 날짜여야 해요. 예: ' + dotDate(t));
    x.done = true; x.doneAt = pr.at; done('달성했어요');
  }, { focus: false });
}
function sheetSomeday(sid) {
  const cur = sid ? S.someday.find(x => x.id === sid) : null;
  if (sid && !cur) return;
  const body = field('언젠가 할 일', 'f-title', 'text', cur ? cur.title : '', 'maxlength="60" placeholder="예: 이사 가기 전에 책장 정리"') +
    area('메모 (선택)', 'f-memo', cur ? cur.memo || '' : '', 'maxlength="200" rows="3"') +
    (cur && cur.done ? field('달성 날짜 (연도.월.일)', 'f-ddate', 'text', cur.doneAt ? dotDate(cur.doneAt) : '', 'inputmode="numeric" maxlength="10" autocomplete="off" data-inp="ddate"') : '') +
    (cur && !cur.done ? '<button type="button" class="btn ghost" data-act="moveSd" data-arg="' + sid + '">오늘·주·월 목표로 옮기기</button>' : '') + (cur ? delBtn('sd|' + sid) : '') + ERR;
  openSheet(cur ? '수정' : 'Someday 추가', body, () => {
    const title = val('f-title').trim();
    if (!title) return setErr('내용을 입력해 주세요.');
    const rec = cur || { id: 'sd' + uid(), done: false, doneAt: null, addedAt: todayStr() };
    rec.title = title; rec.memo = val('f-memo').trim();
    if (cur && cur.done) { const pr = parseDoneDate(val('f-ddate'), true); if (!pr) return setErr('달성 날짜를 연도.월.일로 적어 주세요.'); rec.doneAt = pr.at; }
    if (!cur) S.someday.push(rec);
    done();
  }, { focus: !cur });
}
const SD_TARGETS = [['today', '오늘 할 일'], ['week0', '이번 주 목표'], ['week-1', '다음 주 목표'], ['month0', '이번 달 목표'], ['month-1', '다음 달 목표'], ['year0', '올해 목표']];
function sheetSdMove(sid) {
  const x = S.someday.find(y => y.id === sid);
  if (!x) return;
  openSheet('옮기기', '<p class="cmsg">‘' + esc(x.title) + '’을(를) 어디로 옮길까요?</p><div class="stackc">' + SD_TARGETS.map(t => '<button type="button" class="btn ghost" data-act="sdTo" data-arg="' + sid + '|' + t[0] + '">' + t[1] + '</button>').join('') + '</div>', null, { cancel: '닫기', save: '\u00a0' });
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
  h += '<button type="button" class="dashbtn" data-act="logSleepPast">' + ico('plus', 18, 2) + '이전 날짜 수면 기록 추가</button>';
  const list = sleepList().slice().reverse().slice(0, 7);
  h += '<section class="group"><div class="gh">최근 기록 <span class="hint">눌러서 수정</span></div>' + (list.length ? list.map(x =>
    '<button type="button" class="erow" data-act="logSleep" data-arg="' + x.d + '"><span class="el"><span class="e1">' + dateLabel(x.d) + '</span><span class="e2">' + esc(x.bed) + ' → ' + esc(x.wake) + '</span></span><span class="er">' + fmtDur(x.dur) + (x.score ? ' · ' + x.score + '점' : '') + '</span>' + EDIT_IC + '</button>').join('') : '<div class="emptyrow">아직 기록이 없어요.</div>') + '</section>';
  h += linkSection('sleep', 2);
  return h;
}

/* ---------- 가계부 ---------- */
function expRow(x) {
  if (x.inv) return entryRow('exp|' + x.id, esc(x.memo || '투자'), '<span class="corptag inv">투자</span> 내 지출 아님', '−' + won(x.amt), 'corpamt');
  if (x.corp) return entryRow('exp|' + x.id, esc(x.memo || '회사카드'), '<span class="corptag">회사카드</span> 내 지출 아님', '−' + won(x.amt), 'corpamt');
  const sn = x.sub ? subName(x.cat, x.sub) : '';
  return entryRow('exp|' + x.id, esc(x.memo || sn || catName(x.cat)), esc(catName(x.cat)) + (sn ? ' · ' + esc(sn) : '') + (x.fixed ? ' · 고정' : ''), '−' + won(x.amt));
}
const catName = id => { const c = S.settings.cats.find(x => x.id === id); return c ? c.name : '기타'; };
const subName = (cid, sid) => { const c = S.settings.cats.find(x => x.id === cid); const s = c && c.subs.find(x => x.id === sid); return s ? s.name : ''; };
/* 카테고리 한 줄: 이름 · 쓴 돈 / 예산 · 가는 막대 하나 */
function catTile(c, ym) {
  const sp = catSpentMonth(c.id, ym), cb = budgetCat(c, ym), p = cb > 0 ? sp / cb * 100 : (sp > 0 ? 100 : 0), over = cb > 0 && sp > cb;
  const has = S.settings.subOn && c.subs.length > 0, open = !!NAV.open[c.id];
  const body = '<span class="ctn">' + esc(c.name) + (has ? '<span class="cex' + (open ? ' o' : '') + '">' + CHEV + '</span>' : '') + '</span><span class="ctv"><b' + (over ? ' class="neg"' : '') + '>' + won(sp) + '</b> / ' + won(cb) + '</span>';
  let h = '<div class="ctile' + (over ? ' over' : '') + '">' + (has ? '<button type="button" class="ctb" data-act="toggleCat" data-arg="' + c.id + '" aria-expanded="' + open + '">' + body + '</button>' : '<div class="ctb">' + body + '</div>') +
    '<div class="track' + (p >= 90 ? ' hot' : '') + '"><div style="width:' + Math.min(100, p).toFixed(1) + '%"></div></div>';
  if (has && open) { const un = subSpentMonth(c.id, '', ym); h += '<div class="subs">' + c.subs.map(x => '<div class="sr"><span>' + esc(x.name) + '</span><b>' + won(subSpentMonth(c.id, x.id, ym)) + '</b></div>').join('') + (un > 0 ? '<div class="sr"><span>미분류</span><b>' + won(un) + '</b></div>' : '') + '</div>'; }
  return h + '</div>';
}
const moneyMonth = () => { const c = monthOf(0); return NAV.mm && NAV.mm < c ? NAV.mm : c; };
const xd = d => (+d.slice(5, 7)) + '.' + (+d.slice(8));
const xwon = n => fmtN(n, 0);
function xrow(act, arg, cells, cls) {   // 엑셀처럼 한 줄에 칸 4개
  return '<button type="button" class="xr' + (cls ? ' ' + cls : '') + '" data-act="' + act + '" data-arg="' + esc(arg) + '">' + cells.map((c, k) => '<span class="' + (k === 3 || (cls && cls.indexOf('cat') >= 0 && k > 0) ? 'n' : 'c') + '">' + c + '</span>').join('') + '</button>';
}
const xhead = (a, b, c, d, cls) => '<div class="xh' + (cls ? ' ' + cls : '') + '"><span>' + a + '</span><span>' + b + '</span><span>' + c + '</span><span' + (cls ? ' class="n"' : '') + '>' + d + '</span></div>';
function moneyRows(lm, q) {
  const mdD = monthData(lm), qq = String(q || '').trim().toLowerCase();
  let items = mdD.exp.concat(mdD.invs).map(x => Object.assign({ t: 'exp' }, x)).concat(mdD.inc.map(x => Object.assign({ t: 'inc' }, x))).map(x => Object.assign(x, { o: (x.t === 'inc' ? S.logs.inc : S.logs.exp).findIndex(y => y.id === x.id) })).sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : a.t !== b.t ? (a.t === 'inc' ? -1 : 1) : b.o - a.o);   // 같은 날은 나중에 적은 것이 위
  if (qq) items = items.filter(x => ((x.memo || '') + ' ' + (x.t === 'inc' ? '수입' : x.inv ? '투자' : catName(x.cat))).toLowerCase().indexOf(qq) >= 0);
  if (!items.length) return '<div class="emptyrow">' + (qq ? '찾는 내역이 없어요.' : '이 달 내역이 없어요.') + '</div>';
  return '<div class="xl">' + xhead('날짜', '내용', '분류', '금액') + items.map(x => {
    if (x.t === 'inc') return xrow('editEntry', 'inc|' + x.id, [xd(x.d), esc(x.memo || '수입'), '수입', '+' + xwon(x.amt)], 'inc');
    const kind = x.inv ? '투자' : x.corp ? '회사카드' : catName(x.cat) + (x.sub && S.settings.subOn ? '·' + esc(subName(x.cat, x.sub)) : '');
    return xrow('editEntry', 'exp|' + x.id, [xd(x.d), esc(x.memo || (x.inv || x.corp ? kind : catName(x.cat))), kind, '−' + xwon(x.amt)], x.inv || x.corp ? 'dim' : '');
  }).join('') + '</div>';
}
function viewMoney() {
  const realCur = monthOf(0), cur = moneyMonth(), isNow = cur === realCur, mlabel = isNow ? '이번 달' : (+cur.slice(5)) + '월';
  const st = S.settings, view = ['budget', 'prev', 'none'].indexOf(st.catView) >= 0 ? st.catView : 'budget', sb = view === 'budget', pv = view === 'prev', pm = monthShift(cur, -1), D = monthData(cur), P = monthData(pm), now = new Date();
  const budget = budgetTotal(cur), pct = budget > 0 ? D.spent / budget * 100 : 0, left = budget - D.spent;
  const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate() + 1;
  const rest = D.income - D.spent - D.invSum;
  let h = backHdr('가계부', 'money', 'money', editLink('money')) + '<!--cols-->';
  h += '<div class="btnpair"><button type="button" class="btn c-money" data-act="logMoney" data-arg="">지출 추가</button><button type="button" class="btn ghost c-money" data-act="logIncome" data-arg="">수입 추가</button></div>';
  h += monthNav(ymLabel(cur), 'mmMonth', !isNow);
  const dd = D.spent - P.spent, dcls = dd > 0 ? 'neg' : 'inc';
  h += '<section class="card c-money" aria-label="이번 달"><div class="bigrow"><div class="a1">' + (isNow ? ymNow() : mlabel) + ' 지출</div><div class="sm nm">' +
    (sb ? (left >= 0 ? '남은 ' + won(left) : '초과 ' + won(-left)) : pv ? '전달 ' + won(P.spent) : '') + '</div></div>' +
    '<div class="big">' + won(D.spent) + (sb ? '<button type="button" class="u lnkb" data-act="budgetEdit" data-arg="' + cur + '" aria-label="예산 바꾸기">/ ' + won(budget) + '</button>' : '') + '</div>' +
    (sb ? '<div class="track' + (pct >= 100 ? ' hot' : '') + '"><div style="width:' + Math.min(100, pct).toFixed(1) + '%"></div></div>' : '') +
    (sb ? '<div class="sm cap">' + (isNow && left > 0 ? daysLeft + '일 남음 · 하루 ' + won(Math.floor(left / daysLeft)) : Math.round(pct) + '%') + '</div>'
      : pv ? '<div class="sm cap">' + (P.spent > 0 ? '전달보다 <b class="' + dcls + '">' + (dd > 0 ? '+' : dd < 0 ? '−' : '') + won(Math.abs(dd)) + '</b>' : '전달 기록 없음') + '</div>' : '') + '</section>';
  h += '<a href="#" class="group lstrow c-money" data-act="go" data-arg="mstat"><span class="l1">월별 통계</span><span class="l2r">' + (D.income > 0 ? '수입 ' + won(D.income) + ' · 남는 돈 ' + swon(rest) : '수입·지출·투자 한눈에') + '</span>' + CHEV + '</a>';
  const catRows = st.cats.map(c => ({ c: c, sp: catSpentMonth(c.id, cur), pp: pv ? catSpentMonth(c.id, pm) : 0 })).sort((a, b) => b.sp - a.sp || b.pp - a.pp), allCats = !!NAV.catAll;
  const catShown = allCats ? catRows : catRows.filter(x => x.sp > 0 || x.pp > 0).slice(0, 6), catHidden = catRows.length - catShown.length;
  const dlt = n => n === 0 ? '–' : (n > 0 ? '+' : '−') + xwon(Math.abs(n));
  const catTbl = catShown.map(x => { const c = x.c, cb = budgetCat(c, cur), over = sb && cb > 0 && x.sp > cb, subs = S.settings.subOn && c.subs.length > 0, open = !!NAV.open[c.id] && subs, d = x.sp - x.pp;
    let r = '<button type="button" class="xr cat' + (over ? ' over' : '') + '" data-act="' + (subs ? 'toggleCat' : 'noop') + '" data-arg="' + c.id + '"><span class="c">' + esc(c.name) + (subs ? ' ▾' : '') + '</span><span class="n">' + xwon(x.sp) + '</span>' +
      (sb ? '<span class="n sub">' + (cb > 0 ? xwon(cb) : '–') + '</span><span class="n' + (over ? ' neg' : '') + '">' + (cb > 0 ? xwon(cb - x.sp) : '') + '</span>' : pv ? '<span class="n sub">' + xwon(x.pp) + '</span><span class="n ' + (d > 0 ? 'neg' : d < 0 ? 'inc' : 'sub') + '">' + dlt(d) + '</span>' : '') + '</button>';
    if (open) { const un = subSpentMonth(c.id, '', cur), sr = (n, v) => '<div class="xr cat subr"><span class="c">· ' + n + '</span><span class="n">' + xwon(v) + '</span>' + (sb || pv ? '<span></span><span></span>' : '') + '</div>'; r += c.subs.map(y => sr(esc(y.name), subSpentMonth(c.id, y.id, cur))).join('') + (un > 0 ? sr('미분류', un) : ''); }
    return r; }).join('');
  const catTot = '<div class="xr cat tot"><span class="c">합계</span><span class="n">' + xwon(D.spent) + '</span>' + (sb ? '<span class="n sub">' + (budget > 0 ? xwon(budget) : '–') + '</span><span class="n' + (left < 0 ? ' neg' : '') + '">' + (budget > 0 ? xwon(left) : '') + '</span>' : pv ? '<span class="n sub">' + xwon(P.spent) + '</span><span class="n ' + (dd > 0 ? 'neg' : dd < 0 ? 'inc' : 'sub') + '">' + dlt(dd) + '</span>' : '') + '</div>';
  h += '<section class="card c-money xcard" aria-label="카테고리별 지출"><div class="sh2"><div class="a1b">카테고리 · ' + mlabel + '</div><span class="vhd"><span class="mseg" role="group" aria-label="표시">' + [['budget', '예산'], ['prev', '전달'], ['none', '지출']].map(x => '<button type="button" data-act="catView" data-arg="' + x[0] + '" aria-pressed="' + (view === x[0]) + '">' + x[1] + '</button>').join('') + '</span>' + editLink('money') + '</span></div>' +
    (st.cats.length ? (catShown.length ? '<div class="xl' + (sb || pv ? '' : ' nob') + '">' + (sb ? xhead('카테고리', '지출', '예산', '남음', 'cat') : pv ? xhead('카테고리', '지출', '전달', '증감', 'cat') : xhead('카테고리', '지출', '', '', 'cat nob')) + catTbl + catTot + '</div>' : '<div class="emptyrow">쓴 돈이 아직 없어요.</div>') +
      (catHidden > 0 || allCats ? '<button type="button" class="dashbtn" data-act="catAll">' + (allCats ? '접기' : '전체 ' + st.cats.length + '개 보기') + '</button>' : '') : '<div class="emptyrow">카테고리가 없어요. 편집에서 추가해 보세요.</div>') + '</section>';
  const lm = cur, mdD = monthData(lm);
  const hist = '<div class="searchbar"><input type="search" id="mq" class="tin" value="' + esc(NAV.mq || '') + '" placeholder="내역 검색 (메모·카테고리)" autocomplete="off" enterkeyhint="search" aria-label="내역 검색" data-inp="msearch"></div>' +
    '<section class="group"><div class="gh">' + (+lm.slice(5)) + '월 지출 ' + won(mdD.spent) + (mdD.income > 0 ? ' · 수입 ' + won(mdD.income) : '') + '</div><div id="mres">' + moneyRows(lm, NAV.mq) + '</div></section>';
  const imM = cur, ID = monthData(imM), invAll = S.logs.exp.filter(x => x.inv);
  const im6 = []; for (let i = 5; i >= 0; i--) im6.push(monthShift(imM, -i));
  const inv = '<section class="group c-faith"><div class="gh">' + (+imM.slice(5)) + '월 투자 <span class="hint">내 지출·예산에는 넣지 않아요</span></div>' +
    '<div class="corpsum"><div><div class="gl1">' + (+imM.slice(5)) + '월 투자</div><div class="gl2">' + won(ID.invSum) + '</div></div><div><div class="gl1">지금까지 합계</div><div class="gl2">' + won(sum(invAll.map(x => x.amt))) + '</div></div></div>' +
    '<div class="invbars">' + miniBars(im6.map(m => monthData(m).invSum), im6.map(m => (+m.slice(5)) + '월')) + '</div>' +
    (ID.invs.length ? '<div class="xl">' + xhead('날짜', '내용', '', '금액') + ID.invs.slice().sort(byDateDesc).map(x => xrow('editEntry', 'exp|' + x.id, [xd(x.d), esc(x.memo || '투자'), '', '−' + xwon(x.amt)], 'dim')).join('') + '</div>' : '<div class="emptyrow">이 달 투자 내역이 없어요.</div>') +
    '<button type="button" class="addrow" data-act="logInv">' + ico('plus', 18, 2) + '투자 추가</button></section>';
  const corpAll = S.logs.exp.filter(x => x.corp).sort(byDateDesc), corpMonth = sum(corpAll.filter(x => x.d.slice(0, 7) === cur).map(x => x.amt));
  const corp = '<section class="group c-money"><div class="gh">회사카드 <span class="hint">내 지출·예산에는 넣지 않아요</span></div>' +
    '<div class="corpsum"><div><div class="gl1">' + (+cur.slice(5)) + '월 사용</div><div class="gl2">' + won(corpMonth) + '</div></div><div><div class="gl1">지금까지 합계</div><div class="gl2">' + won(sum(corpAll.map(x => x.amt))) + '</div></div></div>' +
    (corpAll.length ? '<div class="xl">' + xhead('날짜', '내용', '', '금액') + corpAll.slice(0, 15).map(x => xrow('editEntry', 'exp|' + x.id, [xd(x.d), esc(x.memo || '회사카드'), '', '−' + xwon(x.amt)], 'dim')).join('') + '</div>' : '') +
    '<button type="button" class="addrow" data-act="logCorp">' + ico('plus', 18, 2) + '회사카드 사용 추가</button></section>';
  const fx = st.fixed, fxSum = sum(fx.map(f => f.amt));
  const fixd = '<section class="group c-money"><div class="gh">고정 지출 <span class="hint">매달 정해진 날 자동으로 입력돼요' + (fx.length ? ' · 합계 ' + won(fxSum) : '') + '</span></div>' + (fx.length ? '<div class="xl">' + xhead('매월', '이름', '분류', '금액') + fx.map(f => xrow('editFixed', f.id, [f.day + '일', esc(f.name), esc(catName(f.cat)), xwon(f.amt)], '')).join('') + '</div>' : '') +
    '<button type="button" class="addrow" data-act="addFixed">' + ico('plus', 18, 2) + '고정 지출 추가</button></section>';
  const mt = ['hist', 'inv', 'corp', 'fix'].indexOf(NAV.mt) >= 0 ? NAV.mt : 'hist';
  h += '<!--col-->' + '<div class="seg rangeseg" role="group" aria-label="보기">' + [['hist', '내역'], ['inv', '투자'], ['corp', '회사카드'], ['fix', '고정지출']].map(x => '<button type="button" data-act="moneyTab" data-arg="' + x[0] + '" aria-pressed="' + (mt === x[0]) + '">' + x[1] + '</button>').join('') + '</div>' + (mt === 'hist' ? hist : mt === 'inv' ? inv : mt === 'corp' ? corp : fixd);
  return h;
}

/* ---------- 신앙 ---------- */
const NOTE_TYPES = ['묵상', '감사', '기도'];
function viewFaith() {
  const st = S.settings, off = NAV.fw || 0, f = faithStats(), t = todayStr(), bi = bibleInfo();
  let h = backHdr('신앙', 'faith', 'faith', editLink('faith')) + '<!--cols-->';
  const wst = wheelStats(off);
  const grid = wst.items.map(w => {
    const cells = wst.days.map(d => '<button type="button" class="fcb" data-act="wheelCell" data-arg="' + w.id + '|' + d + '"' + (d > t ? ' disabled' : '') + ' aria-pressed="' + wheelDone(d, w.id) + '" aria-label="' + esc(w.name) + ' ' + md(d) + (wheelDone(d, w.id) ? ' 완료' : '') + '"><span class="fc' + (wheelDone(d, w.id) ? ' on' : '') + (d > t ? ' fut' : '') + '"></span></button>').join('');
    const n = wst.days.filter(d => d <= t && wheelDone(d, w.id)).length;
    return '<div class="frow" aria-label="' + esc(w.name) + ': 이번 주 ' + n + '일 실천"><span class="fn">' + esc(w.name) + '</span>' + cells + '</div>';
  }).join('');
  const wl = off === 0 ? '이번 주' : off === 1 ? '지난주' : off + '주 전';
  h += '<section class="card c-faith" aria-label="수레바퀴의 삶"><div class="bigrow"><div><div class="ml">수레바퀴의 삶 · ' + wl + ' (일~토)</div><div class="big">' + (wst.rate == null ? dash : Math.round(wst.rate * 100) + '%') + '</div></div>' +
    '<div class="fwn"><button type="button" data-act="fweek" data-arg="1" aria-label="이전 주">' + '<svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 1L2 8l6 7"/></svg></button><button type="button" data-act="fweek" data-arg="-1" aria-label="다음 주"' + (off === 0 ? ' disabled' : '') + '><svg width="10" height="16" viewBox="0 0 10 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 1l6 7-6 7"/></svg></button></div></div>' +
    '<div class="sm">' + wst.done + ' / ' + wst.total + ' 실천 · 칸을 눌러 바로 체크해요</div>' +
    '<div class="fhead"><span></span>' + wst.days.map(d => '<span' + (d === t ? ' class="tod"' : '') + '>' + WD[parseD(d).getDay()] + '<br>' + (+d.slice(8)) + '</span>').join('') + '</div>' + (grid || '<div class="emptyin">설정 → 신앙에서 수레바퀴 항목을 추가해 주세요.</div>') + '</section>';
  const checks = f.items.map(it => {
    const rec = faithRec(t);
    return { key: 'faith:' + it.id, cls: 'faith', title: it.name, sub: it.track === 'pray' && rec.pray ? rec.pray + '분' : it.track === 'read' && rec.read ? rec.read + '장' : it.track === 'bible' && S.logs.bible[t] ? S.logs.bible[t] + '일치 읽음' : '', done: faithDone(t, it) };
  });
  h += '<section><div class="sh"><h2>오늘 체크리스트</h2><div class="shr"><span>' + checks.filter(c => c.done).length + ' / ' + checks.length + ' 완료</span></div></div><div class="group">' +
    (checks.length ? checks.map(checkRow).join('') : '<div class="emptyrow">표시할 항목이 없어요.</div>') + '</div></section>';
  if (bi) {
    const st2 = bi.left === 0 ? '완독했어요' : bi.ahead > 0 ? '계획보다 ' + bi.ahead + '일 빨라요' : bi.ahead < 0 ? '계획보다 ' + (-bi.ahead) + '일 늦어요' : '계획대로 가고 있어요';
    h += '<section class="card c-faith" aria-label="성경 통독"><div class="sh2"><div class="a1b">성경 통독</div><a href="#" class="lnk" data-act="editBible">수정</a></div>' +
      '<div class="ml">예상 완독일</div><div class="big' + (bi.ahead > 0 ? ' inc' : bi.ahead < 0 ? ' neg' : '') + '">' + dotDate(bi.exp) + '</div>' +
      '<div class="sm">' + st2 + ' · 계획 ' + dotDate(bi.b.end) + '</div><div class="track"><div style="width:' + bi.pct.toFixed(1) + '%"></div></div>' +
      '<div class="gl"><span>읽은 ' + bi.got + '일치</span><span>남은 ' + bi.left + '일치</span></div>' +
      '<div class="bibrow"><button type="button" class="sbt" data-act="bibleAdd" data-arg="-1" aria-label="하루치 취소">' + ico('minus', 16, 2.4) + '</button><button type="button" class="bibn" data-act="bibleNum" aria-label="숫자로 직접 입력"><span class="gl1">오늘 읽은 분량</span><span class="gl2">' + bi.today + '일치</span></button><button type="button" class="sbt" data-act="bibleAdd" data-arg="1" aria-label="하루치 더 읽음">' + ico('plus', 16, 2.4) + '</button></div>' +
      '<div class="sm cap">하루치를 읽으면 +1, 이틀치를 읽으면 +2로 기록하면 예상 완독일이 하루씩 앞당겨져요.</div></section>';
  }
  h += bigBtn('logFaith', '', 'faith', '기도·말씀 기록');
  const notes = S.logs.notes.slice().sort(byDateDesc).slice(0, 5);
  h += '<section class="group c-faith"><div class="gh">신앙 메모 <span class="hint">눌러서 수정</span></div>' + (notes.length ? notes.map(n =>
    '<button type="button" class="nrow" data-act="editEntry" data-arg="note|' + n.id + '"><span class="ntag">' + esc(n.type) + '</span><span class="ntext">' + esc(n.text) + '</span><span class="ndate">' + md(n.d) + '</span></button>').join('') : '<div class="emptyrow">묵상이나 감사한 일을 한두 줄 남겨 보세요.</div>') +
    '<button type="button" class="addrow" data-act="addNote">' + ico('plus', 18, 2) + '메모 추가</button></section>';
  h += '<!--col-->';
  const recent = x => x.done && x.doneAt && dayDiff(t, x.doneAt) <= 1;
  const topics = st.topics.filter(x => !x.done || recent(x)).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
  const answered = st.topics.filter(x => x.done && !recent(x)).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  const openA = !!NAV.open.answered;
  h += '<section class="group c-faith"><div class="gh">기도 제목 <span class="hint">눌러서 수정 · 응답받으면 하루 동안 보여요</span></div>' + (topics.length ? topics.map(x =>
    '<button type="button" class="trow2b" data-act="editEntry" data-arg="topic|' + x.id + '"><span class="tmark">' + (x.done ? DONE_SVG : TODO_SVG) + '</span><span class="tt' + (x.done ? ' dn' : '') + '">' + esc(x.text) + '</span>' + (x.done ? '<span class="tstat">응답받음</span>' : '') + '</button>').join('') : '<div class="emptyrow">기도 제목을 추가해 보세요.</div>') +
    '<button type="button" class="addrow" data-act="addTopic">' + ico('plus', 18, 2) + '기도 제목 추가</button></section>';
  h += '<section class="group c-faith"><button type="button" class="drow2" data-act="toggleAns" aria-expanded="' + openA + '"><span>응답받은 기도 · 누적</span><span class="ansn">' + answered.length + '개 <span class="cex' + (openA ? ' o' : '') + '">' + CHEV + '</span></span></button>' +
    (openA ? (answered.length ? answered.map(x => '<button type="button" class="trow2b" data-act="editEntry" data-arg="topic|' + x.id + '"><span class="tmark">' + DONE_SVG + '</span><span class="tt dn">' + esc(x.text) + '</span><span class="tstat">' + (x.doneAt ? md(x.doneAt) : '') + '</span></button>').join('') : '<div class="emptyrow">아직 응답받은 기도가 없어요.</div>') : '') + '</section>';
  h += statTable('이번 주 평균', '개인 최고', [
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
function stepRow(title, sub, display, act, arg, cur) {
  return '<div class="strow"><div class="stt"><div class="st1">' + title + '</div>' + (sub ? '<div class="st2">' + sub + '</div>' : '') + '</div>' +
    '<button type="button" class="sbt" data-act="' + act + '" data-arg="' + arg + '|-1" aria-label="' + esc(title) + ' 줄이기">' + ico('minus', 16, 2.4) + '</button>' + (cur != null ? '<button type="button" class="sval" data-act="typeNum" data-arg="' + act + '|' + arg + '" data-v="' + cur + '" aria-label="' + esc(title) + ' 숫자로 직접 입력">' + display + '</button>' : '<span class="sval">' + display + '</span>') +
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
      stepRow('주간 목표', 'Growth 점수의 기준이에요', exGoal(e.weekly, e), 'stepEx', e.id + '|weekly|' + stepW + '|1|5000', e.weekly) +
      '<div class="gh2s">일간·주간·월간 목표</div>' +
      e.goals.map(g => entryRow('goal|' + e.id + '|' + g.id, esc(goalTitle(e, g)), g.type === 'days' ? '횟수 목표' : '합계 목표', '')).join('') +
      '<button type="button" class="addrow" data-act="addGoal" data-arg="' + e.id + '">' + ico('plus', 18, 2) + '목표 추가</button></section>';
  }).join('');
  if (!only) h += dashAdd('addEx', '운동 종목 추가');
  return h;
}
function setSleep() {
  const st = S.settings;
  return backHdr('수면 설정', null, 'blue') + '<section class="group">' + stepRow('목표 수면 시간', '성인 권고는 하루 7시간 이상이에요', fmtDurShort(st.sleepGoal * 60), 'stepSet', 'sleepGoal|0.5|4|12', st.sleepGoal) +
    sw('수면 평점 기록 (10점 만점)', st.rate, 'tgRate', '') + '</section>';
}
function setMoney() {
  const st = S.settings, base = NAV.bmode !== 'month', cur = monthOf(0);
  if (!NAV.bm) NAV.bm = cur;
  const ym = NAV.bm, own = !!budgetOf(ym);
  let h = backHdr('가계부 설정', null, 'blue');
  h += '<div class="seg" role="group" aria-label="예산 종류">' + [['base', '매달 같은 예산'], ['month', '달마다 다르게']].map(x => '<button type="button" data-act="bmode" data-arg="' + x[0] + '" aria-pressed="' + ((NAV.bmode === 'month') === (x[0] === 'month')) + '">' + x[1] + '</button>').join('') + '</div>';
  if (!base) h += monthNav(ymLabel(ym) + (ym === cur ? ' · 이번 달' : ''), 'bmMonth', true) + '<p class="subline">' + (own ? ymLabel(ym) + '만 따로 정한 예산이에요.' : '따로 정하지 않아 기본 예산을 쓰고 있어요. 아래 값을 바꾸면 이 달만 따로 저장돼요.') + '</p>';
  const tot = base ? st.monthly : budgetTotal(ym);
  h += '<section class="group">' + stepRow('월 예산', base ? '기본 전체 예산' : ymLabel(ym) + ' 전체 예산', won(tot), base ? 'stepSet' : 'stepBudget', base ? 'monthly|50000|100000|50000000' : 'total|50000', tot) + '</section>';
  if (!base && own) h += '<div class="btnpair"><button type="button" class="btn ghost" data-act="bmBase">기본 예산으로 저장</button><button type="button" class="btn ghost danger" data-act="bmReset">이 달 설정 지우기</button></div><p class="fhint">‘기본 예산으로 저장’은 이 달 값을 따로 정하지 않은 모든 달에 쓰는 값으로 바꿔요.</p>';
  h += glabel('카테고리 · 눌러서 수정');
  h += '<section class="group c-money">' + (st.cats.map(c => '<button type="button" class="erow" data-act="editCat" data-arg="' + c.id + '"><span class="el"><span class="e1">' + esc(c.name) + '</span>' + (c.subs.length ? '<span class="e2">' + esc(c.subs.map(x => x.name).join(' · ')) + '</span>' : '') + '</span><span class="er">' + won(base ? c.monthly : budgetCat(c, ym)) + '</span>' + EDIT_IC + '</button>').join('') || '<div class="emptyrow">카테고리가 없어요.</div>') + '</section>';
  h += dashAdd('addCat', '카테고리 추가');
  h += '<section class="group">' + sw('카테고리 안에 세부 항목 쓰기', st.subOn, 'tgSub', '') + '</section>';
  return h;
}
function setFaith() {
  const st = S.settings;
  return backHdr('신앙 설정', null, 'blue') + glabel('수레바퀴의 삶 항목') + '<section class="group">' + st.wheel.map(w =>
    '<div class="srow2"><input class="nm inl" value="' + esc(w.name) + '" aria-label="항목 이름" data-chg="renWheel" data-arg="' + w.id + '"><button type="button" role="switch" aria-checked="' + w.on + '" aria-label="' + esc(w.name) + ' 표시" class="swt' + (w.on ? ' on' : '') + '" data-act="tgWheel" data-arg="' + w.id + '"><span></span></button>' + trashBtn('delWheel', w.id, w.name) + '</div>').join('') +
    '<button type="button" class="addrow" data-act="addWheel">' + ico('plus', 18, 2) + '항목 추가</button></section>' +
    glabel('오늘 체크리스트 항목') + '<section class="group">' + st.faith.map(f =>
    '<div class="srow2"><input class="nm inl" value="' + esc(f.name) + '" aria-label="항목 이름" data-chg="renFaith" data-arg="' + f.id + '"><button type="button" role="switch" aria-checked="' + f.on + '" aria-label="' + esc(f.name) + ' 표시" class="swt' + (f.on ? ' on' : '') + '" data-act="tgFaith" data-arg="' + f.id + '"><span></span></button>' +
    (f.track ? '' : trashBtn('delFaith', f.id, f.name)) + '</div>').join('') +
    '<button type="button" class="addrow" data-act="addFaith">' + ico('plus', 18, 2) + '항목 추가</button></section>' +
    glabel('데이터') + '<section class="group"><button type="button" class="drow danger" data-act="resetFaith">신앙 기록 초기화</button></section>';
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
  h += glabel('글자 크기 (이 기기에만 적용)') + '<div class="seg" role="group" aria-label="글자 크기">' + [['sm', '작게'], ['md', '보통'], ['lg', '크게'], ['xl', '아주 크게']].map(x => '<button type="button" data-act="fontSize" data-arg="' + x[0] + '" aria-pressed="' + (FONT_SIZE === x[0]) + '">' + x[1] + '</button>').join('') + '</div>';
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
  today: () => viewToday(), cats: () => viewCats(), growth: () => viewGrowth(), growthd: () => viewGrowthD(), review: () => viewReview(), cal: () => viewCal(), goals: () => viewGoals(), remind: () => viewRemind(), yearly: () => viewGoals(), mstat: () => viewMStat(), exlist: () => viewExList(),
  ex: () => viewEx(NAV.arg), sleep: () => viewSleep(), money: () => viewMoney(), faith: () => viewFaith(), bucket: () => viewBucket(), wish: () => viewWish(), someday: () => viewSomeday(), settings: () => viewSettings()
};
const TAB_OF = { today: 'today', cats: 'cats', growth: 'growth', growthd: 'growth', review: 'review', cal: 'cal', goals: 'cats', remind: 'cats', yearly: 'cats', mstat: 'cats', exlist: 'cats', ex: 'cats', sleep: 'cats', money: 'cats', faith: 'cats', bucket: 'cats', wish: 'cats', someday: 'cats', settings: 'cats' };

/* ================= 시트(입력·수정 창) ================= */
let SHEET = null;
const byId = id => document.getElementById(id);
const val = id => { const el = byId(id); return el ? el.value : ''; };
function field(label, id, type, value, attrs) {
  return '<div class="fld"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="' + type + '" value="' + esc(value) + '" ' + (attrs || '') + '></div>';
}
/* 금액 입력: 쓰는 동안 천 단위 쉼표를 찍어 줘요 */
function mfield(label, id, value, attrs) {
  return '<div class="fld"><label for="' + id + '">' + label + '</label><input id="' + id + '" type="text" inputmode="numeric" autocomplete="off" value="' + (value ? fmtN(value, 0) : '') + '" data-inp="money" ' + (attrs || '') + '></div>';
}
const readMoney = id => parseInt(String(val(id)).replace(/[^0-9]/g, ''), 10) || 0;
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
/* 시각은 키보드로만 입력해요 (예: 2330 또는 23:30) */
function parseHM(v) {
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  if (!d || d.length > 4) return null;
  const h = d.length <= 2 ? +d : +d.slice(0, d.length - 2), m = d.length <= 2 ? 0 : +d.slice(-2);
  return h > 23 || m > 59 ? null : PAD(h) + ':' + PAD(m);
}
const timeField = (label, id, value) => '<div class="fld"><label for="' + id + '">' + label + '</label><input id="' + id + '" class="tin" type="text" inputmode="numeric" maxlength="5" autocomplete="off" placeholder="예: 23:30" value="' + esc(value) + '" data-inp="timeFmt" data-chg="timeNorm"></div>';
function sheetSleep(date, carry) {
  const t = todayStr(), d0 = date || t, ex = S.logs.sleep[d0];
  const vals = { score: ex && ex.score ? ex.score : (!ex && carry && carry.score ? carry.score : '') };
  const body = '<div class="fld"><label for="f-date">기상한 날</label><input id="f-date" type="date" value="' + d0 + '" max="' + t + '" data-chg="sleepDate" data-arg=""></div>' +
    '<div class="two">' + timeField('취침 시각', 'f-bed', ex ? ex.bed : (carry ? carry.bed : '23:30')) + timeField('기상 시각', 'f-wake', ex ? ex.wake : (carry ? carry.wake : '07:00')) + '</div>' +
    (S.settings.rate ? '<div class="fld"><label>잘 잤나요? (10점 만점)</label><div class="scoregrid" role="group">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => '<button type="button" class="cs' + (n === vals.score ? ' on' : '') + '" data-act="pickVal" data-arg="score|' + n + '" data-grp="score" aria-pressed="' + (n === vals.score) + '">' + n + '</button>').join('') + '</div></div>' : '') +
    (ex ? '<button type="button" class="btn ghost danger" data-act="delSleep" data-arg="' + d0 + '">이 기록 삭제</button>' : '') + ERR;
  openSheet(ex ? '수면 기록 수정' : '수면 기록', body, () => {
    const d = val('f-date'), bed = parseHM(val('f-bed')), wake = parseHM(val('f-wake'));
    if (!d || d > t) return setErr('날짜를 확인해 주세요.');
    if (!bed || !wake) return setErr('취침과 기상 시각을 숫자로 입력해 주세요. 예: 23:30');
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
  if (!S.settings.subOn || !c || !c.subs.length) return '';
  return '<label>세부 항목 (선택)</label>' + chipsHtml('sub', [{ v: '', l: '선택 안 함' }].concat(c.subs.map(x => ({ v: x.id, l: x.name }))), sel || '');
}
const lastExpDate = () => { const t = todayStr(), d = S.lastExpDate; return d && /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= t ? d : t; };
const catHasSub = cid => { const c = S.settings.cats.find(x => x.id === cid); return !!(S.settings.subOn && c && c.subs.length); };
/* 카테고리를 고르면 그 안의 선택지만 남겨요 (예: 교통 → 대중교통 · 택시 · 킥보드) */
function catArea(v) {
  const c = S.settings.cats.find(x => x.id === v.cat);
  if (c && v.fold && catHasSub(v.cat)) return '<div class="fld"><label>카테고리</label><div class="chipsel" role="group"><button type="button" class="cs on" data-act="catUnfold" aria-label="카테고리 다시 고르기">' + esc(c.name) + ' ✕</button></div></div>' +
    '<div class="fld">' + chipsHtml('sub', c.subs.map(x => ({ v: x.id, l: x.name })), v.sub || '') + '</div>';
  return '<div class="fld"><label>카테고리</label>' + chipsHtml('cat', S.settings.cats.map(x => ({ v: x.id, l: x.name })), v.cat) + '</div>';
}
function sheetMoney(eid, corp) {
  const t = todayStr(), cats = S.settings.cats, cur = eid ? S.logs.exp.find(x => x.id === eid) : null;
  if (eid && !cur) return;
  const isCorp = cur ? !!(cur.corp || cur.inv) : !!corp;
  const vals = { fold: !!(cur && cur.cat && cur.sub && catHasSub(cur.cat)), cat: cur && cur.cat ? cur.cat : (cats.length ? cats[0].id : ''), sub: cur && cur.sub ? cur.sub : '', pay: cur ? (cur.inv ? 'inv' : cur.corp ? 'corp' : 'mine') : (corp === 'inv' ? 'inv' : corp ? 'corp' : 'mine') };
  const showNo = !cur && !spendOn(t) && !S.logs.nospend[t];
  const d0 = cur ? cur.d : lastExpDate();
  if (!cur && !corp) { const lastC = S.logs.exp.filter(x => !x.corp && !x.inv && x.cat).sort(byDateDesc)[0]; if (lastC && cats.some(c => c.id === lastC.cat)) { vals.cat = lastC.cat; vals.sub = ''; } }
  const body = mfield('금액 (원)', 'f-amt', cur ? cur.amt : '', 'placeholder="0"') +
    '<div class="chipsel qadd" role="group" aria-label="금액 더하기">' + [1000, 5000, 10000, 50000].map(n => '<button type="button" class="cs" data-act="amtAdd" data-arg="' + n + '">+' + (n >= 10000 ? n / 10000 + '만' : n / 1000 + '천') + '</button>').join('') + '</div>' +
    (cur ? '<div class="fld"><label>종류</label>' + chipsHtml('pay', [{ v: 'mine', l: '내 지출' }, { v: 'corp', l: '회사카드' }, { v: 'inv', l: '투자' }], vals.pay) + '</div>' : '') +
    '<div id="catwrap" style="display:' + (isCorp ? 'none' : 'block') + '">' + catArea(vals) + '</div>' +
    (cur ? '' : '<button type="button" class="foldrow" data-act="moreToggle" aria-expanded="false"><span>메모 · 날짜</span><span class="fsum">' + (d0 === t ? '오늘' : md(d0)) + '</span>' + CHEV + '</button>') +
    '<div id="morewrap" style="display:' + (cur ? 'block' : 'none') + '">' + field('메모 (선택)', 'f-memo', 'text', cur ? cur.memo : '', 'maxlength="40" placeholder="예: 점심 · 투자라면 종목 이름"') +
    field('날짜', 'f-date', 'date', d0, 'max="' + t + '"') + '<div class="chipsel qadd" role="group" aria-label="날짜 바로 고르기"><button type="button" class="cs" data-act="dateSet" data-arg="0">오늘</button><button type="button" class="cs" data-act="dateSet" data-arg="1">어제</button><button type="button" class="cs" data-act="dateSet" data-arg="2">그저께</button></div>' + (!cur && d0 !== t ? '<p class="fhint">마지막으로 입력한 날짜(' + md(d0) + ')로 맞춰 뒀어요.</p>' : '') + '</div>' +
    (cur ? '' : '<button type="button" class="btn" data-act="saveMore">저장하고 또 입력</button>') +
    (showNo ? '<button type="button" class="btn ghost" data-act="noSpend">오늘은 지출 없음</button>' : '') + (cur ? delBtn('exp|' + eid) : '') + ERR;
  openSheet(cur ? '지출 수정' : (vals.pay === 'inv' ? '투자 추가' : isCorp ? '회사카드 사용 추가' : '지출 추가'), body, () => {
    const d = val('f-date'), amt = readMoney('f-amt');
    if (!d || d > t) return setErr('날짜를 확인해 주세요.');
    if (!(amt > 0)) return setErr('금액을 입력해 주세요.');
    const rec = cur || { id: uid() }, pay = SHEET.vals.pay, c = pay !== 'mine';
    rec.d = d; rec.amt = amt; rec.memo = val('f-memo').trim();
    delete rec.corp; delete rec.inv;
    if (c) { rec[pay] = true; rec.cat = ''; delete rec.sub; }
    else { rec.cat = SHEET.vals.cat; if (SHEET.vals.sub) rec.sub = SHEET.vals.sub; else delete rec.sub; }
    if (!cur) { S.logs.exp.push(rec); S.lastExpDate = d; }
    if (SHEET.more) { commit(); toast('저장했어요'); render(); sheetMoney(undefined, corp); return; }
    done();
  }, { vals: vals, focus: !cur, onPick: grp => {
    if (grp === 'cat') { SHEET.vals.sub = ''; SHEET.vals.fold = catHasSub(SHEET.vals.cat); const w = byId('catwrap'); if (w) w.innerHTML = catArea(SHEET.vals); }
    if (grp === 'pay') { const w = byId('catwrap'); if (w) w.style.display = SHEET.vals.pay !== 'mine' ? 'none' : 'block'; }
  } });
}

/* ---- 수입 ---- */
function sheetIncome(eid) {
  const t = todayStr(), cur = eid ? S.logs.inc.find(x => x.id === eid) : null;
  if (eid && !cur) return;
  const body = mfield('금액 (원)', 'f-amt', cur ? cur.amt : '', 'placeholder="0"') +
    field('메모 (선택)', 'f-memo', 'text', cur ? cur.memo : '', 'maxlength="40" placeholder="예: 급여, 용돈"') +
    field('날짜', 'f-date', 'date', cur ? cur.d : t, 'max="' + t + '"') + (cur ? delBtn('inc|' + eid) : '') + ERR;
  openSheet(cur ? '수입 수정' : '수입 추가', body, () => {
    const d = val('f-date'), amt = readMoney('f-amt');
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
    '<div class="two">' + mfield('금액 (원)', 'f-amt', cur ? cur.amt : '', '') + field('매월 몇 일', 'f-day', 'number', cur ? cur.day : '', 'inputmode="numeric" step="1" min="1" max="31" placeholder="1~31"') + '</div>' +
    '<div class="fld"><label>카테고리</label>' + chipsHtml('cat', cats.map(c => ({ v: c.id, l: c.name })), vals.cat) + '</div>' +
    '<div class="fld" id="subwrap">' + subChips(vals.cat, vals.sub) + '</div>' +
    '<p class="fhint">정한 날이 되면 지출 내역에 자동으로 들어가요. 말일보다 큰 날짜는 그 달의 마지막 날에 들어가요.</p>' +
    (cur ? '<button type="button" class="btn ghost danger" data-act="delRec" data-arg="fixed|' + fid + '">고정 지출 삭제</button>' : '') + ERR;
  openSheet(cur ? '고정 지출 수정' : '고정 지출 추가', body, () => {
    const name = val('f-name').trim(), amt = readMoney('f-amt'), day = Math.round(parseFloat(val('f-day')));
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
    const was = !!rec.done;
    rec.text = text; rec.done = SHEET.vals.status === 'done';
    rec.doneAt = rec.done ? (was && rec.doneAt ? rec.doneAt : todayStr()) : null;
    if (!cur) S.settings.topics.push(rec);
    done();
  }, { vals: vals, focus: !cur });
}

/* ---- 성경 통독 ---- */
function sheetBible() {
  const bi = bibleInfo();
  if (!bi) return;
  const body = field('계획한 완독일', 'f-end', 'date', bi.b.end, 'min="' + todayStr() + '"') +
    '<p class="fhint">완독일을 바꾸면 남은 분량(하루치씩)이 이 날짜에 맞춰 다시 계산돼요. 읽은 기록은 그대로 남아요.</p>' + ERR;
  openSheet('성경 통독 수정', body, () => {
    const end = val('f-end');
    if (!end || end < todayStr()) return setErr('오늘 이후 날짜를 입력해 주세요.');
    setBibleEnd(end);
    done();
  }, { focus: false });
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
  const max = GOAL_MAXD[v.gper] || 31;
  let h = '<div class="fld"><label>기간</label>' + chipsHtml('gper', [{ v: 'day', l: '일간' }, { v: 'week', l: '주간' }, { v: 'month', l: '월간' }, { v: 'year', l: '연간' }], v.gper) + '</div>';
  if (v.gper !== 'day') h += '<div class="fld"><label>목표 방식</label>' + chipsHtml('gtype', [{ v: 'total', l: '합계 달성' }, { v: 'days', l: '며칠 이상 하기' }], v.gtype) + '</div>';
  if (v.gper !== 'day' && v.gtype === 'days') {
    h += '<div class="two">' + field(GOAL_LABEL[v.gper] + ' 며칠 (최대 ' + max + ')', 'f-gt', 'number', v.gt, 'inputmode="numeric" step="1" min="1" max="' + max + '" placeholder="예: 2"') + field('하루 최소 (' + esc(e.unit) + ')', 'f-gmin', 'number', v.gmin, 'inputmode="decimal" step="any" min="0" placeholder="예: 5"') + '</div>' +
      '<p class="fhint">예: ' + (v.gper === 'week' ? '주 2일, 하루 5km 이상 달리기' : v.gper === 'month' ? '한 달에 8일, 하루 5km 이상 달리기' : '1년에 100일, 하루 5km 이상 달리기') + '</p>';
  } else h += field(GOAL_LABEL[v.gper] + ' 목표 (' + esc(e.unit) + ')', 'f-gt', 'number', v.gt, 'inputmode="decimal" step="any" min="0" placeholder="예: ' + (v.gper === 'day' ? '3' : v.gper === 'week' ? '15' : v.gper === 'month' ? '60' : '700') + '"');
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
      if (target !== Math.round(target) || target > GOAL_MAXD[V.gper]) return setErr('며칠은 1~' + GOAL_MAXD[V.gper] + ' 사이 정수로 입력해 주세요.');
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
    mfield('월 예산 (원)', 'f-w', '', 'placeholder="150,000"') +
    field('세부 항목 (선택, 쉼표로 구분)', 'f-subs', 'text', '', 'placeholder="예: 식비, 주차비, 문화생활, 교통비"') + ERR;
  openSheet('카테고리 추가', body, () => {
    const name = val('f-name').trim(), w = readMoney('f-w');
    if (!name) return setErr('이름을 입력해 주세요.');
    S.settings.cats.push({ id: 'c' + uid(), name: name, monthly: w, subs: splitNames(val('f-subs')).map(n => ({ id: 's' + uid(), name: n })) });
    done('추가했어요');
  });
}
/* 카테고리 하나를 한 창에서 고쳐요 (이름·예산·세부 항목·삭제) */
function sheetCat(cid) {
  const c = S.settings.cats.find(x => x.id === cid);
  if (!c) return;
  const base = NAV.bmode !== 'month', ym = NAV.bm || monthOf(0);
  const body = field('이름', 'f-name', 'text', c.name, 'maxlength="12"') +
    mfield(base ? '기본 월 예산 (원)' : ymLabel(ym) + ' 예산 (원)', 'f-w', base ? c.monthly : budgetCat(c, ym), 'placeholder="0"') +
    (S.settings.subOn ? field('세부 항목 (쉼표로 구분)', 'f-subs', 'text', c.subs.map(x => x.name).join(', '), 'placeholder="예: 식비, 주차비"') : '') +
    '<button type="button" class="btn ghost danger" data-act="delCat" data-arg="' + c.id + '">이 카테고리 삭제</button>' + ERR;
  openSheet('카테고리 수정', body, () => {
    const name = val('f-name').trim(), w = readMoney('f-w');
    if (!name) return setErr('이름을 입력해 주세요.');
    c.name = name;
    if (base) c.monthly = w; else ensureBudget(ym).cats[c.id] = w;
    if (S.settings.subOn) { const old = c.subs; c.subs = splitNames(val('f-subs')).map(n => { const o = old.find(x => x.name === n); return o || { id: 's' + uid(), name: n }; }); }
    done();
  }, { focus: false });
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
function sheetAddWheel() {
  const body = field('항목 이름', 'f-name', 'text', '', 'maxlength="14" placeholder="예: 순종"') + ERR;
  openSheet('수레바퀴 항목 추가', body, () => {
    const name = val('f-name').trim();
    if (!name) return setErr('이름을 입력해 주세요.');
    S.settings.wheel.push({ id: 'w' + uid(), name: name, on: true });
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
function sheetBucket(bid) {
  const t = todayStr(), cur = bid ? S.bucket.find(x => x.id === bid) : null;
  if (bid && !cur) return;
  const vals = { when: cur ? whenOf(cur) : '올해', status: cur && cur.done ? 'done' : 'open' };
  const body = field('하고 싶은 일', 'f-title', 'text', cur ? cur.title : '', 'maxlength="60" placeholder="예: 하프마라톤 완주"') +
    field('기록한 날', 'f-added', 'date', cur ? (cur.addedAt || '') : t, 'max="' + t + '"') +
    '<div class="fld"><label>언제쯤?</label>' + chipsHtml('when', ['올해', '내년', '언젠가'].map(x => ({ v: x, l: x })), vals.when) + '</div>' +
    area('메모 (선택)', 'f-memo', cur ? cur.memo : '', 'maxlength="200" rows="3" placeholder="이유나 준비할 것을 적어 두세요"') +
    '<div class="fld"><label>상태</label>' + chipsHtml('status', [{ v: 'open', l: '진행 중' }, { v: 'done', l: '이뤘어요' }], vals.status) + '</div>' +
    '<div id="donewrap" style="display:' + (vals.status === 'done' ? 'block' : 'none') + '">' + field('이룬 날짜 (연도.월.일)', 'f-ddate', 'text', cur ? (cur.doneDate || (cur.doneAt ? cur.doneAt.replace(/-/g, '.') : t.replace(/-/g, '.'))) : t.replace(/-/g, '.'), 'inputmode="numeric" maxlength="10" autocomplete="off" data-inp="ddate" placeholder="예: 2020.07.06 (월·일을 몰라도 돼요)"') + '</div>' +
    (cur ? delBtn('bucket|' + bid) : '') + ERR;
  openSheet(cur ? '버킷리스트 수정' : '버킷리스트 추가', body, () => {
    const title = val('f-title').trim();
    if (!title) return setErr('내용을 입력해 주세요.');
    const V = SHEET.vals;
    const rec = cur || { id: 'b' + uid() };
    rec.title = title; rec.memo = val('f-memo').trim(); rec.when = V.when; delete rec.link; delete rec.autoSeen;
    rec.addedAt = val('f-added') || (cur ? cur.addedAt || null : t);
    rec.done = V.status === 'done';
    if (rec.done) {
      const d = String(val('f-ddate')).replace(/\D/g, ''), ty = +t.slice(0, 4), y = +d.slice(0, 4), mo = d.length >= 6 ? +d.slice(4, 6) : 0, dy = d.length === 8 ? +d.slice(6, 8) : 0;
      if (!(d.length === 4 || d.length === 6 || d.length === 8) || !(y >= 1900 && y <= ty) || (d.length >= 6 && !(mo >= 1 && mo <= 12)) || (d.length === 8 && !(dy >= 1 && dy <= 31))) return setErr('연도 4자리, 필요하면 월·일까지 입력해 주세요. 예: 2020.07.06');
      rec.doneYear = y;
      rec.doneDate = d.slice(0, 4) + (d.length >= 6 ? '.' + d.slice(4, 6) : '') + (d.length === 8 ? '.' + d.slice(6, 8) : '');
      rec.doneAt = y + '-' + (mo ? PAD(mo) : '01') + '-' + (dy ? PAD(dy) : '01');
    } else { rec.doneAt = null; rec.doneYear = null; rec.doneDate = null; }
    if (!cur) { rec.no = S.bucket.reduce((m, x) => Math.max(m, x.no || 0), 0) + 1; S.bucket.push(rec); }
    done();
  }, { vals: vals, focus: !cur, onPick: grp => {
    if (grp === 'status') showDone(SHEET.vals.status);
  } });
}

/* ---- 위시리스트 ---- */
function sheetWish(wid) {
  const t = todayStr(), cur = wid ? S.wish.find(x => x.id === wid) : null;
  if (wid && !cur) return;
  const vals = { prio: cur && cur.prio === '높음' ? '높음' : '보통', status: cur && cur.done ? 'done' : 'open' };
  const body = field('갖고 싶은 것', 'f-title', 'text', cur ? cur.name : '', 'maxlength="60" placeholder="예: 러닝화"') +
    mfield('예상 가격 (원, 선택)', 'f-price', cur && cur.price ? cur.price : '', 'placeholder="0"') +
    '<div class="fld"><label>우선순위</label>' + chipsHtml('prio', ['높음', '보통'].map(x => ({ v: x, l: x })), vals.prio) + '</div>' +
    field('링크 (선택)', 'f-link', 'url', cur ? cur.link : '', 'maxlength="300" placeholder="https://"') +
    area('메모 (선택)', 'f-memo', cur ? cur.memo : '', 'maxlength="200" rows="3" placeholder="사려는 이유, 색상, 사이즈 등"') +
    '<div class="fld"><label>상태</label>' + chipsHtml('status', [{ v: 'open', l: '갖고 싶어요' }, { v: 'done', l: '구입했어요' }], vals.status) + '</div>' +
    '<div id="donewrap" style="display:' + (vals.status === 'done' ? 'block' : 'none') + '">' + field('구입한 날', 'f-date', 'date', cur && cur.doneAt ? cur.doneAt : t, 'max="' + t + '"') + '</div>' +
    (cur ? delBtn('wish|' + wid) : '') + ERR;
  openSheet(cur ? '위시리스트 수정' : '위시리스트 추가', body, () => {
    const name = val('f-title').trim(), price = readMoney('f-price'), link = val('f-link').trim();
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
    mfield('금액 (원)', 'f-amt', it.price, '') +
    '<div class="fld"><label>카테고리</label>' + chipsHtml('cat', cats.map(c => ({ v: c.id, l: c.name })), vals.cat) + '</div>' + ERR;
  openSheet('가계부에 기록할까요?', body, () => {
    const amt = readMoney('f-amt');
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
  out.settings.wheel.forEach(w => { const o = O.settings.wheel.find(x => x.id === w.id); if (o) w.name = w.name || o.name; });
  unionById(out.settings.wheel, O.settings.wheel);
  Object.keys(O.logs.wheel).forEach(d => { out.logs.wheel[d] = Object.assign({}, O.logs.wheel[d], out.logs.wheel[d]); });
  Object.keys(O.logs.bible).forEach(d => { out.logs.bible[d] = Math.max(out.logs.bible[d] || 0, O.logs.bible[d]); });
  if (!out.settings.bible && O.settings.bible) out.settings.bible = O.settings.bible;
  ['sleep', 'nospend'].forEach(k => Object.keys(O.logs[k]).forEach(d => { if (!(d in out.logs[k])) out.logs[k][d] = O.logs[k][d]; }));
  Object.keys(O.logs.faith).forEach(d => {
    const n = out.logs.faith[d], o = O.logs.faith[d];
    out.logs.faith[d] = n ? Object.assign({}, o, n, { done: Object.assign({}, o.done, n.done) }) : o;
  });
  unionById(out.bucket, O.bucket); unionById(out.wish, O.wish); unionById(out.plans, O.plans); unionById(out.todos, O.todos); unionById(out.reminders, O.reminders); unionById(out.sched, O.sched); unionById(out.someday, O.someday);
  out.todos.forEach(x => { const o = O.todos.find(y => y.id === x.id); if (o) { x.dn = Object.assign({}, o.dn, x.dn); x.sk = Object.assign({}, o.sk, x.sk); x.cnt = Object.assign({}, o.cnt, x.cnt); x.nt = Object.assign({}, o.nt, x.nt); } });
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
    if (p[0] === 'yearly') { NAV.gper = 'year'; NAV.yoff = 0; p[0] = 'goals'; } else if (p[0] === 'someday') { NAV.gper = 'someday'; p[0] = 'goals'; }
    NAV.route = p[0]; NAV.arg = p[1] || null;
    if (['ex', 'sleep', 'money', 'faith'].indexOf(p[0]) >= 0) NAV.range = 'week';
    if (p[0] === 'review') NAV.roff = 0;
    if (p[0] === 'cal') NAV.cal = { ym: '', sel: '' };
    if (p[0] === 'goals') NAV.goff = 0;
    if (p[0] === 'bucket') NAV.bq = '';
    if (p[0] === 'yearly') NAV.yoff = 0;
    if (p[0] === 'mstat') NAV.stat = '';
    if (p[0] === 'money') { NAV.lm = ''; NAV.im = ''; }
    if (p[0] === 'faith') NAV.fw = 0;
    if (p[0] === 'faith') setTimeout(maybeAskFaithReset, 250);
    if (p[0] === 'settings') NAV.bm = '';
    render(true);
  },
  back() {
    const t = NAV.stack.pop() || { route: 'cats', arg: null };
    NAV.route = t.route; NAV.arg = t.arg;
    render(true);
  },
  mmMonth(arg) { NAV.mm = monthShift(moneyMonth(), Number(arg)); NAV.mq = ''; render(); },
  budgetEdit(arg) { numSheet(ymLabel(arg) + ' 예산', '금액 (원)', budgetTotal(arg), v => { ensureBudget(arg).total = clamp(v, 0, 50000000); }); },
  moreToggle(arg, el) { const w = byId('morewrap'); if (!w) return; const open = w.style.display === 'none'; w.style.display = open ? 'block' : 'none'; el.setAttribute('aria-expanded', String(open)); el.classList.toggle('open', open); },
  saveMore() { if (!SHEET || !SHEET.onSave) return; SHEET.more = true; SHEET.onSave(); if (SHEET) SHEET.more = false; },
  noop() {},
  catView(arg) { S.settings.catView = arg; S.settings.showBudget = arg !== 'none'; commit(); render(); },
  tgBudget() { S.settings.showBudget = !(S.settings.showBudget !== false); commit(); render(); },
  catAll() { NAV.catAll = !NAV.catAll; render(); },
  moneyTab(arg) { NAV.mt = arg; render(); },
  amtAdd(arg) { const v = (readMoney('f-amt') || 0) + Number(arg), el = byId('f-amt'); if (el) { el.value = fmtN(v, 0); el.focus(); } },
  dateSet(arg) { const el = byId('f-date'); if (el) el.value = addDays(todayStr(), -Number(arg)); },
  catUnfold() { if (!SHEET) return; SHEET.vals.fold = false; const w = byId('catwrap'); if (w) w.innerHTML = catArea(SHEET.vals); },
  toggleCat(arg) { NAV.open[arg] = !NAV.open[arg]; render(); },
  toggleAll(arg) { NAV.open['all:' + arg] = !NAV.open['all:' + arg]; render(); },
  range(arg) { NAV.range = arg; NAV.exall = false; render(); },
  exAll() { NAV.exall = true; render(); },
  runMetric(arg) { NAV.rm = arg; render(); },
  gpick(arg) { NAV.arg = arg; render(); },
  week(arg) { NAV.roff = Math.max(0, (NAV.roff || 0) + Number(arg)); render(); },
  logEx(arg) { sheetLogEx(arg); },
  addTodo() { sheetTodo(); }, editTodo(arg) { sheetTodo(arg); },
  todoTg(arg) {
    const x = S.todos.find(y => y.id === arg), t = dayStr();
    if (!x) return;
    const ln = x.link ? todoLinkName(x.link) : '';
    if (todoCounted(x)) {
      x.cnt = x.cnt || {};
      const c = todoCount(x, t);
      if (c >= x.target) { x.cnt[t] = c - 1; if (!x.daily) { x.done = false; x.doneAt = null; } }
      else { x.cnt[t] = c + 1; if (!x.daily && x.cnt[t] >= x.target) { x.done = true; x.doneAt = t; } }
      if (!x.cnt[t]) delete x.cnt[t];
      commit(); render(); return;
    }
    if (ln && x.link.k === 'wheel') { ACT.wheelCell(x.link.id + '|' + t); return; }
    if (ln) {
      if (todoLinkDone(x.link)) { toast('기록이 있어서 완료예요'); return; }
      const l = x.link;
      if (l.k === 'ex') sheetLogEx(l.id); else if (l.k === 'sleep') sheetSleep(t); else if (l.k === 'money') sheetMoney(); else sheetFaith();
      return;
    }
    if (x.daily) { x.dn = x.dn || {}; if (x.dn[t]) delete x.dn[t]; else x.dn[t] = true; }
    else { x.done = !x.done; x.doneAt = x.done ? t : null; }
    commit(); render();
  },
  typeNum(arg, el) {
    const i = arg.indexOf('|'), kind = arg.slice(0, i), q = arg.slice(i + 1).split('|'), cur = el && el.getAttribute('data-v');
    if (kind === 'stepEx') { const e = S.settings.exercises.find(x => x.id === q[0]); if (e) numSheet(e.name + ' 주간 목표', '주간 목표 (' + e.unit + ')', cur, v => { e[q[1]] = clamp(v, Number(q[3]), Number(q[4])); }); }
    else if (kind === 'stepSet') { const key = q[0]; numSheet(key === 'sleepGoal' ? '목표 수면 시간' : '월 예산', key === 'sleepGoal' ? '시간 (예: 7.5)' : '금액 (원)', cur, v => { S.settings[key] = clamp(v, Number(q[2]), Number(q[3])); }); }
    else if (kind === 'stepBudget') { const ym = NAV.bm || monthOf(0); numSheet(ymLabel(ym) + ' 예산', '금액 (원)', cur, v => { ensureBudget(ym).total = clamp(v, 0, 50000000); }); }
  },
  planNum(arg) { const x = S.plans.find(y => y.id === arg); if (x) numSheet(x.title, '지금까지 한 양' + (x.unit ? ' (' + x.unit + ')' : ''), x.cur, v => { x.cur = v; x.doneAt = planDone(x) ? todayStr() : null; }); },
  todoNum(arg) {
    const x = S.todos.find(y => y.id === arg), t = dayStr();
    if (x) numSheet(x.title, '오늘 한 횟수', todoCount(x, t), v => { x.cnt = x.cnt || {}; const n = Math.round(v); if (n) x.cnt[t] = n; else delete x.cnt[t]; if (!x.daily) { x.done = n >= x.target; x.doneAt = x.done ? t : null; } });
  },
  bibleNum() { numSheet('오늘 읽은 분량', '오늘 읽은 분량 (일치)', S.logs.bible[todayStr()] || 0, v => { const t = todayStr(), n = Math.round(v); if (n) S.logs.bible[t] = n; else delete S.logs.bible[t]; }); },
  addRem() { sheetRem(); },
  addSch() { sheetSch(); },
  editSch(arg) { sheetSch(arg); },
  schDay(arg) { NAV.sd = arg; render(); },
  schDays(arg, el) { if (!SHEET) return; const n = Number(arg), b = SHEET.vals.days, i = b.indexOf(n); if (i >= 0) b.splice(i, 1); else b.push(n); el.classList.toggle('on', i < 0); el.setAttribute('aria-pressed', String(i < 0)); },
  remDone(arg) { const x = S.reminders.find(y => y.id === arg); if (x) { x.done = true; x.doneAt = todayStr(); commit(); toast('완료했어요'); render(); } },
  remSnooze(arg) { sheetSnooze(arg); },
  snzPick(arg) { const el = byId('f-snz'); if (el) el.value = arg; },
  togBefore(arg, el) {
    if (!SHEET) return;
    const n = Number(arg), b = SHEET.vals.before, i = b.indexOf(n);
    if (i >= 0) b.splice(i, 1); else b.push(n);
    el.classList.toggle('on', i < 0); el.setAttribute('aria-pressed', String(i < 0));
  },
  toggleLink(arg, el) { const w = byId('linkpanel'); if (!w) return; const open = w.style.display === 'none'; w.style.display = open ? 'block' : 'none'; el.setAttribute('aria-expanded', String(open)); el.classList.toggle('open', open); },
  todoNote(arg) {
    const x = S.todos.find(y => y.id === arg), t = dayStr();
    if (!x) return;
    openSheet(x.title + ' · 비고', field('비고 (오늘만 보여요, 내일이면 비워져요)', 'f-note', 'text', (x.nt && x.nt[t]) || '', 'maxlength="60" placeholder="예: 5km 천천히"') + ERR, () => {
      x.nt = x.nt || {}; const v = val('f-note').trim();
      if (v) x.nt[t] = v; else delete x.nt[t];
      done();
    });
  },
  todoSkipSheet(arg) { ACT.todoSkip(arg); closeSheet(); },
  todoSkip(arg) { const x = S.todos.find(y => y.id === arg), t = dayStr(); if (!x) return; x.sk = x.sk || {}; if (x.sk[t]) delete x.sk[t]; else x.sk[t] = true; commit(); render(); },
  todoSeed() {
    const st = S.settings, add = (title, link) => S.todos.push({ id: 'td' + uid(), title: title, link: link, daily: true, d: dayStr(), done: false, doneAt: null, dn: {} });
    if (st.show.exercise) st.exercises.forEach(e => add(e.name, { k: 'ex', id: e.id }));
    if (st.show.sleep) add('수면 기록', { k: 'sleep' });
    if (st.show.money) add('가계부 쓰기', { k: 'money' });
    if (st.show.faith) st.wheel.filter(w => w.on).forEach(w => add(w.name, { k: 'wheel', id: w.id }));
    commit(); toast('추천 할 일을 넣었어요'); render();
  },
  addPlan() { sheetPlan(); }, editPlan(arg) { sheetPlan(arg); },
  planPer(arg) { NAV.gper = arg; NAV.goff = 0; if (arg === 'year') NAV.yoff = 0; render(); },
  planOff(arg) { if (curPlan().per === 'year') NAV.yoff = Math.max(-3, (NAV.yoff || 0) + Number(arg)); else NAV.goff = Math.max(-3, (NAV.goff || 0) + Number(arg)); render(); },
  goPlan(arg) { NAV.gper = arg; ACT.go('goals'); },
  planTg(arg) {
    const x = S.plans.find(y => y.id === arg);
    if (!x) return;
    if (planFailed(x)) { x.failed = false; x.failedAt = null; commit(); render(); return; }
    if (planDone(x)) { if (x.target > 0) x.cur = 0; else x.done = false; x.doneAt = null; commit(); render(); return; }
    sheetPlanDate(x, 'done');
  },
  planFail(arg) {
    const x = S.plans.find(y => y.id === arg);
    if (!x) return;
    if (planFailed(x)) { x.failed = false; x.failedAt = null; commit(); closeSheet(); render(); } else sheetPlanDate(x, 'fail');
  },
  planDot(arg) { const p = arg.split('|'), x = S.plans.find(y => y.id === p[0]); if (!x) return; const n = Number(p[1]); x.cur = x.cur === n ? n - 1 : n; x.doneAt = planDone(x) ? todayStr() : null; commit(); render(); },
  planStep(arg) { const p = arg.split('|'), x = S.plans.find(y => y.id === p[0]); if (!x) return; x.cur = Math.max(0, x.cur + Number(p[1])); x.doneAt = planDone(x) ? todayStr() : null; commit(); render(); },
  planCarry() {
    const cp = curPlan(), per = cp.per, pk = planKey(per, cp.off), prev = plansFor(per, planKey(per, cp.off + 1)).filter(x => !planDone(x));
    prev.forEach(x => S.plans.push({ id: 'p' + uid(), period: per, pk: pk, title: x.title, target: x.target, unit: x.unit, cur: 0, done: false, doneAt: null }));
    commit(); toast(prev.length + '개 가져왔어요'); render();
  },
  logSleepPast() { const t = todayStr(); let d = addDays(t, -1); while (S.logs.sleep[d] && d > addDays(t, -60)) d = addDays(d, -1); sheetSleep(d); },
  logSleep(arg) { sheetSleep(arg || todayStr()); },
  logMoney() { sheetMoney(); },
  faithCell(arg) {
    const p = arg.split('|'), it = S.settings.faith.find(f => f.id === p[0]), d = p[1];
    if (!it || !d || d > todayStr()) return;
    if (it.track === 'bible') { if ((S.logs.bible[d] || 0) > 0) delete S.logs.bible[d]; else S.logs.bible[d] = 1; }
    else { const r = S.logs.faith[d] = S.logs.faith[d] || {}; r.done = r.done || {}; r.done[it.id] = !faithDone(d, it); }
    commit(); render();
  },
  wheelCell(arg) {
    const p = arg.split('|'), d = p[1];
    if (!S.settings.wheel.some(w => w.id === p[0]) || !d || d > todayStr()) return;
    const r = S.logs.wheel[d] = S.logs.wheel[d] || {};
    if (r[p[0]]) delete r[p[0]]; else r[p[0]] = true;
    if (!Object.keys(r).length) delete S.logs.wheel[d];
    commit(); render();
  },
  resetFaith() { confirmSheet('신앙 기록 초기화', '신앙 기록(체크, 수레바퀴의 삶, 메모, 기도 제목, 성경 통독 기록)이 모두 지워져요. 항목 이름과 설정은 그대로예요. 되돌릴 수 없어요.', '초기화', () => { resetFaithData(); closeSheet(); toast('신앙 기록을 초기화했어요'); render(true); }); },
  tgWheel(arg) { const w = S.settings.wheel.find(x => x.id === arg); if (w) { w.on = !w.on; commit(); render(); } },
  delWheel(arg) { S.settings.wheel = S.settings.wheel.filter(x => x.id !== arg); commit(); render(); },
  addWheel() { sheetAddWheel(); },
  fweek(arg) { NAV.fw = Math.max(0, (NAV.fw || 0) + Number(arg)); render(); },
  bibleAdd(arg) { const t = todayStr(), n = Math.max(0, (S.logs.bible[t] || 0) + Number(arg)); if (n) S.logs.bible[t] = n; else delete S.logs.bible[t]; commit(); render(); },
  editBible() { sheetBible(); },
  toggleAns() { NAV.open.answered = !NAV.open.answered; render(); },
  logCorp() { sheetMoney(undefined, true); },
  logInv() { sheetMoney(undefined, 'inv'); },
  cmpCat(arg) { const st = S.settings, cur = st.cmpCats.length ? st.cmpCats.slice() : Object.keys(monthData(NAV.stat || monthOf(0)).byCat).filter(id => id !== '__etc').sort((a, b) => monthData(NAV.stat || monthOf(0)).byCat[b] - monthData(NAV.stat || monthOf(0)).byCat[a]).slice(0, 2), i = cur.indexOf(arg); if (i >= 0) cur.splice(i, 1); else cur.push(arg); st.cmpCats = cur; commit(); render(); },
  imMonth(arg) { NAV.im = monthShift(NAV.im || monthOf(0), Number(arg)); render(); },
  lmMonth(arg) { NAV.lm = monthShift(NAV.lm || monthOf(0), Number(arg)); render(); },
  editCat(arg) { sheetCat(arg); },
  logFaith() { sheetFaith(); },
  check(arg) {
    const t = todayStr(), p = arg.split(':');
    if (p[0] === 'ex') sheetLogEx(p[1]);
    else if (p[0] === 'sleep') sheetSleep(t);
    else if (p[0] === 'money') sheetMoney();
    else if (p[0] === 'faith') {
      ACT.faithCell(p[1] + '|' + t);
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
    else if (p[0] === 'rem') sheetRem(p[1]);
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
  bucketFilter(arg) { NAV.bf = arg; render(); },
  bucketNum(arg) { const p = arg.split('|'); numSheet('번호 바꾸기', '고유번호 (이미 쓰는 번호면 서로 바꿔요)', p[1], v => bucketSetNo(p[0], Math.max(1, Math.round(v)))); },
  addBucket() { sheetBucket(); }, editBucket(arg) { sheetBucket(arg); },
  addSd() { sheetSomeday(); }, editSd(arg) { sheetSomeday(arg); }, moveSd(arg) { sheetSdMove(arg); },
  sdTg(arg) { const x = S.someday.find(y => y.id === arg); if (!x) return; if (x.done) { x.done = false; x.doneAt = null; commit(); render(); } else sheetSdDate(x); },
  sdPull(arg) { const x = S.someday.find(y => y.id === arg); if (!x) return; const cp = curPlan(); S.plans.push({ id: 'p' + uid(), period: cp.per, pk: planKey(cp.per, cp.off), title: x.title, target: 0, unit: '', cur: 0, done: false, doneAt: null }); S.someday = S.someday.filter(y => y.id !== x.id); commit(); toast('목표로 가져왔어요'); render(); },
  sdTo(arg) {
    const p = arg.split('|'), x = S.someday.find(y => y.id === p[0]), k = p[1];
    if (!x) return;
    if (k === 'today') S.todos.push({ id: 'td' + uid(), title: x.title, link: null, daily: false, every: 0, d: dayStr(), done: false, doneAt: null, dn: {}, target: 0 });
    else { const per = k.replace(/-?\d+$/, ''), off = Number(k.slice(per.length)) || 0; S.plans.push({ id: 'p' + uid(), period: per, pk: planKey(per, off), title: x.title, target: 0, unit: '', cur: 0, done: false, doneAt: null }); }
    S.someday = S.someday.filter(y => y.id !== x.id);
    commit(); closeSheet(); toast('옮겼어요: ' + (SD_TARGETS.find(t => t[0] === k) || [0, ''])[1]); render();
  },
  addWish() { sheetWish(); }, editWish(arg) { sheetWish(arg); },
  tgBucket(arg) {
    const it = S.bucket.find(x => x.id === arg);
    if (!it) return;
    if (!it.done) { sheetAchieve(it); return; }
    it.done = false; it.doneAt = null; it.doneYear = null; it.doneDate = null;
    commit(); toast('다시 진행 중으로 바꿨어요'); render();
  },
  bucketSort(arg) { NAV.bsort = arg; render(); },
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
    else if (p[0] === 'rem') S.reminders = S.reminders.filter(x => x.id !== p[1]);
    else if (p[0] === 'sch') S.sched = S.sched.filter(x => x.id !== p[1]);
    else if (p[0] === 'sd') S.someday = S.someday.filter(x => x.id !== p[1]);
    else if (p[0] === 'todo') S.todos = S.todos.filter(x => x.id !== p[1]);
    else if (p[0] === 'plan') S.plans = S.plans.filter(x => x.id !== p[1]);
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
  fontSize(arg) { FONT_SIZE = arg; try { localStorage.setItem(FS_KEY, arg); } catch (e) { /* ignore */ } applyFont(); render(); },
  layoutPref(arg) { LAYOUT_PREF = arg; try { localStorage.setItem(LAYOUT_KEY, arg); } catch (e) { /* ignore */ } render(); },
  theme(arg) { S.theme = arg; applyTheme(); commit(); render(); },
  tgSub() { S.settings.subOn = !S.settings.subOn; commit(); render(); },
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
  money(arg, el) { const d = String(el.value).replace(/[^0-9]/g, '').replace(/^0+(?=\d)/, ''), f = d ? fmtN(Number(d), 0) : ''; if (f !== el.value) el.value = f; },
  timeFmt(arg, el) { const d = String(el.value).replace(/\D/g, '').slice(0, 4), f = d.length > 2 ? d.slice(0, 2) + ':' + d.slice(2) : d; if (f !== el.value) el.value = f; },
  year(arg, el) { const c = String(el.value).replace(/\D/g, '').slice(0, 4); if (c !== el.value) el.value = c; },
  ddate(arg, el) { const d = String(el.value).replace(/\D/g, '').slice(0, 8), f = d.length > 6 ? d.slice(0, 4) + '.' + d.slice(4, 6) + '.' + d.slice(6) : d.length > 4 ? d.slice(0, 4) + '.' + d.slice(4) : d; if (f !== el.value) el.value = f; },
  msearch(arg, el) { NAV.mq = el.value; const r = byId('mres'); if (r) r.innerHTML = moneyRows(moneyMonth(), NAV.mq); },
  bsearch(arg, el) { NAV.bq = el.value; const r = byId('bres'); if (r) r.innerHTML = bucketBody(); },
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
  sleepDate(arg, v) {
    if (!v || v > todayStr() || !SHEET) return;
    sheetSleep(v, { bed: parseHM(val('f-bed')) || '23:30', wake: parseHM(val('f-wake')) || '07:00', score: SHEET.vals.score });
  },
  timeNorm(arg, v, el) { const n = parseHM(v); if (n && el) el.value = n; },
  tdNote(arg, v) { const x = S.todos.find(y => y.id === arg), t = dayStr(); if (!x) return; x.nt = x.nt || {}; const n = String(v).trim(); if (n) x.nt[t] = n; else delete x.nt[t]; commit(); render(); },
  renWheel(arg, v) { const w = S.settings.wheel.find(x => x.id === arg); if (w && v.trim()) w.name = v.trim(); commit(); render(); },
  renFaith(arg, v) { const f = S.settings.faith.find(x => x.id === arg); if (f && v.trim()) f.name = v.trim(); commit(); render(); }
};

function applyTheme() {
  const r = document.documentElement;
  if (S.theme === 'dark' || S.theme === 'light') r.setAttribute('data-theme', S.theme); else r.removeAttribute('data-theme');
}
const FS_KEY = 'selfapp.fs';
let FONT_SIZE = 'sm';
function applyFont() { document.documentElement.setAttribute('data-fs', FONT_SIZE); }
function loadFont() { try { const v = localStorage.getItem(FS_KEY); if (v === 'sm' || v === 'lg' || v === 'xl' || v === 'md') FONT_SIZE = v; } catch (e) { /* 기본값 사용 */ } applyFont(); }
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
  const cur = NAV.route, tab = TAB_OF[cur];
  const on = r => r === cur || (r === 'cats' && tab === 'cats') || (r === 'growth' && cur === 'growthd');
  const item = (r, t, ic) => '<a href="#" class="' + (on(r) ? 'on' : '') + '" data-act="go" data-arg="' + r + '" data-tab="' + r + '"' + (on(r) ? ' aria-current="page"' : '') + '>' + ico(ic, 22, 1.8) + t + '</a>';
  return '<div class="sbrand">Growth</div>' + item('today', '오늘', 'today') + item('cal', '캘린더', 'cal') + item('cats', '기록', 'grid') + item('growth', 'Growth', 'trend') + item('review', '리뷰', 'review') + '<div class="sgrow"></div>' + item('settings', '설정', 'gear');
}
function render(top) {
  LAYOUT = applyLayout();
  const fixedChanged = applyFixed(), bib = ensureBible(), tdc = syncTodos(), bks = importBucketSeed(), bno = ensureBucketNos();
  if (fixedChanged || bib || tdc || bks || bno) commit();
  if (bks) toast(bks === 'new' ? '버킷리스트 ' + S.bucket.length + '개를 넣었어요' : bks === 'ko' ? '버킷리스트를 한국어로 바꿨어요' : '이룬 날짜를 정리했어요');
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
  loadFont();
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

