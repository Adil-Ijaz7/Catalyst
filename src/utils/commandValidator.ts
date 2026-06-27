const DISALLOWED_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bdel\s+\/f\b/i,
  /\bformat\b/i,
  /\bmkfs\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bpoweroff\b/i,
  /\bcurl\b.+\|\s*(bash|sh|powershell|pwsh)\b/i,
  />\s*\/dev\//i
];

export function validateTerminalCommand(command: string): { valid: boolean; reason?: string } {
  const trimmed = command.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Command cannot be empty.' };
  }

  if (trimmed.length > 500) {
    return { valid: false, reason: 'Command is too long.' };
  }

  for (const pattern of DISALLOWED_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { valid: false, reason: `Command blocked by security policy: ${trimmed}` };
    }
  }

  return { valid: true };
}
