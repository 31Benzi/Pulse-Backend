import axios from "axios";
import app from "..";
import { GetAuthUser, verifyUser } from "../../database/tokenManager";
import { XMPPClient } from "../../sockets/xmpp/xmpp-client";
import { FortMP } from "../../utils/error";
import * as os from "os";
import { getUserByAccountId } from "../../database/accountManager";
import { parseUserAgent } from "../../utils/useragent";

interface PartyMemberConnection {
  id: string;
  connected_at: string;
  updated_at: string;
  yield_leadership: boolean;
  meta: any;
}

interface PartyMember {
  account_id: string;
  role: string;
  meta: any;
  connections: PartyMemberConnection[];
  revision: number;
  updated_at: string;
  joined_at: string;
}

interface PartyInvite {
  party_id: string;
  sent_by: string;
  meta: any;
  sent_to: string;
  sent_at: string;
  updated_at: string;
  expires_at: string;
  status: string;
}

interface Parties {
  id: string;
  created_at: string;
  updated_at: string;
  config: any;
  members: PartyMember[];
  applicants: string[];
  meta: any;
  revision: number;
  intentions: any[];
  invites: PartyInvite[];
}

interface Pings {
  sent_by: string;
  sent_to: string;
  sent_at: string;
  meta: string;
  expires_at: string;
}

const parties: Parties[] = [];
const pings: Pings[] = [];
const invites: PartyInvite[] = [];

app.get("/party/api/v1/Fortnite/user/:accountId", (c) => {
  const accountId = c.req.param("accountId");

  const currentParties = parties.filter((party) => {
    const members = party.members as PartyMember[];
    return members.some((member) => member.account_id === accountId);
  });

  const foundInvites = invites.filter((i) => i.sent_by == accountId);
  const foundPings = pings.filter((p) => p.sent_by == accountId);

  const formattedInvites = foundInvites.map((invite: PartyInvite) => ({
    party_id: invite.party_id,
    meta: invite.meta,
    sent_by: invite.sent_by,
    sent_to: invite.sent_to,
    sent_at: invite.sent_at,
    updated_at: invite.updated_at,
    expires_at: invite.expires_at,
    status: invite.status,
  }));

  const formattedPings = foundPings.map((ping: Pings) => ({
    sent_by: ping.sent_by,
    sent_to: ping.sent_to,
    sent_at: ping.sent_at,
    meta: ping.meta,
    expires_at: ping.expires_at,
  }));

  return c.json({
    current: currentParties,
    pending: [],
    invites: formattedInvites,
    pings: formattedPings,
  });
});

// /party/api/v1/Fortnite/user/4c9715a02abc4d07bc1f191d7cb90744/pings/984499fd2a0e4c1e9ff3b7fe8a8a18e0

app.post(
  "/party/api/v1/Fortnite/user/:accountId/pings/:pingerId",
  verifyUser,
  async (c) => {
    const { accountId, pingerId } = c.req.param();
    const body = await c.req.json();
    var pindex;
    if (
      (pindex = pings
        .filter((p) => p.sent_to == accountId)
        .findIndex((p) => p.sent_by == pingerId)) != -1
    )
      pings.splice(pindex, 1);

    const date = new Date();
    date.setHours(date.getHours() + 1);

    const ping: Pings = {
      sent_by: pingerId,
      sent_to: accountId,
      sent_at: new Date().toISOString(),
      expires_at: date.toISOString(),
      meta: body.meta,
    };

    pings.push(ping);

    XMPPClient.sendXMPPMessageToClient(
      {
        expires: ping.expires_at,
        meta: body.meta,
        ns: "Fortnite",
        pinger_dn: (await getUserByAccountId(pingerId)).username,
        pinger_id: pingerId,
        sent: ping.sent_at,
        version: (await parseUserAgent(c.req.header("User-Agent")!)).build,
        type: "com.epicgames.social.party.notification.v0.PING",
      },
      accountId
    );

    return c.json(ping);
  }
);

// /party/api/v1/Fortnite/user/4c9715a02abc4d07bc1f191d7cb90744/pings/984499fd2a0e4c1e9ff3b7fe8a8a18e0/parties

