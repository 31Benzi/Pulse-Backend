import { eq, sql } from "drizzle-orm";
import { db } from "../app";
import { increment, parties } from "./schema";

export const increasePartyRevisionPrepared = db
  .update(parties)
  .set({
    updatedAt: new Date(),
    revision: increment(parties.revision),
  })
  .where(eq(parties.id, sql.placeholder("partyId")))
  .prepare("increasePartyRevisionPrepared");
