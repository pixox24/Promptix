import { jsonrepair } from 'jsonrepair';

function redact(value: string) {
  return value
    .replace(/(authorization|api[-_ ]?key|token|secret|password)\s*[:=]\s*[^\s,}\]]+/gi, '$1=[REDACTED]')
    .replace(/\b(?:sk|key)-[A-Za-z0-9_-]{12,}\b/g, '[REDACTED]');
}

export function outputDiagnostics(text: string | undefined) {
  if (!text) return {};
  const safe = redact(text);
  const configured = Number(process.env.INGEST_OUTPUT_PREVIEW_CHARS ?? 500);
  const limit = Number.isFinite(configured) ? Math.max(100, Math.min(500, configured)) : 500;
  return {
    outputLength: text.length,
    outputPreviewStart: safe.slice(0, limit),
    outputPreviewEnd: safe.slice(-limit),
  };
}

function extractBalancedObject(value: string) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (start < 0) {
      if (char !== '{') continue;
      start = index;
      depth = 1;
      continue;
    }
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return value.slice(start, index + 1);
    }
  }
  return start >= 0 ? value.slice(start) : value;
}

export function parseRepairableJson(text: string) {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  const candidate = extractBalancedObject(cleaned);
  try {
    return { value: JSON.parse(candidate) as unknown, repaired: candidate !== text.trim() };
  } catch {
    if (process.env.INGEST_STRUCTURE_REPAIR_ENABLED === 'false') throw new Error('Structured output repair is disabled');
    const repairedText = jsonrepair(candidate);
    return { value: JSON.parse(repairedText) as unknown, repaired: true };
  }
}
