export const Linking = {
  getInitialURL: async (): Promise<string | null> => null,
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};

export const AppState = {
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  currentState: "active",
};
