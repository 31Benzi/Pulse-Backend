import { db } from "../app/index";
import { and, eq, sql } from "drizzle-orm";

import fs from "fs/promises";
import path from "path";

import {
  increment,
  items,
  profileAttributes,
  profiles,
  profiles as profileTable,
  type Profile,
} from "../database/schema";

interface Item {
  templateId: string;
  attributes?: Record<string, unknown>;
  quantity?: number;
}

interface ProfileJson {
  rvn?: number;
  commandRevision?: number;
  items?: Record<string, Item>;
  stats?: { attributes?: Record<string, unknown> };
}

export async function createProfiles(accountId: string): Promise<void> {
  const folder = path.join(__dirname, "../json/templates/profiles");
  const files = await fs.readdir(folder);

  // Read all profiles
  const profilePromises = files
    .filter((file) => file.endsWith(".json"))
    .map(async (file) => {
      const profileId = file.slice(0, -5);
      const content = await fs.readFile(path.join(folder, file), "utf-8");
      return { profileId, json: JSON.parse(content) as ProfileJson };
    });

  const profilesa = await Promise.all(profilePromises);

  // Batch database inserts
  const profileInserts = [];
  const itemInserts = [];
  const attributeInserts = [];

  for (const { profileId, json } of profilesa) {
    profileInserts.push({
      accountId,
      profileId,
      revision: json.rvn ?? 0,
      commandRevision: json.commandRevision ?? 0,
    });

    // Regular items
    if (json.items) {
      for (const [
        templateId,
        { templateId: tplId, attributes = {}, quantity = 1 },
      ] of Object.entries(json.items)) {
        itemInserts.push({
          accountId,
          profileId,
          templateId: tplId || templateId,
          value: JSON.stringify(attributes),
          quantity,
        });
      }
    }

    // Locker items embedded in stats.attributes.items
    if (json.stats?.attributes?.items) {
      const embeddedItems = json.stats.attributes.items;
      for (const [templateId, itemData] of Object.entries<any>(embeddedItems)) {
        itemInserts.push({
          accountId,
          profileId,
          templateId,
          value: JSON.stringify(itemData.attributes ?? {}),
          quantity: itemData.quantity ?? 1,
        });
      }
      // remove embedded items after parsing so it doesn't end up as an attribute
      delete json.stats.attributes.items;
    }

    // Add locker loadouts as flat attributes for fallback parsing
    if (json.items) {
      for (const [templateId, itemData] of Object.entries(json.items)) {
        if (templateId.endsWith("-loadout")) {
          attributeInserts.push({
            accountId,
            profileId,
            key: templateId,
            value: JSON.stringify(itemData.attributes ?? {}),
          });
        }
      }
    }

    // Other attributes
    if (json.stats?.attributes) {
      for (const [key, value] of Object.entries(json.stats.attributes)) {
        attributeInserts.push({
          accountId,
          profileId,
          key,
          value: JSON.stringify(value),
        });
      }
    }
  }

  await Promise.all([
    profileInserts.length > 0 && db.insert(profiles).values(profileInserts),
    itemInserts.length > 0 && db.insert(items).values(itemInserts),
    attributeInserts.length > 0 &&
      db.insert(profileAttributes).values(attributeInserts),
  ]);
}

