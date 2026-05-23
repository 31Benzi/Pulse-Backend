import { eq, and } from "drizzle-orm";
import app, { db } from "..";
import {
  createUser,
  getUserByAccountId,
  getUserByUsername,
} from "../../database/accountManager";
import {
  createProfiles,
  giveFullLocker,
  increaseProfileCommandRevisionPrepared,
  increaseProfileRevisionPrepared,
} from "../../database/profileManager";
import {
  getISOFormatDateQuery,
  increment,
  items,
  servers,
  tournaments,
  users,
} from "../../database/schema";
import { FortMP } from "../../utils/error";
import logger from "../../utils/logger";
import { parseUserAgent } from "../../utils/useragent";
import type { ServerType } from "../../database/schema";
import { GetAuthUser } from "../../database/tokenManager";
import axios from "axios";
import path from "path";
import fs from "fs";
import { increasePartyRevisionPrepared } from "../../database/partyManager";
import { XMPPClient } from "../../sockets/xmpp/xmpp-client";

app.get("/fortnite/api/game/v2/enabled_features", async (c) => {
  return c.json([]);
});

app.get("/api/v1/events/Fortnite/download/:accountId", async (c) => {
  const user = await getUserByAccountId(c.req.param("accountId"));
  if (!user) return c.sendError(FortMP.basic.badRequest);

  const s = (await parseUserAgent(c.req.header("User-Agent") || "")).season;

  const scores = await Bun.file("src/json/templates/events/score.json").json();
  const rawTemplates = await Bun.file(
    "src/json/templates/events/templates.json",
  ).json();
  const rawEvents = await Bun.file(
    "src/json/templates/events/events.json",
  ).json();

  const templates = JSON.parse(
    JSON.stringify(rawTemplates).replaceAll("S17", `S${s}`),
  );
  const events = JSON.parse(
    JSON.stringify(rawEvents).replaceAll("S17", `S${s}`),
  );

  const validTemplateIds = new Set(
    templates.map((t: any) => t.eventTemplateId),
  );
  const filteredEvents = events
    .map((event: any) => ({
      ...event,
      eventWindows: event.eventWindows.filter((win: any) =>
        validTemplateIds.has(win.eventTemplateId),
      ),
    }))
    .filter((event: any) => event.eventWindows.length > 0);

  const resolvedWindowLocations: any = {};
  filteredEvents.forEach((event: any) => {
    event.eventWindows.forEach((window: any) => {
      const fullId = `Fortnite:${event.eventId}:${window.eventWindowId}`;
      resolvedWindowLocations[fullId] = [fullId];
    });
  });

  const userHype = user.stats.hype ?? 0;
  const divisionNum = parseInt(user.stats.division?.replace(/\D/g, "") || "1");

  const res = {
    events: filteredEvents,
    templates: templates,
    player: {
      tokens: Array.from(
        { length: divisionNum },
        (_, i) => `ARENA_S${s}_Division${i + 1}`,
      ),
      gameId: "Fortnite",
      accountId: user.accountId,
      teams: {},
      pendingPayouts: [],
      pendingPenalties: {},
      persistentScores: {
        [`Hype_S${s}`]: userHype,
        Hype: userHype,
        [`Hype_S${s}_P`]: userHype,
        [`LGHype_S${s}_Pv2`]: userHype,
      },
      groupIdentity: {},
    },
    scoringRuleSets: {
      fortmpscoringrules: scores,
    },
    resolvedWindowLocations: resolvedWindowLocations,
  };

  return c.json(res);
});

