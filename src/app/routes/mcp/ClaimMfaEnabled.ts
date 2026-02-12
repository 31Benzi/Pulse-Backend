import app from "../..";

import logger from "../../../utils/logger";
import { verifyUser } from "../../../database/tokenManager";

app.post(
  "/fortnite/api/game/v2/profile/:accountId/client/ClaimMfaEnabled",
  verifyUser,
  (c) => {
    logger.info("ClaimMfaEnabled");
    return c.body(null, 204);
  }
);
