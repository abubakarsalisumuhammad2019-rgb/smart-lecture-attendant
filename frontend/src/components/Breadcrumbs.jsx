import { Link } from "react-router-dom";

// items: [{ label, to? }] -- the last item (or any item without a `to`) is
// rendered as plain text since it's the current page and has nowhere to link.
export function Breadcrumbs({ items }) {
  return (
    <p>
      Pages
      {items.map((item, idx) => {
        const isCurrent = idx === items.length - 1 || !item.to;
        return (
          <span key={idx}>
            {" / "}
            {isCurrent ? (
              item.label
            ) : (
              <Link to={item.to} className="hover:underline">
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </p>
  );
}
