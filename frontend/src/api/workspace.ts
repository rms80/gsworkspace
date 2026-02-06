// Extract workspace name from the first segment of the URL path.
// e.g. /myworkspace/  -> 'myworkspace'
// Falls back to 'default' when the path is just '/'.
const firstSegment = window.location.pathname.split('/').filter(Boolean)[0]
export const ACTIVE_WORKSPACE = firstSegment || 'default'

// Whether the workspace was explicitly specified in the URL.
// null means user navigated to bare '/' (candidate for redirect).
// Non-null means user explicitly navigated to a workspace path.
export const WORKSPACE_FROM_URL: string | null = firstSegment || null
