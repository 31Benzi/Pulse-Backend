import fs from "fs/promises";
import path from "path";

export async function getAllPlaylists() {
  const response = await fetch("https://fortnite-api.com/v1/playlists");
  const json = await response.json();
  const playlists = json.data;

  const formatted = {
    playlistinformation: {
      frontend_matchmaking_header_style: "None",
      _title: "playlistinformation",
      frontend_matchmaking_header_text: "",
      playlist_info: {
        _type: "Playlist Information",
        playlists: playlists
          .filter((playlist: any) => playlist.images?.showcase) 
          .map((playlist: any) => ({
            image: playlist.images.showcase,
            playlist_name: playlist.id,
            violator: "",
            _type: "FortPlaylistInfo",
            description: playlist.description || "No description available."
          }))
      }
    }
  };

  const contentPagesPath = path.join(import.meta.dir, "../json/templates/contentpages.json");

  const contentPages = JSON.parse(await fs.readFile(contentPagesPath, "utf-8"));
  contentPages.playlistinformation = formatted.playlistinformation;

  await fs.writeFile(contentPagesPath, JSON.stringify(contentPages, null, 2));
  
  console.log("✅ Updated contentpages.json with playlistinformation.");
}