app.get("/api/v1/events/Fortnite/:eventId/history/:accountId", async (c) => {
  const tournament = await db
    .select()
    .from(tournaments)
    .where(eq(tournaments.eventId, c.req.param("eventId")));

  return c.json([
    {
      scoreKey: {
        gameId: "Fortnite",
        eventId: tournament[0].eventId,
        eventWindowId: tournament[0].eventWindowId,
        _scoreId: null,
      },
      teamId: "",
      teamAccountIds: [],
      liveSessionId: null,
      pointsEarned: 0,
      score: 0.0,
      rank: 1,
      percentile: 0,
      pointBreakdown: {
        "TEAM_ELIMS_STAT_INDEX:1": {
          timesAchieved: 0,
          pointsEarned: 0,
        },
        "PLACEMENT_STAT_INDEX:2": {
          timesAchieved: 0,
          pointsEarned: 0,
        },
      },
      sessionHistory: [
        // {
        //   sessionId: "fortmpsessionid1lol",
        //   endTime: "2025-07-23T20:00:00Z",
        //   trackedStats: {
        //     // TODO
        //     PLACEMENT_STAT_INDEX: 0,
        //     GainedHealthTimes: 0,
        //     TIME_ALIVE_STAT: 0,
        //     MATCH_PLAYED_STAT: 0,
        //     PLACEMENT_TIEBREAKER_STAT: 0,
        //     DamageDealt: 0,
        //     DamageReceived: 0,
        //     VICTORY_ROYALE_STAT: 0,
        //     Headshots: 0,
        //     Travel_Distance_Ground: 0,
        //     TEAM_ELIMS_STAT_INDEX: 0,
        //     GainedShieldTimes: 0,
        //   },
        // },
      ],
      unscoredSessions: [],
    },
  ]);
});

app.post("/fortnite/api/game/v2/grant_access/:accountId", async (c) => {
  return c.json([]);
});

app.get("/fortnite/api/receipts/v1/account/:accountId/receipts", async (c) => {
  return c.json([]);
});

app.all("/v1/epic-settings/public/users/*/values", (c) => c.json({}));

app.get("/links/api/fn/mnemonic/*", async (c) => {
  const discovery = await Bun.file("src/json/discovery_frontend.json").json();

  for (var i in discovery.v2.Panels[1].Pages[0].results) {
    if (
      discovery.v2.Panels[1].Pages[0].results[i].linkData.mnemonic ==
      c.req.url.split("/").slice(-1)[0]
    ) {
      return c.json(discovery.v2.Panels[1].Pages[0].results[i].linkData);
    }
  }
});

// app.get("/createuser/:username", async (c) => {
//   const username = c.req.param("username");

//   await createUser(username, `${username}@bynd.lol`);

//   return c.json({
//     message: "Profiles created successfully",
//   });
// });

app.post("/fortmp/api/gameserver/applyPlayerResults", async (c) => {
  const Authorization = c.req.header("Authorization");

  if (!Authorization) return c.json(FortMP.basic.badRequest);

  if (Authorization !== "e4fb3874-3e8f-486d-bf93-ede2b232acf3")
    return c.json(FortMP.basic.badRequest);

  const body = await c.req.json<{
    playerName: string;
    kills: number;
    xpEarned: number;
    position: number;
  }>();

  if (!body) return c.json(FortMP.basic.badRequest);

  const user = await getUserByUsername(body.playerName);

  if (!user) return c.json(FortMP.basic.badRequest);

  let calculatedHype = 0;
  let calculatedVBucks = 0;

  for (let i = 0; i < body.kills; i++) {
    calculatedHype += 20;
    calculatedVBucks += 100;
  }

  if (body.position === 1) {
    calculatedHype += 60;
    calculatedVBucks += 300;
  }

  console.log(calculatedVBucks);

  await increaseProfileRevisionPrepared.execute({
    accountId: user.accountId,
    profileId: "common_core",
  });
  await increaseProfileCommandRevisionPrepared.execute({
    accountId: user.accountId,
    profileId: "common_core",
  });
  await increaseProfileRevisionPrepared.execute({
    accountId: user.accountId,
    profileId: "athena",
  });
  await increaseProfileCommandRevisionPrepared.execute({
    accountId: user.accountId,
    profileId: "athena",
  });

  await db
    .update(items)
    .set({
      quantity: increment(items.quantity, calculatedVBucks),
    })
    .where(
      and(
        eq(items.accountId, user.accountId),
        eq(items.profileId, "common_core"),
        eq(items.templateId, "Currency:MtxPurchased"),
      ),
    );

  XMPPClient.sendXMPPMessageToClient(
    {
      type: "com.epicgames.gift.received",
      payload: {},
      timestamp: new Date(),
    },
    user.accountId,
  );

  await db
    .update(users)
    .set({
      stats: {
        kills: user.stats.kills + body.kills,
        deaths: body.position !== 1 ? user.stats.deaths + 1 : user.stats.deaths,
        wins: body.position === 1 ? user.stats.wins + 1 : user.stats.wins,
        hype: calculatedHype,
      },
    })
    .where(eq(users.accountId, user.accountId));

  return c.sendStatus(200);
});

