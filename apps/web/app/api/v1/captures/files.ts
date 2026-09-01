import path from "path";

export const CAPTURE_UPLOAD_ROOT = "/app/uploads/captures";

export function captureDir(id: string): string {
  return path.join(CAPTURE_UPLOAD_ROOT, id);
}

export function captureFilePath(id: string, filename: string): string | null {
  if (!filename || filename.includes("\0")) return null;
  const root = path.resolve(captureDir(id));
  const resolved = path.resolve(root, filename);
  if (!resolved.startsWith(root + path.sep)) return null;
  return resolved;
}
