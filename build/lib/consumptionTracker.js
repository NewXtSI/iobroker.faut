"use strict";
/**
 * Pure helper types and functions for consumption history tracking.
 * No ioBroker dependencies here — just date math and delta calculations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QUARTER_MONTHS = exports.MONTH_LABELS = void 0;
exports.getISOWeek = getISOWeek;
exports.mmOf = mmOf;
exports.quarterOf = quarterOf;
exports.computeDelta = computeDelta;
exports.defaultAnchors = defaultAnchors;
exports.rolloverAnchors = rolloverAnchors;
exports.MONTH_LABELS = {
    '01': '01_January', '02': '02_February', '03': '03_March',
    '04': '04_April', '05': '05_May', '06': '06_June',
    '07': '07_July', '08': '08_August', '09': '09_September',
    '10': '10_October', '11': '11_November', '12': '12_December',
};
/** ISO quarter → two-digit month keys belonging to that quarter. */
exports.QUARTER_MONTHS = {
    1: ['01', '02', '03'],
    2: ['04', '05', '06'],
    3: ['07', '08', '09'],
    4: ['10', '11', '12'],
};
// ---- date helpers ----
/** Returns the ISO week number (1-53) for a given date. */
function getISOWeek(d) {
    const tmp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
    const yearStart = new Date(tmp.getFullYear(), 0, 1);
    return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
/** Zero-pads a month number (1-based) to two digits: 1 → '01'. */
function mmOf(month1based) {
    return String(month1based).padStart(2, '0');
}
/** Returns the ISO quarter (1-4) for a JS month index (0-11). */
function quarterOf(month0based) {
    return Math.floor(month0based / 3) + 1;
}
// ---- calculation helpers ----
/**
 * Computes a non-negative delta rounded to 3 decimal places.
 * @param start     Reference (anchor) reading.
 * @param current   Current meter reading.
 * @param descending true for oil tanks (reading goes down as fuel is consumed).
 */
function computeDelta(start, current, descending) {
    const raw = descending ? start - current : current - start;
    return Math.round(Math.max(0, raw) * 1000) / 1000;
}
// ---- anchor bootstrap ----
/** Creates a fresh anchor set using the current reading as the baseline for all periods. */
function defaultAnchors(reading, now) {
    return {
        year: now.getFullYear(),
        month: now.getMonth(),
        isoWeek: getISOWeek(now),
        dayOfMonth: now.getDate(),
        startOfYear: reading,
        startOfMonth: reading,
        startOfWeek: reading,
        startOfDay: reading,
        prevDayConsumed: 0,
        prevWeekConsumed: 0,
        prevMonthConsumed: 0,
        prevYearConsumed: 0,
        monthlyConsumed: {},
        monthlyReadings: {},
    };
}
/**
 * Compares `now` against the period markers stored in `anchors` and advances
 * any periods that have elapsed. Safe to call on every state update — it is
 * idempotent within the same period.
 */
function rolloverAnchors(anchors, currentReading, now, descending) {
    const a = {
        ...anchors,
        monthlyConsumed: { ...anchors.monthlyConsumed },
        monthlyReadings: { ...anchors.monthlyReadings },
    };
    const closedMonths = [];
    let yearRolled = false;
    const ny = now.getFullYear();
    const nm = now.getMonth();
    const nw = getISOWeek(now);
    const nd = now.getDate();
    // ---- year rollover (largest, process first) ----
    if (ny !== anchors.year) {
        a.prevYearConsumed = computeDelta(anchors.startOfYear, currentReading, descending);
        a.startOfYear = currentReading;
        a.year = ny;
        // Clear monthly history — new year starts fresh
        a.monthlyConsumed = {};
        a.monthlyReadings = {};
        yearRolled = true;
    }
    // ---- month rollover ----
    if (nm !== anchors.month || ny !== anchors.year) {
        const mm = mmOf(anchors.month + 1); // month that just closed (1-based)
        a.prevMonthConsumed = computeDelta(anchors.startOfMonth, currentReading, descending);
        a.monthlyConsumed[mm] = a.prevMonthConsumed;
        a.monthlyReadings[mm] = currentReading; // reading at end of closed month
        a.startOfMonth = currentReading;
        a.month = nm;
        closedMonths.push(mm);
    }
    // ---- week rollover ----
    if (nw !== anchors.isoWeek || ny !== anchors.year) {
        a.prevWeekConsumed = computeDelta(anchors.startOfWeek, currentReading, descending);
        a.startOfWeek = currentReading;
        a.isoWeek = nw;
    }
    // ---- day rollover ----
    if (nd !== anchors.dayOfMonth || nm !== anchors.month || ny !== anchors.year) {
        a.prevDayConsumed = computeDelta(anchors.startOfDay, currentReading, descending);
        a.startOfDay = currentReading;
        a.dayOfMonth = nd;
    }
    return { anchors: a, closedMonths, yearRolled };
}
//# sourceMappingURL=consumptionTracker.js.map