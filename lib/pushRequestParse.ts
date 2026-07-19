import { pushServerError } from "@/lib/pushServerLog";

export type ParsedPushId =
  | { ok: true; value: string }
  | { ok: false; reason: string; typeofValue: string; preview: string | null };

function safePreview(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = String(value);
    return text.length > 64 ? `${text.slice(0, 64)}…` : text;
  }

  if (Array.isArray(value)) {
    return `Array(len=${value.length})`;
  }

  if (typeof value === "object") {
    return "Object";
  }

  return String(value).slice(0, 64);
}

/**
 * Accept string/number IDs; reject arrays, objects, null, undefined, empty.
 * Never calls .trim() on a non-string.
 */
export function parsePushIdField(value: unknown, fieldName: string): ParsedPushId {
  const typeofValue = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  const preview = safePreview(value);

  if (value === null || value === undefined) {
    return { ok: false, reason: `${fieldName} is null or undefined`, typeofValue, preview };
  }

  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    return {
      ok: false,
      reason: `${fieldName} must be a string or number`,
      typeofValue,
      preview,
    };
  }

  if (typeof value === "boolean") {
    return {
      ok: false,
      reason: `${fieldName} must be a string or number`,
      typeofValue,
      preview,
    };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { ok: false, reason: `${fieldName} is not a finite number`, typeofValue, preview };
    }
    const asString = String(value).trim();
    if (!asString) {
      return { ok: false, reason: `${fieldName} is empty after conversion`, typeofValue, preview };
    }
    return { ok: true, value: asString };
  }

  if (typeof value === "string") {
    const asString = value.trim();
    if (!asString) {
      return { ok: false, reason: `${fieldName} is empty`, typeofValue, preview };
    }
    return { ok: true, value: asString };
  }

  return {
    ok: false,
    reason: `${fieldName} must be a string or number`,
    typeofValue,
    preview,
  };
}

export function parseOptionalPushIdField(
  value: unknown,
  fieldName: string
): { present: false } | ParsedPushId {
  if (value === undefined || value === null || value === "") {
    return { present: false };
  }

  return parsePushIdField(value, fieldName);
}

export function logInvalidMessageId(value: unknown, parsed: Extract<ParsedPushId, { ok: false }>) {
  pushServerError("2", "invalid messageId", {
    typeofMessageId: parsed.typeofValue,
    preview: parsed.preview,
    reason: parsed.reason,
    rawTypeof: typeof value,
  });
}
