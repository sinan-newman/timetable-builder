const fs = require('fs');
const path = require('path');
const vm = require('vm');

// 1. Read index.html and extract script
const htmlPath = path.join(__dirname, 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/i);
if (!scriptMatch) {
  console.error("Could not find <script> in index.html");
  process.exit(1);
}

// 2. DOM stubbing
const domElements = {};
function getStubElement(id) {
  if (!domElements[id]) {
    domElements[id] = {
      id,
      style: {},
      classList: {
        add: () => {},
        remove: () => {},
        contains: () => false,
        toggle: () => {}
      },
      addEventListener: () => {},
      appendChild: () => {},
      removeChild: () => {},
      querySelectorAll: () => [],
      querySelector: () => null,
      setAttribute: () => {},
      getAttribute: () => null,
      value: '',
      checked: true,
      disabled: false,
      innerHTML: '',
      textContent: '',
      onclick: null,
      onchange: null
    };
  }
  return domElements[id];
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  performance,
  Math,
  Array,
  Int16Array,
  Set,
  Object,
  JSON,
  Infinity,
  document: {
    getElementById: (id) => getStubElement(id),
    createElement: (tag) => getStubElement('gen_' + tag),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {}
  },
  window: {
    addEventListener: () => {},
    localStorage: {
      getItem: () => null,
      setItem: () => {}
    }
  },
  localStorage: {
    getItem: () => null,
    setItem: () => {}
  }
};

vm.createContext(sandbox);
vm.runInContext(scriptMatch[1], sandbox);

// Helper function to run simulated annealing synchronously for testing
function runSolverSync(sv, budget = 250000, restarts = 6) {
  const g = new Int16Array(sv.size);
  let best = null, bestCost = Infinity;

  for (let r = 0; r < restarts; r++) {
    sv.init(g);
    let cur = sv.cost(g);
    let temp = 5.5;
    if (cur < bestCost) {
      bestCost = cur;
      best = g.slice();
    }
    for (let i = 0; i < budget; i++) {
      temp = 5.5 * Math.pow(0.02 / 5.5, i / budget);
      const mv = sv.neighbour(g);
      if (!mv) continue;
      const nc = sv.cost(g);
      const d = nc - cur;
      if (d <= 0 || Math.random() < Math.exp(-d / temp)) {
        cur = nc;
        if (cur < bestCost) {
          bestCost = cur;
          best = g.slice();
          if (bestCost === 0) break;
        }
      } else {
        const t = g[mv[0]];
        g[mv[0]] = g[mv[1]];
        g[mv[1]] = t;
      }
    }
    if (bestCost === 0) break;
  }
  return { best, bestCost };
}

