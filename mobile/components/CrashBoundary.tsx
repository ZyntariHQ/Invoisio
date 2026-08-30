import {
  Component,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { reportError } from "../lib/error-reporting";

export interface CrashBoundaryProps {
  children: ReactNode;
  /** Extra non-sensitive context attached to the report. */
  context?: Record<string, unknown>;
  /** Custom fallback UI; receives the caught error and a reset callback. */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
  /** Short label describing where the boundary lives, e.g. "screen:scan". */
  label?: string;
  /** Custom error hook; defaults to the app's reportError pipeline. */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Called after the boundary resets when the user recovers. */
  onRecover?: () => void;
  /** When this value changes while a fallback is shown, the subtree resets. */
  resetKey?: string | number | null;
}

export interface CrashBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render and lifecycle errors in its subtree and presents a
 * recoverable fallback instead of letting the app die to a blank screen.
 *
 * Recovery resets the failed subtree and (via `onRecover`) returns the
 * merchant to a known-good screen; authenticated state and local drafts live
 * in persistent stores outside the React tree, so they survive untouched.
 */
export class CrashBoundary extends Component<
  CrashBoundaryProps,
  CrashBoundaryState
> {
  override state: CrashBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): CrashBoundaryState {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const { context, label, onError } = this.props;
    if (onError) {
      try {
        onError(error, info);
      } catch {
        // Reporting must never break the recovery path.
      }
      return;
    }
    reportError(error, info, {
      context: {
        ...(context ?? {}),
        ...(label !== undefined ? { boundary: label } : {}),
      },
    });
  }

  override componentDidUpdate(prevProps: CrashBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.reset();
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  override render(): ReactNode {
    const { children, fallback } = this.props;
    const { error, hasError } = this.state;
    if (!hasError || error === null) {
      return children;
    }
    if (fallback) {
      return fallback({ error, reset: this.reset });
    }
    return (
      <CrashFallbackScreen
        error={error}
        onRecover={() => {
          this.reset();
          this.props.onRecover?.();
        }}
      />
    );
  }
}

export interface CrashFallbackScreenProps {
  error: Error;
  onRecover: () => void;
  title?: string;
  message?: string;
}

/** The default recoverable fallback shown when a boundary catches an error. */
export function CrashFallbackScreen({
  error,
  onRecover,
  title = "Something went wrong",
  message = "We hit an unexpected problem. Your session, wallet, and saved drafts are safe — you can continue from where you left off.",
}: CrashFallbackScreenProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <View
      testID="crash-fallback"
      className="flex-1 items-center justify-center bg-[#050914] px-6"
    >
      <View className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6">
        <Text
          testID="crash-fallback-title"
          className="text-center text-2xl text-white"
          style={{ fontFamily: "SpaceGrotesk_700Bold" }}
        >
          {title}
        </Text>
        <Text
          className="mt-3 text-center text-base text-slate-300"
          style={{ fontFamily: "SpaceGrotesk_400Regular" }}
        >
          {message}
        </Text>

        {showDetails ? (
          <View className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-3">
            <Text
              selectable
              className="text-xs text-slate-400"
              style={{ fontFamily: "SpaceGrotesk_400Regular" }}
            >
              {error.name}: {error.message}
              {error.stack ? `\n\n${error.stack}` : ""}
            </Text>
          </View>
        ) : null}

        <Pressable
          testID="crash-recover"
          accessibilityRole="button"
          className="mt-6 rounded-2xl bg-[#2663FF] py-4"
          onPress={onRecover}
        >
          <Text
            className="text-center text-base text-white"
            style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
          >
            Continue
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          className="mt-3 rounded-2xl border border-white/15 py-3"
          onPress={() => {
            setShowDetails((visible) => !visible);
          }}
        >
          <Text
            className="text-center text-sm text-slate-300"
            style={{ fontFamily: "SpaceGrotesk_500Medium" }}
          >
            {showDetails ? "Hide details" : "Show details"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

export interface RecoverableBoundaryProps {
  children: ReactNode;
  context?: Record<string, unknown>;
  label?: string;
  onError?: (error: Error, info: ErrorInfo) => void;
  resetKey?: string | number | null;
}

/**
 * A crash boundary whose recovery also navigates back to a known-good screen
 * (`/`), which the auth guard redirects to the dashboard for signed-in
 * merchants. Used at the app root and for screen-level isolation.
 */
export function RecoverableBoundary({
  children,
  context,
  label,
  onError,
  resetKey,
}: RecoverableBoundaryProps) {
  const router = useRouter();
  return (
    <CrashBoundary
      {...(context !== undefined ? { context } : {})}
      {...(label !== undefined ? { label } : {})}
      {...(onError !== undefined ? { onError } : {})}
      {...(resetKey !== undefined ? { resetKey } : {})}
      onRecover={() => {
        router.replace("/");
      }}
    >
      {children}
    </CrashBoundary>
  );
}

export interface ScreenBoundaryOptions {
  label?: string;
}

/**
 * Wrap a screen's default export so a render/lifecycle failure in that screen
 * shows the recoverable fallback instead of taking down the session.
 */
export function withScreenBoundary<P extends object>(
  Screen: ComponentType<P>,
  options?: ScreenBoundaryOptions,
): ComponentType<P> {
  const WrappedScreen = (props: P) => (
    <RecoverableBoundary
      {...(options?.label !== undefined ? { label: options.label } : {})}
    >
      <Screen {...props} />
    </RecoverableBoundary>
  );
  WrappedScreen.displayName = `ScreenBoundary(${
    Screen.displayName || Screen.name || "Screen"
  })`;
  return WrappedScreen;
}
