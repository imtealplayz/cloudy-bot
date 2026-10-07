const { REST, Routes } = require('discord.js');
const config = require('./src/config');
const commands = require('./src/commands');

const rest = new REST({ version: '10' }).setToken(config.token);
const payload = commands.map((command) => command.toJSON());

(async () => {
  try {
    if (config.deployGuildId) {
      await rest.put(
        Routes.applicationGuildCommands(config.clientId, config.deployGuildId),
        { body: payload }
      );
      console.log('Cloudy commands deployed to guild ' + config.deployGuildId + '.');
    } else {
      await rest.put(
        Routes.applicationCommands(config.clientId),
        { body: payload }
      );
      console.log('Cloudy global commands deployed.');
    }
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
})();
