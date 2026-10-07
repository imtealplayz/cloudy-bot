const {
  ActivityType,
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits
} = require('discord.js');

const config = require('./config');
const store = require('./store');
const commands = require('./commands');
const ui = require('./ui');
const {
  parseDuration,
  formatDuration,
  truncate,
  isModerator,
  hasPermission,
  canModerateTarget,
  containsLink,
  renderWelcome,
  safeReason
} = require('./utils');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ]
});

const spamTracker = new Map();
const spamCooldown = new Map();
const raidTracker = new Map();
const raidMode = new Map();
const games = new Map();

const truthPrompts = [
  'What is one thing you pretend not to care about but actually do?',
  'What is the strangest thing you have searched for recently?',
  'What is a skill you wish you had?',
  'What is the most embarrassing game you secretly enjoy?',
  'What is one decision you would redo if you could?',
  'What is the funniest misunderstanding you have ever had?'
];

const darePrompts = [
  'Send your next message using only three words.',
  'Describe your favorite game without naming it.',
  'Change your nickname to something harmless for five minutes.',
  'Write a dramatic two-line review of a random object near you.',
  'Let another player choose one harmless word you must use in your next message.',
  'Type a sentence where every word starts with the same letter.'
];

const rpsChoices = ['rock', 'paper', 'scissors'];

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function winsAgainst(a, b) {
  return (
    (a === 'rock' && b === 'scissors') ||
    (a === 'paper' && b === 'rock') ||
    (a === 'scissors' && b === 'paper')
  );
}

function checkWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return board.every(Boolean) ? 'draw' : null;
}

function botMove(board) {
  const empty = board
    .map((value, index) => value ? null : index)
    .filter((value) => value !== null);

  if (!empty.length) return null;

  for (const index of empty) {
    const next = [...board];
    next[index] = 'O';
    if (checkWinner(next) === 'O') return index;
  }

  const lines = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const line of lines) {
    const values = line.map((index) => board[index]);
    if (values.filter((value) => value === 'X').length === 2 && values.includes(null)) {
      return line[values.indexOf(null)];
    }
  }

  if (!board[4]) return 4;
  return pick(empty);
}

function formatStats(stats) {
  const entries = Object.entries(stats || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (!entries.length) return 'No moderation actions recorded yet.';
  return entries.map(([name, count]) => '- ' + ui.inline(name) + ': ' + ui.inline(count)).join('\n');
}

async function sendLog(guild, title, body) {
  const channelId = store.guild(guild.id).logsChannelId;
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) return;

  try {
    await channel.send(ui.card(title, body));
  } catch (error) {
    console.error('Cloudy log error:', error);
  }
}

function recordModeration(guild, type, target, moderator, reason, extra = {}) {
  store.addHistory(guild.id, {
    type,
    targetId: target.id,
    targetTag: target.user?.tag || target.tag || target.id,
    moderatorId: moderator.id,
    reason: safeReason(reason),
    durationMs: extra.durationMs || null,
    metadata: extra.metadata || {}
  });
}

async function moderateInteraction(interaction, targetUser, requiredPermission) {
  const moderator = interaction.member;
  const botMember = interaction.guild.members.me;

  if (!hasPermission(moderator, requiredPermission)) {
    await interaction.reply(
      ui.error('Cloudy Moderation', 'You need ' + ui.inline(requiredPermission.toString()) + ' to use this action.')
    );
    return null;
  }

  const target = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!target) {
    await interaction.reply(ui.error('Cloudy Moderation', 'That member is not in this server.'));
    return null;
  }

  const hierarchy = canModerateTarget(moderator, target, botMember);
  if (!hierarchy.ok) {
    await interaction.reply(ui.error('Cloudy Moderation', hierarchy.reason));
    return null;
  }

  return { moderator, target };
}

async function configureNativeAutoMod(guild, enabled) {
  const settings = store.guild(guild.id);

  await guild.autoModerationRules.fetch().catch(() => {});

  for (const ruleId of settings.automod.ruleIds || []) {
    const rule = guild.autoModerationRules.cache.get(ruleId);
    if (rule) await rule.delete('Cloudy AutoMod reset').catch(() => {});
  }

  for (const rule of guild.autoModerationRules.cache.values()) {
    if (rule.name.startsWith('Cloudy AutoMod ')) {
      await rule.delete('Cloudy AutoMod cleanup').catch(() => {});
    }
  }

  settings.automod.ruleIds = [];
  settings.automod.enabled = false;
  store.flush();

  if (!enabled) return [];

  const logsChannelId = settings.logsChannelId;
  const commonActions = [
    {
      type: AutoModerationActionType.BlockMessage,
      metadata: {
        customMessage: 'Cloudy AutoMod blocked this message.'
      }
    }
  ];

  if (logsChannelId) {
    commonActions.push({
      type: AutoModerationActionType.SendAlertMessage,
      metadata: {
        channel: logsChannelId
      }
    });
  }

  const created = [];

  created.push(
    await guild.autoModerationRules.create({
      name: 'Cloudy AutoMod Spam',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Spam,
      triggerMetadata: {},
      actions: commonActions,
      enabled: true,
      reason: 'Cloudy native AutoMod'
    })
  );

  created.push(
    await guild.autoModerationRules.create({
      name: 'Cloudy AutoMod Mentions',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: {
        mentionTotalLimit: 5,
        mentionRaidProtectionEnabled: true
      },
      actions: commonActions,
      enabled: true,
      reason: 'Cloudy native AutoMod'
    })
  );

  created.push(
    await guild.autoModerationRules.create({
      name: 'Cloudy AutoMod Content',
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.KeywordPreset,
      triggerMetadata: {
        presets: [
          AutoModerationRuleKeywordPresetType.Profanity,
          AutoModerationRuleKeywordPresetType.SexualContent,
          AutoModerationRuleKeywordPresetType.Slurs
        ]
      },
      actions: commonActions,
      enabled: true,
      reason: 'Cloudy native AutoMod'
    })
  );

  settings.automod.enabled = true;
  settings.automod.ruleIds = created.map((rule) => rule.id);
  store.flush();

  return created;
}

