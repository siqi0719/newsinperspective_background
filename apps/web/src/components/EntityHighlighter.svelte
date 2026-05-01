<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import type { LinkedEntity } from "@news/shared";

  interface Props {
    text: string;
    entities: LinkedEntity[];
  }

  let { text = "", entities = [] }: Props = $props();

  const dispatch = createEventDispatcher<{ "entity-click": { entity: LinkedEntity } }>();

  /**
   * Segment the text into parts: marked (entity) and unmarked (regular text)
   * Handles overlapping entities by selecting highest confidence
   */
  function segmentText(
    fullText: string,
    allEntities: LinkedEntity[]
  ): Array<{ type: "text" | "entity"; content: string; entity?: LinkedEntity }> {
    if (!fullText || allEntities.length === 0) {
      return [{ type: "text", content: fullText }];
    }

    // Filter overlapping entities - keep highest confidence
    const sortedEntities = [...allEntities].sort((a, b) => {
      // If ranges overlap, higher confidence wins
      if (
        !(
          a.endOffset <= b.startOffset ||
          a.startOffset >= b.endOffset
        )
      ) {
        return b.confidence - a.confidence;
      }
      return a.startOffset - b.startOffset;
    });

    // Remove overlapping entities (keep first occurrence)
    const filtered: LinkedEntity[] = [];
    for (const entity of sortedEntities) {
      const overlaps = filtered.some(
        (existing) =>
          !(entity.endOffset <= existing.startOffset ||
            entity.startOffset >= existing.endOffset)
      );
      if (!overlaps) {
        filtered.push(entity);
      }
    }

    // Sort by start position
    filtered.sort((a, b) => a.startOffset - b.startOffset);

    const segments: Array<{ type: "text" | "entity"; content: string; entity?: LinkedEntity }> = [];
    let lastIndex = 0;

    for (const entity of filtered) {
      // Add text before entity
      if (entity.startOffset > lastIndex) {
        segments.push({
          type: "text",
          content: fullText.slice(lastIndex, entity.startOffset),
        });
      }

      // Add entity
      segments.push({
        type: "entity",
        content: fullText.slice(entity.startOffset, entity.endOffset),
        entity,
      });

      lastIndex = entity.endOffset;
    }

    // Add remaining text
    if (lastIndex < fullText.length) {
      segments.push({
        type: "text",
        content: fullText.slice(lastIndex),
      });
    }

    return segments;
  }

  function getCSSClassForEntityType(entityType: string): string {
    return `entity--${entityType.toLowerCase()}`;
  }

  function handleEntityClick(entity: LinkedEntity): void {
    console.log("📍 EntityHighlighter.handleEntityClick triggered:", { entityText: entity.entityText, wikipediaUrl: entity.wikipediaUrl });

    // If Wikipedia URL exists, open it directly
    if (entity.wikipediaUrl) {
      window.open(entity.wikipediaUrl, "_blank", "noreferrer");
      return;
    }

    // Otherwise dispatch event to show popover with entity info
    dispatch("entity-click", { entity });
  }

  const segments = $derived(segmentText(text, entities));
</script>

<div class="entity-highlighted-text">
  {#each segments as segment}
    {#if segment.type === "text"}
      {segment.content}
    {:else if segment.entity}
      <mark
        class="entity {getCSSClassForEntityType(segment.entity.entityType)}"
        title={`${segment.entity.entityType}: ${segment.entity.entityText} (${(segment.entity.confidence * 100).toFixed(0)}%)`}
        role="button"
        tabindex="0"
        on:click={() => handleEntityClick(segment.entity!)}
        on:keydown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleEntityClick(segment.entity!);
          }
        }}
      >
        {segment.content}
      </mark>
    {/if}
  {/each}
</div>

<style>
  .entity-highlighted-text {
    word-break: break-word;
    overflow-wrap: anywhere;
  }

  mark {
    padding: 2px 4px;
    border-radius: 3px;
    cursor: pointer;
    font-weight: 500;
    transition:
      background-color 140ms ease,
      box-shadow 140ms ease;
    background-color: var(--entity-default-bg, #fef08a);
    color: inherit;
    text-decoration: none;
  }

  mark:hover {
    box-shadow: 0 0 0 2px currentColor;
  }

  /* Entity type color coding */
  mark.entity--person {
    --entity-default-bg: #dbeafe;
    color: var(--entity-person-text, #0c4a6e);
  }

  mark.entity--person:hover {
    background-color: #bfdbfe;
  }

  mark.entity--gpe {
    --entity-default-bg: #dcfce7;
    color: var(--entity-gpe-text, #14532d);
  }

  mark.entity--gpe:hover {
    background-color: #bbf7d0;
  }

  mark.entity--org {
    --entity-default-bg: #fce7f3;
    color: var(--entity-org-text, #500724);
  }

  mark.entity--org:hover {
    background-color: #fbcfe8;
  }

  mark.entity--event {
    --entity-default-bg: #fed7aa;
    color: var(--entity-event-text, #5a2e0f);
  }

  mark.entity--event:hover {
    background-color: #fdba74;
  }

  /* Focus state for accessibility */
  mark:focus {
    outline: 2px solid var(--accent, #0f62fe);
    outline-offset: 2px;
  }
</style>
