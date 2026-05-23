import { Hono } from "hono"; // Assuming 'app' is a Hono instance based on 'c' context
import app from "../../index";
import { db } from "../../index"; // Assuming db export location
import { eq, and } from "drizzle-orm";
import { createError, FortMP } from "../../../utils/error"; // Assuming error utility location
import { profiles, items, profileAttributes } from "../../../database/schema"; // Assuming schema location
import {
  getFullProfile,
  increaseProfileRevisionPrepared,
  querySpecificProfileAttribute,
} from "../../../database/profileManager";
import { parseUserAgent } from "../../../utils/useragent";

// --- Type Definitions (Optional but Recommended) ---
// Define interfaces for the expected structure of parsed JSON attributes
interface ItemAttributes {
  // Add expected properties based on your actual item data structure
  [key: string]: unknown; // Allows flexibility, but specific keys are better
}

interface ProfileStatsAttributes {
  // Add expected properties based on your actual stats attributes
  [key: string]: unknown; // Allows flexibility
}

interface ProfileItem {
  templateId: string;
  attributes: ItemAttributes;
  quantity: number; // Making quantity non-optional based on usage, adjust if needed
}

// --- Constants ---
const PROFILE_CHANGE_TYPE_FULL_UPDATE = "fullProfileUpdate";
const DEFAULT_PROFILE_VERSION = "no_version";
const ERROR_PROFILE_NOT_FOUND =
  "errors.com.epicgames.fortnite.profile.not_found";
const ERROR_PROFILE_NOT_FOUND_MESSAGE = "Profile was not found.";
const ERROR_PROFILE_NOT_FOUND_CODE = 1008;
const ERROR_MISSING_PROFILE_ID = "Missing profileId query param";
const ERROR_INTERNAL_SERVER = "Internal Server Error";

app.on(
  "POST",
  [
    "/fortnite/api/game/v2/profile/:accountId/client/QueryProfile",
    "/fortnite/api/game/v2/profile/:accountId/client/ClientQuestLogin",
    "/fortnite/api/game/v2/profile/:accountId/dedicated_server/:operation",
    "/fortnite/api/game/v2/profile/:accountId/client/BulkEquipBattleRoyaleCustomization",
    "/fortnite/api/game/v2/profile/:accountId/client/SetHardcoreModifier",
    "/fortnite/api/game/v2/profile/:accountId/client/RedeemRealMoneyPurchases",
  ],
  async (c) => {
    const { accountId } = c.req.param();
    const { profileId, rvn } = c.req.query();

    if (!profileId) {
      return c.json({ error: ERROR_MISSING_PROFILE_ID }, 400);
    }

    try {
      // 1. Fetch Profile - Use findFirst and select specific columns
      const profile = await db
        .select()
        .from(profiles)
        .where(
          and(
            eq(profiles.accountId, accountId),
            eq(profiles.profileId, profileId)
          )
        )
        .limit(1)
        .then((rows) => rows[0]);

      if (!profile) {
        console.log("beans2");
        return createError(
          ERROR_PROFILE_NOT_FOUND,
          ERROR_PROFILE_NOT_FOUND_MESSAGE,
          ERROR_PROFILE_NOT_FOUND_CODE
        );
      }

      if (profile.revision == profile.commandRevision) {
        await increaseProfileRevisionPrepared.execute({ accountId, profileId });

        if (profileId == "athena") {
          const loadouts = await querySpecificProfileAttribute(
            accountId,
            profileId,
            "loadouts"
          );

          if (loadouts) {
            const parsed = JSON.parse(loadouts.value);
          }
        }
      }

      const fullProfile = await getFullProfile(profile);

      const currentRevision = profile.revision ?? 0;
      const currentCommandRevision = profile.commandRevision ?? 0;

      const userAgent = c.req.header("User-Agent");

      if (!userAgent) return c.sendError(FortMP.internal.invalidUserAgent);

      const versionInfo = await parseUserAgent(userAgent);

      if (profileId == "athena") {
        await db
          .update(profileAttributes)
          .set({ value: versionInfo.season.toString() })
          .where(
            and(
              eq(profileAttributes.accountId, accountId),
              eq(profileAttributes.profileId, profileId),
              eq(profileAttributes.key, "season_num")
            )
          );
      }

      const profileRvn =
        Number.parseInt(versionInfo.build) >= 12.2
          ? profile.commandRevision
          : profile.revision;

      let profileChanges: any[] = [];

      if (Number.parseInt(rvn) != profileRvn) {
        profileChanges = [
          {
            changeType: PROFILE_CHANGE_TYPE_FULL_UPDATE,
            profile: fullProfile,
          },
        ];
      }

      const responseProfile = {
        profileRevision: currentRevision,
        profileId: profile.profileId,
        profileChangesBaseRevision: currentRevision,
        profileChanges: profileChanges,
        profileCommandRevision: currentCommandRevision,
        serverTime: new Date().toISOString(),
        responseVersion: 1, // Assuming this is constant
      };

      return c.json(responseProfile);
    } catch (error) {
      console.error(
        `Error processing profile query for accountId ${accountId}, profileId ${profileId}:`,
        error
      );

      return c.json({ error: ERROR_INTERNAL_SERVER }, 500);
    }
  }
);
