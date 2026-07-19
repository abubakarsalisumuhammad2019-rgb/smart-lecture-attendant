import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { FiMoreVertical } from "react-icons/fi";

const MENU_WIDTH = 176; // matches w-44 below
const VIEWPORT_MARGIN = 8;

// A table row's "..." actions menu. Portaled to document.body and positioned
// from the trigger button's own bounding rect (not a plain absolute child of
// the row) because the table sits inside an overflow-x-auto wrapper -- per
// the CSS overflow spec, setting overflow-x to a non-visible value forces
// overflow-y to auto too, which would silently clip a dropdown that hangs
// below the table's natural height instead of just letting it float over
// the page like a menu should.
export function RowActionsMenu({ items }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  // Measures the button and the already-mounted (but hidden) menu, then
  // flips the menu above the button whenever there isn't enough room
  // underneath -- otherwise a row near the bottom of the page opens a menu
  // that runs off the viewport, or over unrelated content below it (e.g.
  // the page footer). Also flips horizontally if right-aligning it to the
  // button would push it past the left edge. Runs in a layout effect so the
  // reposition happens before the browser paints -- no visible jump, and
  // the menu stays visibility:hidden until a real position is computed.
  useLayoutEffect(() => {
    if (!open) return;

    const reposition = () => {
      const buttonRect = buttonRef.current?.getBoundingClientRect();
      const menuHeight = menuRef.current?.offsetHeight ?? 0;
      if (!buttonRect) return;

      const spaceBelow = window.innerHeight - buttonRect.bottom;
      const spaceAbove = buttonRect.top;
      const openUpward = spaceBelow < menuHeight + VIEWPORT_MARGIN && spaceAbove > spaceBelow;
      const top = openUpward
        ? Math.max(VIEWPORT_MARGIN, buttonRect.top - menuHeight - 4)
        : Math.min(buttonRect.bottom + 4, window.innerHeight - menuHeight - VIEWPORT_MARGIN);

      const rightAligned = buttonRect.right - MENU_WIDTH >= VIEWPORT_MARGIN;
      const left = rightAligned ? buttonRect.right - MENU_WIDTH : buttonRect.left;

      setPosition({ top, left });
    };

    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (e) => {
      if (buttonRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const handleKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  // Reset so the next open starts hidden-until-measured again, rather than
  // briefly showing the previous position before this render's layout effect
  // corrects it.
  useEffect(() => {
    if (!open) setPosition(null);
  }, [open]);

  const visibleItems = items.filter(Boolean);
  if (visibleItems.length === 0) return null;

  const itemClass = (danger) =>
    `block w-full text-left px-3 py-2 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
      danger ? "text-red-500 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"
    }`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <FiMoreVertical size={16} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? 0,
              visibility: position ? "visible" : "hidden",
            }}
            className="fixed z-50 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1"
          >
            {visibleItems.map((item, idx) =>
              item.to ? (
                <Link key={idx} role="menuitem" to={item.to} onClick={() => setOpen(false)} className={itemClass(item.danger)}>
                  {item.label}
                </Link>
              ) : (
                <button
                  key={idx}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  disabled={item.disabled}
                  className={itemClass(item.danger)}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
