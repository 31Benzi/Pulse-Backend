import { except } from "hono/combine";
import app from "..";
import { verifyUser } from "../../database/tokenManager";

app.use(
  "/fortnite/api/game/v2/profile/:accountId/client/*",
  except("/fortnite/api/game/v2/profile/:accountId/client/QueryProfile"),
  verifyUser
);
