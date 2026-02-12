import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { giveFullLocker } from "../../database/profileManager";
import { getUserByDiscordId } from "../../database/accountManager";
import { db } from "../../app";
import { affiliates } from "../../database/schema";

export const data = new SlashCommandBuilder()
  .setName("claim")
  .setDescription("Claims your donation benefits!");

export async function execute(interaction: ChatInputCommandInteraction) {
  const allowedRoles = [
    "", // put your role ids here
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

  const user = await getUserByDiscordId(interaction.user.id);

  if (!user) {
    await interaction.reply({
      content:
        "You are not registered! Please make an account through the launcher.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Defer the reply immediately after initial checks
  await interaction.deferReply({ ephemeral: true });

  if (
    member.roles.cache.has("1280942403460792330") ||
    member.roles.cache.has("1370465279657906176")
  ) {
    await giveFullLocker(user.accountId);

    if (member.roles.cache.has("1370465279657906176")) {
      await db.insert(affiliates).values({
        code: user.username,
        ownerAccountId: user.accountId,
      });
    }
  }

  // Use followUp to send the final message
  await interaction.followUp({
    content: "Your benefits have been claimed! Thanks for donating!",
    flags: MessageFlags.Ephemeral, // This will ensure the follow-up is also ephemeral
  });
  return;
}
