export type CupGameMode = 'ai' | 'local';

export interface CupColorMeta {
  tier: 1 | 2 | 3 | 4;
  label: string;
  pairHint: string;
  bgHex: string;
  borderHex: string;
  textHex: string;
  badgeText: string;
}

export const CUP_COLOR_BY_INDEX: CupColorMeta[] = [
  // Cup 1 (index 0) -> deepest
  {
    tier: 4,
    label: '가장 짙은 파랑',
    pairHint: '1번 또는 7번 컵',
    bgHex: '#1E3A8A',
    borderHex: '#3B82F6',
    textHex: '#EFF6FF',
    badgeText: '심도 4',
  },
  // Cup 2 (index 1)
  {
    tier: 3,
    label: '짙은 파랑',
    pairHint: '2번 또는 6번 컵',
    bgHex: '#2563EB',
    borderHex: '#60A5FA',
    textHex: '#EFF6FF',
    badgeText: '심도 3',
  },
  // Cup 3 (index 2)
  {
    tier: 2,
    label: '옅은 하늘',
    pairHint: '3번 또는 5번 컵',
    bgHex: '#38BDF8',
    borderHex: '#7DD3FC',
    textHex: '#082F49',
    badgeText: '심도 2',
  },
  // Cup 4 (index 3) -> lightest center
  {
    tier: 1,
    label: '가장 옅은 하늘',
    pairHint: '가운데 4번 컵',
    bgHex: '#BAE6FD',
    borderHex: '#E0F2FE',
    textHex: '#0C4A6E',
    badgeText: '심도 1',
  },
  // Cup 5 (index 4) -> identical to Cup 3
  {
    tier: 2,
    label: '옅은 하늘',
    pairHint: '3번 또는 5번 컵',
    bgHex: '#38BDF8',
    borderHex: '#7DD3FC',
    textHex: '#082F49',
    badgeText: '심도 2',
  },
  // Cup 6 (index 5) -> identical to Cup 2
  {
    tier: 3,
    label: '짙은 파랑',
    pairHint: '2번 또는 6번 컵',
    bgHex: '#2563EB',
    borderHex: '#60A5FA',
    textHex: '#EFF6FF',
    badgeText: '심도 3',
  },
  // Cup 7 (index 6) -> identical to Cup 1
  {
    tier: 4,
    label: '가장 짙은 파랑',
    pairHint: '1번 또는 7번 컵',
    bgHex: '#1E3A8A',
    borderHex: '#3B82F6',
    textHex: '#EFF6FF',
    badgeText: '심도 4',
  },
];

export interface PlacementValidation {
  allFilled: boolean;
  maxTwoPerDigit: boolean;
  sumWithinLimit: boolean;
  nonDecreasing: boolean;
  isValid: boolean;
  sum: number;
  digitCounts: number[];
  orderViolations: boolean[];
}

export function validateCupPlacement(cups: Array<number | null>): PlacementValidation {
  const digitCounts = Array(10).fill(0) as number[];
  let sum = 0;
  let allFilled = true;

  for (const val of cups) {
    if (val === null) {
      allFilled = false;
    } else {
      sum += val;
      if (val >= 0 && val <= 9) {
        digitCounts[val] += 1;
      }
    }
  }

  const maxTwoPerDigit = digitCounts.every((c) => c <= 2);
  const sumWithinLimit = sum <= 30;

  const orderViolations = Array(7).fill(false) as boolean[];
  let nonDecreasing = true;
  for (let i = 0; i < 6; i += 1) {
    const cur = cups[i];
    const next = cups[i + 1];
    if (cur !== null && next !== null && cur > next) {
      nonDecreasing = false;
      orderViolations[i] = true;
      orderViolations[i + 1] = true;
    }
  }

  const isValid = allFilled && maxTwoPerDigit && sumWithinLimit && nonDecreasing;
  return {
    allFilled,
    maxTwoPerDigit,
    sumWithinLimit,
    nonDecreasing,
    isValid,
    sum,
    digitCounts,
    orderViolations,
  };
}

