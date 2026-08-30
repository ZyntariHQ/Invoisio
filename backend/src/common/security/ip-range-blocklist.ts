import ipaddr from "ipaddr.js";
/**
 * Address ranges that must never be reachable via a merchant-controlled
 * webhook URL, expressed as CIDRs. This is defense-in-depth on top of
 * ipaddr.js's built-in `range()` classifier, which already catches most
 * of these but doesn't cover every reserved block we care about
 * (e.g. CGNAT, TEST-NET, benchmarking ranges).
 */
const EXTRA_BLOCKED_CIDRS_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["100.64.0.0", 10], // CGNAT (RFC 6598)
  ["127.0.0.0", 8], // loopback (also caught by ipaddr.js)
  ["169.254.0.0", 16], // link-local / cloud metadata (169.254.169.254)
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
  ["255.255.255.255", 32], // broadcast
];

const EXTRA_BLOCKED_CIDRS_V6: Array<[string, number]> = [
  ["::", 128], // unspecified
  ["::1", 128], // loopback
  ["64:ff9b::", 96], // NAT64 (can carry an embedded IPv4 private/loopback addr)
  ["100::", 64], // discard-only
  ["fc00::", 7], // unique local (ULA)
  ["fe80::", 10], // link-local
  ["ff00::", 8], // multicast
];

/**
 * ipaddr.js `range()` classifications that indicate a non-public, non-routable
 * address for our purposes. `unicast` (i.e. ordinary public) addresses are
 * allowed; everything else here is blocked.
 */
const BLOCKED_RANGE_LABELS = new Set([
  "unspecified",
  "broadcast",
  "multicast",
  "linkLocal",
  "loopback",
  "carrierGradeNat",
  "private",
  "reserved",
  "uniqueLocal",
  "ipv4Mapped",
  "rfc6145",
  "rfc6052",
  "6to4",
  "teredo",
  "benchmarking",
  "amt",
  "as112",
  "as112v6",
  "deprecated",
  "orchid2",
  "droneRemoteIdProtocolEntityTags",
]);

function isInExtraCidrList(
  addr: ipaddr.IPv4 | ipaddr.IPv6,
  list: Array<[string, number]>,
): boolean {
  for (const [network, bits] of list) {
    try {
      const parsedNetwork =
        addr.kind() === "ipv4"
          ? ipaddr.IPv4.parse(network)
          : ipaddr.IPv6.parse(network);
      if (addr.kind() !== (parsedNetwork as any).kind()) continue;
      if ((addr as any).match(parsedNetwork as any, bits)) {
        return true;
      }
    } catch {
      // Skip malformed entries rather than fail closed on our own bug.
      continue;
    }
  }
  return false;
}

/**
 * Returns true if the given literal IP address (v4 or v6) must be blocked
 * as an SSRF destination. This is the single source of truth used both at
 * write-time (best-effort DNS pre-check) and at request-time (mandatory,
 * pinned to the address actually connected to).
 */
export function isBlockedIpAddress(ipLiteral: string): boolean {
  let addr: ipaddr.IPv4 | ipaddr.IPv6;
  try {
    addr = ipaddr.parse(ipLiteral);
  } catch {
    // Not a parseable IP literal at all -> treat as unsafe.
    return true;
  }

  // Normalize IPv4-mapped IPv6 (::ffff:127.0.0.1) down to the v4 address
  // before classifying, so mapped loopback/private addresses can't be
  // used to bypass the v4 checks.
  if (addr.kind() === "ipv6" && (addr as ipaddr.IPv6).isIPv4MappedAddress()) {
    addr = (addr as ipaddr.IPv6).toIPv4Address();
  }

  const rangeLabel = addr.range();
  if (BLOCKED_RANGE_LABELS.has(rangeLabel)) {
    return true;
  }

  if (addr.kind() === "ipv4") {
    return isInExtraCidrList(addr, EXTRA_BLOCKED_CIDRS_V4);
  }

  return isInExtraCidrList(addr, EXTRA_BLOCKED_CIDRS_V6);
}

/**
 * True only for exact-match localhost hostnames/loopback literals, used by
 * the local-development escape hatch. Never used to decide anything other
 * than "is this the explicit, opted-in local case".
 */
export function isLoopbackLiteral(hostnameOrIp: string): boolean {
  const lowered = hostnameOrIp.toLowerCase();
  if (lowered === "localhost") return true;

  // Node's URL keeps brackets on IPv6 hostnames ("[::1]").
  // ipaddr.js expects the bare form ("::1").
  const bare = lowered.replace(/^\[|\]$/g, "").split("%")[0]; // also drop zone id

  try {
    const addr = ipaddr.parse(bare);
    return addr.range() === "loopback";
  } catch {
    return false;
  }
}
