import type {ModelMessage} from 'ai';

// Context is read afresh on every request. Keeping old copies both bloats a
// conversation and gives the model conflicting snapshots of the workspace.
export function withoutContextReads(messages: ModelMessage[]): ModelMessage[] {
  return messages.flatMap(message => {
    if (!Array.isArray(message.content)) return [message];
    const content = message.content.filter(part => !('toolName' in part && part.toolName === 'read_context'));
    return content.length ? [{...message, content} as ModelMessage] : [];
  });
}

// Trim whole completed turns, never one half of a tool call/result pair.
export function requestMessages(history: ModelMessage[][], turn: ModelMessage[], context: unknown): ModelMessage[] {
  const turns = [...history, turn];
  const budget = Math.max(12000, 170000 - JSON.stringify(context).length);
  while (turns.length > 1 && (turns.flat().length > 40 || JSON.stringify(turns.flat()).length > budget)) turns.shift();
  return turns.flat();
}
