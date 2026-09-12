export type FileCategory = "code" | "sqlite" | "image" | "media" | "binary";

export const SQLITE_EXTENSIONS = new Set(["db", "sqlite", "sqlite3"]);
export const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "ico",
  "bmp",
  "svg",
]);
export const MEDIA_EXTENSIONS = new Set(["mp4", "webm", "ogg", "mp3", "wav", "m4a"]);
export const OTHER_BINARY_EXTENSIONS = new Set([
  "woff",
  "woff2",
  "ttf",
  "eot",
  "otf",
  "wasm",
  "pdf",
  "zip",
  "tar",
  "gz",
  "rar",
  "7z",
  "iso",
  "bin",
  "exe",
  "so",
  "dylib",
  "dll",
]);

export function getFileCategory(filename: string): FileCategory {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (SQLITE_EXTENSIONS.has(ext)) return "sqlite";
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (MEDIA_EXTENSIONS.has(ext)) return "media";
  if (OTHER_BINARY_EXTENSIONS.has(ext)) return "binary";
  return "code";
}

export function isBinaryFile(filename: string): boolean {
  const cat = getFileCategory(filename);
  if (cat === "image" && filename.toLowerCase().endsWith(".svg")) return false;
  return cat !== "code";
}
