import type { ReactNode } from "react";

export const Linking = {
  getInitialURL: async (): Promise<string | null> => null,
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};

export const AppState = {
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  currentState: "active",
};

/** Minimal pass-through components so node-based tests can render RN trees
 * (e.g. CrashBoundary) with react-test-renderer. */
function passthrough({ children }: { children?: ReactNode }): ReactNode {
  return children ?? null;
}

export const View = passthrough;
export const Text = passthrough;
export const Pressable = passthrough;
