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

// Uploads are the one place where a thrown Error's own message is worth showing. A file travels
// through three requests and only two of them are axios: the PUT to object storage is a bare
// fetch (apiClient's Authorization header is not in the presigned signature), so
// useFleetVehicleFiles raises an operator-facing Error of its own for a failed PUT. The backend's
// reason therefore comes first — a pdf dropped on a photo slot is refused at upload-intent with
// "Slot Foto Depan hanya menerima foto…" in response.data.message — and err.message is read only
// when the rejection did not come from axios at all. An axios error with no response is a
// transport failure ("Network Error") and still falls back.
export function uploadErrorMessage(err: unknown, fallback: string): string {
  const e = err as { isAxiosError?: boolean; response?: unknown }
  if (e?.isAxiosError === true || e?.response !== undefined) return apiErrorMessage(err, fallback)
  return err instanceof Error && err.message.length > 0 ? err.message : fallback
}
