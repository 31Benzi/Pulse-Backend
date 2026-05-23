import { v4 as guid } from "uuid";
import { db } from "../app";
import { storefrontEntries } from "../database/schema";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import path from "path";
import { promises as fs } from "fs";

const backpacks = JSON.parse(
  await fs.readFile(path.resolve(__dirname, "../json/backpacks.json"), "utf-8")
) as Record<string, string>;

const displayAssetsPath = path.resolve(__dirname, "../json/displayassets.json");
const displayAssetsMap = JSON.parse(
  await fs.readFile(displayAssetsPath, "utf-8")
) as Record<string, string>;

const setTracker: Record<string, number> = {};

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

export async function addEntryToShop(
  cosmeticId: string,
  backendValue: string,
  price: number,
  category: string,
  storeFront: "Daily" | "Weekly",
  displayAssetPath: string = "",
  backpackId: string = ""
) {
  const section =
    storeFront === "Daily" ? "BRDailyStorefront" : "BRWeeklyStorefront";

  await db.insert(storefrontEntries).values({
    storefront: section,
    backendType: backendValue,
    offerId: `item://${crypto.randomUUID()}`,
    cosmeticId,
    price,
    categories: JSON.stringify([category]),
    displayAssetPath: storeFront === "Weekly" ? displayAssetPath : "",
    backpackId,
    title: "",
    description: "",
    shortDescription: "",
  });

  console.log(`Added ${cosmeticId} to ${storeFront} storefront in DB`);
}

export async function getShopItemsFromDate(date: string): Promise<{
  featured: { name: string; price: number }[];
  daily: { name: string; price: number }[];
}> {
  const url = `https://fnbr.co/shop/${date}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const extractItems = (
    sectionTitle: string
  ): { name: string; price: number }[] => {
    const items: { name: string; price: number }[] = [];
    $(`h2.shop-section-title:contains("${sectionTitle}")`)
      .next(".items-row")
      .find(".item-display")
      .each((_, el) => {
        const name = $(el).find(".item-name span").text().trim();
        const priceText = $(el)
          .find(".item-price")
          .text()
          .replace(/[^\d]/g, "");
        const price = parseInt(priceText, 10);
        if (name) items.push({ name, price: isNaN(price) ? 0 : price });
      });
    return items;
  };

  return {
    featured: extractItems("Featured Items"),
    daily: extractItems("Daily Items"),
  };
}

export async function getCosmeticDetails(
  cosmeticName: string
): Promise<[string, string, string, string, string]> {
  const url = `https://fortnite-api.com/v2/cosmetics/br/search?name=${encodeURIComponent(
    cosmeticName
  )}&responseFlags=1`;

  const response = await fetch(url);
  type CosmeticApiResponse = {
    data?: {
      id?: string;
      type?: { backendValue?: string };
      set?: { value?: string; backendValue?: string };
    };
  };

  const responseJson = (await response.json()) as CosmeticApiResponse;
  const data = responseJson.data;

  if (!response.ok || !data) {
    console.warn(`⚠️ Could not find cosmetic: "${cosmeticName}"`);
    return [cosmeticName, "UnknownType", "UnknownCategory", "UnknownSet", ""];
  }

  const cosmeticId = data.id ?? cosmeticName;
  const backendValue = data.type?.backendValue ?? "UnknownType";
  const category = data.set?.value ?? "Miscellaneous";
  let set = data.set?.backendValue ?? "UnknownSet";

  setTracker[set] = (setTracker[set] || 0) + 1;
  if (setTracker[set] > 1) set = `${set}_#${setTracker[set]}`;

  const displayAssetPath = displayAssetsMap[cosmeticId] ?? "";

  return [cosmeticId, backendValue, category, set, displayAssetPath];
}

