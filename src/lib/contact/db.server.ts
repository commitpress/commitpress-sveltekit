/**
 * Contact enquiries.
 *
 * Deliberately not "failed enquiries". The obvious design is to store only what the mailer could
 * not deliver, and it does not work: the send either succeeds or throws, and neither of those tells
 * you whether a person read it. Resend returning 200 for a message that Gmail files as spam is
 * indistinguishable, from in here, from one that landed in the inbox. So the row is written first
 * and always, and the mail is a notification about a record that already exists.
 *
 * Which also means the studio has somewhere to look. An enquiry that nobody answered because the
 * mail vanished is recoverable from `/admin/forfragningar`; one that was only ever an HTTP request
 * is not.
 */
import { database } from '$lib/server/db';

export interface Enquiry {
	id: number;
	name: string;
	email: string;
	phone: string;
	/** Which of the block's enquiry types the visitor picked. */
	subject: string;
	/** A date they mentioned, as free text — "14 juni 2026", "någon gång i höst". Never parsed. */
	wish_date: string;
	message: string;
	/** The page the form was submitted from, so a bare "hej!" still has some context. */
	page: string;
	client_ip: string;
	created_at: number;
	handled_at: number | null;
}

export interface NewEnquiry {
	name: string;
	email: string;
	phone: string;
	subject: string;
	wish_date: string;
	message: string;
	page: string;
	client_ip: string;
}

export function createEnquiry(input: NewEnquiry): Enquiry {
	return database()
		.prepare<[string, string, string, string, string, string, string, string, number], Enquiry>(
			`INSERT INTO enquiry (name, email, phone, subject, wish_date, message, page, client_ip, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			 RETURNING *`
		)
		.get(
			input.name,
			input.email.toLowerCase(),
			input.phone,
			input.subject,
			input.wish_date,
			input.message,
			input.page,
			input.client_ip,
			Date.now()
		) as Enquiry;
}

/**
 * The admin list — newest first, because an enquiry is answered soonest after it arrives.
 *
 * The opposite ordering to the booking list, and that is not an inconsistency: bookings are read as
 * a diary of what is coming, enquiries as an inbox of what just came in.
 */
export function listEnquiries(limit = 100): Enquiry[] {
	return database()
		.prepare<[number], Enquiry>(`SELECT * FROM enquiry ORDER BY id DESC LIMIT ?`)
		.all(limit);
}

/** Tick one off, or put it back. Returns false when the id is not a row. */
export function setHandled(id: number, handled: boolean): boolean {
	return (
		database()
			.prepare<[number | null, number]>(`UPDATE enquiry SET handled_at = ? WHERE id = ?`)
			.run(handled ? Date.now() : null, id).changes > 0
	);
}

/** How many enquiries one address or mailbox has sent lately — the cheap half of not being a target. */
export function recentEnquiryCount(clientIp: string, email: string, sinceMs: number): number {
	const row = database()
		.prepare<[number, string, string], { n: number }>(
			`SELECT COUNT(*) AS n FROM enquiry
			 WHERE created_at >= ? AND (client_ip = ? OR email = ?)`
		)
		.get(sinceMs, clientIp, email.toLowerCase());
	return row?.n ?? 0;
}
