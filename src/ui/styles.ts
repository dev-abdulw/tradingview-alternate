/** Shared class recipes so every floating surface and menu row looks identical. */

export const surface = {
  /** Menus, popovers, selects. */
  floating:
    "z-50 rounded-popover bg-elevated text-fg shadow-popover outline-none data-[state=open]:animate-pop-in",
  /** Tooltip bubble. */
  tooltip:
    "z-[60] max-w-64 rounded-control bg-elevated px-2 py-1 text-cell text-fg shadow-popover data-[state=delayed-open]:animate-fade-in data-[state=instant-open]:animate-fade-in",
};

export const menu = {
  content: `${surface.floating} min-w-44 p-1 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto`,
  item:
    "relative flex h-8 cursor-default items-center gap-2 rounded-[5px] px-2 text-ui text-fg outline-none select-none " +
    "data-[highlighted]:bg-hover data-[disabled]:pointer-events-none data-[disabled]:text-fg-disabled " +
    "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-muted data-[highlighted]:[&_svg]:text-fg",
  /** Leaves room on the left for a check/radio indicator. */
  indicatorItem: "pl-7",
  indicator: "absolute left-2 inline-flex size-4 items-center justify-center text-accent [&_svg]:text-accent",
  label: "meta-label px-2 pt-2 pb-1",
  separator: "-mx-1 my-1 h-px bg-line",
  shortcut: "ml-auto pl-4 text-cell text-fg-subtle tracking-wide",
  destructive: "text-danger data-[highlighted]:bg-danger-muted [&_svg]:text-danger",
};

export const field =
  "h-8 w-full min-w-0 rounded-control bg-input px-2.5 text-ui text-fg outline-none ring-1 ring-line ring-inset " +
  "placeholder:text-fg-subtle transition-[box-shadow,background-color] duration-[var(--motion-fast)] " +
  "hover:ring-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent " +
  "disabled:cursor-not-allowed disabled:text-fg-disabled aria-invalid:ring-danger";
