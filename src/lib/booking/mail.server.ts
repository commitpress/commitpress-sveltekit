/**
 * Confirmation and notification mail for bookings — the wording, and nothing else.
 *
 * The queue lives in `$lib/mail/outbox.server` and the provider in `$lib/mail/send.server`, both
 * shared with the contact form. What remains here is what is specific to a booking: what a
 * confirmation says, what the studio is told, and when it is told nothing at all.
 */
import { env } from "$env/dynamic/private";
import { enqueue as queue, type Composed } from "$lib/mail/outbox.server";
import { formatDateLong } from "./schedule";
import type { Booking } from "./db.server";
import type { BookingBlock, SiteContent } from "../../commitpress.generated";

/** Where the studio's own copy goes. Unset in development, which simply means no admin mail. */
const ADMIN = env.BOOKING_ADMIN_EMAIL || "";

export type { Composed };

export function clientConfirmation(
  booking: Booking,
  block: BookingBlock,
  site: SiteContent,
  cancelUrl: string,
): Composed {
  const when = `${formatDateLong(booking.date)} kl. ${booking.start}`;

  return {
    recipient: booking.email,
    replyTo: ADMIN,
    subject: `Din tid för ID-foto — ${when}`,
    body: [
      `Hej ${booking.name}!`,
      "",
      `Din tid är bokad: ${when}.`,
      booking.id_type ? `Typ av foto: ${booking.id_type}` : "",
      "",
      `${site.details.name}`,
      `${site.details.street}, ${site.details.postal}`,
      "",
      block.confirm_body,
      "",
      "Behöver du avboka eller ändra tid går det bra här:",
      cancelUrl,
      "",
      `Har du frågor är det bara att ringa ${site.details.phone}.`,
    ]
      .filter((line) => line !== undefined && line !== null)
      .join("\n"),
  };
}

export function adminNotification(
  booking: Booking,
  cancelUrl: string,
): Composed | null {
  if (!ADMIN) return null;

  const when = `${formatDateLong(booking.date)} kl. ${booking.start}`;

  return {
    recipient: ADMIN,
    // So the studio can answer the person who booked straight from the notification.
    replyTo: booking.email,
    subject: `Ny bokning: ${booking.date} ${booking.start} — ${booking.name}`,
    body: [
      `${when}`,
      "",
      `Namn:    ${booking.name}`,
      `Telefon: ${booking.phone}`,
      `E-post:  ${booking.email}`,
      booking.id_type ? `Typ:     ${booking.id_type}` : "",
      booking.note ? `\n${booking.note}` : "",
      "",
      `Avboka: ${cancelUrl}`,
    ]
      .filter((line) => line !== "")
      .join("\n"),
  };
}

/**
 * Told to the studio, not to the client.
 *
 * Whoever cancelled did it on the confirmation page and watched it happen, so mailing them a receipt
 * for something they just did is noise. The studio, on the other hand, has an empty slot it did not
 * know about.
 */
export function cancellationNotice(booking: Booking): Composed | null {
  if (!ADMIN) return null;

  return {
    recipient: ADMIN,
    replyTo: booking.email,
    subject: `Avbokad: ${booking.date} ${booking.start} — ${booking.name}`,
    body: [
      `${formatDateLong(booking.date)} kl. ${booking.start} är avbokad.`,
      "",
      `Namn:    ${booking.name}`,
      `Telefon: ${booking.phone}`,
      `E-post:  ${booking.email}`,
      "",
      "Tiden är åter bokningsbar.",
    ].join("\n"),
  };
}

/** Put composed booking mail on the queue. Cheap and synchronous — safe inside a form action. */
export function enqueue(bookingId: number, mail: Composed | null): void {
  queue({ bookingId }, mail);
}
