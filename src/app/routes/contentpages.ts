import app from "..";

import { emergency_notice, tournaments } from "../../database/schema";
import { db } from "../../app/index";

import fs from "fs";
import path from "path";
import { FortMP } from "../../utils/error";
import { parseUserAgent } from "../../utils/useragent";

app.get("/content/api/pages/*", async (c) => {
  const userAgent = c.req.header("User-Agent");

  if (!userAgent) return c.sendError(FortMP.internal.invalidUserAgent);

  const versionInfo = await parseUserAgent(userAgent);

  const contentpages = JSON.parse(
    fs.readFileSync(
      path.join(__dirname, "../../json/templates/contentpages.json"),
      "utf-8"
    )
  );

  const allTournaments = await db.select().from(tournaments);

  allTournaments.forEach((t) => {
    contentpages.tournamentinformation.tournament_info.tournaments.push({
      title_color: "FFFFFF",
      loading_screen_image: t.images.loading_screen_image,
      background_text_color: "040E4C",
      background_right_color: "012162",
      poster_back_image: t.images.poster_back_image,
      _type: "Tournament Display Info",
      tournament_display_id: t.tournament_display_id,
      highlight_color: "F7FF00",
      schedule_info: t.beginTime.toDateString(),
      primary_color: "FFFFFF",
      flavor_description: "Test",
      poster_front_image: t.images.poster_front_image,
      short_format_title: "",
      title_line_2: t.description,
      title_line_1: t.title,
      shadow_color: "000F4A",
      details_description: t.description,
      background_left_color: "0076C3",
      long_format_title: "",
      poster_fade_color: "0076C3",
      secondary_color: "000F4A",
      playlist_tile_image:
        "https://fortnite-public-service-prod11.ol.epicgames.com/images/motd-s.png",
      base_color: "FFFFFF",
    });
  });

  contentpages.tournamentinformation.tournament_info.tournaments.push([
    {
      title_color: "FFFFFF",
      loading_screen_image:
        "https://fortnite-public-service-prod11.ol.epicgames.com/images/motd.png",
      background_text_color: "040E4C",
      background_right_color: "012162",
      poster_back_image:
        "https://fortnite-public-service-prod11.ol.epicgames.com/images/poster_back.png",
      _type: "Tournament Display Info",
      tournament_display_id: "fortmp_cup",
      highlight_color: "F7FF00",
      schedule_info: "July 22nd, 2025",
      primary_color: "FFFFFF",
      flavor_description: "Test",
      poster_front_image: "https://cdn.fortmp.dev/Victorycup.jpg",
      short_format_title: "",
      title_line_2: "LateGame Solo",
      title_line_1: "FortMP Performance Eval Cup",
      shadow_color: "000F4A",
      details_description: "Test",
      background_left_color: "0076C3",
      long_format_title: "",
      poster_fade_color: "0076C3",
      secondary_color: "000F4A",
      playlist_tile_image:
        "https://fortnite-public-service-prod11.ol.epicgames.com/images/motd-s.png",
      base_color: "FFFFFF",
    },
  ]);

  ["saveTheWorldUnowned", "battleRoyale", "creative"].forEach((mode) => {
    contentpages.subgameselectdata[mode].message.title =
      contentpages.subgameselectdata[mode].message.title["en"];
    contentpages.subgameselectdata[mode].message.body =
      contentpages.subgameselectdata[mode].message.body["en"];
  });

  contentpages.dynamicbackgrounds.backgrounds.backgrounds[0].stage = `season${versionInfo.season}`;
  contentpages.dynamicbackgrounds.backgrounds.backgrounds[1].stage = `season${versionInfo.season}`;

  const result = await db.select().from(emergency_notice).limit(1);
  const notice = result[0];

  if (notice) {
    console.log("Emergency notice found, updating contentpages...");
    contentpages.emergencynotice = {
      news: {
        platform_messages: [],
        _type: "Battle Royale News",
        messages: [
          {
            hidden: false,
            _type: "CommonUI Simple Message Base",
            subgame: "br",
            body: notice.body,
            title: notice.title,
            spotlight: false,
          },
        ],
      },
      "jcr:isCheckedOut": true,
      _title: "emergencynotice",
      _noIndex: false,
      alwaysShow: true,
      "jcr:baseVersion": "a7ca237317f1e761d4ee60-7c40-45a8-aa3e-bb0a2ffa9bb5",
      _activeDate: "2018-08-06T19:00:26.217Z",
      lastModified: "2020-10-30T04:50:59.198Z",
      _locale: "en-US",
    };

    contentpages.emergencynoticev2 = {
      "jcr:isCheckedOut": true,
      _title: "emergencynoticev2",
      _noIndex: false,
      emergencynotices: {
        _type: "Emergency Notices",
        emergencynotices: [
          {
            hidden: false,
            _type: "CommonUI Emergency Notice Base",
            title: notice.title,
            body: notice.body,
          },
        ],
      },
      _activeDate: "2018-08-06T19:00:26.217Z",
      lastModified: "2021-03-17T15:07:27.924Z",
      _locale: "en-US",
    };
  }

  return c.json(contentpages);
});