app.get(
  "/party/api/v1/Fortnite/user/:accountId/pings/:pingerId/parties",
  verifyUser,
  async (c) => {
    const { accountId, pingerId } = c.req.param();

    let query = pings.filter(
      (p) => p.sent_to == accountId && p.sent_by == pingerId
    );

    const date = new Date();
    date.setHours(date.getHours() + 1);

    if (query.length == 0)
      query = [
        {
          sent_by: pingerId,
          sent_to: accountId,
          expires_at: date.toISOString(),
          meta: "{}",
          sent_at: new Date().toISOString(),
        },
      ];

    return c.json(
      query
        .map((p) => {
          const party = parties.find(
            (x) => x.members.findIndex((m) => m.account_id == p.sent_by) != -1
          );

          if (!party) return null;

          return party;
        })
        .filter((x) => x != null)
    );
  }
);

app.post(
  "/party/api/v1/Fortnite/user/:accountId/pings/:pingerId/join",
  verifyUser,
  async (c) => {
    const { accountId, pingerId } = c.req.param();
    const body = await c.req.json();

    let query = pings.filter(
      (p) => p.sent_to === accountId && p.sent_by === pingerId
    );
    if (query.length === 0) {
      query = [
        {
          sent_by: pingerId,
          sent_to: accountId,
          sent_at: new Date().toISOString(),
          meta: "{}",
          expires_at: new Date().toISOString(),
        },
      ];
    }

    const party = parties.find((p) =>
      p.members.some((m) => m.account_id === query[0].sent_by)
    );
    if (!party) return c.json({ error: "Party not found" }, 404);

    if (party.members.some((m) => m.account_id === accountId)) {
      return c.json({
        status: "JOINED",
        party_id: party.id,
      });
    }

    const connectionId = body.connection.id || "";
    const memberId = connectionId.split("@prod")[0];
    const now = new Date().toISOString();

    const newConnection: PartyMemberConnection = {
      id: connectionId,
      connected_at: now,
      updated_at: now,
      yield_leadership: !!body.connection.yield_leadership,
      meta: body.connection.meta || {},
    };

    const newMember: PartyMember = {
      account_id: memberId,
      meta: body.meta || {},
      connections: [newConnection],
      revision: 0,
      updated_at: now,
      joined_at: now,
      role: body.connection.yield_leadership ? "CAPTAIN" : "MEMBER",
    };

    party.members.push(newMember);

    const rsaKey = party.meta["Default:RawSquadAssignments_j"]
      ? "Default:RawSquadAssignments_j"
      : "RawSquadAssignments_j";

    let rsa;
    if (party.meta[rsaKey]) {
      try {
        rsa = JSON.parse(party.meta[rsaKey]);
        rsa.RawSquadAssignments.push({
          memberId: memberId,
          absoluteMemberIdx: party.members.length - 1,
        });
        party.meta[rsaKey] = JSON.stringify(rsa);
        party.revision++;
      } catch {
        // Ignore parse error
      }
    }

    party.updated_at = now;

    const captain =
      party.members.find((m) => m.role === "CAPTAIN") || ({} as PartyMember);

    for (const m of party.members) {
      XMPPClient.sendXMPPMessageToClient(
        {
          account_id: memberId,
          account_dn: body.connection.meta["urn:epic:member:dn_s"],
          connection: {
            id: connectionId,
            connected_at: now,
            updated_at: now,
            meta: body.connection.meta,
          },
          joined_at: now,
          member_state_updated: body.meta || {},
          ns: "Fortnite",
          party_id: party.id,
          revision: 0,
          sent: now,
          type: "com.epicgames.social.party.notification.v0.MEMBER_JOINED",
          updated_at: now,
        },
        m.account_id
      );

      if (rsa) {
        XMPPClient.sendXMPPMessageToClient(
          {
            captain_id: captain.account_id,
            created_at: party.created_at,
            invite_ttl_seconds: 14400,
            max_number_of_members: party.config.max_size,
            ns: "Fortnite",
            party_id: party.id,
            party_privacy_type: party.config.joinability,
            party_state_overriden: {},
            party_state_removed: [],
            party_state_updated: {
              [rsaKey]: JSON.stringify(rsa),
            },
            party_sub_type: party.meta["urn:epic:cfg:party-type-id_s"],
            party_type: "DEFAULT",
            revision: party.revision,
            sent: now,
            type: "com.epicgames.social.party.notification.v0.PARTY_UPDATED",
            updated_at: now,
          },
          m.account_id
        );
      }
    }

    return c.json({
      status: "JOINED",
      party_id: party.id,
    });
  }
);

