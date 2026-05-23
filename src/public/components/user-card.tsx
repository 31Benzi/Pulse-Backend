import type { FC } from "hono/jsx";
import "./../styles.css";

import type { DiscordUser } from "@hono/oauth-providers/discord";
import { createUser } from "../../database/accountManager";

export const UserCard: FC<{ user: DiscordUser; token: string }> = (props: {
  user: DiscordUser;
  token: string;
}) => {
  const { user } = props;
  // Format the avatar URL or use placeholder
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=256`
    : `/placeholder.svg?height=256&width=256&query=User Avatar`;

  // Get first letter of username for avatar fallback
  const firstLetter = user.username.charAt(0).toUpperCase();

  return (
    <div className="card">
      <div className="card-banner"></div>

      <div className="card-header">
        <div className="avatar-container">
          {avatarUrl ? (
            <img
              src={avatarUrl || "/placeholder.svg"}
              alt={user.username}
              className="avatar"
            />
          ) : (
            <div className="avatar">{firstLetter}</div>
          )}
        </div>
        <div className="user-info">
          <div>
            <h2 className="user-name">{user.global_name || user.username}</h2>
            <p className="user-handle">@{user.username}</p>
          </div>
        </div>
      </div>

      <div className="card-content">
        <div>
          <h3 className="field-label">User ID</h3>
          <p className="field-value">{user.id}</p>
        </div>

        <div>
          <a href={`pulse://${props.token}`}>
            {" "}
            <button className="login-button">
              Login as {user.global_name || user.username}
            </button>
          </a>

          <a href="/fortmp/api/discord/oauth" className="not-you">
            Not you?
          </a>
        </div>
      </div>
    </div>
  );
};
