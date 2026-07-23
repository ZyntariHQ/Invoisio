export const mockStructuredLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

export const mockRequestContextService = {
  runWithContext: jest.fn((_store: unknown, callback: () => unknown) =>
    callback(),
  ),
  runWithWorkerContext: jest.fn((_options: unknown, callback: () => unknown) =>
    callback(),
  ),
  runWithChildContext: jest.fn((_partial: unknown, callback: () => unknown) =>
    callback(),
  ),
  getStore: jest.fn(),
  getCorrelationId: jest.fn(),
  getTraceId: jest.fn(),
  setUserContext: jest.fn(),
};