app.post("/party/api/v1/Fortnite/parties", async (c) => {
  let requestData;

  try {
    requestData = await c.req.json();
  } catch {
    return c.json(
      {
        error: "Invalid payload",
      },
      400
    );
  }

  const joinInfo = requestData.join_info;
  const connectionId: string = joinInfo.connection.id;
  const accountId: string = connectionId.split("@prod")[0] ?? "";
  const yieldLeadership: boolean =
    joinInfo.connection.yield_leadership ?? false;
  const joinInfoMeta: { [key: string]: any } = joinInfo.connection.meta;

  const joinInfoConnectionMeta: { [key: string]: any } =
    joinInfo.connection.meta;

  const partyMemberConnection: PartyMemberConnection = {
    id: connectionId,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    yield_leadership: yieldLeadership,
    meta: joinInfoConnectionMeta,
  };

  const partyMember: PartyMember = {
    account_id: accountId,
    meta: joinInfoMeta,
    connections: [partyMemberConnection],
    revision: 0,
    updated_at: new Date().toISOString(),
    joined_at: new Date().toISOString(),
    role: "CAPTAIN",
  };

  console.log(requestData.meta);

  const partyId = crypto.randomUUID().replace(/-/g, "");
  const newParty: Parties = {
    id: partyId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    config: requestData.config,
    members: [partyMember],
    meta: requestData.meta || {},
    invites: [],
    applicants: [],
    revision: 0,
    intentions: [],
  };

  parties.push(newParty);

  return c.json(newParty);
});

app.patch("/party/api/v1/Fortnite/parties/:partyId", verifyUser, async (c) => {
  const body = await c.req.json();

  const partyId = c.req.param("partyId");

  const party = parties.find((p) => p.id == partyId);

  if (!party) return c.json(FortMP.party.partyNotFound);

  const user = await GetAuthUser(c);

  if (!user) return c.json(FortMP.authentication.invalidToken);

  const member = party.members.find((m) => m.account_id == user.accountId);

  if (body.config) {
    for (var prop of Object.keys(body.config))
      party.config[prop] = body.config[prop];
  }

  if (body.meta) {
    for (var prop of body.meta.delete as string[]) delete party.meta[prop];

    for (var prop of Object.keys(body.meta.update))
      party.meta[prop] = body.meta.update[prop];
  }

  party.revision++;
  party.updated_at = new Date().toISOString();

  const captain = party.members.find((m) => m.role == "CAPTAIN");

  if (!captain) return c.json(FortMP.party.memberNotFound.with("captain"));

  party.members.forEach((m) => {
    XMPPClient.sendXMPPMessageToClient(
      {
        captain_id: captain.account_id,
        created_at: party.created_at,
        invite_ttl_seconds: 14400,
        max_number_of_members: party.config.max_size,
        ns: "Fortnite",
        party_id: party.id,
        party_privacy_type: party.config.joinability,
        party_state_overriden: {},
        party_state_removed: body.meta.delete,
        party_state_updated: body.meta.update,
        party_sub_type: party.meta["urn:epic:cfg:party-type-id_s"],
        party_type: "DEFAULT",
        revision: party.revision,
        sent: new Date().toISOString(),
        type: "com.epicgames.social.party.notification.v0.PARTY_UPDATED",
        updated_at: new Date().toISOString(),
      },
      m.account_id
    );
  });

  return c.sendStatus(204);
});

app.get("/party/api/v1/Fortnite/parties/:partyId", verifyUser, (c) => {
  const party = parties.find((p) => p.id == c.req.param("partyId"));

  if (!party) return c.json(FortMP.party.partyNotFound);

  return c.json(party);
});

app.patch(
  "/party/api/v1/Fortnite/parties/:partyId/members/:accountId/meta",
  verifyUser,
  async (c) => {
    const body = await c.req.json();

    const party = parties.find((p) => p.id == c.req.param("partyId"));

    if (!party) return c.json(FortMP.party.partyNotFound);

    const member = party.members.find(
      (m) => m.account_id == c.req.param("accountId")
    );

    if (!member) return c.json(FortMP.party.memberNotFound);

    for (var prop of Object.keys(body.delete)) delete member.meta[prop];

    for (var prop of Object.keys(body.update))
      member.meta[prop] = body.update[prop];

    member.revision = body.revision;
    member.updated_at = new Date().toISOString();
    party.updated_at = new Date().toISOString();

    party.members.forEach((m) => {
      XMPPClient.sendXMPPMessageToClient(
        {
          account_id: c.req.param("accountId"),
          account_dn: member.meta["urn:epic:member:dn_s"],
          member_state_updated: body.update,
          member_state_removed: body.delete,
          member_state_overridden: {},
          party_id: party.id,
          updated_at: new Date().toISOString(),
          sent: new Date().toISOString(),
          revision: member.revision,
          ns: "Fortnite",
          type: "com.epicgames.social.party.notification.v0.MEMBER_STATE_UPDATED",
        },
        m.account_id
      );
    });

    return c.sendStatus(204);
  }
);

