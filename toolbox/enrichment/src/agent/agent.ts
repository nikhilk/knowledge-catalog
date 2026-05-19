// Agent implementation
//

import * as adk from '@google/adk';
import * as kcmd from 'kcmd';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { getAssetDetails, searchDocumentation } from './tools.js';


function expandEnvVars(str: string): string {
  return str.replace(/\$(\w+)|\${(\w+)}/g, (_, m1, m2) => {
    const varName = m1 || m2;
    return process.env[varName] || '';
  });
}

export async function loadMcpTools(configPath: string): Promise<adk.MCPToolset[]> {
  const mcpConfigPath = path.join(configPath, 'mcp.json');
  try {
    const content = await fs.promises.readFile(mcpConfigPath, 'utf-8');
    const config = JSON.parse(content);
    const toolsets: adk.MCPToolset[] = [];
    const mcpServers = config.mcpServers || {};

    for (const [name, serverConfig] of Object.entries(mcpServers) as [string, any][]) {
      if (serverConfig.command) {
        const command = expandEnvVars(serverConfig.command);
        const args = (serverConfig.args || []).map((arg: string) => expandEnvVars(arg));
        const env = serverConfig.env ? Object.fromEntries(
          Object.entries(serverConfig.env).map(([k, v]) => [k, expandEnvVars(String(v))])
        ) : undefined;
        const timeout = typeof serverConfig.timeout === 'number' ? serverConfig.timeout : undefined;

        toolsets.push(
          new adk.MCPToolset({
            type: 'StdioConnectionParams',
            serverParams: {
              command,
              args,
              env,
            },
            timeout,
          })
        );
      }
      else if (serverConfig.httpUrl) {
        const url = expandEnvVars(serverConfig.httpUrl);
        const timeout = typeof serverConfig.timeout === 'number' ? serverConfig.timeout : undefined;

        toolsets.push(
          new adk.MCPToolset({
            type: 'StreamableHTTPConnectionParams',
            url,
            timeout,
          })
        );
      }
    }
    return toolsets;
  }
  catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.warn(`Warning: Failed to load/parse mcp.json: ${error.message}`);
    }
    return [];
  }
}

export async function loadSkills(configPath: string): Promise<adk.SkillToolset | null> {
  const skillsBasePath = path.join(configPath, 'skills');
  try {
    const stats = await fs.promises.stat(skillsBasePath);
    if (!stats.isDirectory()) {
      return null;
    }

    const skillsMap = await adk.loadAllSkillsInDir(skillsBasePath);
    if (Object.keys(skillsMap).length === 0) {
      return null;
    }

    return new adk.SkillToolset(skillsMap, {
      codeExecutor: new adk.UnsafeLocalCodeExecutor()
    });
  }
  catch (error: any) {
    if (error.code !== 'ENOENT') {
      console.warn(`Warning: Failed to load skills: ${error.message}`);
    }
    return null;
  }
}

export async function createWorker(ctx: kcmd.gcp.ApiContext, configPath: string): Promise<adk.Agent> {
  let instruction = 'Build documentation for the referenced asset. Do not ask clarifying questions.';
  const tools: any[] = [getAssetDetails, searchDocumentation];

  // Load custom instruction
  const instructionsPath = path.join(configPath, 'instructions.md');
  if (fs.statSync(instructionsPath).isFile()) {
    try {
      let customInstructions = await fs.promises.readFile(instructionsPath, 'utf-8');
      customInstructions = customInstructions.trim();
      instruction = 'Build documentation for the referenced asset.\n\n' + customInstructions;
    }
    catch (error: any) {
      if (error.code !== 'ENOENT') {
        console.warn(`Warning: Failed to load instructions.md: ${error.message}`);
      }
    }
  }

  // Load MCP tools
  const mcpToolsets = await loadMcpTools(configPath);
  tools.push(...mcpToolsets);

  // Load custom skills
  const skillsToolset = await loadSkills(configPath);
  if (skillsToolset) {
    tools.push(skillsToolset);
  }

  return new adk.Agent({
    name: 'kcenrich-worker',
    description: 'Enriches an entry in the catalog.',
    instruction,
    tools,
    model: new adk.Gemini({
      model: 'gemini-2.5-pro',
      vertexai: true,
      project: ctx.project,
      location: ctx.location,
    }),
    generateContentConfig: {
      thinkingConfig: {
        includeThoughts: true,
        thinkingBudget: -1,
      },
    },
  });
}

async function validDir(dirPath: string | undefined, label: string): Promise<string> {
  const varName = `AGENT_${label.toUpperCase()}_PATH`;
  dirPath = dirPath ?? process.env[varName];
  if (dirPath) {
    const stat = await fs.promises.stat(dirPath);
    if (stat.isDirectory()) {
      return dirPath;
    }
  }

  throw new Error(`Error: Invalid ${label} path. '${dirPath}' is not a directory.`);
}

class EnrichmentAgent extends adk.BaseAgent {
  constructor() {
    super({
      name: 'kcenrich',
      description: 'Enriches entries in the catalog.',
    });
  }

  private async *runEnrichment(context: adk.InvocationContext,
                               mode: 'async' | 'live'): AsyncGenerator<adk.Event, void, void> {
    const catalogPath = await validDir(context.userContent?.parts?.[0]?.text, 'catalog');
    const configPath = await validDir(context.userContent?.parts?.[1]?.text, 'config');

    const apiContext = kcmd.gcp.ApiContext.default();
    const catalog = await kcmd.CatalogSnapshot.fromPath(catalogPath, apiContext);

    const entries = await catalog.listEntries();
    for (const entry of entries) {
      console.log(`Processing: ${entry}`);

      const inputEvent = adk.createEvent({
        invocationId: context.invocationId,
        author: 'user',
        branch: context.branch,
        content: {
          role: 'user',
          parts: [{ text: entry }],
        },
      });
      yield inputEvent;

      const worker = await createWorker(apiContext, configPath);

      const InvocationContextClass = context.constructor as any;
      const subContext = new InvocationContextClass({
        ...context,
        agent: worker,
        userContent: {
          role: 'user',
          parts: [{ text: entry }],
        },
      });

      const events = mode === 'live' ? worker.runLive(subContext) : worker.runAsync(subContext);
      for await (const event of events) {
        yield event;
      }
    }
  }

  protected async *runAsyncImpl(context: adk.InvocationContext): AsyncGenerator<adk.Event, void, void> {
    yield* this.runEnrichment(context, 'async');
  }

  protected async *runLiveImpl(context: adk.InvocationContext): AsyncGenerator<adk.Event, void, void> {
    yield* this.runEnrichment(context, 'live');
  }
}

export const rootAgent = new EnrichmentAgent();
