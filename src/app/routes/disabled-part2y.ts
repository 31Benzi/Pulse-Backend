import { Hono } from "hono";
import app from "..";
import type { Invites, Parties, Pings } from "../../types/party.t";
import { verifyUser } from "../../database/tokenManager";

const parties: Parties[] = [];
const invites: Invites[] = [];
const pings: Pings[] = [];

// /party/api/v1/

// const partyApp = new Hono();

// partyApp.get("Fortnite/user/:accountId", verifyUser, (c) => {
//   const { accountId } = c.req.param();

//   const currentParties = parties.find((p) =>
//     p.members.find((m) => m.account_id == accountId)
//   );

//   const memberInvites = invites.find((i) => i.sentBy == accountId);
//   const memberPings = pings.find((p) => p.sentBy == accountId);
// });

// app.route("/party/api/v1", partyApp);

app.get("/party/api/v1/Fortnite/user/*", async (c) => {
  return c.json({
    current: [],
    pending: [],
    invites: [],
    pings: [],
  });
});

app.post("/party/api/v1/Fortnite/parties", async (c) => {
  const body = await c.req.json();

  if (!body.join_info) return c.json({});
  if (!body.join_info.connection) return c.json({});

  return c.json({
    id: crypto.randomUUID().replace(/-/gi, ""),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    config: {
      type: "DEFAULT",
      ...body.config,
      discoverability: "ALL",
      sub_type: "default",
      invite_ttl: 14400,
      intention_ttl: 60,
    },
    members: [
      {
        account_id: (body.join_info.connection.id || "").split("@prod")[0],
        meta: body.join_info.meta || {},
        connections: [
          {
            id: body.join_info.connection.id || "",
            connected_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            yield_leadership: false,
            meta: body.join_info.connection.meta || {},
          },
        ],
        revision: 0,
        updated_at: new Date().toISOString(),
        joined_at: new Date().toISOString(),
        role: "CAPTAIN",
      },
    ],
    applicants: [],
    meta: body.meta || {},
    invites: [],
    revision: 0,
    intentions: [],
  });
});

app.all("/party/api/v1/Fortnite/parties/*", async (c) => {
  return c.sendStatus(204);
});
