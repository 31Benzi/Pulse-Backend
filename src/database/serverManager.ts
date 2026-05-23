import { and, eq, sql } from "drizzle-orm";
import { db } from "../app";
import { servers } from "./schema";

export const queryServersPrepared = db
  .select()
  .from(servers)
  .where(
    and(
      eq(servers.playlist, sql.placeholder("playlist")),
      eq(servers.region, sql.placeholder("region")),
      eq(servers.open, true)
    )
  )
  .prepare("queryServersPrepared");

export const queryServerBySessionIdPrepared = db
  .select()
  .from(servers)
  .where(eq(servers.sessionId, sql.placeholder("sessionId")))
  .prepare("queryServerBySessionIdPrepared");
