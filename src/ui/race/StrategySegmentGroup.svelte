<script lang="ts">
  type SegmentOption = {
    value: string;
    label: string;
    ariaLabel?: string;
    selectedClass?: string;
  };

  type Props = {
    label: string;
    labelId?: string;
    value: string;
    options: SegmentOption[];
    disabled?: boolean;
    onSelect: (value: string) => void;
  };

  let {
    label,
    labelId = undefined,
    value,
    options,
    disabled = false,
    onSelect,
  }: Props = $props();

  const handleSelect = (next: string) => {
    if (disabled || next === value) return;
    onSelect(next);
  };

  const handleKeyDown = (next: string, e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    handleSelect(next);
  };
</script>

<div class="space-y-1">
  {#if label}
    <p id={labelId} class="font-mono text-[10px] text-slate-400">{label}</p>
  {/if}
  <div
    class="flex flex-wrap gap-1"
    role="group"
    aria-label={label || undefined}
    aria-labelledby={label ? labelId : undefined}
    aria-disabled={disabled}
  >
    {#each options as opt (opt.value)}
      {@const selected = value === opt.value}
      <button
        type="button"
        class="min-h-11 min-w-[2.75rem] flex-1 rounded-sm border px-2 py-2 font-mono text-xs tracking-wide transition disabled:cursor-not-allowed disabled:opacity-45 {selected
          ? opt.selectedClass ??
            'border-amber-400/55 bg-amber-500/20 text-amber-100'
          : 'border-white/15 bg-white/5 text-slate-300 hover:border-white/30 hover:bg-white/10'}"
        aria-pressed={selected}
        aria-label={opt.ariaLabel ?? opt.label}
        {disabled}
        onclick={() => handleSelect(opt.value)}
        onkeydown={(e) => handleKeyDown(opt.value, e)}
      >
        {opt.label}
      </button>
    {/each}
  </div>
</div>
