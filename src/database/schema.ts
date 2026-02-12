import { SQL, sql, type AnyColumn } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  boolean,
  integer,
  serial,
  date,
  uniqueIndex,
  index,
  PgArray,
  json,
  PgColumn,
} from "drizzle-orm/pg-core";
import type { Friends } from "../types/xmpp.t";
import { type PartyInvite, type PartyMember } from "../types/party.t";
import type { Stats } from "../types/launcher.t";
import { string } from "zod";

export const increment = (column: AnyColumn, value = 1) => {
  return sql`${column} + ${value}`;
};

export const decrement = (column: AnyColumn, value = 1) => {
  return sql`${column} - ${value}`;
};

export const users = pgTable(
  "users",
  {
    accountId: text("accountId").primaryKey().unique(),
    username: text("username").notNull().unique(),
    email: text("email").notNull(),
    discordId: text("discordId").notNull().unique().default("0"),
    password: text("password").notNull().default("abc123"),
    exchange_code: text("exchange_code"),
    createdAt: timestamp("createdAt").defaultNow(),
    banned: boolean("banned").default(false),
    banHistory: jsonb("banHistory").notNull().default([]),
    lastLogin: timestamp("lastLogin").defaultNow(),
    lastIP: text("lastIP"),
    hwid: text("hwid"),
    isDonator: boolean("isDonator").notNull().default(false),
    isAffiliate: boolean("isAffiliate").notNull().default(false),
    stats: jsonb("stats")
      .notNull()
      .default({
        kills: 0,
        wins: 0,
        deaths: 0,
        hype: 0,
        division: "Division1",
      })
      .$type<Stats>(),
  },
  (users) => [
    uniqueIndex("acid_idx").on(users.accountId),
    uniqueIndex("un_idx").on(users.username),
    uniqueIndex("did_idx").on(users.discordId),
  ]
);

export type FriendStatus =
  | "accepted"
  | "incoming"
  | "outgoing"
  | "blocked"
  | "pending";

export type User = typeof users.$inferSelect;

export const tokens = pgTable("tokens", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  accountId: text("accountId")
    .references(() => users.accountId)
    .notNull(),
  token_type: text("token_type").notNull(),
  token: text("token").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    accountId: text("accountId")
      .references(() => users.accountId)
      .notNull(),
    profileId: text("profileId").notNull(),
    revision: integer("revision").default(1),
    commandRevision: integer("commandRevision").default(1),
    createdAt: timestamp("createdAt").defaultNow(),
    updatedAt: timestamp("updatedAt").defaultNow(),
  },
  (profiles) => [
    uniqueIndex("prof_primary_idx").on(profiles.id),
    index("prof_acid_idx").on(profiles.accountId),
    index("prof_id_idx").on(profiles.profileId),
  ]
);

export type Profile = typeof profiles.$inferSelect;

export const items = pgTable(
  "items",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    accountId: text("accountId")
      .references(() => users.accountId)
      .notNull(),
    profileId: text("profileId").notNull(),
    templateId: text("templateId").notNull(),
    value: text("value").notNull(),
    quantity: integer("quantity").default(1),
  },
  (items) => [
    uniqueIndex("item_primary_idx").on(items.id),
    index("item_profid_idx").on(items.profileId),
    index("item_acid_idx").on(items.accountId),
    index("item_tempid_idx").on(items.templateId),
  ]
);

export const profileAttributes = pgTable(
  "profileAttributes",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    accountId: text("accountId")
      .references(() => users.accountId)
      .notNull(),
    profileId: text("profileId").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
  },
  (profileAttributes) => [
    uniqueIndex("attr_primary_idx").on(profileAttributes.id),
    index("attr_acid_idx").on(profileAttributes.accountId),
    index("attr_profid_idx").on(profileAttributes.profileId),
  ]
);

export const news = pgTable("news", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  title: text("title").notNull(),
  content: text("content").notNull(),
  date: date("date").notNull().defaultNow(),
});

export const emergency_notice = pgTable("emergency_notice", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  title: text("title").notNull(),
  body: text("body").notNull(),
  hidden: boolean("hidden").default(false),
});

export function getISOFormatDateQuery(dateTimeColumn: PgColumn): SQL<string> {
  return sql<string>`to_char(${dateTimeColumn}, 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`;
}

interface TournamentImages {
  poster_front_image: string;
  poster_back_image: string;
  loading_screen_image: string;
}

export const tournaments = pgTable("tournaments", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  title: text("title").notNull(),
  description: text("description"),
  eventId: uuid("eventId")
    .default(sql`uuid_generate_v4()`)
    .notNull(),
  eventWindowId: uuid("eventWindowId")
    .default(sql`uuid_generate_v4()`)
    .notNull(),
  tournament_display_id: text("tournament_display_id").notNull(),
  images: jsonb("images")
    .default({
      poster_front_image: "",
      poster_back_image: "",
      loading_screen_image: "",
    })
    .notNull()
    .$type<TournamentImages>(),
  beginTime: timestamp("beginTime", { withTimezone: true })
    .defaultNow()
    .notNull(),
  endTime: timestamp("endTime", { withTimezone: true }).notNull(),
  leaderboardId: uuid("leaderboardId")
    .default(sql`uuid_generate_v4()`)
    .notNull(),
  players: jsonb("players").default([]).notNull().$type<string[]>(),
});

export const storefrontEntries = pgTable("storefrontEntries", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  storefront: text("storefront").notNull(),
  backendType: text("backendType").notNull(),
  cosmeticId: text("cosmeticId").notNull(),
  backpackId: text("backpackId").default(""),
  price: integer("price").notNull(),
  categories: jsonb("categories").notNull().default([]),
  displayAssetPath: text("displayAssetPath").default(""),
  title: text("title").default(""),
  description: text("description").default(""),
  shortDescription: text("shortDescription").default(""),
  offerId: text("offerId").notNull(),
  createdAt: timestamp("createdAt").defaultNow(),
});

export const affiliates = pgTable("affiliates", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  ownerAccountId: text("accountId")
    .references(() => users.accountId)
    .notNull(),
  code: text("code").notNull(),
});

export const servers = pgTable(
  "servers",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`uuid_generate_v4()`),
    ip: text("ip").notNull(),
    port: integer("port").default(0).notNull(),
    playlist: text("playlist").notNull(),
    sessionId: text("sessionId").notNull().unique(),
    region: text("region").notNull(),
    open: boolean("open").default(true),
  },
  (servers) => [uniqueIndex("server_sid_idx").on(servers.sessionId)]
);

export type ServerType = typeof servers.$inferSelect;

export const hotfixes = pgTable("hotfixes", {
  id: uuid("id")
    .primaryKey()
    .default(sql`uuid_generate_v4()`),
  filename: text("filename").notNull(),
  content: text("content").notNull(),
  updatedAt: timestamp("updatedAt", { mode: "string" })
    .notNull()
    .default(sql`now()`),
});

export const friends = pgTable(
  "friends",
  {
    id: serial("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.accountId, { onDelete: "cascade" }),
    friendId: text("friendId")
      .notNull()
      .references(() => users.accountId, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"), // accepted | incoming | outgoing | blocked
    createdAt: timestamp("createdAt").defaultNow(),
  },
  (friends) => [
    uniqueIndex("unique_friend_pair").on(friends.userId, friends.friendId),
  ]
);
