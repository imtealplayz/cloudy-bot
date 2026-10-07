const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');

const commands = [];

commands.push(
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check Cloudy latency.')
    .setDMPermission(false)
);

commands.push(
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show Cloudy command categories.')
    .setDMPermission(false)
);

commands.push(
  new SlashCommandBuilder()
    .setName('prefix')
    .setDescription('Manage the server prefix.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set the prefix for prefix commands.')
        .addStringOption((option) =>
          option
            .setName('prefix')
            .setDescription('New prefix, 1 to 5 characters.')
            .setMinLength(1)
            .setMaxLength(5)
            .setRequired(true)
        )
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Configure welcome messages.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Set the welcome channel and message.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Text channel for welcome messages.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('message')
            .setDescription('Placeholders: {user} {username} {server} {count}.')
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('disable').setDescription('Disable welcome messages.')
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Configure moderation and security logs.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Set the log channel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Text channel for Cloudy logs.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((sub) =>
      sub.setName('disable').setDescription('Disable Cloudy logs.')
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Manage the ticket system.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('setup')
        .setDescription('Create or replace the ticket panel.')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel where the panel should be sent.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Optional category for ticket channels.')
            .addChannelTypes(ChannelType.GuildCategory)
        )
        .addRoleOption((option) =>
          option
            .setName('support_role')
            .setDescription('Optional role that can see all tickets.')
        )
    )
    .addSubcommand((sub) =>
      sub.setName('disable').setDescription('Disable the ticket system.')
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName('security')
    .setDescription('Configure Cloudy security filters.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('antispam')
        .setDescription('Toggle anti-spam and configure its threshold.')
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Enable anti-spam.').setRequired(true)
        )
        .addIntegerOption((option) =>
          option.setName('limit').setDescription('Messages allowed inside the window.').setMinValue(3).setMaxValue(20)
        )
        .addIntegerOption((option) =>
          option.setName('window').setDescription('Window in seconds.').setMinValue(3).setMaxValue(30)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('antiraid')
        .setDescription('Toggle anti-raid join protection.')
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Enable anti-raid.').setRequired(true)
        )
        .addIntegerOption((option) =>
          option.setName('joins').setDescription('Joins that trigger raid mode.').setMinValue(3).setMaxValue(50)
        )
        .addIntegerOption((option) =>
          option.setName('window').setDescription('Window in seconds.').setMinValue(5).setMaxValue(60)
        )
    )
    .addSubcommand((sub) =>
      sub
        .setName('antilink')
        .setDescription('Toggle link and invite protection.')
        .addBooleanOption((option) =>
          option.setName('enabled').setDescription('Enable anti-link protection.').setRequired(true)
        )
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName('automod')
    .setDescription('Manage Discord native AutoMod rules.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub.setName('enable').setDescription('Enable Cloudy native AutoMod rules.')
    )
    .addSubcommand((sub) =>
      sub.setName('disable').setDescription('Disable Cloudy native AutoMod rules.')
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName('mod')
    .setDescription('Moderation tools.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers.toString())
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName('warn')
        .setDescription('Warn a member.')
        .addUserOption((option) => option.setName('user').setDescription('Member to warn.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setMaxLength(500).setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('warnings')
        .setDescription('Show active warnings for a member.')
        .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('unwarn')
        .setDescription('Deactivate a warning.')
        .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
        .addStringOption((option) => option.setName('warning_id').setDescription('Warning ID.').setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('kick')
        .setDescription('Kick a member.')
        .addUserOption((option) => option.setName('user').setDescription('Member to kick.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setMaxLength(500).setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('ban')
        .setDescription('Ban a member.')
        .addUserOption((option) => option.setName('user').setDescription('Member to ban.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setMaxLength(500).setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('tempban')
        .setDescription('Temporarily ban a member.')
        .addUserOption((option) => option.setName('user').setDescription('Member to ban.').setRequired(true))
        .addStringOption((option) => option.setName('duration').setDescription('Examples: 10m, 2h, 3d.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setMaxLength(500).setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('timeout')
        .setDescription('Timeout a member.')
        .addUserOption((option) => option.setName('user').setDescription('Member to timeout.').setRequired(true))
        .addStringOption((option) => option.setName('duration').setDescription('Examples: 10m, 2h, 7d.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setMaxLength(500).setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('mute')
        .setDescription('Alias for timeout.')
        .addUserOption((option) => option.setName('user').setDescription('Member to timeout.').setRequired(true))
        .addStringOption((option) => option.setName('duration').setDescription('Examples: 10m, 2h, 7d.').setRequired(true))
        .addStringOption((option) => option.setName('reason').setDescription('Reason.').setMaxLength(500).setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('purge')
        .setDescription('Delete recent messages.')
        .addIntegerOption((option) => option.setName('amount').setDescription('1 to 100 messages.').setMinValue(1).setMaxValue(100).setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName('history')
        .setDescription('Show moderation history for a member.')
        .addUserOption((option) => option.setName('user').setDescription('Member.').setRequired(true))
        .addIntegerOption((option) => option.setName('limit').setDescription('1 to 15 entries.').setMinValue(1).setMaxValue(15))
    )
    .addSubcommand((sub) =>
      sub
        .setName('stats')
        .setDescription('Show moderation statistics.')
        .addUserOption((option) => option.setName('user').setDescription('Optional moderator.'))
    )
);

commands.push(
  new SlashCommandBuilder()
    .setName('games')
    .setDescription('Play Cloudy games.')
    .setDMPermission(false)
    .addSubcommand((sub) => sub.setName('truthordare').setDescription('Start a Truth or Dare game.'))
    .addSubcommand((sub) => sub.setName('rps').setDescription('Play Rock Paper Scissors against Cloudy.'))
    .addSubcommand((sub) => sub.setName('tictactoe').setDescription('Play Tic-Tac-Toe against Cloudy.'))
);

module.exports = commands;
