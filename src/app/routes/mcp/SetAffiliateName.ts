//fortnite/api/game/v2/profile/123ecf44b9a64973939295fd2e3f3069/client/SetAffiliateName?profileId=common_core&rvn=21

import { and, eq } from "drizzle-orm";
import app, { db } from "../..";
import { affiliates, profileAttributes } from "../../../database/schema";
import { FortMP } from "../../../utils/error";
import {
  increaseProfileRevisionPrepared,
  queryProfile,
} from "../../../database/profileManager";

app.post(
  "/fortnite/api/game/v2/profile/:accountId/client/SetAffiliateName",
  async (c) => {
    const { accountId } = c.req.param();
    const { profileId } = c.req.query();
    const body = await c.req.json();

    if (!accountId || !profileId || !body) {
      return c.sendError(FortMP.basic.badRequest);
    }

    const [profile, affiliate] = await Promise.all([
      queryProfile(accountId, profileId),
      db
        .select()
        .from(affiliates)
        .where(eq(affiliates.code, body.affiliateName)),
    ]);

    if (!profile) return c.sendError(FortMP.mcp.profileNotFound);

    if (!affiliate)
      return c.sendError(
        FortMP.basic.badRequest.withMessage("Invalid affiliate")
      );

    await Promise.all([
      db
        .update(profileAttributes)
        .set({ value: JSON.stringify(new Date().toISOString()) })
        .where(
          and(
            eq(profileAttributes.accountId, accountId),
            eq(profileAttributes.profileId, profileId),
            eq(profileAttributes.key, "mtx_affiliate_set_time")
          )
        ),

      db
        .update(profileAttributes)
        .set({ value: JSON.stringify(body.affiliateName) })
        .where(
          and(
            eq(profileAttributes.accountId, accountId),
            eq(profileAttributes.profileId, profileId),
            eq(profileAttributes.key, "mtx_affiliate")
          )
        ),
    ]);
    await increaseProfileRevisionPrepared.execute({ accountId, profileId });

    return c.json({
      profileRevision: (profile.revision || 0) + 1,
      profileId: profileId,
      profileChangesBaseRevision: profile.revision || 0,
      profileChanges: [
        {
          changeType: "statModified",
          name: "mtx_affiliate",
          value: body.affiliateName,
        },
        {
          changeType: "statModified",
          name: "mtx_affiliate_set_time",
          value: new Date().toISOString(),
        },
      ],
      profileCommandRevision: (profile.revision || 0) + 1,
      serverTime: new Date().toISOString(),
      responseVersion: 1,
    });
  }
);
