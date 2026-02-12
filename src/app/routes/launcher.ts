import { eq } from "drizzle-orm";
import app, { db } from "..";
import client from "../../bot";
import { getUserByAccountId } from "../../database/accountManager";
import {
  giveFullLocker,
  queryProfile,
  querySpecificProfileAttribute,
} from "../../database/profileManager";
import { news, users, type User } from "../../database/schema";
import { AES256Encryption } from "../../utils/hashing";

const fetchNewsPrepared = db.select().from(news).prepare("fetchNewsPrepared");

const LAUNCHER_VERSION = "0.1.2";
const LAUNCHER_URL = "";
const LAUNCHER_SIG_URL = "";

app.get("/fortmp/api/launcher/:version", async (c) => {
  const version = c.req.param("version");

  if (version == LAUNCHER_VERSION) return c.sendStatus(204);

  const file = await fetch(LAUNCHER_SIG_URL).then((r) => r.text());

  return c.json({
    version: LAUNCHER_VERSION,
    pub_date: new Date().toISOString(),
    url: LAUNCHER_URL,
    signature: file,
    notes: "New Pulse Launcher",
  });
});

app.get("/fortmp/api/launcher/news", async (c) => {
  const fetchedNews = await fetchNewsPrepared.execute();

  if (!fetchedNews) return c.json({ error: "failed to fetch news" }, 400);

  return c.json({ news: fetchedNews });
});

app.post("/fortmp/api/launcher/verify", async (c) => {
  const body = await c.req.json();

  if (!body.token) return c.json({ error: "param 'token' not found" }, 400);

  const decrypted = await AES256Encryption.decrypt(
    body.token,
    "80HH7O7WPOVNBDAYB3RFMACWHH22S6GA",
  );

  const json: User = JSON.parse(decrypted);

  const user = await getUserByAccountId(json.accountId);

  if (!user) return c.json({ error: "user not found" }, 400);

  const skin = await querySpecificProfileAttribute(
    json.accountId,
    "athena",
    "favorite_character",
  );

  const fortmp = await client.guilds.cache.get(
    process.env.DISCORD_GUILD_ID as string,
  );

  if (!fortmp) return c.json({ error: "Guild not found" }, 400);

  const member = await fortmp.members.cache.get(user.discordId);

  if (!member) return c.json({ error: "Failed to find user in guild" }, 400);

  // TODO: REMOVE THIS ON RELEASE

  const roleIdsToCheck = [
    "1261918532375941181",
    "1370465279657906176",
    "1280942403460792330",
    "1287512230585303152",
  ];

  const hasRole = roleIdsToCheck.some((roleId) =>
    member.roles.cache.has(roleId),
  );

  if (!hasRole) return c.json({ error: "Failed to meet requirements." }, 400);
  else if (!user.isDonator && hasRole) {
    await db
      .update(users)
      .set({
        isDonator: true,
      })
      .where(eq(users.accountId, user.accountId));

    const premiumOrBasicRoles = ["premium", "basic"];
    const hasPremiumOrBasicRole = premiumOrBasicRoles.some((roleName) =>
      member.roles.cache.some((role) => role.name === roleName),
    );

    if (hasPremiumOrBasicRole) {
      await giveFullLocker(user.accountId);
    }
  }

  return c.json({
    user: {
      accountId: user.accountId,
      discordId: user.discordId,
      username: user.username,
      exchange_code: user.exchange_code,
      stats: user.stats,
    },
    discord: {
      highestRole: member.roles.highest.name,
      highestRoleColor: member.roles.highest.hexColor,
    },
    profile: {
      favorite_character: skin.value,
    },
  });
});
