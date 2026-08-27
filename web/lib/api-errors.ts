export function extractApiErrorMessage(error: unknown): string {
  if (!error) return "An error occurred";

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && "response" in error) {
    const apiError = error as { response?: { data?: { message?: string | string[] } } };
    const message = apiError.response?.data?.message;

    if (Array.isArray(message)) {
      return message.join(", ");
    }
    if (typeof message === "string") {
      return message;
    }
  }

  return "An error occurred. Please try again.";
}