function helpText(prefix) {
  return [
    'Cloudy is a moderation, security, support and games bot.',
    '',
    'Administration',
    '- ' + ui.inline('/prefix set') + ' changes prefix commands.',
    '- ' + ui.inline('/welcome setup') + ' configures welcome messages.',
    '- ' + ui.inline('/logs set') + ' configures moderation logs.',
    '- ' + ui.inline('/ticket setup') + ' creates the ticket panel.',
    '- ' + ui.inline('/security') + ' configures anti-spam, anti-raid and anti-link protection.',
    '- ' + ui.inline('/automod enable') + ' enables Discord native AutoMod rules.',
    '',
    'Moderation',
    '- ' + ui.inline(prefix + 'warn') + ', ' + ui.inline(prefix + 'warnings') + ', ' + ui.inline(prefix + 'unwarn'),
    '- ' + ui.inline(prefix + 'kick') + ', ' + ui.inline(prefix + 'ban') + ', ' + ui.inline(prefix + 'tempban'),
    '- ' + ui.inline(prefix + 'timeout') + ', ' + ui.inline(prefix + 'mute') + ', ' + ui.inline(prefix + 'purge'),
    '- ' + ui.inline(prefix + 'history') + ', ' + ui.inline(prefix + 'stats'),
    '',
    'Games',
    '- ' + ui.inline('/games truthordare'),
    '- ' + ui.inline('/games rps'),
    '- ' + ui.inline('/games tictactoe')
  ].join('\n');
}

function targetFromMessage(message, parts) {
  const target = message.mentions.members.first() || null;
  if (!target) return null;

  const mentionTokens = ['<@' + target.id + '>', '<@!' + target.id + '>'];
  for (const token of mentionTokens) {
    const index = parts.indexOf(token);
    if (index !== -1) {
      parts.splice(index, 1);
      break;
    }
  }

  return target;
}

