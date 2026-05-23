import { and, eq, or } from "drizzle-orm";
import { db } from "../app";
import { users, friends, type User } from "../database/schema";
import { XMPPClient } from "../sockets/xmpp/xmpp-client";
import xmlbuilder from "xmlbuilder";
import { ApiError, FortMP } from "./error";

export async function sendFriendRequest(
  sender: User,
  receiver: User
): Promise<boolean> {
  if (sender.accountId === receiver.accountId) return false;

  // Check if any relationship already exists
  const existing = await db
    .select()
    .from(friends)
    .where(
      or(
        and(
          eq(friends.userId, sender.accountId),
          eq(friends.friendId, receiver.accountId)
        ),
        and(
          eq(friends.userId, receiver.accountId),
          eq(friends.friendId, sender.accountId)
        )
      )
    );

  const existingRel = existing[0];

  // Already friends or blocked
  if (
    existingRel &&
    (existingRel.status === "accepted" || existingRel.status === "blocked")
  ) {
    return false;
  }

  // If incoming request exists, accept it
  if (
    existingRel &&
    existingRel.status === "pending" &&
    existingRel.friendId === sender.accountId
  ) {
    await acceptFriendRequest(sender, receiver);
    return true;
  }

  // Create outgoing request from sender
  await db.insert(friends).values({
    userId: sender.accountId,
    friendId: receiver.accountId,
    status: "pending",
  });

  // Notify both parties
  const now = new Date().toISOString();

  await XMPPClient.sendXMPPMessageToClient(
    {
      payload: {
        accountId: receiver.accountId,
        status: "PENDING",
        direction: "OUTBOUND",
        created: now,
        favorite: false,
      },
      type: "com.epicgames.friends.core.apiobjects.Friend",
      timestamp: now,
    },
    sender.accountId
  );

  await XMPPClient.sendXMPPMessageToClient(
    {
      payload: {
        accountId: sender.accountId,
        status: "PENDING",
        direction: "INBOUND",
        created: now,
        favorite: false,
      },
      type: "com.epicgames.friends.core.apiobjects.Friend",
      timestamp: now,
    },
    receiver.accountId
  );

  return true;
}

export async function acceptFriendRequest(
  sender: User,
  receiver: User
): Promise<ApiError | null> {
  if (sender.accountId === receiver.accountId) return FortMP.friends.selfFriend;

  const existing = await db
    .select()
    .from(friends)
    .where(
      and(
        eq(friends.userId, receiver.accountId),
        eq(friends.friendId, sender.accountId),
        eq(friends.status, "pending")
      )
    );

  if (!existing.length) return FortMP.friends.invalidData;

  // Accept the relationship (update status)
  await db
    .update(friends)
    .set({ status: "accepted" })
    .where(
      and(
        eq(friends.userId, receiver.accountId),
        eq(friends.friendId, sender.accountId)
      )
    );

  // Insert reciprocal accepted friend row
  await db.insert(friends).values({
    userId: sender.accountId,
    friendId: receiver.accountId,
    status: "accepted",
  });

  const now = new Date().toISOString();

  // Notify both users
  await XMPPClient.sendXMPPMessageToClient(
    {
      payload: {
        accountId: receiver.accountId,
        status: "ACCEPTED",
        direction: "OUTBOUND",
        created: now,
        favorite: false,
      },
      type: "com.epicgames.friends.core.apiobjects.Friend",
      timestamp: now,
    },
    sender.accountId
  );

  await XMPPClient.sendXMPPMessageToClient(
    {
      payload: {
        accountId: sender.accountId,
        status: "ACCEPTED",
        direction: "OUTBOUND",
        created: now,
        favorite: false,
      },
      type: "com.epicgames.friends.core.apiobjects.Friend",
      timestamp: now,
    },
    receiver.accountId
  );

  return null;
}

// Presence broadcasting
export async function getPresenceForFriends(client: XMPPClient) {
  const userId = client.user?.accountId;
  if (!userId) return;

  const acceptedFriends = await db
    .select()
    .from(friends)
    .where(and(eq(friends.userId, userId), eq(friends.status, "accepted")));

  for (const rel of acceptedFriends) {
    const friend = XMPPClient.clients.find(
      (i) => i.user?.accountId === rel.friendId
    );
    if (!friend) continue;

    let xml = xmlbuilder
      .create("presence")
      .attribute("to", client.jid)
      .attribute("xmlns", "jabber:client")
      .attribute("from", friend.jid)
      .attribute("type", "available");

    if (friend.lastPresenceUpdate.away) {
      xml = xml
        .element("show", "away")
        .up()
        .element("status", friend.lastPresenceUpdate.status)
        .up();
    } else {
      xml = xml.element("status", friend.lastPresenceUpdate.status).up();
    }

    client.ws?.send(xml.toString());
  }
}

export async function updatePresenceForFriends(
  client: XMPPClient,
  body: string,
  away: boolean,
  offline: boolean
) {
  client.lastPresenceUpdate.away = away;
  client.lastPresenceUpdate.status = body;

  const userId = client.user?.accountId;
  if (!userId) return;

  const acceptedFriends = await db
    .select()
    .from(friends)
    .where(and(eq(friends.userId, userId), eq(friends.status, "accepted")));

  for (const rel of acceptedFriends) {
    const friend = XMPPClient.clients.find(
      (i) => i.user?.accountId === rel.friendId
    );
    if (!friend) continue;

    let xml = xmlbuilder
      .create("presence")
      .attribute("to", friend.jid)
      .attribute("xmlns", "jabber:client")
      .attribute("from", client.jid)
      .attribute("type", offline ? "unavailable" : "available");

    if (client.lastPresenceUpdate.away) {
      xml = xml
        .element("show", "away")
        .up()
        .element("status", client.lastPresenceUpdate.status)
        .up();
    } else {
      xml = xml.element("status", client.lastPresenceUpdate.status).up();
    }

    friend.ws?.send(xml.toString());
  }
}
