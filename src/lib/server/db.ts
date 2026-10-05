/**
 * The site's SQLite store — the connection, and the whole schema.
 *
 * This used to live inside `booking/db.server.ts`, back when bookings were the only thing that
 * outlived a deploy. They are not any more: a contact enquiry has exactly the same property, and
 * the outbox that carries mail is now shared by both. So the connection, the persistence guard and
 * the schema moved here, and each feature keeps only its own queries — `booking/db.server.ts`,
 * `contact/db.server.ts`, `mail/outbox.server.ts`.
 *
 * One file rather than one per feature, and that is a deliberate choice rather than laziness. The
 * documented way this deployment loses data is a database path that resolves inside the container
 * image instead of the mounted volume (see `assertPersistent`), and a second file would be a second
 * chance to make that mistake — with the same invisible failure and half the chance of noticing.
 * One file is also one thing to back up, and `better-sqlite3` is synchronous, so sharing a handle
 * across features costs nothing.
 *
 * SQLite because the shape of the problem is one photographer, one studio, a few bookings and a few
 * enquiries a day: synchronous calls with no network in between, transactions that actually mean
 * it, and a backup that is a file copy. The one thing it asks in return is a single instance on a
 * persistent disk — two containers behind a load balancer would each get their own file.
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { building, dev } from '$app/environment';
import { env } from '$env/dynamic/private';

/**
 * Where the file lives.
 *
 * Still called `BOOKING_DB_PATH` even though it now holds enquiries too. The name is set on the
 * host and in the volume mount; renaming it would be a tidier name bought with a deploy in which
 * production has no configured path at all — which is precisely the failure below.
 *
 * Read through `$env/dynamic/private` rather than the static import so the path is whatever the
 * running container says it is, not whatever the build machine said.
 */
const FILE = env.BOOKING_DB_PATH || 'data/bookings.db';

/**
 * Refuse to open a database that a restart would throw away.
 *
 * This is the failure that actually happened, and the reason it went unnoticed for so long is that
 * nothing about it looks like a failure. A relative path resolves against `process.cwd()`, which in
 * a container is a directory inside the image rather than the mounted volume; the next crash or
 * deploy brings up a clean filesystem, `mkdirSync` recreates the folder, `new Database()` creates
 * an empty file and `migrate()` fills it with empty tables. Every step succeeds. The site comes up
 * healthy, takes bookings, and loses them again — and an empty calendar is indistinguishable from a
 * quiet week. With enquiries in the same file the blast radius is now larger, not smaller.
 *
 * The app cannot check that a path is persistent; only that it is the kind of path that could be.
 * So production demands one that is set and absolute, which is what a volume mount gives you, and
 * refuses to start otherwise. That is deliberately the harsher direction: a site that is visibly
 * down gets fixed within the hour, and one that silently discards a stranger's Tuesday appointment
 * does not get noticed until they arrive at a locked studio.
 *
 * Development is left alone — the relative default is the whole convenience, and there is nothing
 * to lose there.
 */
function assertPersistent(): void {
	if (dev || building) return;

	if (!env.BOOKING_DB_PATH) {
		throw new Error(
			'BOOKING_DB_PATH is not set. In production it must be an absolute path inside the mounted ' +
				'volume (for example /data/bookings.db); the relative default lives in the container image ' +
				'and every booking and enquiry in it is lost on the next restart.'
		);
	}

	if (!isAbsolute(env.BOOKING_DB_PATH)) {
		throw new Error(
			`BOOKING_DB_PATH is "${env.BOOKING_DB_PATH}", which is relative and therefore resolved ` +
				`against the container's working directory rather than the volume. Use the absolute path ` +
				`the volume is mounted at, for example /data/bookings.db.`
		);
	}
}

let handle: Database.Database | null = null;

/** The one connection. Opened and migrated on first use, reused for the life of the process. */
export function database(): Database.Database {
	if (handle) return handle;

	assertPersistent();

	mkdirSync(dirname(FILE), { recursive: true });

	// Logged once per process, and worth the line: when the calendar is unexpectedly empty this is
	// the first thing anybody needs to know, and reading it from the log beats inferring it.
	const existed = existsSync(FILE);
	console.log(`[db] opening ${resolve(FILE)}${existed ? '' : ' (new, empty database)'}`);

	handle = new Database(FILE);

	// WAL so a read never blocks behind a write; `foreign_keys` because SQLite still defaults it off.
	handle.pragma('journal_mode = WAL');
	handle.pragma('foreign_keys = ON');
	// A slot insert that collides with a concurrent one waits rather than throwing SQLITE_BUSY.
	handle.pragma('busy_timeout = 5000');

	migrate(handle);
	return handle;
}

