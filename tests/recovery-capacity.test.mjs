import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "espree";
import vm from "node:vm";
import * as capacity from "../src/components/recoveryCapacityUtils.js";
const date = "2026-11-11",
  today = "2026-11-04";
const clase = {
  id: "c",
  refPath: "artifacts/demo/users/t/recurringClasses/c",
  subject: "Piano",
  dayOfWeek: 3,
  capacity: 4,
  isRecurring: true,
  students: [{ id: "a" }, { id: "b" }, { id: "c" }],
};
const availability = {
  enabled: true,
  capacity: 4,
  sessions: {
    [date]: { baseCount: 3, recoveryCount: 0, holds: [], cancelled: false },
    "2026-11-18": {
      baseCount: 3,
      recoveryCount: 0,
      holds: [],
      cancelled: false,
    },
  },
};
test("cuenta personas por sesión: tres fijos y una recuperación llenan solo ese día", () => {
  const current = {
    ...clase,
    students: [
      ...clase.students,
      { id: "r", isRecovery: true, recoveryDate: date },
    ],
  };
  assert.equal(capacity.recoverySessionOccupancy(current, date).count, 4);
  assert.equal(
    capacity.recoverySessionOccupancy(current, "2026-11-18").count,
    3,
  );
  assert.equal(
    capacity.recoverySessionOccupancy(
      { ...current, students: [...current.students, current.students[0]] },
      date,
    ).count,
    4,
  );
});
test("respeta inicio y fin de plaza, baja, mantenimiento y recolocación por fecha", () => {
  const current = {
    ...clase,
    students: [
      { id: "a", classStartDate: "2026-11-18" },
      { id: "b", scheduledEndDate: "2026-11-10" },
      { id: "c" },
      { id: "d" },
      { id: "e" },
    ],
  };
  const options = {
    students: [{ id: "c", globalStatus: "baja" }],
    maintenancePeriods: [{ studentId: "d", from: date, until: date }],
    temporaryRelocations: [
      {
        studentId: "e",
        sourceClassRefPath: clase.refPath,
        from: date,
        until: date,
      },
      {
        studentId: "f",
        targetClassRefPath: clase.refPath,
        from: date,
        until: date,
      },
    ],
  };
  assert.deepEqual(
    capacity.recoverySessionOccupancy(current, date, options).studentIds,
    ["f"],
  );
  assert.equal(
    capacity.recoverySessionOccupancy(current, "2026-11-18", options).count,
    3,
  );
});
test("las pendientes consumen hueco y el selector salta fechas llenas, canceladas o festivas", () => {
  const held = structuredClone(availability);
  held.sessions[date].holds = ["r"];
  assert.equal(capacity.recoverySessionState(held, date).free, 0);
  assert.equal(capacity.recoverySessionState(held, date, "r").free, 1);
  assert.deepEqual(
    capacity.recoveryDates(clase, today, { availability: held }),
    ["2026-11-18"],
  );
  assert.deepEqual(
    capacity.recoveryDates(clase, today, {
      availability,
      blockedDates: [date, "2026-11-18"],
    }),
    [],
  );
  assert.deepEqual(
    capacity.recoveryDates({ ...clase, cancelledDates: [date] }, today, {
      availability,
    }),
    ["2026-11-18"],
  );
  assert.equal(capacity.recoverySessionState(null, date).free, 0);
  assert.deepEqual(
    capacity.recoveryDates(clase, today, {
      availability,
      ticket: { validUntil: "2026-11-12" },
    }),
    [date],
  );
});
test("conserva hoy para aprobar una solicitud ya hecha y nunca ofrece fechas pasadas", () => {
  assert.equal(
    capacity.recoveryDates(clase, date, {
      requireFree: false,
      includeToday: true,
    })[0],
    date,
  );
  assert.equal(
    capacity.recoveryDates(clase, date, { requireFree: false })[0],
    "2026-11-18",
  );
  assert.equal(
    capacity.recoveryClassOccurs({ ...clase, startDate: "2026-12-01" }, date),
    false,
  );
  assert.equal(
    capacity.recoveryTargetsClass(
      { requestedClass: "c", requestedClassRefPath: "different" },
      clase,
    ),
    false,
  );
});

