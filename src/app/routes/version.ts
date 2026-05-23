import app from "..";

app.get("/fortnite/api/v2/versioncheck/:platform", (c) => {
  return c.json({ type: "NO_UPDATE" });
});
