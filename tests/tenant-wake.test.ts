import { describe, it, expect } from "bun:test";
import {
  isBotScannerProbe,
  isSearchEngineCrawler,
} from "../src/lib/server/tenant-wake";

describe("Tenant Wake, Scanner Probes and Crawler Policy", () => {
  it("should identify bot vulnerability probes and scanner paths", () => {
    expect(isBotScannerProbe("/wp-login.php")).toBe(true);
    expect(isBotScannerProbe("/xmlrpc.php")).toBe(true);
    expect(isBotScannerProbe("/.env")).toBe(true);
    expect(isBotScannerProbe("/.git/config")).toBe(true);
    expect(isBotScannerProbe("/actuator/health")).toBe(true);
    expect(isBotScannerProbe("/setup.cgi")).toBe(true);
    expect(isBotScannerProbe("/index.php")).toBe(true);
    expect(isBotScannerProbe("/wp-includes/wlwmanifest.xml")).toBe(true);
    expect(isBotScannerProbe("/backup.bak")).toBe(true);
  });

  it("should allow legitimate website paths", () => {
    expect(isBotScannerProbe("/")).toBe(false);
    expect(isBotScannerProbe("/about")).toBe(false);
    expect(isBotScannerProbe("/products/ceramic-vase")).toBe(false);
    expect(isBotScannerProbe("/assets/styles-123.css")).toBe(false);
    expect(isBotScannerProbe("/assets/index-456.js")).toBe(false);
    expect(isBotScannerProbe("/favicon.ico")).toBe(false);
    expect(isBotScannerProbe("/api/contact")).toBe(false);
  });

  it("should recognize legitimate search engine crawlers", () => {
    expect(
      isSearchEngineCrawler(
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      ),
    ).toBe(true);
    expect(
      isSearchEngineCrawler(
        "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
      ),
    ).toBe(true);
    expect(
      isSearchEngineCrawler(
        "DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)",
      ),
    ).toBe(true);
    expect(
      isSearchEngineCrawler(
        "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
      ),
    ).toBe(true);
    expect(
      isSearchEngineCrawler(
        "Baiduspider+(+http://www.baidu.com/search/spider.htm)",
      ),
    ).toBe(true);
  });

  it("should distinguish regular human browser user agents from crawlers", () => {
    expect(
      isSearchEngineCrawler(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      ),
    ).toBe(false);
    expect(
      isSearchEngineCrawler(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      ),
    ).toBe(false);
    expect(
      isSearchEngineCrawler(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0",
      ),
    ).toBe(false);
  });
});
