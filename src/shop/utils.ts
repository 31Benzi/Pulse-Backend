import { promises as fs } from "fs";
import path from "path";
import fetch from "node-fetch";
import stringSimilarity from "string-similarity";


// none of these are perfect so thats why i have them in json so i can adjust after
export async function generateDisplayAssets() {
    const cosmeticsPath = path.join(__dirname, "../json/cosmetics.json");
    const displayAssetsPath = path.join(__dirname, "../json/displayassets.json");
  
    const raw = await fs.readFile(cosmeticsPath, "utf-8");
    const cosmetics: string[] = JSON.parse(raw);
  
    const displayAssetMap: Record<string, string> = {};
  
    for (const entry of cosmetics) {
      const id = entry.split(":")[1];
      let displayAssetId = "";
  
      switch (id) {
        case "CID_029_Athena_Commando_F_Halloween":
          displayAssetId = "SFemaleHalloween"; break;
        case "CID_030_Athena_Commando_M_Halloween":
          displayAssetId = "SMaleHalloween"; break;
        case "CID_051_Athena_Commando_M_HolidayElf":
          displayAssetId = "SMaleHID051"; break;
        case "CID_043_Athena_Commando_F_Stealth":
          displayAssetId = "SFemaleHID043"; break;
        case "CID_024_Athena_Commando_F":
          displayAssetId = "SFemaleHID024"; break;
        case "CID_027_Athena_Commando_F":
          displayAssetId = "SFemaleHID027"; break;
        case "CID_028_Athena_Commando_F":
          displayAssetId = "SFemaleHID028"; break;
        case "CID_033_Athena_Commando_F_Medieval":
          displayAssetId = "SFemaleHID033"; break;
        case "CID_034_Athena_Commando_F_Medieval":
          displayAssetId = "SFemaleHID034"; break;
        case "CID_037_Athena_Commando_F_WinterCamo":
          displayAssetId = "SFemaleHID037"; break;
        case "CID_039_Athena_Commando_F_Disco":
          displayAssetId = "SFemaleHID039"; break;
        case "CID_041_Athena_Commando_F_District":
          displayAssetId = "SFemaleHID041"; break;
        case "CID_044_Athena_Commando_F_SciPop":
          displayAssetId = "SFemaleHID044"; break;
        case "CID_046_Athena_Commando_F_HolidaySweater":
          displayAssetId = "SFemaleHID046"; break;
        case "CID_047_Athena_Commando_F_HolidayReindeer":
          displayAssetId = "SFemaleHID047"; break;
        case "CID_048_Athena_Commando_F_HolidayGingerbread":
          displayAssetId = "SFemaleHID048"; break;
        case "CID_017_Athena_Commando_M":
          displayAssetId = "SMaleHID017"; break;
        case "CID_019_Athena_Commando_M":
          displayAssetId = "SMaleHID019"; break;
        case "CID_020_Athena_Commando_M":
          displayAssetId = "SMaleHID020"; break;
        case "CID_031_Athena_Commando_M_Retro":
          displayAssetId = "SMaleHID031"; break;
        case "CID_032_Athena_Commando_M_Medieval":
          displayAssetId = "SMaleHID032"; break;
        case "CID_035_Athena_Commando_M_Medieval":
          displayAssetId = "SMaleHID035"; break;
        case "CID_036_Athena_Commando_M_WinterCamo":
          displayAssetId = "SMaleHID036"; break;
        case "CID_038_Athena_Commando_M_Disco":
          displayAssetId = "SMaleHID038"; break;
        case "CID_040_Athena_Commando_M_District":
          displayAssetId = "SMaleHID040"; break;
        case "CID_042_Athena_Commando_M_Cyberpunk":
          displayAssetId = "SMaleHID042"; break;
        case "CID_045_Athena_Commando_M_HolidaySweater":
          displayAssetId = "SMaleHID045"; break;
        case "CID_049_Athena_Commando_M_HolidayGingerbread":
          displayAssetId = "SMaleHID049"; break;
        default:
          displayAssetId = id;
          break;
      }
  
      displayAssetMap[id] = `/Game/Catalog/DisplayAssets/DA_Featured_${displayAssetId}.DA_Featured_${displayAssetId}`;
    }
  
    await fs.writeFile(displayAssetsPath, JSON.stringify(displayAssetMap, null, 2));
    console.log(`Wrote ${Object.keys(displayAssetMap).length} display assets to displayassets.json`);
}

export async function generateBackPacks() {
    const cosmeticsPath = path.join(__dirname, "../json/cosmetics.json");
    const backpacksPath = path.join(__dirname, "../json/backpacks.json");
  
    const raw = await fs.readFile(cosmeticsPath, "utf-8");
    const cosmetics: string[] = JSON.parse(raw);
  
    const athenaCharacters = cosmetics
      .filter((entry) => entry.startsWith("AthenaCharacter:"))
      .map((entry) => entry.split(":")[1]);
  
    const releasedCosmeticIds = new Set(
      cosmetics.map((entry) => entry.split(":")[1])
    );
  
    const allCosmeticsRes = await fetch("https://fortnite-api.com/v2/cosmetics/br");
    const allCosmeticsData = await allCosmeticsRes.json() as { data: any[] };
    const allCosmetics = allCosmeticsData.data || [];
  
    const backpackMap: Record<string, string> = {};
  
    for (const characterId of athenaCharacters) {
      const character = allCosmetics.find((item) => item.id === characterId);
      if (!character) {
        backpackMap[characterId] = "";
        continue;
      }
  
      const setBackend = character.set?.backendValue;
      if (!setBackend) {
        backpackMap[characterId] = "";
        continue;
      }
  
      const matchingCosmetics = allCosmetics.filter(
        (item) => item.set?.backendValue === setBackend
      );
  
      const validBackpacks = matchingCosmetics.filter(
        (item) =>
          (item.type?.backendValue === "AthenaBackpack" ||
           item.type?.displayValue === "Back Bling") &&
          releasedCosmeticIds.has(item.id)
      );
  
      const characterName = character.name?.toLowerCase() || "";
      const characterGender = characterId.includes("_F_") ? "F" : "M";
  
      let bestMatch: { id: string; score: number } | null = null;
  
      for (const bp of validBackpacks) {
        const bpName = bp.name?.toLowerCase() || "";
        const bpId = bp.id?.toLowerCase() || "";
  
        const isGenderCompatible =
          (characterGender === "F" && (bpName.includes("female") || bpId.includes("_f_") || bpId.includes("female") || bpName.includes("girl"))) ||
          (characterGender === "M" && (bpName.includes("male") || bpId.includes("_m_") || bpId.includes("male") || bpName.includes("guy")));
  
        if (!isGenderCompatible) continue;
  
        const similarity = stringSimilarity.compareTwoStrings(characterName, bpName);
        if (!bestMatch || similarity > bestMatch.score) {
          bestMatch = { id: bp.id, score: similarity };
        }
      }
  
      if (bestMatch && bestMatch.score > 0.2) {
        backpackMap[characterId] = bestMatch.id;
        console.log(`${characterId} → ${bestMatch.id} (${bestMatch.score.toFixed(2)})`);
      } else {
        backpackMap[characterId] = "";
        console.log(`${characterId} → No match (added as blank)`);
      }
    }
  
    await fs.writeFile(backpacksPath, JSON.stringify(backpackMap, null, 2));
    console.log("Finished: saved all entries to backpacks.json");
  }

  generateBackPacks().catch(console.error);
