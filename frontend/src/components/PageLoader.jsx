import React from 'react';

// Full-page loading state -- for when nothing else on the page has rendered
// yet (auth gate, a Settings page waiting on the profile). Not for in-table
// loading, which correctly keeps the page's header/toolbar visible while only
// the table body waits on data.
export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      {label && <p className="text-gray-500 text-sm">{label}</p>}
    </div>
  );
}
