import jwt from "jsonwebtoken";
import logger from "../../utils/logger";
import { MatchmakerClient } from "./matchmaker-client";

Bun.serve({
  port: 5000,
  async fetch(req, server) {
    const authorization = req.headers.get("Authorization");
    if (!authorization) return new Response(null, { status: 400 });

    console.log(authorization);

    const [, , , jwtToken] = authorization.split(" ");
    if (!jwtToken) return new Response(null, { status: 400 });

    const decoded = await jwt.verify(
      jwtToken,
      process.env.UPLINK_KEY as string
    );

    server.upgrade(req, {
      data: {
        MMClient: null,
        payload: decoded,
      },
    });

    return undefined;
  },
  websocket: {
    async open(ws) {
      const matchId = new Bun.CryptoHasher("md5")
        .update(`2${Date.now()}`)
        .digest("hex");

      const payload = (ws.data as any).payload;

      const MMClient = new MatchmakerClient(
        ws,
        matchId,
        payload.playlist,
        payload.region
      );

      (ws.data as any).MMClient = MMClient;

      MMClient.sendConnecting();
      MMClient.sendWaiting();
      MMClient.sendQueued();
    },
    message(ws, message) {
      logger.info(`[Matchmaker] Received message: ${message}`);
    },
    close(ws, code, reason) {
      logger.info(
        `[Matchmaker] WebSocket connection closed: ${code} ${reason}`
      );

      MatchmakerClient.handleDisconnect((ws.data as any).MMClient);

      const clientIndex = MatchmakerClient.clients.findIndex((i) => i.ws == ws);

      MatchmakerClient.clients.splice(clientIndex);
    },
  },
});

logger.info("Matchmaker started on port 5000");
