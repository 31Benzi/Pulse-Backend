import axios from "axios";
import fs from "fs";
import path from "path";

export async function getAllCosmetics() {
  const maxChapter = Number(process.env.CHAPTER);
  const maxSeason = Number(process.env.SEASON);

  const { data } = await axios.get("https://fortnite-api.com/v2/cosmetics/br");
  const cosmetics = data.data;

  const releasedCosmeticIds: string[] = [];

  for (const cosmetic of cosmetics) {
    const intro = cosmetic.introduction;
    if (!intro || !intro.chapter || !intro.season) continue;

    const cosmeticChapter = parseInt(intro.chapter);
    const cosmeticSeason = parseInt(intro.season);

    const isReleased =
      cosmeticChapter < maxChapter ||
      (cosmeticChapter === maxChapter && cosmeticSeason <= maxSeason);

    if (isReleased) {
      releasedCosmeticIds.push(`${cosmetic.type.backendValue}:${cosmetic.id}`);
    }
  }

  const outputPath = path.join(__dirname, "../json/cosmetics.json");
  fs.writeFileSync(outputPath, JSON.stringify(releasedCosmeticIds, null, 2));

  console.log(
    `✅ Found ${releasedCosmeticIds.length} cosmetics up to Chapter ${maxChapter} Season ${maxSeason}`
  );
}

export async function generateFullProfile() {
  const cosmeticsPath = path.join(__dirname, "../json/cosmetics.json");
  const cosmetics: string[] = JSON.parse(
    fs.readFileSync(cosmeticsPath, "utf-8")
  );

  const now = new Date().toISOString();

  const baseProfile = {
    _id: "",
    createdAt: now,
    updatedAt: now,
    rvn: 0,
    wipeNumber: 1,
    accountId: "",
    profileId: "athena",
    version: "no_version",
    stats: {
      attributes: {
        use_random_loadout: false,
        past_seasons: [],
        season_match_boost: 0,
        loadouts: ["fortmp-loadout"],
        mfa_reward_claimed: true,
        rested_xp_overflow: 0,
        current_mtx_platform: "Epic",
        last_xp_interaction: now,
        quest_manager: {
          dailyLoginInterval: "0001-01-01T00:00:00.000Z",
          dailyQuestRerolls: 1,
        },
        book_level: 1,
        season_num: 1,
        book_xp: 0,
        creative_dynamic_xp: {},
        season: {
          numWins: 0,
          numHighBracket: 0,
          numLowBracket: 0,
        },
        party_assist_quest: "",
        pinned_quest: "",
        vote_data: {
          electionId: "",
          voteHistory: {},
          votesRemaining: 0,
          lastVoteGranted: "",
        },
        lifetime_wins: 0,
        book_purchased: false,
        rested_xp_exchange: 1,
        level: 1,
        rested_xp: 2500,
        rested_xp_mult: 4.4,
        accountLevel: 1,
        rested_xp_cumulative: 52500,
        xp: 0,
        battlestars: 0,
        battlestars_season_total: 0,
        season_friend_match_boost: 0,
        active_loadout_index: 0,
        purchased_bp_offers: [],
        purchased_battle_pass_tier_offers: [],
        last_match_end_datetime: "",
        mtx_purchase_history_copy: [],
        last_applied_loadout: "fortmp-loadout",
        banner_icon: "BRSeason01",
        banner_color: "DefaultColor1",
        favorite_musicpack: "",
        favorite_character: "AthenaCharacter:CID_003_Athena_Commando_F_Default",
        favorite_itemwraps: ["", "", "", "", "", "", ""],
        favorite_skydivecontrail: "",
        favorite_pickaxe: "",
        favorite_glider: "",
        favorite_backpack: "",
        favorite_dance: ["", "", "", "", "", "", ""],
        favorite_loadingscreen: "",
      },
    },
    items: {
      "fortmp-loadout": {
        templateId: "CosmeticLocker:cosmeticlocker_athena",
        attributes: {
          locker_slots_data: {
            slots: {
              Pickaxe: { items: [""], activeVariants: [] },
              Dance: { items: ["", "", "", "", "", ""], activeVariants: [] },
              Glider: { items: [""] },
              Character: { items: [""], activeVariants: [{ variants: [] }] },
              Backpack: { items: [""], activeVariants: [{ variants: [] }] },
              ItemWrap: {
                items: ["", "", "", "", "", "", ""],
                activeVariants: [null, null, null, null, null, null, null],
              },
              LoadingScreen: { items: [""], activeVariants: [null] },
              MusicPack: { items: [""], activeVariants: [null] },
              SkyDiveContrail: { items: [""], activeVariants: [null] },
            },
          },
          use_count: 0,
          banner_icon_template: "BRSeason01",
          banner_color_template: "DefaultColor1",
          locker_name: "fortmp",
          item_seen: false,
          favorite: false,
        },
        quantity: 1,
      },
    },
    commandRevision: 0,
  };

  const items = baseProfile.items as Record<string, any>;
  for (const id of cosmetics) {
    items[id] = {
      templateId: id,
      attributes: {
        favorite: false,
        item_seen: true,
        level: 1,
        max_level_bonus: 0,
        rnd_sel_cnt: 0,
        variants: [],
        xp: 0,
      },
      quantity: 1,
    };
  }

  const outputPath = path.join(__dirname, "../json/templates/fullathena.json");
  fs.writeFileSync(outputPath, JSON.stringify(baseProfile, null, 2));

  console.log(`✅ Generated full profile with ${cosmetics.length} items.`);
}
