import React from 'react';

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  submitting = false,
  onConfirm,
  onClose,
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-1">{title}</h2>
        {message && <p className="text-sm text-gray-500 mb-4">{message}</p>}

        <div className="border-t border-gray-100 pt-3 mt-4 flex justify-end gap-3">
          <button onClick={onClose} className="text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className={`rounded-xl px-6 py-2 font-bold text-white disabled:opacity-50 ${
              danger
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-gradient-to-r from-blue-700 to-blue-600 hover:opacity-90'
            }`}
          >
            {submitting ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