app.post(
  "/party/api/v1/Fortnite/parties/:partyId/members/:accountId/join",
  verifyUser,
  async (c) => {
    const partyId = c.req.param("partyId");
    const accountId = c.req.param("accountId");

    const party = parties.find((p) => p.id === partyId);
    if (!party) return c.json(FortMP.party.partyNotFound);

    const body = await c.req.json();

    // Check if the user is already a member
    const existingMember = party.members.find(
      (m) => m.account_id === accountId
    );
    if (existingMember) {
      return c.json({
        status: "JOINED",
        party_id: party.id,
      });
    }

    // Create new PartyMember and PartyMemberConnection
    const connectionId = body.connection.id || "";
    const memberId = connectionId.split("@prod")[0] || "";
    const now = new Date().toISOString();

    const newConnection: PartyMemberConnection = {
      id: connectionId,
      connected_at: now,
      updated_at: now,
      yield_leadership: body.connection.yield_leadership ?? false,
      meta: body.connection.meta || {},
    };

    const newMember: PartyMember = {
      account_id: memberId,
      meta: body.meta || {},
      connections: [newConnection],
      revision: 0,
      updated_at: now,
      joined_at: now,
      role: body.connection.yield_leadership ? "CAPTAIN" : "MEMBER",
    };

    party.members.push(newMember);

    // Handle RawSquadAssignments metadata if it exists
    const rsaKey =
      party.meta["Default:RawSquadAssignments_j"] != null
        ? "Default:RawSquadAssignments_j"
        : "RawSquadAssignments_j";

    let rsa: {
      RawSquadAssignments: { memberId: any; absoluteMemberIdx: number }[];
    };
    if (party.meta[rsaKey]) {
      try {
        rsa = JSON.parse(party.meta[rsaKey]);
        rsa.RawSquadAssignments.push({
          memberId: memberId,
          absoluteMemberIdx: party.members.length - 1,
        });
        party.meta[rsaKey] = JSON.stringify(rsa);
        party.revision++;
      } catch {
        // Fail silently if JSON is invalid
      }
    }

    party.updated_at = now;

    const captain =
      party.members.find((m) => m.role === "CAPTAIN") || ({} as PartyMember);

    // Send XMPP notification for MEMBER_JOINED
    party.members.forEach((m) => {
      XMPPClient.sendXMPPMessageToClient(
        {
          account_id: memberId,
          account_dn: body.connection.meta["urn:epic:member:dn_s"],
          connection: {
            id: connectionId,
            connected_at: now,
            updated_at: now,
            meta: body.connection.meta,
          },
          joined_at: now,
          member_state_updated: body.meta || {},
          ns: "Fortnite",
          party_id: party.id,
          revision: 0,
          sent: now,
          type: "com.epicgames.social.party.notification.v0.MEMBER_JOINED",
          updated_at: now,
        },
        m.account_id
      );

      // Send XMPP PARTY_UPDATED notification if squad updated
      if (rsa) {
        XMPPClient.sendXMPPMessageToClient(
          {
            captain_id: captain.account_id,
            created_at: party.created_at,
            invite_ttl_seconds: 14400,
            max_number_of_members: party.config.max_size,
            ns: "Fortnite",
            party_id: party.id,
            party_privacy_type: party.config.joinability,
            party_state_overriden: {},
            party_state_removed: [],
            party_state_updated: {
              [rsaKey]: JSON.stringify(rsa),
            },
            party_sub_type: party.meta["urn:epic:cfg:party-type-id_s"],
            party_type: "DEFAULT",
            revision: party.revision,
            sent: now,
            type: "com.epicgames.social.party.notification.v0.PARTY_UPDATED",
            updated_at: now,
          },
          m.account_id
        );
      }
    });

    return c.json({
      status: "JOINED",
      party_id: party.id,
    });
  }
);

