/**
 * Turns the CMS booking block into a list of times somebody can actually pick.
 *
 * This module is deliberately pure and free of the database: what the *schedule* allows and what is
 * already *taken* are different questions with different lifetimes, and only the first one lives in
 * content. Availability is the first minus the second, and that subtraction happens in the route.
 *
 * Everything here is local Stockholm wall-clock time held as strings — `2026-08-14` and `11:20` —
 * never a UTC instant. A booking is "11:20 in the studio"; it does not shift when the clocks change,
 * and expressing it as an instant is how these systems come to hand out an 02:30 slot on the last
 * Sunday in October. An instant is derived once, at the very edge, for the calendar attachment.
 */
import type { BookingBlock } from '../../commitpress.generated';

/** Where the studio is. Every date and time in this module is read in this zone. */
export const ZONE = 'Europe/Stockholm';

export interface OpenDay {
	/** `YYYY-MM-DD`. */
	date: string;
	/** Minutes past midnight — the first bookable slot. */
	from: number;
	/** Minutes past midnight — the end of the last slot, not its start. */
	to: number;
}

export interface Schedule {
	slotMinutes: number;
	leadTimeMinutes: number;
	horizonDays: number;
	openDays: OpenDay[];
	closedDates: Set<string>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** `11:20` → 680. Returns null for anything that is not a time, including `24:00`. */
export function toMinutes(time: string): number | null {
	const match = TIME.exec(time.trim());
	if (!match) return null;
	return Number(match[1]) * 60 + Number(match[2]);
}

/** 680 → `11:20`. Always two digits, always 24-hour — this is Sweden. */
export function toTime(minutes: number): string {
	const h = Math.floor(minutes / 60);
	const m = minutes % 60;
	return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * A time as it appears in a URL: `11:20` → `11-20`.
 *
 * A colon is legal in a path segment but survives too few round-trips through proxies, mail clients
 * and copy-paste to be worth defending, and `%3A` in a link somebody is meant to read is ugly.
 */
export const timeToParam = (time: string) => time.replace(':', '-');
export const timeFromParam = (param: string) => param.replace('-', ':');

function toPositiveInt(value: string, fallback: number): number {
	const n = Number.parseInt(value?.trim() ?? '', 10);
	return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * Read the editor's strings into numbers.
 *
 * A malformed row is dropped rather than thrown, because this runs inside the page load: one typo in
 * one date should cost that day, not the whole ID-photo page. The cost is that a mistyped date fails
 * by the day simply not appearing, which is quiet — so it warns on the server as well.
 */
export function toSchedule(block: BookingBlock): Schedule {
	const openDays: OpenDay[] = [];

	for (const row of block.open_days ?? []) {
		const date = row.date?.trim() ?? '';
		const from = toMinutes(row.from ?? '');
		const to = toMinutes(row.to ?? '');

		if (!DATE.test(date) || from === null || to === null || to <= from) {
			console.warn(`[booking] ignoring an unreadable open day: ${JSON.stringify(row)}`);
			continue;
		}
		openDays.push({ date, from, to });
	}

	// Two rows for one date would otherwise generate that day's slots twice.
	openDays.sort((a, b) => (a.date === b.date ? a.from - b.from : a.date < b.date ? -1 : 1));

	const closedDates = new Set(
		(block.closed_days ?? []).map((row) => row.date?.trim() ?? '').filter((date) => DATE.test(date))
	);

	return {
		slotMinutes: toPositiveInt(block.slot_minutes, 10),
		leadTimeMinutes: toPositiveInt(block.lead_time_hours, 2) * 60,
		horizonDays: toPositiveInt(block.horizon_days, 60),
		openDays,
		closedDates
	};
}

/** Today's date and the time now, both as the studio's clock reads them. */
export function nowInZone(at: Date = new Date()): { date: string; minutes: number } {
	const parts = new Intl.DateTimeFormat('sv-SE', {
		timeZone: ZONE,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).formatToParts(at);

	const get = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((part) => part.type === type)?.value ?? '00';

	// `hour12: false` yields `24` rather than `00` for midnight in some engines.
	const hour = Number(get('hour')) % 24;

	return {
		date: `${get('year')}-${get('month')}-${get('day')}`,
		minutes: hour * 60 + Number(get('minute'))
	};
}

/** Calendar days between two `YYYY-MM-DD` strings — no clock, so DST cannot skew it. */
export function daysBetween(from: string, to: string): number {
	const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
	return Math.round(ms / 86_400_000);
}

/**
 * Every slot the schedule itself defines for a day, ignoring who has booked what.
 *
 * The last slot *starts* a full sitting before closing: 11:00–16:00 in tens ends at 15:50, which is
 * what "to" means to whoever typed it. A day listed twice contributes both windows, de-duplicated
 * where they overlap.
 */
export function slotsForDate(schedule: Schedule, date: string): string[] {
	if (schedule.closedDates.has(date)) return [];

	const slots = new Set<number>();
	for (const day of schedule.openDays) {
		if (day.date !== date) continue;
		for (let m = day.from; m + schedule.slotMinutes <= day.to; m += schedule.slotMinutes) {
			slots.add(m);
		}
	}
	return [...slots].sort((a, b) => a - b).map(toTime);
}

/**
 * The slots of a day that are still in the future by at least the notice period.
 *
 * Only ever narrows `slotsForDate`, so a slot offered here is always a slot the schedule allows.
 */
export function bookableSlotsForDate(
	schedule: Schedule,
	date: string,
	now = nowInZone()
): string[] {
	const offset = daysBetween(now.date, date);
	if (offset < 0 || offset > schedule.horizonDays) return [];

	const slots = slotsForDate(schedule, date);
	if (offset > 0) return slots;

	// Today: drop anything inside the notice period.
	const earliest = now.minutes + schedule.leadTimeMinutes;
	return slots.filter((slot) => (toMinutes(slot) ?? 0) >= earliest);
}

/** Bookable dates in order, nearest first. A day whose slots have all passed drops out by itself. */
export function bookableDates(schedule: Schedule, now = nowInZone()): string[] {
	const dates = [...new Set(schedule.openDays.map((day) => day.date))].sort();
	return dates.filter((date) => bookableSlotsForDate(schedule, date, now).length > 0);
}

/** `2026-08-14` → `torsdag 14 augusti`. Lower case, the way Swedish writes it. */
export function formatDate(date: string): string {
	return new Intl.DateTimeFormat('sv-SE', {
		timeZone: ZONE,
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	}).format(new Date(`${date}T12:00:00Z`));
}

/** The same, with the year — for the confirmation, where there is no surrounding context. */
export function formatDateLong(date: string): string {
	return new Intl.DateTimeFormat('sv-SE', {
		timeZone: ZONE,
		weekday: 'long',
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	}).format(new Date(`${date}T12:00:00Z`));
}

/** "i dag" and "i morgon" read faster than a date does, and only apply to two days a year. */
export function relativeDay(date: string, now = nowInZone()): string | null {
	const offset = daysBetween(now.date, date);
	if (offset === 0) return 'i dag';
	if (offset === 1) return 'i morgon';
	return null;
}

/**
 * The wall-clock slot as a UTC instant, for the calendar attachment only.
 *
 * Derived at the edge and never stored: the stored truth stays `2026-08-14` + `11:20`, so if the
 * studio ever moves zone the existing bookings still mean what they said.
 */
export function toInstant(date: string, time: string): Date {
	const guess = new Date(`${date}T${time}:00Z`);
	// How far the zone was from UTC at that moment, found by formatting and reading back.
	const local = nowInZone(guess);
	const drift = (local.minutes - (toMinutes(time) ?? 0) + daysBetween(date, local.date) * 1440) * 60_000;
	return new Date(guess.getTime() - drift);
}
