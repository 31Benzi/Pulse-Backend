import { eq, and, inArray, sql } from "drizzle-orm";
import app from "../..";
import { db } from "../../index";
import {
  profiles as profileTable,
  profileAttributes,
  items as itemsTable,
} from "../../../database/schema";
import {
  queryProfileAttr,
  queryProfile,
} from "../../../database/profileManager.ts";
import { verifyUser } from "../../../database/tokenManager.ts";
import { FortMP } from "../../../utils/error.ts";

// Constants for slot types and favorite keys
const SLOT_CONFIG = {
  Dance: { favoriteKey: "favorite_dance", isArray: true },
  ItemWrap: { favoriteKey: "favorite_itemwraps", isArray: true },
  // Add other slot types as needed
} as const;

// Default favorite key prefix
const DEFAULT_FAVORITE_PREFIX = "favorite_";

// Validate slot name and get config
function getSlotConfig(slotName: string) {
  for (const [key, config] of Object.entries(SLOT_CONFIG)) {
    if (slotName.includes(key)) return config;
  }
  return {
    favoriteKey: `${DEFAULT_FAVORITE_PREFIX}${slotName.toLowerCase()}`,
    isArray: false,
  };
}

// Interface for request body
interface EquipCustomizationBody {
  slotName: string;
  itemToSlot: string;
  indexWithinSlot?: number;
  variantUpdates?: unknown[];
}

const searchItemPrepared = db
  .select()
  .from(itemsTable)
  .where(
    and(
      eq(itemsTable.accountId, sql.placeholder("accountId")),
      eq(itemsTable.templateId, sql.placeholder("templateId"))
    )
  )
  .prepare("searchitemprepared");

app.post(
  "/fortnite/api/game/v2/profile/:accountId/client/EquipBattleRoyaleCustomization",
  async (c) => {
    try {
      // Validate inputs
      const accountId = c.req.param("accountId");
      const profileId = c.req.query("profileId");
      const body = await c.req.json<EquipCustomizationBody>().catch(() => null);
      if (!accountId || !profileId || !body) {
        return c.sendError(FortMP.basic.badRequest);
      }

      const { slotName, itemToSlot, indexWithinSlot, variantUpdates } = body;
      if (!slotName) {
        return c.sendError(
          FortMP.basic.badRequest.withMessage("slotName was not found")
        );
      }

      if (typeof itemToSlot != "string")
        return c.sendError(
          FortMP.basic.badRequest.withMessage("itemToSlot is not a string!")
        );
      if (typeof slotName != "string")
        return c.sendError(
          FortMP.basic.badRequest.withMessage("slotName is not a string!")
        );

      const isRandom = itemToSlot.includes("random");
      const { favoriteKey, isArray } = getSlotConfig(slotName);

      // Validate indexWithinSlot for array slots
      if (
        isArray &&
        indexWithinSlot !== undefined &&
        !Number.isInteger(indexWithinSlot)
      ) {
        return c.sendError(
          FortMP.basic.badRequest.withMessage(
            "indexWithinSlot is not an integer!"
          )
        );
      }

      // Fetch profile and attributes in parallel
      const [profile, attrRes] = await Promise.all([
        queryProfile(accountId, profileId),
        queryProfileAttr(accountId, profileId),
      ]);

      if (!profile) {
        return c.sendError(FortMP.mcp.profileNotFound);
      }

      // Check item ownership if not random
      if (!isRandom && itemToSlot != "") {
        console.log(itemToSlot);
        const [owned] = await searchItemPrepared.execute({
          accountId: accountId,
          templateId: itemToSlot,
        });

        if (!owned) {
          return c.sendError(FortMP.mcp.itemNotFound);
        }
      }

      // Map attributes
      const attrMap: Record<string, any> = Object.fromEntries(
        attrRes.map((a) => [a.key, JSON.parse(a.value)])
      );

      // Update attribute value
      if (isArray && indexWithinSlot !== undefined) {
        attrMap[favoriteKey] = attrMap[favoriteKey] ?? [];
        attrMap[favoriteKey][indexWithinSlot] = itemToSlot;
      } else {
        attrMap[favoriteKey] = itemToSlot;
      }

      const stringified = JSON.stringify(attrMap[favoriteKey]);
      const newRevision = (profile.revision ?? 0) + 1;
      const newCommandRevision = (profile.commandRevision ?? 0) + 1;

      // Perform database updates in a transaction
      await db.transaction(async (tx) => {
        const existingAttr = attrRes.find((a) => a.key === favoriteKey);
        if (existingAttr) {
          await tx
            .update(profileAttributes)
            .set({ value: stringified })
            .where(
              and(
                eq(profileAttributes.accountId, accountId),
                eq(profileAttributes.profileId, profileId),
                eq(profileAttributes.key, favoriteKey)
              )
            );
        } else {
          await tx.insert(profileAttributes).values({
            accountId,
            profileId,
            key: favoriteKey,
            value: stringified,
          });
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

        await tx
          .update(profileTable)
          .set({ commandRevision: newCommandRevision })
          .where(
            and(
              eq(profileTable.accountId, accountId),
              eq(profileTable.profileId, profileId)
            )
          );
      });

      // Return response
      return c.json({
        profileRevision: newRevision,
        profileId,
        profileChangesBaseRevision: profile.revision ?? 0,
        profileChanges: [
          {
            changeType: "statModified",
            name: favoriteKey,
            value: attrMap[favoriteKey],
          },
        ],
        profileCommandRevision: newCommandRevision,
        serverTime: new Date().toISOString(),
        responseVersion: 1,
      });
    } catch (error) {
      console.error("Error in EquipBattleRoyaleCustomization:", error);
      return c.json({ error: "Internal server error" }, 500);
    }
  }
);
