/**
 * The mail queue — writing to it, and draining it.
 *
 * The shape worth keeping: mail is written to the outbox inside the same call that writes the thing
 * it is about, and sent afterwards. A confirmed booking is never rolled back because a mail server
 * had a bad minute — the visitor is standing in front of the confirmation page with the time on it,
 * and the slot is genuinely theirs whether or not the receipt arrives. The same goes for an
 * enquiry: it is in the database before anything is sent, so a provider outage costs the studio a
 * notification and not a customer.
 *
 * Shared by booking and contact. `deliver()` — the one function that talks to a provider — lives in
 * `send.server.ts`, so this module has no idea who carries the post.
 */
import { database } from '$lib/server/db';
import { deliver } from './send.server';

export interface Composed {
	recipient: string;
	subject: string;
	body: string;
	/** Where a reply should go, when that is not the sending address. Empty means "no Reply-To". */
	replyTo?: string;
}

/** What a queued row is about. Exactly one of these is set; both null is possible but not used. */
export interface Subject {
	bookingId?: number;
	enquiryId?: number;
}

export interface OutboxRow {
	id: number;
	booking_id: number | null;
	enquiry_id: number | null;
	recipient: string;
	subject: string;
	body: string;
	reply_to: string;
	attempts: number;
}

/** Put composed mail on the queue. Cheap and synchronous — safe to call inside a form action. */
export function enqueue(about: Subject, mail: Composed | null): number | null {
	if (!mail) return null;

	const info = database()
		.prepare<[number | null, number | null, string, string, string, string, number]>(
			`INSERT INTO outbox (booking_id, enquiry_id, recipient, subject, body, reply_to, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			about.bookingId ?? null,
			about.enquiryId ?? null,
			mail.recipient,
			mail.subject,
			mail.body,
			mail.replyTo ?? '',
			Date.now()
		);

	return Number(info.lastInsertRowid);
}

export function pendingMail(limit = 20): OutboxRow[] {
	return database()
		.prepare<[number], OutboxRow>(
			`SELECT id, booking_id, enquiry_id, recipient, subject, body, reply_to, attempts
			 FROM outbox WHERE sent_at IS NULL AND attempts < 8
			 ORDER BY id LIMIT ?`
		)
		.all(limit);
}

export function markSent(id: number): void {
	database()
		.prepare<[number, number]>(`UPDATE outbox SET sent_at = ?, last_error = NULL WHERE id = ?`)
		.run(Date.now(), id);
}

export function markFailed(id: number, error: string): void {
	database()
		.prepare<[string, number]>(
			`UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?`
		)
		.run(error, id);
}

/**
 * Mail that has stopped trying.
 *
 * The retry loop is quiet by design, which is exactly what makes a permanently stuck confirmation
 * dangerous — the visitor believes one is coming. Surfacing these in the admin is how a delivery
 * problem gets noticed by a person instead of by a customer who never turns up.
 */
export function stuckMail(): Array<{
	id: number;
	recipient: string;
	subject: string;
	attempts: number;
	last_error: string | null;
}> {
	return database()
		.prepare<
			[],
			{ id: number; recipient: string; subject: string; attempts: number; last_error: string | null }
		>(
			`SELECT id, recipient, subject, attempts, last_error
			 FROM outbox WHERE sent_at IS NULL AND attempts >= 8
			 ORDER BY id DESC LIMIT 50`
		)
		.all();
}

/** How many messages are queued and still unsent — the number the admin needs to see a backlog. */
export function waitingCount(): number {
	const row = database()
		.prepare<[], { n: number }>(
			`SELECT COUNT(*) AS n FROM outbox WHERE sent_at IS NULL AND attempts < 8`
		)
		.get();
	return row?.n ?? 0;
}

/**
 * Try to send whatever is waiting.
 *
 * Called after responding rather than before, and swallows everything: a booking is complete the
 * moment its row exists, and no failure here may reach the visitor. What it must not do is fail
 * silently *to the studio* — a permanently stuck row keeps its `last_error` for the admin page.
 */
export async function flushOutbox(): Promise<void> {
	let queue: OutboxRow[];
	try {
		queue = pendingMail();
	} catch (cause) {
		console.error('[mail] could not read the mail queue', cause);
		return;
	}

	for (const row of queue) {
		try {
			const outcome = await deliver(row);

			// No provider configured. The message was logged in full rather than sent, and the row is
			// left exactly as it was — not marked sent, and *not* counted as an attempt. Burning the
			// eight retries against a missing API key would mean that configuring one later flushed
			// nothing, because everything waiting would already be past giving up.
			if (outcome === 'unconfigured') continue;

			markSent(row.id);
		} catch (cause) {
			const message = cause instanceof Error ? cause.message : String(cause);
			console.error(`[mail] ${row.id} to ${row.recipient} failed: ${message}`);
			try {
				markFailed(row.id, message);
			} catch {
				// The queue itself is unreachable; the console line above is the record.
			}
		}
	}
}
