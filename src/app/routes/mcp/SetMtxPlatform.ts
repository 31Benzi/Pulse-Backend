import app from "../.."

import logger from "../../../utils/logger";

app.post("/fortnite/api/game/v2/profile/:accountId/client/SetMtxPlatform", (c) => {

    logger.info("SetMtxPlatform"); 
    return c.body(null, 204);
});