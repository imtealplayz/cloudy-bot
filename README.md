# Cloudy Bot

Cloudy is a modular Discord bot focused on moderation, server security, support tickets, and small interactive games.

The project is written in CommonJS JavaScript with `discord.js` and a small atomic JSON datastore. There is no external database required for the default setup.

## Design rules

Cloudy follows these UI rules throughout the project:

- No emojis in bot output.
- Discord's native Components V2 divider is used in Cloudy cards.
- Interactive controls stay in the same Cloudy card/container as the content they control.
- Important command names, values, identifiers, and states are visually distinguished with inline code formatting.
- The visual style uses a light cloud-blue accent and short, clean copy.

Cloudy uses Discord Components V2 containers for its card UI. Discord does not allow traditional message `embeds` to be combined with Components V2, so these containers are the intentional embed-style surface for the bot.

## Features

### Server management

| Feature | Status |
| --- | --- |
| Welcome messages | Included |
| Ticket system | Included |
| Moderation logs | Included |
| Moderation history | Included |
| Moderation stats | Included |
| Discord native AutoMod | Included |
| Anti-spam | Included |
| Anti-raid | Included |
| Anti-link / invite protection | Included |
| Purge / clear | Included |

### Moderation

- Warnings with persistent warning IDs.
- Warning deactivation with `unwarn`.
- `kick`.
- `ban`.
- Temporary ban with automatic unban after restart-safe expiry tracking.
- `timeout`.
- `mute` as a timeout alias.
- Permission and role-hierarchy checks before destructive actions.
- Staff and Cloudy are protected from normal target selection.
- Automatic actions are written to moderation history.

### Games

- `Truth or Dare` with in-card buttons.
- `Rock Paper Scissors` against Cloudy.
- `Tic-Tac-Toe` against Cloudy with a real interactive board.

## Requirements

- Node.js `24.17.0` or newer.
- A Discord application with a bot user.
- A server where you can configure roles, channels, and bot permissions.
- The `Message Content Intent`.
- The `Server Members Intent`.

The current dependency is pinned to `discord.js 14.27.0`.

## Discord bot permissions

Grant Cloudy only the permissions it needs.

Recommended permissions:

- View Channels
- Send Messages
- Read Message History
- Manage Channels
- Manage Messages
- Manage Guild
- Kick Members
- Ban Members
- Moderate Members

Cloudy does not require `Administrator`.

The Cloudy role must be above members it needs to moderate. Discord hierarchy still applies even when the bot has the correct permission bit.

For tickets, `Manage Channels` is required.

For native AutoMod management, Cloudy needs permission to manage the server's AutoMod rules.

## Installation

Clone the repository and install dependencies:

~~~bash
npm install
~~~

Create the environment file:

~~~bash
cp .env.example .env
~~~

Fill in:

~~~text
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_application_id
DEPLOY_GUILD_ID=optional_test_server_id
DATABASE_FILE=./data/cloudy.json
~~~

`DEPLOY_GUILD_ID` is optional.

When it is set, `npm run deploy` registers slash commands in that one guild, which is convenient for development.

When it is omitted, commands are registered globally.

Start Cloudy:

~~~bash
npm start
~~~

For development with automatic restarts:

~~~bash
npm run dev
~~~

Deploy slash commands:

~~~bash
npm run deploy
~~~

Run the local syntax check:

~~~bash
npm run check
~~~

## Command reference

### General

`/ping`

Checks Cloudy's WebSocket latency.

`/help`

Shows Cloudy's main command groups.

### Prefix

The default prefix is `?`.

Change it with:

`/prefix set prefix:<new-prefix>`

Example:

~~~text
/prefix set prefix:!
~~~

This changes the prefix used by prefix commands only. Slash commands continue to use `/`.

### Welcome

`/welcome setup`

Arguments:

- `channel` — text channel where welcomes are sent.
- `message` — welcome template.

Supported placeholders:

- `{user}` — mentions the new member.
- `{username}` — username.
- `{server}` — server name.
- `{count}` — current member count.

Example:

~~~text
/welcome setup channel:#welcome message:Welcome {user} to {server}. You are member #{count}.
~~~

Disable with:

`/welcome disable`

### Logs

`/logs set channel:<channel>`

Stores a central Cloudy log channel for moderation, tickets, security events, and AutoMod executions.

Disable with:

`/logs disable`

### Tickets

