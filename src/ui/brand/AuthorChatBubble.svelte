<script lang="ts">
  type Props = {
    name?: string;
    href?: string;
    tagline?: string;
    initials?: string;
    align?: "left" | "right";
    variant?: "fixed" | "inline";
    class?: string;
  };

  let {
    name = "Alif Asraf",
    href = "https://www.alifasraf.asia/",
    tagline = "Built by",
    initials = "AA",
    align = "right",
    variant = "fixed",
    class: className = "",
  }: Props = $props();

  const positionClass = $derived(
    variant === "inline"
      ? "absolute"
      : "fixed",
  );

  let open = $state(false);
  let rootEl: HTMLDivElement | undefined = $state();

  const handleToggle = () => {
    open = !open;
  };

  const handleClose = () => {
    open = false;
  };

  const handleTriggerKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle();
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      handleClose();
    }
  };

  $effect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootEl?.contains(event.target as Node)) handleClose();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handleClose();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  });
</script>

<div
  bind:this={rootEl}
  class="pointer-events-none {positionClass} bottom-4 z-[60] flex flex-col pb-[var(--safe-bottom)] {align === 'left'
    ? 'left-4 items-start pl-[var(--safe-left)]'
    : 'right-4 items-end pr-[var(--safe-right)]'} {className}"
>
  {#if open}
    <div
      class="pointer-events-auto relative mb-3 w-[min(17rem,calc(100vw-2rem))] rounded-2xl border border-cyan-500/30 bg-[var(--pw-panel)]/95 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.45),0_0_24px_rgba(34,211,238,0.12)] backdrop-blur-md"
      role="dialog"
      aria-modal="false"
      aria-label="{tagline} {name}"
    >
      <p class="font-mono text-[10px] tracking-[0.22em] text-cyan-300/90 uppercase">{tagline}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        class="font-display mt-1 block text-base text-white transition hover:text-cyan-200"
      >
        {name}
      </a>
      <p class="mt-1.5 text-[11px] leading-snug text-slate-400">
        Designer & developer — portfolio, contact, and more.
      </p>
      <button
        type="button"
        class="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full font-mono text-sm text-slate-400 transition hover:bg-white/10 hover:text-white"
        aria-label="Close author info"
        onclick={handleClose}
      >
        ×
      </button>
      <span
        class="absolute -bottom-2 size-4 rotate-45 border-r border-b border-cyan-500/30 bg-[var(--pw-panel)]/95 {align ===
        'left'
          ? 'left-5'
          : 'right-5'}"
        aria-hidden="true"
      ></span>
    </div>
  {/if}

  <button
    type="button"
    tabindex="0"
    class="pointer-events-auto flex size-14 items-center justify-center rounded-full border border-cyan-400/45 bg-gradient-to-br from-cyan-500/25 to-amber-500/20 font-mono text-sm font-semibold tracking-wide text-cyan-100 shadow-[0_8px_28px_rgba(0,0,0,0.4),0_0_20px_rgba(34,211,238,0.18)] transition hover:scale-105 hover:border-cyan-300/60 hover:shadow-[0_10px_32px_rgba(0,0,0,0.45),0_0_28px_rgba(34,211,238,0.28)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400/70 {open
      ? 'ring-2 ring-cyan-400/50'
      : ''}"
    aria-label="{tagline} {name}"
    aria-expanded={open}
    aria-haspopup="dialog"
    onclick={handleToggle}
    onkeydown={handleTriggerKeyDown}
  >
    {initials}
  </button>
</div>
