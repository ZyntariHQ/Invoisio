import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Text, View } from "react-native";
import type { InvoiceLiveStatus } from "../hooks/use-invoice-live";

const STATUS_META: Record<
  InvoiceLiveStatus,
  { label: string; dot: string; text: string }
> = {
  live: { label: "Live", dot: "#34d399", text: "text-emerald-300" },
  connecting: { label: "Connecting…", dot: "#7dd3fc", text: "text-sky-300" },
  reconnecting: {
    label: "Reconnecting…",
    dot: "#fbbf24",
    text: "text-amber-300",
  },
  offline: {
    label: "Offline · cached",
    dot: "#94a3b8",
    text: "text-slate-400",
  },
  unavailable: {
    label: "Live updates unavailable",
    dot: "#f87171",
    text: "text-red-300",
  },
};

function formatRelativeTime(updatedAt: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${String(seconds)}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;
  const hours = Math.round(minutes / 60);
  return `${String(hours)}h ago`;
}

export function InvoiceLiveStatusBadge({
  status,
  updatedAt,
}: {
  status: InvoiceLiveStatus;
  updatedAt?: number;
}) {
  const [now, setNow] = useState(() => Date.now());
  const meta = STATUS_META[status];
  const prevStatusRef = useRef(status);

  useEffect(() => {
    if (updatedAt === undefined) return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 5000);
    return () => {
      clearInterval(interval);
    };
  }, [updatedAt]);

  // Announce meaningful status transitions (e.g. connection lost) to
  // screen readers instead of relying on colour alone.
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;
      AccessibilityInfo.announceForAccessibility(meta.label);
    }
  }, [status, meta.label]);

  const liveText =
    meta.label +
    (updatedAt !== undefined
      ? ` · Updated ${formatRelativeTime(updatedAt, now)}`
      : "");

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={liveText}
      accessibilityLiveRegion="polite"
      className="flex-row items-center gap-2"
    >
      <View
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: meta.dot }}
      />
      <Text
        className={meta.text}
        style={{ fontFamily: "SpaceGrotesk_500Medium", fontSize: 12 }}
      >
        {liveText}
      </Text>
    </View>
  );
}
