export type TransportSecurityInput = {
  nodeEnv?: string;
  pathname: string;
  forwardedProto?: string | string[];
  encrypted?: boolean;
};

function firstForwardedProtocol(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(",")[0]?.trim().toLowerCase() ?? "";
}

export function isAllowedRequestTransport(input: TransportSecurityInput): boolean {
  if (input.nodeEnv !== "production") return true;
  if (input.pathname === "/health") return true;
  if (input.encrypted) return true;
  return firstForwardedProtocol(input.forwardedProto) === "https";
}
