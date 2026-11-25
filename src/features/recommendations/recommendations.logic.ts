export type RecommendationGoal = {
  id: string;
  title: string;
  description: string | null;
  isPrimary: boolean;
};

export type RecommendationMission = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  createdAt: Date;
};

export type MissionRecommendation = {
  missionId: string;
  slug: string;
  title: string;
  summary: string;
  basis: "career_goal_match" | "catalog_exploration";
  careerGoal: string | null;
  matchedTerms: string[];
  reason: string;
};

const STOP_WORDS = new Set([
  "about", "and", "are", "career", "dengan", "for", "from", "goal", "ingin", "into", "menjadi",
  "of", "or", "pada", "role", "sebagai", "that", "the", "this", "untuk", "with", "yang",
]);

function keywords(value: string): Set<string> {
  const normalized = value.normalize("NFKD").toLowerCase().replace(/\p{Diacritic}/gu, "");
  return new Set((normalized.match(/[a-z0-9]{3,}/g) ?? []).filter((word) => !STOP_WORDS.has(word)));
}

function matchGoal(mission: RecommendationMission, goals: RecommendationGoal[]) {
  const missionTerms = keywords(`${mission.title} ${mission.summary}`);
  let best: { goal: RecommendationGoal; terms: string[] } | undefined;

  for (const goal of goals) {
    const terms = [...keywords(`${goal.title} ${goal.description ?? ""}`)]
      .filter((term) => missionTerms.has(term))
      .sort();
    if (terms.length > (best?.terms.length ?? 0)) best = { goal, terms };
  }

  return best;
}

export function buildMissionRecommendations(
  missions: RecommendationMission[],
  goals: RecommendationGoal[],
  attemptedMissionIds: Set<string>,
  limit: number,
): MissionRecommendation[] {
  const candidates = missions
    .filter((mission) => !attemptedMissionIds.has(mission.id))
    .map((mission) => {
      const match = matchGoal(mission, goals);
      if (match?.terms.length) {
        return {
          missionId: mission.id,
          slug: mission.slug,
          title: mission.title,
          summary: mission.summary,
          basis: "career_goal_match" as const,
          careerGoal: match.goal.title,
          matchedTerms: match.terms,
          reason: `This mission shares keywords with your career goal "${match.goal.title}": ${match.terms.join(", ")}.`,
          matchCount: match.terms.length,
          createdAt: mission.createdAt,
        };
      }

      return {
        missionId: mission.id,
        slug: mission.slug,
        title: mission.title,
        summary: mission.summary,
        basis: "catalog_exploration" as const,
        careerGoal: null,
        matchedTerms: [],
        reason: "Suggested as another published mission to explore; this is not a career-fit prediction.",
        matchCount: 0,
        createdAt: mission.createdAt,
      };
    });

  return candidates
    .sort((left, right) => right.matchCount - left.matchCount || right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, Math.max(0, limit))
    .map(({ matchCount: _matchCount, createdAt: _createdAt, ...recommendation }) => recommendation);
}
