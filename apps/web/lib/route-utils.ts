/** Extract the last path segment from a URL pathname (the dynamic [id] parameter). */
export function getPathId(pathname: string): string {
  return pathname.split("/").at(-1) ?? "";
}