app.post(
  "/party/api/v1/Fortnite/parties/:partyId/members/:accountId/conferences/connection",
  verifyUser,
  async (c) => {
    const body = await c.req.json();
    const { partyId, accountId } = c.req.param();

    const party = parties.find((p) => p.id == partyId);

    if (!party) return c.json(FortMP.party.partyNotFound);

    const member = party.members.find((m: any) => m.accountId == accountId);

    const providers: Record<string, Object> = {};

    const bIsRtcp =
      typeof body.providers == "object" &&
      typeof body.providers.rtcp == "object";

    const bIsVixox =
      (typeof body.providers == "object" &&
        typeof body.providers.vivox == "object") ||
      !bIsRtcp;

    if (bIsRtcp) {
      const nodePlat = os.platform();
      const platform = nodePlat === "win32" ? "Windows" : nodePlat;

      const response = await axios.post(
        "https://api.epicgames.dev/auth/v1/oauth/token",
        new URLSearchParams({
          grant_type: "client_credentials",
          deployment_id: "541ab993246c4887992571cac740b0da",
        }),
        {
          auth: {
            username: "xyza789154Q4k2nbz8XFj2HNRcVtS8Ju",
            password: "0S9Xq+xzeLQ8MiSsQVS8vBDiH7VQw62le0ln0V0Cusw",
          },
        }
      );

      const joinToken = await axios.post(
        `https://api.epicgames.dev/rtc/v1/541ab993246c4887992571cac740b0da/room/${partyId}`,
        {
          participants: [
            {
              puid: accountId,
              hardMuted: false,
            },
          ],
        },
        {
          headers: {
            "Content-Type": "application/json",
            authorization: "Bearer " + response.data.access_token,
          },
        }
      );

      const participant = joinToken.data.participants[0];

      providers.rtcp = {
        participant_token: participant.token,
        client_base_url: joinToken.data.clientBaseUrl,
        room_name: joinToken.data.roomId,
      };
    }

    return c.json({
      providers: providers,
    });
  }
);

app.delete(
  "/party/api/v1/Fortnite/user/:accountId/pings/:pingerId",
  verifyUser,
  async (c) => {
    const { accountId, pingerId } = c.req.param();

    const index = pings
      .filter((p) => p.sent_to === accountId)
      .findIndex((p) => p.sent_by === pingerId);

    if (index !== -1) {
      pings.splice(index, 1);
    }

    return c.sendStatus(204);
  }
);

// party/api/v1/Fortnite/parties/be4dc6979b2943daa4cdce6f8d060166/members/262c451c2557417cb9cf5ef05c1c8db2

app.delete(
  "/party/api/v1/Fortnite/parties/:partyId/members/:accountId",
  (c) => {
    const { partyId, accountId } = c.req.param();

    const party = parties.find((p) => p.id == partyId);

    if (!party) return c.json(FortMP.party.partyNotFound);

    const member = party.members.findIndex(
      (m: any) => m.accountId == accountId
    );

    party.members.forEach((m) => {
      XMPPClient.sendXMPPMessageToClient(
        {
          account_id: accountId,
          member_state_update: {},
          ns: "Fortnite",
          party_id: party.id,
          revision: party.revision || 0,
          sent: new Date().toISOString(),
          type: "com.epicgames.social.party.notification.v0.MEMBER_LEFT",
        },
        m.account_id
      );
    });

    party.members.splice(member, 1);

    if (party.members.length == 0)
      parties.splice(parties.findIndex((p) => p.id == partyId));
    else {
      const v = party.meta["Default:RawSquadAssignments_j"]
        ? "Default:RawSquadAssignments_j"
        : "RawSquadAssignments_j";

      if (party.meta[v]) {
        const rsa = JSON.parse(party.meta[v]);

        rsa.RawSquadAssignments.splice(
          rsa.RawSquadAssignments.findIndex(
            (a: any) => a.memberId == accountId
          ),
          1
        );

        let captain = party.members.find((m) => m.role == "CAPTAIN");

        if (!captain) {
          party.members[0].role = "CAPTAIN";
          captain = party.members[0];
        }

        party.updated_at = new Date().toISOString();

        party.members.forEach((m) => {
          XMPPClient.sendXMPPMessageToClient(
            {
              captain_id: captain.account_id,
              created_at: party.created_at,
              invite_ttl_seconds: 14400,
              max_number_of_members: 16,
              ns: "Fortnite",
              party_id: party.id,
              party_privacy_type: party.config.joinability,
              party_state_overriden: {},
              party_state_removed: [],
              party_state_updated: {
                [v]: JSON.stringify(rsa),
              },
              party_sub_type: party.meta["urn:epic:cfg:party-type-id_s"],
              party_type: "DEFAULT",
              revision: party.revision,
              sent: new Date().toISOString(),
              type: "com.epicgames.social.party.notification.v0.PARTY_UPDATED",
              updated_at: new Date().toISOString(),
            },
            m.account_id
          );
        });
      }
    }

    return c.sendStatus(204);
  }
);

