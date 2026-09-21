export type VisitPhoto = {
  category: string;
  visitId: string;
  filename: string;
  mimeType: string;
};

/** After shots first — that's what the customer should see on the bill. Cap at 4. */
export function selectDayPhotoRecap(photos: VisitPhoto[], limit = 4): VisitPhoto[] {
  const after = photos.filter((p) => p.category === "after");
  const before = photos.filter((p) => p.category === "before");
  return [...after, ...before].slice(0, limit);
}

export function visitMediaPath(visitId: string, filename: string): string {
  return `/app/uploads/visits/${visitId}/${filename}`;
}
