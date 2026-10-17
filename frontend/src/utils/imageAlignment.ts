import { CropRect, ImageItem } from '../types'
import { getContentData } from '../api/scenes'

/**
 * Image alignment for MultiCrop.
 *
 * Estimates the translation between a reference image and a target image that are mostly
 * identical (e.g. screenshots of an incrementally changing scene). A shift {dx, dy} means
 * reference pixel (x, y) corresponds to target pixel (x + dx, y + dy).
 *
 * Strategy:
 * 1. Exact patch voting: hash small distinctive patches of the reference, scan every window of
 *    the target with a rolling hash, and vote for the shift of each exact match. The most common
 *    shift wins. This runs hierarchically - a sparse set of patches first, all patches only if
 *    the sparse pass is inconclusive.
 * 2. If no exact consensus is found (e.g. lossy/noisy images), fall back to a coarse-to-fine
 *    search that maximises the fraction of near-identical pixels in the overlap.
 */

export interface GrayImage {
  data: Uint8Array
  width: number
  height: number
}

export interface Shift {
  dx: number
  dy: number
}

const PATCH = 12
const CANDIDATE_STRIDE = PATCH / 2
const SPARSE_PATCH_TARGET = 1500
const MAX_PATCHES = 60000
const MAX_MATCHES_PER_PATCH = 4
const HASH_B1 = 0x01000193
const HASH_B2 = 0x5bd1e995 | 0

/**
 * Loads an image item's original (uncropped) pixels as grayscale.
 * S3 images are loaded via the getContentData API to avoid CORS canvas taint.
 */
export async function loadGrayImage(sceneId: string, item: ImageItem): Promise<GrayImage> {
  const isLocalUrl = item.src.startsWith('data:') || item.src.startsWith('blob:')
  const blobUrl = isLocalUrl
    ? null
    : URL.createObjectURL(await getContentData(sceneId, item.id, 'image', false))

  try {
    const img = new window.Image()
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = blobUrl ?? item.src
    })

    const width = img.naturalWidth
    const height = img.naturalHeight
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Failed to get canvas context')
    ctx.drawImage(img, 0, 0)
    const rgba = ctx.getImageData(0, 0, width, height).data

    const data = new Uint8Array(width * height)
    for (let i = 0, j = 0; i < data.length; i++, j += 4) {
      data[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8
    }
    return { data, width, height }
  } finally {
    if (blobUrl) URL.revokeObjectURL(blobUrl)
  }
}

/**
 * Estimates the shift that aligns most of `target` with `ref`. Returns null if no reliable
 * alignment could be found.
 */
export function estimateShift(ref: GrayImage, target: GrayImage): Shift | null {
  const candidates = collectReferencePatches(ref)

  if (candidates.length > 0) {
    // Pass 1: sparse, spatially uniform subset of patches
    const sparseStride = Math.max(
      CANDIDATE_STRIDE,
      Math.round(Math.sqrt((ref.width * ref.height) / SPARSE_PATCH_TARGET) / CANDIDATE_STRIDE) * CANDIDATE_STRIDE
    )
    const sparse = candidates.filter((p) => p.x % sparseStride === 0 && p.y % sparseStride === 0)
    if (sparse.length > 0) {
      const shift = pickConsensus(voteShifts(ref, target, sparse), 8, 2)
      if (shift) return shift
    }

    // Pass 2: all candidate patches (uniformly subsampled if there are too many)
    const step = Math.ceil(candidates.length / MAX_PATCHES)
    const dense = step > 1 ? candidates.filter((_, i) => i % step === 0) : candidates
    const shift = pickConsensus(voteShifts(ref, target, dense), 4, 1.5)
    if (shift) return shift
  }

  // Fallback: approximate coarse-to-fine search
  return approximateShift(ref, target)
}

/**
 * Computes the largest crop region (in reference pixels) that lies inside every image once
 * each image's shift is applied.
 */
