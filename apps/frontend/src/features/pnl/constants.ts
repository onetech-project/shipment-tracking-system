// Tab labels live here rather than in the page component: Next's App Router rejects any named
// export from a page.tsx beyond its own default and metadata, and the jest specs assert these
// exact strings, so a rename should touch one place.
export const ROUTE_COMPARISON_LABEL = 'Route Comparison'
