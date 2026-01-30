/**
 * Application configuration and feature flags
 */

export const config = {
  /**
   * Feature flags
   */
  features: {
    /**
     * Hide HTML iframe overlays during viewport pan/zoom and object dragging.
     * When enabled, only the border rect is visible during transforms,
     * which improves performance and avoids visual desync.
     */
    hideHtmlDuringTransform: false,

    /**
     * Enable video block support.
     * Set VITE_FEATURE_VIDEO=false to disable.
     */
    videoSupport: import.meta.env.VITE_FEATURE_VIDEO !== 'false',
  },

  /**
   * Timing configuration
   */
  timing: {
    /** Delay before showing HTML iframes after zoom stops (ms) */
    zoomEndDelay: 150,
  },
}
