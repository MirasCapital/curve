export interface CurvePoint {
  tenor: string;
  months: number;
  rate: number;
  type: string;
}

export function interpolateMonthlyRates(tenors: { months: number; rate: number }[], totalMonths = 96) {
  const result: { month: number; rate: number }[] = [];

  for (let m = 1; m <= totalMonths; m++) {
    const lower = [...tenors].reverse().find(t => t.months <= m);
    const upper = tenors.find(t => t.months >= m);

    if (lower && upper && lower.months !== upper.months) {
      const interpolated = lower.rate + ((upper.rate - lower.rate) / (upper.months - lower.months)) * (m - lower.months);
      result.push({ month: m, rate: interpolated });
    } else if (lower) {
      result.push({ month: m, rate: lower.rate });
    }
  }

  return result;
}

export function cubicSplineInterpolate(points: { months: number; rate: number }[], totalMonths = 96) {
  if (points.length < 2) return [];
  const sorted = [...points].sort((a, b) => a.months - b.months);
  const n = sorted.length;
  const xs = sorted.map(p => p.months);
  const ys = sorted.map(p => p.rate);

  const h = Array(n - 1).fill(0).map((_, i) => xs[i + 1] - xs[i]);
  const alpha = Array(n - 1).fill(0);
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1]);
  }

  const l = Array(n).fill(1);
  const mu = Array(n).fill(0);
  const z = Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }

  const c = Array(n).fill(0);
  const b = Array(n - 1).fill(0);
  const d = Array(n - 1).fill(0);
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }

  const result: { month: number; rate: number }[] = [];
  for (let m = 1; m <= totalMonths; m++) {
    let i = 0;
    while (i < n - 2 && m > xs[i + 1]) i++;
    const dx = m - xs[i];
    const rate = ys[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
    result.push({ month: m, rate });
  }
  return result;
}

export function validateAndCleanData(data: { month: number; rate: number }[]) {
  return data.filter(point => 
    point && 
    typeof point.rate === 'number' && 
    !isNaN(point.rate) && 
    isFinite(point.rate) &&
    point.rate >= 0 &&
    point.rate <= 30
  );
}