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
  dashboardApiPort: Number(process.env.DASHBOARD_API_PORT || process.env.PORT || 3000),
  dashboardApiHost: process.env.DASHBOARD_API_HOST || '0.0.0.0',
  dashboardOrigin: process.env.DASHBOARD_ORIGIN || null,
  dashboardApiKey: process.env.DASHBOARD_API_KEY || null,
  defaultPrefix: '?',
  cloudyAccent: 0x9ec5ff
};
