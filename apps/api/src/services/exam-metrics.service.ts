export const PASSING_PERCENTAGE = 50;

export function isPassingPercentage(percentage: number): boolean {
  return percentage >= PASSING_PERCENTAGE;
}

export function isPassingScore(score: number, maxScore: number): boolean {
  return maxScore > 0 && isPassingPercentage(score / maxScore * 100);
}
