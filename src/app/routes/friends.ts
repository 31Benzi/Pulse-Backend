import { eq, or, and } from "drizzle-orm";
import app, { db } from "..";
import { getUserByAccountId } from "../../database/accountManager";
import { users, friends } from "../../database/schema";
import { FortMP } from "../../utils/error";
import { acceptFriendRequest, sendFriendRequest } from "../../utils/friends";
import { XMPPClient } from "../../sockets/xmpp/xmpp-client";
import { verifyUser } from "../../database/tokenManager";

type FriendEntry = {
  accountId: string;
  mutual: number;
  favorite: boolean;
  created: Date | null;
};

type FriendSummary = {
  friends: (FriendEntry & {
    groups: string[];
    alias: string;
    note: string;
  })[];
  incoming: FriendEntry[];
  outgoing: Omit<FriendEntry, "created" | "mutual">[];
  suggested: any[];
  blocklist: FriendEntry[];
  settings: {
    acceptInvites: "public";
  };
};

// GET FRIEND SUMMARY
app.get("/friends/api/v1/:accountId/summary", async (c) => {
  const accountId = c.req.param("accountId");
  const user = await getUserByAccountId(accountId);
  if (!user) return c.sendError(FortMP.basic.badRequest);

  const friendRecords = await db
    .select()
    .from(friends)
    .where(or(eq(friends.userId, accountId), eq(friends.friendId, accountId)));

  const res: FriendSummary = {
    friends: [],
    incoming: [],
    outgoing: [],
    suggested: [],
    blocklist: [],
    settings: {
      acceptInvites: "public",
    },
  };

  for (const fr of friendRecords) {
    const isSender = fr.userId === accountId;
    const otherId = isSender ? fr.friendId : fr.userId;

    const summary = {
      accountId: otherId,
      mutual: 0,
      favorite: false,
      created: fr.createdAt,
    };

    switch (fr.status) {
      case "accepted":
        res.friends.push({ ...summary, groups: [], alias: "", note: "" });
        break;
      case "pending":
        if (isSender) {
          res.outgoing.push(summary);
        } else {
          res.incoming.push(summary);
        }
        break;
      case "blocked":
        res.blocklist.push(summary);
        break;
    }
  }

  return c.json(res);
});

// SEND/ACCEPT FRIEND REQUEST (Public)
app.post(
  "/friends/api/public/friends/:senderAccountId/:recievingAccountId",
  verifyUser,
  async (c) => {
    const { senderAccountId, recievingAccountId } = c.req.param();

    const [sender, receiver] = await Promise.all([
      getUserByAccountId(senderAccountId),
      getUserByAccountId(recievingAccountId),
    ]);

    if (!sender || !receiver) return c.sendStatus(204);

    const existing = await db
      .select()
      .from(friends)
      .where(
        or(
          and(
            eq(friends.userId, senderAccountId),
            eq(friends.friendId, recievingAccountId)
          ),
          and(
            eq(friends.userId, recievingAccountId),
            eq(friends.friendId, senderAccountId)
          )
        )
      );

    const rel = existing[0];

    if (rel && rel.status === "pending" && rel.friendId === senderAccountId) {
      const error = await acceptFriendRequest(sender, receiver);
      if (error != null) return c.sendError(error);

      XMPPClient.getPresence(sender.accountId, receiver.accountId, false);
      XMPPClient.getPresence(receiver.accountId, sender.accountId, false);
    } else if (!rel) {
      const result = await sendFriendRequest(sender, receiver);
      if (!result) return c.sendError(FortMP.friends.invalidData);
    }

    return c.sendStatus(204);
  }
);

// SEND/ACCEPT FRIEND REQUEST (Private V1)
app.post(
  "/friends/api/v1/:senderAccountId/friends/:recievingAccountId",
  verifyUser,
  async (c) => {
    const { senderAccountId, recievingAccountId } = c.req.param();

    const [sender, receiver] = await Promise.all([
      getUserByAccountId(senderAccountId),
      getUserByAccountId(recievingAccountId),
    ]);

    if (!sender || !receiver) return c.sendStatus(204);

    const existing = await db
      .select()
      .from(friends)
      .where(
        or(
          and(
            eq(friends.userId, senderAccountId),
            eq(friends.friendId, recievingAccountId)
          ),
          and(
            eq(friends.userId, recievingAccountId),
            eq(friends.friendId, senderAccountId)
          )
        )
      );

    const rel = existing[0];

    if (rel && rel.status === "pending" && rel.friendId === senderAccountId) {
      const error = await acceptFriendRequest(sender, receiver);
      if (error != null) return c.sendError(error);

      XMPPClient.getPresence(sender.accountId, receiver.accountId, false);
      XMPPClient.getPresence(receiver.accountId, sender.accountId, false);
    } else if (!rel) {
      const result = await sendFriendRequest(sender, receiver);
      if (!result) return c.sendError(FortMP.friends.invalidData);
    }

    return c.json([]);
  }
);

// RECENT FRIEND INTERACTIONS (STUB)
app.get("/friends/api/v1/:accountId/recent/:type", verifyUser, async (c) => {
  return c.json([]);
});

// GET PUBLIC FRIENDS LIST
app.get("/friends/api/public/friends/:accountId", verifyUser, async (c) => {
  const accountId = c.req.param("accountId");

  const friendRecords = await db
    .select()
    .from(friends)
    .where(or(eq(friends.userId, accountId), eq(friends.friendId, accountId)));

  const response: any[] = [];

  for (const fr of friendRecords) {
    const isSender = fr.userId === accountId;
    const otherId = isSender ? fr.friendId : fr.userId;

    if (fr.status === "accepted") {
      response.push({
        accountId: otherId,
        status: "ACCEPTED",
        direction: "OUTBOUND",
        created: fr.createdAt,
        favorite: false,
      });
    } else if (fr.status === "pending") {
      response.push({
        accountId: otherId,
        status: "PENDING",
        direction: isSender ? "OUTBOUND" : "INBOUND",
        created: fr.createdAt,
        favorite: false,
      });
    }
  }

  return c.json(response);
});
