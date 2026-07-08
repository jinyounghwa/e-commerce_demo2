// 등급 규칙 — SKILL.md §6
export type Grade = 'BRONZE' | 'SILVER' | 'GOLD' | 'VIP';

export interface GradeRule {
  grade: Grade;
  minSpent: number;
  gradeRate: number; // 등급할인율
  pointRate: number; // 적립률
}

export const GRADE_RULES: GradeRule[] = [
  { grade: 'BRONZE', minSpent: 0, gradeRate: 0.0, pointRate: 0.01 },
  { grade: 'SILVER', minSpent: 300000, gradeRate: 0.01, pointRate: 0.02 },
  { grade: 'GOLD', minSpent: 1000000, gradeRate: 0.02, pointRate: 0.03 },
  { grade: 'VIP', minSpent: 3000000, gradeRate: 0.03, pointRate: 0.05 },
];

export function gradeFromSpent(totalSpent: number): Grade {
  let result: Grade = 'BRONZE';
  for (const r of GRADE_RULES) {
    if (totalSpent >= r.minSpent) result = r.grade;
  }
  return result;
}

export function gradeRule(grade: Grade): GradeRule {
  return GRADE_RULES.find((r) => r.grade === grade)!;
}
