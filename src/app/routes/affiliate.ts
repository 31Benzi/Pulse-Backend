import { eq } from "drizzle-orm";
import app, { db } from "..";
import { affiliates } from "../../database/schema";
import { verifyUser } from "../../database/tokenManager";
import { FortMP } from "../../utils/error";
import { getUserByAccountId } from "../../database/accountManager";

app.get("/affiliate/api/public/affiliates/slug/:affiliateCode", async (c) => {
  const { affiliateCode } = c.req.param();

  if (!affiliateCode) return c.sendError(FortMP.basic.badRequest);

  const [affiliate] = await db
    .select()
    .from(affiliates)
    .where(eq(affiliates.code, affiliateCode))
    .limit(1);

  if (!affiliate) return c.json({}, 404);

  const user = await getUserByAccountId(affiliate.ownerAccountId);

  if (!user) return c.json({}, 404);

  if (!user.isAffiliate) return c.json({}, 404);

  return c.json({
    id: affiliateCode,
    slug: affiliateCode,
    displayName: affiliateCode,
    status: "ACTIVE",
    verified: false,
  });
});
