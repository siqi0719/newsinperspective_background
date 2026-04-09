<script lang="ts">
  import { onMount } from "svelte";
  import type { StoryComparison, StoryDetail, StoryFacetDto, StoryListItem } from "@news/shared";

  const API_BASE =
    typeof window !== "undefined"
      ? `${window.location.protocol}//${window.location.hostname}:4400`
      : "http://localhost:4400";
  const STORIES_PER_DAY = 10;

  interface DaySection {
    date: string;
    categories: string[];
    selectedCategory: string;
    stories: StoryListItem[];
    selectedStory: StoryDetail | null;
    comparison: StoryComparison | null;
    loading: boolean;
    error: string;
  }

  let dates: string[] = [];
  let startDate = "";
  let preferredRegion = "";
  let settingsOpen = false;
  let daySections: DaySection[] = [];
  let globalError = "";
  let loadingNextDate = false;
  let nextDateCursor = 0;
  let infiniteObserver: IntersectionObserver | null = null;

  function formatDateRange(dateFrom: string, dateUntil: string): string {
    return dateFrom === dateUntil ? dateFrom : `${dateFrom} to ${dateUntil}`;
  }

  function extractRegion(category: string | null): string {
    return category?.split(" | ")[0]?.trim() ?? "";
  }

  function formatCategoryLabel(category: string | null): string {
    if (!category) return "All";
    const parts = category.split(" | ").map((value) => value.trim()).filter(Boolean);
    return parts[parts.length - 1] ?? category;
  }

  function normalizeScopeLabel(value: string | null | undefined): string {
    return (value ?? "").trim().toLowerCase();
  }

  function formatScopeLabel(region: string | null | undefined, category: string | null | undefined): string {
    const formattedCategory = formatCategoryLabel(category ?? null);
    const formattedRegion = (region ?? "").trim();
    const same = normalizeScopeLabel(formattedRegion) !== "" &&
      normalizeScopeLabel(formattedRegion) === normalizeScopeLabel(formattedCategory);

    if (same) return formattedCategory;
    if (formattedRegion && formattedCategory) return `${formattedRegion} · ${formattedCategory}`;
    return formattedRegion || formattedCategory || "General";
  }

  function storySourceTotal(section: DaySection): number {
    return section.stories.reduce((sum, story) => sum + story.sourceCount, 0);
  }

  function storyArticleTotal(section: DaySection): number {
    return section.stories.reduce((sum, story) => sum + story.articleCount, 0);
  }

  function updateSection(date: string, updater: (section: DaySection) => DaySection): void {
    daySections = daySections.map((section) =>
      section.date === date ? updater(section) : section,
    );
  }

  function getSection(date: string): DaySection | undefined {
    return daySections.find((section) => section.date === date);
  }

  async function fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  async function fetchStoriesForDay(date: string, category: string): Promise<StoryListItem[]> {
    const params = new URLSearchParams({
      date,
      offset: "0",
      limit: String(STORIES_PER_DAY),
    });

    if (preferredRegion) params.set("region", preferredRegion);
    if (category) params.set("category", category);

    return fetchJson<StoryListItem[]>(`/api/stories?${params.toString()}`);
  }

  async function loadStoryForSection(date: string, storyId: string): Promise<void> {
    const current = getSection(date);
    if (!current || !current.stories.some((story) => story.id === storyId)) return;

    try {
      const [selectedStory, comparison] = await Promise.all([
        fetchJson<StoryDetail>(`/api/stories/${storyId}`),
        fetchJson<StoryComparison>(`/api/stories/${storyId}/comparison`),
      ]);

      updateSection(date, (section) => {
        if (!section.stories.some((story) => story.id === storyId)) return section;
        return {
          ...section,
          selectedStory,
          comparison,
        };
      });
    } catch (value) {
      const message = value instanceof Error ? value.message : "Failed to load story";
      updateSection(date, (section) => ({
        ...section,
        error: message,
      }));
    }
  }

  async function handleCategoryChange(date: string, category: string): Promise<void> {
    const section = getSection(date);
    if (!section || section.loading) return;

    const nextCategory = section.selectedCategory === category ? "" : category;
    updateSection(date, (existing) => ({
      ...existing,
      loading: true,
      selectedCategory: nextCategory,
      selectedStory: null,
      comparison: null,
      error: "",
    }));

    try {
      const stories = await fetchStoriesForDay(date, nextCategory);
      updateSection(date, (existing) => ({
        ...existing,
        loading: false,
        stories,
      }));

      if (stories[0]) {
        await loadStoryForSection(date, stories[0].id);
      }
    } catch (value) {
      const message = value instanceof Error ? value.message : "Failed to load stories";
      updateSection(date, (existing) => ({
        ...existing,
        loading: false,
        error: message,
      }));
    }
  }

  async function appendDateSection(date: string): Promise<void> {
    const placeholder: DaySection = {
      date,
      categories: [],
      selectedCategory: "",
      stories: [],
      selectedStory: null,
      comparison: null,
      loading: true,
      error: "",
    };
    daySections = [...daySections, placeholder];

    try {
      const [facets, stories] = await Promise.all([
        fetchJson<StoryFacetDto>(`/api/facets?date=${date}`),
        fetchStoriesForDay(date, ""),
      ]);

      const categories = (facets.categories ?? []).filter(
        (category) => !preferredRegion || extractRegion(category) === preferredRegion,
      );

      updateSection(date, (section) => ({
        ...section,
        categories,
        stories,
        loading: false,
      }));

      if (stories[0]) {
        await loadStoryForSection(date, stories[0].id);
      }
    } catch (value) {
      const message = value instanceof Error ? value.message : "Failed to load date section";
      updateSection(date, (section) => ({
        ...section,
        loading: false,
        error: message,
      }));
    }
  }

  async function loadNextDateSection(): Promise<void> {
    if (loadingNextDate) return;
    if (nextDateCursor >= dates.length) return;

    loadingNextDate = true;
    const date = dates[nextDateCursor];
    nextDateCursor += 1;

    try {
      await appendDateSection(date);
    } finally {
      loadingNextDate = false;
    }
  }

  async function resetFeed(): Promise<void> {
    globalError = "";
    daySections = [];

    const startIndex = dates.indexOf(startDate);
    nextDateCursor = startIndex >= 0 ? startIndex : 0;
    await loadNextDateSection();
  }

  async function handleStartDateChange(): Promise<void> {
    await resetFeed();
  }

  async function handlePreferredRegionChange(): Promise<void> {
    await resetFeed();
  }

  function observeInfiniteScroll(node: HTMLDivElement): { destroy: () => void } {
    infiniteObserver?.disconnect();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            loadNextDateSection();
          }
        }
      },
      { rootMargin: "360px 0px" },
    );

    observer.observe(node);
    infiniteObserver = observer;

    return {
      destroy() {
        observer.disconnect();
        if (infiniteObserver === observer) {
          infiniteObserver = null;
        }
      },
    };
  }

  onMount(() => {
    (async () => {
      dates = await fetchJson<string[]>("/api/dates");
      if (!dates[0]) return;
      startDate = dates[0];
      await resetFeed();
    })().catch((value) => {
      globalError = value instanceof Error ? value.message : "Failed to initialize feed";
    });

    return () => {
      infiniteObserver?.disconnect();
    };
  });