async function executePrefix(message) {
  const settings = store.guild(message.guild.id);
  const prefix = settings.prefix;
  if (!message.content.startsWith(prefix)) return;

  const raw = message.content.slice(prefix.length).trim();
  if (!raw) return;

  const parts = raw.split(/\s+/);
  const command = parts.shift().toLowerCase();

  if (command === 'ping') {
    await message.reply(ui.info('Cloudy', 'Latency: ' + ui.inline(client.ws.ping + 'ms')));
    return;
  }

  if (command === 'help') {
    await message.reply(ui.info('Cloudy Commands', helpText(prefix)));
    return;
  }

  if (['rps', 'truth', 'dare', 'tictactoe'].includes(command)) {
    await executeGamePrefix(message, command);
    return;
  }

  const target = targetFromMessage(message, parts);
  let reason = parts.join(' ').replace(/^\s+/, '') || 'No reason provided.';

  if (command === 'warn') {
    if (!hasPermission(message.member, PermissionFlagsBits.ModerateMembers)) {
      await message.reply(ui.error('Cloudy Moderation', 'You need ' + ui.inline('ModerateMembers') + '.'));
      return;
    }
    if (!target) {
      await message.reply(ui.error('Cloudy Moderation', 'Mention a member to warn.'));
      return;
    }
    const guard = canModerateTarget(message.member, target, message.guild.members.me);
    if (!guard.ok) {
      await message.reply(ui.error('Cloudy Moderation', guard.reason));
      return;
    }
    const warning = store.addWarning(message.guild.id, target.id, message.author.id, reason);
    await target.send(
      ui.card('Cloudy Warning', 'You were warned in ' + ui.inline(message.guild.name) + '.\nReason: ' + ui.inline(safeReason(reason)))
    ).catch(() => {});
    await sendLog(message.guild, 'Moderation log', [
      'Action: ' + ui.inline('warn'),
      'User: ' + target.toString(),
      'Moderator: ' + message.member.toString(),
      'Warning ID: ' + ui.inline(warning.id),
      'Reason: ' + ui.inline(safeReason(reason))
    ].join('\n'));
    await message.reply(ui.success('Cloudy Moderation', 'Warned ' + target.toString() + '. Warning ID: ' + ui.inline(warning.id)));
    return;
  }

  if (command === 'warnings') {
    if (!target) {
      await message.reply(ui.error('Cloudy Moderation', 'Mention a member.'));
      return;
    }
    const warnings = (settings.warnings[target.id] || []).filter((item) => item.active);
    const body = warnings.length
      ? warnings.map((item) => '- ' + ui.inline(item.id) + ' — ' + ui.inline(item.reason)).join('\n')
      : 'No active warnings.';
    await message.reply(ui.info('Cloudy Warnings', target.toString() + '\n\n' + body));
    return;
  }

  if (command === 'unwarn') {
    const warningId = parts.shift();
    if (!target || !warningId) {
      await message.reply(ui.error('Cloudy Moderation', 'Use ' + ui.inline(prefix + 'unwarn <warning-id> @user') + '.'));
      return;
    }
    const warning = store.removeWarning(message.guild.id, target.id, warningId);
    if (!warning) {
      await message.reply(ui.error('Cloudy Moderation', 'Active warning not found.'));
      return;
    }
    store.addHistory(message.guild.id, {
      type: 'unwarn',
      targetId: target.id,
      moderatorId: message.author.id,
      reason: 'Warning ' + warningId + ' deactivated.'
    });
    await sendLog(message.guild, 'Moderation log', 'Action: ' + ui.inline('unwarn') + '\nUser: ' + target.toString() + '\nModerator: ' + message.member.toString() + '\nWarning: ' + ui.inline(warningId));
    await message.reply(ui.success('Cloudy Moderation', 'Warning ' + ui.inline(warningId) + ' was deactivated.'));
    return;
  }

  if (command === 'kick') {
    await executePrefixModeration(message, target, 'kick', null, reason);
    return;
  }

  if (command === 'ban') {
    await executePrefixModeration(message, target, 'ban', null, reason);
    return;
  }

  if (command === 'tempban') {
    const durationText = target ? parts.shift() : null;
    const duration = parseDuration(durationText, 2592000000);
    reason = parts.join(' ').replace(/^\s+/, '') || 'No reason provided.';
    await executePrefixModeration(message, target, 'tempban', duration, reason);
    return;
  }

  if (command === 'timeout' || command === 'mute') {
    const durationText = target ? parts.shift() : null;
    const duration = parseDuration(durationText, 2419200000);
    reason = parts.join(' ').replace(/^\s+/, '') || 'No reason provided.';
    await executePrefixModeration(message, target, 'timeout', duration, reason);
    return;
  }

  if (command === 'purge') {
    if (!hasPermission(message.member, PermissionFlagsBits.ManageMessages)) {
      await message.reply(ui.error('Cloudy Moderation', 'You need ' + ui.inline('ManageMessages') + '.'));
      return;
    }
    const amount = Number(parts[0]);
    if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
      await message.reply(ui.error('Cloudy Moderation', 'Amount must be between 1 and 100.'));
      return;
    }

    let count = 0;
    if (amount === 1) {
      const latest = await message.channel.messages.fetch({ limit: 1 }).catch(() => null);
      const latestMessage = latest?.first();
      if (latestMessage) {
        await latestMessage.delete().then(() => { count = 1; }).catch(() => {});
      }
    } else {
      const deleted = await message.channel.bulkDelete(amount, true).catch(() => null);
      count = deleted?.size || 0;
    }
    store.addHistory(message.guild.id, {
      type: 'purge',
      targetId: message.guild.id,
      moderatorId: message.author.id,
      reason: 'Deleted ' + count + ' messages.'
    });
    await sendLog(message.guild, 'Moderation log', 'Action: ' + ui.inline('purge') + '\nModerator: ' + message.member.toString() + '\nDeleted: ' + ui.inline(count));
    return;
  }

  if (command === 'history') {
    if (!target) {
      await message.reply(ui.error('Cloudy Moderation', 'Mention a member.'));
      return;
    }
    const history = settings.history
      .filter((item) => item.targetId === target.id)
      .slice(-15)
      .reverse();
    const body = history.length
      ? history.map((item) => '- ' + ui.inline(item.type) + ' by <@' + item.moderatorId + '> — ' + ui.inline(item.reason)).join('\n')
      : 'No moderation history found.';
    await message.reply(ui.info('Cloudy Moderation History', target.toString() + '\n\n' + body));
    return;
  }

  if (command === 'stats') {
    const who = target ? target.id : message.author.id;
    const stats = settings.stats[who] || {};
    await message.reply(ui.info('Cloudy Moderation Stats', 'Moderator: <@' + who + '>\n\n' + formatStats(stats)));
  }
}

async function executePrefixModeration(message, target, action, durationMs, reason) {
  const permissions = {
    kick: PermissionFlagsBits.KickMembers,
    ban: PermissionFlagsBits.BanMembers,
    tempban: PermissionFlagsBits.BanMembers,
    timeout: PermissionFlagsBits.ModerateMembers
  };
  const permission = permissions[action];

  if (!hasPermission(message.member, permission)) {
    await message.reply(ui.error('Cloudy Moderation', 'You need ' + ui.inline(permission.toString()) + '.'));
    return;
  }

  if (!target) {
    await message.reply(ui.error('Cloudy Moderation', 'Mention a member.'));
    return;
  }

  if ((action === 'tempban' || action === 'timeout') && !durationMs) {
    await message.reply(ui.error('Cloudy Moderation', 'Use a valid duration such as ' + ui.inline('10m') + ', ' + ui.inline('2h') + ' or ' + ui.inline('3d') + '.'));
    return;
  }

  const guard = canModerateTarget(message.member, target, message.guild.members.me);
  if (!guard.ok) {
    await message.reply(ui.error('Cloudy Moderation', guard.reason));
    return;
  }

  try {
    if (action === 'kick') {
      await target.kick(safeReason(reason));
    } else if (action === 'ban' || action === 'tempban') {
      await target.ban({ reason: safeReason(reason), deleteMessageSeconds: 0 });
    } else {
      await target.timeout(durationMs, safeReason(reason));
    }
  } catch (error) {
    await message.reply(ui.error('Cloudy Moderation', 'Discord rejected the action: ' + ui.inline(error.message)));
    return;
  }

  recordModeration(message.guild, action, target, message.member, reason, { durationMs });
  if (action === 'tempban') {
    store.addTempPunishment({
      id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
      guildId: message.guild.id,
      userId: target.id,
      expiresAt: Date.now() + durationMs,
      type: 'tempban'
    });
  }

  await sendLog(message.guild, 'Moderation log', [
    'Action: ' + ui.inline(action),
    'User: <@' + target.id + '>',
    'Moderator: ' + message.member.toString(),
    'Duration: ' + (durationMs ? ui.inline(formatDuration(durationMs)) : ui.inline('permanent')),
    'Reason: ' + ui.inline(safeReason(reason))
  ].join('\n'));

  await message.reply(ui.success('Cloudy Moderation', 'Completed ' + ui.inline(action) + ' for ' + target.toString() + '.'));
}