const sources = Object.fromEntries(
  await Promise.all(
    ["StudentPortal", "AdminPortal", "TeacherPortal"].map(async (name) => [
      name,
      await readFile(`src/components/${name}.jsx`, "utf8"),
    ]),
  ),
);
const find = (name, fn) => {
  const source = sources[name],
    tree = parse(source, {
      ecmaVersion: "latest",
      sourceType: "module",
      ecmaFeatures: { jsx: true },
      range: true,
    });
  let found;
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "VariableDeclarator" && node.id.name === fn)
      found = node.init;
    for (const [key, value] of Object.entries(node))
      if (key !== "range")
        Array.isArray(value) ? value.forEach(walk) : walk(value);
  };
  walk(tree);
  assert.ok(found, fn);
  return (context) =>
    vm.runInNewContext(`(${source.slice(...found.range)})`, context);
};
test("selector real de Student: excluye la fecha llena aunque la matrícula siga indicando hueco", () => {
  const source = sources.StudentPortal,
    start = source.indexOf(
      "    let availableClasses = [];",
      source.indexOf("  const renderGestionModal"),
    ),
    end = source.indexOf("    const isMaintenanceChoiceInvalid", start);
  const full = {
    ...availability,
    sessions: { [date]: { ...availability.sessions[date], recoveryCount: 1 } },
  };
  const context = {
    todayStr: today,
    allClasses: [{ ...clase, activeStudentCount: 3 }],
    targetInstrument: "Piano",
    gestionModal: { type: "recuperacion" },
    isClassSearch: true,
    isTicketRedemption: true,
    isAmpliarClases: false,
    resolvedSourceClass: null,
    selectedRecoveryTicket: {},
    getCommittedSeatCountForClass: () => 3,
    getRecoveryDatesForClass: () =>
      capacity.recoveryDates(clase, today, { availability: full }),
    fixedSeatClasses: [],
    myClasses: [],
    getClassRefPath: (row) => row.refPath,
    compareClassWeekdayAndTime: () => 0,
  };
  const select = () =>
    vm.runInNewContext(
      `(()=>{${source.slice(start, end)};return availableClasses;})()`,
      context,
    );
  assert.equal(select().length, 0);
  context.getRecoveryDatesForClass = () =>
    capacity.recoveryDates(clase, today, { availability });
  assert.equal(select().length, 1);
});
test("Student no envía una gestión si la fecha elegida pierde su último hueco", async () => {
  const warnings = [];
  let reserved = false;
  const context = {
    getGestionUiCopy: () => ({}),
    getAvailableFixedSeatClassesForGestion: () => [],
    isStudentFrozen: false,
    frozenRestrictedGestionTypes: [],
    hasReachedRecoveryLimit: false,
    isSendingGestion: false,
    gestionModal: { type: "recuperacion" },
    isServiceOnlyStudent: false,
    isStudentInMaintenance: false,
    isSourceClassGestion: false,
    getGestionSourceClasses: () => [],
    getResolvedSourceClassForGestion: () => null,
    isBajaTotalRequest: false,
    isBajaTotalRequested: false,
    bajaTotalRequested: false,
    selectedSourceClass: null,
    selectedNewClass: clase,
    selectedRecoveryTicket: { subject: "Piano", id: "t" },
    resolvedRecoverySubject: "Piano",
    selectedRecoveryDate: date,
    profile: { id: "s", name: "Alumno" },
    user: { email: "s@example.com" },
    hasAvailableSeatForGestion: () => true,
    isDuplicateSourceClassGestion: () => false,
    timeRules: { isLate: false },
    acceptLatePenalty: false,
    ticketMatchesSubject: () => true,
    getRecoveryDatesForClass: () => [],
    showToast: (message) => warnings.push(message),
    setIsSendingGestion: () => {},
    createRecoveryCapacityStore: () => ({
      reserve: async () => {
        reserved = true;
      },
    }),
  };
  // Use the real closure's guard dependencies; a lost slot must return before writing.
  context.getResolvedRecoverySubject = () => "Piano";
  context.getSelectedRecoveryTicket = () => context.selectedRecoveryTicket;
  await find("StudentPortal", "sendGestion")(context)();
  assert.equal(reserved, false);
  assert.match(warnings.at(-1), /plazas disponibles/);
});
test("Admin y profesor delegan la aprobación al mismo control transaccional", () => {
  assert.match(
    sources.AdminPortal,
    /createRecoveryCapacityStore\(\{ db, appId \}\)\.approve/,
  );
  assert.match(
    sources.TeacherPortal,
    /createRecoveryCapacityStore\(\{ db, appId \}\)\.approve/,
  );
  assert.match(
    sources.AdminPortal,
    /createRecoveryCapacityStore\(\{ db, appId \}\)\.release/,
  );
  assert.match(
    sources.TeacherPortal,
    /createRecoveryCapacityStore\(\{ db, appId \}\)\.release/,
  );
});

test('la aprobación del profesor usa el día actual aunque esté mirando otra fecha del calendario', async () => {
  let args;
  const notifications=[];
  const context={
    getRecoveryClass:()=>clase,globalStudents:[],
    isStudentInMaintenance:()=>false,
    getRecoveryTicketInfo:()=>({free:1,subject:'Piano',ticket:{id:'t',subject:'Piano',refPath:'artifacts/demo/users/t/tickets/t'}}),
    normalizeTicketSubject:subject=>subject,ticketMatchesSubject:()=>true,
    getClassOccupancyForDate:()=>({count:3,capacity:4,fixedStudentIds:new Set()}),
    window:{confirm:()=>true},formatClassSummary:()=>'',formatDateSpanish:value=>value,
    createRecoveryCapacityStore:()=>({approve:async value=>{args=value;}}),
    todayISO:today,date:'2030-01-01',db:{},appId:'demo',maintenancePeriods:[],temporaryRelocations:[],
    doc:()=>({}),updateDoc:async()=>{},user:{email:'norman@escuelalosmitos.com'},
    showNotification:value=>notifications.push(value),console
  };
  await find('TeacherPortal','approveRecoveryRequest')(context)({id:'g',studentId:'s',recoveryDate:date,studentEmail:'s@example.com'});
  assert.equal(args.today,today);
  assert.equal(args.gestionId,'g');
  assert.equal(notifications.at(-1).type,'success');
});
