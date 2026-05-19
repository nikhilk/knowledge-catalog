import * as adk from '@google/adk';

// Define custom function tools
export const getAssetDetails = new adk.FunctionTool({
  name: 'getAssetDetails',
  description: 'Retrieves detailed information about a catalog asset, such as its current columns, description, and type.',
  parameters: {
    type: 'OBJECT' as any,
    properties: {
      assetName: {
        type: 'STRING' as any,
        description: 'The name or identifier of the asset.'
      }
    },
    required: ['assetName']
  },
  execute: async (input: any) => {
    const { assetName } = input;
    return {
      name: assetName,
      type: 'table',
      columns: ['id', 'name', 'created_at', 'status'],
      description: 'A system table storing user account statuses and registration details.',
      owner: 'data-platform-team',
    };
  }
});

export const searchDocumentation = new adk.FunctionTool({
  name: 'searchDocumentation',
  description: 'Searches the internal catalog wiki and documentation for a given query.',
  parameters: {
    type: 'OBJECT' as any,
    properties: {
      query: {
        type: 'STRING' as any,
        description: 'Search query to find relevant wiki/documentation pages.'
      }
    },
    required: ['query']
  },
  execute: async (input: any) => {
    const { query } = input;
    return {
      query,
      results: [
        {
          title: 'User Accounts Table Schema',
          content: 'Contains schema and ownership details for the user accounts table.'
        },
        {
          title: 'Catalog Documentation Guidelines',
          content: 'Standard operating procedures for documenting assets in the knowledge catalog.'
        }
      ]
    };
  }
});
