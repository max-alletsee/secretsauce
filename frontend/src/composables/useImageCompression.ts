// frontend/src/composables/useImageCompression.ts

/**
 * Upload ceiling for recipe images, in bytes.
 *
 * Deliberately below the backend's 10 MB `_MAX_IMAGE_SIZE`
 * (app/api/routes/import_tasks.py) so a compressed result never lands exactly on
 * the server's boundary. nginx allows 12M, above both, so oversized uploads get
 * the API's JSON error rather than nginx's HTML 413.
 */
export const MAX_UPLOAD_BYTES = 9 * 1024 * 1024

/**
 * Re-encode quality steps, tried in order at each dimension.
 * Lower quality is preferred over lower resolution: keeping pixels legible
 * matters more to the AI extracting recipe text than absolute fidelity does.
 */
const QUALITY_LADDER = [0.85, 0.7, 0.55]

/** Long-edge pixel budgets, tried in order once the quality ladder is exhausted. */
const DIMENSION_LADDER = [2048, 1536, 1024]

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', quality))
}

/** Swap any extension for .jpg — the compressed bytes are always JPEG. */
function toJpegName(name: string): string {
  const base = name.replace(/\.[^./\\]+$/, '')
  return `${base || 'photo'}.jpg`
}

/**
 * Shrink `file` only if it exceeds `maxBytes`.
 *
 * A file already within the limit is returned untouched — same object, no decode,
 * no re-encode, no quality loss. That is the common case (library photos,
 * screenshots) and the fast path here keeps it lossless.
 *
 * Oversized files are re-encoded as JPEG, stepping down the quality ladder and
 * then the dimension ladder, checking the real encoded byte length each time.
 * A single fixed guess is not enough: encoded size does not fall predictably with
 * pixel dimensions, and HEIC input re-encoded to JPEG can even grow.
 *
 * Fails open — if the browser cannot decode or encode the image (e.g. HEIC on a
 * desktop browser), the original file is returned and the upload proceeds. A
 * compression failure must not block an import that might otherwise succeed.
 */
export async function compressImageIfNeeded(
  file: File,
  maxBytes: number = MAX_UPLOAD_BYTES,
): Promise<File> {
  if (file.size <= maxBytes) return file

  try {
    const bitmap = await createImageBitmap(file)
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return file

    try {
      let prevWidth = -1
      let prevHeight = -1

      for (const maxEdge of DIMENSION_LADDER) {
        // Never upscale a photo that is already smaller than the budget.
        const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
        const targetWidth = Math.round(bitmap.width * scale)
        const targetHeight = Math.round(bitmap.height * scale)

        // Once the long edge is already under a rung's budget, every smaller
        // rung clamps to the same pixel size — skip the redundant re-encode.
        if (targetWidth === prevWidth && targetHeight === prevHeight) continue
        prevWidth = targetWidth
        prevHeight = targetHeight

        canvas.width = targetWidth
        canvas.height = targetHeight
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

        for (const quality of QUALITY_LADDER) {
          const blob = await encode(canvas, quality)
          // A null blob means the encoder itself failed (e.g. canvas OOM on a
          // low-end phone) — retrying at other qualities/dimensions will not
          // help, so stop the whole ladder rather than burning every rung.
          if (!blob) return file
          if (blob.size <= maxBytes) {
            return new File([blob], toJpegName(file.name), {
              type: 'image/jpeg',
              lastModified: Date.now(),
            })
          }
        }
      }
    } finally {
      bitmap.close?.()
    }

    // Ladder exhausted — hand back the original and let the server decide.
    return file
  } catch {
    return file
  }
}
