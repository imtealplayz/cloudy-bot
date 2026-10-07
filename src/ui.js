const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} = require('discord.js');
const config = require('./config');

function inline(value) {
  return String.fromCharCode(96) + String(value) + String.fromCharCode(96);
}

function button(label, customId, style = ButtonStyle.Secondary, disabled = false) {
  return new ButtonBuilder()
    .setLabel(label)
    .setCustomId(customId)
    .setStyle(style)
    .setDisabled(disabled);
}

function row(buttons) {
  return new ActionRowBuilder().addComponents(buttons);
}

function baseContainer(title, body, options = {}) {
  const container = new ContainerBuilder()
    .setAccentColor(options.accentColor || config.cloudyAccent);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('## ' + title)
  );
  container.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(true)
      .setSpacing(SeparatorSpacingSize.Small)
  );

  if (body) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(body)
    );
  }

  return container;
}

function card(title, body, buttons = [], options = {}) {
  const container = baseContainer(title, body, options);
  if (buttons.length) container.addActionRowComponents(row(buttons));

  return {
    flags: options.ephemeral
      ? MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      : MessageFlags.IsComponentsV2,
    components: [container]
  };
}

function multiRowCard(title, body, rows, options = {}) {
  const container = baseContainer(title, body, options);
  for (const buttons of rows) container.addActionRowComponents(row(buttons));

  return {
    flags: options.ephemeral
      ? MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
      : MessageFlags.IsComponentsV2,
    components: [container]
  };
}

function success(title, body, buttons = []) {
  return card(title, body, buttons);
}

function error(title, body) {
  return card(title, body, [], { ephemeral: true, accentColor: 0xe78b8b });
}

function info(title, body, buttons = []) {
  return card(title, body, buttons);
}

function ticketPanel() {
  return card(
    'Cloudy Tickets',
    'Need help? Open a private support ticket. Cloudy will create a dedicated channel for you and the configured support team.',
    [button('Open ticket', 'cloudy:ticket:open', ButtonStyle.Primary)]
  );
}

function ticketCard(channelName, ownerMention) {
  return card(
    'Cloudy Ticket',
    'Ticket: ' + inline(channelName) + '\nOwner: ' + ownerMention + '\n\nDescribe your issue here. A staff member can take over when available.',
    [button('Close ticket', 'cloudy:ticket:close', ButtonStyle.Danger)]
  );
}

function truthDareCard(prompt) {
  return card(
    'Truth or Dare',
    'Your prompt:\n\n' + prompt,
    [
      button('Truth', 'cloudy:td:truth', ButtonStyle.Primary),
      button('Dare', 'cloudy:td:dare', ButtonStyle.Secondary)
    ]
  );
}

function rpsCard(resultText) {
  return card(
    'Rock Paper Scissors',
    resultText + '\n\nChoose your move.',
    [
      button('Rock', 'cloudy:rps:rock', ButtonStyle.Primary),
      button('Paper', 'cloudy:rps:paper', ButtonStyle.Secondary),
      button('Scissors', 'cloudy:rps:scissors', ButtonStyle.Secondary)
    ]
  );
}

function tttCard(game) {
  const labels = game.board.map((cell) => cell || ' ');
  const rows = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8]
  ].map((indexes) =>
    indexes.map((index) =>
      button(
        labels[index],
        'cloudy:ttt:' + game.id + ':' + index,
        game.board[index] ? ButtonStyle.Secondary : ButtonStyle.Primary,
        Boolean(game.board[index]) || game.finished
      )
    )
  );

  const state = game.finished
    ? game.winner === 'X'
      ? 'You won.'
      : game.winner === 'O'
        ? 'Cloudy won.'
        : 'Draw game.'
    : 'Your turn. You are ' + inline('X') + '. Cloudy is ' + inline('O') + '.';

  return multiRowCard('Tic-Tac-Toe', state, rows);
}

module.exports = {
  inline,
  button,
  card,
  success,
  error,
  info,
  ticketPanel,
  ticketCard,
  truthDareCard,
  rpsCard,
  tttCard
};
