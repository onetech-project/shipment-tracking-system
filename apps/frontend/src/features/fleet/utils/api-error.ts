// apiClient is an axios instance, so a rejected request carries the backend's response body at
// `response.data`, not on `err.message` — an Error's own message is the transport failure
// ("Network Error", "Request failed with status code 400") and is not worth showing an operator.
// Nest also answers class-validator failures with `message` as an array; joining that into the UI
// would print a blob, so anything that is not a non-empty string falls back.
export function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
  return typeof msg === 'string' && msg.length > 0 ? msg : fallback
}