</script>

<svelte:head>
  <title>NewsInPerspective</title>
</svelte:head>

<main class="shell">
  <section class="hero panel">
    <p class="eyebrow">NewsInPerspective</p>
    <div class="hero-row">
      <div>
        <h1>See how the same story moves across outlets, regions, and days.</h1>
        <p class="lede">
          Each date section shows its own category chooser, top story feed, and cluster explorer.
          Scroll down to load the next day.
        </p>
      </div>

      <button class="settings-button" type="button" on:click={() => (settingsOpen = !settingsOpen)}>
        <span aria-hidden="true">⚙</span>
        <span>Settings</span>
      </button>
    </div>

    {#if settingsOpen}
      <div class="settings-panel">
        <label>
          <span>Start date</span>
          <select bind:value={startDate} on:change={handleStartDateChange}>
            {#each dates as date}
              <option value={date}>{date}</option>
            {/each}
          </select>
        </label>

        <label>
          <span>Preferred region</span>
          <select bind:value={preferredRegion} on:change={handlePreferredRegionChange}>
            <option value="">All regions</option>
            {#each [...new Set(daySections.flatMap((section) => section.categories.map((category) => extractRegion(category)).filter(Boolean)))] as region}
              <option value={region}>{region}</option>
            {/each}
          </select>
        </label>
      </div>
    {/if}
  </section>

  {#if globalError}
    <p class="error">{globalError}</p>
  {/if}

  {#each daySections as section (section.date)}
    <section class="day-block panel">
      <div class="day-separator">
        <span>{section.date}</span>
      </div>

      <div class="day-head">
        <div>
          <p class="eyebrow">Top Stories</p>
          <h2>{section.date}</h2>
        </div>
        <div class="inline-stats">
          <div class="inline-stat">
            <span class="stat-label">Clusters</span>
            <strong>{section.stories.length}</strong>
          </div>
          <div class="inline-stat">
            <span class="stat-label">Sources</span>
            <strong>{storySourceTotal(section)}</strong>
          </div>
          <div class="inline-stat">
            <span class="stat-label">Articles</span>
            <strong>{storyArticleTotal(section)}</strong>
          </div>
        </div>
      </div>

      <div class="tab-row">
        <button
          class="tab"
          class:selected={!section.selectedCategory}
          on:click={() => handleCategoryChange(section.date, "")}
        >
          All
        </button>
        {#each section.categories as category}
          <button
            class="tab"
            class:selected={section.selectedCategory === category}
            on:click={() => handleCategoryChange(section.date, category)}
          >
            {formatCategoryLabel(category)}
          </button>
        {/each}
      </div>

      <div class="day-layout">
        <div class="stories-column">
          {#if section.error}
            <p class="error">{section.error}</p>
          {/if}

          {#if section.loading && section.stories.length === 0}
            <p class="loading">Loading stories...</p>
          {/if}

          {#if !section.loading && section.stories.length === 0}
            <p class="loading">No stories available for this date and category.</p>
          {/if}

          <div class="stories">
            {#each section.stories as story}
              <button
                class="story-card"
                class:active={section.selectedStory?.id === story.id}
                on:click={() => loadStoryForSection(section.date, story.id)}
              >
                <span class="meta">
                  {formatCategoryLabel(story.category)} · {story.importanceScore} score · {story.sourceCount} sources
                </span>
                <strong>{story.title}</strong>
                <span class="signals">{formatDateRange(story.dateFrom, story.dateUntil)}</span>
                <span class="story-keywords">{story.keywords.join(", ")}</span>
              </button>
            {/each}
          </div>
        </div>

        <section class="detail panel">
          {#if section.selectedStory}
            <header>
              <p class="eyebrow">
                {formatScopeLabel(section.selectedStory.region, section.selectedStory.category)}
              </p>
              <h3>{section.selectedStory.title}</h3>
              <p>
                {section.selectedStory.articleCount} articles across
                {section.selectedStory.sourceCount} sources ·
                {formatDateRange(section.selectedStory.dateFrom, section.selectedStory.dateUntil)}
              </p>
            </header>

            <div class="comparison">
              {#if section.comparison}
                <div class="chip-row">
                  {#each section.comparison.sharedKeywords as keyword}
                    <span class="chip">{keyword}</span>
                  {/each}
                </div>

                {#each section.comparison.framingSummary as line}
                  <p>{line}</p>
                {/each}
              {/if}
            </div>

            <div class="article-grid">
              {#each section.selectedStory.articles as article}
                <article>
                  <p class="meta">{article.domain} · {article.publishedAt.slice(0, 10)}</p>
                  <h4>{article.title}</h4>
                  <p>{article.summary ?? "No summary available."}</p>
                  {#if article.syndicatedDomains.length > 0}
                    <p class="signals">Syndicated on {article.syndicatedDomains.join(", ")}</p>
                  {/if}
                  <p class="signals">
                    Sentiment {article.sentiment} · Subjectivity {article.subjectivity} ·
                    {article.biasSignals.join(", ") || "no bias flags"}
                  </p>
                  <a href={article.url} target="_blank" rel="noreferrer">Read source</a>
                </article>
              {/each}
            </div>
          {:else}
            <div class="empty">
              <h3>Select a cluster</h3>
              <p>Pick a story card to inspect the cross-source detail.</p>
            </div>
          {/if}
        </section>
      </div>
    </section>
  {/each}

  <div class="load-anchor" use:observeInfiniteScroll>
    {#if loadingNextDate}
      <p>Loading next day...</p>
    {:else if nextDateCursor >= dates.length && daySections.length > 0}
      <p>No more dates.</p>
    {/if}
  </div>
</main>

<style>
  :global(:root) {
    --bg: #edf3f8;
    --panel: rgba(255, 255, 255, 0.84);
    --panel-strong: rgba(255, 255, 255, 0.96);
    --border: rgba(28, 46, 73, 0.12);
    --border-strong: rgba(37, 87, 167, 0.24);
    --text: #142033;
    --muted: #58708f;
    --accent: #0f62fe;
    --accent-soft: #dce8ff;
    --accent-strong: #0a3c96;
    --shadow: 0 20px 50px rgba(22, 43, 77, 0.12);
  }

  :global(body) {
    margin: 0;
    font-family: "IBM Plex Sans", "Avenir Next", "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at top left, rgba(84, 161, 255, 0.2), transparent 28%),
      radial-gradient(circle at top right, rgba(11, 98, 254, 0.12), transparent 34%),
      linear-gradient(180deg, var(--bg) 0%, #f7fbff 100%);
    color: var(--text);
  }

  .shell {
    max-width: 1320px;
    margin: 0 auto;
    padding: 24px 20px 60px;
  }

  .panel {
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.78));
    border: 1px solid var(--border);
    border-radius: 26px;
    box-shadow: var(--shadow);
    backdrop-filter: blur(16px);
  }

  .hero,
  .day-block {
    padding: 20px 22px;
    margin-bottom: 16px;
  }

  .hero-row,
  .day-head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 16px;
  }

  .eyebrow,
  .meta,
  .signals,
  .stat-label {
    color: var(--muted);
    font-size: 0.78rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3,
  h4 {
    margin: 0;
    letter-spacing: -0.03em;
  }

  h1 {
    margin: 6px 0 10px;
    font-size: clamp(1.45rem, 2vw, 2.2rem);
    line-height: 1.04;
    max-width: 36ch;
  }

  h2 {
    margin-top: 6px;
    font-size: 1.18rem;
  }

  h3 {
    font-size: 1.12rem;
  }

  h4 {
    font-size: 1.02rem;
    margin: 8px 0;
  }

  .lede {
    max-width: 60ch;
    margin: 0;
    color: #34455d;
    font-size: 0.93rem;
    line-height: 1.5;
  }

  .settings-button,
  .tab,
  .story-card {
    font: inherit;
  }

  .settings-button {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    border: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.76);
    color: var(--text);
    border-radius: 999px;
    padding: 10px 14px;
    cursor: pointer;
    font-weight: 600;
    white-space: nowrap;
  }

  .settings-panel {
    margin-top: 16px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 220px));
    gap: 14px;
  }

  label {
    display: grid;
    gap: 6px;
  }

  select {
    margin-top: 6px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.93);
    color: var(--text);
    font: inherit;
  }

  .day-separator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 8px 12px;
    background: linear-gradient(135deg, var(--accent-soft), rgba(207, 226, 255, 0.9));
    color: var(--accent-strong);
    font-weight: 700;
    letter-spacing: 0.02em;
    margin-bottom: 16px;
  }

  .inline-stats {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: end;
  }

  .inline-stat {
    min-width: 88px;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid var(--border-strong);
    background: linear-gradient(135deg, var(--panel-strong), rgba(220, 232, 255, 0.62));
    display: grid;
    gap: 2px;
  }

  .inline-stat strong {
    font-size: 1.2rem;
    line-height: 1;
  }

  .tab-row {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 12px 0 4px;
    margin-bottom: 10px;
  }

  .tab {
    border: 1px solid var(--border);
    background: rgba(255, 255, 255, 0.76);
    color: var(--text);
    border-radius: 999px;
    padding: 10px 14px;
    white-space: nowrap;
    font-weight: 600;
    cursor: pointer;
  }

  .tab.selected {
    background: linear-gradient(135deg, var(--accent), var(--accent-strong));
    color: #fff;
    border-color: transparent;
  }

  .day-layout {
    display: grid;
    grid-template-columns: minmax(0, 0.95fr) minmax(340px, 0.8fr);
    gap: 16px;
    align-items: start;
  }

  .stories {
    display: grid;
    gap: 12px;
  }

  .story-card {
    width: 100%;
    text-align: left;
    border: 1px solid transparent;
    border-radius: 18px;
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(238, 246, 255, 0.9));
    padding: 14px;
    display: grid;
    gap: 8px;
    cursor: pointer;
    transition:
      transform 140ms ease,
      border-color 140ms ease,
      box-shadow 140ms ease;
  }

  .story-card:hover,
  .story-card.active,
  article:hover {
    transform: translateY(-1px);
    border-color: var(--border-strong);
    box-shadow: 0 12px 24px rgba(20, 55, 111, 0.12);
  }

  .story-keywords {
    color: #3f536f;
    font-size: 0.92rem;
    line-height: 1.45;
  }

  .detail {
    padding: 16px;
  }

  .comparison {
    padding: 12px 0 18px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 16px;
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 10px;
  }

  .chip {
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-size: 0.84rem;
    font-weight: 600;
  }

  .article-grid {
    display: grid;
    gap: 12px;
    max-height: 560px;
    overflow-y: auto;
    padding-right: 6px;
  }

  article {
    padding: 14px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(242, 248, 255, 0.84));
    transition:
      transform 140ms ease,
      border-color 140ms ease,
      box-shadow 140ms ease;
  }

  article p {
    margin: 6px 0;
    color: #34445c;
    line-height: 1.52;
  }

  article a {
    color: var(--accent);
    font-weight: 700;
    text-decoration: none;
  }

  article a:hover {
    text-decoration: underline;
  }

  .loading,
  .empty {
    color: var(--muted);
  }

  .empty {
    min-height: 180px;
    display: grid;
    place-content: center;
    text-align: center;
  }

  .error {
    margin: 0 0 12px;
    color: #b42318;
  }

  .load-anchor {
    min-height: 56px;
    display: grid;
    place-items: center;
    color: var(--muted);
  }

  @media (max-width: 980px) {
    .hero-row,
    .day-head,
    .day-layout {
      grid-template-columns: 1fr;
      display: grid;
    }

    .settings-panel {
      grid-template-columns: 1fr;
    }

    .inline-stats {
      justify-content: start;
    }

    .article-grid {
      max-height: none;
      overflow: visible;
      padding-right: 0;
    }
  }
</style>
