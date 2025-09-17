import type { MaxInt } from '@spotify/web-api-ts-sdk';
import { z } from 'zod';
import type { SpotifyHandlerExtra, SpotifyTrack, tool } from './types.js';
import { formatDuration, handleSpotifyRequest } from './utils.js';

function isTrack(item: any): item is SpotifyTrack {
  return (
    item &&
    item.type === 'track' &&
    Array.isArray(item.artists) &&
    item.album &&
    typeof item.album.name === 'string'
  );
}

const searchSpotify: tool<{
  query: z.ZodString;
  type: z.ZodEnum<['track', 'album', 'artist', 'playlist']>;
  limit: z.ZodOptional<z.ZodNumber>;
}> = {
  name: 'searchSpotify',
  description: 'Search for tracks, albums, artists, or playlists on Spotify',
  schema: {
    query: z.string().describe('The search query'),
    type: z
      .enum(['track', 'album', 'artist', 'playlist'])
      .describe(
        'The type of item to search for either track, album, artist, or playlist',
      ),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of results to return (10-50)'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { query, type, limit } = args;
    const limitValue = limit ?? 10;

    try {
      const results = await handleSpotifyRequest(async (spotifyApi) => {
        return await spotifyApi.search(
          query,
          [type],
          undefined,
          limitValue as MaxInt<50>,
        );
      });

      let content: Array<{ type: 'text'; text: string }> = [];

      if (type === 'track' && results.tracks) {
        content = results.tracks.items.map((track) => ({
          type: 'text',
          text: `"${track.name}" by ${track.artists.map((a) => a.name).join(', ')} (${formatDuration(track.duration_ms)}) - ID: ${track.id}`,
        }));
      } else if (type === 'album' && results.albums) {
        content = results.albums.items.map((album) => ({
          type: 'text',
          text: `"${album.name}" by ${album.artists.map((a) => a.name).join(', ')} - ID: ${album.id}`,
        }));
      } else if (type === 'artist' && results.artists) {
        content = results.artists.items.map((artist) => ({
          type: 'text',
          text: `${artist.name} - ID: ${artist.id}`,
        }));
      } else if (type === 'playlist' && results.playlists) {
        content = results.playlists.items.map((playlist) => ({
          type: 'text',
          text: `"${playlist?.name ?? 'Unknown Playlist'} (${playlist?.description ?? 'No description'
            } tracks)" by ${playlist?.owner?.display_name} - ID: ${playlist?.id
            }`,
        }));
      }

      return { content };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error searching for ${type}s: ${error instanceof Error ? error.message : String(error)
              }`,
          },
        ],
      };
    }
  },
};

const getNowPlaying: tool<Record<string, never>> = {
  name: 'getNowPlaying',
  description: 'Get information about the currently playing track on Spotify',
  schema: {},
  handler: async (_args, _extra: SpotifyHandlerExtra) => {
    try {
      const currentTrack = await handleSpotifyRequest(async (spotifyApi) => {
        return await spotifyApi.player.getCurrentlyPlayingTrack();
      });

      if (!currentTrack?.item) {
        return {
          content: [
            {
              type: 'text',
              text: 'Nothing is currently playing on Spotify',
            },
          ],
        };
      }

      const item = currentTrack.item;

      if (!isTrack(item)) {
        return {
          content: [
            {
              type: 'text',
              text: 'Currently playing item is not a track (might be a podcast episode)',
            },
          ],
        };
      }

      const artists = item.artists.map((a) => a.name).join(', ');
      const album = item.album.name;
      const duration = formatDuration(item.duration_ms);
      const progress = formatDuration(currentTrack.progress_ms || 0);
      const isPlaying = currentTrack.is_playing;

      return {
        content: [
          {
            type: 'text',
            text:
              `# Currently ${isPlaying ? 'Playing' : 'Paused'}\n\n` +
              `**Track**: "${item.name}"\n` +
              `**Artist**: ${artists}\n` +
              `**Album**: ${album}\n` +
              `**Progress**: ${progress} / ${duration}\n` +
              `**ID**: ${item.id}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error getting current track: ${error instanceof Error ? error.message : String(error)
              }`,
          },
        ],
      };
    }
  },
};

