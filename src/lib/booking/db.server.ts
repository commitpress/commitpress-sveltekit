/**
 * The booking store.
 *
 * Bookings are the one part of this site that cannot live in CommitPress. Content is committed and
 * deployed; a slot is taken by a stranger at 14:03 and has to be gone for the next visitor at 14:04.
 * So the CMS keeps the schedule and this keeps what has been done to it — see `schedule.ts`.
 *
 * The connection, the persistence guard and the schema live in `$lib/server/db` now that enquiries
 * share the same file; this module is the booking queries and nothing else. The outbox moved too,
 * to `$lib/mail/outbox.server`, for the same reason.
 *
 * The heart of it is `booking_slot`, a partial unique index on (date, start). Every other defence in
 * this codebase against a double booking — greying out taken slots, refetching the grid, re-checking
 * before the insert — is a courtesy to the visitor. That index is the part that cannot be raced.
 */
import { randomBytes } from 'node:crypto';
import { database } from '$lib/server/db';

export type BookingStatus = 'confirmed' | 'cancelled';

export interface Booking {
	id: number;
	/** `YYYY-MM-DD`, studio local. */
	date: string;
	/** `HH:MM`, studio local. */
	start: string;
	name: string;
	phone: string;
	email: string;
	/** Which kind of ID photo — informational, it does not affect the length of the sitting. */
	id_type: string;
	note: string;
	status: BookingStatus;
	/** The unguessable half of the cancel link. Never shown in a listing. */
	token: string;
	created_at: number;
	cancelled_at: number | null;
}

export interface NewBooking {
	date: string;
	start: string;
	name: string;
	phone: string;
	email: string;
	id_type: string;
	note: string;
	client_ip: string;
}

/* ------------------------------------------------------------------ reading */

/** The times already taken on a day. Cancelled bookings are not among them. */
export function takenSlots(date: string): Set<string> {
	const rows = database()
		.prepare<[string], { start: string }>(
			`SELECT start FROM booking WHERE date = ? AND status <> 'cancelled'`
		)
		.all(date);
	return new Set(rows.map((row) => row.start));
}

/**
 * Taken slots for several days at once.
 *
 * The day list needs a count for every open day, and asking per day is a query per card. Days come
 * from the schedule, so the list is short and interpolating placeholders is safe.
 */
export function takenSlotsByDate(dates: string[]): Map<string, Set<string>> {
	const byDate = new Map<string, Set<string>>();
	if (dates.length === 0) return byDate;

	const holes = dates.map(() => '?').join(', ');
	const rows = database()
		.prepare<string[], { date: string; start: string }>(
			`SELECT date, start FROM booking
			 WHERE date IN (${holes}) AND status <> 'cancelled'`
		)
		.all(...dates);

	for (const row of rows) {
		const slots = byDate.get(row.date) ?? new Set<string>();
		slots.add(row.start);
		byDate.set(row.date, slots);
	}
	return byDate;
}

/** Slots closed by hand on a day. An empty set with `wholeDay` true means nothing is bookable. */
export function closuresFor(date: string): { wholeDay: boolean; slots: Set<string> } {
	const rows = database()
		.prepare<[string], { start: string | null }>(`SELECT start FROM closure WHERE date = ?`)
		.all(date);

	return {
		wholeDay: rows.some((row) => row.start === null),
		slots: new Set(rows.filter((row) => row.start !== null).map((row) => row.start as string))
	};
}

/** Every date with a whole-day closure — enough to drop a day from the list without a query per day. */
export function closedDates(): Set<string> {
	const rows = database()
		.prepare<[], { date: string }>(`SELECT DISTINCT date FROM closure WHERE start IS NULL`)
		.all();
	return new Set(rows.map((row) => row.date));
}

export function bookingByToken(token: string): Booking | null {
	return (
		database().prepare<[string], Booking>(`SELECT * FROM booking WHERE token = ?`).get(token) ?? null
	);
}

export function bookingById(id: number): Booking | null {
	return database().prepare<[number], Booking>(`SELECT * FROM booking WHERE id = ?`).get(id) ?? null;
}

/**
 * The CMS listing, narrowed by whatever the editor asked for.
 *
 * `to` and `status` are optional because the descriptor declares them optional — an omitted param is
 * not sent at all, so "any status" arrives here as `undefined` rather than as an empty string. The
 * SQL is built from which arguments are present rather than with `(? IS NULL OR ...)` guards, so an
 * unfiltered query is genuinely unfiltered and can use the index on `date`.
 */