async function executeGamePrefix(message, command) {
  if (command === 'rps') {
    await message.reply(ui.rpsCard('Choose your move.'));
    return;
  }

  if (command === 'truth' || command === 'dare') {
    const prompt = pick(command === 'truth' ? truthPrompts : darePrompts);
    await message.reply(ui.truthDareCard(prompt));
    return;
  }

  if (command === 'tictactoe') {
    const game = {
      id: Math.random().toString(36).slice(2, 10),
      ownerId: message.author.id,
      board: Array(9).fill(null),
      finished: false,
      winner: null,
      createdAt: Date.now()
    };
    games.set(game.id, game);
    await message.reply(ui.tttCard(game));
    setTimeout(() => games.delete(game.id), 15 * 60 * 1000);
  }
}

async function handleSlash(interaction) {
  const { commandName } = interaction;

  if (commandName === 'ping') {
    await interaction.reply(ui.info('Cloudy', 'WebSocket latency: ' + ui.inline(client.ws.ping + 'ms')));
    return;
  }

  if (commandName === 'help') {
    await interaction.reply(ui.info('Cloudy Commands', helpText(store.guild(interaction.guild.id).prefix)));
    return;
  }

  if (commandName === 'prefix') {
    const prefix = interaction.options.getString('prefix', true).trim();
    if (!prefix || /\s/.test(prefix)) {
      await interaction.reply(ui.error('Cloudy Prefix', 'The prefix must be 1 to 5 non-space characters.'));
      return;
    }

    store.updateGuild(interaction.guild.id, (guild) => {
      guild.prefix = prefix;
    });

    await interaction.reply(ui.success('Cloudy Prefix', 'The server prefix is now ' + ui.inline(prefix) + '.'));
    return;
  }

  if (commandName === 'welcome') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel', true);
      const message = interaction.options.getString('message', true);
      store.updateGuild(interaction.guild.id, (guild) => {
        guild.welcome.channelId = channel.id;
        guild.welcome.message = truncate(message, 1000);
      });
      await interaction.reply(ui.success('Cloudy Welcome', 'Welcome messages will be sent in ' + channel.toString() + '.\nSupported placeholders: ' + ui.inline('{user}') + ' ' + ui.inline('{username}') + ' ' + ui.inline('{server}') + ' ' + ui.inline('{count}') + '.'));
    } else {
      store.updateGuild(interaction.guild.id, (guild) => {
        guild.welcome.channelId = null;
      });
      await interaction.reply(ui.success('Cloudy Welcome', 'Welcome messages are disabled.'));
    }
    return;
  }

  if (commandName === 'logs') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'set') {
      const channel = interaction.options.getChannel('channel', true);
      store.updateGuild(interaction.guild.id, (guild) => {
        guild.logsChannelId = channel.id;
      });
      await interaction.reply(ui.success('Cloudy Logs', 'Logs will be sent to ' + channel.toString() + '.'));
    } else {
      store.updateGuild(interaction.guild.id, (guild) => {
        guild.logsChannelId = null;
      });
      await interaction.reply(ui.success('Cloudy Logs', 'Cloudy logs are disabled.'));
    }
    return;
  }

  if (commandName === 'ticket') {
    const sub = interaction.options.getSubcommand();
    const settings = store.guild(interaction.guild.id);

    if (sub === 'setup') {
      const channel = interaction.options.getChannel('channel', true);
      const category = interaction.options.getChannel('category');
      const supportRole = interaction.options.getRole('support_role');

      const panel = await channel.send(ui.ticketPanel());

      store.updateGuild(interaction.guild.id, (guild) => {
        guild.ticket.panelChannelId = channel.id;
        guild.ticket.panelMessageId = panel.id;
        guild.ticket.categoryId = category?.id || null;
        guild.ticket.supportRoleId = supportRole?.id || null;
      });

      await interaction.reply(ui.success('Cloudy Tickets', 'Ticket panel created in ' + channel.toString() + '.'));
    } else {
      store.updateGuild(interaction.guild.id, (guild) => {
        guild.ticket.panelChannelId = null;
        guild.ticket.panelMessageId = null;
        guild.ticket.categoryId = null;
        guild.ticket.supportRoleId = null;
      });
      await interaction.reply(ui.success('Cloudy Tickets', 'Ticket configuration is disabled.'));
    }
    return;
  }

  if (commandName === 'security') {
    const sub = interaction.options.getSubcommand();
    store.updateGuild(interaction.guild.id, (guild) => {
      if (sub === 'antispam') {
        guild.security.antiSpam = interaction.options.getBoolean('enabled', true);
        const limit = interaction.options.getInteger('limit');
        const window = interaction.options.getInteger('window');
        if (limit) guild.security.spamLimit = limit;
        if (window) guild.security.spamWindowMs = window * 1000;
      }
      if (sub === 'antiraid') {
        guild.security.antiRaid = interaction.options.getBoolean('enabled', true);
        const joins = interaction.options.getInteger('joins');
        const window = interaction.options.getInteger('window');
        if (joins) guild.security.raidJoins = joins;
        if (window) guild.security.raidWindowMs = window * 1000;
      }
      if (sub === 'antilink') {
        guild.security.antiLink = interaction.options.getBoolean('enabled', true);
      }
    });

    const settings = store.guild(interaction.guild.id).security;
    await interaction.reply(ui.success('Cloudy Security', [
      'Anti-spam: ' + ui.inline(settings.antiSpam ? 'enabled' : 'disabled'),
      'Anti-raid: ' + ui.inline(settings.antiRaid ? 'enabled' : 'disabled'),
      'Anti-link: ' + ui.inline(settings.antiLink ? 'enabled' : 'disabled'),
      'Spam threshold: ' + ui.inline(settings.spamLimit + ' messages / ' + (settings.spamWindowMs / 1000) + 's'),
      'Raid threshold: ' + ui.inline(settings.raidJoins + ' joins / ' + (settings.raidWindowMs / 1000) + 's')
    ].join('\n')));
    return;
  }

  if (commandName === 'automod') {
    const sub = interaction.options.getSubcommand();
    try {
      if (sub === 'enable') {
        const created = await configureNativeAutoMod(interaction.guild, true);
        await interaction.reply(ui.success('Cloudy AutoMod', 'Enabled ' + ui.inline(created.length) + ' Discord native AutoMod rules.'));
      } else {
        await configureNativeAutoMod(interaction.guild, false);
        await interaction.reply(ui.success('Cloudy AutoMod', 'Cloudy native AutoMod rules are disabled.'));
      }
    } catch (error) {
      console.error('AutoMod setup error:', error);
      await interaction.reply(ui.error('Cloudy AutoMod', 'Discord could not create the native rules. Check Cloudy permissions and server capabilities.\n\n' + ui.inline(error.message)));
    }
    return;
  }

  if (commandName === 'mod') {
    await handleModerationSlash(interaction);
    return;
  }

  if (commandName === 'games') {
    await handleGameSlash(interaction);
  }
}

