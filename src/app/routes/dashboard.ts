import { Hono } from "hono";
import app, { db } from "..";
import { servers, users } from "../../database/schema";
import { eq } from "drizzle-orm"; 
import { profile } from "console";
import {
  giveFullLocker,
  queryProfile,
  querySpecificProfileAttribute,
} from "../../database/profileManager";

const dashboardApp = new Hono();

dashboardApp.get("/users", async (c) => {
  const queriedUsers = await db.select().from(users).limit(50);

  const updatedData = queriedUsers.map(
    ({ password, exchange_code, ...rest }) => rest
  );

  return c.json(updatedData);
});

dashboardApp.get("/users/:accountId", async (c) => {
  const accountId = c.req.param("accountId");

  if (!accountId) {
    return c.json({ error: "Account ID is required" }, 400);
  }

  const queriedUser = await db
    .select()
    .from(users)
    .where(eq(users.accountId, accountId))
    .limit(1);

  if (queriedUser.length === 0) {
    return c.json({ error: "User not found" }, 404);
  }

  const skin = await querySpecificProfileAttribute(
    accountId,
    "athena",
    "favorite_character"
  );

  const { password, exchange_code, ...rest } = queriedUser[0];

  return c.json({ ...rest, skin });
});

dashboardApp.get("/servers", async (c) => {
  const queriedServers = await db.select().from(servers).limit(50);

  return c.json(queriedServers);
});

app.route("/fortmp/api/dashboard", dashboardApp);