app.get("/sdk/v1/*", async (c) => {
  const sdk = await Bun.file("src/json/sdkv1.json").json();

  return c.json(sdk);
});

app.post("/epic/oauth/v2/token", async (c) => {
  const user = await GetAuthUser(c);

  return c.json({
    scope: "basic_profile friends_list openid presence",
    token_type: "bearer",
    access_token: "fortmpaccesstoken",
    expires_in: 28800,
    expires_at: "9999-12-31T23:59:59.999Z",
    refresh_token: "fortmprefreshtoken",
    refresh_expires_in: 86400,
    refresh_expires_at: "9999-12-31T23:59:59.999Z",
    account_id: user?.accountId,
    client_id: "fortmpcid",
    application_id: "fortmpappid",
    selected_account_id: user?.accountId,
    id_token: "fortmpidtoken",
  });
});

app.post("/auth/v1/oauth/token", async (c) => {
  return c.json({
    access_token: "fortmptoken",
    token_type: "bearer",
    expires_in: 28800,
    expires_at: "9999-12-31T23:59:59.999Z",
    nonce: "fortmp",
    features: ["AntiCheat", "Connect", "Ecom", "Inventories", "LockerService"],
    deployment_id: "fortmpdpid",
    organization_id: "fortmporgid",
    organization_user_id: "fortmporguserid",
    product_id: "prod-fn",
    product_user_id: "fortmpuserid",
    product_user_id_created: false,
    id_token: "fortmpidtoken",
    sandbox_id: "fn",
  });
});

app.get("/epic/id/v2/sdk/accounts", async (c) => {
  const user = await GetAuthUser(c);

  return c.json([
    {
      accountId: user?.accountId,
      displayName: user?.username,
      preferredLanguage: "en",
      cabinedMode: false,
      empty: false,
    },
  ]);
});

