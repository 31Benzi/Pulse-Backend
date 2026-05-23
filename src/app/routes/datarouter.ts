import app from "..";

app.post("/datarouter/api/v1/public/data", async (c) => {
  return c.body(null, 204);
});
