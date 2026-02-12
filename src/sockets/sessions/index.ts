import { verify } from "crypto";
import logger from "../../utils/logger";
import jwt from "jsonwebtoken";

Bun.serve({
  port: 5555,
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
      ws.send(JSON.stringify({ name: "Registered", payload: {} }));
    },
    async message(ws, message) {
      try {
        const payload = (ws.data as any)?.payload;
        console.log("Payload:", payload);

        logger.info(`[Sessions] Received message: ${message}`);

        if (message === "ping") {
          ws.send("pong");
          return;
        }

        let data: any;
        try {
          data = JSON.parse(message.toString());
        } catch (err) {
          logger.warn("Failed to parse JSON message:", err);
          return;
        }

        console.log("Parsed data:", data);

        if (
          data?.name === "AssignMatchResult" &&
          data?.payload?.result === "ready"
        ) {
        }
      } catch (err) {
        logger.error("Error handling message:", err);
      }
    },
  },
});

logger.info("Sessions socket started on port 5555");
