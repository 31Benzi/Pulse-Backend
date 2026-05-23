import app from "..";
import { FortMP } from "../../utils/error";
import { parseUserAgent } from "../../utils/useragent";

interface EventsInterface {
  season: string;
  EventFlags: string[];
}

app.get("/fortnite/api/calendar/v1/timeline", async (c) => {
  const userAgentHeader = c.req.header("User-Agent");
  if (!userAgentHeader) return c.sendError(FortMP.internal.invalidUserAgent);

  const versionInfo = await parseUserAgent(userAgentHeader);

  const activeEvents = [
    {
      eventType: `EventFlag.Season${versionInfo.season}`,
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "2020-01-01T00:00:00.000Z",
    },
    {
      eventType: `EventFlag.${versionInfo.lobby}`,
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "2020-01-01T00:00:00.000Z",
    },
  ];

  const events = await Bun.file("src/json/events.json").json();

  const seasons: EventsInterface[] = events.seasons;

  for (const season of seasons) {
    if (versionInfo.season == Number.parseInt(season.season)) {
      for (const EventFlag of season.EventFlags) {
        activeEvents.push({
          eventType: EventFlag,
          activeSince: "2020-01-01T00:00:00.000Z",
          activeUntil: "9999-01-01T00:00:00.000Z",
        });
      }
    }
  }

  const buildNum = Number.parseFloat(versionInfo.build);

  if (buildNum >= 3.1)
    activeEvents.push({
      eventType: "EventFlag.Spring2018Phase2",
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "2020-01-01T00:00:00.000Z",
    });
  if (buildNum >= 3.3)
    activeEvents.push({
      eventType: "EventFlag.Spring2018Phase3",
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "2020-01-01T00:00:00.000Z",
    });
  if (buildNum >= 3.4)
    activeEvents.push({
      eventType: "EventFlag.Spring2018Phase4",
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "2020-01-01T00:00:00.000Z",
    });

  if (buildNum >= 4.3) {
    activeEvents.push({
      eventType: "EventFlag.Blockbuster2018Phase2",
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "2020-01-01T00:00:00.000Z",
    });
  }
  if (buildNum >= 4.4) {
    activeEvents.push({
      eventType: "EventFlag.Blockbuster2018Phase3",
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "2020-01-01T00:00:00.000Z",
    });
  }
  if (buildNum >= 4.5) {
    activeEvents.push({
      eventType: "EventFlag.Blockbuster2018Phase4",
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "2020-01-01T00:00:00.000Z",
    });
  }
  if (buildNum == 5.1) {
    activeEvents.push({
      eventType: "EventFlag.BirthdayBattleBus",
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "2020-01-01T00:00:00.000Z",
    });
  }

  if (buildNum >= 6.2) {
    activeEvents.push(
      {
        eventType: "EventFlag.Fortnitemares",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      },
      {
        eventType: "EventFlag.FortnitemaresPhase1",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      },
      {
        eventType: "POI0",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      }
    );
  }
  if (buildNum >= 6.22) {
    activeEvents.push({
      eventType: "EventFlag.FortnitemaresPhase2",
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "2020-01-01T00:00:00.000Z",
    });
  }
  if (buildNum == 6.2 || buildNum == 6.21) {
    activeEvents.push(
      {
        eventType: "EventFlag.LobbySeason6Halloween",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      },
      {
        eventType: "EventFlag.HalloweenBattleBus",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      }
    );
  }

  if (buildNum >= 8.2) {
    activeEvents.push({
      eventType: "EventFlag.Spring2019.Phase2",
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "2020-01-01T00:00:00.000Z",
    });
  }

  if (buildNum >= 9.2) {
    activeEvents.push({
      eventType: "EventFlag.Season9.Phase2",
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "2020-01-01T00:00:00.000Z",
    });
  }

  if (buildNum >= 11.2) {
    activeEvents.push({
      eventType: "EventFlag.Starlight",
      activeUntil: "9999-01-01T00:00:00.000Z",
      activeSince: "2020-01-01T00:00:00.000Z",
    });
  }

  if (buildNum < 11.3) {
    if (buildNum >= 11.01) {
      activeEvents.push({
        eventType: "EventFlag.Season11.Fortnitemares.Quests.Phase1",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      });
    }
    if (buildNum >= 11.1) {
      activeEvents.push(
        {
          eventType: "EventFlag.Season11.Fortnitemares.Quests.Phase2",
          activeUntil: "9999-01-01T00:00:00.000Z",
          activeSince: "2020-01-01T00:00:00.000Z",
        },
        {
          eventType: "EventFlag.Season11.Fortnitemares.Quests.Phase3",
          activeUntil: "9999-01-01T00:00:00.000Z",
          activeSince: "2020-01-01T00:00:00.000Z",
        },
        {
          eventType: "EventFlag.Season11.Fortnitemares.Quests.Phase4",
          activeUntil: "9999-01-01T00:00:00.000Z",
          activeSince: "2020-01-01T00:00:00.000Z",
        },
        {
          eventType: "EventFlag.StormKing.Landmark",
          activeUntil: "9999-01-01T00:00:00.000Z",
          activeSince: "2020-01-01T00:00:00.000Z",
        }
      );
    }
  }

  if (buildNum == 11.31 || buildNum == 11.4) {
    activeEvents.push(
      {
        eventType: "EventFlag.Winterfest.Tree",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      },
      {
        eventType: "EventFlag.LTE_WinterFest",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      },
      {
        eventType: "EventFlag.LTE_WinterFest2019",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      }
    );
  }

  if (buildNum == 19.01) {
    activeEvents.push(
      {
        eventType: "EventFlag.LTE_WinterFest",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      },
      {
        eventType: "WF_IG_AVAIL",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      }
    );
  }

  if (buildNum == 23.1) {
    activeEvents.push(
      {
        eventType: "EventFlag.LTE_WinterFest",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      },
      {
        eventType: "EventFlag.LTE_WinterFestTab",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      },
      {
        eventType: "WF_GUFF_AVAIL",
        activeUntil: "9999-01-01T00:00:00.000Z",
        activeSince: "2020-01-01T00:00:00.000Z",
      }
    );
  }

  const stateTemplate = {
    activeStorefronts: [],
    eventNamedWeights: {},
    seasonNumber: versionInfo.season,
    seasonTemplateId: `AthenaSeason:athenaseason${versionInfo.season}`,
    matchXpBonusPoints: 0,

    seasonBegin: "2018-12-06T13:00:00Z",
    seasonEnd: "2019-02-28T14:00:00Z",
    seasonDisplayedEnd: "2019-02-28T14:00:00Z",

    weeklyStoreEnd: "2019-03-01T00:00:00Z",
    stwEventStoreEnd: "2019-03-01T00:00:00.000Z",
    stwWeeklyStoreEnd: "2019-03-01T00:00:00.000Z",

    sectionStoreEnds: {
      Featured: "2019-03-01T00:00:00.000Z",
    },

    dailyStoreEnd: "2019-03-01T00:00:00Z",
  };

  const states = [
    {
      validFrom: "2019-02-28T14:00:00Z",
      activeEvents: activeEvents.slice(),
      state: stateTemplate,
    },
  ];

  return c.json({
    channels: {
      "client-matchmaking": {
        states: [],
        cacheExpire: "9999-01-01T22:28:47.830Z",
      },
      "client-events": {
        states: states,
        cacheExpire: "9999-01-01T22:28:47.830Z",
      },
    },
    eventsTimeOffsetHrs: 0,
    cacheIntervalMins: 10,
    currentTime: new Date().toISOString(),
  });
});
