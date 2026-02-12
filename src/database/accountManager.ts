import { db } from "../app/index";
import { users } from "./schema";
import { eq, sql } from "drizzle-orm";

import { createProfiles } from "./profileManager";

export async function createUser(
  username: string,
  email: string,
  password: string = "abc123",
  discordId: string = "0"
) {
  if (discordId === "0") discordId = crypto.randomUUID().replace(/-/g, "");

  const result = await db
    .insert(users)
    .values({
      accountId: crypto.randomUUID().replace(/-/g, ""),
      username,
      email,
      discordId,
      password: await Bun.password.hash(password),
      exchange_code: crypto.randomUUID().replace(/-/g, ""),
      banned: false,
      lastIP: null,
      hwid: null,
    })
    .returning();

  if (result[0].accountId) {
    await createProfiles(result[0].accountId);
  } else {
    throw new Error("Account ID is null");
  }

  return result[0];
}

export async function banUser(username: string, reason: string) {
  const user = await db
    .select({ banHistory: users.banHistory })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);

  const history = Array.isArray(user[0]?.banHistory) ? user[0]?.banHistory : [];

  const updatedHistory = [
    ...history,
    { reason, date: new Date().toISOString() },
  ];

  const result = await db
    .update(users)
    .set({
      banned: true,
      banHistory: updatedHistory,
    })
    .where(eq(users.username, username))
    .returning();

  return result[0];
}

export async function unbanUser(username: string) {
  const result = await db
    .update(users)
    .set({
      banned: false,
    })
    .where(eq(users.username, username))
    .returning();

  return result[0];
}

export async function getUserByAccountId(accountId: string) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.accountId, accountId))
    .limit(1);

  return result[0] ?? null;
}

const getUserBydiscordIdQuery = db
  .select()
  .from(users)
  .where(eq(users.discordId, sql.placeholder("discordId")))
  .prepare("getUserBydiscordIdQuery");

export async function getUserByDiscordId(discordId: string) {
  const res = await getUserBydiscordIdQuery.execute({ discordId: discordId });
  return res[0] ?? null;
}

const getUserByUsernameQuery = db
  .select()
  .from(users)
  .where(eq(users.username, sql.placeholder("username")))
  .prepare("usernamequery");

export async function getUserByUsername(username: string) {
  const res = await getUserByUsernameQuery.execute({ username: username });
  return res[0] ?? null;
}

const getUserByEmailQuery = db
  .select()
  .from(users)
  .where(eq(users.email, sql.placeholder("email")))
  .prepare("emailquery");

export async function getUserByEmail(email: string) {
  const res = await getUserByEmailQuery.execute({ email: email });
  return res[0] ?? null;
}

export async function getUserbyExchangeCode(exchange_code: string) {
  const result = await db
    .select()
    .from(users)
    .where(eq(users.exchange_code, exchange_code))
    .limit(1);

  return result[0] ?? null;
}