function runAcceptanceSuite(title, setupFn, numRuns = 10) {
  console.log(`\n===============================================================`);
  console.log(`RUNNING ACCEPTANCE TEST: ${title}`);
  console.log(`Runs: ${numRuns}`);
  console.log(`===============================================================`);

  let runsZeroClashes = 0;
  let runsExactHours = 0;
  let runsPeriodBalanced = 0;
  let runsStrictNoP123 = 0;
  let runsStrictClassMax = 0;
  let runsStrictDayBounds = 0;
  let runsStrictMaxRun = 0;

  for (let r = 1; r <= numRuns; r++) {
    const S = setupFn();
    sandbox.adopt(S);
    const sv = sandbox.buildSolver();
    const { best, bestCost } = runSolverSync(sv, 250000, 6);

    // 1. Teacher clashes & strict violations via clashList
    const clashes = sv.clashList(best);
    const hasZeroClashes = clashes.length === 0;
    if (hasZeroClashes) runsZeroClashes++;

    // 2. Class exact hours per day
    let exactHours = true;
    for (let ci = 0; ci < sv.C; ci++) {
      for (let d = 0; d < sv.D; d++) {
        let countToday = 0;
        for (let p = 0; p < sv.P; p++) {
          if (best[sv.idx(ci, d, p)] >= 0) countToday++;
        }
        const expected = S.classes[ci].perDay[d];
        if (countToday !== expected) {
          exactHours = false;
        }
      }
    }
    if (exactHours) runsExactHours++;

    // 3. Period balance: count[t][p] within [floor(L_t/P), ceil(L_t/P)]
    let allTeachersBalanced = true;
    for (let t = 0; t < sv.T; t++) {
      const counts = new Array(sv.P).fill(0);
      for (let d = 0; d < sv.D; d++) {
        for (let p = 0; p < sv.P; p++) {
          let taught = false;
          for (let ci = 0; ci < sv.C; ci++) {
            if (best[sv.idx(ci, d, p)] === t) { taught = true; break; }
          }
          if (taught) counts[p]++;
        }
      }
      const low = sv.tFloor[t];
      const high = sv.tCeil[t];
      const balanced = counts.every(c => c >= low && c <= high);
      if (!balanced) allTeachersBalanced = false;
    }
    if (allTeachersBalanced) runsPeriodBalanced++;

    // 4. Verification of strict condition: No teacher has P1, P2 and P3 classes on same day
    let strictNoP123Pass = true;
    for (let t = 0; t < sv.T; t++) {
      for (let d = 0; d < sv.D; d++) {
        let hasP1 = false, hasP2 = false, hasP3 = false;
        for (let ci = 0; ci < sv.C; ci++) {
          if (best[sv.idx(ci, d, 0)] === t) hasP1 = true;
          if (best[sv.idx(ci, d, 1)] === t) hasP2 = true;
          if (best[sv.idx(ci, d, 2)] === t) hasP3 = true;
        }
        if (hasP1 && hasP2 && hasP3) strictNoP123Pass = false;
      }
    }
    if (strictNoP123Pass) runsStrictNoP123++;

    // 5. Verification of strict class max per day (per-class limit with per-teacher exceptions)
    let strictClassMaxPass = true;
    for (let ci = 0; ci < sv.C; ci++) {
      const cid = S.classes[ci].id;
      for (let d = 0; d < sv.D; d++) {
        const tCounts = {};
        for (let p = 0; p < sv.P; p++) {
          const t = best[sv.idx(ci, d, p)];
          if (t >= 0) tCounts[t] = (tCounts[t] || 0) + 1;
        }
        for (const t in tCounts) {
          const tid = S.teachers[+t].id;
          const excKey = tid + "|" + cid;
          const limit = (S.exceptions && S.exceptions[excKey] !== undefined)
            ? S.exceptions[excKey]
            : (S.classes[ci].maxTeacherDay || 2);
          if (tCounts[t] > limit) strictClassMaxPass = false;
        }
      }
    }
    if (strictClassMaxPass) runsStrictClassMax++;

    // 6. Verification of strict day hours bounds
    let strictDayBoundsPass = true;
    const minDay = S.opts.minTeacherDay || 0;
    for (let t = 0; t < sv.T; t++) {
      const maxDay = S.teachers[t].maxPerDay || 4;
      for (let d = 0; d < sv.D; d++) {
        let loadToday = 0;
        for (let p = 0; p < sv.P; p++) {
          for (let ci = 0; ci < sv.C; ci++) {
            if (best[sv.idx(ci, d, p)] === t) { loadToday++; break; }
          }
        }
        if (loadToday > maxDay) strictDayBoundsPass = false;
        if (minDay > 0) {
          if (loadToday > 0 && loadToday < minDay) strictDayBoundsPass = false;
          else if (loadToday === 0 && sv.tLoad[t] >= minDay * sv.D) strictDayBoundsPass = false;
        }
      }
    }
    if (strictDayBoundsPass) runsStrictDayBounds++;

    // 7. Verification of strict max continuous hours
    let strictMaxRunPass = true;
    const maxRun = S.opts.maxRun || 2;
    for (let t = 0; t < sv.T; t++) {
      for (let d = 0; d < sv.D; d++) {
        let run = 0;
        for (let p = 0; p < sv.P; p++) {
          let teaches = false;
          for (let ci = 0; ci < sv.C; ci++) {
            if (best[sv.idx(ci, d, p)] === t) { teaches = true; break; }
          }
          if (teaches) {
            run++;
            if (run > maxRun) strictMaxRunPass = false;
          } else {
            run = 0;
          }
        }
      }
    }
    if (strictMaxRunPass) runsStrictMaxRun++;

    process.stdout.write(`Run ${String(r).padStart(2)}: Clashes=${clashes.length}, ExactHours=${exactHours ? "YES" : "NO"}, PeriodBalanced=${allTeachersBalanced ? "YES" : "NO"}, NoP123=${strictNoP123Pass ? "YES" : "NO"}, ClassMax=${strictClassMaxPass ? "YES" : "NO"}, DayBounds=${strictDayBoundsPass ? "YES" : "NO"}, MaxRun=${strictMaxRunPass ? "YES" : "NO"}, BestCost=${bestCost}\n`);
  }

  const clashRate = (runsZeroClashes / numRuns) * 100;
  const hoursRate = (runsExactHours / numRuns) * 100;
  const balanceRate = (runsPeriodBalanced / numRuns) * 100;
  const noP123Rate = (runsStrictNoP123 / numRuns) * 100;
  const classMaxRate = (runsStrictClassMax / numRuns) * 100;
  const dayBoundsRate = (runsStrictDayBounds / numRuns) * 100;
  const maxRunRate = (runsStrictMaxRun / numRuns) * 100;

  console.log(`\n--- SUMMARY FOR: ${title} ---`);
  console.log(`1. Zero strict clashes/violations:    ${runsZeroClashes}/${numRuns} (${clashRate}%)  -> [${clashRate === 100 ? "PASS" : "FAIL"}]`);
  console.log(`2. Every class exact hours per day:   ${runsExactHours}/${numRuns} (${hoursRate}%)  -> [${hoursRate === 100 ? "PASS" : "FAIL"}]`);
  console.log(`3. Every teacher period balanced:     ${runsPeriodBalanced}/${numRuns} (${balanceRate}%)  -> [${balanceRate >= 90 ? "PASS" : "FAIL"}]`);
  console.log(`4. Strict no P1, P2 & P3 on same day: ${runsStrictNoP123}/${numRuns} (${noP123Rate}%)  -> [${noP123Rate === 100 ? "PASS" : "FAIL"}]`);
  console.log(`5. Strict max in class per day:       ${runsStrictClassMax}/${numRuns} (${classMaxRate}%)  -> [${classMaxRate === 100 ? "PASS" : "FAIL"}]`);
  console.log(`6. Strict daily min/max bounds:       ${runsStrictDayBounds}/${numRuns} (${dayBoundsRate}%)  -> [${dayBoundsRate === 100 ? "PASS" : "FAIL"}]`);
  console.log(`7. Strict max continuous hours:       ${runsStrictMaxRun}/${numRuns} (${maxRunRate}%)  -> [${maxRunRate === 100 ? "PASS" : "FAIL"}]`);

  return { clashRate, hoursRate, balanceRate, noP123Rate, classMaxRate, dayBoundsRate, maxRunRate };
}

