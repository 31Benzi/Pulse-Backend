import { Hono } from "hono";

import fs from "fs/promises";
import path from "path";
import log from "../utils/logger";

import { createError } from "../utils/error";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { Pool } from "pg";
import { logger } from "hono/logger";

import middleware from "../utils/middleware";
import {
  constructShopForDate,
  getShopItemsFromDate,
} from "../shop/shopHandler";
import { createUser } from "../database/accountManager";
import { generateFullProfile, getAllCosmetics } from "../utils/profileGen";

export const db = drizzle(process.env.DATABASE_URL!);

export const app = new Hono();
export default app;

app.use("*", middleware());
app.use(logger());

async function pushRoutes(dir: string): Promise<void> {
  const entries = await fs.readdir(path.join(import.meta.dir, dir), {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const fullPath = path.join(import.meta.dir, dir, entry.name);

    if (entry.isDirectory()) {
      await pushRoutes(path.join(dir, entry.name));
    } else if (
      !entry.name.includes("disabled-") &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))
    ) {
      try {
        await import(fullPath);
        log.info(`Loaded route: ${entry.name}`);
      } catch (err) {
        log.error(`Failed to load ${entry.name}: ${err}`);
      }
    }
  }
}

async function startDatabase(): Promise<void> {
  try {
    log.info("Drizzle database client initialized.");

    await db.execute(sql`SELECT NOW();`);
    log.info("DB connection verified.");

    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);

    import("../sockets/xmpp/xmpp");
    import("../sockets/matchmaker/matchmaker");
    import("../sockets/launcher/index");
    import("../bot/index");
    import("../sockets/sessions/index");

    //await getAllCosmetics();
    //await generateFullProfile();
  } catch (error) {
    log.error(`Error during database setup: ${error}`);
  }
}

pushRoutes("routes/")
  .then(() => {
    log.info("All routes loaded successfully.");
    return startDatabase();
  })
  .catch((error) => {
    log.error("Error loading routes:", error);
  });

app.notFound(async (c) => {
  return createError(
    "errors.com.epicgames.common.not_found",
    "Sorry the resource you were trying to find could not be found",
    1004
  );
});
