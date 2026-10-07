const path = require('node:path');
require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error('Missing required environment variable: ' + name);
  }
  return value;
}

module.exports = {
  token: required('DISCORD_TOKEN'),
  clientId: required('DISCORD_CLIENT_ID'),
  deployGuildId: process.env.DEPLOY_GUILD_ID || null,
  databaseFile: path.resolve(process.env.DATABASE_FILE || './data/cloudy.json'),
  defaultPrefix: '?',
  cloudyAccent: 0x9ec5ff
};
