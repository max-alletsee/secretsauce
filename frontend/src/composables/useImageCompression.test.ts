// frontend/src/composables/useImageCompression.test.ts
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { compressImageIfNeeded, MAX_UPLOAD_BYTES } from './useImageCompression'

/** Build a File of an exact byte length. */
function fileOfSize(bytes: number, name = 'photo.jpg', type = 'image/jpeg'): File {
  return new File([new Uint8Array(bytes)], name, { type })
}

/**
 * Stub the canvas/bitmap APIs jsdom lacks.
 * `encodedSizes` yields the byte size each successive toBlob call should produce,
 * letting a test drive the ladder to a chosen outcome.
 */
function stubImagePipeline(encodedSizes: number[]) {
  const toBlob = vi.fn((cb: (b: Blob | null) => void) => {
    const size = encodedSizes.shift() ?? 1_000
    cb(new Blob([new Uint8Array(size)], { type: 'image/jpeg' }))
  })
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4032, height: 3024, close: vi.fn() })),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
    toBlob as unknown as HTMLCanvasElement['toBlob'],
  )
  return { toBlob }
}

describe('compressImageIfNeeded', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns the identical file object when it is already under the limit', async () => {
    const file = fileOfSize(1024)
    const createImageBitmap = vi.fn()
    vi.stubGlobal('createImageBitmap', createImageBitmap)

    const result = await compressImageIfNeeded(file, MAX_UPLOAD_BYTES)

    // Identity check: proves no decode/re-encode happened on the fast path.
    expect(result).toBe(file)
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('returns the identical file object when it is exactly at the limit', async () => {
    const file = fileOfSize(2048)
    const result = await compressImageIfNeeded(file, 2048)
    expect(result).toBe(file)
  })

  it('compresses an oversized file down to within the limit', async () => {
    stubImagePipeline([500])
    const file = fileOfSize(4096)

    const result = await compressImageIfNeeded(file, 1024)

    expect(result).not.toBe(file)
    expect(result.size).toBeLessThanOrEqual(1024)
  })

  it('names the compressed output .jpg so the backend extension allowlist accepts it', async () => {
    stubImagePipeline([500])
    const file = fileOfSize(4096, 'IMG_1234.HEIC', 'image/heic')

    const result = await compressImageIfNeeded(file, 1024)

    expect(result.name).toBe('IMG_1234.jpg')
    expect(result.type).toBe('image/jpeg')
  })

  it('steps down the ladder until the encoded result fits', async () => {
    // First two encodes are still too big; the third fits.
    const { toBlob } = stubImagePipeline([5000, 3000, 800])
    const file = fileOfSize(9999)

    const result = await compressImageIfNeeded(file, 1024)

    expect(toBlob).toHaveBeenCalledTimes(3)
    expect(result.size).toBeLessThanOrEqual(1024)
  })

  it('returns the original file when decoding fails (fail open)', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('unsupported format')
      }),
    )
    const file = fileOfSize(4096, 'IMG_1234.HEIC', 'image/heic')

    const result = await compressImageIfNeeded(file, 1024)

    expect(result).toBe(file)
  })

  it('returns the original file when the ladder never produces a small enough result', async () => {
    // Every encode stays over the limit.
    stubImagePipeline(Array(20).fill(9_000))
    const file = fileOfSize(9999)

    const result = await compressImageIfNeeded(file, 1024)

    expect(result).toBe(file)
  })

  it('exports a limit below the backend 10 MB cap', () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(10 * 1024 * 1024)
  })

  it('skips redundant dimension rungs when the image is already small in pixels', async () => {
    // Long edge (800) is below every DIMENSION_LADDER rung (2048/1536/1024), so
    // scale clamps to 1 at each rung and the canvas size never changes after
    // the first pass. Only the first rung's 3 quality passes should encode.
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => {
      // Always too big, so the ladder runs to exhaustion.
      cb(new Blob([new Uint8Array(9_000)], { type: 'image/jpeg' }))
    })
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      toBlob as unknown as HTMLCanvasElement['toBlob'],
    )

    const file = fileOfSize(9999, 'small-pixels.png', 'image/png')
    const result = await compressImageIfNeeded(file, 1024)

    expect(toBlob).toHaveBeenCalledTimes(3)
    expect(result).toBe(file)
  })

  it('stops the whole ladder and returns the original file the moment toBlob yields null', async () => {
    const toBlob = vi.fn((cb: (b: Blob | null) => void) => cb(null))
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4032, height: 3024, close: vi.fn() })),
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      toBlob as unknown as HTMLCanvasElement['toBlob'],
    )

    const file = fileOfSize(9999)
    const result = await compressImageIfNeeded(file, 1024)

    expect(result).toBe(file)
    expect(toBlob).toHaveBeenCalledTimes(1)
  })
})