`/ticket setup`

Arguments:

- `channel` — where the public ticket panel is posted.
- `category` — optional category for new ticket channels.
- `support_role` — optional role that can see every Cloudy ticket.

The panel contains an `Open ticket` button.

Each ticket is a private text channel containing an in-card `Close ticket` button.

Close permissions are limited to the ticket owner or staff that Cloudy recognizes.

Disable with:

`/ticket disable`

Running setup again removes the old configured panel message before posting the replacement.

### Security

Anti-spam:

`/security antispam enabled:<true|false>`

Optional settings:

- `limit` — messages allowed in the rolling window.
- `window` — rolling window in seconds.

Defaults:

- `6 messages`
- `8 seconds`

Triggering anti-spam causes the message to be deleted and, when hierarchy permits, applies a `30s` timeout.

Anti-raid:

`/security antiraid enabled:<true|false>`

Optional settings:

- `joins` — joins required to trigger raid mode.
- `window` — join window in seconds.

Defaults:

- `6 joins`
- `10 seconds`

When raid mode triggers, Cloudy temporarily restricts new joins with a short timeout and keeps the protection active for five minutes.

Anti-link:

`/security antilink enabled:<true|false>`

Cloudy deletes ordinary HTTP/HTTPS links, `www` links, Discord invite links, and Discord invite URLs posted by non-staff members.

### Native AutoMod

Enable:

`/automod enable`

Disable:

`/automod disable`

Cloudy creates three native Discord AutoMod rules:

1. Generic spam.
2. Mention spam with mention-raid protection.
3. Discord's profanity, sexual-content, and slur keyword presets.

If a logs channel is configured, AutoMod alert actions are also routed there.

Cloudy cleans up previously stored Cloudy AutoMod rules before rebuilding them, including after restarts.

## Moderation commands

All destructive actions perform both permission checks and hierarchy checks.

### Warn

`/mod warn user:<member> reason:<reason>`

Prefix:

~~~text
?warn @user reason
~~~

### View warnings

`/mod warnings user:<member>`

Prefix:

~~~text
?warnings @user
~~~

### Remove a warning

`/mod unwarn user:<member> warning_id:<id>`

Prefix:

~~~text
?unwarn @user warning-id
~~~

### Kick

`/mod kick user:<member> reason:<reason>`

Prefix:

~~~text
?kick @user reason
~~~

### Permanent ban

`/mod ban user:<member> reason:<reason>`

Prefix:

~~~text
?ban @user reason
~~~

### Temporary ban

`/mod tempban user:<member> duration:<duration> reason:<reason>`

Prefix:

~~~text
?tempban @user 2h reason
~~~

Supported duration syntax:

- `10s`
- `10m`
- `2h`
- `3d`
- `1w`

Cloudy stores temporary bans on disk and checks them after restarts.

Temporary bans currently have a maximum duration of `30d`.

### Timeout

`/mod timeout user:<member> duration:<duration> reason:<reason>`

Prefix:

~~~text
?timeout @user 30m reason
~~~

Discord limits native timeout duration to four weeks; Cloudy validates against that limit.

### Mute

`/mod mute user:<member> duration:<duration> reason:<reason>`

`mute` is an alias for `timeout`.

Prefix:

~~~text
?mute @user 30m reason
~~~

### Purge

`/mod purge amount:<1-100>`

Prefix:

~~~text
?purge 50
~~~

For normal bulk cleanup, Cloudy uses Discord bulk deletion.

A one-message purge uses an individual delete so it does not rely on the bulk-delete endpoint.

### Moderation history

`/mod history user:<member>`

Optional `limit` can show up to `15` records.

Prefix:

~~~text
?history @user
~~~

### Moderation stats

`/mod stats`

Shows the moderation actions recorded for the invoking moderator.

`/mod stats user:<moderator>`

Shows another moderator's statistics.

Prefix:

~~~text
?stats
?stats @moderator
~~~

## Prefix game commands

The slash game commands are:

- `/games truthordare`
- `/games rps`
- `/games tictactoe`

The prefix alternatives are:

~~~text
?truth
?dare
?rps
?tictactoe
~~~

Game interactions use the same Cloudy in-card button convention as the ticket system.

## Data storage

Cloudy stores server configuration and moderation data in:

~~~text
data/cloudy.json
~~~

The file is intentionally ignored by Git.

The store keeps:

