// Extract workspace name from the first segment of the URL path.
// e.g. /myworkspace/  -> 'myworkspace'
// Falls back to 'default' when the path is just '/'.
const firstSegment = window.location.pathname.split('/').filter(Boolean)[0]
export const ACTIVE_WORKSPACE = firstSegment || 'default'
