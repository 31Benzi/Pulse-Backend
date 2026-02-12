import { getConnInfo } from "hono/bun";
import app from "..";
import type { Session } from "../../types/sessions.t";
import { FortMP } from "../../utils/error";
import { verifyUser } from "../../database/tokenManager";
import jwt from "jsonwebtoken";
import logger from "../../utils/logger";

// TODO: Move to DB

export const sessions: Session[] = [];

app.post("/fortnite/api/matchmaking/session", verifyUser, async (c) => {
  const body = await c.req.json<Session>();
  const info = getConnInfo(c);

  if (!body) return c.sendError(FortMP.basic.badRequest);

  body.lastUpdated = new Date().toISOString();
  body.serverAddress = info.remote.address?.split(":")[3];
  body.id = crypto.randomUUID().replace(/-/g, "");
  body.attributes =
    typeof body.attributes === "string"
      ? JSON.parse(body.attributes)
      : body.attributes;

  console.log(body);

  sessions.push(body);

  return c.json(body);
});

app.delete(
  "/fortnite/api/matchmaking/session/:sessionId",
  verifyUser,
  async (c) => {
    const session = sessions.findIndex((s) => s.id == c.req.param("sessionId"));

    if (session == -1)
      return c.sendError(
        FortMP.basic.badRequest.withMessage("Failed to find session")
      );

    sessions.splice(session, 1);
  }
);

app.post(
  "/fortnite/api/matchmaking/session/:sessionId/players",
  verifyUser,
  async (c) => {
    const body = await c.req.json<Session>();

    if (body == null) return c.sendError(FortMP.basic.badRequest);

    const session = sessions.find((s) => s.id == c.req.param("sessionId"));

    if (!session)
      return c.sendError(
        FortMP.basic.badRequest.withMessage("Failed to find session")
      );

    session.lastUpdated = new Date().toISOString();
    session.publicPlayers = body.publicPlayers ?? [];
    session.privatePlayers = body.privatePlayers ?? [];

    return c.json(session);
  }
);

app.get(
  "/fortnite/api/game/v2/matchmakingservice/ticket/session/:sessionId",
  async (c) => {
    const partyPlayerIds = c.req.query("partyPlayerIds");
    const bucketIdParts = c.req.query("bucketIds")?.split(":")!;

    const res = await fetch(
      "http://127.0.0.1:45011/crystal/restapi/v1/matchmaking/sessions/playlists/NA",
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${process.env.UPLINK_KEY}`,
        },
      }
    );

    const json = await res.json();

    const selectedPlaylist = json.playlist;

    logger.info(`Playlist: ${selectedPlaylist}`);

    const finalList = [
      bucketIdParts[0],
      bucketIdParts[1],
      bucketIdParts[2],
      selectedPlaylist,
    ].join(":");

    const session = sessions.find((s) => s.id == c.req.param("sessionId"));

    const signaturePayload = {
      matchId: crypto.randomUUID().replace(/-/g, ""),
      bucketIds: finalList,
      partyMembers: partyPlayerIds,
      playlist: selectedPlaylist,
      region: bucketIdParts[2],
      ownerId: session?.ownerId,
    };

    const signedPayload = jwt.sign(
      signaturePayload,
      process.env.UPLINK_KEY as string,
      {
        algorithm: "HS256",
      }
    );

    return c.json({
      serviceUrl: "ws://127.0.0.1:666",
      ticketType: "mms-player",
      payload: c.req.param("sessionId").toString(),
      signature: signedPayload,
    });
  }
);

app.put(
  "/fortnite/api/matchmaking/session/:sessionId",
  verifyUser,
  async (c) => {
    const session = sessions.find((s) => s.id == c.req.param("sessionId"));

    if (!session)
      return c.sendError(
        FortMP.basic.badRequest.withMessage("Failed to find session")
      );

    const body = await c.req.json<Session>();

    if (body == null) return c.sendError(FortMP.basic.badRequest);

    session.attributes = body.attributes;

    return c.json(session);
  }
);

app.post(
  "/fortnite/api/matchmaking/session/:sessionId/heartbeat",
  verifyUser,
  async (c) => {
    const session = sessions.find((s) => s.id == c.req.param("sessionId"));

    if (!session)
      return c.sendError(
        FortMP.basic.badRequest.withMessage("Failed to find session")
      );

    session.lastUpdated = new Date().toISOString();

    logger.info("[Sessions] Heartbeat");

    return c.sendStatus(200);
  }
);
