import { db } from "../app";
import { tokens, users, type User } from "./schema";
import { and, eq, sql } from "drizzle-orm";
import type { Context, Next } from "hono";
import { FortMP } from "../utils/error";
import logger from "../utils/logger";
import { getUserByAccountId } from "./accountManager";
import { sign, verify } from "hono/jwt";

const findTokenPrepared = await db
  .select()
  .from(tokens)
  .where(
    and(
      eq(tokens.token, sql.placeholder("token")),
      eq(tokens.token_type, sql.placeholder("token_type"))
    )
  )
  .prepare("tokenprepared");

export class TokenManager {
  private user: User;

  constructor(user: User) {
    this.user = user;
  }

  public async GenNewRefreshToken(clientId: string) {
    const refreshToken = await sign(
      {
        app: "fortnite",
        sub: this.user.accountId,
        dvid: Math.floor(Math.random() * 1000000000),
        mver: false,
        clid: clientId,
        dn: this.user.username,
        am: "refresh",
        p: btoa(crypto.randomUUID().replace(/-/g, "")),
        iai: this.user.accountId,
        sec: 1,
        clsvc: "fortnite",
        t: "s",
        ic: true,
        jti: crypto.randomUUID().replace(/-/g, ""),
        creation_date: new Date(),
        hours_expire: 24,
      },
      process.env.UPLINK_KEY as string
    );

    await db.insert(tokens).values({
      token: refreshToken,
      token_type: "refresh_token",
      accountId: this.user.accountId!,
    });

    return refreshToken;
  }

  public async GenNewAccessToken(clientId: string, grant_type: string) {
    const accessToken = await sign(
      {
        app: "fortnite",
        sub: this.user.accountId,
        dvid: Math.floor(Math.random() * 1000000000),
        mver: false,
        clid: clientId,
        dn: this.user.username,
        am: grant_type,
        p: btoa(crypto.randomUUID().replace(/-/g, "")),
        iai: this.user.accountId,
        sec: 1,
        clsvc: "fortnite",
        t: "s",
        ic: true,
        jti: crypto.randomUUID().replace(/-/g, ""),
        creation_date: new Date(),
        hours_expire: 4,
      },
      process.env.UPLINK_KEY as string
    );

    await db.insert(tokens).values({
      token: accessToken,
      token_type: "access_token",
      accountId: this.user.accountId!,
    });

    return accessToken;
  }

  public async NewExchangeCode() {
    const newExchange = crypto.randomUUID().replace(/-/g, "");

    await db.insert(tokens).values({
      token: newExchange,
      token_type: "exchange_code",
      accountId: this.user.accountId!,
    });

    return newExchange;
  }

  /**
   * @description Resets all tokens for the user
   */
  public async ResetAllTokens() {
    await db.delete(tokens).where(eq(tokens.accountId, this.user.accountId));
  }

  public static async ResetAllTokensForAccountID(accountId: string) {
    await db.delete(tokens).where(eq(tokens.accountId, accountId));
  }

  public static async GetTokenByToken(
    token: string,
    token_type: "refresh_token" | "access_token" | "exchange_code"
  ) {
    const fetched = await findTokenPrepared.execute({
      token: token,
      token_type: token_type,
    });
    return fetched[0];
  }
}

const findTokenNoTypePrepared = await db
  .select()
  .from(tokens)
  .where(eq(tokens.token, sql.placeholder("token")))
  .prepare("tokennotypeprepared");

export async function GetAuthUser(c: Context) {
  try {
    const authHeader = c.req.header("Authorization");

    if (!authHeader) return undefined;

    const token = authHeader.replace(/Bearer eg1~/i, "");

    const decoded = await verify(token, process.env.UPLINK_KEY!);

    const IsJWTPayload =
      "creation_date" in decoded &&
      "hours_expire" in decoded &&
      "sub" in decoded;

    if (!decoded || !IsJWTPayload) {
      logger.error("invalid token");
      return undefined;
    }

    const validToken = findTokenNoTypePrepared.execute({ token });

    if (!validToken) return undefined;

    if (!decoded.sub) return undefined;

    const user = await getUserByAccountId(decoded.sub as string);

    if (!user) return undefined;

    return user;
  } catch (e) {
    logger.error(`Error while validating user: ${e}`);
    return undefined;
  }
}

export async function verifyUser(c: Context, next: Next) {
  const user = await GetAuthUser(c);
  if (!user) {
    c.status(401);
    return c.json({
      errorCode:
        "errors.com.epicgames.common.authorization.authorization_failed",
      errorMessage: `Authorization failed, please report this to the support server`,
      numericErrorCode: 1032,
      originatingService: "any",
      intent: "prod",
    });
  }

  await next();
}
