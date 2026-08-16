/**
 * Simple test for sync coordinator functionality
 * This file demonstrates the sync coordinator's behavior
 * 
 * To run this test, you can call testSyncCoordinator() from your app
 * or integrate it into your testing framework.
 */

import { syncCoordinator, type SyncStatus } from './sync-coordinator';

/**
 * Test the sync coordinator initialization and basic functionality
 * This is a manual test function that can be called during development
 */
export async function testSyncCoordinator() {
  console.log('Testing Sync Coordinator...');
  
  // Test 1: Get initial status
  const initialStatus = syncCoordinator.getStatus();
  console.log('Initial status:', initialStatus);
  console.assert(!initialStatus.isSyncing, 'Should not be syncing initially');
  console.assert(initialStatus.overallProgress === 0, 'Progress should be 0 initially');
  
  // Test 2: Subscribe to status changes
  let statusUpdateCount = 0;
  const unsubscribe = syncCoordinator.subscribe((status: SyncStatus) => {
    statusUpdateCount++;
    console.log('Status update:', status);
  });
  
  console.log('Subscribed to status changes');
  
  // Test 3: Trigger sync (will fail without auth token, but should handle gracefully)
  try {
    await syncCoordinator.triggerSync();
    console.log('Sync triggered');
  } catch (error) {
    console.log('Sync failed as expected (no auth token):', error);
  }
  
  console.log('Status updates received:', statusUpdateCount);
  
  // Test 4: Check sync history
  const history = await syncCoordinator.getSyncHistory();
  console.log('Sync history entries:', history.length);
  
  // Test 5: Reset coordinator
  await syncCoordinator.reset();
  const resetStatus = syncCoordinator.getStatus();
  console.log('Status after reset:', resetStatus);
  
  // Cleanup
  unsubscribe();
  
  console.log('✓ Sync coordinator tests completed');
}
