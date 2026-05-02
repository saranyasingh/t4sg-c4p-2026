import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

function toolUseIdsFromContent(content: unknown[]): string[] {
  return (content as any[])
    .filter((b) => b && typeof b === "object" && b.type === "tool_use")
    .map((b) => String(b.id ?? ""))
    .filter(Boolean);
}

function toolResultIdsFromContent(content: unknown[]): Set<string> {
  const s = new Set<string>();
  for (const b of content as any[]) {
    if (b && typeof b === "object" && b.type === "tool_result" && b.tool_use_id) {
      s.add(String(b.tool_use_id));
    }
  }
  return s;
}

function isToolResultOnlyUserMessage(msg: any): boolean {
  return (
    msg &&
    msg.role === "user" &&
    Array.isArray(msg.content) &&
    msg.content.length > 0 &&
    msg.content.every((b: any) => b && typeof b === "object" && b.type === "tool_result")
  );
}

/**
 * Anthropic requires every assistant message that contains tool_use blocks to be
 * followed immediately by a user message whose content includes matching tool_result
 * blocks for every tool_use id. Repair histories where that pairing broke (partial
 * results, missing results, wrong role, orphaned tool_result batches, etc.).
 */
export function sanitizeInteractiveTutorialMessages(messages: MessageParam[]): MessageParam[] {
  const out: MessageParam[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i] as any;
    if (!msg) {
      i += 1;
      continue;
    }

    if (msg.role === "assistant" && Array.isArray(msg.content)) {
      const toolUses = msg.content.filter(
        (b: any) => b && typeof b === "object" && b.type === "tool_use",
      );
      if (!toolUses.length) {
        out.push(messages[i]!);
        i += 1;
        continue;
      }

      const ids = toolUseIdsFromContent(msg.content);
      const next = messages[i + 1] as any;
      const nextBlocks: any[] =
        next && next.role === "user" && Array.isArray(next.content) ? next.content : [];
      const resultIds = toolResultIdsFromContent(nextBlocks);

      const nextIsImmediateUser = Boolean(next && next.role === "user");
      const hasAllResults = ids.length > 0 && ids.every((id) => resultIds.has(id));

      if (hasAllResults && nextIsImmediateUser) {
        out.push(messages[i]!);
        out.push(messages[i + 1]!);
        i += 2;
        continue;
      }

      // Drop malformed assistant tool turn; drop orphan tool_result-only user message if present.
      i += 1;
      if (isToolResultOnlyUserMessage(next)) {
        i += 1;
      }
      continue;
    }

    // Drop tool_result-only user messages that don't follow an assistant turn with matching tool_use ids.
    if (isToolResultOnlyUserMessage(msg)) {
      const last = out[out.length - 1] as any;
      const needIds =
        last?.role === "assistant" && Array.isArray(last.content)
          ? toolUseIdsFromContent(last.content)
          : [];
      const got = toolResultIdsFromContent(msg.content);
      const okPair = needIds.length > 0 && needIds.every((id) => got.has(id));
      if (!okPair) {
        i += 1;
        continue;
      }
    }

    out.push(messages[i]!);
    i += 1;
  }

  return out;
}

/** Run sanitizer until stable (covers chained corruption). */
export function sanitizeInteractiveTutorialMessagesDeep(
  messages: MessageParam[],
  maxPasses = 8,
): MessageParam[] {
  let cur = messages;
  for (let p = 0; p < maxPasses; p += 1) {
    const next = sanitizeInteractiveTutorialMessages(cur);
    if (next.length === cur.length) {
      let identical = true;
      for (let k = 0; k < next.length; k++) {
        if (next[k] !== cur[k]) {
          identical = false;
          break;
        }
      }
      if (identical) break;
    }
    cur = next;
  }
  return cur;
}

/** Detect Anthropic invalid_request_error text for tool_use / tool_result pairing. */
export function isInteractiveTutorialToolPairingError(message: string): boolean {
  const m = message.toLowerCase();
  if (!m.includes("tool_use") || !m.includes("tool_result")) return false;
  return (
    m.includes("corresponding") ||
    m.includes("immediately after") ||
    m.includes("must have") ||
    m.includes("without") ||
    m.includes("ids were found")
  );
}

/** Prefer SDK status; fall back to leading "400" in error message (Anthropic SDK pattern). */
export function anthropicClientErrorStatus(err: unknown): number | undefined {
  if (err && typeof err === "object" && "status" in err) {
    const s = (err as { status: unknown }).status;
    if (typeof s === "number" && s >= 400 && s < 500) return s;
  }
  if (err instanceof Error) {
    const m = /^(\d{3})\b/.exec(err.message.trim());
    if (m) {
      const n = Number.parseInt(m[1], 10);
      if (n >= 400 && n < 500) return n;
    }
  }
  return undefined;
}
