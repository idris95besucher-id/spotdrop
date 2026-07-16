/** Postgres / PostgREST error shape for logging — never masked to generic. */
export function describeSupabaseError(error: unknown) {
  const e = error as {
    code?: string;
    message?: string;
    details?: string;
    hint?: string;
  } | null;

  return {
    code: e?.code ?? null,
    message: e?.message ?? (error instanceof Error ? error.message : String(error)),
    details: e?.details ?? null,
    hint: e?.hint ?? null,
  };
}

export function isMissingColumnError(error: { code?: string } | null) {
  return error?.code === "42703" || error?.code === "PGRST204";
}

export function isMissingTableError(error: { code?: string; message?: string } | null) {
  if (!error) {
    return false;
  }

  if (error.code === "42P01" || error.code === "PGRST205") {
    return true;
  }

  const message = error.message?.toLowerCase() ?? "";

  return (
    message.includes("could not find the table") ||
    message.includes("relation") && message.includes("does not exist")
  );
}

export function isMissingSchemaError(error: { code?: string; message?: string } | null) {
  return isMissingColumnError(error) || isMissingTableError(error);
}

export function formatSupabaseErrorMessage(error: unknown) {
  const described = describeSupabaseError(error);
  const parts = [described.message];

  if (described.code) {
    parts.push(`code=${described.code}`);
  }

  if (described.details) {
    parts.push(`details=${described.details}`);
  }

  if (described.hint) {
    parts.push(`hint=${described.hint}`);
  }

  return parts.join(" | ");
}
