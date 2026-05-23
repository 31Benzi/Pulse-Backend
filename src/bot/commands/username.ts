import {
  ChatInputCommandInteraction,
  CommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import {
  getUserByDiscordId,
  getUserByUsername,
} from "../../database/accountManager";
import { db } from "../../app";
import { eq } from "drizzle-orm";
import { users } from "../../database/schema";
import { Filter } from "bad-words";
const filter = new Filter();

export const data = new SlashCommandBuilder()
  .setName("username")
  .setDescription("Sets your username [Donators Only]")
  .addStringOption((option) =>
    option
      .setName("newname")
      .setDescription("your new username")
      .setRequired(true)
      .setMaxLength(21)
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const newUsername = interaction.options.getString("newname") ?? "FortMPUser";

  if (filter.isProfane(newUsername)) {
    await interaction.reply({
      content:
        "That username contains disallowed words. Please choose a different one.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const allowedRoles = [
    "1370465279657906176",
    "1280942403460792330",
    "1287512230585303152",
    "1261918532375941181",
  ];

  const member = interaction.guild?.members.cache.get(interaction.user.id);
  if (
    !member ||
    !member.roles.cache.some((role) => allowedRoles.includes(role.id))
  ) {
    await interaction.reply({
      content: "You do not have permission to use this command.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const existingUser = await getUserByUsername(newUsername);

  console.log("getUserByUsername result:", existingUser);

  if (existingUser !== null && existingUser !== undefined) {
    await interaction.reply({
      content: "Username taken.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const user = await getUserByDiscordId(member.id);

  if (user === null) {
    await interaction.reply({
      content: "Could not find your user, are you registered?",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await db
    .update(users)
    .set({ username: newUsername })
    .where(eq(users.discordId, member.id));

  return interaction.reply({
    content: `Successfully changed your username to **${newUsername}**`,
  });
}
