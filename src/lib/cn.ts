/**
 * Join class names, dropping falsy values.
 *
 * Deliberately NOT `clsx` + `tailwind-merge`: this repo ships no UI or styling
 * dependencies, and adding two to a PWA to solve a problem the API can avoid
 * isn't a trade worth making. Because there is no merge step, a `className`
 * passed to a `ui/` component is **additive only** — use it for layout
 * (margin, width, grid placement), and pick appearance with the component's
 * own props. Passing `bg-*`/`text-*` to override a variant is undefined:
 * Tailwind resolves conflicts by stylesheet order, not class order.
 */
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

export default cn;
