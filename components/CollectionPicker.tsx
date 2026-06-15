"use client";

import type { CollectionWithMeta } from "@/lib/collections";

type CollectionPickerProps = {
  collections: CollectionWithMeta[];
  value: string;
  onChange: (collectionId: string) => void;
  disabled?: boolean;
  loading?: boolean;
};

export default function CollectionPicker({
  collections,
  value,
  onChange,
  disabled = false,
  loading = false,
}: CollectionPickerProps) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">Add to Collection</span>
      <span className="mt-0.5 block text-[11px] text-muted">Optional — organize this spot in a personal collection.</span>
      <select
        value={value}
        disabled={disabled || loading}
        onChange={(event) => onChange(event.target.value)}
        className="sd-input mt-2"
      >
        <option value="">None</option>
        {collections.map((collection) => (
          <option key={collection.id} value={collection.id}>
            {collection.name}
          </option>
        ))}
      </select>
      {loading ? <p className="mt-1.5 text-[11px] text-muted">Loading collections…</p> : null}
      {!loading && collections.length === 0 ? (
        <p className="mt-1.5 text-[11px] text-muted">Create a collection on your profile to use this.</p>
      ) : null}
    </label>
  );
}
