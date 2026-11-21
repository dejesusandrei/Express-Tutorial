import { beforeEach, describe, expect, it, vi } from "vitest";

import { query } from "../../src/utils/databaseQueryHelper.js";
import { resetDatabase } from "../helpers/db.js";
import { clearOutbox } from "../helpers/emailOutbox.js";
import {
  createVerifiedUser,
  deleteAs,
  get,
  getAs,
  loginUser,
  postAs,
  putAs,
} from "../helpers/http.js";

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
 * INTEGRATION TESTS: tasks (ownership, validation, pagination)
 * ============================================================================
 * Two users, Alice and Bob. The big question for every test:
 * "Can Bob see or change something that belongs to Alice?" The answer must
 * always be NO (and the API must answer 404, as if the task did not exist).
 * ============================================================================
 */

const ALICE = "alice@example.com";
const BOB = "bob@example.com";
const PASSWORD = "correct-horse-battery";

type TaskBody = {
  id: string;
  owner_id: string;
  title: string;
  completed: boolean;
};

let aliceToken: string;
let bobToken: string;

const tokenFor = async (email: string): Promise<string> => {
  const res = await loginUser(email, PASSWORD);
  return res.body.data.accessToken;
};

const idOf = async (email: string): Promise<string> => {
  const { rows } = await query<{ id: string }>(
    "SELECT id FROM users WHERE email = $1",
    [email]
  );
  return rows[0].id;
};

const createTask = async (token: string, title = "Buy rice"): Promise<TaskBody> => {
  const res = await postAs("/api/tasks", token).send({ title });
  expect(res.status).toBe(201);
  return res.body.data.task;
};

beforeEach(async () => {
  await resetDatabase();
  clearOutbox();
  vi.spyOn(console, "error").mockImplementation(() => {});

  await createVerifiedUser(ALICE, PASSWORD);
  await createVerifiedUser(BOB, PASSWORD);

  aliceToken = await tokenFor(ALICE);
  bobToken = await tokenFor(BOB);
});

describe("login is required", () => {
  it("listing tasks without a token -> 401", async () => {
    expect((await get("/api/tasks")).status).toBe(401);
  });

  it("creating a task without a token -> 401", async () => {
    const res = await postAs("/api/tasks", "").send({ title: "Buy rice" });

    expect(res.status).toBe(401);
  });
});

describe("ownership (IDOR protection)", () => {
  it("the owner comes from the TOKEN, even if the body says otherwise", async () => {
    const bobId = await idOf(BOB);
    const aliceId = await idOf(ALICE);

    const res = await postAs("/api/tasks", aliceToken).send({
      title: "Buy rice",
      owner_id: bobId, // an attacker trying to plant a task in Bob's account
    });

    expect(res.status).toBe(201);
    expect(res.body.data.task.owner_id).toBe(aliceId);
  });

  it("Bob cannot READ Alice's task: 404 (not 403, so its existence isn't revealed)", async () => {
    const task = await createTask(aliceToken);

    const res = await getAs(`/api/tasks/${task.id}`, bobToken);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("TASK_NOT_FOUND");
  });

  it("Bob cannot UPDATE Alice's task, and it stays unchanged", async () => {
    const task = await createTask(aliceToken, "Alice only");

    const res = await putAs(`/api/tasks/${task.id}`, bobToken).send({
      title: "Hacked by Bob",
      completed: true,
    });

    expect(res.status).toBe(404);

    const { rows } = await query<{ title: string; completed: boolean }>(
      "SELECT title, completed FROM tasks WHERE id = $1",
      [task.id]
    );
    expect(rows[0]).toEqual({ title: "Alice only", completed: false });
  });

  it("Bob cannot DELETE Alice's task, and it is still there", async () => {
    const task = await createTask(aliceToken);

    const res = await deleteAs(`/api/tasks/${task.id}`, bobToken);

    expect(res.status).toBe(404);

    const { rows } = await query("SELECT 1 FROM tasks WHERE id = $1", [task.id]);
    expect(rows).toHaveLength(1);
  });

  it("the list shows only MY tasks", async () => {
    await createTask(aliceToken, "Alice one");
    await createTask(aliceToken, "Alice two");
    await createTask(bobToken, "Bob one");

    const res = await getAs("/api/tasks", bobToken);

    expect(res.status).toBe(200);
    expect(res.body.data.tasks).toHaveLength(1);
    expect(res.body.data.tasks[0].title).toBe("Bob one");
    expect(res.body.pagination.totalItems).toBe(1);
  });

  it("an update cannot move a task to another owner", async () => {
    const bobId = await idOf(BOB);
    const aliceId = await idOf(ALICE);
    const task = await createTask(aliceToken);

    await putAs(`/api/tasks/${task.id}`, aliceToken).send({
      title: "Still mine",
      completed: true,
      owner_id: bobId,
    });

    const { rows } = await query<{ owner_id: string }>(
      "SELECT owner_id FROM tasks WHERE id = $1",
      [task.id]
    );
    expect(rows[0].owner_id).toBe(aliceId);
  });
});

