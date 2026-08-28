<script lang="ts">
  type LogoVariant = "mark" | "horizontal";

  interface Props {
    variant?: LogoVariant;
    class?: string;
    priority?: boolean;
  }

  let { variant = "mark", class: className = "", priority = false }: Props = $props();

  const LOGO_SOURCES: Record<LogoVariant, { src: string; width: number; height: number }> = {
    mark: { src: "/brand/logo-mark.png", width: 48, height: 48 },
    horizontal: { src: "/brand/logo-horizontal.png", width: 360, height: 80 },
  };

  const source = $derived(LOGO_SOURCES[variant]);
</script>

<img
  src={source.src}
  alt="Sepang Pit Wall"
  width={source.width}
  height={source.height}
  class={className}
  fetchpriority={priority ? "high" : "auto"}
/>
