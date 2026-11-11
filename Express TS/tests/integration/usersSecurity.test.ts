
import { beforeEach, describe, expect, it, vi } from "vitest";

import { query } from "../../src/utils/databaseQueryHelper.js";
import { resetDatabase } from "../helpers/db.js";
import { clearOutbox } from "../helpers/emailOutbox.js";
import {
  createVerifiedUser,
  get,
  getAs,
  loginUser,
} from "../helpers/http.js";

// I-mock ang email service para hindi totoong email ang ipadala.
// Sa halip, ise-save lang ang email details sa outbox para magamit sa tests.
vi.mock("../../src/services/email.service.js", async () => {
  const { outbox } = await import("../helpers/emailOutbox.js");

  return {
    sendVerificationEmail: async (to: string, link: string) => {
      outbox.verification.push({ to, link });
    },
    sendPasswordResetEmail: async (to: string, link: string) => {
      outbox.reset.push({ to, link });
    },
  };
});

/**
 * ============================================================================
 * INTEGRATION TESTS: ACCESS CONTROL AND DATA PRIVACY
 * ============================================================================
 *
 * Dito natin chine-check kung sino lang ang puwedeng mag-access ng user data.
 *
 * Tinitingnan din natin kung may sensitive information tulad ng password hash
 * na aksidenteng naibabalik ng API.
 *
 * Example: Dapat hindi makita ng ordinary user ang listahan ng lahat ng users
 * o ang password hash ng ibang account.
 * ============================================================================
 */

// Email at password ng mga test accounts.
const USER_EMAIL = "juan@example.com";
const ADMIN_EMAIL = "admin@example.com";
const PASSWORD = "correct-horse-battery";

// Mag-login gamit ang email at ibalik ang access token.
// Promise<string> means na ang function ay magbabalik ng string pagkatapos
// nitong matapos ang asynchronous login request.
const loginAs = async (email: string): Promise<string> => {
  const res = await loginUser(email, PASSWORD);

  // Kunin ang access token mula sa response ng login.
  return res.body.data.accessToken;
};

// Kunin ang user ID gamit ang email.
// Ginagamit natin ito para makapag-test ng routes na nangangailangan ng user ID.
const idOf = async (email: string): Promise<string> => {
  const { rows } = await query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email]
  );

  // Ibalik ang ID ng unang user na nahanap sa database.
  return rows[0].id;
};

// Tatakbo ito bago ang bawat test para malinis at consistent ang test data.
beforeEach(async () => {
  // Linisin ang database para walang data na maiwan mula sa previous test.
  await resetDatabase();

  // Linisin ang mga mock email na na-save sa outbox.
  clearOutbox();

  // Patahimikin muna ang console.error para hindi magulo ang test output.
  vi.spyOn(console, "error").mockImplementation(() => {});

  // Gumawa ng dalawang verified accounts para sa access control tests.
  await createVerifiedUser(USER_EMAIL, PASSWORD);
  await createVerifiedUser(ADMIN_EMAIL, PASSWORD);

  // Gawing admin ang pangalawang account.
  // Ginagawa ito directly sa database para makapag-test tayo ng admin access.
  await query("UPDATE users SET role = 'admin' WHERE email = $1", [ADMIN_EMAIL]);
});

describe("GET /api/users (the list of ALL users)", () => {
  it("needs a login", async () => {
    // Subukan kunin ang lahat ng users nang walang access token.
    const res = await get("/api/users");

    // Dapat 401 dahil hindi authenticated ang request.
    expect(res.status).toBe(401);
  });

  it("is forbidden for a normal user", async () => {
    // Mag-login bilang normal user at gamitin ang kanyang access token.
    const res = await getAs("/api/users", await loginAs(USER_EMAIL));

    // Dapat 403 dahil hindi allowed ang normal user sa route na ito.
    expect(res.status).toBe(403);
  });

  it("works for an admin, but NEVER includes password hashes", async () => {
    // Mag-login bilang admin para makuha ang listahan ng lahat ng users.
    const res = await getAs("/api/users", await loginAs(ADMIN_EMAIL));

    // Dapat successful ang request ng admin.
    expect(res.status).toBe(200);

    // Gawing string ang buong response para madaling hanapin
    // kung may sensitive information na kasama.
    const body = JSON.stringify(res.body);

    expect(body).toContain(USER_EMAIL); // Siguraduhing kasama ang user sa listahan.
    expect(body).not.toContain("password_hash"); // Hindi dapat kasama ang password_hash field.
    expect(body).not.toContain("$argon2"); // Hindi rin dapat makita ang mismong Argon2 hash.
  });
});

describe("GET /api/users/:id (someone else's account)", () => {
  it("is forbidden for a normal user (no reading other people's accounts)", async () => {
    // Kunin ang ID ng admin account.
    const adminId = await idOf(ADMIN_EMAIL);

    // Subukan ng normal user na tingnan ang account ng admin.
    const res = await getAs(
      `/api/users/${adminId}`,
      await loginAs(USER_EMAIL)
    );

    // Dapat 403 dahil hindi puwedeng tingnan ng normal user
    // ang account ng ibang user.
    expect(res.status).toBe(403);
  });

  it("never includes the password hash, even for an admin", async () => {
    // Kunin ang ID ng normal user.
    const userId = await idOf(USER_EMAIL);

    // Gamitin ang admin token para tingnan ang account ng normal user.
    const res = await getAs(
      `/api/users/${userId}`,
      await loginAs(ADMIN_EMAIL)
    );

    // Dapat successful ang request ng admin.
    expect(res.status).toBe(200);

    // Kahit admin ang gumagamit, hindi pa rin dapat ibalik ang password hash.
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
    expect(JSON.stringify(res.body)).not.toContain("$argon2");
  });
});

describe("GET /api/users/me", () => {
  it("returns my own data without the password hash", async () => {
    // Kunin ang sariling account details gamit ang sariling access token.
    const res = await getAs("/api/users/me", await loginAs(USER_EMAIL));

    // Dapat successful ang request.
    expect(res.status).toBe(200);

    // Siguraduhing kasama ang sariling email sa response.
    expect(JSON.stringify(res.body)).toContain(USER_EMAIL);

    // Hindi dapat kasama ang password hash sa response.
    expect(JSON.stringify(res.body)).not.toContain("password_hash");
    expect(JSON.stringify(res.body)).not.toContain("$argon2");
  });
});

describe("DELETE /api/users/:id", () => {
  it("is forbidden for a normal user", async () => {
    // Kunin ang ID ng admin account na susubukang i-delete.
    const adminId = await idOf(ADMIN_EMAIL);

    // Mag-login bilang normal user para makakuha ng access token.
    const token = await loginAs(USER_EMAIL);

    // I-import ang Supertest at Express app para makapag-send ng DELETE request.
    // Dynamic import ang tawag dito dahil gumagamit tayo ng await sa import.
    const { default: request } = await import("supertest");
    const { default: app } = await import("../../src/app.js");

    // Subukang i-delete ang admin account gamit ang normal user's token.
    const res = await request(app)
      .delete(`/api/users/${adminId}`)
      .set("Authorization", `Bearer ${token}`);

    // Dapat 403 dahil walang permission ang normal user na mag-delete.
    expect(res.status).toBe(403);

    // I-check kung nandiyan pa rin ang admin sa database.
    // SELECT 1 checks kung may matching record, without retrieving all its data.
    const { rows } = await query("SELECT 1 FROM users WHERE id = $1", [adminId]);

    // Dapat isang record pa rin ang makita dahil hindi successful ang deletion.
    expect(rows).toHaveLength(1);
  });
});
