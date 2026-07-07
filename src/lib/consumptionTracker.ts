/**
 * Pure helper types and functions for consumption history tracking.
 * No ioBroker dependencies here — just date math and delta calculations.
 */

export const MONTH_LABELS: Record<string, string> = {
	'01': '01_January',   '02': '02_February', '03': '03_March',
	'04': '04_April',     '05': '05_May',       '06': '06_June',
	'07': '07_July',      '08': '08_August',    '09': '09_September',
	'10': '10_October',   '11': '11_November',  '12': '12_December',
};

/** ISO quarter → two-digit month keys belonging to that quarter. */
export const QUARTER_MONTHS: Record<number, string[]> = {
	1: ['01', '02', '03'],
	2: ['04', '05', '06'],
	3: ['07', '08', '09'],
	4: ['10', '11', '12'],
};

// ---- persistence structure ----

export interface TrackerAnchors {
	/** Calendar year this anchor was last updated in. */
	year:              number;
	/** JS month (0-11) this anchor was last updated in. */
	month:             number;
	/** ISO week number when the week anchor was last reset. */
	isoWeek:           number;
	/** Day-of-month when the day anchor was last reset. */
	dayOfMonth:        number;
	/** Meter reading at the start of the current year. */
	startOfYear:       number;
	/** Meter reading at the start of the current month. */
	startOfMonth:      number;
	/** Meter reading at the start of the current ISO week (Monday). */
	startOfWeek:       number;
	/** Meter reading at the start of today. */
	startOfDay:        number;
	/** Consumption of the PREVIOUS (completed) day. */
	prevDayConsumed:   number;
	/** Consumption of the PREVIOUS (completed) ISO week. */
	prevWeekConsumed:  number;
	/** Consumption of the PREVIOUS (completed) month. */
	prevMonthConsumed: number;
	/** Consumption of the PREVIOUS (completed) year. */
	prevYearConsumed:  number;
	/**
	 * Consumption per completed month: '01'..'12' → consumed value.
	 * Resets each year rollover.
	 */
	monthlyConsumed:   Record<string, number>;
	/**
	 * Meter reading at the END of each completed month: '01'..'12' → reading.
	 * Resets each year rollover.
	 */
	monthlyReadings:   Record<string, number>;
}

// ---- date helpers ----

/** Returns the ISO week number (1-53) for a given date. */
export function getISOWeek(d: Date): number {
	const tmp = new Date(d.getFullYear(), d.getMonth(), d.getDate());
	tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
	const yearStart = new Date(tmp.getFullYear(), 0, 1);
	return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/** Zero-pads a month number (1-based) to two digits: 1 → '01'. */
export function mmOf(month1based: number): string {
	return String(month1based).padStart(2, '0');
}

/** Returns the ISO quarter (1-4) for a JS month index (0-11). */
export function quarterOf(month0based: number): number {
	return Math.floor(month0based / 3) + 1;
}

// ---- calculation helpers ----

/**
 * Computes a non-negative delta rounded to 3 decimal places.
 * @param start     Reference (anchor) reading.
 * @param current   Current meter reading.
 * @param descending true for oil tanks (reading goes down as fuel is consumed).
 */
export function computeDelta(start: number, current: number, descending: boolean): number {
	const raw = descending ? start - current : current - start;
	return Math.round(Math.max(0, raw) * 1000) / 1000;
}

// ---- anchor bootstrap ----

/** Creates a fresh anchor set using the current reading as the baseline for all periods. */
export function defaultAnchors(reading: number, now: Date): TrackerAnchors {
	return {
		year:              now.getFullYear(),
		month:             now.getMonth(),
		isoWeek:           getISOWeek(now),
		dayOfMonth:        now.getDate(),
		startOfYear:       reading,
		startOfMonth:      reading,
		startOfWeek:       reading,
		startOfDay:        reading,
		prevDayConsumed:   0,
		prevWeekConsumed:  0,
		prevMonthConsumed: 0,
		prevYearConsumed:  0,
		monthlyConsumed:   {},
		monthlyReadings:   {},
	};
}

// ---- period rollover ----

export interface RolloverResult {
	anchors:      TrackerAnchors;
	/** Two-digit MM keys ('01'..'12') of months that were just closed. */
	closedMonths: string[];
	yearRolled:   boolean;
}

/**
 * Compares `now` against the period markers stored in `anchors` and advances
 * any periods that have elapsed. Safe to call on every state update — it is
 * idempotent within the same period.
 */
export function rolloverAnchors(
	anchors:        TrackerAnchors,
	currentReading: number,
	now:            Date,
	descending:     boolean,
): RolloverResult {
	const a: TrackerAnchors = {
		...anchors,
		monthlyConsumed: { ...anchors.monthlyConsumed },
		monthlyReadings: { ...anchors.monthlyReadings },
	};
	const closedMonths: string[] = [];
	let yearRolled = false;

	const ny = now.getFullYear();
	const nm = now.getMonth();
	const nw = getISOWeek(now);
	const nd = now.getDate();

	// ---- year rollover (largest, process first) ----
	if (ny !== anchors.year) {
		a.prevYearConsumed = computeDelta(anchors.startOfYear, currentReading, descending);
		a.startOfYear      = currentReading;
		a.year             = ny;
		// Clear monthly history — new year starts fresh
		a.monthlyConsumed  = {};
		a.monthlyReadings  = {};
		yearRolled         = true;
	}

	// ---- month rollover ----
	if (nm !== anchors.month || ny !== anchors.year) {
		const mm = mmOf(anchors.month + 1); // month that just closed (1-based)
		a.prevMonthConsumed   = computeDelta(anchors.startOfMonth, currentReading, descending);
		a.monthlyConsumed[mm] = a.prevMonthConsumed;
		a.monthlyReadings[mm] = currentReading; // reading at end of closed month
		a.startOfMonth        = currentReading;
		a.month               = nm;
		closedMonths.push(mm);
	}

	// ---- week rollover ----
	if (nw !== anchors.isoWeek || ny !== anchors.year) {
		a.prevWeekConsumed = computeDelta(anchors.startOfWeek, currentReading, descending);
		a.startOfWeek      = currentReading;
		a.isoWeek          = nw;
	}

	// ---- day rollover ----
	if (nd !== anchors.dayOfMonth || nm !== anchors.month || ny !== anchors.year) {
		a.prevDayConsumed = computeDelta(anchors.startOfDay, currentReading, descending);
		a.startOfDay      = currentReading;
		a.dayOfMonth      = nd;
	}

	return { anchors: a, closedMonths, yearRolled };
}