async function handleModerationSlash(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'warn') {
    const targetUser = interaction.options.getUser('user', true);
    const result = await moderateInteraction(interaction, targetUser, PermissionFlagsBits.ModerateMembers);
    if (!result) return;

    const reason = interaction.options.getString('reason', true);
    const warning = store.addWarning(interaction.guild.id, result.target.id, interaction.user.id, reason);
    await result.target.send(
      ui.card('Cloudy Warning', 'You were warned in ' + ui.inline(interaction.guild.name) + '.\nReason: ' + ui.inline(safeReason(reason)))
    ).catch(() => {});

    await sendLog(interaction.guild, 'Moderation log', [
      'Action: ' + ui.inline('warn'),
      'User: ' + result.target.toString(),
      'Moderator: ' + interaction.member.toString(),
      'Warning ID: ' + ui.inline(warning.id),
      'Reason: ' + ui.inline(safeReason(reason))
    ].join('\n'));

    await interaction.reply(ui.success('Cloudy Moderation', 'Warned ' + result.target.toString() + '. Warning ID: ' + ui.inline(warning.id)));
    return;
  }

  if (sub === 'warnings') {
    const targetUser = interaction.options.getUser('user', true);
    if (!hasPermission(interaction.member, PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply(ui.error('Cloudy Moderation', 'You need ' + ui.inline('ModerateMembers') + '.'));
      return;
    }
    const warnings = (store.guild(interaction.guild.id).warnings[targetUser.id] || []).filter((item) => item.active);
    const body = warnings.length
      ? warnings.map((item) => '- ' + ui.inline(item.id) + ' — ' + ui.inline(item.reason)).join('\n')
      : 'No active warnings.';
    await interaction.reply(ui.info('Cloudy Warnings', targetUser.toString() + '\n\n' + body));
    return;
  }

  if (sub === 'unwarn') {
    if (!hasPermission(interaction.member, PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply(ui.error('Cloudy Moderation', 'You need ' + ui.inline('ModerateMembers') + '.'));
      return;
    }
    const targetUser = interaction.options.getUser('user', true);
    const warningId = interaction.options.getString('warning_id', true);
    const warning = store.removeWarning(interaction.guild.id, targetUser.id, warningId);
    if (!warning) {
      await interaction.reply(ui.error('Cloudy Moderation', 'Active warning not found.'));
      return;
    }
    store.addHistory(interaction.guild.id, {
      type: 'unwarn',
      targetId: targetUser.id,
      moderatorId: interaction.user.id,
      reason: 'Warning ' + warningId + ' deactivated.'
    });
    await sendLog(interaction.guild, 'Moderation log', [
      'Action: ' + ui.inline('unwarn'),
      'User: ' + targetUser.toString(),
      'Moderator: ' + interaction.member.toString(),
      'Warning: ' + ui.inline(warningId)
    ].join('\n'));
    await interaction.reply(ui.success('Cloudy Moderation', 'Warning ' + ui.inline(warningId) + ' was deactivated.'));
    return;
  }

  if (sub === 'kick' || sub === 'ban' || sub === 'tempban' || sub === 'timeout' || sub === 'mute') {
    const targetUser = interaction.options.getUser('user', true);
    const permission = {
      kick: PermissionFlagsBits.KickMembers,
      ban: PermissionFlagsBits.BanMembers,
      tempban: PermissionFlagsBits.BanMembers,
      timeout: PermissionFlagsBits.ModerateMembers,
      mute: PermissionFlagsBits.ModerateMembers
    }[sub];

    const result = await moderateInteraction(interaction, targetUser, permission);
    if (!result) return;

    const reason = interaction.options.getString('reason', true);
    let durationMs = null;

    if (sub === 'tempban' || sub === 'timeout' || sub === 'mute') {
      durationMs = parseDuration(interaction.options.getString('duration', true), sub === 'tempban' ? 1209600000 : 2419200000);
      if (!durationMs) {
        await interaction.reply(ui.error('Cloudy Moderation', 'Invalid duration. Examples: ' + ui.inline('10m') + ', ' + ui.inline('2h') + ', ' + ui.inline('3d') + '.'));
        return;
      }
    }

    const action = sub === 'mute' ? 'timeout' : sub;

    try {
      if (action === 'kick') {
        await result.target.kick(safeReason(reason));
      } else if (action === 'ban' || action === 'tempban') {
        await result.target.ban({ reason: safeReason(reason), deleteMessageSeconds: 0 });
      } else {
        await result.target.timeout(durationMs, safeReason(reason));
      }
    } catch (error) {
      await interaction.reply(ui.error('Cloudy Moderation', 'Discord rejected the action: ' + ui.inline(error.message)));
      return;
    }

    recordModeration(interaction.guild, action, result.target, interaction.member, reason, { durationMs });

    if (action === 'tempban') {
      store.addTempPunishment({
        id: String(Date.now()) + '-' + Math.random().toString(36).slice(2, 8),
        guildId: interaction.guild.id,
        userId: result.target.id,
        expiresAt: Date.now() + durationMs,
        type: 'tempban'
      });
    }

    await sendLog(interaction.guild, 'Moderation log', [
      'Action: ' + ui.inline(action),
      'User: ' + result.target.toString(),
      'Moderator: ' + interaction.member.toString(),
      'Duration: ' + (durationMs ? ui.inline(formatDuration(durationMs)) : ui.inline('permanent')),
      'Reason: ' + ui.inline(safeReason(reason))
    ].join('\n'));

    await interaction.reply(ui.success('Cloudy Moderation', 'Completed ' + ui.inline(action) + ' for ' + result.target.toString() + '.'));
    return;
  }

  if (sub === 'purge') {
    if (!hasPermission(interaction.member, PermissionFlagsBits.ManageMessages)) {
      await interaction.reply(ui.error('Cloudy Moderation', 'You need ' + ui.inline('ManageMessages') + '.'));
      return;
    }

    const amount = interaction.options.getInteger('amount', true);
    await interaction.deferReply();

    let count = 0;
    if (amount === 1) {
      const latest = await interaction.channel.messages.fetch({ limit: 1 }).catch(() => null);
      const message = latest?.first();
      if (message) {
        await message.delete().then(() => { count = 1; }).catch(() => {});
      }
    } else {
      const deleted = await interaction.channel.bulkDelete(amount, true).catch(() => null);
      count = deleted?.size || 0;
    }

    store.addHistory(interaction.guild.id, {
      type: 'purge',
      targetId: interaction.guild.id,
      moderatorId: interaction.user.id,
      reason: 'Deleted ' + count + ' messages.'
    });

    await sendLog(interaction.guild, 'Moderation log', [
      'Action: ' + ui.inline('purge'),
      'Moderator: ' + interaction.member.toString(),
      'Deleted: ' + ui.inline(count)
    ].join('\n'));

    await interaction.editReply(ui.success('Cloudy Moderation', 'Deleted ' + ui.inline(count) + ' messages.'));
    return;
  }

  if (sub === 'history') {
    if (!hasPermission(interaction.member, PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply(ui.error('Cloudy Moderation', 'You need ' + ui.inline('ModerateMembers') + '.'));
      return;
    }

    const targetUser = interaction.options.getUser('user', true);
    const limit = interaction.options.getInteger('limit') || 15;
    const history = store.guild(interaction.guild.id).history
      .filter((item) => item.targetId === targetUser.id)
      .slice(-limit)
      .reverse();

    const body = history.length
      ? history.map((item) => '- ' + ui.inline(item.type) + ' by <@' + item.moderatorId + '> — ' + ui.inline(item.reason)).join('\n')
      : 'No moderation history found.';

    await interaction.reply(ui.info('Cloudy Moderation History', targetUser.toString() + '\n\n' + body));
    return;
  }

  if (sub === 'stats') {
    if (!hasPermission(interaction.member, PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply(ui.error('Cloudy Moderation', 'You need ' + ui.inline('ModerateMembers') + '.'));
      return;
    }

    const targetUser = interaction.options.getUser('user') || interaction.user;
    const stats = store.guild(interaction.guild.id).stats[targetUser.id] || {};
    await interaction.reply(ui.info('Cloudy Moderation Stats', 'Moderator: ' + targetUser.toString() + '\n\n' + formatStats(stats)));
  }
}

async function handleGameSlash(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'truthordare') {
    await interaction.reply(ui.truthDareCard('Choose ' + ui.inline('Truth') + ' or ' + ui.inline('Dare') + '.'));
    return;
  }

  if (sub === 'rps') {
    await interaction.reply(ui.rpsCard('Choose your move.'));
    return;
  }

  if (sub === 'tictactoe') {
    const game = {
      id: Math.random().toString(36).slice(2, 10),
      ownerId: interaction.user.id,
      board: Array(9).fill(null),
      finished: false,
      winner: null,
      createdAt: Date.now()
    };
    games.set(game.id, game);
    await interaction.reply(ui.tttCard(game));
    setTimeout(() => games.delete(game.id), 15 * 60 * 1000);
  }
}

async function handleButton(interaction) {
  if (!interaction.customId.startsWith('cloudy:')) return;

  if (interaction.customId === 'cloudy:ticket:open') {
    const settings = store.guild(interaction.guild.id);

    const existing = Object.entries(settings.tickets).find(
      ([channelId, ticket]) =>
        ticket.ownerId === interaction.user.id &&
        ticket.status === 'open' &&
        interaction.guild.channels.cache.has(channelId)
    );

    if (existing) {
      await interaction.reply(ui.info('Cloudy Tickets', 'You already have an open ticket: <#' + existing[0] + '>.'));
      return;
    }

    const baseName = interaction.user.username.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 16) || 'user';
    const channelName = 'ticket-' + baseName;

    const overwrites = [
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles
        ]
      },
      {
        id: client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages
        ]
      }
    ];

    if (settings.ticket.supportRoleId) {
      overwrites.push({
        id: settings.ticket.supportRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      });
    }

    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: settings.ticket.categoryId || undefined,
      permissionOverwrites: overwrites,
      topic: 'Cloudy ticket owned by ' + interaction.user.id
    }).catch(() => null);

    if (!channel) {
      await interaction.reply(ui.error('Cloudy Tickets', 'Cloudy could not create the ticket channel. Check Manage Channels.'));
      return;
    }

    store.updateGuild(interaction.guild.id, (guild) => {
      guild.tickets[channel.id] = {
        ownerId: interaction.user.id,
        createdAt: Date.now(),
        status: 'open'
      };
    });

    await channel.send(ui.ticketCard(channel.name, interaction.user.toString()));
    await sendLog(interaction.guild, 'Ticket opened', 'Ticket: ' + channel.toString() + '\nOwner: ' + interaction.user.toString());
    await interaction.reply(ui.success('Cloudy Tickets', 'Your ticket is ready: ' + channel.toString()));
    return;
  }

  if (interaction.customId === 'cloudy:ticket:close') {
    const ticket = store.guild(interaction.guild.id).tickets[interaction.channel.id];
    if (!ticket) {
      await interaction.reply(ui.error('Cloudy Tickets', 'This channel is not a Cloudy ticket.'));
      return;
    }

    const isOwner = ticket.ownerId === interaction.user.id;
    const isStaff = isModerator(interaction.member) || interaction.member.roles.cache.has(store.guild(interaction.guild.id).ticket.supportRoleId);

    if (!isOwner && !isStaff) {
      await interaction.reply(ui.error('Cloudy Tickets', 'Only the ticket owner or configured support staff can close this ticket.'));
      return;
    }

    store.updateGuild(interaction.guild.id, (guild) => {
      guild.tickets[interaction.channel.id].status = 'closed';
    });

    await interaction.reply(ui.success('Cloudy Tickets', 'This ticket will close in a few seconds.'));
    await sendLog(interaction.guild, 'Ticket closed', 'Ticket: ' + interaction.channel.toString() + '\nClosed by: ' + interaction.user.toString());

    setTimeout(() => {
      interaction.channel.delete('Cloudy ticket closed').catch(() => {});
    }, 2500);
    return;
  }

  if (interaction.customId.startsWith('cloudy:td:')) {
    const type = interaction.customId.split(':')[2];
    const prompt = pick(type === 'truth' ? truthPrompts : darePrompts);
    await interaction.update(ui.truthDareCard(prompt));
    return;
  }

  if (interaction.customId.startsWith('cloudy:rps:')) {
    const player = interaction.customId.split(':')[2];
    const computer = pick(rpsChoices);
    const result =
      player === computer
        ? 'You chose ' + ui.inline(player) + '. Cloudy chose ' + ui.inline(computer) + '.\nResult: ' + ui.inline('draw')
        : winsAgainst(player, computer)
          ? 'You chose ' + ui.inline(player) + '. Cloudy chose ' + ui.inline(computer) + '.\nResult: ' + ui.inline('you win')
          : 'You chose ' + ui.inline(player) + '. Cloudy chose ' + ui.inline(computer) + '.\nResult: ' + ui.inline('Cloudy wins');

    await interaction.update(ui.rpsCard(result));
    return;
  }

  if (interaction.customId.startsWith('cloudy:ttt:')) {
    const [, , gameId, cellText] = interaction.customId.split(':');
    const game = games.get(gameId);

    if (!game) {
      await interaction.reply(ui.error('Tic-Tac-Toe', 'This game has expired.'));
      return;
    }

    if (game.ownerId !== interaction.user.id) {
      await interaction.reply(ui.error('Tic-Tac-Toe', 'This game belongs to another player.'));
      return;
    }

    const cell = Number(cellText);
    if (game.finished || !Number.isInteger(cell) || cell < 0 || cell > 8 || game.board[cell]) {
      await interaction.reply(ui.error('Tic-Tac-Toe', 'That move is no longer available.'));
      return;
    }

    game.board[cell] = 'X';
    let winner = checkWinner(game.board);

    if (!winner) {
      const move = botMove(game.board);
      if (move !== null) game.board[move] = 'O';
      winner = checkWinner(game.board);
    }

    if (winner) {
      game.finished = true;
      game.winner = winner;
      setTimeout(() => games.delete(game.id), 10000);
    }

    await interaction.update(ui.tttCard(game));
  }
}

