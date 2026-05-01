<script lang="ts">
  import type { LinkedEntity } from "@news/shared";

  interface Props {
    entities: LinkedEntity[];
    selectedEntityId: string | null;
    onEntitySelect: (entity: LinkedEntity) => void;
  }

  let { entities = [], selectedEntityId = null, onEntitySelect }: Props = $props();

  function getEntityTypeColor(type: string): string {
    const colors: Record<string, string> = {
      PERSON: "#0c4a6e",
      GPE: "#14532d",
      ORG: "#500724",
      EVENT: "#5a2e0f",
    };
    return colors[type] || "#142033";
  }

  function getEntityTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      PERSON: "Person",
      GPE: "Location",
      ORG: "Organization",
      EVENT: "Event",
    };
    return labels[type] || type;
  }

  function groupEntitiesByType(
    ents: LinkedEntity[]
  ): Record<string, LinkedEntity[]> {
    const grouped: Record<string, LinkedEntity[]> = {
      PERSON: [],
      GPE: [],
      ORG: [],
      EVENT: [],
    };

    for (const entity of ents) {
      if (entity.entityType in grouped) {
        grouped[entity.entityType].push(entity);
      }
    }

    // Sort each group by confidence (highest first)
    for (const type in grouped) {
      grouped[type].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
    }

    return grouped;
  }

  const groupedEntities = $derived(groupEntitiesByType(entities));
  const entityTypes = $derived.by(() => {
    return Object.keys(groupedEntities).filter((type) => groupedEntities[type].length > 0);
  });

  const totalEntities = $derived(entities.length);
</script>

<div class="entity-stats-panel">
  <div class="stats-header">
    <h4>Entities Found</h4>
    <span class="total-badge">{totalEntities}</span>
  </div>

  {#if entityTypes.length === 0}
    <div class="empty-state">
      <p>No entities detected in this article.</p>
    </div>
  {:else}
    <div class="entity-groups">
      {#each entityTypes as entityType}
        <div class="entity-group">
          <div class="group-header">
            <span
              class="group-badge"
              style="background-color: {getEntityTypeColor(entityType)};"
            >
              {getEntityTypeLabel(entityType)}
            </span>
            <span class="group-count">{groupedEntities[entityType].length}</span>
          </div>

          <div class="entity-list">
            {#each groupedEntities[entityType] as entity (entity.id)}
              <button
                class="entity-item"
                class:selected={selectedEntityId === entity.id}
                type="button"
                on:click={() => onEntitySelect(entity)}
                title={`${entity.entityType}: ${entity.entityText}`}
              >
                <span class="entity-item-name">{entity.entityText}</span>
                <span class="entity-item-confidence">
                  {(entity.confidence * 100).toFixed(0)}%
                </span>
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .entity-stats-panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .stats-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  h4 {
    margin: 0;
    font-size: 1.02rem;
    color: #142033;
    font-weight: 600;
  }

  .total-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 8px;
    border-radius: 999px;
    background: linear-gradient(135deg, #dce8ff, rgba(207, 226, 255, 0.9));
    color: #0a3c96;
    font-weight: 600;
    font-size: 0.85rem;
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 60px;
    padding: 12px;
    text-align: center;
    color: #58708f;
    font-size: 0.9rem;
  }

  .empty-state p {
    margin: 0;
  }

  .entity-groups {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .entity-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 2px;
  }

  .group-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    color: white;
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    width: fit-content;
  }

  .group-count {
    color: #58708f;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .entity-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .entity-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid rgba(28, 46, 73, 0.12);
    background: rgba(255, 255, 255, 0.76);
    color: #142033;
    font-size: 0.9rem;
    text-align: left;
    cursor: pointer;
    transition:
      background-color 140ms ease,
      border-color 140ms ease,
      box-shadow 140ms ease;
    font-family: inherit;
    overflow: hidden;
  }

  .entity-item:hover {
    background: rgba(255, 255, 255, 0.9);
    border-color: rgba(37, 87, 167, 0.24);
  }

  .entity-item.selected {
    background: linear-gradient(135deg, #dce8ff, rgba(207, 226, 255, 0.9));
    border-color: rgba(37, 87, 167, 0.24);
    box-shadow: 0 4px 12px rgba(20, 55, 111, 0.12);
    font-weight: 500;
  }

  .entity-item-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .entity-item-confidence {
    flex-shrink: 0;
    color: #58708f;
    font-size: 0.78rem;
    font-weight: 500;
  }

  /* Mobile responsiveness */
  @media (max-width: 980px) {
    .entity-stats-panel {
      display: none;
    }
  }

  @media (max-width: 768px) {
    .entity-stats-panel {
      display: flex;
    }

    h4 {
      font-size: 0.98rem;
    }

    .entity-item {
      padding: 6px 8px;
      font-size: 0.85rem;
    }

    .entity-item-confidence {
      font-size: 0.75rem;
    }
  }
</style>
