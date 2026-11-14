// Client-safe helpers for matching the current path to navigation items.

type MatchableItem = {
  label: string;
  href?: string;
  children?: MatchableItem[];
};

function hrefMatches(href: string, pathname: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Returns the href of the deepest/longest navigation item that matches the
 * path, so /admission/applicants/12 highlights "Applicant" (/admission) and
 * /admission/enrollment-verification/5 highlights "Enrollment Verification".
 */
export function findActiveHref(items: MatchableItem[], pathname: string) {
  let best: string | null = null;

  const visit = (list: MatchableItem[]) => {
    for (const item of list) {
      if (item.href && hrefMatches(item.href, pathname)) {
        if (!best || item.href.length > best.length) best = item.href;
      }
      if (item.children) visit(item.children);
    }
  };

  visit(items);
  return best;
}

/** Labels from the root to the item with the given href. */
export function findTrail(
  items: MatchableItem[],
  href: string | null,
  parents: string[] = [],
): string[] | null {
  if (!href) return null;

  for (const item of items) {
    const trail = [...parents, item.label];
    if (item.href === href) return trail;
    if (item.children) {
      const found = findTrail(item.children, href, trail);
      if (found) return found;
    }
  }

  return null;
}

export function containsHref(item: MatchableItem, href: string | null): boolean {
  if (!href) return false;
  if (item.href === href) return true;
  return item.children?.some((child) => containsHref(child, href)) ?? false;
}
