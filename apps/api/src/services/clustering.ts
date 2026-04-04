import { jaccardSimilarity } from "../domain/text.js";

interface ClusterCandidate {
  articleId: string;
  title: string;
  domain: string;
  category: string | null;
  publishedAt: Date | null;
}

interface ClusterResult {
  key: string;
  title: string;
  category: string | null;
  articleIds: string[];
}

export function clusterArticles(candidates: ClusterCandidate[]): ClusterResult[] {
  const clusters: ClusterResult[] = [];

  for (const candidate of candidates) {
    const match = clusters.find((cluster) => {
      const score = jaccardSimilarity(cluster.title, candidate.title);
      return score >= 0.35;
    });

    if (match) {
      match.articleIds.push(candidate.articleId);
      continue;
    }

    clusters.push({
      key: createClusterKey(candidate.title),
      title: candidate.title,
      category: candidate.category,
      articleIds: [candidate.articleId],
    });
  }

  return clusters;
}

function createClusterKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join("-");
}