export async function constructShopForDate(date: string) {
  await db.delete(storefrontEntries);
  console.log(`🧹 Cleared existing storefront entries.`);

  const { featured, daily } = await getShopItemsFromDate(date);

  for (const { name, price } of [...featured, ...daily]) {
    const [cosmeticId, backendValue, category, set, displayAssetPath] =
      await getCosmeticDetails(name);
    const storeFront: "Daily" | "Weekly" = featured.some((i) => i.name === name)
      ? "Weekly"
      : "Daily";
    const backpackId = backpacks[cosmeticId] ?? "";

    await addEntryToShop(
      cosmeticId,
      backendValue,
      price,
      storeFront === "Weekly" ? category : "",
      storeFront,
      displayAssetPath,
      backpackId
    );
  }

  console.log(`Finished constructing shop for ${date}`);
}

export async function getCurrentShop() {
  const entries = await db.select().from(storefrontEntries);
  const uniqueEntries = new Map<string, (typeof entries)[number]>();

  for (const entry of entries) {
    const key = `${entry.cosmeticId}:${entry.storefront}`;
    if (!uniqueEntries.has(key)) uniqueEntries.set(key, entry);
  }

  const grouped: Record<string, any[]> = {};

  const displayAssetsV2 = (await Bun.file(
    "src/json/displayAssetsv2.json"
  ).json()) as any[];

  for (const entry of uniqueEntries.values()) {
    const section = entry.storefront;
    if (!grouped[section]) grouped[section] = [];

    const found = displayAssetsV2.find(
      (asset) => asset.characterCID === entry.cosmeticId
    ) ?? {
      derivedDisplayAssetName: "DAv2_Default",
    };

    const displayAssetV2 = found.derivedDisplayAssetName;

    const itemGrants = [
      { templateId: `${entry.backendType}:${entry.cosmeticId}`, quantity: 1 },
    ];

    if (entry.backpackId && section === "Weekly") {
      itemGrants.push({
        templateId: `AthenaBackpack:${entry.backpackId}`,
        quantity: 1,
      });
    }

    console.log(displayAssetV2);

    grouped[section].push({
      offerId: entry.offerId,
      offerType: "StaticPrice",
      devName: `[VIRTUAL]1x ${entry.backendType}:${entry.cosmeticId} for ${entry.price} MtxCurrency`,
      itemGrants,
      requirements: [
        {
          requirementType: "DenyOnItemOwnership",
          requiredId: `${entry.backendType}:${entry.cosmeticId}`,
          minQuantity: 1,
        },
      ],
      categories: JSON.parse((entry.categories as string) || "[]"),
      metaInfo: [
        {
          key: "NewDisplayAssetPath",
          value: `/Game/Catalog/NewDisplayAssets/${displayAssetV2}.${displayAssetV2}`,
        },
        {
          key: "SectionId",
          value: section == "BRWeeklyStorefront" ? "Featured" : "Daily",
        },
        {
          key: "TitleSize",
          value: "Normal",
        },
      ],
      meta: {
        NewDisplayAssetPath: `/Game/Catalog/NewDisplayAssets/${displayAssetV2}.${displayAssetV2}`,
        SectionId: section == "BRWeeklyStorefront" ? "Featured" : "Daily",
        TitleSize: "Normal",
      },
      prices: [
        {
          currencyType: "MtxCurrency",
          regularPrice: entry.price,
          finalPrice: entry.price,
        },
      ],
      bannerOverride: "12PercentExtra",
      displayAssetPath: `/Game/Catalog/DisplayAssets/DA_${entry.cosmeticId}.DA_${entry.cosmeticId}`,
      refundable: true,
      title: entry.title,
      description: entry.description,
      shortDescription: entry.shortDescription,
    });
  }

  const expiration = "9999-12-31T23:59:59.999Z";

  return {
    refreshIntervalHrs: 1,
    dailyPurchaseHrs: 24,
    expiration,
    storefronts: Object.entries(grouped).map(([name, catalogEntries]) => ({
      name,
      catalogEntries,
    })),
  };
}

export async function getOfferFromShop(offerId: string) {
  const shop = await getCurrentShop();

  for (const storefront of shop.storefronts) {
    const offer = storefront.catalogEntries.find(
      (entry) => entry.offerId === offerId
    );
    if (offer) return { storefront: storefront.name, offerId: offer };
  }
}
