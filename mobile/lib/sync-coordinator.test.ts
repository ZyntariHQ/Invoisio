/**
 * Regression tests for the sync coordinator's last-sync metadata handling.
 * Covers three states: never-synced (no metadata), valid metadata, and
 * malformed metadata — the last two previously produced `NaN`/`Invalid Date`
 * because the AsyncStorage read was not awaited.
 */

// Self-contained in-memory mock so the coordinator (and its deps) read/write
// a controllable store without native modules.
jest.mock("@react-native-async-storage/async-storage", () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn((key: string) => store.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        store.delete(key);
      }),
    },
  };
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuthStore } from "../hooks/use-auth-store";
import {
  syncCoordinator,
  parseLastSyncTimestamp,
  formatLastSyncTime,
  type SyncStatus,
} from "./sync-coordinator";

const LAST_SYNC_KEY = "@invoisio_last_sync";

describe("SyncCoordinator", () => {
  beforeEach(async () => {
    await AsyncStorage.removeItem(LAST_SYNC_KEY);
    await syncCoordinator.reset();
    await syncCoordinator.reloadLastSyncTime();
  });

  it("initializes with default status and tracks subscriptions", async () => {
    const initialStatus = syncCoordinator.getStatus();
    expect(initialStatus.isSyncing).toBe(false);
    expect(initialStatus.overallProgress).toBe(0);

    let statusUpdateCount = 0;
    const unsubscribe = syncCoordinator.subscribe((_status: SyncStatus) => {
      statusUpdateCount++;
    });

    await syncCoordinator.reset();
    // reset() notifies listeners, so the subscription must have fired.
    expect(statusUpdateCount).toBeGreaterThan(0);
    expect(typeof unsubscribe).toBe("function");
    unsubscribe();
  });

  describe("last-sync metadata: no-sync state", () => {
    it("reports null and formats to nothing when nothing has synced yet", async () => {
      await syncCoordinator.reloadLastSyncTime();
      expect(syncCoordinator.getStatus().lastSyncTime).toBeNull();
      expect(
        formatLastSyncTime(syncCoordinator.getStatus().lastSyncTime),
      ).toBeNull();
      expect(formatLastSyncTime(undefined)).toBeNull();
      expect(formatLastSyncTime(null)).toBeNull();
    });

    it("hides the dashboard label when there is no last-sync timestamp", () => {
      // Mirrors the dashboard guard: a null/undefined label is omitted, never
      // rendered as a date.
      expect(formatLastSyncTime(undefined)).toBeNull();
    });
  });

  describe("last-sync metadata: valid-sync state", () => {
    it("loads a persisted numeric epoch-ms timestamp", async () => {
      const ts = Date.now();
      await AsyncStorage.setItem(LAST_SYNC_KEY, String(ts));

      await syncCoordinator.reloadLastSyncTime();

      expect(syncCoordinator.getStatus().lastSyncTime).toBe(ts);
      const label = formatLastSyncTime(
        syncCoordinator.getStatus().lastSyncTime,
      );
      expect(label).not.toBeNull();
      expect(label).toMatch(/\d/);
    });

    it("loads a persisted ISO-8601 timestamp", async () => {
      const iso = new Date().toISOString();
      await AsyncStorage.setItem(LAST_SYNC_KEY, iso);

      await syncCoordinator.reloadLastSyncTime();

      expect(syncCoordinator.getStatus().lastSyncTime).toBe(Date.parse(iso));
    });

    it("surfaces a valid timestamp after a real sync pass (save keeps memory in sync)", async () => {
      useAuthStore.setState({ accessToken: "fake-access-token" });
      try {
        await syncCoordinator.triggerSync();

        const lastSyncTime = syncCoordinator.getStatus().lastSyncTime;
        expect(lastSyncTime).not.toBeNull();
        expect(Number.isFinite(lastSyncTime)).toBe(true);
        expect(lastSyncTime).toBeGreaterThan(0);
        // Persisted value matches the in-memory value.
        const persisted = await AsyncStorage.getItem(LAST_SYNC_KEY);
        expect(Number(persisted)).toBe(lastSyncTime);
      } finally {
        useAuthStore.setState({ accessToken: null });
      }
    });
  });

  describe("last-sync metadata: malformed-sync state", () => {
    it.each([
      "not-a-date",
      "123abc",
      "Infinity",
      "-100",
      "0",
      "   ",
      "{}",
      "null",
    ])(
      "treats raw=%p as never-synced instead of rendering nonsense",
      async (raw) => {
        await AsyncStorage.setItem(LAST_SYNC_KEY, raw);

        await syncCoordinator.reloadLastSyncTime();

        expect(syncCoordinator.getStatus().lastSyncTime).toBeNull();
        expect(
          formatLastSyncTime(syncCoordinator.getStatus().lastSyncTime),
        ).toBeNull();
      },
    );
  });

  describe("parseLastSyncTimestamp", () => {
    it("parses canonical numeric epoch-ms", () => {
      const ts = Date.now();
      expect(parseLastSyncTimestamp(String(ts))).toBe(ts);
    });

    it("parses ISO-8601 strings", () => {
      const iso = new Date().toISOString();
      expect(parseLastSyncTimestamp(iso)).toBe(Date.parse(iso));
    });

    it("rejects missing, empty, and malformed values", () => {
      expect(parseLastSyncTimestamp(null)).toBeNull();
      expect(parseLastSyncTimestamp(undefined)).toBeNull();
      expect(parseLastSyncTimestamp("")).toBeNull();
      expect(parseLastSyncTimestamp("   ")).toBeNull();
      expect(parseLastSyncTimestamp("not-a-date")).toBeNull();
      expect(parseLastSyncTimestamp("123abc")).toBeNull();
      expect(parseLastSyncTimestamp("Infinity")).toBeNull();
      expect(parseLastSyncTimestamp("-100")).toBeNull();
      expect(parseLastSyncTimestamp("0")).toBeNull();
    });
  });
});
