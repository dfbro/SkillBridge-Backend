import { describe, expect, it } from "vitest";
import { buildMissionRecommendations } from "./recommendations.logic";

const goals = [
  { id: "goal-1", title: "Cloud Engineer", description: "cloud infrastructure and network security", isPrimary: true },
  { id: "goal-2", title: "Data Analyst", description: "SQL and reporting", isPrimary: false },
];

const missions = [
  { id: "mission-cloud", slug: "cloud-network", title: "Cloud Network Security", summary: "Practice network access and cloud infrastructure", createdAt: new Date("2026-11-20T00:00:00.000Z") },
  { id: "mission-sql", slug: "sql-report", title: "SQL Reporting", summary: "Build a report from a relational dataset", createdAt: new Date("2026-11-22T00:00:00.000Z") },
  { id: "mission-general", slug: "problem-solving", title: "Problem Solving", summary: "Break down a practical workplace scenario", createdAt: new Date("2026-11-24T00:00:00.000Z") },
];

describe("buildMissionRecommendations", () => {
  it("ranks available missions by transparent keyword overlap with career goals", () => {
    const results = buildMissionRecommendations(missions, goals, new Set(), 3);

    expect(results.map((item) => item.missionId)).toEqual(["mission-cloud", "mission-sql", "mission-general"]);
    expect(results[0]).toMatchObject({
      basis: "career_goal_match",
      careerGoal: "Cloud Engineer",
      matchedTerms: expect.arrayContaining(["cloud", "network", "security"]),
    });
    expect(results[2].basis).toBe("catalog_exploration");
  });

  it("excludes missions already started or completed", () => {
    const results = buildMissionRecommendations(missions, goals, new Set(["mission-cloud", "mission-general"]), 5);

    expect(results.map((item) => item.missionId)).toEqual(["mission-sql"]);
  });

  it("uses a transparent exploration fallback when the learner has no goals", () => {
    const results = buildMissionRecommendations(missions, [], new Set(), 2);

    expect(results).toHaveLength(2);
    expect(results.every((item) => item.basis === "catalog_exploration")).toBe(true);
    expect(results.every((item) => item.reason.includes("not a career-fit prediction"))).toBe(true);
  });

  it("returns no recommendations when no published candidates remain", () => {
    expect(buildMissionRecommendations([], goals, new Set(), 5)).toEqual([]);
  });
});
