/**
 * Multi-format Magic Byte Binary Inspector
 * Performs mathematical verification of file headers against declared MIME types.
 */

const MAGIC_SIGNATURES: Record<string, number[][]> = {
  "image/jpeg": [[0xff, 0xd8, 0xff]],
  "image/png": [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  "image/gif": [
    [0x47, 0x49, 0x46, 0x38, 0x37, 0x61], // GIF87a
    [0x47, 0x49, 0x46, 0x38, 0x39, 0x61], // GIF89a
  ],
  "application/pdf": [
    [0x25, 0x50, 0x44, 0x46], // %PDF
  ],
  "application/zip": [
    [0x50, 0x4b, 0x03, 0x04], // PK..
    [0x50, 0x4b, 0x05, 0x06],
    [0x50, 0x4b, 0x07, 0x08],
  ],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    [0x50, 0x4b, 0x03, 0x04], // DOCX is a zip container
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    [0x50, 0x4b, 0x03, 0x04], // XLSX is a zip container
  ],
};

export function verifyMagicBytes(
  buffer: Buffer,
  declaredMimeType: string
): boolean {
  if (!buffer || buffer.length === 0) return false;

  // Plain text validation: all bytes should be printable ASCII or valid UTF-8
  if (declaredMimeType === "text/plain") {
    for (let i = 0; i < Math.min(buffer.length, 32); i++) {
      const byte = buffer[i];
      // Check for control characters (except newline, tab, carriage return)
      if (byte < 0x09 || (byte > 0x0d && byte < 0x20 && byte !== 0x1b)) {
        return false;
      }
    }
    return true;
  }

  // WebP verification (RIFF....WEBP)
  if (declaredMimeType === "image/webp") {
    if (buffer.length < 12) return false;
    const riff = buffer.subarray(0, 4).toString("ascii") === "RIFF";
    const webp = buffer.subarray(8, 12).toString("ascii") === "WEBP";
    return riff && webp;
  }

  // AVIF verification (....ftypavif or ....ftypavis)
  if (declaredMimeType === "image/avif") {
    if (buffer.length < 12) return false;
    const ftyp = buffer.subarray(4, 8).toString("ascii") === "ftyp";
    const avif = buffer.subarray(8, 12).toString("ascii") === "avif";
    const avis = buffer.subarray(8, 12).toString("ascii") === "avis";
    return ftyp && (avif || avis);
  }

  // SVG verification (<svg or <?xml ... <svg)
  if (declaredMimeType === "image/svg+xml") {
    const textHeader = buffer.subarray(0, 64).toString("utf-8").trim().toLowerCase();
    return textHeader.startsWith("<svg") || textHeader.startsWith("<?xml") || textHeader.includes("<svg");
  }

  const signatures = MAGIC_SIGNATURES[declaredMimeType];
  if (!signatures || signatures.length === 0) {
    // If no signature is defined for this MIME, treat as non-binary or bypass if allowed
    return true;
  }

  return signatures.some((sig) =>
    sig.every((byte, index) => index < buffer.length && buffer[index] === byte)
  );
}
