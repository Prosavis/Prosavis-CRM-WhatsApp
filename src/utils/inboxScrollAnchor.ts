export const INBOX_SCROLL_EDGE_PX = 80;

export function isScrolledAwayFromBottom(
  node: { scrollHeight: number; scrollTop: number; clientHeight: number },
  threshold = INBOX_SCROLL_EDGE_PX,
): boolean {
  return node.scrollHeight - node.scrollTop - node.clientHeight > threshold;
}

export function isScrolledAwayFromTop(
  scrollTop: number,
  threshold = INBOX_SCROLL_EDGE_PX,
): boolean {
  return scrollTop > threshold;
}
