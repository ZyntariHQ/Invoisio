/* eslint-disable @typescript-eslint/no-deprecated,
  @typescript-eslint/no-unsafe-assignment -- react-test-renderer is deprecated
  in React 19 but remains the only renderer available in this node-based jest
  setup, and its prop matchers are untyped. */
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import type { ReactElement, ReactNode } from "react";
import { Text } from "react-native";
import {
  CrashBoundary,
  RecoverableBoundary,
  withScreenBoundary,
} from "./CrashBoundary";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

const originalConsoleError = console.error.bind(console);

function renderWithAct(node: ReactElement): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(node);
  });
  return tree;
}

beforeEach(() => {
  shouldThrow = true;
  mockReplace.mockClear();
  // Filter react-test-renderer's React 19 deprecation noise so it does not
  // pollute the console during the run.
  jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const first = typeof args[0] === "string" ? args[0] : "";
    if (first.includes("react-test-renderer is deprecated")) {
      return;
    }
    originalConsoleError(...args);
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function ThrowingScreen(): ReactNode {
  throw new Error("boom");
}

let shouldThrow = true;
function FlakyScreen(): ReactNode {
  if (shouldThrow) {
    throw new Error("transient failure");
  }
  return <Text testID="recovered-screen">Recovered</Text>;
}

function GoodScreen(): ReactNode {
  return <Text testID="good-screen">All good</Text>;
}

describe("CrashBoundary", () => {
  it("renders children normally when nothing throws", () => {
    const tree = renderWithAct(
      <CrashBoundary>
        <GoodScreen />
      </CrashBoundary>,
    );
    expect(tree.root.findByProps({ testID: "good-screen" })).toBeTruthy();
  });

  it("renders the fallback when a screen throws instead of dying", () => {
    const onError = jest.fn();
    const tree = renderWithAct(
      <CrashBoundary onError={onError} label="screen:test">
        <ThrowingScreen />
      </CrashBoundary>,
    );

    expect(tree.root.findByProps({ testID: "crash-fallback" })).toBeTruthy();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });

  it("reports through the default pipeline with boundary context", () => {
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    try {
      act(() => {
        create(
          <CrashBoundary label="screen:scan">
            <ThrowingScreen />
          </CrashBoundary>,
        );
      });
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[error-report]"),
        expect.anything(),
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("recovers to a usable screen when the user continues", () => {
    const onRecover = jest.fn();
    const tree = renderWithAct(
      <CrashBoundary onRecover={onRecover}>
        <FlakyScreen />
      </CrashBoundary>,
    );
    expect(tree.root.findByProps({ testID: "crash-fallback" })).toBeTruthy();

    shouldThrow = false;
    act(() => {
      const button = tree.root.findByProps({
        testID: "crash-recover",
      }).props as unknown as { onPress: () => void };
      button.onPress();
    });

    expect(tree.root.findByProps({ testID: "recovered-screen" })).toBeTruthy();
    expect(onRecover).toHaveBeenCalledTimes(1);
  });

  it("auto-resets the failed subtree when resetKey changes", () => {
    const tree = renderWithAct(
      <CrashBoundary resetKey="route-a">
        <FlakyScreen />
      </CrashBoundary>,
    );
    expect(tree.root.findByProps({ testID: "crash-fallback" })).toBeTruthy();

    shouldThrow = false;
    act(() => {
      tree.update(
        <CrashBoundary resetKey="route-b">
          <FlakyScreen />
        </CrashBoundary>,
      );
    });

    expect(tree.root.findByProps({ testID: "recovered-screen" })).toBeTruthy();
  });

  it("renders a custom fallback and exposes reset", () => {
    const tree = renderWithAct(
      <CrashBoundary
        fallback={({ reset }) => (
          <Text testID="custom-fallback" onPress={reset}>
            Custom fallback
          </Text>
        )}
      >
        <FlakyScreen />
      </CrashBoundary>,
    );
    expect(tree.root.findByProps({ testID: "custom-fallback" })).toBeTruthy();

    shouldThrow = false;
    act(() => {
      const fallback = tree.root.findByProps({
        testID: "custom-fallback",
      }).props as unknown as { onPress: () => void };
      fallback.onPress();
    });

    expect(tree.root.findByProps({ testID: "recovered-screen" })).toBeTruthy();
  });
});

describe("RecoverableBoundary", () => {
  it("navigates to a known-good screen on recovery", () => {
    const tree = renderWithAct(
      <RecoverableBoundary label="app-root">
        <FlakyScreen />
      </RecoverableBoundary>,
    );
    expect(tree.root.findByProps({ testID: "crash-fallback" })).toBeTruthy();

    shouldThrow = false;
    act(() => {
      const button = tree.root.findByProps({
        testID: "crash-recover",
      }).props as unknown as { onPress: () => void };
      button.onPress();
    });

    expect(mockReplace).toHaveBeenCalledWith("/");
    expect(tree.root.findByProps({ testID: "recovered-screen" })).toBeTruthy();
  });
});

describe("withScreenBoundary", () => {
  it("wraps a screen so a throwing render shows the fallback", () => {
    const Wrapped = withScreenBoundary(ThrowingScreen, { label: "screen:x" });
    const tree = renderWithAct(<Wrapped />);
    expect(tree.root.findByProps({ testID: "crash-fallback" })).toBeTruthy();
  });

  it("renders the screen normally when it does not throw", () => {
    const Wrapped = withScreenBoundary(GoodScreen, { label: "screen:y" });
    const tree = renderWithAct(<Wrapped />);
    expect(tree.root.findByProps({ testID: "good-screen" })).toBeTruthy();
  });
});
