'use client';

export default function SelectedTagsToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="selected-tags-control">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label="Only my selected tags"
        onClick={() => onChange(!checked)}
      >
        <span className="selected-tags-switch" aria-hidden="true">
          <i />
        </span>
        <span>Only my selected tags</span>
      </button>
      <p>
        {checked
          ? 'Stick to my picks. Leave everything else out.'
          : 'Let other topics in. My exclusions still apply.'}
      </p>
    </div>
  );
}
