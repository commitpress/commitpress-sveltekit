/**
 * A one-event calendar file for the confirmation page's "add to calendar".
 *
 * Hand-rolled because the whole of RFC 5545 that this needs is a dozen lines, and the alternative is
 * a dependency to write twelve lines. The event is emitted as a UTC instant — the one place in the
 * booking code where wall-clock time is converted, because a calendar file has nowhere to put
 * "Europe/Stockholm" without also shipping the zone's transition rules.
 */
import { toInstant } from './schedule';

/** RFC 5545 escapes commas, semicolons and newlines inside a text value. */
function esc(text: string): string {
	return text
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

const stamp = (at: Date) => at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function bookingIcs(input: {
	uid: string;
	date: string;
	start: string;
	minutes: number;
	summary: string;
	description: string;
	location: string;
}): string {
	const from = toInstant(input.date, input.start);
	const to = new Date(from.getTime() + input.minutes * 60_000);

	// CRLF, not LF — a few calendar clients still reject a file that uses bare newlines.
	return [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//hejfoto//booking//SV',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		'BEGIN:VEVENT',
		`UID:${esc(input.uid)}`,
		`DTSTAMP:${stamp(new Date())}`,
		`DTSTART:${stamp(from)}`,
		`DTEND:${stamp(to)}`,
		`SUMMARY:${esc(input.summary)}`,
		`DESCRIPTION:${esc(input.description)}`,
		`LOCATION:${esc(input.location)}`,
		'END:VEVENT',
		'END:VCALENDAR'
	].join('\r\n');
}
