/** Viewport-safe box for a dropdown under a trigger. */
export function placeAttentionPanel(
  button: { left: number; right: number; top: number; bottom: number },
  viewport: { width: number; height: number },
  panel: { width: number; maxHeight: number } = { width: 340, maxHeight: 420 },
  gap = 8,
  margin = 12,
): { left: number; top: number; width: number; maxHeight: number } {
  const width = Math.min(panel.width, Math.max(0, viewport.width - margin * 2));
  let left = button.left;
  if (left + width > viewport.width - margin) {
    left = button.right - width;
  }
  if (left < margin) left = margin;

  const below = viewport.height - button.bottom - gap - margin;
  const above = button.top - gap - margin;
  const openBelow = below >= 160 || below >= above;
  if (openBelow) {
    return {
      left,
      top: button.bottom + gap,
      width,
      maxHeight: Math.min(panel.maxHeight, Math.max(120, below)),
    };
  }
  const maxHeight = Math.min(panel.maxHeight, Math.max(120, above));
  return {
    left,
    top: Math.max(margin, button.top - gap - maxHeight),
    width,
    maxHeight,
  };
}