client.once('ready', async () => {
  client.user.setPresence({
    activities: [{ name: 'the clouds', type: ActivityType.Watching }],
    status: 'online'
  });

  console.log('Cloudy is online as ' + client.user.tag + '.');

  for (const guild of client.guilds.cache.values()) {
    store.guild(guild.id);
  }

  setInterval(processTempBans, 15000);
});

client.on('guildMemberAdd', async (member) => {
  const settings = store.guild(member.guild.id);

  if (settings.welcome.channelId && !member.user.bot) {
    const channel = member.guild.channels.cache.get(settings.welcome.channelId);
    if (channel && channel.isTextBased()) {
      const content = renderWelcome(settings.welcome.message, member);
      await channel.send({
        ...ui.card('Welcome', content),
        allowedMentions: { users: [member.id], parse: [] }
      }).catch(() => {});
    }
  }

  if (member.user.bot || !settings.security.antiRaid) return;

  const now = Date.now();
  const entries = raidTracker.get(member.guild.id) || [];
  const recent = entries.filter((timestamp) => now - timestamp <= settings.security.raidWindowMs);
  recent.push(now);
  raidTracker.set(member.guild.id, recent);

  const activeUntil = raidMode.get(member.guild.id) || 0;

  if (recent.length >= settings.security.raidJoins || activeUntil > now) {
    const newUntil = Math.max(activeUntil, now + 5 * 60 * 1000);
    raidMode.set(member.guild.id, newUntil);

    await member.timeout(5 * 60 * 1000, 'Cloudy anti-raid protection').catch(() => {});
    await sendLog(member.guild, 'Cloudy Anti-Raid', [
      'Raid mode is active.',
      'New member: ' + member.toString(),
      'Join count: ' + ui.inline(recent.length),
      'Window: ' + ui.inline(settings.security.raidWindowMs / 1000 + 's'),
      'New members are temporarily restricted while raid mode is active.'
    ].join('\n'));
  }
});

