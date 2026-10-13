let seq = 0

// Client-side ids for new accounts and tranches: unique within the page, stable once saved.
export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${(seq++).toString(36)}`
