import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { albumTools } from './albums.js';
import { playTools } from './play.js';
import { readTools } from './read.js';
import { SpotifyHandlerExtra } from './types.js';

const server = new McpServer({
  name: 'spotify-controller',
  version: '1.0.0',
});

[...readTools, ...playTools, ...albumTools].forEach((tool) => {
  server.tool(tool.name, tool.description, tool.schema, async (args: any, extra: SpotifyHandlerExtra) => {
    const result = await tool.handler(args, extra);
    return {
      content: result.content.map(item => ({
        ...item,
        type: "text" as const
      }))
    };
  });
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
