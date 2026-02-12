import app, { db } from "..";

import {
  getUserByAccountId,
  getUserByEmail,
  getUserbyExchangeCode,
  getUserByUsername,
} from "../../database/accountManager";

import { decodeBase64 } from "hono/utils/encode";
import { createError, FortMP } from "../../utils/error";
import logger from "../../utils/logger.ts";
import Logger from "../../utils/logger.ts";
import { z } from "zod";
import type { AuthBody } from "../../types/auth.t.ts";
import { GetAuthUser, TokenManager } from "../../database/tokenManager.ts";
import { eq } from "drizzle-orm";
import { tokens, type User } from "../../database/schema.ts";
import { sign, verify } from "hono/jwt";

app.post("/account/api/oauth/token", async (c) => {
  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return c.sendError(FortMP.authentication.invalidHeader);
  }

  const authHeaderParts = authHeader.split(" ");
  if (
    authHeaderParts.length !== 2 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(authHeaderParts[1])
  ) {
    return c.sendError(
      FortMP.authentication.oauth.invalidClient.withMessage("Not valid base64")
    );
  }

  const [clientId] = atob(authHeaderParts[1]).split(":");
  const [, clientSecret] = atob(authHeaderParts[1]).split(":");

  const schema = z.object({
    grant_type: z.string(),
    username: z.string().optional(),
    password: z.string().optional(),
    refresh_token: z.string().optional(),
    exchange_code: z.string().optional(),
  });

  let body: AuthBody;

  try {
    const formDataBody = await c.req.formData();
    const object = Object.fromEntries(formDataBody.entries());
    body = schema.parse(object);
  } catch (e) {
    console.log(e);
    return c.json(e as any);
  }

  let user: User | undefined;

  switch (body.grant_type) {
    case "client_credentials": {
      const isoTime = new Date().toISOString();

      const hasher = new Bun.CryptoHasher("sha256");
      hasher.update(`${clientId}:${clientSecret}:${isoTime}`);
      hasher.digest();

      const hash = hasher.digest("hex");

      const token = sign(
        {
          clientId,
          hash,
          creation_date: isoTime,
          hours_expire: 1,
        },
        process.env.UPLINK_KEY as string,
        "HS256"
      );

      return c.json({
        access_token: `eg1~${token}`,
        expires_in: 3600,
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
        token_type: "bearer",
        client_id: clientId,
        internal_client: true,
        client_service: "fortnite",
      });
    }

    case "password": {
      const { username, password } = body;

      if (!username || !password) {
        return c.sendError(
          FortMP.basic.badRequest.withMessage("Missing username or password")
        );
      }

      user = await getUserByEmail(username);
      if (!user)
        return c.sendError(
          FortMP.authentication.oauth.invalidAccountCredentials
        );

      const validPassword = await Bun.password.verify(password, user.password);
      if (!validPassword) {
        return c.sendError(
          FortMP.authentication.oauth.invalidAccountCredentials
        );
      }

      break;
    }

    case "exchange_code": {
      const { exchange_code } = body;
      if (!exchange_code) {
        return c.sendError(
          FortMP.basic.badRequest.withMessage("Missing exchange code")
        );
      }

      const token = await TokenManager.GetTokenByToken(
        exchange_code,
        "exchange_code"
      );

      if (!token)
        return c.sendError(
          FortMP.authentication.oauth.invalidExchange.variable([exchange_code])
        );

      user = await getUserByAccountId(token.accountId);
      if (!user) {
        return c.sendError(
          FortMP.authentication.oauth.invalidExchange.variable([exchange_code])
        );
      }

      await db.delete(tokens).where(eq(tokens.token, exchange_code));

      break;
    }

    case "refresh_token": {
      let { refresh_token } = body;
      if (!refresh_token)
        return c.sendError(
          FortMP.basic.badRequest.withMessage("missing refresh_token")
        );

      refresh_token = refresh_token.replace("eg1~", "").replace("$", "");

      const validToken = await TokenManager.GetTokenByToken(
        refresh_token,
        "refresh_token"
      );
      if (!validToken)
        return c.sendError(FortMP.authentication.oauth.invalidRefresh);

      user = await getUserByAccountId(validToken.accountId);
      if (!user) c.sendError(FortMP.authentication.oauth.invalidRefresh);

      break;
    }

    default:
      return c.sendError(
        FortMP.basic.badRequest.withMessage("Invalid grant type")
      );
  }

  if (!user)
    return c.sendError(FortMP.authentication.oauth.invalidAccountCredentials);

  const tokenManager = new TokenManager(user);
  tokenManager.ResetAllTokens();

  const accessToken = await tokenManager.GenNewAccessToken(
    clientId,
    body.grant_type
  );

  const refreshToken = await tokenManager.GenNewRefreshToken(clientId);

  return c.json({
    access_token: `eg1~${accessToken}`,
    expires_in: 3600,
    expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
    token_type: "bearer",
    refresh_token: `eg1~${refreshToken}`,
    refresh_expires: 86400,
    refresh_expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
    account_id: user.accountId,
    client_id: clientId,
    internal_client: true,
    client_service: "fortnite",
    displayName: user.username,
    app: "fortnite",
    in_app_id: user.accountId,
    device_id: Math.floor(Math.random() * 1000000000),
  });
});

app.get("/account/api/public/account/:accountId/externalAuths", (c) => {
  return c.json([]);
});

app.get("/account/api/oauth/verify", async (c) => {
  const auth = c.req.header("Authorization");
  if (!auth) {
    return c.sendError(FortMP.authentication.authenticationFailed);
  }

  const token = auth.replace(/Bearer eg1~/i, "");

  const decoded = await verify(token, process.env.UPLINK_KEY!);

  if (!decoded) return c.sendError(FortMP.authentication.invalidToken);

  const user = await GetAuthUser(c);

  if (!user) return c.sendError(FortMP.authentication.invalidToken);

  return c.json({
    token: token,
    session_id: decoded.jti,
    token_type: "bearer",
    client_id: decoded.clid,
    internal_client: true,
    client_service: "fortnite",
    account_id: user.accountId,
    expires_in: Math.round(
      (addHoursJWT(
        new Date(decoded.creation_date as string),
        decoded.hours_expire
      ).getTime() -
        new Date().getTime()) /
        1000
    ),
    expires_at: addHoursJWT(
      new Date(decoded.creation_date as string),
      decoded.hours_expire
    ).toISOString(),
    auth_method: decoded.am,
    display_name: user.username,
    app: "fortnite",
    in_app_id: user.accountId,
    device_id: decoded.dvid,
  });
});

app.get("/account/api/oauth/sessions/kill/:accountid", async (c) => {
  return c.body(null, 204);
});

app.delete("/account/api/oauth/sessions/kill", async (c) => {
  return c.body(null, 204);
});

app.delete("/account/api/oauth/sessions/kill/:accountId", async (c) => {
  return c.body(null, 204);
});

export function addHoursJWT(arg0: Date, hours_expire: any) {
  const date = new Date(arg0);
  date.setHours(date.getHours() + hours_expire);
  return date;
}
