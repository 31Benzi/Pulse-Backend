import { getCookie } from "hono/cookie";
import app from "..";
import { GetAuthUser, verifyUser } from "../../database/tokenManager";
import { createError, FortMP } from "../../utils/error";
import { parseUserAgent } from "../../utils/useragent";
import jwt from "jsonwebtoken";
import { queryServerBySessionIdPrepared } from "../../database/serverManager";
import { getConnInfo } from "hono/bun";
import vpns from "../../json/list.json";
import { isIP } from "net";
import CidrMatcher from "cidr-matcher";
import { sessions } from "./sessions";
import type { Servers } from "../../types/sessions.t";

const buildUniqueIds: { [accountId: string]: string } = {};

app.get(
  "/fortnite/api/matchmaking/session/:sessionId",
  verifyUser,
  async (c) => {
    const user = await GetAuthUser(c);

    const sessionId = c.req.param("sessionId");

    const buildUniqueId = getCookie(c, "buildUniqueId") || "0";

    const foundServer = await queryServerBySessionIdPrepared
      .execute({ sessionId: sessionId })
      .then((s) => s[0]);

    return c.json({
      id: sessionId,
      ownerId: crypto.randomUUID().replace(/-/gi, "").toUpperCase(),
      ownerName: "[DS]fortnite-liveeugcec1c2e30ubrcore0a-z8hj-1968",
      serverName: "[DS]fortnite-liveeugcec1c2e30ubrcore0a-z8hj-1968",
      serverAddress: foundServer?.ip ?? "127.0.0.1",
      serverPort: foundServer?.port ?? 7777,
      maxPublicPlayers: 220,
      openPublicPlayers: 175,
      maxPrivatePlayers: 0,
      openPrivatePlayers: 0,
      attributes: {
        REGION_s: foundServer?.region ?? "NA",
        GAMEMODE_s: "FORTATHENA",
        ALLOWBROADCASTING_b: true,
        DCID_s: "FORTNITE-LIVEEUGCEC1C2E30UBRCORE0A-14840880",
        tenant_s: "Fortnite",
        MATCHMAKINGPOOL_s: "Any",
        STORMSHIELDDEFENSETYPE_i: 0,
        HOTFIXVERSION_i: 0,
        PLAYLISTNAME_s: foundServer?.playlist,
        SESSIONKEY_s: crypto.randomUUID().replace(/-/g, "").toUpperCase(),
        TENANT_s: "Fortnite",
        BEACONPORT_i: 15009,
      },
      publicPlayers: [],
      privatePlayers: [],
      totalPlayers: 45,
      allowJoinInProgress: false,
      shouldAdvertise: false,
      isDedicated: false,
      usesStats: false,
      allowInvites: false,
      usesPresence: false,
      allowJoinViaPresence: true,
      allowJoinViaPresenceFriendsOnly: false,
      buildUniqueId: buildUniqueIds[user!.accountId] || "0",
      lastUpdated: new Date().toISOString(),
      started: false,
    });
  }
);

app.get("/fortnite/api/matchmaking/session/findPlayer/*", (c) => {
  return c.sendStatus(200);
});

app.post("/fortnite/api/matchmaking/session/*/join", (c) => {
  return c.sendStatus(204);
});

app.post("/fortnite/api/matchmaking/session/matchMakingRequest", (c) => {
  return c.json([]);
});

app.get(
  "/fortnite/api/game/v2/matchmaking/account/:accountId/session/:sessionId",
  (c) => {
    return c.json({
      accountId: c.req.param("accountId"),
      sessionId: c.req.param("sessionId"),
      key: "none",
    });
  }
);

app.get(
  "/fortnite/api/game/v2/matchmakingservice/ticket/player/:accountId",
  verifyUser,
  async (c) => {
    const user = await GetAuthUser(c);

    const info = getConnInfo(c);
    const ip = info.remote.address?.split(":")[3];

    if (!ip) return c.sendError(FortMP.basic.badRequest);

    const matcher = new CidrMatcher(vpns.list);

    if (isIP(ip) && matcher.contains(ip)) {
      console.log(`${ip} banned from matchmaking`);
      return c.sendError(FortMP.matchmaking.player_banned_from_sub_game);
    }

    if (!user) return c.sendError(FortMP.authentication.invalidToken);

    if (c.req.param("accountId") !== user.accountId)
      return c.sendError(FortMP.authentication.notYourAccount);

    const { bucketId, partyPlayerIds } = c.req.query();
    const playerCustomKey = c.req.query("player.option.customKey");

    if (typeof bucketId !== "string")
      return c.sendError(FortMP.matchmaking.invalidBucketId);

    const bucketIdParts = bucketId.split(":");

    if (bucketIdParts.length !== 4)
      return c.sendError(FortMP.matchmaking.invalidBucketId);

    const [buildUniqueId, , region, playlist] = bucketIdParts;

    if (!buildUniqueId || !region)
      return c.sendError(FortMP.matchmaking.invalidBucketId);

    buildUniqueIds[user.accountId] = buildUniqueId;

    const userAgent = c.req.header("User-Agent");

    if (!userAgent) return c.sendError(FortMP.internal.invalidUserAgent);

    const versionInfo = await parseUserAgent(userAgent);

    const unixTime = new Date().getMilliseconds().toString();

    // TODO: partyv2 impl for matchmaking

    const payload = {
      playerId: user.accountId,
      partyPlayerIds: partyPlayerIds,
      bucketId: bucketId,
      attributes: {
        "player.subregions": region,
        "player.playlist": playlist,
        "player.season": versionInfo.season,
        "player.option.partyId": "partyId",
        "player.userAgent": versionInfo.cl,
        "player.platform": "Windows",
        "player.option.linkType": "DEFAULT",
        "player.preferredSubregion": region,
        "player.input": "KBM",
        "playlist.revision": 1,
        ...(playerCustomKey && { customKey: playerCustomKey }),
        "player.option.fillTeam": false,
        "player.option.linkCode": playerCustomKey ? playerCustomKey : "none",
        "player.option.uiLanguage": "en",
        "player.privateMMS": playerCustomKey ? true : false,
        "player.option.spectator": false,
        "player.inputTypes": "KBM",
        "player.option.groupBy": playerCustomKey ? playerCustomKey : "none",
        "player.option.microphoneEnabled": true,
      },
      expireAt: new Date(Date.now() + 1000 * 30).toISOString(),
      none: crypto.randomUUID(),
    };

    const sigPayload = {
      accountId: user.accountId,
      bucketId: bucketId,
      attributes: payload.attributes,
      expiresAt: payload.expireAt,
      none: payload.none,
      sessionId: crypto.randomUUID().replace(/-/g, ""),
      matchId: crypto.randomUUID().replace(/-/g, ""),
      region: region,
      userAgent: userAgent,
      playlist: playlist,
      partyMembers: partyPlayerIds,
      customKey: "NO_KEY",
    };

    const signedPayload = jwt.sign(
      sigPayload,
      process.env.UPLINK_KEY as string,
      {
        algorithm: "HS256",
      }
    );

    return c.json({
      serviceUrl: "ws://127.0.0.1:2053",
      ticketType: "mms-player",
      payload: payload,
      signature: signedPayload,
    });
  }
);
