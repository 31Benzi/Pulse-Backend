import { eq } from "drizzle-orm";
import app, { db } from "..";
import { tournaments, users } from "../../database/schema";
import { verifyUser } from "../../database/tokenManager";

app.get("/*/api/statsv2/account/:accountId", verifyUser, async (c) => {
  const { accountId } = c.req.param();

  return c.json({
    accountId: accountId,
    endTime: 0,
    startTime: c.req.query("startTime") ?? 0,
    stats: {
      br_placetop1_keyboardmouse_m0_playlist_defaultsolo: 0,
      br_placetop1_keyboardmouse_m0_playlist_defaultduo: 0,
      br_placetop1_keyboardmouse_m0_playlist_defaultsquad: 0,
      br_placetop1_keyboardmouse_m0_playlist_solidgold_solo: 0,
      br_placetop10_keyboardmouse_m0_playlist_defaultsolo: 0,
      br_placetop5_keyboardmouse_m0_playlist_defaultduo: 0,
      br_placetop3_keyboardmouse_m0_playlist_defaultsquad: 0,
      br_placetop25_keyboardmouse_m0_playlist_defaultsolo: 0,
      br_placetop12_keyboardmouse_m0_playlist_defaultduo: 0,
      br_placetop6_keyboardmouse_m0_playlist_defaultsquad: 0,
      br_kills_keyboardmouse_m0_playlist_defaultsolo: 0,
      br_kills_keyboardmouse_m0_playlist_defaultduo: 0,
      br_kills_keyboardmouse_m0_playlist_defaultsquad: 0,
      br_kills_keyboardmouse_m0_playlist_solidgold_solo: 0,
      br_matchesplayed_keyboardmouse_m0_playlist_defaultsolo: 0,
      br_matchesplayed_keyboardmouse_m0_playlist_defaultduo: 0,
      br_matchesplayed_keyboardmouse_m0_playlist_defaultsquad: 0,
      br_matchesplayed_keyboardmouse_m0_playlist_solidgold_solo: 0,
      br_minutesplayed_keyboardmouse_m0_playlist_defaultsolo: 0,
      br_minutesplayed_keyboardmouse_m0_playlist_defaultduo: 0,
      br_minutesplayed_keyboardmouse_m0_playlist_defaultsquad: 0,
      br_minutesplayed_keyboardmouse_m0_playlist_solidgold_solo: 0,
      br_playersoutlived_keyboardmouse_m0_playlist_defaultsolo: 0,
      br_playersoutlived_keyboardmouse_m0_playlist_defaultduo: 0,
      br_playersoutlived_keyboardmouse_m0_playlist_defaultsquad: 0,
      br_playersoutlived_keyboardmouse_m0_playlist_solidgold_solo: 0,
      br_score_keyboardmouse_m0_playlist_defaultsolo: 0,
      br_score_keyboardmouse_m0_playlist_defaultduo: 0,
      br_score_keyboardmouse_m0_playlist_defaultsquad: 0,
      br_score_keyboardmouse_m0_playlist_solidgold_solo: 0,
    },
  });
});

app.get(
  "/api/v1/leaderboards/Fortnite/:eventId/:eventWindowId/:accountId",
  async (c) => {
    const tournament = await db
      .select()
      .from(tournaments)
      .where(eq(tournaments.eventId, c.req.param("eventId")))
      .then((r) => r[0]);

    const leaderboard = await Bun.file(
      "src/json/templates/events/leaderboard.json"
    ).json();

    leaderboard.eventId = c.req.param("eventId");
    leaderboard.eventWindowId = c.req.param("eventWindowId");

    const entryTemplate = leaderboard.entryTemplate;

    for (var i = 0; i < tournament.players.length; i++) {
      const entry = { ...entryTemplate };

      entry.eventId = c.req.param("eventId");
      entry.eventWindowId = c.req.param("eventWindowId");

      entry.teamAccountIds = [tournament.players[i]];
      entry.teamId = tournament.players[i];

      entry.pointsEarned = 0; // TODO

      entry.pointBreakdown = {
        "PLACEMENT_STAT_INDEX:13": {
          timesAchieved: 0,
          pointsEarned: 0,
        },
        "TEAM_ELIMS_STAT_INDEX:37": {
          timesAchieved: 0,
          pointsEarned: 0,
        },
      }; // TODO

      entry.rank = 1; // TODO

      leaderboard.entries.push(entry);
    }

    return c.json(leaderboard);
  }
);
