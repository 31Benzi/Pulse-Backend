import { eq, sql, and } from "drizzle-orm";
import app, { db } from "../..";
import {
  decrement,
  items,
  profileAttributes,
  profiles,
  storefrontEntries,
  type Profile,
} from "../../../database/schema";
import { FortMP } from "../../../utils/error";
import { getUserByAccountId } from "../../../database/accountManager";
import {
  getFullProfile,
  increaseProfileCommandRevisionPrepared,
  increaseProfileRevisionPrepared,
  queryProfile,
  querySpecificProfileAttribute,
} from "../../../database/profileManager";
import { increment } from "../../../database/schema";
import { getOfferFromShop } from "../../../shop/shopHandler";
import { XMPPClient } from "../../../sockets/xmpp/xmpp-client";

const queryCatalogEntryPrepared = db
  .select()
  .from(storefrontEntries)
  .where(eq(storefrontEntries.offerId, sql.placeholder("offerId")))
  .prepare("querycatalogentryprepared");

interface MultiUpdate {
  profileRevision: number;
  profileId: string;
  profileChangesBaseRevision: number;
  profileChanges: object[];
  profileCommandRevision: number;
}

interface Notifications {
  type: string;
  primary: boolean;
  lootResult: { items: any[] };
}

app.post(
  "/fortnite/api/game/v2/profile/:accountId/client/PurchaseCatalogEntry",
  async (c) => {
    const { accountId } = c.req.param();
    const { profileId } = c.req.query();
    const body = await c.req.json();
    if (!accountId || !profileId || !body) {
      return c.sendError(FortMP.basic.badRequest);
    }

    const user = await getUserByAccountId(accountId);

    if (!user) return c.sendError(FortMP.account.accountNotFound);

    const [profile, athenaProfile] = await Promise.all([
      queryProfile(accountId, profileId),
      queryProfile(accountId, "athena"),
    ]);

    if (!profile || !athenaProfile)
      return c.sendError(FortMP.mcp.profileNotFound);

    let multiUpdate: MultiUpdate[] = [
      {
        profileRevision: athenaProfile.revision || 0,
        profileId: "athena",
        profileChangesBaseRevision: athenaProfile.revision || 0,
        profileChanges: [],
        profileCommandRevision: athenaProfile.revision || 0,
      },
    ];
    let notifications: Notifications[] = [];
    let applyProfileChanges: object[] = [];

    const offer = await getOfferFromShop(body.offerId);

    if (!offer) return c.sendError(FortMP.mcp.itemNotFound);

    if (/^BR(Daily|Weekly|Season)Storefront$/.test(offer.storefront)) {
      notifications.push({
        type: "CatalogPurchase",
        primary: true,
        lootResult: { items: [] },
      });

      for (let value of offer.offerId.itemGrants) {
        // TODO: check if user has item already

        const itemToInsert = {
          templateId: value.templateId,
          attributes: {
            item_seen: false,
            variants: [],
          },
          quantity: 1,
        };

        await db.insert(items).values({
          accountId,
          profileId: "athena",
          templateId: value.templateId,
          value: JSON.stringify(itemToInsert.attributes),
        });

        multiUpdate[0].profileChanges.push({
          changeType: "itemAdded",
          itemId: value.templateId,
          item: itemToInsert,
        });

        notifications[0].lootResult.items.push({
          itemType: value.templateId,
          itemGuid: value.templateId,
          itemProfile: "athena",
          quantity: 1,
        });
      }

      if (offer.offerId.prices[0].currencyType.toLowerCase() == "mtxcurrency") {
        const [newMtx] = await db
          .update(items)
          .set({
            quantity: decrement(
              items.quantity,
              offer.offerId.prices[0].finalPrice
            ),
          })
          .where(
            and(
              eq(items.accountId, accountId),
              eq(items.profileId, profileId),
              eq(items.templateId, "Currency:MtxPurchased")
            )
          )
          .returning();

        XMPPClient.sendXMPPMessageToClient(
          {
            type: "com.epicgames.gift.received",
            payload: {},
            timestamp: new Date(),
          },
          user.accountId
        );

        applyProfileChanges.push({
          changeType: "itemQuantityChanged",
          itemId: newMtx.templateId,
          quantity: newMtx.quantity,
        });
      }

      if (multiUpdate[0].profileChanges.length > 0) {
        await increaseProfileRevisionPrepared.execute({
          accountId,
          profileId: "athena",
        });

        await increaseProfileCommandRevisionPrepared.execute({
          accountId,
          profileId: "athena",
        });

        multiUpdate[0].profileRevision = (athenaProfile.revision || 0) + 1;
        multiUpdate[0].profileCommandRevision =
          (athenaProfile.revision || 0) + 1;
      }
    }

    if (applyProfileChanges.length > 0) {
      await increaseProfileRevisionPrepared.execute({
        accountId,
        profileId,
      });

      await increaseProfileCommandRevisionPrepared.execute({
        accountId,
        profileId,
      });
    }

    const fullProfile = await getFullProfile(profile);

    applyProfileChanges = [
      {
        changeType: "fullProfileUpdate",
        profile: fullProfile,
      },
    ];

    return c.json({
      profileRevision: profile.revision || 0,
      profileId: profile,
      profileChangesBaseRevision: (profile.revision || 0) - 1,
      profileChanges: applyProfileChanges,
      notifications: notifications,
      profileCommandRevision: profile.commandRevision || 0,
      serverTime: new Date().toISOString(),
      multiUpdate: multiUpdate,
      responseVersion: 1,
    });
  }
);