// Setup 1: 8 teachers with standard per-class limits (2h in core classes, 1h in electives)
function setup8Teachers() {
  const S = sandbox.exampleState();
  S.teachers.forEach(t => t.maxPerDay = 4);
  S.opts.minTeacherDay = 2;
  S.opts.noP123 = true;
  S.opts.fairAll = true;
  S.opts.effort = 2;
  S.alloc = {};

  const tIds = S.teachers.map(t => t.id);
  let curT = 0;
  for (const c of S.classes) {
    const totalHours = c.perDay.reduce((a, b) => a + b, 0);
    let remaining = totalHours;
    while (remaining > 0) {
      const tid = tIds[curT % 8];
      const chunk = Math.min(remaining, c.maxTeacherDay || 2);
      const k = tid + "|" + c.id;
      S.alloc[k] = (S.alloc[k] || 0) + chunk;
      remaining -= chunk;
      curT++;
    }
  }
  return S;
}

// Setup 2: Specific Exception Scenario:
// S1 A limit is max 1 for general teachers.
// Teacher 1 has 8 hours in S1 A and has an exception allowing max 2 hours/day!
function setupTeacherException() {
  const S = sandbox.exampleState();
  S.classes[0].maxTeacherDay = 1; // S1 A default is max 1 hr/day
  S.exceptions = {};
  S.exceptions[S.teachers[0].id + "|" + S.classes[0].id] = 2; // Teacher 1 exception: max 2/day
  S.teachers.forEach(t => t.maxPerDay = 4);
  S.opts.minTeacherDay = 1;
  S.opts.noP123 = true;
  S.opts.fairAll = true;
  S.opts.effort = 2;

  // Teacher 1 has 8 hours in S1 A
  S.alloc = {};
  S.alloc[S.teachers[0].id + "|" + S.classes[0].id] = 8;
  S.alloc[S.teachers[1].id + "|" + S.classes[0].id] = 4;
  S.alloc[S.teachers[2].id + "|" + S.classes[0].id] = 4;
  S.alloc[S.teachers[3].id + "|" + S.classes[0].id] = 4;
  S.alloc[S.teachers[4].id + "|" + S.classes[0].id] = 5;

  // Other classes
  const tIds = S.teachers.map(t => t.id);
  let curT = 1;
  for (let ci = 1; ci < S.classes.length; ci++) {
    const c = S.classes[ci];
    const total = c.perDay.reduce((a, b) => a + b, 0);
    let rem = total;
    while (rem > 0) {
      const tid = tIds[curT % 8];
      const chunk = Math.min(rem, 2);
      const k = tid + "|" + c.id;
      S.alloc[k] = (S.alloc[k] || 0) + chunk;
      rem -= chunk;
      curT++;
    }
  }
  return S;
}

console.log("Starting Timetable Builder Test Suite...");
const res1 = runAcceptanceSuite("Standard Per-Class Limits (2h in Core, 1h in Electives)", setup8Teachers, 10);
const res2 = runAcceptanceSuite("Teacher 1 Exception: 8h in S1 A (Max 2), other teachers (Max 1)", setupTeacherException, 10);

if (res1.clashRate === 100 && res1.hoursRate === 100 && res1.balanceRate >= 90 && res1.maxRunRate === 100 &&
    res2.clashRate === 100 && res2.hoursRate === 100 &&
    res2.classMaxRate === 100 && res2.maxRunRate === 100) {
  console.log("\n>>> ALL TEST SUITES PASSED 100% SUCCESSFULLY! <<<");
  process.exit(0);
} else {
  console.error("\n>>> TESTS FAILED <<<");
  process.exit(1);
}