export function computeCompatibleBounds(
  sizes: { width: number; height: number }[],
  shifts: Shift[]
): CropRect {
  let x0 = 0
  let y0 = 0
  let x1 = sizes[0].width
  let y1 = sizes[0].height
  for (let i = 1; i < sizes.length; i++) {
    x0 = Math.max(x0, -shifts[i].dx)
    y0 = Math.max(y0, -shifts[i].dy)
    x1 = Math.min(x1, sizes[i].width - shifts[i].dx)
    y1 = Math.min(y1, sizes[i].height - shifts[i].dy)
  }
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) }
}

// ---------------------------------------------------------------------------
// Exact patch voting
// ---------------------------------------------------------------------------

interface Patch {
  x: number
  y: number
  hash: number
}

function powImul(base: number, exp: number): number {
  let r = 1
  for (let i = 0; i < exp; i++) r = Math.imul(r, base)
  return r
}

/**
 * Calls visit(x, y, hash) for every PATCH×PATCH window (by top-left corner), row by row,
 * using a 2D rolling polynomial hash (mod 2^32).
 */
function forEachWindowHash(img: GrayImage, visit: (x: number, y: number, hash: number) => void) {
  const { data, width: w, height: h } = img
  const nx = w - PATCH + 1
  const ny = h - PATCH + 1
  if (nx <= 0 || ny <= 0) return

  const p1 = powImul(HASH_B1, PATCH - 1)
  const p2 = powImul(HASH_B2, PATCH - 1)

  // rowHash[y * nx + x] = hash of data[y][x .. x + PATCH - 1]
  const rowHash = new Int32Array(nx * h)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let hh = 0
    for (let i = 0; i < PATCH; i++) hh = (Math.imul(hh, HASH_B1) + data[row + i]) | 0
    rowHash[y * nx] = hh
    for (let x = 1; x < nx; x++) {
      hh = (Math.imul((hh - Math.imul(data[row + x - 1], p1)) | 0, HASH_B1) + data[row + x + PATCH - 1]) | 0
      rowHash[y * nx + x] = hh
    }
  }

  const col = new Int32Array(nx)
  for (let x = 0; x < nx; x++) {
    let hh = 0
    for (let j = 0; j < PATCH; j++) hh = (Math.imul(hh, HASH_B2) + rowHash[j * nx + x]) | 0
    col[x] = hh
  }
  for (let y = 0; y < ny; y++) {
    if (y > 0) {
      const outRow = (y - 1) * nx
      const inRow = (y + PATCH - 1) * nx
      for (let x = 0; x < nx; x++) {
        col[x] = (Math.imul((col[x] - Math.imul(rowHash[outRow + x], p2)) | 0, HASH_B2) + rowHash[inRow + x]) | 0
      }
    }
    for (let x = 0; x < nx; x++) visit(x, y, col[x])
  }
}

