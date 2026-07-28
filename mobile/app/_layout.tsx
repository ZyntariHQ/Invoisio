import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectivityProvider } from '../components/ConnectivityProvider';
import { OfflineBanner } from '../components/OfflineBanner';

const queryClient = new QueryClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConnectivityProvider>
        <SafeAreaProvider>
          <StatusBar style="light" />
          <OfflineBanner />
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: '#050914',
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontFamily: 'SpaceGrotesk_600SemiBold',
              },
              headerBackTitle: 'Back',
              contentStyle: {
                backgroundColor: '#050914',
              },
            }}
          >
            <Stack.Screen
              name="index"
              options={{
                title: 'Invoisio',
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="dashboard"
              options={{
                title: 'Dashboard',
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="login"
              options={{
                title: 'Sign In',
                headerShown: false,
              }}
            />
            <Stack.Screen
              name="create-invoice"
              options={{
                title: 'Create Invoice',
                headerShown: true,
              }}
            />
            <Stack.Screen
              name="drafts"
              options={{
                title: 'Saved Drafts',
                headerShown: true,
              }}
            />
            <Stack.Screen
              name="invoices/[id]"
              options={{
                title: 'Invoice Details',
                headerShown: true,
              }}
            />
            <Stack.Screen
              name="scan"
              options={{
                title: 'Scan QR',
                headerShown: true,
              }}
            />
            <Stack.Screen
              name="settings"
              options={{
                title: 'Settings',
                headerShown: true,
              }}
            />
          </Stack>
        </SafeAreaProvider>
      </ConnectivityProvider>
    </QueryClientProvider>
  );
}