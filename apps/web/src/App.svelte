<script lang="ts">
  import type { StoryComparison, StoryDetail, StoryFacetDto, StoryListItem } from "@news/shared";

  const API_BASE = "http://localhost:4400";

  let dates: string[] = [];
  let selectedDate = "";
  let facets: StoryFacetDto | null = null;
  let selectedRegion = "";
  let selectedCategory = "";
  let stories: StoryListItem[] = [];
  let selectedStory: StoryDetail | null = null;
  let comparison: StoryComparison | null = null;
  let error = "";

  async function fetchJson<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`);
    if (!response.ok) {
      throw new Error(`Request failed: ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  async function loadDates() {
    dates = await fetchJson<string[]>("/api/dates");
    if (dates[0]) {
      selectedDate = dates[0];
      await loadFacets();
      await loadStories();
    }
  }

  async function loadFacets() {
    if (!selectedDate) return;
    facets = await fetchJson<StoryFacetDto>(`/api/facets?date=${selectedDate}`);
    if (selectedRegion && !facets.regions.includes(selectedRegion)) {
      selectedRegion = "";
    }
    if (selectedCategory && !facets.categories.includes(selectedCategory)) {
      selectedCategory = "";
    }
  }

  async function loadStories() {
    if (!selectedDate) return;
    const params = new URLSearchParams({ date: selectedDate });
    if (selectedRegion) params.set("region", selectedRegion);
    if (selectedCategory) params.set("category", selectedCategory);
    stories = await fetchJson<StoryListItem[]>(`/api/stories?${params.toString()}`);
    selectedStory = null;
    comparison = null;
  }

  async function loadStory(id: string) {
    selectedStory = await fetchJson<StoryDetail>(`/api/stories/${id}`);
    comparison = await fetchJson<StoryComparison>(`/api/stories/${id}/comparison`);
  }

  async function handleDateChange() {
    selectedRegion = "";
    selectedCategory = "";
    await loadFacets();
    await loadStories();
  }

  async function handleRegionChange() {
    if (selectedCategory && !selectedCategory.startsWith(selectedRegion) && selectedRegion) {
      selectedCategory = "";
    }
    await loadStories();
  }

  async function handleCategoryChange() {
    await loadStories();
  }

  loadDates().catch((value) => {
    error = value instanceof Error ? value.message : "Failed to load stories";
  });
</script>

<svelte:head>
  <title>News In Perspective</title>
</svelte:head>

<main class="shell">
  <section class="hero">
    <p class="eyebrow">Daily News Comparison</p>
    <h1>Trace the same story across sources.</h1>
    <p class="lede">
      A backend-first student project for clustering daily RSS coverage and exposing framing,
      similarity, and bias signals across outlets.
    </p>
  </section>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  <section class="layout">
    <aside class="panel">
      <label>
        <span>Date</span>
        <select bind:value={selectedDate} on:change={handleDateChange}>
          {#each dates as date}
            <option value={date}>{date}</option>
          {/each}
        </select>
      </label>

      <label>
        <span>Region</span>
        <select bind:value={selectedRegion} on:change={handleRegionChange}>
          <option value="">All regions</option>
          {#each facets?.regions ?? [] as region}
            <option value={region}>{region}</option>
          {/each}
        </select>
      </label>

      <label>
        <span>Category</span>
        <select bind:value={selectedCategory} on:change={handleCategoryChange}>
          <option value="">All categories</option>
          {#each (facets?.categories ?? []).filter((category) => !selectedRegion || category.startsWith(selectedRegion)) as category}
            <option value={category}>{category}</option>
          {/each}
        </select>
      </label>

      <div class="stories">
        {#each stories as story}
          <button class="story-card" on:click={() => loadStory(story.id)}>
            <span class="meta">{story.region ?? "General"} · {story.sourceCount} sources</span>
            <strong>{story.title}</strong>
            <span>{story.keywords.join(", ")}</span>
          </button>
        {/each}
      </div>
    </aside>

    <section class="panel detail">
      {#if selectedStory}
        <header>
          <p class="eyebrow">{selectedStory.region ?? "General"} · {selectedStory.category ?? "General"}</p>
          <h2>{selectedStory.title}</h2>
          <p>{selectedStory.articleCount} articles across {selectedStory.sourceCount} sources</p>
        </header>

        <div class="comparison">
          {#if comparison}
            <div class="chip-row">
              {#each comparison.sharedKeywords as keyword}
                <span class="chip">{keyword}</span>
              {/each}
            </div>

            {#each comparison.framingSummary as line}
              <p>{line}</p>
            {/each}
          {/if}
        </div>

        <div class="article-grid">
          {#each selectedStory.articles as article}
            <article>
              <p class="meta">{article.domain}</p>
              <h3>{article.title}</h3>
              <p>{article.summary ?? "No summary available."}</p>
              {#if article.syndicatedDomains.length > 0}
                <p class="signals">Syndicated duplicates also seen on {article.syndicatedDomains.join(", ")}</p>
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
          <h2>No story selected</h2>
          <p>Run an ingestion, then pick a story to inspect coverage differences.</p>
        </div>
      {/if}
    </section>
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    background:
      radial-gradient(circle at top left, rgba(212, 170, 103, 0.22), transparent 32%),
      linear-gradient(180deg, #f6f1e7 0%, #f1eadf 100%);
    color: #1f1b16;
  }

  .shell {
    max-width: 1240px;
    margin: 0 auto;
    padding: 32px 20px 64px;
  }

  .hero h1,
  .detail h2,
  .story-card strong {
    font-family: "Iowan Old Style", "Palatino Linotype", serif;
  }

  .hero {
    margin-bottom: 24px;
  }

  .eyebrow,
  .meta,
  .signals {
    color: #6b5e4d;
    font-size: 0.9rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .lede {
    max-width: 70ch;
    line-height: 1.6;
  }

  .layout {
    display: grid;
    grid-template-columns: 320px 1fr;
    gap: 20px;
  }

  .panel {
    background: rgba(255, 252, 247, 0.84);
    border: 1px solid rgba(79, 57, 31, 0.14);
    border-radius: 20px;
    padding: 20px;
    box-shadow: 0 12px 30px rgba(78, 56, 31, 0.08);
    backdrop-filter: blur(10px);
  }

  select,
  .story-card {
    width: 100%;
  }

  label {
    display: grid;
    gap: 6px;
    margin-bottom: 14px;
  }

  select {
    margin-top: 6px;
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(79, 57, 31, 0.18);
    background: #fffdfa;
  }

  .stories {
    display: grid;
    gap: 12px;
    margin-top: 18px;
  }

  .story-card {
    text-align: left;
    border: 0;
    border-radius: 16px;
    background: #fff8ef;
    padding: 14px;
    display: grid;
    gap: 8px;
    cursor: pointer;
  }

  .comparison {
    padding: 12px 0 20px;
    border-bottom: 1px solid rgba(79, 57, 31, 0.12);
  }

  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chip {
    padding: 6px 10px;
    background: #eadbc0;
    border-radius: 999px;
    font-size: 0.88rem;
  }

  .article-grid {
    display: grid;
    gap: 16px;
    margin-top: 20px;
  }

  article {
    padding: 18px;
    background: #fffdfa;
    border-radius: 16px;
    border: 1px solid rgba(79, 57, 31, 0.1);
  }

  .error {
    color: #8b1e1e;
  }

  .empty {
    min-height: 320px;
    display: grid;
    place-content: center;
    text-align: center;
  }

  @media (max-width: 900px) {
    .layout {
      grid-template-columns: 1fr;
    }
  }
</style>