app.post(
  "/party/api/v1/Fortnite/user/:accountId/party/leave",
  verifyUser,
  async (c) => {
    const { accountId } = c.req.param();
    const party = parties.find((p) =>
      p.members.some((m) => m.account_id === accountId)
    );
    if (!party) return c.json(FortMP.party.partyNotFound.with(), 404);

    party.members = party.members.filter((m) => m.account_id !== accountId);
    party.updated_at = new Date().toISOString();

    if (
      !party.members.some((m) => m.role === "CAPTAIN") &&
      party.members.length > 0
    ) {
      party.members[0].role = "CAPTAIN";
    }

    return c.sendStatus(204);
  }
);

app.post(
  "/party/api/v1/Fortnite/parties/:partyId/confirm",
  verifyUser,
  async (c) => {
    return c.sendStatus(204);
  }
);
app.post(
  "/party/api/v1/Fortnite/user/:accountId/join",
  verifyUser,
  async (c) => {
    const { accountId } = c.req.param();
    const body = await c.req.json();

    const party = parties.find((p) => p.id === body.party_id);
    if (!party) return c.json(FortMP.party.partyNotFound.with(), 404);
    if (party.members.some((m) => m.account_id === accountId)) {
      return c.json({ status: "JOINED", party_id: party.id });
    }

    const now = new Date().toISOString();
    const connectionId = body.connection.id;
    const memberId = connectionId.split("@")[0];

    const newMember: PartyMember = {
      account_id: memberId,
      meta: body.meta || {},
      connections: [
        {
          id: connectionId,
          connected_at: now,
          updated_at: now,
          yield_leadership: !!body.connection.yield_leadership,
          meta: body.connection.meta,
        },
      ],
      joined_at: now,
      updated_at: now,
      revision: 0,
      role: "MEMBER",
    };

    party.members.push(newMember);
    party.updated_at = now;

    return c.json({ status: "JOINED", party_id: party.id });
  }
);

app.get(
  "/party/api/v1/Fortnite/user/:accountId/members",
  verifyUser,
  async (c) => {
    const { accountId } = c.req.param();
    const party = parties.find((p) =>
      p.members.some((m) => m.account_id === accountId)
    );
    if (!party) return c.json(FortMP.party.partyNotFound.with(), 404);

    return c.json({
      members: party.members.map((m) => ({
        account_id: m.account_id,
        meta: m.meta,
        role: m.role,
        revision: m.revision,
        connections: m.connections,
        joined_at: m.joined_at,
        updated_at: m.updated_at,
      })),
      party_id: party.id,
    });
  }
);

app.get(
  "/party/api/v1/Fortnite/user/:accountId/meta",
  verifyUser,
  async (c) => {
    const { accountId } = c.req.param();
    const party = parties.find((p) =>
      p.members.some((m) => m.account_id === accountId)
    );
    if (!party) return c.json(FortMP.party.partyNotFound.with(), 404);

    const member = party.members.find((m) => m.account_id === accountId);
    return c.json({
      meta: member?.meta || {},
    });
  }
);