app.get("/api/v1/assets/Fortnite/*/*", async (c) => {
  // TODO: Update to be universal for all playlists

  return c.json({
    meta: {
      revision: 1,
      headRevision: 1,
      revisedAt: "2025-06-06T19:20:59.013Z",
      promotion: 0,
      promotedAt: "2025-06-06T19:20:59.013Z",
    },
    assetData: {
      bOwnerFilterDestructedBuildingsInGrid: false,
      bDisplayRespawnWidget: false,
      LootLevel: "1",
      bRequireCrossplayEnabled: true,
      ForceKickAfterDeathMode: "Disabled",
      bRequirePickaxeInStartingInventory: true,
      bRewardsAllowXPProgression: true,
      MmrThresholdForPrioritySession: "0",
      bVehiclesDestroyAllBuildingSMActorsOnContact: false,
      EndOfMatchXpFirstElim: "50",
      RankScalingMaxDelta: "500.000000",
      bEnableSpawningStartup: true,
      PlacementGainMin: "0.000000",
      bAllowReturnToMatchmakingOriginOnMatchEnd: false,
      bShouldSpreadTeams: true,
      ServerPerClientMaxAI: "-1",
      LootDropRounds: "1",
      PlaylistName: "Playlist_DefaultSolo",
      UIDisplaySubName: {
        Category: "Game",
        NativeCulture: "",
        Namespace: "",
        LocalizedStrings: [],
        bIsMinimalPatch: false,
        NativeString: "",
        Key: "",
      },
      bLimitedTimeMode: false,
      SafeZoneStartUp: "UseDefaultGameBehavior",
      AircraftPathOffsetFromMapCenterMax: "0.000000",
      ServerPerformanceEventFrequency: "0.000000",
      MaxBucketCapacity: "-1",
      MinTimeBeforeRespawnCameraFade: "3.000000",
      BuildingLevelOverride: "0",
      bIgnoreWeatherEvents: false,
      bUsesAnimationSharing: false,
      OutlierBracketBalanceMergeInterval: "",
      bForceCameraFadeOnRespawn: true,
      bAllowBotsInHumanTeams: false,
      bDisallowMultipleWeaponsOfType: false,
      DADTestValue: "0",
      bLeaderboardDisplaysIndividuals: true,
      bSkipAircraft: false,
      bAircraftDropOnlyWithinSafeZone: false,
      bDisableMatchStatsDisplay: false,
      bPlaylistUsesCustomCharacterParts: false,
      SeasonNumber: "-1",
      bOverrideServerPerClientMaxAI: false,
      bShowEliminationIndicatorForTeammates: true,
      RewardTimePlayedType: "Default",
      bAllowSpectateAPartyMember: true,
      CalendarEventsForEndOfMatchUpdate: [],
      MinPlayers: "20",
      GameData:
        "/Game/Athena/Playlists/AthenaCompositeGameData.AthenaCompositeGameData",
      bEnableCreativeMode: false,
      UnderfilledMaxPlayers: "0",
      MinBackfillMatchPlayers: "0",
      bIgnoreGameModeStartingInventory: false,
      bShowEliminationIndicatorForSelf: false,
      DelayForPreServerTransitionAnimation: "0.000000",
      bTeamFilterDestructedBuildingsInGrid: true,
      LastStepPushAircraftCenterLine_Magnitude: "0.000000",
      bAllowBackfill: false,
      bUseReloadRankedFormula: false,
      RequiredEntitlementToken: "",
      RewardTimePlayedXPPerMinute: "-1",
      MinPlayersForPrivateServer: "0",
      DamageTakenMax: "0.000000",
      ForceOnlyBotsThreshold: "-1",
      BracketBalanceMergeInterval: "",
      ServerMetricsEventFrequency: "60.000000",
      FillRateTable: [
        {
          MinFillPct: "0.200000",
          MinMmr: "0",
          MaxPriority: "60.000000",
          MaxFillPct: "0.200000",
          MaxMmr: "400",
        },
        {
          MinFillPct: "0.200000",
          MinMmr: "401",
          MaxPriority: "60.000000",
          MaxFillPct: "0.250000",
          MaxMmr: "600",
        },
        {
          MinFillPct: "0.200000",
          MinMmr: "601",
          MaxPriority: "60.000000",
          MaxFillPct: "0.250000",
          MaxMmr: "800",
        },
        {
          MinFillPct: "0.200000",
          MinMmr: "801",
          MaxPriority: "60.000000",
          MaxFillPct: "0.250000",
          MaxMmr: "1000",
        },
        {
          MinFillPct: "0.200000",
          MinMmr: "1001",
          MaxPriority: "60.000000",
          MaxFillPct: "0.250000",
          MaxMmr: "1100",
        },
        {
          MinFillPct: "0.200000",
          MinMmr: "1101",
          MaxPriority: "60.000000",
          MaxFillPct: "0.250000",
          MaxMmr: "1200",
        },
        {
          MinFillPct: "0.250000",
          MinMmr: "1201",
          MaxPriority: "60.000000",
          MaxFillPct: "0.350000",
          MaxMmr: "1300",
        },
        {
          MinFillPct: "0.400000",
          MinMmr: "1301",
          MaxPriority: "60.000000",
          MaxFillPct: "0.700000",
          MaxMmr: "1400",
        },
        {
          MinFillPct: "0.500000",
          MinMmr: "1401",
          MaxPriority: "119.000000",
          MaxFillPct: "0.750000",
          MaxMmr: "1500",
        },
        {
          MinFillPct: "0.500000",
          MinMmr: "1501",
          MaxPriority: "119.000000",
          MaxFillPct: "0.850000",
          MaxMmr: "2000",
        },
      ],
      bShouldFillWhenNoSquadFillOption: false,
      LastStepPushAircraftCenterLine_Direction: "0.000000",
      bEnableStatsV2Stats: true,
      bUseAsyncPhysics: true,
      bShowEliminationIndicatorForSquadmates: true,
      UIDescription: {
        Category: "Game",
        NativeCulture: "",
        Namespace: "",
        LocalizedStrings: [],
        bIsMinimalPatch: false,
        NativeString: "Go it alone in a battle to be the last one standing.",
        Key: "0C08C0CB4F22661348F7F08031BEFB01",
      },
      QuickbarSelectionPreservationMode: "KeepSelectionWhenRespawning",
      bWarmUpInStorm: false,
      RankLossMax: "0.000000",
      bForceCustomMinigame: false,
      bUseFriendlyFireAimAssist: false,
      SkippedGamePhaseNotification: [],
      bForceEnableProximityVoiceChat: false,
      RatingType: "fun",
      CustomGameChannel: "Squad",
      bDisplayFinalStormPosition: false,
      bSkipWarmup: false,
      BotVersionPlaylistName: "Playlist_Bots_DefaultSolo",
      BracketBalanceSplitInterval: "",
      LastQueuedPlaylistPriority: "-1",
      AirCraftBehavior: "Default",
      bUseCustomAircraftPathSelection: false,
      bDrawCreativeDynamicIslands: false,
      MaximumAspectRatio: "0.000000",
      bShowTeamSelectButton: false,
      CurieManagerConfigOverrides: [],
      bCheckSquadFillMapForAvailableSlotsInBackfill: true,
      bRewardsTrackPlacement: true,
      LastSafeZoneIndex: "-1",
      bUseRankScaling: false,
      bAllowJoinInProgress: false,
      WarmupEarlyRequiredPlayerPercent: "0.000000",
      bEnableRatingUpdate: true,
      bAllowHardcoreModifiers: true,
      bAllowPartyRift: false,
      bIsRankedMode: false,
      bRespawnInAir: true,
      MaxBracketSize: "0",
      RankScalingStandardDeviation: "400.000000",
      bUsePlayerRating: true,
      RichPresenceAssetName: "solos",
      bUseLocalizationService: false,
      CompetitivePointClamp: "100",
      MinBracketSize: "0",
      GameType: "BR",
      WinConditionPlayersRemaining: "1",
      MaxPriority: "0.000000",
      TimeAfterWarmupToDisableBackfill: "5.000000",
      bUsePointLeaderAsTeamLeaderInLeaderboard: true,
      ModifierList: [
        "/Game/Athena/Playlists/DefaultModifiers/MaterialDropOnElim_Default.MaterialDropOnElim_Default",
        "/Game/Athena/Playlists/ContextTutorial/ContextTutorial_AthenaContextTutorial.ContextTutorial_AthenaContextTutorial",
        "/Game/Athena/AI/Phoebe/GameplayMod_Phoebe_DM_Solo.GameplayMod_Phoebe_DM_Solo",
        "/Game/Athena/Playlists/Deimos/GameplayMod_DeimosAI.GameplayMod_DeimosAI",
        "/Game/Athena/Playlists/RufusGameplayModifiers/Rufus_SafeZoneBlacklist_Modifier.Rufus_SafeZoneBlacklist_Modifier",
      ],
      bRewardForRevivingTeammates: false,
      MaxSquads: "-1",
      bIsTournament: false,
      RewardsPlacementThreshold: "3",
      MaxTeamSize: "1",
      Strategy: "",
      bForceLTMLoadingScreenBackground: false,
      FriendlyFireType: "Off",
      bUseSameDirectionForOpposingAircraft: false,
      bEnableDynamicBotBackfill: true,
      bRequeueAfterFailedSessionAssignment: true,
      MaxHumanAndBotParticipants: "100",
      bAllowWarmupPlayerStartInSetupPhase: true,
      LootTierData:
        "/Game/Athena/Playlists/AthenaCompositeLTD.AthenaCompositeLTD",
      RankScalingMinDelta: "-500.000000",
      ReplayChunkTimeSeconds: "0.000000",
      bShouldErrorOnAdditionalContentFailure: false,
      ForceKickAfterDeathTime: "0.000000",
      bAllowEditingEnemyWalls: false,
      JoinInProgressMatchType: {
        Category: "Game",
        NativeCulture: "",
        Namespace: "",
        LocalizedStrings: [],
        bIsMinimalPatch: false,
        NativeString: "",
        Key: "",
      },
      MaxBracketPriority: "0.000000",
      LootPackages:
        "/BRPlaylists/Athena/Playlists/AthenaCompositeLP.AthenaCompositeLP",
      AircraftPathMidpointSelectionRadiusMin: "20000.000000",
      MaxPlayers: "100",
      bAllowedInLeto: false,
      BotFillMMRCutoff: "-1",
      GameFeaturePluginURLsToLoad: [
        "installbundle:../../Plugins/GameFeatures/InstallBundles/GameplayAthena/GFIBGameplayAthenaRequired/GFIBGameplayAthenaRequired.uplugin?Bundles=FortniteBR",
        "file:../../Plugins/GameFeatures/BRRoot/BRRoot.uplugin",
      ],
      bDisable_ReportAPlayerReason_TeamingUpWithEnemies_WhileInGame: false,
      bUseMultidivisionQueues: false,
      TypeOfLeaderboard: "Score",
      WaitForServerInitializationTimeoutSecondsOverride: "-1.000000",
      MaxOutlierBracketMergeMmrGap: "0",
      KillerRankShare: "0.000000",
      MaxSquadSize: "1",
      bAllowSquadFillOption: true,
      KeepTogetherIdExpirationInSeconds: "1200",
      EndOfMatchXpMultiplier: "20",
      bForceNewPlayerStateOnReconnect: false,
      BracketDefinitions: [],
      bDisableAudioShapes: false,
      bIsDefaultPlaylist: true,
      MapScaleOverride: "0.000000",
      bAllowInGameMatchMaking: true,
      MaxTeamScoreAllowedForBackfill: "0",
      bOverrideMaxPlayers: true,
      WinConditionType: "MutatorControlledChinaSupported",
      PlaylistMissionGen:
        "/Game/World/MissionGens/Athena/MissionGen_Athena.MissionGen_Athena_C",
      EnforceSquadFill: true,
      bEnableBackfillDuringWarmupPhase: false,
      MaxOutlierBracketPriority: "0.000000",
      bEnablePlaylistXPLogging: false,
      bAllowBroadcasting: false,
      RewardTimePlayedXPFlatValue: "-1",
      PlayerRatingBrackets: [],
      RespawnType: "None",
      bAllowLayoutRequirementsFeature: false,
      InventorySystemConfiguration: "",
      RankKillFarmCutoff: "0",
      bAutoAcquireSpawnChip: false,
      bAllowKeepPlayingTogether: false,
      UIDisplayName: {
        Category: "Game",
        NativeCulture: "",
        Namespace: "",
        LocalizedStrings: [],
        bIsMinimalPatch: false,
        NativeString: "Solo",
        Key: "01D48B6841B636C086E7BBA829B0F432",
      },
      RankKillFarmFloor: "0.000000",
      GarbageCollectionFrequency: "0.000000",
      bUseKeepTogetherId: false,
      MaxPendingMatches: "-1",
      AircraftPathOffsetFromMapCenterMin: "0.000000",
      PlaylistStatId: "-1",
      NetActorDiscoveryBudgetInKBytesPerSec: "0",
      RankKillFarmMultiplier: "0.000000",
      bShowEliminationIndicatorForEnemies: false,
      GameplayTagContainer: {
        GameplayTags: [
          {
            TagName: "Athena.Playlist.DefaultXP",
          },
          {
            TagName: "Athena.Playlist.Default",
          },
          {
            TagName: "Athena.Playlist.Core",
          },
          {
            TagName: "Athena.Playlist.Solo",
          },
          {
            TagName: "Athena.Plugin.GameMod.Gasket",
          },
          {
            TagName: "Athena.Quests.NoBuild.Exclude",
          },
          {
            TagName: "Behavior.Playlist.UseTimeSlicedWorldReady",
          },
        ],
      },
      bLimitedPoolMatchmakingEnabled: true,
      MaxTeamScoreDiscrepancyPercent: "0.000000",
      PriorityRatingExpansion: [],
      bUseCreativeStarterIsland: false,
      bUnderfillMatchmaking: false,
      bRestrictSquadFillToSoloPlayers: false,
      NonRenderedCharacterAnimationScale: "1.000000",
      bEnforceFullSquadInUI: false,
      MinBracketPriority: "0.000000",
      bPreloadAthenaMapsForMatchmaking: true,
      primaryAssetId: "FortPlaylistAthena:Playlist_DefaultSolo",
      bRemoveFromSquadOnLogout: false,
      FortReleaseVersion: {
        VersionName: "Legacy",
      },
      DBNOType: "On",
      StormEffectDelay: "120.000000",
      ProximityVoiceChatAttenuationSettings: "",
      AircraftPathMidpointSelectionRadiusMax: "40000.000000",
      WarmupEarlyCountdownDuration: "0.000000",
      bAllowTeamSwitching: false,
      PlaylistId: "2",
      ServerMaxTickRate: "UseDefault",
      bForceEncryptionKeychainRefresh: false,
      WarmupCountdownDuration: "0.000000",
      DestructedBuildingInGridTimeout: "0.000000",
      MaxSocialPartySize: "1",
      RankLossFloorMod: "0.000000",
      bAllowSinglePartyMatches: false,
      PlacementLossMin: "0.000000",
      RewardPlacementBonusType: "Solo",
      DefaultFirstTeam: "3",
      bAllowSquadSizeTracking: true,
      DefaultLastTeam: "102",
      bIsLargeTeamGame: false,
      bDrawLineToStormCircleIfOutside: true,
      bDisplayScoreInHUD: false,
      MaxTeamCount: "100",
      BuiltInGameFeaturePluginsToLoad: [],
      bActivateCurie: true,
      bUseDefaultSupplyDrops: true,
      bIgnoreDefaultQuests: false,
      bEnableBuildingCreatedEvent: false,
    },
  });
});