const getMyPlaylists: tool<{
  limit: z.ZodOptional<z.ZodNumber>;
}> = {
  name: 'getMyPlaylists',
  description: "Get a list of the current user's playlists on Spotify",
  schema: {
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of playlists to return (1-50)'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { limit = 50 } = args;

    const playlists = await handleSpotifyRequest(async (spotifyApi) => {
      return await spotifyApi.currentUser.playlists.playlists(
        limit as MaxInt<50>,
      );
    });

    if (playlists.items.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: "You don't have any playlists on Spotify",
          },
        ],
      };
    }

    const formattedPlaylists = playlists.items
      .map((playlist, i) => {
        const tracksTotal = playlist.tracks?.total ? playlist.tracks.total : 0;
        return `${i + 1}. "${playlist.name}" (${tracksTotal} tracks) - ID: ${playlist.id
          }`;
      })
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `# Your Spotify Playlists\n\n${formattedPlaylists}`,
        },
      ],
    };
  },
};

const getPlaylistTracks: tool<{
  playlistId: z.ZodString;
  limit: z.ZodOptional<z.ZodNumber>;
  offset: z.ZodOptional<z.ZodNumber>;
}> = {
  name: 'getPlaylistTracks',
  description: 'Get a list of tracks in a Spotify playlist',
  schema: {
    playlistId: z.string().describe('The Spotify ID of the playlist'),
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of tracks to return (1-50)'),
    offset: z
      .number()
      .min(0)
      .optional()
      .describe('Offset for pagination (0-based index)'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { playlistId, limit = 50, offset = 0 } = args;

    const playlistTracks = await handleSpotifyRequest(async (spotifyApi) => {
      return await spotifyApi.playlists.getPlaylistItems(
        playlistId,
        undefined,
        undefined,
        limit as MaxInt<50>,
        offset,
      );
    });

    if ((playlistTracks.items?.length ?? 0) === 0) {
      return {
        content: [
          {
            type: 'text',
            text: "This playlist doesn't have any tracks",
          },
        ],
      };
    }

    const formattedTracks = playlistTracks.items
      .map((item, i) => {
        const { track } = item;
        if (!track) return `${offset + i + 1}. [Removed track]`;

        if (isTrack(track)) {
          const artists = track.artists.map((a) => a.name).join(', ');
          const duration = formatDuration(track.duration_ms);
          return `${offset + i + 1}. "${track.name}" by ${artists} (${duration}) - ID: ${track.id}`;
        }

        return `${offset + i + 1}. Unknown item`;
      })
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `# Tracks in Playlist (${offset + 1}-${offset + playlistTracks.items.length} of ${playlistTracks.total})\n\n${formattedTracks}`,
        },
      ],
    };
  },
};

const getRecentlyPlayed: tool<{
  limit: z.ZodOptional<z.ZodNumber>;
}> = {
  name: 'getRecentlyPlayed',
  description: 'Get a list of recently played tracks on Spotify',
  schema: {
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of tracks to return (1-50)'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { limit = 50 } = args;

    const history = await handleSpotifyRequest(async (spotifyApi) => {
      return await spotifyApi.player.getRecentlyPlayedTracks(
        limit as MaxInt<50>,
      );
    });

    if (history.items.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: "You don't have any recently played tracks on Spotify",
          },
        ],
      };
    }

    const formattedHistory = history.items
      .map((item, i) => {
        const track = item.track;
        if (!track) return `${i + 1}. [Removed track]`;

        if (isTrack(track)) {
          const artists = track.artists.map((a) => a.name).join(', ');
          const duration = formatDuration(track.duration_ms);
          return `${i + 1}. "${track.name}" by ${artists} (${duration}) - ID: ${track.id}`;
        }

        return `${i + 1}. Unknown item`;
      })
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `# Recently Played Tracks\n\n${formattedHistory}`,
        },
      ],
    };
  },
};

