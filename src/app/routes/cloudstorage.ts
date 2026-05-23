import app, { db } from "..";

import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import crypto from "crypto";
import logger from "../../utils/logger";
import { hotfixes } from "../../database/schema";
import { eq } from "drizzle-orm";
import { FortMP } from "../../utils/error";

app.get("/fortnite/api/cloudstorage/system", async (c) => {
  let Files: any[] = [];

  const queriedHotfixes = await db.select().from(hotfixes);

  queriedHotfixes.forEach((hotfix) => {
    Files.push({
      uniqueFilename: hotfix.filename,
      hash: crypto.createHash("sha1").update(hotfix.content).digest("hex"),
      hash256: crypto.createHash("sha256").update(hotfix.content).digest("hex"),
      length: hotfix.content.length,
      contentType: "application/octet-stream",
      uploaded: new Date().toISOString(),
      storageType: "S3",
      storageIds: {},
      doNotCache: true,
    });
  });

  return c.json(Files);
});

app.get("/fortnite/api/cloudstorage/system/:file", async (c) => {
  let hotfix = null;
  try {
    const results = await db
      .select()
      .from(hotfixes)
      .where(eq(hotfixes.filename, c.req.param("file")))
      .limit(1);

    hotfix = results[0] ?? null;
  } catch (err) {
    hotfix = null;
  }

  if (hotfix) {
    c.header("Content-Type", "text/plain");
    return c.body(hotfix.content);
  }

  return c.json(FortMP.cloudstorage.fileNotFound, 404);
});

app.get("/fortnite/api/cloudstorage/user/:accountId/:fileName", async (c) => {
  const SettingsDirectory = path.join(__dirname, "../..", "settings");

  if (!fsSync.existsSync(SettingsDirectory)) {
    logger.info("Created new directory:", SettingsDirectory);
    fsSync.mkdirSync(SettingsDirectory, { recursive: true });
  }

  const accountId = c.req.param("accountId");
  const fileName = c.req.param("fileName");

  if (!fileName.endsWith(".Sav")) {
    return c.body("Invalid file name", 400);
  }

  const filePath = path.join(
    SettingsDirectory,
    `${accountId}-ClientSettings.sav`
  );

  if (!fsSync.existsSync(filePath)) {
    logger.info("Created new file:", filePath);
  }

  const fileData = fsSync.readFileSync(filePath);
  c.res.headers.set("Content-Type", "application/octet-stream");
  return c.body(fileData, 200);
});

app.put("/fortnite/api/cloudstorage/user/:accountId/:fileName", async (c) => {
  const SettingsDirectory = path.join(__dirname, "../..", "settings");

  await fs.mkdir(SettingsDirectory, { recursive: true });

  //TODO add account check so people dont just upload infinite files

  const accountId = c.req.param("accountId");
  const fileName = c.req.param("fileName");

  if (!fileName.endsWith(".Sav")) {
    return c.text("Invalid file name", 400);
  }

  const body = await c.req.arrayBuffer().catch(() => null);
  if (!body) {
    logger.error("Invalid data format, expected binary data!");
    return c.json({ error: "Invalid data format, expected binary data" }, 400);
  }

  const buffer = Buffer.from(body);

  if (buffer.length > 1024 * 1024) {
    logger.error("File too large!");
    return c.json({ error: "File too large" }, 400);
  }

  const filePath = path.join(
    SettingsDirectory,
    `${accountId}-ClientSettings.sav`
  );
  await fs.writeFile(filePath, buffer);

  console.log("Settings updated:", filePath);

  return c.json({
    success: true,
    message: "ClientSettings saved successfully.",
  });
});

app.get("/fortnite/api/cloudstorage/user/:accountId", async (c: any) => {
  const SettingsDirectory = path.join(__dirname, "../..", "settings");

  if (!fsSync.existsSync(SettingsDirectory)) {
    logger.info("Created new directory:", SettingsDirectory);
    fsSync.mkdirSync(SettingsDirectory, { recursive: true });
  }

  const accountId = c.req.param("accountId");

  const filePath = path.join(
    SettingsDirectory,
    `${accountId}-ClientSettings.sav`
  );

  if (fsSync.existsSync(filePath)) {
    const parsedFile = await fs.readFile(filePath, "utf-8");
    const parsedStats = await fs.stat(filePath);

    return c.json({
      uniqueFilename: `${accountId}-ClientSettings.sav`,
      filename: `ClientSettings.sav`,
      hash: crypto.createHash("sha1").update(parsedFile).digest("hex"),
      hash256: crypto.createHash("sha256").update(parsedFile).digest("hex"),
      length: parsedFile.length,
      contentType: "application/octet-stream",
      uploaded: parsedStats.mtime.toISOString(),
      storageType: "S3",
      storageIds: {},
      accountId: accountId,
      doNotCache: true,
    });
  } else {
    return c.json({
      uniqueFilename: `${accountId}-ClientSettings.sav`,
      filename: `ClientSettings.sav`,
      hash: null,
      hash256: null,
      length: 0,
      contentType: "application/octet-stream",
      uploaded: null,
      storageType: "S3",
      storageIds: {},
      accountId: accountId,
      doNotCache: true,
    });
  }
});
