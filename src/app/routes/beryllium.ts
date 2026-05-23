import app, { db } from "..";
import { FortMP } from "../../utils/error";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { TokenManager } from "../../database/tokenManager";
import { users, type User } from "../../database/schema";
import { eq } from "drizzle-orm";
import logger from "../../utils/logger";
import { getUserByAccountId } from "../../database/accountManager";
import { EmbedBuilder, WebhookClient } from "discord.js";

const authHeaderSchema = z.object({
  "user-agent": z.literal("Beryllium/1.0", { message: "Bad Request" }),
  "beryllium-token": z.literal("lsxNz0idKXsk9fpIYkG4eHHr1Q5t2yVF2fmrekZiQFuq", {
    message: "Bad Request",
  }),
});

const webhookClient = new WebhookClient({
  url: "https://discord.com/api/webhooks/1380645358161498192/JiK4ehNOM1OsBbls5dWuGeRu59w1GAHodHAPEFPi9Kt_Rd4gMoNqP3o9VZmNezObkmmq",
});

type WebhookEventType = "ban" | "detection";

export async function sendToWebhook(
  event: WebhookEventType,
  user: User,
  message: string
) {
  const embed = new EmbedBuilder()
    .setTitle(event === "ban" ? "🚫 Ban Issued" : "⚠️ Detection Logged")
    .addFields(
      { name: "Username", value: user.username, inline: true },
      { name: "Account ID", value: user.accountId, inline: true },
      { name: "Discord ID", value: user.discordId || "Unknown", inline: true },
      ...(user.hwid ? [{ name: "HWID", value: user.hwid, inline: false }] : []),
      { name: "Reason", value: message, inline: false }
    )
    .setTimestamp()
    .setColor(event === "ban" ? 0xff0000 : 0xffcc00);

  try {
    await webhookClient.send({
      username: "Beryllium Security",
      embeds: [embed],
    });
  } catch (err) {
    console.error("Failed to send webhook:", err);
  }
}

const tokenSchema = z.object({
  token: z.string(),
});

const banSchema = tokenSchema.extend({
  message: z.string(),
});

// --- BANNING ROUTE ---
app.post(
  "/beryllium/api/v1/ban",
  zValidator("json", banSchema),
  zValidator("header", authHeaderSchema),
  async (c) => {
    const { token, message } = c.req.valid("json");

    const tkn = await TokenManager.GetTokenByToken(token, "access_token");
    if (!tkn) return c.body(null, 204);

    const user = await getUserByAccountId(tkn.accountId);
    if (!user) return c.body(null, 204);

    await db
      .update(users)
      .set({ banned: true })
      .where(eq(users.accountId, user.accountId));

    logger.warn(`User ${user.accountId} banned: ${message}`);
    await sendToWebhook("ban", user, message);

    return c.body(null, 204);
  }
);

// --- DETECTION ROUTE (NO BAN) ---
app.post(
  "/beryllium/api/v1/detection",
  zValidator("json", banSchema),
  zValidator("header", authHeaderSchema),
  async (c) => {
    const { token, message } = c.req.valid("json");

    const tkn = await TokenManager.GetTokenByToken(token, "access_token");
    if (!tkn) return c.body(null, 204);

    const user = await getUserByAccountId(tkn.accountId);
    if (!user) return c.body(null, 204);

    logger.warn(`Detection report for ${user.accountId}: ${message}`);
    await sendToWebhook("detection", user, message);

    return c.body(null, 204);
  }
);

// --- DEAUTH ROUTE ---
app.post(
  "/beryllium/api/v1/deauth",
  zValidator("json", tokenSchema),
  zValidator("header", authHeaderSchema),
  async (c) => {
    const { token } = c.req.valid("json");

    const tkn = await TokenManager.GetTokenByToken(token, "access_token");
    if (!tkn) return c.body(null, 204);

    await TokenManager.ResetAllTokensForAccountID(tkn.accountId);
    logger.info(`User deauthed: ${tkn.accountId}`);

    return c.body(null, 204);
  }
);
