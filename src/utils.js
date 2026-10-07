const {
  PermissionFlagsBits
} = require('discord.js');

function parseDuration(input, maxMs = 2419200000) {
  const match = /^\s*(\d+)\s*(s|m|h|d|w)\s*$/i.exec(String(input || ''));
  if (!match) return null;

  const amount = Number(match[1]);
  const units = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
    w: 604800000
  };

  const ms = amount * units[match[2].toLowerCase()];
  if (!Number.isSafeInteger(ms) || ms <= 0 || ms > maxMs) return null;
  return ms;
}

function formatDuration(ms) {
  let value = Math.max(0, Math.floor(ms / 1000));
  const parts = [];
  const units = [
    ['w', 604800],
    ['d', 86400],
    ['h', 3600],
    ['m', 60],
    ['s', 1]
  ];

  for (const [suffix, seconds] of units) {
    if (value >= seconds) {
      const amount = Math.floor(value / seconds);
      value %= seconds;
      parts.push(amount + suffix);
    }
  }

  return parts.join(' ') || '0s';
}

function truncate(value, max = 1000) {
  const text = String(value ?? '');
  return text.length <= max ? text : text.slice(0, max - 3) + '...';
}

function isModerator(member) {
  return Boolean(
    member &&
    (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageMessages) ||
      member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
      member.permissions.has(PermissionFlagsBits.KickMembers) ||
      member.permissions.has(PermissionFlagsBits.BanMembers)
    )
  );
}

function hasPermission(member, permission) {
  return Boolean(member && member.permissions.has(permission));
}

function canModerateTarget(moderator, target, botMember) {
  if (!target) return { ok: false, reason: 'That member is not in this server.' };
  if (target.id === moderator.id) return { ok: false, reason: 'You cannot moderate yourself.' };
  if (target.id === target.guild.ownerId) return { ok: false, reason: 'The server owner cannot be moderated.' };
  if (target.id === botMember.id) return { ok: false, reason: 'Cloudy cannot moderate itself.' };
  if (target.roles.highest.position >= botMember.roles.highest.position) {
    return { ok: false, reason: 'That member is above or equal to Cloudy in the role hierarchy.' };
  }
  if (
    moderator.id !== moderator.guild.ownerId &&
    target.roles.highest.position >= moderator.roles.highest.position
  ) {
    return { ok: false, reason: 'That member is above or equal to your highest role.' };
  }
  return { ok: true };
}

function containsLink(content) {
  const patterns = [
    /https?:\/\/\S+/i,
    /www\.\S+/i,
    /discord(?:\.gg|\.com\/invite)\/\S+/i
  ];
  return patterns.some((pattern) => pattern.test(String(content || '')));
}

function renderWelcome(template, member) {
  return String(template || '')
    .replaceAll('{user}', member.toString())
    .replaceAll('{username}', member.user.username)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{count}', String(member.guild.memberCount));
}

function safeReason(reason) {
  const cleaned = String(reason || 'No reason provided.')
    .replaceAll('@everyone', '@ everyone')
    .replaceAll('@here', '@ here');
  return truncate(cleaned, 500);
}

module.exports = {
  parseDuration,
  formatDuration,
  truncate,
  isModerator,
  hasPermission,
  canModerateTarget,
  containsLink,
  renderWelcome,
  safeReason
};