app.post(
  "/party/api/v1/Fortnite/parties/:partyId/invites/:inviteeAccountId",
  verifyUser,
  async (c) => {
    const { partyId, inviteeAccountId } = c.req.param();
    const requestBody = await c.req.json();
    const authenticatedUser = await GetAuthUser(c);

    if (!authenticatedUser) return c.json(FortMP.authentication.invalidToken);

    const targetParty = parties.find((party) => party.id === partyId);
    if (!targetParty)
      return c.json(
        FortMP.party.partyNotFound.with(`Party ${partyId} does not exist!`),
        404
      );

    let existingInviteIndex = targetParty.invites
      .filter((invite) => invite.sent_to == inviteeAccountId)
      .findIndex((invite) => invite.sent_by == authenticatedUser.accountId);
    if (existingInviteIndex != -1) {
      targetParty.invites.splice(existingInviteIndex, 1);
    }

    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + 1);
    const newInvite: PartyInvite = {
      party_id: targetParty.id,
      sent_by: authenticatedUser.accountId,
      meta: requestBody,
      sent_to: inviteeAccountId,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: expirationDate.toISOString(),
      status: "SENT",
    };

    targetParty.invites.push(newInvite);
    targetParty.updated_at = new Date().toISOString();

    const invitingMember = targetParty.members.find(
      (member) => member.account_id == authenticatedUser.accountId
    );

    XMPPClient.sendXMPPMessageToClient(
      {
        expires: newInvite.expires_at,
        meta: requestBody,
        ns: "Fortnite",
        party_id: targetParty.id,
        inviter_dn: invitingMember?.meta["urn:epic:member:dn_s"],
        inviter_id: authenticatedUser.accountId,
        invitee_id: inviteeAccountId,
        members_count: targetParty.members.length,
        sent_at: newInvite.sent_at,
        updated_at: newInvite.updated_at,
        friends_ids: [],
        sent: new Date().toISOString(),
        type: "com.epicgames.social.party.notification.v0.INITIAL_INVITE",
      },
      inviteeAccountId
    );

    if (c.req.query("sendPing") == "true") {
      let existingPingIndex = pings
        .filter((ping) => ping.sent_to == inviteeAccountId)
        .findIndex((ping) => ping.sent_by == authenticatedUser.accountId);
      if (existingPingIndex != -1) {
        pings.splice(existingPingIndex, 1);
      }

      const pingExpirationDate = new Date();
      pingExpirationDate.setHours(pingExpirationDate.getHours() + 1);
      const newPing: Pings = {
        sent_by: authenticatedUser.accountId,
        sent_to: inviteeAccountId,
        sent_at: new Date().toISOString(),
        expires_at: pingExpirationDate.toISOString(),
        meta: requestBody,
      };
      pings.push(newPing);

      XMPPClient.sendXMPPMessageToClient(
        {
          expires: newInvite.expires_at,
          meta: requestBody.meta,
          ns: "Fortnite",
          pinger_dn: invitingMember?.meta["urn:epic:member:dn_s"],
          pinger_id: authenticatedUser.accountId,
          sent: newInvite.sent_at,
          version: (await parseUserAgent(c.req.header("User-Agent")!)).build,
          type: "com.epicgames.social.party.notification.v0.PING",
        },
        inviteeAccountId
      );
    }
    return c.sendStatus(204);
  }
);

app.on(
  "POST",
  [
    "/party/api/v1/Fortnite/parties/:partyId/invites/:inviteeAccountId/decline",
    "/party/api/v1/Fortnite/parties/:partyId/invites/:inviteeAccountId/*/decline",
  ],
  verifyUser,
  async (c) => {
    const { partyId, inviteeAccountId } = c.req.param();
    const requestBody = await c.req.json();
    const authenticatedUser = await GetAuthUser(c);

    if (!authenticatedUser) return c.json(FortMP.authentication.invalidToken);

    const targetParty = parties.find((party) => party.id === partyId);
    if (!targetParty)
      return c.json(
        FortMP.party.partyNotFound.with(`Party ${partyId} does not exist!`),
        404
      );

    const targetInvite = targetParty.invites.find(
      (invite) =>
        invite.sent_to == inviteeAccountId &&
        invite.sent_by == authenticatedUser.accountId
    );
    if (!targetInvite)
      return c.json(
        FortMP.party.partyNotFound.with(
          `Invite for ${inviteeAccountId} from ${authenticatedUser.accountId} does not exist!`
        ),
        404
      );

    const invitingMember = targetParty.members.find(
      (member) => member.account_id == targetInvite.sent_by
    );

    if (invitingMember) {
      XMPPClient.sendXMPPMessageToClient(
        {
          expires: targetInvite.expires_at,
          meta: requestBody,
          ns: "Fortnite",
          party_id: targetParty.id,
          inviter_dn: invitingMember.meta["urn:epic:member:dn_s"],
          inviter_id: targetInvite.sent_by,
          invitee_id: inviteeAccountId,
          sent_at: targetInvite.sent_at,
          updated_at: targetInvite.updated_at,
          sent: new Date().toISOString(),
          type: "com.epicgames.social.party.notification.v0.INVITE_CANCELLED",
        },
        targetInvite.sent_by
      );
    }

    targetParty.invites = targetParty.invites.filter(
      (invite) =>
        !(
          invite.sent_to === inviteeAccountId &&
          invite.sent_by === authenticatedUser.accountId
        )
    );
    targetParty.updated_at = new Date().toISOString();

    return c.sendStatus(204);
  }
);

