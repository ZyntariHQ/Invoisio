import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import {
  FlatList,
  Pressable,
  Text,
  View,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../hooks/use-auth-store';
import { useConnectivity } from '../hooks/use-connectivity';
import { DraftService } from '../lib/draft-service';
import type { DraftInvoice } from '../types/draft.types';

export default function DraftsScreen() {
  const router = useRouter();
  const { accessToken } = useAuthStore();
  useConnectivity();

  const [drafts, setDrafts] = useState<DraftInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const loadDrafts = useCallback(
    async (pageNum = 1, refresh = false) => {
      if (!accessToken) {
        setIsLoading(false);
        return;
      }

      try {
        if (refresh) setIsRefreshing(true);
        else if (pageNum === 1) setIsLoading(true);

        const response = await DraftService.getDrafts(accessToken, pageNum, 20);
        if (pageNum === 1) {
          setDrafts(response.items);
        } else {
          setDrafts((prev) => [...prev, ...response.items]);
        }
        setHasMore(response.hasMore);
        setTotal(response.total);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load drafts');
        // Try to load from local cache
        const localDrafts = await DraftService.getLocalDrafts();
        if (localDrafts.length > 0) {
          const mappedDrafts = localDrafts.map((d) => d.data as DraftInvoice);
          setDrafts(mappedDrafts);
        }
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [accessToken],
  );

  useEffect(() => {
    loadDrafts();
  }, [loadDrafts]);

  const handleRefresh = () => {
    setPage(1);
    loadDrafts(1, true);
  };

  const loadMore = () => {
    if (hasMore && !isLoading) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadDrafts(nextPage);
    }
  };

  const handleResume = (draftId: string) => {
    router.push(`/create-invoice?draftId=${draftId}`);
  };

  const handleDiscard = async (draft: DraftInvoice) => {
    Alert.alert(
      'Discard Draft',
      'Are you sure you want to discard this draft?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            if (!accessToken) {
              Alert.alert('Error', 'You need to be signed in to discard a draft.', [
                { text: 'OK' },
              ]);
              return;
            }

            try {
              await DraftService.discardDraft(accessToken, draft.id);
              setDrafts((prev) => prev.filter((d) => d.id !== draft.id));
            } catch (err) {
              Alert.alert(
                'Error',
                err instanceof Error ? err.message : 'Failed to discard draft',
                [{ text: 'OK' }],
              );
            }
          },
        },
      ],
    );
  };

  const renderDraftItem = ({ item }: { item: DraftInvoice }) => {
    const isComplete = DraftService.isDraftComplete(item);
    const percentage = DraftService.getCompletionPercentage(item);
    const displayName = item.clientName || 'Untitled Draft';

    return (
      <View className="mb-3 rounded-xl border border-white/10 bg-white/5 p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1">
            <View className="flex-row items-center gap-2">
              <Text
                className="text-base text-white"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
                numberOfLines={1}
              >
                {displayName}
              </Text>
              {isComplete && (
                <View className="rounded-full bg-emerald-500/20 px-2 py-0.5">
                  <Text
                    className="text-xs text-emerald-300"
                    style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
                  >
                    Ready
                  </Text>
                </View>
              )}
            </View>
            {item.amount && (
              <Text
                className="mt-1 text-sm text-slate-300"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                {item.amount.toFixed(2)} {item.assetCode || 'XLM'}
              </Text>
            )}
            <View className="mt-2 flex-row items-center gap-2">
              <View className="h-1.5 flex-1 rounded-full bg-slate-700 overflow-hidden">
                <View
                  className="h-full rounded-full bg-[#00D6B9] transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </View>
              <Text
                className="text-xs text-slate-400"
                style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
              >
                {percentage}%
              </Text>
            </View>
          </View>
          <View className="flex-row gap-2 ml-4">
            <Pressable
              className="rounded-lg bg-[#2663FF] px-3 py-2"
              accessibilityRole="button"
              onPress={() => handleResume(item.id)}
            >
              <Text
                className="text-xs text-white"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                Resume
              </Text>
            </Pressable>
            <Pressable
              className="rounded-lg border border-red-500/30 px-3 py-3"
              accessibilityLabel="Discard draft"
              accessibilityRole="button"
              onPress={() => handleDiscard(item)}
            >
              <Text
                className="text-xs text-red-400"
                style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
              >
                ✕
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  };

  if (isLoading && drafts.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-[#050914] items-center justify-center">
        <ActivityIndicator size="large" color="#7dd3fc" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#050914]">
      <View className="px-6 pt-6 pb-4">
        <Text
          className="text-2xl text-white"
          style={{ fontFamily: 'SpaceGrotesk_700Bold' }}
        >
          Saved Drafts
        </Text>
        <Text
          className="text-sm text-slate-400"
          style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
        >
          {total} draft{total !== 1 ? 's' : ''} saved
        </Text>
      </View>

      {error && (
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLabel={error}
          accessibilityLiveRegion="assertive"
          className="mx-6 mb-4 rounded-xl bg-red-500/20 p-4 border border-red-500/50"
        >
          <Text
            className="text-center text-sm text-red-300"
            style={{ fontFamily: 'SpaceGrotesk_500Medium' }}
          >
            {error}
          </Text>
        </View>
      )}

      {drafts.length === 0 ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text
            className="text-center text-lg text-white"
            style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
          >
            No saved drafts
          </Text>
          <Text
            className="mt-2 text-center text-sm text-slate-400"
            style={{ fontFamily: 'SpaceGrotesk_400Regular' }}
          >
            Start creating an invoice and it will be automatically saved as a draft.
          </Text>
          <Pressable
            accessibilityRole="button"
            className="mt-6 rounded-xl bg-[#00D6B9] px-6 py-3"
            onPress={() => router.push('/create-invoice')}
          >
            <Text
              className="text-[#050914] font-semibold"
              style={{ fontFamily: 'SpaceGrotesk_600SemiBold' }}
            >
              Create Invoice
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={(item) => item.id}
          renderItem={renderDraftItem}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor="#7dd3fc"
            />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            hasMore ? (
              <View className="py-4">
                <ActivityIndicator size="small" color="#7dd3fc" />
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}