export async function giveFullLocker(accountId: string): Promise<void> {
  const profileId = "athena"; // Specific profile for full locker
  const fileName = "fullathena.json";
  const filePath = path.join(__dirname, "../json/templates", fileName);

  let jsonContent: ProfileJson;
  try {
    const content = await fs.readFile(filePath, "utf-8");
    jsonContent = JSON.parse(content) as ProfileJson;
  } catch (error) {
    console.error(`Failed to read or parse ${fileName}:`, error);
    throw new Error(`Could not load ${fileName} for account ${accountId}.`);
  }

  const newItemInserts: any[] = [];
  const newAttributeInserts: any[] = [];

  // 1. Fetch existing item templateIds for this specific profile to avoid duplicates
  const existingDbItems = await db
    .select({ templateId: items.templateId })
    .from(items)
    .where(and(eq(items.accountId, accountId), eq(items.profileId, profileId)));

  const existingTemplateIds = new Set(
    existingDbItems.map((item: any) => item.templateId)
  );

  // 2. Process regular items from fullathena.json
  if (jsonContent.items) {
    for (const [
      itemKey, // This is the primary key for the item in the JSON
      { templateId: tplId, attributes = {}, quantity = 1 },
    ] of Object.entries(jsonContent.items)) {
      const currentTemplateId = tplId || itemKey; // Use specific templateId if provided, else use the key

      if (!existingTemplateIds.has(currentTemplateId)) {
        newItemInserts.push({
          accountId,
          profileId,
          templateId: currentTemplateId,
          value: JSON.stringify(attributes),
          quantity,
        });
      }

      // Check if this item also defines a loadout attribute
      if (itemKey.endsWith("-loadout")) {
        newAttributeInserts.push({
          accountId,
          profileId,
          key: itemKey, // The key for loadout attributes is the itemKey itself
          value: JSON.stringify(attributes ?? {}),
        });
      }
    }
  }

  // 3. Process locker items embedded in stats.attributes.items
  if (jsonContent.stats?.attributes?.items) {
    const embeddedItems = jsonContent.stats.attributes.items;
    for (const [templateId, itemData] of Object.entries<any>(embeddedItems)) {
      if (!existingTemplateIds.has(templateId)) {
        newItemInserts.push({
          accountId,
          profileId,
          templateId, // For embedded items, the key is the templateId
          value: JSON.stringify(itemData.attributes ?? {}),
          quantity: itemData.quantity ?? 1,
        });
      }
    }
    // Remove embedded items after parsing so they don't end up as general attributes
    delete jsonContent.stats.attributes.items;
  }

  // 4. Process other attributes from stats.attributes
  // These will replace existing attributes for the profile.
  if (jsonContent.stats?.attributes) {
    for (const [key, value] of Object.entries(jsonContent.stats.attributes)) {
      newAttributeInserts.push({
        accountId,
        profileId,
        key,
        value: JSON.stringify(value),
      });
    }
  }

  // 5. Database Operations
  // Note: Consider using a transaction here if your database supports it for atomicity.

  // 5.a Update profile metadata (revision numbers)
  // This assumes the profile entry for 'athena' already exists for the account.
  // If it might not, you'd need an upsert or a check like in createProfiles.
  await db
    .update(profiles)
    .set({
      revision: jsonContent.rvn ?? 0,
      commandRevision: jsonContent.commandRevision ?? 0,
    })
    .where(
      and(eq(profiles.accountId, accountId), eq(profiles.profileId, profileId))
    );

  // 5.b Replace existing attributes for this profile with the new ones from fullathena.json
  await db
    .delete(profileAttributes)
    .where(
      and(
        eq(profileAttributes.accountId, accountId),
        eq(profileAttributes.profileId, profileId)
      )
    );

  if (newAttributeInserts.length > 0) {
    await db.insert(profileAttributes).values(newAttributeInserts);
  }

  // 5.c Insert only new items
  if (newItemInserts.length > 0) {
    await db.insert(items).values(newItemInserts);
  }

  console.log(
    `Full locker processed for account ${accountId} using profile ${profileId}.`
  );
}

const queryProfilePrepared = db
  .select()
  .from(profileTable)
  .where(
    and(
      eq(profileTable.accountId, sql.placeholder("accountId")),
      eq(profileTable.profileId, sql.placeholder("profileId"))
    )
  )
  .prepare("queryprofile");

export async function queryProfile(accountId: string, profileId: string) {
  const res = await queryProfilePrepared.execute({
    accountId: accountId,
    profileId: profileId,
  });

  return res[0] ?? null;
}

const queryProfileAttrPrepared = db
  .select()
  .from(profileAttributes)
  .where(
    and(
      eq(profileAttributes.accountId, sql.placeholder("accountId")),
      eq(profileAttributes.profileId, sql.placeholder("profileId"))
    )
  )
  .prepare("queryprofileattr");

export async function queryProfileAttr(accountId: string, profileId: string) {
  return (
    (await queryProfileAttrPrepared.execute({
      accountId: accountId,
      profileId: profileId,
    })) ?? null
  );
}

const querySpecificProfileAttributePrepared = db
  .select()
  .from(profileAttributes)
  .where(
    (eq(profileAttributes.accountId, sql.placeholder("accountId")),
    eq(profileAttributes.profileId, sql.placeholder("profileId")),
    eq(profileAttributes.key, sql.placeholder("key")))
  )
  .prepare("queryspecificprofleattr");

