import app from "..";

import fs from "fs";
import path from "path";

import { db } from "..";

import { storefrontEntries } from "../../database/schema";
import { getCurrentShop } from "../../shop/shopHandler";

const keychainPath = path.join(__dirname, "../../json/keychain.json");
const parsedKeychain = JSON.parse(fs.readFileSync(keychainPath, "utf-8"));

app.get("/fortnite/api/storefront/v2/keychain", async (c) => {
  return c.json(parsedKeychain);
});

app.get("/fortnite/api/storefront/v2/catalog", async (c) => {
  const shop = await getCurrentShop();

  return c.json(shop);
});

app.get("/catalog/api/shared/bulk/offers", async (c) => {
  return c.json([]);
});

app.post("/priceengine/api/shared/offers/price", async (c) => {
  return c.json([]);
});
