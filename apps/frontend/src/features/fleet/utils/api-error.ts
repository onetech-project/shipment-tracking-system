// apiClient is an axios instance, so a rejected request carries the backend's response body at
// `response.data`, not on `err.message` — an Error's own message is the transport failure
// ("Network Error", "Request failed with status code 400") and is not worth showing an operator.
// The cast below asserts `message?: string` but nothing validates that, so the typeof guard is
// what makes the cast safe: a `message` that arrived as an object or a number would flow into JSX
// and make React throw on an object child, blanking the page. The length check covers the other
// half — an empty string would render an error banner with nothing in it.
export function apiErrorMessage(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
  return typeof msg === 'string' && msg.length > 0 ? msg : fallback
}