client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;

  const settings = store.guild(message.guild.id);
  const member = message.member;

  if (settings.security.antiLink && !isModerator(member) && containsLink(message.content)) {
    await message.delete().catch(() => {});
    await sendLog(message.guild, 'Cloudy Anti-Link', [
      'User: ' + message.author.toString(),
      'Channel: ' + message.channel.toString(),
      'Action: ' + ui.inline('message deleted'),
      'Reason: ' + ui.inline('link or invite detected')
    ].join('\n'));
    return;
  }

  if (settings.security.antiSpam && !isModerator(member)) {
    const key = message.guild.id + ':' + message.author.id;
    const now = Date.now();
    const entries = spamTracker.get(key) || [];
    const recent = entries.filter((timestamp) => now - timestamp <= settings.security.spamWindowMs);
    recent.push(now);
    spamTracker.set(key, recent);

    if (
      recent.length >= settings.security.spamLimit &&
      (spamCooldown.get(key) || 0) < now
    ) {
      spamCooldown.set(key, now + 30000);
      spamTracker.delete(key);

      await message.delete().catch(() => {});
      const target = member;

      if (target && target.moderatable) {
        await target.timeout(30000, 'Cloudy anti-spam protection').catch(() => {});
      }

      store.addHistory(message.guild.id, {
        type: 'antispam',
        targetId: message.author.id,
        moderatorId: client.user.id,
        reason: 'Automatic anti-spam action.'
      });

      await sendLog(message.guild, 'Cloudy Anti-Spam', [
        'User: ' + message.author.toString(),
        'Channel: ' + message.channel.toString(),
        'Detected: ' + ui.inline(recent.length + ' messages in ' + settings.security.spamWindowMs / 1000 + 's'),
        'Action: ' + ui.inline(target?.moderatable ? 'message deleted and 30s timeout' : 'message deleted')
      ].join('\n'));
      return;
    }
  }

  await executePrefix(message).catch((error) => {
    console.error('Prefix command error:', error);
  });
});

