import { useState } from "react";
import { FiEye, FiEyeOff } from "react-icons/fi";

// Drop-in replacement for <input type="password">, with a show/hide toggle.
// Accepts the same props (value, onChange, id, placeholder, className, ...)
// so existing call sites only need their <input> tag swapped for this one.
export function PasswordInput({ className = "", ...rest }) {
  const [show, setShow] = useState(false);

  return (
    <div className="relative">
      <input type={show ? "text" : "password"} className={`pr-10 ${className}`} {...rest} />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((v) => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      >
        {show ? <FiEyeOff size={15} /> : <FiEye size={15} />}
      </button>
    </div>
  );
}
