const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const DEFAULT_SECURITY = {
  antiSpam: true,
  antiRaid: true,
  antiLink: true,
  spamLimit: 6,
  spamWindowMs: 8000,
  raidJoins: 6,
  raidWindowMs: 10000
};

const EMPTY_GUILD = () => ({
  prefix: config.defaultPrefix,
  welcome: {
    channelId: null,
    message: 'Welcome {user} to {server}. You are member #{count}.'
  },
  logsChannelId: null,
  ticket: {
    panelChannelId: null,
    panelMessageId: null,
    categoryId: null,
    supportRoleId: null
  },
  security: { ...DEFAULT_SECURITY },
  automod: {
    enabled: false,
    ruleIds: []
  },
  warnings: {},
  history: [],
  stats: {},
  tickets: {}
});

class JsonStore {
  constructor(file) {
    this.file = file;
    this.data = {
      version: 1,
      guilds: {},
      tempPunishments: []
    };
    this.load();
  }

  load() {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.file)) {
      this.flush();
      return;
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = {
        version: 1,
        guilds: parsed.guilds || {},
        tempPunishments: parsed.tempPunishments || []
      };
    } catch (error) {
      throw new Error('Could not parse database file: ' + error.message);
    }
  }

  flush() {
    const dir = path.dirname(this.file);
    fs.mkdirSync(dir, { recursive: true });
    const temp = this.file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(temp, this.file);
  }

  guild(guildId) {
    if (!this.data.guilds[guildId]) {
      this.data.guilds[guildId] = EMPTY_GUILD();
      this.flush();
    }
    return this.data.guilds[guildId];
  }

  updateGuild(guildId, updater) {
    const current = this.guild(guildId);
    updater(current);
    this.flush();
    return current;
  }

  addWarning(guildId, userId, moderatorId, reason) {
    const guild = this.guild(guildId);
    if (!guild.warnings[userId]) guild.warnings[userId] = [];
    const warning = {
      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
      userId,
      moderatorId,
      reason,
      createdAt: Date.now(),
      active: true
    };
    guild.warnings[userId].push(warning);
    this.addHistory(guildId, {
      type: 'warn',
      targetId: userId,
      moderatorId,
      reason,
      metadata: { warningId: warning.id }
    });
    this.flush();
    return warning;
  }

  removeWarning(guildId, userId, warningId) {
    const guild = this.guild(guildId);
    const warnings = guild.warnings[userId] || [];
    const warning = warnings.find((item) => item.id === warningId && item.active);
    if (!warning) return null;
    warning.active = false;
    this.flush();
    return warning;
  }

  addHistory(guildId, entry) {
    const guild = this.guild(guildId);
    const record = {
      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
      timestamp: Date.now(),
      ...entry
    };
    guild.history.push(record);
    if (guild.history.length > 1000) guild.history.splice(0, guild.history.length - 1000);

    const key = entry.moderatorId || 'system';
    if (!guild.stats[key]) guild.stats[key] = {};
    const action = entry.type || 'other';
    guild.stats[key][action] = (guild.stats[key][action] || 0) + 1;
    this.flush();
    return record;
  }

  addTempPunishment(record) {
    this.data.tempPunishments.push(record);
    this.flush();
  }

  removeTempPunishment(id) {
    this.data.tempPunishments = this.data.tempPunishments.filter((item) => item.id !== id);
    this.flush();
  }

  pendingTempPunishments() {
    return [...this.data.tempPunishments];
  }
}

module.exports = new JsonStore(config.databaseFile);
