import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { KnowledgeBase } from './kb.js';

async function handleToolCall(action: () => Promise<any>) {
  try {
    const result = await action();
    const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    return {
      content: [{ type: 'text' as const, text }],
    };
  }
  catch (error: any) {
    return {
      isError: true,
      content: [{ type: 'text' as const, text: error.message }],
    };
  }
}

export async function runServer(kb: KnowledgeBase) {
  const server = new McpServer({
    name: 'fileskb',
    version: '1.0.0',
  });

  server.registerTool('list_contents',
    {
      description: 'List the contents of a directory in the knowledge base.',
      inputSchema: {
        path: z.string().optional().default('')
               .describe('Optional relative path within the knowledge base to list.'),
      },
    },
    async ({ path: relativePath = '' }) => {
      return handleToolCall(() => kb.listContents(relativePath));
    }
  );

  server.registerTool('search_contents',
    {
      description: 'Search for a text query (regex supported) within markdown files.',
      inputSchema: {
        query: z.string().describe('The search string or regular expression.'),
        path: z.string().optional().default('')
               .describe('Optional relative path of the sub directory to search within.'),
      },
    },
    async ({ query, path: relativePath = '' }) => {
      return handleToolCall(() => kb.searchContents(query, relativePath));
    }
  );

  server.registerTool('read_file',
    {
      description: 'Read the contents of a file in the knowledge base.',
      inputSchema: {
        path: z.string().describe('Relative path to the file.'),
      },
    },
    async ({ path: relativePath }) => {
      return handleToolCall(() => kb.readFile(relativePath));
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
