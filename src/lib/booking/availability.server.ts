/**
 * Where the schedule in the CMS meets the bookings in the database.
 *
 * `schedule.ts` knows what the studio offers and `db.server.ts` knows what has been taken; neither
 * imports the other. This joins them, and it is the only place that does — so "is 11:20 free" has
 * one answer, whether it is being asked by the day list, the time grid, or the form action a second
 * before it writes the row.
 */
import { queryList } from '@commitpress/sdk';
import { dev } from '$app/environment';
import { closedDates, closuresFor, takenSlots, takenSlotsByDate } from './db.server';
import {
	bookableDates,
	bookableSlotsForDate,
	nowInZone,
	toSchedule,
	type Schedule
} from './schedule';
import type { BookingBlock, PageContent } from '../../commitpress.generated';

export interface BookableDay {
	date: string;
	/** The times still free, in order. Never empty — a day with none does not appear. */
	slots: string[];
}

/**
 * The booking block, found rather than configured.
 *
 * Which page carries it is the editor's business — it is on the ID-photo page today and could be
 * moved or duplicated tomorrow — so `/boka` searches for it instead of naming a page. The first
 * published one wins; a second is a content mistake and is reported rather than merged, because two
 * schedules disagreeing about opening hours has no sensible resolution.
 */
async function findBookingBlock(): Promise<BookingBlock | null> {
	const pages = await queryList<PageContent>('content/pages', process.cwd());

	const found = pages.flatMap((page) =>
		(page.content?.blocks ?? []).filter((block) => 'booking' in block)
	);

	if (found.length > 1) {
		console.warn(
			`[booking] ${found.length} booking blocks are published; using the first. ` +
				'Only one page should carry the calendar.'
		);
	}

	const first = found[0];
	return first && 'booking' in first ? first.booking : null;
}

/**
 * Content changes only at deploy time in production, so the block is read once per process there.
 * In development it is re-read every time, or editing the schema would need a restart to be seen.
 */
let cached: BookingBlock | null | undefined;

export async function bookingBlock(): Promise<BookingBlock | null> {
	if (!dev && cached !== undefined) return cached;
	cached = await findBookingBlock();
	return cached;
}

export interface Availability {
	block: BookingBlock;
	schedule: Schedule;
	days: BookableDay[];
}

/**
 * Every day and time somebody could pick right now.
 *
 * One query for the taken slots across all the open days rather than one per day: the day list needs
 * a count for each card, and the schedule is short enough that asking for all of them at once is a
 * single small statement.
 */
export async function availability(now = nowInZone()): Promise<Availability | null> {
	const block = await bookingBlock();
	if (!block) return null;

	const schedule = toSchedule(block);
	const closedByHand = closedDates();

	const dates = bookableDates(schedule, now).filter((date) => !closedByHand.has(date));
	const taken = takenSlotsByDate(dates);

	const days: BookableDay[] = [];
	for (const date of dates) {
		const busy = taken.get(date) ?? new Set<string>();
		const closed = closuresFor(date);
		if (closed.wholeDay) continue;

		const slots = bookableSlotsForDate(schedule, date, now).filter(
			(slot) => !busy.has(slot) && !closed.slots.has(slot)
		);
		if (slots.length > 0) days.push({ date, slots });
	}

	return { block, schedule, days };
}

/**
 * The free times on one day.
 *
 * Deliberately recomputed from the schedule rather than filtered out of `availability()` — this is
 * what the form action re-checks against, and it must not be able to inherit a stale list.
 */
export function freeSlotsFor(schedule: Schedule, date: string, now = nowInZone()): string[] {
	const closed = closuresFor(date);
	if (closed.wholeDay) return [];

	const busy = takenSlots(date);
	return bookableSlotsForDate(schedule, date, now).filter(
		(slot) => !busy.has(slot) && !closed.slots.has(slot)
	);
}

/**
 * Every slot the day has, each marked taken or free.
 *
 * The grid shows taken times dimmed rather than removing them: a slot vanishing between the render
 * and the tap moves everything after it under the finger, and "11:20 is gone" is more use to
 * somebody than a grid that quietly has one fewer button than it did a moment ago.
 */
export function slotStatesFor(
	schedule: Schedule,
	date: string,
	now = nowInZone()
): Array<{ time: string; free: boolean }> {
	const closed = closuresFor(date);
	const busy = takenSlots(date);

	return bookableSlotsForDate(schedule, date, now).map((time) => ({
		time,
		free: !busy.has(time) && !closed.slots.has(time) && !closed.wholeDay
	}));
}