app.post(
  "/party/api/v1/Fortnite/members/:requesteeAccountId/intentions/:requesterAccountId",
  verifyUser,
  async (c) => {
    const { requesteeAccountId, requesterAccountId } = c.req.param();
    const requestBody = await c.req.json();
    const authenticatedUser = await GetAuthUser(c);

    if (!authenticatedUser) return c.json(FortMP.authentication.invalidToken);

    const targetParty = parties.find(
      (party) =>
        party.members.findIndex(
          (member) => member.account_id == requesterAccountId
        ) != -1
    );
    if (!targetParty)
      return c.json(
        FortMP.party.partyNotFound.with(
          `Party does not exist for requester ${requesterAccountId}!`
        ),
        404
      );

    const requestingMember = targetParty.members.find(
      (member) => member.account_id == requesterAccountId
    );
    if (!requestingMember)
      return c.json(
        FortMP.party.memberNotFound.with(
          `Requester ${requesterAccountId} not found in party!`
        ),
        404
      );

    const partyCaptain = targetParty.members.find(
      (member) => member.role === "CAPTAIN"
    );
    if (!partyCaptain)
      return c.json(
        FortMP.party.memberNotFound.with("Captain not found in party!"),
        404
      );

    const expirationDate = new Date();
    expirationDate.setHours(expirationDate.getHours() + 1);
    const newIntention = {
      requester_id: requesterAccountId,
      requester_dn: requestingMember.meta["urn:epic:member:dn_s"],
      requester_pl: partyCaptain.account_id,
      requester_pl_dn: partyCaptain.meta["urn:epic:member:dn_s"],
      requestee_id: requesteeAccountId,
      meta: requestBody,
      expires_at: expirationDate.toISOString(),
      sent_at: new Date().toISOString(),
    };

    targetParty.intentions.push(newIntention);

    XMPPClient.sendXMPPMessageToClient(
      {
        expires_at: newIntention.expires_at,
        requester_id: requesterAccountId,
        requester_dn: requestingMember.meta["urn:epic:member:dn_s"],
        requester_pl: partyCaptain.account_id,
        requester_pl_dn: partyCaptain.meta["urn:epic:member:dn_s"],
        requestee_id: requesteeAccountId,
        meta: requestBody,
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        friends_ids: [],
        members_count: targetParty.members.length,
        party_id: targetParty.id,
        ns: "Fortnite",
        sent: new Date().toISOString(),
        type: "com.epicgames.social.party.notification.v0.INITIAL_INTENTION",
      },
      requesteeAccountId
    );
    return c.json(newIntention);
  }
);

app.post(
  "/party/api/v1/Fortnite/parties/:pid/members/:accountId/promote",
  verifyUser,
  async (c) => {
    const { pid, accountId } = c.req.param();
    const user = await GetAuthUser(c);

    if (!user) return c.sendError(FortMP.authentication.invalidToken);

    const party = parties.find((p) => p.id === pid);

    if (!party) {
      return c.json(
        FortMP.party.partyNotFound.with(`Party ${pid} does not exist!`),
        404
      );
    }

    const currentCaptainIndex = party.members.findIndex(
      (m) => m.role === "CAPTAIN"
    );
    if (
      currentCaptainIndex === -1 ||
      party.members[currentCaptainIndex].account_id !== user.accountId
    ) {
      return c.sendError(FortMP.authentication.notYourAccount);
    }

    const newCaptainIndex = party.members.findIndex(
      (m) => m.account_id === accountId
    );
    if (newCaptainIndex === -1) {
      return c.json(FortMP.party.memberNotFound.with(accountId), 404);
    }

    if (currentCaptainIndex !== -1)
      party.members[currentCaptainIndex].role = "MEMBER";
    party.members[newCaptainIndex].role = "CAPTAIN";

    party.updated_at = new Date().toISOString();

    for (const member of party.members) {
      XMPPClient.sendXMPPMessageToClient(
        {
          account_id: accountId,
          member_state_update: {},
          ns: "Fortnite",
          party_id: party.id,
          revision: party.revision || 0,
          sent: new Date().toISOString(),
          type: "com.epicgames.social.party.notification.v0.MEMBER_NEW_CAPTAIN",
        },
        member.account_id
      );
    }

    return c.sendStatus(204);
  }
);
