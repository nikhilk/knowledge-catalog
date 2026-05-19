// Enrichment process
//

import * as adk from '@google/adk';
import { rootAgent } from './agent.js';

export interface EnrichOptions {
  path: string;
  configPath: string;
}

export async function enrichCommand(options: EnrichOptions) {
  const runner = new adk.InMemoryRunner({
    agent: rootAgent,
    appName: 'kcenrich',
  });

  const events = runner.runEphemeral({
    userId: 'cli-user',
    newMessage: {
      role: 'user',
      parts: [
        { text: options.path },
        { text: options.configPath },
      ],
    },
  });

  for await (const event of events) {
    const structuredEvents = adk.toStructuredEvents(event);
    for (const se of structuredEvents) {
      if (se.type === adk.EventType.THOUGHT) {
        if (se.content?.trim()) {
          console.log(`[Thought]: ${se.content.trim()}`);
        }
      }
      else if (se.type === adk.EventType.CONTENT) {
        if (se.content?.trim()) {
          console.log(`[Agent] ${se.content.trim()}`);
        }
      }
      else if (se.type === adk.EventType.TOOL_CALL) {
        console.log(`[Tool Invoke] ${se.call.name}\n${JSON.stringify(se.call.args || {})}`);
      }
      else if (se.type === adk.EventType.TOOL_RESULT) {
        console.log(`[Tool Result] ${se.result.name}\n${JSON.stringify(se.result.response || {})}`);
      }
    }
  }
}
