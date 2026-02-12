import {
  ActivityType,
  Client,
  Collection,
  MessageFlags,
  REST,
  Routes,
} from "discord.js";
import logger from "../utils/logger";
import path from "path";
import fs from "fs";

declare module "discord.js" {
  export interface Client {
    commands: Collection<string, any>;
  }
}

const client = new Client({
  intents: ["Guilds", "GuildMessages", "MessageContent", "GuildMembers"],
});

client.commands = new Collection();

const commands = [];
// Grab all entries (files and folders) from the commands directory
const foldersPath = path.join(import.meta.dir, "commands");
const entries = fs.readdirSync(foldersPath);

for (const entry of entries) {
  const entryPath = path.join(foldersPath, entry);
  const stats = fs.statSync(entryPath);

  if (stats.isDirectory()) {
    // Process subdirectories
    const commandFiles = fs
      .readdirSync(entryPath)
      .filter((file) => file.endsWith(".ts"));

    for (const file of commandFiles) {
      const filePath = path.join(entryPath, file);
      const command = await import(filePath); // Use Bun's dynamic import
      console.log(`Loaded command from ${filePath}:`, command); // Debug log
      if ("data" in command && "execute" in command) {
        commands.push(command.data.toJSON());
        client.commands.set(command.data.name, command); // Add to client.commands
      } else {
        console.log(
          `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`,
        );
      }
    }
  } else if (stats.isFile() && entry.endsWith(".ts")) {
    // Process files directly in the commands folder
    const command = await import(entryPath); // Use Bun's dynamic import
    console.log(`Loaded command from ${entryPath}:`, command); // Debug log
    if ("data" in command && "execute" in command) {
      commands.push(command.data.toJSON());
      client.commands.set(command.data.name, command); // Add to client.commands
    } else {
      console.log(
        `[WARNING] The command at ${entryPath} is missing a required "data" or "execute" property.`,
      );
    }
  }
}

console.log("Commands to register:", commands); // Debug log

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN!);

// and deploy your commands!
(async () => {
  try {
    console.log(
      `Started refreshing ${commands.length} application (/) commands.`,
    );

    // The put method is used to fully refresh all commands in the guild with the current set
    const data: any = await rest.put(
      Routes.applicationGuildCommands(
        process.env.DISCORD_BOT_CLIENT_ID as string,
        process.env.DISCORD_GUILD_ID as string,
      ),
      { body: commands },
    );

    console.log(
      `Successfully reloaded ${data.length} application (/) commands.`,
    );
  } catch (error) {
    // And of course, make sure you catch and log any errors!
    console.error(error);
  }
})();

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  // Ensure the command is not executed in DMs
  if (!interaction.guildId) {
    await interaction.reply({
      content: "This command cannot be used in DMs.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const command = interaction.client.commands.get(interaction.commandName);

  if (!command) {
    logger.error(`No command matching ${interaction.commandName} was found`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing this command!",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: "There was an error while executing this command!",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

client.on("ready", async () => {
  logger.info(`[BOT] Logged in as ${client.user?.tag}`);

  client.user?.setActivity("Pulse", { type: ActivityType.Playing });

  await client.guilds.fetch();

  const fortmp = await client.guilds.cache.get(
    process.env.DISCORD_GUILD_ID as string,
  );

  await fortmp?.members.fetch();
});

client.login(process.env.DISCORD_BOT_TOKEN);

export default client;
