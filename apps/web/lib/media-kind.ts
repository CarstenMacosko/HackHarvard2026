// Some browsers leave File.type empty (e.g. for .MOV or .HEIC on desktop): fall back to the extension.
const EXTENSIONS = { image: /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i, video: /\.(mov|mp4|m4v|webm|3gp|mkv|avi)$/i };

export function isMediaKind(f: File, kind: "image" | "video"): boolean {
  return f.type.startsWith(`${kind}/`) || (!f.type && EXTENSIONS[kind].test(f.name));
}
