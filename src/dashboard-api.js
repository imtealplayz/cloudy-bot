const http = require('node:http');
const crypto = require('node:crypto');
const store = require('./store');

function authMatches(request) {
  const expected = process.env.DASHBOARD_API_KEY;
  const received = request.headers['x-dashboard-key'];

  if (!expected || !received || typeof received !== 'string') return false;

  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function json(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');

    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) {
        request.destroy();
        reject(new Error('Request body is too large.'));
      }
    });

    request.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Request body must contain valid JSON.'));
      }
    });

    request.on('error', reject);
  });
}

function resourcesForGuild(guild) {
  return {
    channels: guild.channels.cache
      .filter((channel) => channel.isTextBased() || channel.type === 4)
      .map((channel) => ({
        id: channel.id,
        name: channel.name,
        type: channel.type,
        parentId: channel.parentId || null
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    roles: guild.roles.cache
      .filter((role) => !role.managed)
      .map((role) => ({
        id: role.id,
        name: role.name,
        position: role.position,
        color: role.hexColor
      }))
      .sort((a, b) => b.position - a.position)
  };
}

function safeGuildData(guildId) {
  return store.guild(guildId);
}

function startDashboardApi(client, actions) {
  const port = Number(process.env.DASHBOARD_API_PORT || process.env.PORT || 3000);
  const host = process.env.DASHBOARD_API_HOST || '0.0.0.0';

  const server = http.createServer(async (request, response) => {
    try {
      if (request.method === 'OPTIONS') {
        response.writeHead(204, {
          'Access-Control-Allow-Origin': process.env.DASHBOARD_ORIGIN || '*',
          'Access-Control-Allow-Headers': 'content-type, x-dashboard-key',
          'Access-Control-Allow-Methods': 'GET, PATCH, PUT, OPTIONS'
        });
        response.end();
        return;
      }

      if (!authMatches(request)) {
        json(response, 401, { error: 'Unauthorized.' });
        return;
      }

      const url = new URL(request.url, 'http://' + request.headers.host);
      const parts = url.pathname.split('/').filter(Boolean);

      if (request.method === 'GET' && url.pathname === '/api/health') {
        json(response, 200, {
          ok: true,
          bot: client.user ? {
            id: client.user.id,
            tag: client.user.tag,
            ready: client.isReady()
          } : {
            id: null,
            tag: null,
            ready: false
          },
          guildCount: client.guilds.cache.size
        });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/guilds') {
        json(response, 200, {
          guilds: client.guilds.cache.map((guild) => ({
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL({ size: 128, extension: 'png' }) || null,
            memberCount: guild.memberCount
          }))
        });
        return;
      }

      if (parts[0] !== 'api' || parts[1] !== 'guilds' || !parts[2]) {
        json(response, 404, { error: 'Not found.' });
        return;
      }

      const guildId = parts[2];
      const guild = client.guilds.cache.get(guildId);

      if (!guild) {
        json(response, 404, { error: 'Cloudy is not in this server.' });
        return;
      }

      if (request.method === 'GET' && parts.length === 3) {
        json(response, 200, {
          guild: {
            id: guild.id,
            name: guild.name,
            icon: guild.iconURL({ size: 256, extension: 'png' }) || null,
            memberCount: guild.memberCount
          },
          settings: safeGuildData(guildId),
          resources: resourcesForGuild(guild),
          bot: {
            ready: client.isReady(),
            tag: client.user?.tag || null
          }
        });
        return;
      }

      if (request.method === 'PATCH' && parts.length === 3) {
        const body = await readJson(request);
        const current = store.guild(guildId);

        if (body.prefix !== undefined) {
          if (typeof body.prefix !== 'string' || !/^\S{1,5}$/.test(body.prefix)) {
            json(response, 400, { error: 'Prefix must be 1 to 5 non-space characters.' });
            return;
          }
          current.prefix = body.prefix;
        }

        if (body.welcome !== undefined) {
          if (!body.welcome || typeof body.welcome !== 'object') {
            json(response, 400, { error: 'Welcome configuration is invalid.' });
            return;
          }
          if (body.welcome.channelId !== undefined) current.welcome.channelId = body.welcome.channelId || null;
          if (body.welcome.message !== undefined) current.welcome.message = String(body.welcome.message).slice(0, 1500);
        }

        if (body.logsChannelId !== undefined) current.logsChannelId = body.logsChannelId || null;

        if (body.ticket !== undefined) {
          const ticket = body.ticket || {};
          current.ticket.panelChannelId = ticket.panelChannelId ?? current.ticket.panelChannelId;
          current.ticket.panelMessageId = ticket.panelMessageId ?? current.ticket.panelMessageId;
          current.ticket.categoryId = ticket.categoryId ?? current.ticket.categoryId;
          current.ticket.supportRoleId = ticket.supportRoleId ?? current.ticket.supportRoleId;
        }

        if (body.security !== undefined) {
          const security = body.security || {};
          for (const key of ['antiSpam', 'antiRaid', 'antiLink']) {
            if (security[key] !== undefined) current.security[key] = Boolean(security[key]);
          }
          if (security.spamLimit !== undefined) current.security.spamLimit = Math.max(3, Math.min(20, Number(security.spamLimit)));
          if (security.spamWindowMs !== undefined) current.security.spamWindowMs = Math.max(3000, Math.min(30000, Number(security.spamWindowMs)));
          if (security.raidJoins !== undefined) current.security.raidJoins = Math.max(3, Math.min(50, Number(security.raidJoins)));
          if (security.raidWindowMs !== undefined) current.security.raidWindowMs = Math.max(5000, Math.min(60000, Number(security.raidWindowMs)));
        }

        if (body.automod?.enabled !== undefined) {
          await actions.configureNativeAutoMod(guild, Boolean(body.automod.enabled));
        }

        store.flush();

        json(response, 200, {
          ok: true,
          settings: safeGuildData(guildId)
        });
        return;
      }

      if (request.method === 'PUT' && parts.length === 4 && parts[3] === 'data') {
        const body = await readJson(request);

        if (!body || typeof body !== 'object' || Array.isArray(body)) {
          json(response, 400, { error: 'Guild data must be a JSON object.' });
          return;
        }

        const existing = store.guild(guildId);
        const merged = {
          ...existing,
          ...body,
          warnings: body.warnings && typeof body.warnings === 'object' ? body.warnings : existing.warnings,
          history: Array.isArray(body.history) ? body.history.slice(-1000) : existing.history,
          stats: body.stats && typeof body.stats === 'object' ? body.stats : existing.stats,
          tickets: body.tickets && typeof body.tickets === 'object' ? body.tickets : existing.tickets,
          security: body.security && typeof body.security === 'object' ? body.security : existing.security,
          welcome: body.welcome && typeof body.welcome === 'object' ? body.welcome : existing.welcome,
          ticket: body.ticket && typeof body.ticket === 'object' ? body.ticket : existing.ticket,
          automod: body.automod && typeof body.automod === 'object' ? body.automod : existing.automod
        };

        if (typeof merged.prefix !== 'string' || !/^\S{1,5}$/.test(merged.prefix)) {
          json(response, 400, { error: 'Invalid prefix in guild data.' });
          return;
        }

        store.replaceGuild(guildId, merged);
        json(response, 200, { ok: true, settings: safeGuildData(guildId) });
        return;
      }

      json(response, 405, { error: 'Method not allowed.' });
    } catch (error) {
      console.error('Cloudy dashboard API error:', error);
      json(response, 500, { error: error.message || 'Internal server error.' });
    }
  });

  server.listen(port, host, () => {
    console.log('Cloudy dashboard API listening on ' + host + ':' + port + '.');
  });

  return server;
}

module.exports = { startDashboardApi };
