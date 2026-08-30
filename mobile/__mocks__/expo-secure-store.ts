/** In-memory mock so node-based lib tests can import modules that use
 * SecureStore (auth-service, use-auth-store) without native modules. */
const store = new Map<string, string>();

export const getItemAsync = jest.fn(
  (key: string): Promise<string | null> =>
    Promise.resolve(store.get(key) ?? null),
);
export const setItemAsync = jest.fn(
  (key: string, value: string): Promise<void> => {
    store.set(key, value);
    return Promise.resolve();
  },
);
export const deleteItemAsync = jest.fn((key: string): Promise<void> => {
  store.delete(key);
  return Promise.resolve();
});
