/**
 * What an enquiry sends: one to the studio, one back to the person who wrote.
 *
 * Both are queued inside the request that stores the enquiry and sent after it — see
 * `mail/outbox.server.ts` for why that order is the whole point.
 */
import { env } from "$env/dynamic/private";
import type { Composed } from "$lib/mail/outbox.server";
import type { Enquiry } from "./db.server";
import type { SiteContent } from "../../commitpress.generated";

/**
 * Where enquiries go.
 *
 * Falls back to the booking address, which is the same mailbox in practice, and then to the public
 * address in site content — so an unset variable degrades to "the address on the website" rather
 * than to silence. There is no case where an enquiry should reach nobody.
 */
function studioAddress(site: SiteContent): string {
  return (
    env.CONTACT_ADMIN_EMAIL ||
    env.BOOKING_ADMIN_EMAIL ||
    site.details.email ||
    ""
  );
}

/**
 * The studio's copy.
 *
 * `replyTo` is the point of this one. It arrives from the site's own sending address — it has to,
 * or SPF fails — so without a Reply-To, hitting reply in a mail client answers the website instead
 * of the customer, and the studio has to copy an address out of the body by hand every time.
 */
export function studioNotification(
  enquiry: Enquiry,
  site: SiteContent,
): Composed | null {
  const recipient = studioAddress(site);
  if (!recipient) return null;

  return {
    recipient,
    replyTo: enquiry.email,
    subject: `Förfrågan: ${enquiry.subject || "kontaktformuläret"} — ${enquiry.name}`,
    body: [
      `${enquiry.name} har skickat en förfrågan via ${enquiry.page || "webbplatsen"}.`,
      "",
      `Namn:    ${enquiry.name}`,
      `E-post:  ${enquiry.email}`,
      enquiry.phone ? `Telefon: ${enquiry.phone}` : "",
      enquiry.subject ? `Gäller:  ${enquiry.subject}` : "",
      enquiry.wish_date ? `Datum:   ${enquiry.wish_date}` : "",
      "",
      enquiry.message || "(inget meddelande)",
      "",
      "—",
      "Svara på det här mailet så går svaret till avsändaren.",
    ]
      .filter((line) => line !== "")
      .join("\n"),
  };
}

/**
 * The receipt.
 *
 * Worth sending even though it tells the visitor nothing they do not know: without it, a form that
 * clears itself is the only evidence anything happened, and the most common next move is to send
 * the same enquiry again through a different channel. It also gives them the studio's address in
 * their own inbox, which is where they will look for it.
 */
export function clientAcknowledgement(
  enquiry: Enquiry,
  site: SiteContent,
): Composed {
  return {
    recipient: enquiry.email,
    replyTo: studioAddress(site),
    subject: `Tack för din förfrågan — ${site.details.name}`,
    body: [
      `Hej ${enquiry.name}!`,
      "",
      "Tack för att du hörde av dig. Jag har fått din förfrågan och återkommer så snart jag kan.",
      "",
      "Det här skickade du:",
      enquiry.subject ? `Gäller:  ${enquiry.subject}` : "",
      enquiry.wish_date ? `Datum:   ${enquiry.wish_date}` : "",
      "",
      enquiry.message || "(inget meddelande)",
      "",
      "—",
      `${site.details.name}`,
      `${site.details.street}, ${site.details.postal}`,
      `${site.details.phone}`,
    ]
      .filter((line) => line !== "")
      .join("\n"),
  };
}
