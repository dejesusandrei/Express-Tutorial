/**
 * ============================================================================
 * A fake "mailbox" for tests
 * ============================================================================
 * The real email service would print to the terminal (or send real emails).
 * In tests we replace it with a version that puts each email in this list, so
 * a test can read the link, take the token out of it, and use it, just like a
 * real user clicking the link in their inbox.
 *
 * (This file must NOT import the app. It is used inside vi.mock, and importing
 * the app from here would create a loop.)
 * ============================================================================
 */
export type SentEmail = { to: string; link: string };

export const outbox = {
  verification: [] as SentEmail[],
  reset: [] as SentEmail[],
};

export const clearOutbox = (): void => {
  outbox.verification.length = 0;
  outbox.reset.length = 0;
};