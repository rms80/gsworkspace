import * as pdfjsLib from 'pdfjs-dist'

// Configure worker - use Vite's URL import for the bundled worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href

/**
 * Render a single page of a PDF to a data URL thumbnail.
 * Renders at sufficient resolution for display; returns the image
 * along with its natural dimensions so the caller can crop/cover-fit.
 * @param pdfUrl - URL of the PDF file
 * @param pageNum - 1-based page number to render
 * @param targetHeight - desired render height in pixels
 * @returns { dataUrl, width, height } of the rendered image
 */
export async function renderPdfPageToDataUrl(
  pdfUrl: string,
  pageNum: number,
  targetHeight: number = 400,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const loadingTask = pdfjsLib.getDocument(pdfUrl)
  const pdf = await loadingTask.promise
  const page = await pdf.getPage(Math.min(pageNum, pdf.numPages))

  const viewport = page.getViewport({ scale: 1 })

  // Scale so the rendered height matches targetHeight
  const scale = targetHeight / viewport.height
  const scaledViewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = scaledViewport.width
  canvas.height = scaledViewport.height

  await page.render({ canvas, viewport: scaledViewport }).promise

  const dataUrl = canvas.toDataURL('image/png')
  const width = canvas.width
  const height = canvas.height

  // Cleanup
  page.cleanup()
  await pdf.destroy()

  return { dataUrl, width, height }
}
