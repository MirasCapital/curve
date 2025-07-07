// --- IMPORTANT: Install papaparse before running this code ---
// npm install papaparse @types/papaparse
// -------------------------------------------------------------

import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, Calculator, TrendingUp, Info, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import Papa from 'papaparse';

// Chad.CN-inspired Card component - REVISED
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`card ${className}`}>{children}</div>
);

// Types for data
interface SpotRates {
  cash: number;
  oneMonth: number;
  threeMonth: number;
  sixMonth: number;
}
interface BondYields {
  bond2Y: number;
  bond3Y: number;
  bond5Y: number;
  bond10Y: number;
}
interface FetchResults {
  bbsw: SpotRates | null;
  bonds: BondYields | null;
  errors: string[];
  lastUpdate: string;
}

// Add CurvePoint type
interface CurvePoint {
  tenor: string;
  months: number;
  rate: number;
  type: string;
}

// Data fetching class for RBA CSVs
class AUDDataFetcher {
  // Use CORS proxy for browser fetches
  corsProxy = 'https://corsproxy.io/?';
  f1Url = this.corsProxy + 'https://www.rba.gov.au/statistics/tables/csv/f1.1-data.csv'; // BBSW (F1) - no version string
  f2Url = this.corsProxy + 'https://www.rba.gov.au/statistics/tables/csv/f2-data.csv'; // Govt Bonds (F2) - no version string

