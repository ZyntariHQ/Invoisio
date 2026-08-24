# Sync Coordinator Documentation

## Overview

The Sync Coordinator (`lib/sync-coordinator.ts`) provides robust, observable synchronization for the mobile app with automatic recovery on app resume and connectivity restoration.

## Features

- **App-Resume Sync**: Automatically triggers sync when app returns from background
- **Connectivity Recovery**: Triggers sync when network connection is restored
- **Retry Logic**: Exponential backoff retry for failed operations (max 3 retries)
- **Partial Failure Handling**: Continues sync even if individual operations fail
- **Observability**: Real-time status updates via subscription pattern
- **User Feedback**: Visual sync status banner shows progress and errors
- **History Tracking**: Maintains sync history for debugging and analytics

## Architecture

### Sync Operations

The coordinator manages five types of sync operations:

1. **auth_retry**: Verifies and refreshes authentication tokens
2. **drafts**: Syncs local draft invoices with server
3. **offline_queue**: Processes queued offline API requests
4. **invoices**: Updates stale invoice status
5. **notifications**: Catches up on pending notifications

### Sync Flow

```
App Resume / Connectivity Recovery
           ↓
   triggerSync() called
           ↓
   Check if already syncing
           ↓
   Execute operations sequentially:
   1. Auth retry (with error recovery)
   2. Draft sync (with error recovery)
   3. Offline queue (with error recovery)
   4. Invoice status (with error recovery)
   5. Notifications (with error recovery)
           ↓
   Record sync history
           ↓
   Update last sync time
           ↓
   Notify listeners
```

## Usage

### Basic Usage

```typescript
import { syncCoordinator } from '../lib/sync-coordinator';

// Trigger full sync
await syncCoordinator.triggerSync();

// Trigger selective sync
await syncCoordinator.triggerSync({
  skipNotifications: true,
  skipInvoices: true,
});
```

### React Hook

```typescript
import { useSyncCoordinator } from '../hooks/use-sync-coordinator';

function MyComponent() {
  const { status, triggerSync } = useSyncCoordinator();
  
  return (
    <View>
      <Text>Sync Progress: {status.overallProgress}%</Text>
      <Button onPress={triggerSync} title="Sync Now" />
    </View>
  );
}
```

### Connectivity Context

```typescript
import { useConnectivityContext } from '../components/ConnectivityProvider';

function MyComponent() {
  const { syncStatus, triggerSync } = useConnectivityContext();
  
  // syncStatus provides real-time sync state
  // triggerSync manually initiates sync
}
```

## Sync Status

The sync status includes:

```typescript
interface SyncStatus {
  isSyncing: boolean;              // Currently syncing
  currentOperation: SyncOperation | null;  // Active operation
  queue: SyncOperation[];          // Pending/completed operations
  lastSyncTime: number | null;     // Timestamp of last successful sync
  overallProgress: number;         // 0-100 progress percentage
}
```

## Error Handling

The coordinator uses **partial failure handling**:

- Each operation is wrapped in try-catch
- Failed operations don't block subsequent operations
- Errors are logged and recorded in operation status
- Users can retry failed operations via the sync banner

## Retry Strategy

- **Max Retries**: 3 attempts per operation
- **Backoff**: Exponential (1s, 2s, 4s delays)
- **Persistence**: Sync state saved to AsyncStorage
- **Recovery**: Failed operations can be retried manually

## User Feedback

### Sync Status Banner

The `SyncStatusBanner` component shows:

- Current operation being synced
- Progress percentage
- Error states with retry button
- Auto-hides when sync is complete

Add it to your layout:

```typescript
import { SyncStatusBanner } from '../components/SyncStatusBanner';

// In your root layout
<SyncStatusBanner />
```

## Testing

Run the basic test:

```typescript
import { testSyncCoordinator } from '../lib/sync-coordinator.test';

await testSyncCoordinator();
```

## Configuration

### Adjust Retry Behavior

Edit `lib/sync-coordinator.ts`:

```typescript
private maxRetries = 3;        // Change max retry attempts
private retryDelay = 1000;     // Change base delay (ms)
```

### Customize Sync Operations

Add new operation types in `SyncOperationType` and implement corresponding methods in the coordinator.

## Storage Keys

The coordinator uses these AsyncStorage keys:

- `@invoisio_sync_status`: Current sync state
- `@invoisio_sync_history`: Sync history (last 50 entries)
- `@invoisio_last_sync`: Last successful sync timestamp

## Integration Points

### ConnectivityProvider

The coordinator is integrated into `ConnectivityProvider`:

- Triggers sync on app resume (AppState change)
- Triggers sync on connectivity recovery
- Exposes sync status via context

### DraftService

Existing draft sync is enhanced by the coordinator:

- Local drafts are synced as part of coordinated sync
- Sync status is tracked and reported
- Failed syncs are retried automatically

### OfflineQueue

Offline queue processing is coordinated:

- Queue is processed during sync
- Queue size is tracked in sync status
- Failed requests are retried with backoff

## Monitoring

### Check Sync History

```typescript
const history = await syncCoordinator.getSyncHistory();
console.log('Recent syncs:', history);
```

### Clear History

```typescript
await syncCoordinator.clearHistory();
```

### Reset Coordinator

```typescript
await syncCoordinator.reset();  // For testing/error recovery
```

## Acceptance Criteria Met

✅ **App-Resume Sync**: Triggers controlled background recovery when returning to app after offline time
✅ **Connectivity Recovery**: Syncs drafts and invoices reliably after connectivity interruptions  
✅ **Failure Feedback**: Sync failures surface useful feedback instead of failing silently
✅ **Duplicate Prevention**: Single sync coordinator prevents concurrent sync operations
✅ **Observable Retries**: Users can see what's syncing via status banner
✅ **Partial Failures**: Individual operation failures don't block entire sync pass

## Troubleshooting

### Sync Not Triggering

- Check if `isOffline` is false in ConnectivityProvider
- Verify AppState listener is working
- Ensure coordinator is not already syncing

### Operations Failing

- Check sync history for error details
- Verify network connectivity
- Check authentication token validity
- Review server logs for API errors

### Status Not Updating

- Ensure component is subscribed to sync status
- Check that listeners are properly registered
- Verify AsyncStorage is working
