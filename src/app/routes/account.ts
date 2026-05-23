import app from "..";

import { users } from "../../database/schema";
import { db } from "..";
import { eq } from "drizzle-orm";
import { createError, FortMP } from "../../utils/error";
import {
  getUserByAccountId,
  getUserByUsername,
} from "../../database/accountManager";

app.get("/account/api/public/account/:accountId", async (c) => {
  const accountId = c.req.param("accountId");

  if (!accountId) {
    return createError(
      "errors.com.epicgames.account.account_not_found",
      "The account was not found.",
      1008
    );
  }

  const result = await db
    .select()
    .from(users)
    .where(eq(users.accountId, accountId));
  if (result.length === 0) {
    return createError(
      "errors.com.epicgames.account.account_not_found",
      "The account was not found.",
      1008
    );
  }

  const user = result[0];

  if (user.banned) {
    return createError(
      "errors.com.epicgames.account.account_not_active",
      "You have been permanently banned from Fortnite.",
      1011
    );
  }

  await db
    .update(users)
    .set({ lastLogin: new Date() })
    .where(eq(users.accountId, accountId))
    .execute();

  return c.json({
    ageGroup: "UNKNOWN",
    cabinedMode: false,
    canUpdateDisplayName: false,
    canUpdateDisplayNameNext: user.createdAt?.toISOString(),
    country: "US",
    displayName: user.username,
    email: user.email,
    emailVerified: true,
    failedLoginAttempts: 0,
    hasHashedEmail: false,
    headless: false,
    id: accountId,
    lastDeclinedMFASetup: user.createdAt?.toISOString(),
    lastDisplayNameChange: user.createdAt?.toISOString(),
    lastLogin: new Date().toISOString(),
    lastName: user.username,
    lastReviewedSecuritySettings: user.createdAt?.toISOString(),
    minorExpected: false,
    minorStatus: "NOT_MINOR",
    minorVerified: false,
    name: user.username,
    numberOfDisplayNameChanges: 0,
    preferredLanguage: "en",
    siweNotificationEnabled: true,
    tfaEnabled: true,
  });
});

app.get("/account/api/public/account/displayName/:displayName", async (c) => {
  const { displayName } = c.req.param();

  const user = await getUserByUsername(displayName);

  if (!user) return c.sendError(FortMP.account.accountNotFound);

  return c.json({
    id: user.accountId,
    displayName: user.username,
    externalAuths: {},
  });
});

app.post("/fortnite/api/game/v2/tryPlayOnPlatform/account/:accountId", (c) => {
  return c.text("true");
});

app.get("/launcher/api/public/distributionpoints/", (c) => {
  return c.json({
        "distributions": [
            "https://epicgames-download1.akamaized.net/",
            "https://download.epicgames.com/",
            "https://download2.epicgames.com/",
            "https://download3.epicgames.com/",
            "https://download4.epicgames.com/",
        ]
    });
});

app.get("/account/api/public/account", async (c) => {
  const accountId = c.req.query("accountId");
  if (!accountId) {
    return createError(
      "errors.com.epicgames.common.missing_account_id",
      "Account ID is required.",
      1001
    );
  }

  const user = await getUserByAccountId(accountId);
  if (!user) {
    return createError(
      "errors.com.epicgames.account.account_not_found",
      "This account does not exist.",
      18010
    );
  }

  return c.json([
    {
      id: user.accountId,
      displayName: user.username,
      cabinedMode: false,
      externalAuths: {},
    },
  ]);
});
