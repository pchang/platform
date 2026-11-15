/**
 * The menu button's icon (design system spec 4.1): two lines that turn into an X while the sidebar is open. The button's
 * aria-expanded drives the change in CSS, so the icon cannot disagree with what the button announces.
 */
export function MenuIcon() {
  return (
    <svg className="app-menu-icon" viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" focusable="false">
      <line className="app-menu-icon__line app-menu-icon__line--top" x1="2" y1="5" x2="14" y2="5" />
      <line className="app-menu-icon__line app-menu-icon__line--bottom" x1="2" y1="11" x2="14" y2="11" />
    </svg>
  );
}
