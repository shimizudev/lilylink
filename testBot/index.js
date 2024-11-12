const { Client, GatewayIntentBits } = require('discord.js');
const { LilyManager, Source } = require('../dist');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const manager = new LilyManager({
  nodes: [
    {
      host: 'lavalink.jirayu.net',
      port: 13592,
      password: 'youshallnotpass',
      secure: false,
      identifier: 'main',
    },
  ],
  sendPayload: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      guild.shard.send(JSON.parse(payload));
    }
  },
});

client.manager = manager;

client.on('ready', () => {
  client.manager.init(client.user.id);
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('raw', (d) => client.manager.packetUpdate(d));

manager.on('nodeReady', (node) => {
  console.log(`Node ${node.identifier} ready!`);
});

manager.on('nodeConnected', (node) => {
  console.log(`Node ${node.identifier} connected!`);
});

manager.on('nodeError', (node, error) => {
  console.log(`Node ${node.identifier} error: ${error.message}`);
});

manager.on('playerTriggeredPlay', (player, track) => {
  console.log(`Player ${player.guildId} triggered play: ${track.title}`);
});

manager.on('trackStart', (player, track) => {
  console.log(`Player ${player.guildId} started playing: ${track.title}`);
});

manager.on('trackEnd', (player, track) => {
  console.log(`Player ${player.guildId} finished playing: ${track.title}`);
});

manager.on('trackException', (player, _track, error) => {
  console.log(
    `Player ${player.guildId} encountered an error: ${error.message}`
  );
});

const players = manager.players;

client.on('messageCreate', async (message) => {
  if (message.author.bot) {
    return;
  }

  if (message.content.startsWith('!play')) {
    try {
      const track = message.content.split('!play')[1];
      const player = manager.createPlayer({
        voiceChannelId: message.member.voice.channelId,
        textChannelId: message.channel.id,
        autoPlay: true,
        guildId: message.guild.id,
      });

      console.log(track);

      if (!player.connected) {
        player.connect({ setDeaf: true });
      }

      const searchResult = await manager.search({
        query: track,
        source: Source.YOUTUBE,
      });

      player.setVolume(100);

      if (!searchResult.tracks.length) {
        return message.reply('No results found.');
      }

      player.queue.add(searchResult.tracks[0]);

      if (!player.playing) {
        player.play();
      }
      await message.reply(`Playing track: ${searchResult.tracks[0].title}`);
    } catch (error) {
      console.log(error);
    }
  }

  if (message.content.startsWith('!stop')) {
    const player = players.get(message.guild.id);
    if (player) {
      player.stop();
    }
  }
});

manager.on('trackStart', (player, track) => {
  const channel = client.channels.cache.get(player.channelId);
  if (channel) {
    channel.send(`Now playing: ${track.info.title}`);
  }
});

process.on('unhandledRejection', () => {});
process.on('uncaughtException', (_e) => {});

client.login(process.env.DISCORD_TOKEN);
