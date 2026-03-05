import { useEffect } from "react";
import { useRouter, useSegments } from "expo-router";
import { useAuthStore } from "../hooks/use-auth-store";
import { View, ActivityIndicator } from "react-native";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Auth Guard component that protects routes requiring authentication
 * Redirects unauthenticated users to the login screen
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading } = useAuthStore();

  useEffect(() => {
    // Don't redirect while still loading auth state
    if (isLoading) return;

    // Check if the current route requires authentication
    const isAuthRoute = segments[0] === "login" || segments[0] === "index";

    // Protected routes: everything except login and index
    const requiresAuth = !isAuthRoute;

    if (requiresAuth && !isAuthenticated) {
      // Redirect to login if not authenticated
      router.replace("/login");
    } else if (isAuthRoute && isAuthenticated) {
      // Redirect to dashboard if already authenticated
      router.replace("/dashboard");
    }
  }, [isAuthenticated, isLoading, segments, router]);

  // Show loading spinner while checking auth state
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#050914]">
        <ActivityIndicator size="large" color="#2663FF" />
      </View>
    );
  }

  return <>{children}</>;
}
