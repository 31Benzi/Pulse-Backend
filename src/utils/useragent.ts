import type { VersionInfo } from "../types/useragent.t";

export async function parseUserAgent(userAgent: string) {
  const toReturn: VersionInfo = {
    season: 0,
    build: "0.0",
    cl: "0",
    lobby: "LobbySeason0",
  };

  const officialRegex = new RegExp(
    /(.*)\/(.*)-CL-(\d+)(\s+\((.*?)\))?\s+(\w+)\/(\S*)(\s*\((.*?)\))?/
  );

  const match = userAgent.match(officialRegex);

  if (match) {
    const build = match[7];
    toReturn.season = Number(build.split(".")[0]);
    toReturn.build = Number.parseFloat(build).toFixed(2);
    toReturn.lobby = `LobbySeason${toReturn.season}`;
  }

  const buildIDMatch = userAgent.match(/-(\d+)[, ]/);
  const buildMatch = userAgent.match(/Release-(\d+\.\d+)/);

  if (buildIDMatch) {
    toReturn.cl = buildIDMatch[1];
  }

  if (buildMatch) {
    const build = buildMatch[1];
    toReturn.season = Number(build.split(".")[0]);
    toReturn.build = Number.parseFloat(build).toFixed(2);
    toReturn.lobby = `LobbySeason${toReturn.season}`;
  }

  if (Number.isNaN(toReturn.season)) {
    toReturn.season = getSeasonFromCL(toReturn.cl);
    toReturn.build = `${toReturn.season}`;
    toReturn.lobby = `LobbySeason${toReturn.season}`;
  }

  return toReturn;
}

function getSeasonFromCL(cl: string): number {
  const clNumber = Number(cl);
  if (Number.isNaN(clNumber) || clNumber < 3724489) {
    return 0;
  }
  if (clNumber <= 3790078) {
    return 1;
  }
  return 2;
}
