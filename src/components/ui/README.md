# `components/ui` — shared primitives

Before this folder existed, the app's recurring surfaces were copy-pasted class
strings: the same text field written out 18 times, the same dashed empty state
16 times, the same uppercase section label 30 times. That is why the pillars
drifted into looking like five slightly different apps, and why any styling
tweak meant a find-and-replace across a hundred files.

Each primitive here ships in two forms:

| Form | Use it for |
|---|---|
| **A class constant** (`FIELD_CLASS`) | Existing markup. Swapping a literal for the constant is a pure substitution — no DOM change, no risk. |
| **A component** (`<Input>`) | New markup. Fewer moving parts at the call site. |

Adopting the constant is what the migration commits do; new code should reach
for the component.

## The one rule: `className` is additive

`cn()` (`@/lib/cn`) joins and filters — it does **not** merge Tailwind classes,
because this repo ships no styling dependencies and adding `clsx` +
`tailwind-merge` to a PWA to solve a problem the API can avoid isn't a trade
worth making.

So `className` on a primitive is for **layout** — margin, width, grid
placement. Picking appearance is the component's own props. Passing
`bg-*`/`text-*` to override a variant is undefined behaviour: Tailwind resolves
conflicts by stylesheet order, not class order.

```tsx
<Input className="mt-4" />        // ✅ layout
<Input className="bg-red-500" />  // ❌ undefined — add a prop instead
```

## Theming

Primitives use the ordinary `slate-*`/`blue-*` utilities and get light and dark
for free from the token map in `globals.css`. The rule from `CLAUDE.md` applies
here too: **never pair a literal `white`/`black` with a ramp token on the same
element** — literals don't theme, so the pair breaks in one mode.

## Not here yet: `Button`

Deliberately. The app's buttons are genuinely inconsistent — the primary style
is `px-4` and carries `transition`, the danger style is `px-3` and doesn't, and
the ghost pill appears with three different padding/weight combinations. A
shared `Button` cannot reproduce all of them, so extracting one *changes
pixels*.

That is a normalisation worth doing, but it needs to land as its own reviewable
commit where the before/after is the point — not smuggled into an extraction
that is otherwise a provable no-op.
