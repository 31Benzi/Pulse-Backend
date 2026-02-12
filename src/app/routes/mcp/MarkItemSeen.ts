import { eq, and, inArray } from "drizzle-orm";
import app from "../..";
import { db } from "../../index";
import {
  profiles as profileTable,
  items as itemsTable,
} from "../../../database/schema";
import { queryProfile } from "../../../database/profileManager.ts";

app.post(
  "/fortnite/api/game/v2/profile/:accountId/client/MarkItemSeen",
  async (c) => {
    const accountId = c.req.param("accountId");
    const profileId = c.req.query("profileId");
    const body = await c.req.json().catch(() => null);

    if (
      !accountId ||
      !profileId ||
      !body ||
      !Array.isArray(body.itemIds)
    ) {
      return c.json({});
    }

    const itemIds = body.itemIds;
    const profile = await queryProfile(accountId, profileId);
    if (!profile) return c.json({});

    const changes = [];

    for (const itemId of itemIds) {
      const [itemRow] = await db
        .select()
        .from(itemsTable)
        .where(
          and(
            eq(itemsTable.accountId, accountId),
            eq(itemsTable.profileId, profileId),
            eq(itemsTable.templateId, itemId)
          )
        );

      if (!itemRow) continue;

      const valueObj = JSON.parse(itemRow.value);

      if (valueObj.item_seen !== true) {
        valueObj.item_seen = true;

        await db
          .update(itemsTable)
          .set({ value: JSON.stringify(valueObj) })
          .where(eq(itemsTable.id, itemRow.id));

        changes.push({
          changeType: "itemAttrChanged",
          itemId: itemId,
          attributeName: "item_seen",
          attributeValue: true,
        });
      }
    }

    const newRevision = (profile.revision ?? 0) + 1;

    await db
      .update(profileTable)
      .set({ revision: newRevision })
      .where(
        and(
          eq(profileTable.accountId, accountId),
          eq(profileTable.profileId, profileId)
        )
      );

    return c.json({
      profileRevision: newRevision,
      profileId,
      profileChangesBaseRevision: profile.revision ?? 0,
      profileChanges: changes,
      profileCommandRevision: 0,
      serverTime: new Date().toISOString(),
      responseVersion: 1,
    });
  }
);