const getUsersSavedTracks: tool<{
  limit: z.ZodOptional<z.ZodNumber>;
  offset: z.ZodOptional<z.ZodNumber>;
}> = {
  name: 'getUsersSavedTracks',
  description:
    'Get a list of tracks saved in the user\'s "Liked Songs" library',
  schema: {
    limit: z
      .number()
      .min(1)
      .max(50)
      .optional()
      .describe('Maximum number of tracks to return (1-50)'),
    offset: z
      .number()
      .min(0)
      .optional()
      .describe('Offset for pagination (0-based index)'),
  },
  handler: async (args, _extra: SpotifyHandlerExtra) => {
    const { limit = 50, offset = 0 } = args;

    const savedTracks = await handleSpotifyRequest(async (spotifyApi) => {
      return await spotifyApi.currentUser.tracks.savedTracks(
        limit as MaxInt<50>,
        offset,
      );
    });

    if (savedTracks.items.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: "You don't have any saved tracks in your Liked Songs",
          },
        ],
      };
    }

    const formattedTracks = savedTracks.items
      .map((item, i) => {
        const track = item.track;
        if (!track) return `${i + 1}. [Removed track]`;

        if (isTrack(track)) {
          const artists = track.artists.map((a) => a.name).join(', ');
          const duration = formatDuration(track.duration_ms);
          const addedDate = new Date(item.added_at).toLocaleDateString();
          return `${offset + i + 1}. "${track.name}" by ${artists} (${duration}) - ID: ${track.id} - Added: ${addedDate}`;
        }

        return `${i + 1}. Unknown item`;
      })
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `# Your Liked Songs (${offset + 1}-${offset + savedTracks.items.length} of ${savedTracks.total})\n\n${formattedTracks}`,
        },
      ],
    };
  },
};

export const readTools = [
  searchSpotify,
  getNowPlaying,
  getMyPlaylists,
  getPlaylistTracks,
  getRecentlyPlayed,
  getUsersSavedTracks,
  // New: list available playback devices for selection
  {
    name: 'listDevices',
    description:
      'List available Spotify playback devices (ID, name, type, volume, active)',
    schema: {},
    handler: async (_args: any, _extra: SpotifyHandlerExtra) => {
      try {
        const devicesResponse = await handleSpotifyRequest(async (spotifyApi) => {
          return await spotifyApi.player.getAvailableDevices();
        });

        const devices = devicesResponse?.devices ?? [];

        if (devices.length === 0) {
          return {
            content: [
              {
                type: 'text',
                text:
                  'No available Spotify devices found. Open Spotify on a device and try again.',
              },
            ],
          };
        }

        const formatted = devices
          .map((d, i) => {
            const parts: string[] = [];
            parts.push(`${i + 1}. ${d.name ?? 'Unknown Device'}`);
            parts.push(`Type: ${d.type ?? 'unknown'}`);
            parts.push(`Active: ${d.is_active ? 'Yes' : 'No'}`);
            if (typeof d.volume_percent === 'number') {
              parts.push(`Volume: ${d.volume_percent}%`);
            }
            parts.push(`ID: ${d.id ?? 'N/A'}`);
            return parts.join(' | ');
          })
          .join('\n');

        const active = devices.find((d) => d.is_active);
        const hint =
          '\n\nTip: pass the chosen device\'s ID to tools like playMusic, pausePlayback, or resumePlayback via the deviceId parameter.';

        return {
          content: [
            {
              type: 'text',
              text:
                `# Available Spotify Devices` +
                (active ? `\n\nActive device: ${active.name} (ID: ${active.id})` : '') +
                `\n\n${formatted}` +
                hint,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: `Error listing devices: ${error instanceof Error ? error.message : String(error)
                }`,
            },
          ],
        };
      }
    },
  },
];
