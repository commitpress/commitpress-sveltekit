/**
 * Resend, over its HTTP API.
 *
 * This is the whole provider. Everything around it — composing, queueing, retrying, surfacing what
 * is stuck — was already real before a single message was ever sent, so wiring a provider was a
 * change to one function body rather than a change to the booking or contact flows.
 *
 * No SDK: one POST with a JSON body, and `fetch` is built in. The `resend` package would be a
 * dependency, a native-free but still versioned one, to wrap a request that is nine lines long.
 *
 * The failure that this cannot detect, and that matters more than any of the ones it can: SPF and
 * DKIM must be published for the sending domain, and the domain must be verified in Resend. Without
 * them the API returns 200, the row is marked sent, and the mail lands in spam — working software
 * by every signal this process can read. If enquiries stop arriving and the admin page shows a
 * clean queue, that is the thing to check first.
 */
import { env } from "$env/dynamic/private";
import type { OutboxRow } from "./outbox.server";

const ENDPOINT = "https://api.resend.com/emails";

/**
 * The API key.
 *
 * Named for the domain it sends as, because the studio's other sites will each want their own —
 * a key is scoped to a Resend domain, and one shared key across sites means one revocation takes
 * all of them down.
 */
const KEY = env.RESEND_HEJFOTO_SE || "";

/**
 * The envelope sender. Must be an address on a domain verified in Resend, or every send 403s.
 *
 * `BOOKING_MAIL_FROM` is honoured as a fallback because it is the name the booking code documented
 * before contact existed and may already be set on the host.
 */
const FROM =
  env.MAIL_FROM || env.BOOKING_MAIL_FROM || "Acme <onboarding@resend.dev>";

export type Delivery = "sent" | "unconfigured";

/**
 * Send one queued message.
 *
 * Returns `unconfigured` rather than throwing when there is no key or no from-address, so the
 * caller can leave the row pending instead of spending a retry on a problem no retry can fix. Any
 * genuine send failure throws, which is what puts the row back in the queue with its error.
 */
export async function deliver(row: OutboxRow): Promise<Delivery> {
  if (!KEY || !FROM) {
    logInstead(
      row,
      KEY ? "MAIL_FROM is not set" : "RESEND_HEJFOTO_SE is not set",
    );
    return "unconfigured";
  }

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      // Resend deduplicates on this, so a retry of a message that actually did send — a reply
      // lost on the way back, a crash between the 200 and `markSent` — does not send it twice.
      "idempotency-key": `outbox-${row.id}`,
    },
    body: JSON.stringify({
      from: FROM,
      to: [row.recipient],
      subject: row.subject,
      text: row.body,
      // Only when it differs from the sender. On the studio's copy of an enquiry this is the
      // person who wrote in, so replying goes to them and not to a no-reply mailbox.
      ...(row.reply_to ? { reply_to: [row.reply_to] } : {}),
    }),
  });

  if (!response.ok) {
    // Resend answers errors as JSON with a `message`, but an edge or a proxy in front of it may
    // not, so the body is read as text and trimmed rather than parsed and trusted.
    const detail = (await response.text().catch(() => "")).slice(0, 500);
    throw new Error(
      `resend ${response.status} ${response.statusText}${detail ? ` — ${detail}` : ""}`,
    );
  }

  return "sent";
}

/**
 * What happens with no provider configured — the old placeholder behaviour, kept deliberately.
 *
 * In development there is no key, and printing the message in full is what lets the flow be
 * exercised end to end and the copy read as the recipient will read it. The row stays pending, so
 * setting a key later sends the backlog rather than discarding it.
 */
function logInstead(row: OutboxRow, why: string): void {
  console.info(
    [
      "",
      `┌─ [mail] not sent — ${why}`,
      `│  to:      ${row.recipient}`,
      row.reply_to ? `│  reply:   ${row.reply_to}` : "",
      `│  subject: ${row.subject}`,
      "│",
      ...row.body.split("\n").map((line) => `│  ${line}`),
      "└─",
    ]
      .filter((line) => line !== "")
      .join("\n"),
  );
}
