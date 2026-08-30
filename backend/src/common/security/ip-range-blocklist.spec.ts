import { isBlockedIpAddress, isLoopbackLiteral } from "./ip-range-blocklist";

describe("isBlockedIpAddress", () => {
  it.each([
    ["loopback IPv4", "127.0.0.1"],
    ["loopback IPv4 alt", "127.5.5.5"],
    ["loopback IPv6", "::1"],
    ["private 10/8", "10.0.0.5"],
    ["private 172.16/12", "172.16.5.1"],
    ["private 172.31/12 upper bound", "172.31.255.254"],
    ["private 192.168/16", "192.168.1.10"],
    ["link-local", "169.254.1.1"],
    ["cloud metadata", "169.254.169.254"],
    ["unique local IPv6", "fc00::1"],
    ["unique local IPv6 fd", "fd12:3456:789a::1"],
    ["link-local IPv6", "fe80::1"],
    ["unspecified IPv4", "0.0.0.0"],
    ["unspecified in 0/8", "0.1.2.3"],
    ["CGNAT", "100.64.0.1"],
    ["broadcast", "255.255.255.255"],
    ["multicast IPv4", "224.0.0.1"],
    ["multicast IPv6", "ff02::1"],
    ["reserved 240/4", "240.0.0.1"],
    ["TEST-NET-1", "192.0.2.55"],
    ["IPv4-mapped IPv6 loopback", "::ffff:127.0.0.1"],
    ["IPv4-mapped IPv6 private", "::ffff:10.1.1.1"],
  ])("blocks %s (%s)", (_label, ip) => {
    expect(isBlockedIpAddress(ip)).toBe(true);
  });

  it.each([
    ["public IPv4", "93.184.216.34"], // example.com-ish public range
    ["public Google DNS", "8.8.8.8"],
    ["public IPv6", "2606:4700:4700::1111"], // Cloudflare DNS
  ])("allows %s (%s)", (_label, ip) => {
    expect(isBlockedIpAddress(ip)).toBe(false);
  });

  it("fails closed on unparseable input", () => {
    expect(isBlockedIpAddress("not-an-ip")).toBe(true);
  });
});

describe("isLoopbackLiteral", () => {
  it("recognizes localhost and loopback IPs", () => {
    expect(isLoopbackLiteral("localhost")).toBe(true);
    expect(isLoopbackLiteral("127.0.0.1")).toBe(true);
    expect(isLoopbackLiteral("::1")).toBe(true);
  });

  it("does not treat other private ranges as the localhost escape hatch", () => {
    expect(isLoopbackLiteral("10.0.0.1")).toBe(false);
    expect(isLoopbackLiteral("169.254.169.254")).toBe(false);
  });
});