function migrate(d: Database.Database): void {
	d.exec(`
		CREATE TABLE IF NOT EXISTS booking (
			id           INTEGER PRIMARY KEY AUTOINCREMENT,
			date         TEXT    NOT NULL,
			start        TEXT    NOT NULL,
			name         TEXT    NOT NULL,
			phone        TEXT    NOT NULL,
			email        TEXT    NOT NULL,
			id_type      TEXT    NOT NULL DEFAULT '',
			note         TEXT    NOT NULL DEFAULT '',
			status       TEXT    NOT NULL DEFAULT 'confirmed',
			token        TEXT    NOT NULL UNIQUE,
			client_ip    TEXT    NOT NULL DEFAULT '',
			created_at   INTEGER NOT NULL,
			cancelled_at INTEGER
		);

		-- The whole double-booking defence, in one line. Partial, so a cancelled booking releases its
		-- slot for somebody else while staying on the record.
		CREATE UNIQUE INDEX IF NOT EXISTS booking_slot
			ON booking (date, start) WHERE status <> 'cancelled';

		CREATE INDEX IF NOT EXISTS booking_by_date ON booking (date);

		/*
		 * The rate limit's two lookups — see recentBookingCount(), and the identical pair on enquiry
		 * below. That query asks for created_at >= ? AND (client_ip = ? OR email = ?), and an OR
		 * across two columns is only cheap if SQLite can satisfy each branch from an index and union
		 * the results; with one index, or none, it reads the whole table on every submission.
		 *
		 * Two separate indexes rather than one on both columns, because no single index serves an OR:
		 * a composite on (client_ip, email) cannot answer the email branch, whose leading column is
		 * missing. created_at trails the equality column in each, which is the order that lets one
		 * index do both halves of a branch — seek the address, then walk forward through the window.
		 *
		 * No backticks in here. This whole block is inside a template literal, and one would end it.
		 */
		CREATE INDEX IF NOT EXISTS booking_by_ip ON booking (client_ip, created_at);
		CREATE INDEX IF NOT EXISTS booking_by_email ON booking (email, created_at);

		-- Same-day closures. These live here rather than in the CMS on purpose: cancelling tomorrow
		-- because you are ill must not require a commit, a build and a deploy. A NULL start closes
		-- the whole day.
		CREATE TABLE IF NOT EXISTS closure (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			date       TEXT NOT NULL,
			start      TEXT,
			reason     TEXT NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL
		);

		CREATE INDEX IF NOT EXISTS closure_by_date ON closure (date);

		/*
		 * Enquiries from the contact form.
		 *
		 * The row is the record; the mail is only the notification. That order matters and is the
		 * reason this table exists at all — a provider that is down, a key that has expired, a
		 * domain whose DKIM has lapsed and quietly lands every message in spam, all look identical
		 * from inside this process, and all of them mean a person wrote to the studio and got no
		 * answer. Storing only the enquiries whose *send* failed would miss the worst of those,
		 * because a message that Resend accepts and Gmail bins is a success as far as we can see.
		 *
		 * So every enquiry is written before a single byte goes to the provider, and /admin/kontakt
		 * lists them whether or not their mail flew.
		 */
		CREATE TABLE IF NOT EXISTS enquiry (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			name       TEXT    NOT NULL,
			email      TEXT    NOT NULL,
			phone      TEXT    NOT NULL DEFAULT '',
			subject    TEXT    NOT NULL DEFAULT '',
			wish_date  TEXT    NOT NULL DEFAULT '',
			message    TEXT    NOT NULL DEFAULT '',
			page       TEXT    NOT NULL DEFAULT '',
			client_ip  TEXT    NOT NULL DEFAULT '',
			created_at INTEGER NOT NULL,
			handled_at INTEGER
		);

		CREATE INDEX IF NOT EXISTS enquiry_open ON enquiry (created_at) WHERE handled_at IS NULL;

		-- The rate limit's two lookups, matching booking's pair above for the same reasons.
		CREATE INDEX IF NOT EXISTS enquiry_by_ip ON enquiry (client_ip, created_at);
		CREATE INDEX IF NOT EXISTS enquiry_by_email ON enquiry (email, created_at);

		-- Mail waiting to go out. A row is written in the same transaction as the thing it is about,
		-- so a send that fails is a retry rather than a lost confirmation. See mail/outbox.server.ts.
		CREATE TABLE IF NOT EXISTS outbox (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			booking_id INTEGER REFERENCES booking (id),
			recipient  TEXT    NOT NULL,
			subject    TEXT    NOT NULL,
			body       TEXT    NOT NULL,
			attempts   INTEGER NOT NULL DEFAULT 0,
			last_error TEXT,
			sent_at    INTEGER,
			created_at INTEGER NOT NULL
		);

		CREATE INDEX IF NOT EXISTS outbox_unsent ON outbox (sent_at) WHERE sent_at IS NULL;
	`);

	// Added after the outbox already existed in production, so it cannot come from the CREATE above:
	// `CREATE TABLE IF NOT EXISTS` on a table that is already there is a no-op, columns and all.
	addColumn(d, 'outbox', 'enquiry_id', 'INTEGER REFERENCES enquiry (id)');
	// Which way to reply. Set on the studio's copy of an enquiry so hitting reply reaches the person
	// who wrote in, rather than the studio's own sending address.
	addColumn(d, 'outbox', 'reply_to', "TEXT NOT NULL DEFAULT ''");
}

/**
 * Add a column if it is not already there.
 *
 * SQLite has no `ADD COLUMN IF NOT EXISTS`, and this runs on every boot against a database that may
 * be brand new or may predate the column by months, so the check has to be explicit.
 */
function addColumn(d: Database.Database, table: string, column: string, definition: string): void {
	const columns = d.pragma(`table_info(${table})`) as Array<{ name: string }>;
	if (columns.some((entry) => entry.name === column)) return;

	console.log(`[db] adding ${table}.${column}`);
	d.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
