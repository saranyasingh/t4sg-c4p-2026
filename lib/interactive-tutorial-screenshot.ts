/**
 * Shrink desktop screenshots before sending to Anthropic (payload limits).
 */
export async function compressScreenshotForTutorialApi(
  inputBase64Png: string,
  opts?: { maxDim?: number; quality?: number },
): Promise<{ mediaType: "image/png" | "image/jpeg"; base64: string }> {
  const maxDim = opts?.maxDim ?? 1280;
  const quality = opts?.quality ?? 0.72;

  try {
    const img = new Image();
    img.decoding = "async";
    img.src = `data:image/png;base64,${inputBase64Png}`;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image decode failed"));
    });
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) return { mediaType: "image/png", base64: inputBase64Png };

    const scale = Math.min(1, maxDim / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * scale));
    const th = Math.max(1, Math.round(h * scale));

    if (scale >= 0.999) return { mediaType: "image/png", base64: inputBase64Png };

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { mediaType: "image/png", base64: inputBase64Png };
    ctx.drawImage(img, 0, 0, tw, th);

    const jpeg = canvas.toDataURL("image/jpeg", quality);
    const out = jpeg.split(",")[1];
    if (!out) return { mediaType: "image/png", base64: inputBase64Png };
    return { mediaType: "image/jpeg", base64: out };
  } catch {
    return { mediaType: "image/png", base64: inputBase64Png };
  }
}