  // Fetch and parse CSV from RBA
  async fetchCSV(url: string): Promise<any[]> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch CSV: ${url}`);
    const text = await response.text();
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (err) => reject(err)
      });
    });
  }

  // Parse F1 (BBSW) CSV
  // The columns are: 0=Date, 1=Cash, 7=1M, 8=3M, 9=6M (1-based)
  async fetchBBSWRates(): Promise<SpotRates> {
    const data = await this.fetchCSV(this.f1Url);
    let lastRow: string[] | undefined;
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i].map((cell: string) => (cell || '').trim());
      // Only require non-empty date cell and all required columns present and numeric
      if (
        row[0] &&
        row[1] && row[7] && row[8] && row[9] &&
        !isNaN(Number(row[1])) &&
        !isNaN(Number(row[7])) &&
        !isNaN(Number(row[8])) &&
        !isNaN(Number(row[9]))
      ) {
        lastRow = row;
        break;
      }
    }
    if (!lastRow) throw new Error('No valid BBSW data found in F1 CSV');
    return {
      cash: Number(lastRow[1]),
      oneMonth: Number(lastRow[7]),
      threeMonth: Number(lastRow[8]),
      sixMonth: Number(lastRow[9])
    };
  }

  // Parse F2 (Govt Bonds) CSV
  async fetchRBABondYields(): Promise<BondYields> {
    const data = await this.fetchCSV(this.f2Url);
    // Find the last row with all yields
    let lastRow: string[] | undefined;
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i];
      if (row[1] && row[2] && row[3] && row[4] && !isNaN(parseFloat(row[1]))) {
        lastRow = row;
        break;
      }
    }
    if (!lastRow) throw new Error('No valid bond yield data found in F2 CSV');
    return {
      bond2Y: parseFloat(lastRow[1]),
      bond3Y: parseFloat(lastRow[2]),
      bond5Y: parseFloat(lastRow[3]),
      bond10Y: parseFloat(lastRow[4])
    };
  }

  // Master fetch method
  async fetchAllData(): Promise<FetchResults> {
    const results: FetchResults = {
      bbsw: null,
      bonds: null,
      errors: [],
      lastUpdate: new Date().toISOString()
    };
    try {
      results.bbsw = await this.fetchBBSWRates();
    } catch (error: any) {
      results.errors.push('Failed to fetch BBSW: ' + error.message);
    }
    try {
      results.bonds = await this.fetchRBABondYields();
    } catch (error: any) {
      results.errors.push('Failed to fetch Bonds: ' + error.message);
    }
    return results;
  }
}

function interpolateMonthlyRates(tenors: { months: number; rate: number }[], totalMonths = 96) {
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

function forecastLinearRates(
  monthsToForecast: number[],
  knownMonths: number[],
  knownRates: number[]
) {
  return monthsToForecast.map(month => {
    const n = knownMonths.length;
    const avgX = knownMonths.reduce((a, b) => a + b, 0) / n;
    const avgY = knownRates.reduce((a, b) => a + b, 0) / n;

    const numerator = knownMonths.reduce((sum, x, i) => sum + (x - avgX) * (knownRates[i] - avgY), 0);
    const denominator = knownMonths.reduce((sum, x) => sum + (x - avgX) ** 2, 0);
    const slope = numerator / denominator;

    const intercept = avgY - slope * avgX;
    const forecast = slope * month + intercept;

    return { month, rate: forecast };
  });
}

// Cubic spline interpolation implementation
function cubicSplineInterpolate(points: { months: number; rate: number }[], totalMonths = 96) {
  if (points.length < 2) return [];
  // Sort points by months
  const sorted = [...points].sort((a, b) => a.months - b.months);
  const n = sorted.length;
  const xs = sorted.map(p => p.months);
  const ys = sorted.map(p => p.rate);

  // Calculate h and alpha
  const h = Array(n - 1).fill(0).map((_, i) => xs[i + 1] - xs[i]);
  const alpha = Array(n - 1).fill(0);
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1]);
  }

  // Tridiagonal system
  const l = Array(n).fill(1);
  const mu = Array(n).fill(0);
  const z = Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }

  // Solve for c, b, d
  const c = Array(n).fill(0);
  const b = Array(n - 1).fill(0);
  const d = Array(n - 1).fill(0);
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }

  // Interpolate for each month
  const result: { month: number; rate: number }[] = [];
  for (let m = 1; m <= totalMonths; m++) {
    // Find the interval
    let i = 0;
    while (i < n - 2 && m > xs[i + 1]) i++;
    const dx = m - xs[i];
    const rate = ys[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx;
    result.push({ month: m, rate });
  }
  return result;
}

const AUDForwardCurveTool = () => {
  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState(false);
  // Current market data
  const [spotRates, setSpotRates] = useState<SpotRates | null>(null);
  // Government bond yields
  const [govBonds, setGovBonds] = useState<BondYields | null>(null);
  const [forwardCurve, setForwardCurve] = useState<CurvePoint[]>([]);
  const [useForecastMode, setUseForecastMode] = useState(true);
  // Data fetching states
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [lastDataUpdate, setLastDataUpdate] = useState<string | null>(null);
  const [dataFetchErrors, setDataFetchErrors] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [dataSource, setDataSource] = useState('Manual Input');
  // Swap between RBA-style and full swap curve
  const [showRBAYieldCurve, setShowRBAYieldCurve] = useState(true);

  const dataFetcher = new AUDDataFetcher();

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark', !isDarkMode);
  };

  // Fetch market data
  const fetchMarketData = useCallback(async () => {
    setIsLoadingData(true);
    setDataFetchErrors([]);
    try {
      const results = await dataFetcher.fetchAllData();
      // Update spot rates if available
      if (results.bbsw) {
        setSpotRates(results.bbsw);
        setDataSource('RBA F1 CSV');
      }
      // Update government bond yields if available
      if (results.bonds) {
        setGovBonds(results.bonds);
      }
      setLastDataUpdate(results.lastUpdate);
      setDataFetchErrors(results.errors);
      setIsConnected(results.errors.length === 0);
    } catch (error: any) {
      setDataFetchErrors([`Failed to fetch data: ${error.message}`]);
      setIsConnected(false);
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  // Calculate RBA-style yield curve (Cash + BBSW + Govt Bonds)
  const calculateRBAYieldCurve = useCallback(() => {
    if (!spotRates || !govBonds) {
      setForwardCurve([]);
      return;
    }
    const curve: CurvePoint[] = [];
    curve.push({ tenor: 'Cash', months: 0, rate: Number(spotRates.cash), type: 'Cash Rate' });
    curve.push({ tenor: '1M', months: 1, rate: Number(spotRates.oneMonth), type: 'BBSW' });
    curve.push({ tenor: '3M', months: 3, rate: Number(spotRates.threeMonth), type: 'BBSW' });
    curve.push({ tenor: '6M', months: 6, rate: Number(spotRates.sixMonth), type: 'BBSW' });
    curve.push({ tenor: '2Y', months: 24, rate: Number(govBonds.bond2Y), type: 'Govt Bond' });
    curve.push({ tenor: '3Y', months: 36, rate: Number(govBonds.bond3Y), type: 'Govt Bond' });
    curve.push({ tenor: '5Y', months: 60, rate: Number(govBonds.bond5Y), type: 'Govt Bond' });
    curve.push({ tenor: '10Y', months: 120, rate: Number(govBonds.bond10Y), type: 'Govt Bond' });
    setForwardCurve(curve);
  }, [spotRates, govBonds]);

  // Calculate full swap/forward curve (BBSW, forwards, bonds)
  const calculateForwardCurve = useCallback(() => {
    if (!spotRates || !govBonds) {
      setForwardCurve([]);
      return;
    }
    const curve: CurvePoint[] = [];
    curve.push({ tenor: '1M', months: 1, rate: Number(spotRates.oneMonth), type: 'Spot' });
    curve.push({ tenor: '3M', months: 3, rate: Number(spotRates.threeMonth), type: 'Spot' });
    curve.push({ tenor: '6M', months: 6, rate: Number(spotRates.sixMonth), type: 'Spot' });
    // Forwards and market implied points can be omitted or calculated differently if needed
    curve.push({ tenor: '2Y', months: 24, rate: Number(govBonds.bond2Y), type: 'Govt Bond' });
    curve.push({ tenor: '3Y', months: 36, rate: Number(govBonds.bond3Y), type: 'Govt Bond' });
    curve.push({ tenor: '5Y', months: 60, rate: Number(govBonds.bond5Y), type: 'Govt Bond' });
    curve.push({ tenor: '10Y', months: 120, rate: Number(govBonds.bond10Y), type: 'Govt Bond' });
    setForwardCurve(curve);
  }, [spotRates, govBonds]);

  useEffect(() => {
    fetchMarketData();
  }, [fetchMarketData]);

  useEffect(() => {
    if (showRBAYieldCurve) {
      calculateRBAYieldCurve();
    } else {
      calculateForwardCurve();
    }
  }, [showRBAYieldCurve, calculateRBAYieldCurve, calculateForwardCurve]);

  // For the monthly interpolated and cubic spline arrays, prepend the cash rate at month 0 if available
  const monthsArray = Array.from({ length: 96 }, (_, i) => i + 1);
  const forecasted = cubicSplineInterpolate(forwardCurve, 96);
  const interpolated = interpolateMonthlyRates(forwardCurve, 96);

  const downloadCSV = () => {
    // First tab: Forward Curve Data Points
    const headers1 = ['Tenor', 'Months', 'Rate (%)', 'Source'];
    const csvContent1 = [
      headers1.join(','),
      ...forwardCurve.map(point => 
        `${point.tenor},${point.months},${point.rate.toFixed(4)},${point.type}`
      )
    ].join('\n');

    // Second tab: Monthly Interpolated (Linear and Cubic Spline)
    const headers2 = ['Month', 'Linear Interpolation (%)', 'Cubic Spline Interpolation (%)'];
    // Use months 1-96, align both arrays by month
    const maxMonths = Math.max(interpolated.length, forecasted.length);
    const csvContent2 = [
      headers2.join(','),
      ...Array.from({ length: maxMonths }, (_, i) => {
        const month = i + 1;
        const linear = interpolated[i]?.rate;
        const spline = forecasted[i]?.rate;
        return `${month},${typeof linear === 'number' ? linear.toFixed(4) : ''},${typeof spline === 'number' ? spline.toFixed(4) : ''}`;
      })
    ].join('\n');

    // Combine as two CSV tabs (Excel will open as separate sheets if separated by \n\n, or user can copy-paste)
    const fullCSV =
      'Forward Curve Data Points\n' +
      csvContent1 +
      '\n\n' +
      'Monthly Interpolated Forward Curve (Linear vs Cubic Spline)\n' +
      csvContent2;

    const blob = new Blob([fullCSV], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `AUD_Forward_Curve_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-7xl mx-auto p-6">
        {/* Clean Header */}
        <div className="mb-8">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">
                AUD Forward Curve Construction Tool
              </h1>
              <p className="text-muted-foreground">
                Build forward-looking AUD swap curves using dynamic market data from the Reserve Bank of Australia
              </p>
            </div>
            <button
              onClick={toggleDarkMode}
              className="btn-secondary h-10 px-4"
            >
              {isDarkMode ? '🌞 Light Mode' : '🌙 Dark Mode'}
            </button>
          </div>
        </div>