describe("the owner can manage their own tasks", () => {
  it("reads, updates, and deletes their own task", async () => {
    const task = await createTask(aliceToken, "Write report");

    const read = await getAs(`/api/tasks/${task.id}`, aliceToken);
    expect(read.status).toBe(200);
    expect(read.body.data.task.title).toBe("Write report");

    const update = await putAs(`/api/tasks/${task.id}`, aliceToken).send({
      title: "Write report v2",
      completed: true,
    });
    expect(update.status).toBe(200);
    expect(update.body.data.task).toMatchObject({
      title: "Write report v2",
      completed: true,
    });

    const del = await deleteAs(`/api/tasks/${task.id}`, aliceToken);
    expect(del.status).toBe(200);

    const again = await deleteAs(`/api/tasks/${task.id}`, aliceToken);
    expect(again.status).toBe(404);
  });
});

describe("input validation", () => {
  it("a title of only spaces is rejected on create", async () => {
    const res = await postAs("/api/tasks", aliceToken).send({ title: "     " });

    expect(res.status).toBe(400);
  });

  it("a title of only spaces is rejected on UPDATE too (needs trim)", async () => {
    const task = await createTask(aliceToken);

    const res = await putAs(`/api/tasks/${task.id}`, aliceToken).send({
      title: "     ",
      completed: false,
    });

    expect(res.status).toBe(400);
  });

  it("a title that is too long is rejected", async () => {
    const res = await postAs("/api/tasks", aliceToken).send({
      title: "a".repeat(101),
    });

    expect(res.status).toBe(400);
  });

  it("the same limits apply on update (create and update agree)", async () => {
    const task = await createTask(aliceToken);

    const res = await putAs(`/api/tasks/${task.id}`, aliceToken).send({
      title: "a".repeat(101),
      completed: false,
    });

    expect(res.status).toBe(400);
  });

  it("completed must be a boolean", async () => {
    const res = await postAs("/api/tasks", aliceToken).send({
      title: "Buy rice",
      completed: "yes",
    });

    expect(res.status).toBe(400);
  });

  it("a malformed task id is a 400, not a 500", async () => {
    const res = await getAs("/api/tasks/not-a-uuid", aliceToken);

    expect(res.status).toBe(400);
  });

  it("unknown fields are dropped, not saved or returned", async () => {
    const res = await postAs("/api/tasks", aliceToken).send({
      title: "Buy rice",
      isAdmin: true,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.task).not.toHaveProperty("isAdmin");
  });
});

describe("pagination", () => {
  it("splits the list into pages and reports the totals", async () => {
    await createTask(aliceToken, "Task 1");
    await createTask(aliceToken, "Task 2");
    await createTask(aliceToken, "Task 3");

    const first = await getAs("/api/tasks?page=1&limit=2", aliceToken);
    expect(first.status).toBe(200);
    expect(first.body.data.tasks).toHaveLength(2);
    expect(first.body.pagination).toMatchObject({
      currentPage: 1,
      limit: 2,
      totalItems: 3,
      totalPages: 2,
    });

    const second = await getAs("/api/tasks?page=2&limit=2", aliceToken);
    expect(second.body.data.tasks).toHaveLength(1);
  });

  it("newest first", async () => {
    await createTask(aliceToken, "first");
    await createTask(aliceToken, "second");

    const res = await getAs("/api/tasks", aliceToken);
    const titles = res.body.data.tasks.map((task: TaskBody) => task.title);

    expect(titles).toEqual(["second", "first"]);
  });

  it("a huge limit is rejected or capped, never honored", async () => {
    const res = await getAs("/api/tasks?limit=100000", aliceToken);

    // Either a 400, or a capped page. Never "give me 100000 rows".
    const rejected = res.status === 400;
    const capped = res.status === 200 && res.body.pagination.limit <= 100;

    expect(rejected || capped).toBe(true);
  });

  it("an absurd page number doesn't crash the server", async () => {
    const res = await getAs("/api/tasks?page=999999999999", aliceToken);

    expect(res.status).toBeLessThan(500);
  });

  it("page and limit must be numbers", async () => {
    const res = await getAs("/api/tasks?page=abc&limit=xyz", aliceToken);

    expect(res.status).toBe(400);
  });
});