app.post("/api/v1/assets/Fortnite/*/*", async (c) => {
  const body = (await c.req.json()) as object | any;

  if (
    body.hasOwnProperty("FortCreativeDiscoverySurface") &&
    body.FortCreativeDiscoverySurface == 0
  ) {
    logger.info("Returning discovery.json");
    const discovery = await Bun.file("src/json/discovery.json").json();

    return c.json(discovery);
  } else {
    return c.json({
      FortCreativeDiscoverySurface: {
        meta: {
          promotion: body.FortCreativeDiscoverySurface || 0,
        },
        assets: {},
      },
    });
  }
});

// /api/v1/search/51df9d437b7d4658b813843ab3f6563d?prefix=t1dv&platform=epic 400 2ms
app.get("/api/v1/search/:accountId", async (c) => {
  const accountId = c.req.param("accountId");
  const user = await getUserByAccountId(accountId);
  if (!user) return c.sendError(FortMP.basic.badRequest);

  const { prefix, platform } = c.req.query();

  if (!prefix || !platform) {
    return c.sendError(FortMP.basic.badRequest);
  }

  const foundUser = await getUserByUsername(prefix);

  if (!foundUser) {
    return c.sendError(FortMP.basic.notFound);
  }

  return c.json([
    {
      accountId: foundUser.accountId,
      matches: [
        {
          value: foundUser.username,
          platform: "epic",
        },
      ],
      matchType: "exact",
      epicMutuals: 0,
      sortPosition: 0,
    },
  ]);
});

