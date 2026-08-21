declare module "react-native" {
  export const Linking: {
    getInitialURL(): Promise<string | null>;
    addEventListener(
      eventType: "url",
      listener: (event: { url: string }) => void,
    ): { remove(): void };
  };

  export const AppState: {
    currentState: string;
    addEventListener(
      type: "change",
      listener: (state: string) => void,
    ): { remove(): void };
  };

  export const Share: {
    share(content: { message?: string; title?: string }): Promise<void>;
  };
}

declare module "@react-native-async-storage/async-storage" {
  const AsyncStorage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  };
  export default AsyncStorage;
}
