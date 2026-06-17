import { useEffect, useMemo, type ReactNode } from "react";
import { Link, useRouter, useSegments } from "expo-router";
import { useAuthStore } from "../hooks/use-auth-store";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Auth guard that keeps protected screens hidden until auth is resolved.
 * It also avoids briefly mounting protected content before redirecting.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading } = useAuthStore();

  const rootSegment = segments[0];

  const routeState = useMemo(() => {
    const isPublicRoute = rootSegment === "index" || rootSegment === "login";
    const isInvoicesRoute = rootSegment === "invoices";
    const isProtectedRoute =
      rootSegment === "dashboard" ||
      rootSegment === "create-invoice" ||
      rootSegment === "settings" ||
      isInvoicesRoute;

    return { isPublicRoute, isProtectedRoute };
  }, [rootSegment]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (routeState.isProtectedRoute && !isAuthenticated) {
      router.replace("/login");
      return;
    }

    if (routeState.isPublicRoute && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [
    isAuthenticated,
    isLoading,
    routeState.isProtectedRoute,
    routeState.isPublicRoute,
    router,
  ]);

  const showLoadingScreen =
    (isLoading && routeState.isProtectedRoute) ||
    (!isLoading && routeState.isPublicRoute && isAuthenticated);

  if (showLoadingScreen) {
    const title =
      isLoading && routeState.isProtectedRoute
        ? "Checking your session"
        : "Opening your workspace";
    const description =
      isLoading && routeState.isProtectedRoute
        ? "We are verifying access before showing protected content."
        : "You are already signed in. Redirecting you to the dashboard.";

    return (
      <View className="flex-1 items-center justify-center bg-[#050914] px-6">
        <View className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6">
          <ActivityIndicator size="large" color="#2663FF" />
          <Text
            className="mt-5 text-center text-2xl text-white"
            style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
          >
            {title}
          </Text>
          <Text
            className="mt-2 text-center text-slate-300"
            style={{ fontFamily: "SpaceGrotesk_400Regular" }}
          >
            {description}
          </Text>
        </View>
      </View>
    );
  }

  if (!isLoading && routeState.isProtectedRoute && !isAuthenticated) {
    return (
      <View className="flex-1 items-center justify-center bg-[#050914] px-6">
        <View className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-6">
          <Text
            className="text-sm uppercase tracking-[0.35em] text-[#7dd3fc]"
            style={{ fontFamily: "SpaceGrotesk_500Medium" }}
          >
            Access required
          </Text>
          <Text
            className="mt-4 text-3xl text-white"
            style={{ fontFamily: "SpaceGrotesk_700Bold" }}
          >
            Sign in to continue
          </Text>
          <Text
            className="mt-3 text-base text-slate-300"
            style={{ fontFamily: "SpaceGrotesk_400Regular" }}
          >
            This area is reserved for authenticated operators. You can sign in
            now or return to the public landing page.
          </Text>

          <View className="mt-6 gap-3">
            <Link href="/login" asChild>
              <Pressable className="rounded-2xl bg-[#2663FF] py-4">
                <Text
                  className="text-center text-base text-white"
                  style={{ fontFamily: "SpaceGrotesk_600SemiBold" }}
                >
                  Go to Login
                </Text>
              </Pressable>
            </Link>

            <Link href="/" asChild>
              <Pressable className="rounded-2xl border border-white/15 py-4">
                <Text
                  className="text-center text-base text-white"
                  style={{ fontFamily: "SpaceGrotesk_500Medium" }}
                >
                  Return Home
                </Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}