app.get("/launcher/api/public/assets/*", (c) => {
  const appName = c.req.param("appName");
  const catalogItemId = c.req.param("catalogItemId");
  const platform = c.req.param("platform");
  const label = c.req.query("label");
  return c.json({
    appName: appName,
    labelName: `${label}-${platform}`,
    buildVersion: `FortMP`,
    catalogItemId: catalogItemId,
    expires: "9988-09-23T23:59:59.999Z",
    items: {
      MANIFEST: {
        signature: "FortMP",
        distribution: "http://localhost:5535/",
        path: `Builds/Fortnite/Content/CloudDir/FortMP.manifest`,
        additionalDistributions: [],
      },
    },
    assetId: appName,
  });
});

app.post("/datarouter/api/v1/public/data/clients", async (c) => {
  return c.json([]);
});

app.post("/telemetry/data/datarouter/api/v1/public/data", async (c) => {
  return c.json([]);
});

app.get("/Builds/Fortnite/Content/CloudDir/*", async (c: any) => {
  c.header("Content-Type", "application/octet-stream");
  const manifest: any = await fs.promises.readFile(
    path.join(__dirname, "..", "..", "public", "assets", "FortMP.manifest"),
  );
  return c.body(manifest);
});

app.get("/Builds/Fortnite/Content/CloudDir/*.ini", async (c: any) => {
  const ini: any = fs.readFileSync(
    path.join(__dirname, "..", "..", "public", "assets", "ManifestIni.ini"),
  );
  return c.body(ini);
});