export function listBookings(
	fromDate: string,
	{ toDate, status, limit = 500 }: { toDate?: string; status?: string; limit?: number } = {}
): Booking[] {
	const where: string[] = [];
	const args: (string | number)[] = [];

	// An empty `from` is the editor clearing the field, which means "as far back as there is".
	if (fromDate) {
		where.push('date >= ?');
		args.push(fromDate);
	}
	if (toDate) {
		where.push('date <= ?');
		args.push(toDate);
	}
	if (status) {
		where.push('status = ?');
		args.push(status);
	}

	args.push(limit);

	return database()
		.prepare<(string | number)[], Booking>(
			`SELECT * FROM booking
			 ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
			 ORDER BY date, start
			 LIMIT ?`
		)
		.all(...args);
}

/** Confirmed bookings from `date` onwards, soonest first — the admin's list. */
export function upcoming(fromDate: string, limit = 200): Booking[] {
	return database()
		.prepare<[string, number], Booking>(
			`SELECT * FROM booking
			 WHERE date >= ? AND status <> 'cancelled'
			 ORDER BY date, start
			 LIMIT ?`
		)
		.all(fromDate, limit);
}

/** How many bookings one address has made recently — the cheap half of not being a spam target. */
export function recentBookingCount(clientIp: string, email: string, sinceMs: number): number {
	const row = database()
		.prepare<[number, string, string], { n: number }>(
			`SELECT COUNT(*) AS n FROM booking
			 WHERE created_at >= ? AND (client_ip = ? OR email = ?)`
		)
		.get(sinceMs, clientIp, email.toLowerCase());
	return row?.n ?? 0;
}

/* ------------------------------------------------------------------ writing */

export type CreateResult = { ok: true; booking: Booking } | { ok: false; reason: 'taken' };

/**
 * Take a slot.
 *
 * The insert is the check. Anything read beforehand — the grid the visitor saw, a re-read at the top
 * of the action — is already stale by the time the row is written, so the only honest test of "is
 * 11:20 free" is trying to have it and seeing whether the index objects.
 */
export function createBooking(input: NewBooking): CreateResult {
	const token = randomBytes(24).toString('base64url');
	const now = Date.now();

	try {
		const row = database()
			.prepare<
				[string, string, string, string, string, string, string, string, string, number],
				Booking
			>(
				`INSERT INTO booking (date, start, name, phone, email, id_type, note, status, token, client_ip, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?)
				 RETURNING *`
			)
			.get(
				input.date,
				input.start,
				input.name,
				input.phone,
				input.email.toLowerCase(),
				input.id_type,
				input.note,
				token,
				input.client_ip,
				now
			);

		return { ok: true, booking: row as Booking };
	} catch (cause) {
		// Somebody else got there first. Not an error — the caller re-offers what is left.
		if (isUniqueViolation(cause)) return { ok: false, reason: 'taken' };
		throw cause;
	}
}

function isUniqueViolation(cause: unknown): boolean {
	return (cause as { code?: string } | null)?.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

/**
 * Give a slot back.
 *
 * Idempotent, because a cancel link gets clicked twice — but it reports whether this call was the
 * one that did it, so the caller can send the studio exactly one notice.
 */
export function cancelBooking(token: string): { booking: Booking; changed: boolean } | null {
	const booking = bookingByToken(token);
	if (!booking) return null;
	if (booking.status === 'cancelled') return { booking, changed: false };

	const at = Date.now();
	database()
		.prepare<[number, string]>(
			`UPDATE booking SET status = 'cancelled', cancelled_at = ? WHERE token = ?`
		)
		.run(at, token);

	return { booking: { ...booking, status: 'cancelled', cancelled_at: at }, changed: true };
}

/**
 * Cancel from the admin list, by row id.
 *
 * Deliberately not the token: the studio is looking at a table of its own bookings and has no need
 * of the visitor's cancel link, so the tokens never have to be rendered into that page at all.
 */
export function cancelBookingById(id: number): { booking: Booking; changed: boolean } | null {
	const booking = database().prepare<[number], Booking>(`SELECT * FROM booking WHERE id = ?`).get(id);
	if (!booking) return null;
	return cancelBooking(booking.token);
}

export interface Closure {
	id: number;
	date: string;
	start: string | null;
	reason: string;
}

/** Close a whole day (`start` null) or a single slot. Returns the row, so an API can echo it back. */
export function addClosure(date: string, start: string | null, reason: string): Closure {
	return database()
		.prepare<[string, string | null, string, number], Closure>(
			`INSERT INTO closure (date, start, reason, created_at) VALUES (?, ?, ?, ?)
			 RETURNING id, date, start, reason`
		)
		.get(date, start, reason, Date.now()) as Closure;
}

/** True when a row was actually removed — the difference between "opened" and "was never closed". */
export function removeClosure(id: number): boolean {
	return database().prepare<[number]>(`DELETE FROM closure WHERE id = ?`).run(id).changes > 0;
}

export function listClosures(fromDate: string): Closure[] {
	return database()
		.prepare<[string], Closure>(
			`SELECT id, date, start, reason FROM closure WHERE date >= ? ORDER BY date, start`
		)
		.all(fromDate);
}
