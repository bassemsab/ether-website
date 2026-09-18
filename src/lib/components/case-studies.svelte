<script lang="ts">
  interface CaseStudy {
    title: string;
    sector: string;
    summary: string;
    metrics: string[];
    image: string;
    url?: string;
    badge?: string;
    deploymentNote?: string;
  }

  interface Props {
    studies: CaseStudy[];
  }

  let { studies }: Props = $props();
</script>

<div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
  {#each studies as project (project.title)}
    <article class="retro-card overflow-hidden flex flex-col justify-between">
      <div>
        <div class="relative aspect-[4/3] w-full overflow-hidden bg-black/[0.04] dark:bg-white/[0.02]">
          <img
            src={project.image}
            alt={project.title}
            width={800}
            height={600}
            class="h-full w-full object-cover transition-transform duration-700 hover:scale-[1.05]"
          />
          {#if project.badge}
            <div class="absolute top-3 right-3">
              <span class="inline-flex items-center gap-1.5 rounded-full bg-black/75 backdrop-blur-md px-2.5 py-0.5 text-[10px] font-mono font-medium text-white border border-white/15 shadow-sm">
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true"></span>
                <span>{project.badge}</span>
              </span>
            </div>
          {/if}
        </div>
        <div class="space-y-3 p-5 sm:p-6">
          <p class="text-[11px] uppercase tracking-[0.2em] text-brand/80 font-mono">
            {project.sector}
          </p>
          <h3 class="font-display text-xl">{project.title}</h3>
          <p class="text-xs text-muted-foreground leading-relaxed">{project.summary}</p>
          <ul class="space-y-1.5 text-xs text-muted-foreground/80 pt-1">
            {#each project.metrics as metric (metric)}
              <li class="flex items-start gap-2.5">
                <span class="h-1.5 w-3.5 rounded-full bg-accent/80 shrink-0 mt-1" aria-hidden="true"></span>
                <span>{metric}</span>
              </li>
            {/each}
          </ul>
        </div>
      </div>
      {#if project.url}
        <div class="px-5 pb-5 pt-1 sm:px-6 sm:pb-6">
          <a
            href={project.url}
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-surface/80 px-3.5 py-1.5 text-xs font-mono text-foreground transition-colors hover:border-brand hover:bg-brand/5 hover:text-brand"
          >
            <span>{project.url.replace(/^https?:\/\//, '')}</span>
            <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      {:else if project.deploymentNote}
        <div class="px-5 pb-5 pt-1 sm:px-6 sm:pb-6">
          <a
            href="#contact"
            class="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand/5 px-3.5 py-1.5 text-xs font-mono text-brand transition-colors hover:border-brand hover:bg-brand/10"
          >
            <span class="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
            <span>{project.deploymentNote}</span>
            <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        </div>
      {/if}
    </article>
  {/each}
</div>
