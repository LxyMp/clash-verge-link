export interface RuntimeResponse {
  success?: boolean;
  error?: string;
}

interface FirefoxProxyValue {
  proxyType?: string;
  http?: string;
  httpProxyAll?: boolean;
  passthrough?: string;
}

const EXPECTED_PASSTHROUGH = new Set(['localhost', '127.0.0.1', '[::1]', '<local>']);

export function isSuccessfulResponse(value: unknown): value is RuntimeResponse & { success: true } {
  return typeof value === 'object' && value !== null && (value as RuntimeResponse).success === true;
}

function matchesEndpoint(endpoint: string | undefined, expectedPort: number): boolean {
  if (!endpoint) return false;

  try {
    const url = new URL(endpoint.includes('://') ? endpoint : `http://${endpoint}`);
    return url.hostname === '127.0.0.1' && Number(url.port) === expectedPort;
  } catch {
    return false;
  }
}

function matchesPassthrough(value: string | undefined): boolean {
  if (!value) return false;
  const entries = value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return (
    entries.length === EXPECTED_PASSTHROUGH.size &&
    entries.every((entry) => EXPECTED_PASSTHROUGH.has(entry))
  );
}

export function isOwnedProxyConfig(
  value: FirefoxProxyValue,
  expectedPort: number,
  levelOfControl: string | undefined,
): boolean {
  return (
    levelOfControl === 'controlled_by_this_extension' &&
    value.proxyType === 'manual' &&
    value.httpProxyAll === true &&
    matchesEndpoint(value.http, expectedPort) &&
    matchesPassthrough(value.passthrough)
  );
}
