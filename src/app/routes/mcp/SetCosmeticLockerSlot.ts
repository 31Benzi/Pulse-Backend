import { eq, and, sql, inArray } from "drizzle-orm";
import app from "../.."; // Assuming 'app' is your Hono or Express app instance
import { db } from "../../index"; // Assuming 'db' is your Drizzle ORM instance
import {
  profiles as profileTable,
  profileAttributes,
  items as itemsTable,
} from "../../../database/schema";
import {
  queryProfileAttr,
  queryProfile,
} from "../../../database/profileManager.ts";
import { FortMP } from "../../../utils/error.ts";

interface EquipCustomizationBody {
  category: string;
  itemToSlot: string;
  lockerItem: string;
  optLockerUseCountOverride?: number;
  slotIndex?: number;
  variantUpdates?: Array<{ channel: string; active: any; itemKey?: string }>; // itemKey is optional, assuming variantUpdates apply to itemToSlot
}

// Prepared statement to search for a specific item (used for ownership check)
const searchItemPrepared = db
  .select({ templateId: itemsTable.templateId }) // Only select templateId for existence check
  .from(itemsTable)
  .where(
    and(
      eq(itemsTable.accountId, sql.placeholder("accountId")),
      eq(itemsTable.templateId, sql.placeholder("templateId"))
    )
  )
  .prepare("searchitemprepared_optimized");

// Prepared statement to fetch minimal item data for an account
const minimalItemsForAccountPrepared = db
  .select({
    templateId: itemsTable.templateId,
    value: itemsTable.value, // JSON string of attributes
    quantity: itemsTable.quantity,
  })
  .from(itemsTable)
  .where(eq(itemsTable.accountId, sql.placeholder("accountId")))
  .prepare("minimalitemsforaccountprepared_optimized");