        {/* Clean Data Status Bar */}
        <div className="bg-card border border-border rounded-lg p-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <Wifi className="h-4 w-4 text-success" />
                ) : (
                  <WifiOff className="h-4 w-4 text-destructive" />
                )}
                <span className="text-sm">
                  Data Source: <span className="font-medium">{dataSource}</span>
                </span>
              </div>
              {lastDataUpdate && (
                <span className="text-xs text-muted-foreground">
                  Last Updated: {new Date(lastDataUpdate).toLocaleTimeString('en-AU', { 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    second: '2-digit' 
                  })}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={fetchMarketData}
                disabled={isLoadingData}
                className="btn-primary h-10 px-4 flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isLoadingData ? 'animate-spin' : ''}`} />
                {isLoadingData ? 'Updating...' : 'Refresh Data'}
              </button>
              <button
                onClick={downloadCSV}
                className="btn-ghost h-10 px-4 flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download CSV
              </button>
            </div>
          </div>
          {dataFetchErrors.length > 0 && (
            <div className="mt-3 p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive">
              <strong>Data Fetch Errors:</strong> {dataFetchErrors.join(', ')}
            </div>
          )}
          {dataSource.includes('Mock Data') && (
            <div className="mt-3 p-3 rounded-md bg-warning/10 border border-warning/20 text-warning-foreground">
              <strong>Using Mock Data:</strong> Live RBA data unavailable, using representative market rates
            </div>
          )}
        </div>
        {/* Clean Input Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* BBSW Rates Card */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <Calculator className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold text-foreground">Current Spot Rates (BBSW)</h3>
                <p className="text-sm text-muted-foreground">Bank Accepted Bill Swap Rates</p>
              </div>
              {isLoadingData && (
                <RefreshCw className="h-4 w-4 animate-spin text-primary ml-auto" />
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Cash Rate:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.0001"
                    value={spotRates?.cash?.toFixed(4) || ''}
                    onChange={e => setSpotRates({ ...spotRates!, cash: parseFloat(e.target.value) || 0 })}
                    className="input w-20 text-right font-mono text-sm"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">1M BBSW:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.0001"
                    value={spotRates?.oneMonth?.toFixed(4) || ''}
                    onChange={e => setSpotRates({ ...spotRates!, oneMonth: parseFloat(e.target.value) || 0 })}
                    className="input w-20 text-right font-mono text-sm"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">3M BBSW:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.0001"
                    value={spotRates?.threeMonth?.toFixed(4) || ''}
                    onChange={e => setSpotRates({ ...spotRates!, threeMonth: parseFloat(e.target.value) || 0 })}
                    className="input w-20 text-right font-mono text-sm"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">6M BBSW:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.0001"
                    value={spotRates?.sixMonth?.toFixed(4) || ''}
                    onChange={e => setSpotRates({ ...spotRates!, sixMonth: parseFloat(e.target.value) || 0 })}
                    className="input w-20 text-right font-mono text-sm"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Government Bonds Card */}
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <TrendingUp className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold text-foreground">Government Bond Yields</h3>
                <p className="text-sm text-muted-foreground">Australian Government Securities</p>
              </div>
              {isLoadingData && (
                <RefreshCw className="h-4 w-4 animate-spin text-primary ml-auto" />
              )}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">2Y Govt Bond:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={govBonds && typeof govBonds.bond2Y === 'number' && !isNaN(govBonds.bond2Y) ? govBonds.bond2Y.toFixed(2) : ''}
                    onChange={(e) => setGovBonds({...govBonds!, bond2Y: parseFloat(e.target.value) || 0})}
                    className="input w-20 text-right font-mono text-sm"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">3Y Govt Bond:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={govBonds && typeof govBonds.bond3Y === 'number' && !isNaN(govBonds.bond3Y) ? govBonds.bond3Y.toFixed(2) : ''}
                    onChange={(e) => setGovBonds({...govBonds!, bond3Y: parseFloat(e.target.value) || 0})}
                    className="input w-20 text-right font-mono text-sm"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">5Y Govt Bond:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={govBonds && typeof govBonds.bond5Y === 'number' && !isNaN(govBonds.bond5Y) ? govBonds.bond5Y.toFixed(2) : ''}
                    onChange={(e) => setGovBonds({...govBonds!, bond5Y: parseFloat(e.target.value) || 0})}
                    className="input w-20 text-right font-mono text-sm"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">10Y Govt Bond:</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    value={govBonds && typeof govBonds.bond10Y === 'number' && !isNaN(govBonds.bond10Y) ? govBonds.bond10Y.toFixed(2) : ''}
                    onChange={(e) => setGovBonds({...govBonds!, bond10Y: parseFloat(e.target.value) || 0})}
                    className="input w-20 text-right font-mono text-sm"
                  />
                  <span className="text-muted-foreground text-sm">%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Enhanced Forward Curve Chart */}
        {forwardCurve.length > 0 && (
          <div className="rounded-xl border border-border/50 bg-card shadow-sm mb-8 overflow-hidden">
            <div className="bg-gradient-to-r from-accent/5 to-accent/10 p-6 border-b border-border/50">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10 border border-accent/20">
                    <TrendingUp className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {showRBAYieldCurve ? 'RBA Government Bond Yield Curve' : 'AUD Forward Swap Curve'}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {showRBAYieldCurve ? 'Cash Rate & Government Bond Yields' : 'Forward-looking Interest Rate Curve'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showRBAYieldCurve}
                      onChange={e => setShowRBAYieldCurve(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                    />
                    <span className="text-muted-foreground">Show Cash Rate & Govt Bonds (RBA-style)</span>
                  </label>
                </div>
              </div>
            </div>
            <div className="p-6">
              <ResponsiveContainer width="100%" height={450}>
                <LineChart data={forwardCurve} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 2" opacity={0.5} />
                  <XAxis 
                    dataKey="tenor" 
                    stroke="hsl(var(--muted-foreground))" 
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    label={{ value: 'Term to Maturity', position: 'insideBottom', offset: -10, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} 
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    domain={['dataMin - 0.1', 'dataMax + 0.1']}
                    tickFormatter={(value) => `${value.toFixed(2)}%`}
                    label={{ value: 'Yield (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                  />
                  <Tooltip
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      borderColor: 'hsl(var(--border))', 
                      color: 'hsl(var(--popover-foreground))',
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--border))',
                      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                    }}
                    itemStyle={{ color: 'hsl(var(--popover-foreground))', fontSize: '12px' }}
                    labelStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: '12px' }}
                    formatter={(value: number, name: string) => [`${typeof value === 'number' ? value.toFixed(4) : value}%`, 'Yield']}
                    labelFormatter={(label) => `Tenor: ${label}`}
                  />
                  <Legend 
                    wrapperStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: '12px' }}
                    iconType="line"
                  />
                  <Line
                    type="monotone"
                    dataKey="rate"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={{ r: 5, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                    activeDot={{ r: 7, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--background))', strokeWidth: 2 }}
                    name="Yield (%)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        {/* Enhanced Monthly Interpolated Curve */}
        <div className="rounded-xl border border-border/50 bg-card shadow-sm mb-8 overflow-hidden">
          <div className="bg-gradient-to-r from-info/5 to-info/10 p-6 border-b border-border/50">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-info/10 border border-info/20">
                  <Calculator className="h-5 w-5 text-info" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Monthly Interpolated Forward Curve</h3>
                  <p className="text-sm text-muted-foreground">96-month forward projection with advanced interpolation</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useForecastMode}
                    onChange={(e) => setUseForecastMode(e.target.checked)}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                  />
                  <span className="text-muted-foreground">Use Cubic Spline Interpolation</span>
                </label>
              </div>
            </div>
          </div>
          <div className="p-6">
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={useForecastMode ? forecasted : interpolated} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 2" opacity={0.5} />
                <XAxis 
                  dataKey="month" 
                  stroke="hsl(var(--muted-foreground))" 
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'Month', position: 'insideBottom', offset: -10, style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }} 
                />
                <YAxis 
                  domain={['dataMin - 0.1', 'dataMax + 0.1']} 
                  tickFormatter={v => `${v.toFixed(2)}%`} 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  label={{ value: 'Yield (%)', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: 'hsl(var(--muted-foreground))' } }}
                />
                <Tooltip
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--popover))', 
                    borderColor: 'hsl(var(--border))', 
                    color: 'hsl(var(--popover-foreground))',
                    borderRadius: '8px',
                    border: '1px solid hsl(var(--border))',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                  itemStyle={{ color: 'hsl(var(--popover-foreground))', fontSize: '12px' }}
                  labelStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: '12px' }}
                  formatter={(v: number) => (typeof v === 'number' ? `${v.toFixed(4)}%` : v)}
                  labelFormatter={(label) => `Month: ${label}`}
                />
                <Line 
                  type="monotone" 
                  dataKey="rate" 
                  stroke="hsl(var(--primary))" 
                  dot={false} 
                  strokeWidth={2}
                  name={useForecastMode ? 'Cubic Spline' : 'Linear Interpolation'}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        {/* Enhanced Data Table */}
        <div className="rounded-xl border border-border/50 bg-card shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-muted/5 to-muted/10 p-6 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted/10 border border-muted/20">
                <Info className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Forward Curve Data Points</h3>
                <p className="text-sm text-muted-foreground">Complete yield curve data with source information</p>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 bg-muted/30">
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Tenor</th>
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Months</th>
                  <th className="px-6 py-4 text-right font-semibold text-foreground">Rate (%)</th>
                  <th className="px-6 py-4 text-left font-semibold text-foreground">Source</th>
                </tr>
              </thead>
              <tbody>
                {forwardCurve.map((point, index) => (
                  <tr key={index} className="border-b border-border/30 hover:bg-muted/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{point.tenor}</td>
                    <td className="px-6 py-4 text-muted-foreground">{point.months}</td>
                    <td className="px-6 py-4 text-right font-mono text-lg font-semibold text-foreground">
                      {point.rate.toFixed(4)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                        point.type === 'Cash Rate' ? 'bg-success/10 text-success border border-success/20' :
                        point.type === 'BBSW' ? 'bg-primary/10 text-primary border border-primary/20' :
                        point.type === 'Govt Bond' ? 'bg-info/10 text-info border border-info/20' :
                        'bg-muted/10 text-muted-foreground border border-muted/20'
                      }`}>
                        {point.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AUDForwardCurveTool;