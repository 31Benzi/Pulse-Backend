import type { FC } from "hono/jsx";

import { UserCard } from "./components/user-card";
import { StarryBackground } from "./components/starry-background";
import "./styles.css";

import type { DiscordUser } from "@hono/oauth-providers/discord";

export const RedirectPage: FC<{ user: DiscordUser; token: string }> = (props: {
  user: DiscordUser;
  token: string;
}) => {
  return (
    <div className="container">
      <StarryBackground />

      <div className="content">
        <div className="header">
          <h1 className="title">
            <img
              src="https://cdn.fortmp.dev/fortmp.png"
              alt="FortMP Logo"
              className="logo"
            />
            Pulse
          </h1>
        </div>

        <UserCard user={props.user} token={props.token} />
      </div>
    </div>
  );
};