- Per-guild prefix.
- Welcome configuration.
- Log channel.
- Ticket configuration.
- Security thresholds.
- AutoMod rule IDs.
- Warnings.
- Moderation history.
- Moderation statistics.
- Open and closed ticket records.
- Temporary punishment expiration records.

Writes use a temporary file followed by an atomic rename, reducing the chance of leaving a half-written JSON database after a process failure.

This datastore is suitable for a small-to-medium single-process bot. A horizontally scaled deployment should replace it with a real database and a shared locking strategy.

## Security notes

Never commit `.env`.

Never paste a bot token into the repository, README, issue tracker, or public chat.

Cloudy does not need the `Administrator` permission.

Native AutoMod is implemented through Discord's AutoMod API rather than by pretending to be a local text filter. Cloudy's anti-spam, anti-raid, and anti-link layers complement the native rules with event-driven bot logic.

Because anti-link and anti-spam inspect message content, the `Message Content Intent` must be enabled both in the Discord Developer Portal and in the client intents used by the bot.

Because welcome and anti-raid logic depend on member events, enable the `Server Members Intent`.

## Project layout

~~~text
cloudy-bot/
├── src/
│   ├── commands.js
│   ├── config.js
│   ├── index.js
│   ├── store.js
│   ├── ui.js
│   └── utils.js
├── .env.example
├── .gitignore
├── deploy-commands.js
├── package.json
└── README.md
~~~

### File responsibilities

`src/index.js`

Bot startup, event listeners, moderation execution, security listeners, AutoMod configuration, tickets, games, and prefix parsing.

`src/commands.js`

Slash-command builders and their argument definitions.

`src/ui.js`

Cloudy's Components V2 card system, native dividers, button styling, and game/ticket panels.

`src/store.js`

Persistent JSON storage and moderation record management.

`src/utils.js`

Duration parsing, formatting, permission helpers, target hierarchy checks, link detection, and welcome-template rendering.

`src/config.js`

Environment variables and Cloudy visual/runtime defaults.

`deploy-commands.js`

Registers the slash commands with Discord.

## CI

The repository includes a GitHub Actions workflow that installs dependencies and runs `npm run check` on pushes and pull requests.

That gives the project a basic syntax gate before deployment.

## Development principles

When adding new Cloudy features:

- Keep destructive actions behind explicit Discord permissions.
- Always check member hierarchy before moderation.
- Avoid `Administrator` requirements.
- Keep controls in the same Cloudy card as the content they operate on.
- Use the native Discord divider rather than manually drawing divider text.
- Do not add decorative emojis to bot output.
- Use inline code formatting for values users need to identify or copy.
- Keep configuration persistent and restart-safe where practical.

## Cloudy Dashboard API

Cloudy exposes a small authenticated HTTP API for the Vercel dashboard in imtealplayz/cloudy-dashboard.

Add these environment variables to the bot host:

    DASHBOARD_API_KEY=long_random_shared_secret
    DASHBOARD_ORIGIN=https://YOUR-DOMAIN.vercel.app

The API binds to DASHBOARD_API_PORT when that variable is set. Otherwise it uses the hosting provider's PORT, which is the recommended setup for Railway and similar hosts.

Do not put DISCORD_TOKEN or DASHBOARD_API_KEY in the dashboard frontend.

The dashboard uses Discord OAuth2 to confirm the signed-in user has Manage Server or Administrator, then its server-side API routes call Cloudy's dashboard API with the shared key.

The Cloudy dashboard API reads and writes the existing data/cloudy.json store, so no separate database is required for the dashboard itself.

### Vercel connection variables

In the dashboard project, configure:

    DISCORD_CLIENT_ID=your_application_client_id
    DISCORD_CLIENT_SECRET=your_application_client_secret
    DISCORD_REDIRECT_URI=https://YOUR-DOMAIN.vercel.app/api/auth/callback
    SESSION_SECRET=long_random_secret_at_least_32_characters
    CLOUDY_BOT_API_URL=https://YOUR-CLOUDY-BOT-HOST
    CLOUDY_BOT_API_KEY=the_same_value_as_DASHBOARD_API_KEY

The Discord OAuth callback URL must be added to the application's OAuth2 redirect URI list.

### Persistent storage

Cloudy still stores configuration and moderation records in JSON. The bot host must provide persistent disk storage for those records to survive restarts. The dashboard does not change that requirement.

