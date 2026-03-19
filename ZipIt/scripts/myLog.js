/**
 * Simple logger for ZipIt scripts.
 * Kept inside `scripts/` because Bedrock module imports are scoped there.
 */
export function myLog(message, event = "ZipIt", warning = false) {
  const prefix = event ? `[${event}] ` : "";
  const text = `${prefix}${message}`;
  if (warning) console.warn(text);
  else console.info(text);
}

