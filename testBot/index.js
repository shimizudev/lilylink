/**
 * Example Discord.js bot using LilyLink
 * This bot demonstrates basic music playback functionality using LilyLink
 *
 * Features:
 * - Play music from YouTube
 * - Queue system with playlist support
 * - Basic playback controls (play, pause, resume, skip, stop)
 * - Queue management (shuffle, loop track/queue)
 * - Now playing notifications with embeds
 * - Error handling and permissions checking
 *
 * @requires dotenv - For loading environment variables
 * @requires discord.js - Discord bot framework
 * @requires LilyLink - Lavalink client library
 */

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType,
} = require('discord.js');
const { LilyManager, Source, LoadType, PlayerLoop } = require('../dist');

/**
 * Bot configuration
 * @type {Object}
 * @property {string} prefix - Command prefix
 * @property {Array<Object>} nodes - Lavalink nodes configuration
 */
const config = {
  prefix: '!',
  nodes: [
    {
      host: 'lavalink.jirayu.net',
      port: 13592,
      password: 'youshallnotpass',
      secure: false,
      identifier: 'main',
    },
  ],
};

/**
 * Formats duration in milliseconds to human readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration string (HH:MM:SS or MM:SS)
 */
const formatDuration = (ms) => {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor(ms / (1000 * 60 * 60));

  return `${hours ? `${hours}:` : ''}${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

/**
 * Checks if user has required permissions for music commands
 * @param {import("discord.js").Message} message - Discord message object
 * @throws {Error} If user is not in voice channel or bot lacks permissions
 */
const checkPermissions = (message) => {
  if (!message.member.voice.channel) {
    throw new Error('You must be in a voice channel to use this command!');
  }

  if (
    !message.guild.members.me?.permissions.has('Connect') ||
    !message.guild.members.me?.permissions.has('Speak')
  ) {
    throw new Error(
      'I need permissions to join and speak in your voice channel!'
    );
  }
};

// Initialize Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// Initialize LilyLink manager
const manager = new LilyManager({
  nodes: config.nodes,
  sendPayload: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      guild.shard.send(JSON.parse(payload));
    }
  },
});

client.manager = manager;

// Client event handlers
client.on('ready', () => {
  client.manager.init(client.user.id);
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setActivity('!help for commands', {
    type: ActivityType.Listening,
  });
});

client.on('raw', (d) => client.manager.packetUpdate(d));

// Lavalink node event handlers
manager.on('nodeReady', (node) => {
  console.log(`Node ${node.identifier} ready!`);
});

manager.on('nodeConnected', (node) => {
  console.log(`Node ${node.identifier} connected!`);
});

manager.on('nodeError', (node, error) => {
  console.error(`Node ${node.identifier} error:`, error);
});

// Player event handlers
manager.on('trackStart', (player, track) => {
  const channel = client.channels.cache.get(player.textChannelId);
  if (channel) {
    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('Now Playing')
      .setDescription(`[${track?.title}](${track?.url})`)
      .addFields(
        {
          name: 'Duration',
          value: formatDuration(track?.duration),
          inline: true,
        },
        {
          name: 'Requested by',
          value: track?.requestedBy?.globalName,
          inline: true,
        }
      );
    channel.send({ embeds: [embed] });
  }
});

manager.on('trackException', (player, _track, error) => {
  const channel = client.channels.cache.get(player.textChannelId);
  if (channel) {
    channel.send(`❌ Error: ${error.message}`);
  }
});

manager.on('queueEnd', (player) => {
  const channel = client.channels.cache.get(player.textChannelId);
  if (channel) {
    channel.send('Queue ended! Use !play to add more songs.');
    player.destroy();
  }
});

/**
 * Command handlers for music playback and queue management
 * @type {Object.<string, Function>}
 */
const commands = {
  async play(message, args) {
    try {
      checkPermissions(message);

      if (!args.length) {
        throw new Error('Please provide a song to play!');
      }

      const query = args.join(' ');
      const player = manager.createPlayer({
        guildId: message.guild.id,
        voiceChannelId: message.member.voice.channelId,
        textChannelId: message.channel.id,
        autoPlay: true,
      });

      if (!player.connected) {
        await player.connect({ setDeaf: true });
      }

      const result = await manager.search({
        query,
        source: Source.YOUTUBE,
        requester: message.author,
      });

      if (!result.tracks.length) {
        throw new Error('No results found!');
      }

      if (result.loadType === LoadType.Playlist) {
        for (const track of result.tracks) {
          player.queue.add(track);
        }
        if (player.playing) {
          message.reply(`Added to queue: ${result.playlistInfo.name}`);
        } else {
          await player.play();
          message.reply(`Playing: ${result.playlistInfo.name}`);
        }
      } else {
        player.queue.add(result.tracks[0]);
        if (player.playing) {
          message.reply(`Added to queue: ${result.tracks[0].title}`);
        } else {
          await player.play();
          message.reply(`Playing: ${result.tracks[0].title}`);
        }
      }
    } catch (error) {
      message.reply(`❌ Error: ${error.message}`);
    }
  },

  async skip(message) {
    try {
      checkPermissions(message);
      const player = manager.players.get(message.guild.id);

      if (!player) {
        throw new Error('No music is playing!');
      }

      await player.skip();
      message.reply('⏭️ Skipped to the next song!');
    } catch (error) {
      message.reply(`❌ Error: ${error.message}`);
    }
  },

  async shuffle(message) {
    try {
      checkPermissions(message);
      const player = manager.players.get(message.guild.id);

      if (!player) {
        throw new Error('No music is playing!');
      }

      player.queue.shuffle();
      message.reply('🔀 Shuffled the queue!');
    } catch (error) {
      message.reply(`❌ Error: ${error.message}`);
    }
  },

  async stop(message) {
    try {
      checkPermissions(message);
      const player = manager.players.get(message.guild.id);

      if (!player) {
        throw new Error('No music is playing!');
      }

      player.destroy();
      message.reply('⏹️ Stopped the music and cleared the queue!');
    } catch (error) {
      message.reply(`❌ Error: ${error.message}`);
    }
  },

  async pause(message) {
    try {
      checkPermissions(message);
      const player = manager.players.get(message.guild.id);

      if (!player) {
        throw new Error('No music is playing!');
      }

      if (player.paused) {
        return message.reply('⏸️ Already paused!');
      }

      await player.pause(true);
      message.reply('⏸️ Paused!');
    } catch (error) {
      message.reply(`❌ Error: ${error.message}`);
    }
  },

  async resume(message) {
    try {
      checkPermissions(message);
      const player = manager.players.get(message.guild.id);

      if (!player) {
        throw new Error('No music is playing!');
      }

      if (!player.paused) {
        return message.reply('▶️ Already playing!');
      }

      await player.resume();
      message.reply('▶️ Resumed!');
    } catch (error) {
      message.reply(`❌ Error: ${error.message}`);
    }
  },

  async loop(message, args) {
    try {
      checkPermissions(message);
      const player = manager.players.get(message.guild.id);

      if (!player) {
        throw new Error('No music is playing!');
      }

      if (!args.length || !['track', 'queue'].includes(args[0].toLowerCase())) {
        throw new Error('Please specify either "track" or "queue" to loop!');
      }

      const mode = args[0].toLowerCase();

      if (mode === 'track') {
        player.loop =
          player.loop === PlayerLoop.TRACK ? PlayerLoop.NONE : PlayerLoop.TRACK;
        message.reply(
          player.loop === PlayerLoop.TRACK
            ? '🔂 Track loop enabled!'
            : '➡️ Track loop disabled!'
        );
      } else {
        player.loop =
          player.loop === PlayerLoop.QUEUE ? PlayerLoop.NONE : PlayerLoop.QUEUE;
        message.reply(
          player.loop === PlayerLoop.QUEUE
            ? '🔁 Queue loop enabled!'
            : '➡️ Queue loop disabled!'
        );
      }
    } catch (error) {
      message.reply(`❌ Error: ${error.message}`);
    }
  },

  async queue(message) {
    try {
      const player = manager.players.get(message.guild.id);

      if (!player) {
        throw new Error('No music is playing!');
      }

      const queue = player.queue;
      const currentTrack = queue.current;

      const embed = new EmbedBuilder()
        .setTitle('Music Queue')
        .setColor('#0099ff');

      if (currentTrack) {
        embed.addFields({
          name: 'Now Playing',
          value: `[${currentTrack.title}](${currentTrack.uri}) [${formatDuration(currentTrack.duration)}]`,
        });
      }

      if (queue.length) {
        const tracks = queue
          .map(
            (track, i) =>
              `${i + 1}. [${track.title}](${track.uri}) [${formatDuration(track.duration)}]`
          )
          .join('\n');

        embed.addFields({
          name: 'Up Next',
          value: tracks.slice(0, 1024),
        });
      }

      message.reply({ embeds: [embed] });
    } catch (error) {
      message.reply(`❌ Error: ${error.message}`);
    }
  },

  help(message) {
    const embed = new EmbedBuilder()
      .setTitle('Bot Commands')
      .setColor('#0099ff')
      .addFields([
        { name: '!play <song>', value: 'Play a song or add it to queue' },
        { name: '!skip', value: 'Skip the current song' },
        { name: '!stop', value: 'Stop playing and clear the queue' },
        { name: '!pause', value: 'Pause the current song' },
        { name: '!resume', value: 'Resume the current song' },
        { name: '!queue', value: 'Show the current queue' },
        { name: '!loop track/queue', value: 'Toggle track or queue loop' },
      ]);

    message.reply({ embeds: [embed] });
  },
};

// Message handler for commands
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith(config.prefix)) {
    return;
  }

  const [commandName, ...args] = message.content
    .slice(config.prefix.length)
    .trim()
    .split(/\s+/);

  const command = commands[commandName];
  if (command) {
    try {
      await command(message, args);
    } catch (error) {
      console.error('Command error:', error);
      message.reply('An error occurred while executing the command.');
    }
  }
});

// Global error handlers
process.on('unhandledRejection', (error) => {
  console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});

// Start the bot
client.login(process.env.DISCORD_TOKEN);
