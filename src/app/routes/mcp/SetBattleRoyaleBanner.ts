import app from "../..";
import { db } from "../../index";
import { eq, and } from "drizzle-orm";
import { profileAttributes, profiles as profileTable } from "../../../database/schema";
import { queryProfile, queryProfileAttr } from "../../../database/profileManager";
import { verifyUser } from "../../../database/tokenManager";

app.post(
  "/fortnite/api/game/v2/profile/:accountId/client/SetBattleRoyaleBanner",
  verifyUser,
  async (c) => {
    try {
      const accountId = c.req.param("accountId");
      const profileId = c.req.query("profileId");
      const body = await c.req.json().catch(() => null);

      if (!accountId || !profileId || !body) {
        return c.json({ error: "Missing required parameters" }, 400);
      }

      const { homebaseBannerColorId, homebaseBannerIconId } = body;

      if (!homebaseBannerColorId && !homebaseBannerIconId) {
        return c.json({ error: "No banner updates provided" }, 400);
      }

      const [profile, attrRes] = await Promise.all([
        queryProfile(accountId, profileId),
        queryProfileAttr(accountId, profileId),
      ]);

      if (!profile) {
        return c.json({ error: "Profile not found" }, 404);
      }

      const attrMap: Record<string, any> = Object.fromEntries(
        attrRes.map((a: { key: string; value: string }) => [a.key, JSON.parse(a.value)])
      );

      const changes = [];

      if (homebaseBannerColorId) {
        attrMap["banner_color"] = homebaseBannerColorId;
        changes.push({
          changeType: "statModified",
          name: "banner_color",
          value: homebaseBannerColorId,
        });
      }

      if (homebaseBannerIconId) {
        attrMap["banner_icon"] = homebaseBannerIconId;
        changes.push({
          changeType: "statModified",
          name: "banner_icon",
          value: homebaseBannerIconId,
        });
      }

      const newRevision = (profile.revision ?? 0) + 1;

      await db.transaction(async (tx) => {
        for (const [key, value] of Object.entries(attrMap)) {
          if (key !== "banner_color" && key !== "banner_icon") continue;

          const existing = attrRes.find((a: { key: string; value: string }) => a.key === key);

          if (existing) {
            await tx
              .update(profileAttributes)
              .set({ value: JSON.stringify(value) })
              .where(
                and(
                  eq(profileAttributes.accountId, accountId),
                  eq(profileAttributes.profileId, profileId),
                  eq(profileAttributes.key, key)
                )
              );
          } else {
            await tx.insert(profileAttributes).values({
              accountId,
              profileId,
              key,
              value: JSON.stringify(value),
            });
          }
        }

        await tx
          .update(profileTable)
          .set({ revision: newRevision })
          .where(
            and(
              eq(profileTable.accountId, accountId),
              eq(profileTable.profileId, profileId)
            )
          );
      });

      return c.json({
        profileRevision: newRevision,
        profileId,
        profileChangesBaseRevision: profile.revision ?? 0,
        profileChanges: changes,
        profileCommandRevision: 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1,
      });
    } catch (error) {
      console.error("Error in SetBattleRoyaleBanner:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  }
);