export function generateRecommendedPlacement(): number[] {
  // Generate valid non-decreasing 7-number array with each digit <= 2 and sum <= 30
  const presets: number[][] = [
    [0, 1, 3, 5, 6, 7, 8], // sum 30
    [0, 2, 2, 4, 6, 8, 8], // sum 30
    [1, 1, 3, 4, 5, 7, 9], // sum 30
    [0, 1, 2, 5, 6, 7, 9], // sum 30
    [0, 2, 3, 4, 5, 7, 9], // sum 30
    [1, 2, 2, 4, 5, 8, 8], // sum 30
    [0, 1, 4, 4, 6, 7, 8], // sum 30
    [1, 1, 2, 5, 6, 6, 9], // sum 30
    [0, 0, 3, 5, 6, 7, 9], // sum 30
    [0, 2, 3, 3, 6, 7, 9], // sum 30
  ];

  // Try randomized generation first for high variety
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const counts = Array(10).fill(0) as number[];
    const candidate: number[] = [];
    let minAllowed = 0;
    let total = 0;

    for (let i = 0; i < 7; i += 1) {
      const remainingSlots = 7 - i;
      const maxForSlot = Math.min(9, 30 - total);
      const validChoices: number[] = [];
      for (let d = minAllowed; d <= maxForSlot; d += 1) {
        if (counts[d] < 2) {
          // Ensure remaining slots can still be filled with >= d without exceeding 30
          const minNeededAfter = d * (remainingSlots - 1);
          if (total + d + minNeededAfter <= 30) {
            validChoices.push(d);
          }
        }
      }
      if (validChoices.length === 0) break;
      const pick = validChoices[Math.floor(Math.random() * validChoices.length)];
      candidate.push(pick);
      counts[pick] += 1;
      total += pick;
      minAllowed = pick;
    }

    if (candidate.length === 7 && validateCupPlacement(candidate).isValid && total >= 25) {
      return candidate;
    }
  }

  return [...presets[Math.floor(Math.random() * presets.length)]];
}

export function chooseAILeadCupIndex(
  aiRemainingIndices: number[],
  aiCups: number[],
): number {
  // AI mixes bluffing with Tier 4 (index 0 or 6) and mid-range pressure
  const sortedByVal = [...aiRemainingIndices].sort((a, b) => aiCups[a] - aiCups[b]);
  if (sortedByVal.length <= 2) {
    return sortedByVal[sortedByVal.length - 1];
  }
  const pool = sortedByVal.filter((_, idx) => idx >= 1);
  return pool[Math.floor(Math.random() * pool.length)];
}

export function chooseAIFollowCupIndex(
  aiRemainingIndices: number[],
  aiCups: number[],
  leadColorTier: 1 | 2 | 3 | 4,
  leadUsedIndices: Set<number>,
): number {
  // Fair AI: infers possible cup indices solely from the visible color tier and previously revealed cups
  const possibleLeadIndices: number[] = [];
  for (let i = 0; i < 7; i += 1) {
    if (CUP_COLOR_BY_INDEX[i].tier === leadColorTier && !leadUsedIndices.has(i)) {
      possibleLeadIndices.push(i);
    }
  }

  // Estimate expected threat (0..6 index scale)
  const avgIdx =
    possibleLeadIndices.length > 0
      ? possibleLeadIndices.reduce((acc, v) => acc + v, 0) / possibleLeadIndices.length
      : 3;

  const sorted = [...aiRemainingIndices].sort((a, b) => aiCups[a] - aiCups[b]);

  // If lead cup is likely very strong (index >= 5) and AI thinks it might lose, sometimes sacrifice lowest;
  // otherwise try to beat the estimated threat with the smallest winning cup
  if (avgIdx >= 4.5) {
    const highPick = sorted[sorted.length - 1];
    const lowPick = sorted[0];
    return Math.random() < 0.65 ? highPick : lowPick;
  }

  if (avgIdx <= 1.5) {
    // Lead is likely a sacrifice low cup -> counter with a medium-low cup to win cheaply
    const midIdx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.45));
    return sorted[midIdx];
  }

  // Tier 2 or Tier 1 (3, 4, 5)
  const targetIdx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.6));
  return sorted[targetIdx];
}