client.on('autoModerationActionExecution', async (execution) => {
  const guild = client.guilds.cache.get(execution.guild.id);
  if (!guild) return;

  await sendLog(guild, 'Cloudy AutoMod', [
    'User ID: ' + ui.inline(execution.userId),
    'Channel ID: ' + ui.inline(execution.channelId || 'unknown'),
    'Action: ' + ui.inline(execution.action.type),
    'Rule: ' + ui.inline(execution.ruleId)
  ].join('\n'));
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!interaction.guild) return;
      await handleSlash(interaction);
      return;
    }

    if (interaction.isButton()) {
      if (!interaction.guild) return;
      await handleButton(interaction);
    }
  } catch (error) {
    console.error('Cloudy interaction error:', error);
    const response = ui.error('Cloudy Error', 'Something went wrong while handling that action.');

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(response).catch(() => {});
    } else {
      await interaction.reply(response).catch(() => {});
    }
  }
});

async function processTempBans() {
  const pending = store.pendingTempPunishments();
  const now = Date.now();

  for (const item of pending) {
    if (item.type !== 'tempban' || item.expiresAt > now) continue;

    const guild = client.guilds.cache.get(item.guildId);
    if (!guild) {
      store.removeTempPunishment(item.id);
      continue;
    }

    try {
      await guild.members.unban(item.userId, 'Cloudy temporary ban expired');
      store.removeTempPunishment(item.id);
      store.addHistory(guild.id, {
        type: 'unban',
        targetId: item.userId,
        moderatorId: client.user.id,
        reason: 'Temporary ban expired.'
      });
      await sendLog(guild, 'Temporary punishment expired', 'User: <@' + item.userId + '>\nAction: ' + ui.inline('tempban expired'));
    } catch (error) {
      if (error?.code === 10026) {
        store.removeTempPunishment(item.id);
      }
    }
  }
}

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

client.login(config.token);