app.get("/Builds/Fortnite/Content/CloudDir/ChunksV4/:chunknum/*", async (c) => {
  const response = await axios.get(
    `https://epicgames-download1.akamaized.net${c.req.path}`,
    {
      responseType: "stream",
    },
  );
  c.header("Content-Type", "application/octet-stream");

  return c.body(response.data);
});

// REMOVE THESE IN PROD

app.get("/givefl/:accountId", async (c) => {
  const auth = c.req.header("Authorization");

  if (auth != "572c17bf-b2c0-4680-b8dd-712379352453")
    return c.json({ text: "Bad Auth" });

  const accountId = c.req.param("accountId");

  await giveFullLocker(accountId);

  return c.json({ text: "Success" });
});

app.post("/givehype/:accountId/:ammount", async (c) => {
  const accountId = c.req.param("accountId");
  const user = await getUserByAccountId(accountId);
  if (!user) return c.sendError(FortMP.basic.badRequest);

  const ammount = parseInt(c.req.param("ammount"), 10);
  if (isNaN(ammount)) {
    return c.sendError(FortMP.basic.badRequest);
  }
  if (ammount < 0) {
    return c.sendError(FortMP.basic.badRequest);
  }
  if (ammount > 1000000) {
    return c.sendError(FortMP.basic.badRequest);
  }
  user.stats.hype = (user.stats.hype ?? 0) + ammount;
  await db
    .update(users)
    .set({ stats: user.stats })
    .where(eq(users.accountId, accountId));

  return c.json({ text: "Success" });
});

app
  .post("/fortmp/api/matchmaking/server", async (c) => {
    const body = await c.req.json();

    await db.insert(servers).values({
      ip: body.ip,
      port: body.port,
      playlist: body.playlist,
      region: body.region,
      sessionId: new Bun.CryptoHasher("md5")
        .update(`1${Date.now()}`)
        .digest("hex"),
    });

    return c.sendStatus(200);
  })
  .delete(async (c) => {
    const body = await c.req.json();

    const [server] = await db
      .select()
      .from(servers)
      .where(and(eq(servers.ip, body.ip), eq(servers.port, body.port)));

    if (!server) return c.json({ msg: "Could not find server" }, 400);

    await db
      .delete(servers)
      .where(and(eq(servers.ip, body.ip), eq(servers.port, body.port)));

    return c.sendStatus(200);
  });