/** True if the patch has enough structure to be a useful landmark (not flat/near-flat). */
function isDistinctive(img: GrayImage, px: number, py: number): boolean {
  const { data, width } = img
  let sum = 0
  let min = 255
  let max = 0
  for (let j = 0; j < PATCH; j++) {
    const row = (py + j) * width + px
    for (let i = 0; i < PATCH; i++) {
      const v = data[row + i]
      sum += v
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  if (max - min < 32) return false
  const mean = sum / (PATCH * PATCH)
  let structured = 0
  for (let j = 0; j < PATCH; j++) {
    const row = (py + j) * width + px
    for (let i = 0; i < PATCH; i++) {
      if (Math.abs(data[row + i] - mean) > 8) structured++
    }
  }
  return structured >= 12
}

/** Distinctive reference patches on a CANDIDATE_STRIDE grid, with hashes unique among themselves. */
function collectReferencePatches(ref: GrayImage): Patch[] {
  const patches: Patch[] = []
  forEachWindowHash(ref, (x, y, hash) => {
    if (x % CANDIDATE_STRIDE !== 0 || y % CANDIDATE_STRIDE !== 0) return
    if (isDistinctive(ref, x, y)) patches.push({ x, y, hash })
  })

  // Drop patches whose content repeats elsewhere on the grid - they can't vote unambiguously
  const counts = new Map<number, number>()
  for (const p of patches) counts.set(p.hash, (counts.get(p.hash) ?? 0) + 1)
  return patches.filter((p) => counts.get(p.hash) === 1)
}

function patchesEqual(a: GrayImage, ax: number, ay: number, b: GrayImage, bx: number, by: number): boolean {
  for (let j = 0; j < PATCH; j++) {
    const ra = (ay + j) * a.width + ax
    const rb = (by + j) * b.width + bx
    for (let i = 0; i < PATCH; i++) {
      if (a.data[ra + i] !== b.data[rb + i]) return false
    }
  }
  return true
}

const SHIFT_OFFSET = 1 << 15
const encodeShift = (dx: number, dy: number) => (dx + SHIFT_OFFSET) * 65536 + (dy + SHIFT_OFFSET)
const decodeShift = (key: number): Shift => ({
  dx: Math.floor(key / 65536) - SHIFT_OFFSET,
  dy: (key % 65536) - SHIFT_OFFSET,
})

/** Scans every window of the target and accumulates votes for the shift of each exact patch match. */
function voteShifts(ref: GrayImage, target: GrayImage, patches: Patch[]): Map<number, number> {
  const index = new Map<number, number>()
  // 2^24-bit prefilter so most windows skip the Map lookup
  const bloom = new Uint32Array(1 << 19)
  patches.forEach((p, i) => {
    index.set(p.hash, i)
    const b = p.hash >>> 8
    bloom[b >>> 5] |= 1 << (b & 31)
  })

  const matches: number[][] = patches.map(() => [])
  forEachWindowHash(target, (x, y, hash) => {
    const b = hash >>> 8
    if (!(bloom[b >>> 5] & (1 << (b & 31)))) return
    const idx = index.get(hash)
    if (idx === undefined) return
    const list = matches[idx]
    if (list.length > MAX_MATCHES_PER_PATCH) return
    const p = patches[idx]
    if (!patchesEqual(ref, p.x, p.y, target, x, y)) return
    list.push(encodeShift(x - p.x, y - p.y))
  })

  // A patch matching in several places splits its single vote between them;
  // patches matching too many places are ignored
  const votes = new Map<number, number>()
  for (const list of matches) {
    if (list.length === 0 || list.length > MAX_MATCHES_PER_PATCH) continue
    const weight = 1 / list.length
    for (const key of list) votes.set(key, (votes.get(key) ?? 0) + weight)
  }
  return votes
}

/** Returns the winning shift if it has enough votes and a clear margin over the runner-up. */
function pickConsensus(votes: Map<number, number>, minVotes: number, minRatio: number): Shift | null {
  let bestKey = -1
  let best = 0
  let second = 0
  for (const [key, v] of votes) {
    if (v > best) {
      second = best
      best = v
      bestKey = key
    } else if (v > second) {
      second = v
    }
  }
  if (bestKey < 0 || best < minVotes || best < minRatio * second) return null
  return decodeShift(bestKey)
}

// ---------------------------------------------------------------------------
// Approximate coarse-to-fine fallback
// ---------------------------------------------------------------------------

const COARSE_MAX_DIM = 64
const MATCH_TOLERANCE = 10
const MIN_OVERLAP_FRACTION = 0.5
const MIN_APPROX_SCORE = 0.3

function downsample(img: GrayImage): GrayImage {
  const width = Math.max(1, img.width >> 1)
  const height = Math.max(1, img.height >> 1)
  const data = new Uint8Array(width * height)
  const sw = img.width
  for (let y = 0; y < height; y++) {
    const y0 = Math.min(img.height - 1, y * 2)
    const y1 = Math.min(img.height - 1, y * 2 + 1)
    for (let x = 0; x < width; x++) {
      const x0 = Math.min(sw - 1, x * 2)
      const x1 = Math.min(sw - 1, x * 2 + 1)
      data[y * width + x] =
        (img.data[y0 * sw + x0] + img.data[y0 * sw + x1] + img.data[y1 * sw + x0] + img.data[y1 * sw + x1] + 2) >> 2
    }
  }
  return { data, width, height }
}

/** Fraction of (sampled) overlapping pixels that nearly match, or -1 if the overlap is too small. */
function scoreShift(ref: GrayImage, target: GrayImage, dx: number, dy: number): number {
  const x0 = Math.max(0, -dx)
  const y0 = Math.max(0, -dy)
  const x1 = Math.min(ref.width, target.width - dx)
  const y1 = Math.min(ref.height, target.height - dy)
  const ow = x1 - x0
  const oh = y1 - y0
  if (ow < MIN_OVERLAP_FRACTION * Math.min(ref.width, target.width)) return -1
  if (oh < MIN_OVERLAP_FRACTION * Math.min(ref.height, target.height)) return -1

  // Sample at most ~250k pixels per evaluation
  const step = Math.max(1, Math.floor(Math.sqrt((ow * oh) / 250000)))
  let matched = 0
  let total = 0
  for (let y = y0; y < y1; y += step) {
    const rr = y * ref.width
    const tr = (y + dy) * target.width + dx
    for (let x = x0; x < x1; x += step) {
      if (Math.abs(ref.data[rr + x] - target.data[tr + x]) <= MATCH_TOLERANCE) matched++
      total++
    }
  }
  return total > 0 ? matched / total : -1
}

function approximateShift(ref: GrayImage, target: GrayImage): Shift | null {
  // Build pyramids with the same number of levels for both images
  const refLevels = [ref]
  const targetLevels = [target]
  while (
    Math.max(refLevels[0].width, refLevels[0].height, targetLevels[0].width, targetLevels[0].height) > COARSE_MAX_DIM &&
    Math.min(refLevels[0].width, refLevels[0].height, targetLevels[0].width, targetLevels[0].height) > 8
  ) {
    refLevels.unshift(downsample(refLevels[0]))
    targetLevels.unshift(downsample(targetLevels[0]))
  }

  // Exhaustive search at the coarsest level, keeping the best few distinct candidates
  const cr = refLevels[0]
  const ct = targetLevels[0]
  const scored: { dx: number; dy: number; score: number }[] = []
  for (let dy = -cr.height + 1; dy < ct.height; dy++) {
    for (let dx = -cr.width + 1; dx < ct.width; dx++) {
      const score = scoreShift(cr, ct, dx, dy)
      if (score >= 0) scored.push({ dx, dy, score })
    }
  }
  scored.sort((a, b) => b.score - a.score)
  const seeds: Shift[] = []
  for (const s of scored) {
    if (seeds.every((t) => Math.abs(t.dx - s.dx) > 1 || Math.abs(t.dy - s.dy) > 1)) seeds.push(s)
    if (seeds.length >= 3) break
  }

  // Refine each candidate down the pyramid
  let best: Shift | null = null
  let bestScore = -1
  for (const seed of seeds) {
    let shift = seed
    let score = -1
    for (let level = 0; level < refLevels.length; level++) {
      if (level > 0) shift = { dx: shift.dx * 2, dy: shift.dy * 2 }
      const radius = level === 0 ? 0 : 2
      let levelBest = shift
      let levelScore = -1
      for (let ddy = -radius; ddy <= radius; ddy++) {
        for (let ddx = -radius; ddx <= radius; ddx++) {
          const s = scoreShift(refLevels[level], targetLevels[level], shift.dx + ddx, shift.dy + ddy)
          if (s > levelScore) {
            levelScore = s
            levelBest = { dx: shift.dx + ddx, dy: shift.dy + ddy }
          }
        }
      }
      shift = levelBest
      score = levelScore
    }
    if (score > bestScore) {
      bestScore = score
      best = shift
    }
  }

  return best && bestScore >= MIN_APPROX_SCORE ? best : null
}
