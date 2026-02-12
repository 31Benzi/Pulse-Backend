import app from "..";

import { discordAuth, type DiscordUser } from "@hono/oauth-providers/discord";
import path from "path";
import fs from "fs";

import { RedirectPage } from "../../public/redirect-page";
import { jsxRenderer } from "hono/jsx-renderer";
import { css, Style } from "hono/css";
import {
  createUser,
  getUserByDiscordId,
  getUserByUsername,
} from "../../database/accountManager";
import logger from "../../utils/logger";
import { AES256Encryption } from "../../utils/hashing";

app.use("/fortmp/api/discord/oauth",
  discordAuth({
    client_id: "1459556302622560328",
    client_secret: "UEIdbUXxcVrb2WqirN2375fRtSxlL8Rm",
    scope: ["identify", "email", "guilds"],
    redirect_uri: process.env.DISCORD_REDIRECT_URI!,
  })
);
console.log(process.env.DISCORD_REDIRECT_URI);

app.get("/fortmp/api/discord/oauth", async (c) => {
  const discordUser = c.get("user-discord");

  if (!discordUser) return c.json({ error: "User not found" }, 404);

  let user = await getUserByDiscordId(discordUser.id!);

  if (user == null) {
    const newUser = await createUser(
      discordUser.username!,
      `${discordUser.username!}@fortmp.dev`,
      "abc123",
      discordUser.id
    );

    if (!newUser) return c.json({ error: "User creation failed" }, 500);

    user = newUser;
  }

  const newToken = AES256Encryption.encrypt(
    JSON.stringify(user),
    "80HH7O7WPOVNBDAYB3RFMACWHH22S6GA"
  );

  console.log(newToken);

  const stylesString = await Bun.file("src/public/styles.css").text();

  return c.render(
    <html>
      <head>
        <Style>{css`
          ${stylesString}
        `}</Style>
      </head>
      <body>
        <RedirectPage user={discordUser as DiscordUser} token={newToken} />
      </body>
    </html>
  );
});

app.get("/fortmp/api/discord/test", async (c) => {});