app.post(
  "/fortnite/api/game/v2/profile/:accountId/client/SetCosmeticLockerSlot",
  async (c) => {
    try {
      const accountId = c.req.param("accountId");
      const profileId = c.req.query("profileId") || "athena";
      const body = await c.req.json<EquipCustomizationBody>().catch(() => null);

      if (
        !accountId ||
        !body ||
        body.itemToSlot === undefined ||
        !body.category ||
        !body.lockerItem
      ) {
        return c.sendError(FortMP.basic.badRequest);
      }

      const {
        itemToSlot,
        category,
        lockerItem,
        slotIndex = 0,
        variantUpdates = [],
      } = body;

      // --- Optimization 1: Parallelize initial data fetching ---
      const initialDataPromises: [
        ReturnType<typeof queryProfile>,
        ReturnType<typeof queryProfileAttr>,
        ReturnType<typeof minimalItemsForAccountPrepared.execute>,
        ReturnType<typeof searchItemPrepared.execute> | Promise<undefined>
      ] = [
        queryProfile(accountId, profileId),
        queryProfileAttr(accountId, profileId),
        minimalItemsForAccountPrepared.execute({ accountId }),
        itemToSlot && !itemToSlot.includes("random")
          ? searchItemPrepared.execute({ accountId, templateId: itemToSlot })
          : Promise.resolve(undefined), // No need to check ownership if item is "random" or not specified for check
      ];

      const [
        profileResult, // Renamed to avoid conflict with 'profile' variable name later
        attrRes,
        itemsRes, // Contains all items for the account with minimal data
        ownedItemResult, // Result of the ownership check for itemToSlot
      ] = await Promise.all(initialDataPromises);

      const profile = profileResult; // Assign to original name
      if (!profile) {
        return c.sendError(FortMP.mcp.profileNotFound);
      }

      // Check ownership of itemToSlot if it's not "random"
      if (itemToSlot && !itemToSlot.includes("random")) {
        if (!ownedItemResult || ownedItemResult.length === 0) {
          return c.sendError(
            FortMP.mcp.itemNotFound.withMessage(
              `Item to slot '${itemToSlot}' not found or not owned by account '${accountId}'.`
            )
          );
        }
      }

      // Build attribute map (key-value store from profileAttributes)
      const attrMap: Record<string, any> = {};
      for (const attr of attrRes) {
        try {
          attrMap[attr.key] = JSON.parse(attr.value as string);
        } catch (e) {
          console.error(`Failed to parse attribute ${attr.key}:`, e);
          // Potentially skip this attribute or handle error appropriately
        }
      }

      const loadoutNames: string[] = attrMap.loadouts || [];
      if (!loadoutNames.includes(lockerItem)) {
        return c.sendError(
          FortMP.mcp.itemNotFound.withMessage(
            `Locker item '${lockerItem}' not found in profile loadouts.`
          )
        );
      }

      // --- Optimization 2: Efficient Item Map and Locker Name Map creation ---
      const itemMap: Record<string, any> = {}; // Maps templateId to item data
      const lockerNameMap: Record<string, any> = {}; // Maps locker_name to item data for quick lookup

      for (const item of itemsRes) {
        // itemsRes now contains only selected fields
        if (!item.templateId) continue; // Should not happen if schema enforces templateId
        try {
          const parsedAttributes = JSON.parse(item.value as string); // 'value' is the JSON string of attributes
          const fullItemData = {
            templateId: item.templateId,
            attributes: parsedAttributes,
            quantity: item.quantity ?? 1,
          };
          itemMap[item.templateId] = fullItemData;

          // Populate lockerNameMap for items that are cosmetic lockers and have a locker_name
          if (
            item.templateId.startsWith("CosmeticLocker:") &&
            parsedAttributes?.locker_name
          ) {
            lockerNameMap[parsedAttributes.locker_name] = fullItemData;
          }
        } catch (e) {
          console.error(
            `Failed to parse item attributes for ${item.templateId}:`,
            e
          );
          // Continue processing other items
        }
      }

      // --- Optimization 3: Optimized Locker Item Resolution ---
      let locker: any = itemMap[lockerItem]; // Try direct lookup by templateId

      if (!locker) {
        // If not found by templateId, try lookup by locker_name
        locker = lockerNameMap[lockerItem];
      }

      if (!locker && attrMap[lockerItem]) {
        // Fallback to profile attributes if still not found
        // This case implies lockerItem might be a direct attribute key (e.g. a global/default locker setting)
        // rather than an item from the itemsTable.
        try {
          locker = {
            templateId: lockerItem, // The key itself acts as a templateId in this context
            attributes: attrMap[lockerItem], // The value of the attribute is the locker's data
            quantity: 1, // Default quantity
          };
        } catch (e) {
          console.error(
            `Failed to construct locker from attrMap for key ${lockerItem}:`,
            e
          );
        }
      }

      if (!locker) {
        return c.sendError(
          FortMP.mcp.itemNotFound.withMessage(
            `Locker item '${lockerItem}' not found in items or profile attributes.`
          )
        );
      }

      // Ensure locker_slots_data and slots exist
      locker.attributes = locker.attributes || {};
      locker.attributes.locker_slots_data = locker.attributes
        .locker_slots_data || { slots: {} };
      const slots = locker.attributes.locker_slots_data.slots;

      // Create a mutable copy for modifications
      const newSlotsData = JSON.parse(JSON.stringify(slots));

      if (!newSlotsData[category]) {
        newSlotsData[category] = { items: [], activeVariants: [] };
      }

      // Logic for updating slots based on category
      if (category === "Dance") {
        if (
          !Array.isArray(newSlotsData[category].items) ||
          newSlotsData[category].items.length !== 6
        ) {
          newSlotsData[category].items = new Array(6).fill("");
        }
        newSlotsData[category].items[slotIndex] = itemToSlot;
      } else if (category === "ItemWrap") {
        if (
          !Array.isArray(newSlotsData[category].items) ||
          newSlotsData[category].items.length !== 7
        ) {
          newSlotsData[category].items = new Array(7).fill("");
        }
        if (slotIndex === -1) {
          // Apply to all slots for ItemWrap
          for (let i = 0; i < 7; i++)
            newSlotsData[category].items[i] = itemToSlot;
        } else {
          newSlotsData[category].items[slotIndex] = itemToSlot;
        }
      } else {
        // For other categories, it's usually a single item array
        newSlotsData[category].items = [itemToSlot];
      }

      locker.attributes.locker_slots_data.slots = newSlotsData;

      const changes: any[] = [];
      let itemBeingModified = itemMap[itemToSlot]; // Get the item that might have its variants updated

      if (
        variantUpdates &&
        variantUpdates.length > 0 &&
        itemToSlot &&
        !itemToSlot.includes("random")
      ) {
        if (itemBeingModified && itemBeingModified.attributes) {
          itemBeingModified.attributes.variants =
            itemBeingModified.attributes.variants || [];
          const currentVariants = itemBeingModified.attributes
            .variants as Array<{ channel: string; active: any }>;

          for (const update of variantUpdates) {
            let existingVariant = currentVariants.find(
              (v) => v.channel === update.channel
            );
            if (existingVariant) {
              existingVariant.active = update.active;
            } else {
              currentVariants.push({
                channel: update.channel,
                active: update.active,
              });
            }
          }
          // itemBeingModified.attributes.variants is already updated by reference.

          changes.push({
            changeType: "itemAttrChanged",
            itemId: itemToSlot,
            attributeName: "variants",
            attributeValue: itemBeingModified.attributes.variants,
          });

          // Update activeVariants in the locker slot data
          // Ensure the structure matches what the client/game expects
          if (newSlotsData[category]) {
            newSlotsData[category].activeVariants = [
              {
                variants: variantUpdates.map((v) => ({
                  channel: v.channel,
                  active: v.active,
                })),
              },
            ];
          }
        } else {
          console.warn(
            `Item ${itemToSlot} not found in itemMap for variant updates, or has no attributes.`
          );
        }
      }

      // Update locker_slots_data in the locker item itself
      locker.attributes.locker_slots_data.slots = newSlotsData;

      const newRevision = (profile.revision ?? 0) + 1;
      const newCommandRevision = (profile.commandRevision ?? 0) + 1;

      // Database transaction for updates
      await db.transaction(async (tx) => {
        // Update the locker item (either in itemsTable or profileAttributes)
        if (itemMap[locker.templateId] || lockerNameMap[locker.templateId]) {
          // Check if locker originated from itemsTable
          await tx
            .update(itemsTable)
            .set({ value: JSON.stringify(locker.attributes) })
            .where(
              and(
                eq(itemsTable.accountId, accountId),
                eq(itemsTable.profileId, profileId), // Assuming profileId is relevant for items too
                eq(itemsTable.templateId, locker.templateId)
              )
            );
        } else if (attrMap[locker.templateId]) {
          // Check if locker originated from profileAttributes
          await tx
            .update(profileAttributes)
            .set({ value: JSON.stringify(locker.attributes) })
            .where(
              and(
                eq(profileAttributes.accountId, accountId),
                eq(profileAttributes.profileId, profileId),
                eq(profileAttributes.key, locker.templateId)
              )
            );
        }
        // else: locker source is unclear or it's a new dynamic locker not yet persisted? Handle if necessary.

        // Update the item whose variants were changed, if different from the locker item
        // and if it was actually found and modified.
        if (
          itemBeingModified &&
          itemBeingModified.templateId !== locker.templateId &&
          changes.some(
            (ch) => ch.itemId === itemToSlot && ch.attributeName === "variants"
          )
        ) {
          await tx
            .update(itemsTable)
            .set({ value: JSON.stringify(itemBeingModified.attributes) })
            .where(
              and(
                eq(itemsTable.accountId, accountId),
                eq(itemsTable.profileId, profileId), // Assuming profileId context
                eq(itemsTable.templateId, itemBeingModified.templateId)
              )
            );
        }

        // Update profile revision
        await tx
          .update(profileTable)
          .set({ revision: newRevision, commandRevision: newCommandRevision })
          .where(
            and(
              eq(profileTable.accountId, accountId),
              eq(profileTable.profileId, profileId)
            )
          );
      });

      // Add the change for the locker item's slots
      changes.push({
        changeType: "itemAttrChanged",
        itemId: locker.templateId, // Use the actual templateId of the locker
        attributeName: "locker_slots_data",
        attributeValue: locker.attributes.locker_slots_data,
      });

      const response = {
        profileRevision: newRevision,
        profileId,
        profileChangesBaseRevision: profile.revision ?? 0,
        profileChanges: changes,
        profileCommandRevision: newCommandRevision,
        serverTime: new Date().toISOString(),
        responseVersion: 1,
      };

      return c.json(response);
    } catch (err) {
      console.error("Error in SetCosmeticLockerSlot:", err);
      // Avoid sending detailed error messages to the client in production
      return c.json(
        {
          error: "Internal Server Error",
          errorCode: "errors.com.epicgames.fortnite.internal_server_error",
        },
        500
      );
    }
  }
);

export default app; // Or however you export your app