export async function querySpecificProfileAttribute(
  accountId: string,
  profileId: string,
  key: string
) {
  const [query] = await querySpecificProfileAttributePrepared.execute({
    accountId,
    profileId,
    key,
  });

  return query;
}

export const setSpecificProfileAttributeValuePrepared = db
  .update(profileAttributes)
  .set({
    value: sql`${sql.placeholder("value")}`,
  })
  .where(
    and(
      eq(profileAttributes.accountId, sql.placeholder("accountId")),
      eq(profileAttributes.profileId, sql.placeholder("profileId")),
      eq(profileAttributes.key, sql.placeholder("key"))
    )
  )
  .prepare("setSpecificProfileAttributeValuePrepared");

export async function getFullProfile(profile: Profile) {
  const itemRows = await db
    .select({
      templateId: items.templateId,
      value: items.value,
      quantity: items.quantity,
    })
    .from(items)
    .where(
      and(
        eq(items.profileId, profile.profileId),
        eq(items.accountId, profile.accountId)
      )
    );

  const attributesRows = await db
    .select({
      key: profileAttributes.key,
      value: profileAttributes.value,
    })
    .from(profileAttributes)
    .where(
      and(
        eq(profileAttributes.accountId, profile.accountId),
        eq(profileAttributes.profileId, profile.profileId)
      )
    );

  const attributesObj: any = attributesRows.reduce((acc, attr) => {
    try {
      acc[attr.key] =
        attr.value && typeof attr.value === "string"
          ? JSON.parse(attr.value)
          : null;
    } catch (parseError) {
      console.error(
        `Failed to parse profile attribute for key ${attr.key}:`,
        parseError
      );
      acc[attr.key] = null;
    }
    return acc;
  }, {} as any);

  const itemsObj: Record<
    string,
    { templateId: string; attributes: any; quantity?: number }
  > = itemRows.reduce((acc, item) => {
    try {
      const attributes =
        item.value && typeof item.value === "string"
          ? (JSON.parse(item.value) as any)
          : {};

      const quantity = item.quantity ?? 1;

      if (item.templateId === "CosmeticLocker:cosmeticlocker_athena") {
        acc["fortmp-loadout"] = {
          templateId: item.templateId,
          attributes: attributes,
          quantity: quantity,
        };
      } else {
        acc[item.templateId] = {
          templateId: item.templateId,
          attributes: attributes,
          quantity: quantity,
        };
      }
    } catch (parseError) {
      console.error(
        `Failed to parse item attributes for templateId ${item.templateId}:`,
        parseError
      );
    }
    return acc;
  }, {} as Record<string, any>);

  // Inject locker from attributes table if present
  if (attributesObj["fortmp-loadout"]) {
    itemsObj["fortmp-loadout"] = {
      templateId: "CosmeticLocker:cosmeticlocker_athena",
      attributes: attributesObj["fortmp-loadout"],
      quantity: 1,
    };
  }

  const currentRevision = profile.revision ?? 0;
  const fullProfile = {
    _id: profile.accountId,
    createdAt: profile.createdAt ?? new Date(0).toISOString(),
    updatedAt: profile.updatedAt ?? new Date(0).toISOString(),
    rvn: currentRevision,
    wipeNumber: 1,
    accountId: profile.accountId,
    profileId: profile.profileId,
    version: "no_version",
    items: itemsObj,
    stats: {
      attributes: attributesObj,
    },
    commandRevision: currentRevision,
  };

  return fullProfile;
}

export const increaseProfileRevisionPrepared = db
  .update(profiles)
  .set({
    updatedAt: new Date(),
    revision: increment(profiles.revision),
  })
  .where(
    and(
      eq(profiles.accountId, sql.placeholder("accountId")),
      eq(profiles.profileId, sql.placeholder("profileId"))
    )
  )
  .prepare("increaseProfileRevisionPrepared");

export const increaseProfileCommandRevisionPrepared = db
  .update(profiles)
  .set({
    updatedAt: new Date(),
    commandRevision: increment(profiles.commandRevision),
  })
  .where(
    and(
      eq(profiles.accountId, sql.placeholder("accountId")),
      eq(profiles.profileId, sql.placeholder("profileId"))
    )
  )
  .prepare("increaseProfileCommandRevisionPrepared");
