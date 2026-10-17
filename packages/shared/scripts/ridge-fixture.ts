import { kfold, trainRidgeCV } from "../src/models";

/**
 * Reference outputs of the TypeScript ridge implementation, checked by the Python training
 * kit (training/tests/test_ridge.py) so models trained in either place are interchangeable.
 * Regenerate with: npx tsx packages/shared/scripts/export-ridge-fixture.ts
 */
export function ridgeFixture() {
  let s = 7;
  const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const X: number[][] = [], y: number[] = [];
  for (let i = 0; i < 47; i++) {
    const row = [rand() * 40, rand() * 30, rand(), 5]; // last column is constant
    X.push(row);
    y.push(0.05 * row[0] - 0.04 * row[1] + 0.3 + 0.4 * (rand() - 0.5));
  }
  const head = trainRidgeCV(X, y);
  return {
    X,
    y,
    folds_23_5: kfold(23, 5),
    folds_47_5_seed9: kfold(47, 5, 9),
    lambda: head.lambda,
    weights: head.fit.weights,
    intercept: head.fit.intercept,
    means: head.fit.means,
    stds: head.fit.stds,
    metrics: head.metrics,
    oof: head.oof,
    lambda_scores: head.lambdaScores,
  };
}
