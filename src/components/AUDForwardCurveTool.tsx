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
  // Add state for BBSW-OIS spread (in percent)
  const [bbswOisSpread, setBbswOisSpread] = useState(0.20); // 20 basis points default

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

  // Helper to get adjusted BBSW rates
  const getAdjustedBBSW = (rate: number | undefined) => {
    if (typeof rate !== 'number' || isNaN(rate)) return '';
    return (rate - bbswOisSpread).toFixed(4);
  };

  // Calculate RBA-style yield curve (Cash + BBSW + Govt Bonds)
  const calculateRBAYieldCurve = useCallback(() => {
    if (!spotRates || !govBonds) {
      setForwardCurve([]);
      return;
    }
    const curve: CurvePoint[] = [];
    curve.push({ tenor: 'Cash', months: 0, rate: Number(spotRates.cash), type: 'Cash Rate' });
    curve.push({ tenor: '1M', months: 1, rate: Number(spotRates.oneMonth) - bbswOisSpread, type: 'BBSW (adj)' });
    curve.push({ tenor: '3M', months: 3, rate: Number(spotRates.threeMonth) - bbswOisSpread, type: 'BBSW (adj)' });
    curve.push({ tenor: '6M', months: 6, rate: Number(spotRates.sixMonth) - bbswOisSpread, type: 'BBSW (adj)' });
    curve.push({ tenor: '2Y', months: 24, rate: Number(govBonds.bond2Y), type: 'Govt Bond' });
    curve.push({ tenor: '3Y', months: 36, rate: Number(govBonds.bond3Y), type: 'Govt Bond' });
    curve.push({ tenor: '5Y', months: 60, rate: Number(govBonds.bond5Y), type: 'Govt Bond' });
    curve.push({ tenor: '10Y', months: 120, rate: Number(govBonds.bond10Y), type: 'Govt Bond' });
    setForwardCurve(curve);
  }, [spotRates, govBonds, bbswOisSpread]);

  // Calculate full swap/forward curve (BBSW, forwards, bonds)
  const calculateForwardCurve = useCallback(() => {
    if (!spotRates || !govBonds) {
      setForwardCurve([]);
      return;
    }
    const curve: CurvePoint[] = [];
    curve.push({ tenor: '1M', months: 1, rate: Number(spotRates.oneMonth) - bbswOisSpread, type: 'Spot (adj)' });
    curve.push({ tenor: '3M', months: 3, rate: Number(spotRates.threeMonth) - bbswOisSpread, type: 'Spot (adj)' });
    curve.push({ tenor: '6M', months: 6, rate: Number(spotRates.sixMonth) - bbswOisSpread, type: 'Spot (adj)' });
    curve.push({ tenor: '2Y', months: 24, rate: Number(govBonds.bond2Y), type: 'Govt Bond' });
    curve.push({ tenor: '3Y', months: 36, rate: Number(govBonds.bond3Y), type: 'Govt Bond' });
    curve.push({ tenor: '5Y', months: 60, rate: Number(govBonds.bond5Y), type: 'Govt Bond' });
    curve.push({ tenor: '10Y', months: 120, rate: Number(govBonds.bond10Y), type: 'Govt Bond' });
    setForwardCurve(curve);
  }, [spotRates, govBonds, bbswOisSpread]);

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
    <div className={`w-full max-w-7xl mx-auto p-6 ${isDarkMode ? 'bg-background text-foreground' : 'bg-background text-foreground'}`}>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="h1 mb-2">AUD Forward Rate Curve Construction Tool</h1>
          <p className="text-muted-foreground">Build forward-looking AUD base rate curves using dynamic market data</p>
        </div>
        <button
          onClick={toggleDarkMode}
          className="btn-secondary h-10 px-4"
        >
          {isDarkMode ? 'Light Mode' : 'Dark Mode'}
        </button>
      </div>
      {/* Data Status Bar */}
      <div className="status-bar">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between w-full gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="text-success" size={16} />
              ) : (
                <WifiOff className="text-destructive" size={16} />
              )}
              <span className="text-sm">
                Data Source: <strong>{dataSource}</strong>
              </span>
            </div>
            {lastDataUpdate && (
              <span className="text-xs text-muted-foreground">
                Last Updated: {new Date(lastDataUpdate).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>
          <div className="button-group mt-2 md:mt-0">
            <button
              onClick={fetchMarketData}
              disabled={isLoadingData}
              className="btn-primary h-10 min-w-[140px] px-4 flex items-center justify-center"
            >
              <RefreshCw className={`${isLoadingData ? 'animate-spin' : ''} mr-2`} size={16} />
              {isLoadingData ? 'Updating...' : 'Refresh Data'}
            </button>
            <button
              onClick={downloadCSV}
              className="btn-ghost h-10 min-w-[140px] px-4 flex items-center justify-center"
            >
              <Download size={16} className="mr-2" />
              Download CSV
            </button>
          </div>
        </div>
        {dataFetchErrors.length > 0 && (
          <div className="info-box bg-destructive/10 text-destructive-foreground border-destructive-foreground/20 mt-2">
            <strong>Data Fetch Errors:</strong> {dataFetchErrors.join(', ')}
          </div>
        )}
        {dataSource.includes('Mock Data') && (
          <div className="info-box bg-warning/10 text-warning-foreground border-warning-foreground/20 mt-2">
            <strong>Using Mock Data:</strong> Live RBA data unavailable, using representative market rates with slight randomization
          </div>
        )}
      </div>
      {/* Input Grid - REVISED TO USE CARD COMPONENT */}
      <div className="input-grid">
        <Card>
          <h2 className="section-title">
            <Calculator size={20} />
            Current Spot Rates (BBSW)
            {isLoadingData && <RefreshCw className="animate-spin text-primary" size={16} />}
          </h2>
          {/* BBSW-OIS Spread Input */}
          <div className="flex items-center gap-2 mb-2">
            <label className="text-sm font-medium text-muted-foreground">BBSW-OIS Spread (bps):</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={bbswOisSpread}
              onChange={e => setBbswOisSpread(parseFloat(e.target.value) || 0)}
              className="input w-20"
            />
            <span className="text-muted-foreground ml-1">%</span>
            <span className="text-xs text-muted-foreground">(default 0.20 = 20bps)</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">Cash Rate:</label>
              <input
                type="number"
                step="0.0001"
                value={spotRates?.cash?.toFixed(4) || ''}
                onChange={e => setSpotRates({ ...spotRates!, cash: parseFloat(e.target.value) || 0 })}
                className="input w-24"
              />
              <span className="text-muted-foreground ml-1">%</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">1M BBSW (adj):</label>
              <input
                type="number"
                step="0.0001"
                value={spotRates?.oneMonth?.toFixed(4) || ''}
                onChange={e => setSpotRates({ ...spotRates!, oneMonth: parseFloat(e.target.value) || 0 })}
                className="input w-24"
              />
              <span className="text-muted-foreground ml-1">%</span>
              <span className="text-xs text-muted-foreground">(adj: {getAdjustedBBSW(spotRates?.oneMonth)})</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">3M BBSW (adj):</label>
              <input
                type="number"
                step="0.0001"
                value={spotRates?.threeMonth?.toFixed(4) || ''}
                onChange={e => setSpotRates({ ...spotRates!, threeMonth: parseFloat(e.target.value) || 0 })}
                className="input w-24"
              />
              <span className="text-muted-foreground ml-1">%</span>
              <span className="text-xs text-muted-foreground">(adj: {getAdjustedBBSW(spotRates?.threeMonth)})</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">6M BBSW (adj):</label>
              <input
                type="number"
                step="0.0001"
                value={spotRates?.sixMonth?.toFixed(4) || ''}
                onChange={e => setSpotRates({ ...spotRates!, sixMonth: parseFloat(e.target.value) || 0 })}
                className="input w-24"
              />
              <span className="text-muted-foreground ml-1">%</span>
              <span className="text-xs text-muted-foreground">(adj: {getAdjustedBBSW(spotRates?.sixMonth)})</span>
            </div>
          </div>
        </Card>
        <Card>
          <h2 className="section-title">
            <TrendingUp size={20} />
            Govt Bond Rate
            {isLoadingData && <RefreshCw className="animate-spin text-primary" size={16} />}
          </h2>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">2Y Govt Bond:</label>
              <input
                type="number"
                step="0.01"
                value={govBonds && typeof govBonds.bond2Y === 'number' && !isNaN(govBonds.bond2Y) ? govBonds.bond2Y.toFixed(2) : ''}
                onChange={(e) => setGovBonds({...govBonds!, bond2Y: parseFloat(e.target.value) || 0})}
                className="input w-20"
              />
              <span className="text-muted-foreground ml-1">%</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">3Y Govt Bond:</label>
              <input
                type="number"
                step="0.01"
                value={govBonds && typeof govBonds.bond3Y === 'number' && !isNaN(govBonds.bond3Y) ? govBonds.bond3Y.toFixed(2) : ''}
                onChange={(e) => setGovBonds({...govBonds!, bond3Y: parseFloat(e.target.value) || 0})}
                className="input w-20"
              />
              <span className="text-muted-foreground ml-1">%</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">5Y Govt Bond:</label>
              <input
                type="number"
                step="0.01"
                value={govBonds && typeof govBonds.bond5Y === 'number' && !isNaN(govBonds.bond5Y) ? govBonds.bond5Y.toFixed(2) : ''}
                onChange={(e) => setGovBonds({...govBonds!, bond5Y: parseFloat(e.target.value) || 0})}
                className="input w-20"
              />
              <span className="text-muted-foreground ml-1">%</span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-muted-foreground">10Y Govt Bond:</label>
              <input
                type="number"
                step="0.01"
                value={govBonds && typeof govBonds.bond10Y === 'number' && !isNaN(govBonds.bond10Y) ? govBonds.bond10Y.toFixed(2) : ''}
                onChange={(e) => setGovBonds({...govBonds!, bond10Y: parseFloat(e.target.value) || 0})}
                className="input w-20"
              />
              <span className="text-muted-foreground ml-1">%</span>
            </div>
          </div>
        </Card>
      </div>
      {/* Forward Curve Chart - REVISED CLASS */}
      {forwardCurve.length > 0 && (
        <div className="chart-container">
          <h2 className="section-title">
            {showRBAYieldCurve ? 'RBA Government Bond Yield Curve' : 'AUD Forward Swap Curve'}
          </h2>
          <div className="mb-4 flex items-center gap-4">
            <label className="text-sm font-medium text-muted-foreground flex items-center">
              <input
                type="checkbox"
                checked={showRBAYieldCurve}
                onChange={e => setShowRBAYieldCurve(e.target.checked)}
                className="mr-2 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              Show Cash Rate & Govt Bonds (RBA-style)
            </label>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={forwardCurve}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <XAxis dataKey="tenor" stroke="hsl(var(--muted-foreground))" label={{ value: 'Term to Maturity', position: 'insideBottom', offset: -5, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                domain={['dataMin - 0.1', 'dataMax + 0.1']}
                tickFormatter={(value) => `${value.toFixed(2)}%`}
                label={{ value: 'Yield (%)', angle: -90, position: 'insideLeft', fill: 'hsl(var(--muted-foreground))' }}
              />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                formatter={(value: number, name: string) => [`${typeof value === 'number' ? value.toFixed(4) : value}%`, 'Yield']}
                labelFormatter={(label) => `Tenor: ${label}`}
              />
              <Legend wrapperStyle={{ color: 'hsl(var(--muted-foreground))' }} />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 4, fill: 'hsl(var(--primary))', stroke: 'hsl(var(--primary))' }}
                name="Yield (%)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {/* Monthly Interpolated Curve - REVISED CLASS */}
      <div className="chart-container mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Monthly Interpolated Forward Curve (0–96 months)</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center">
              <input
                type="checkbox"
                checked={useForecastMode}
                onChange={(e) => setUseForecastMode(e.target.checked)}
                className="mr-2 h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              Use Cubic Spline Interpolation (vs Linear)
            </label>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={useForecastMode ? forecasted : interpolated}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" />
            <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" label={{ value: 'Month', position: 'insideBottom', offset: -5, fill: 'hsl(var(--muted-foreground))' }} />
            <YAxis domain={['dataMin - 0.1', 'dataMax + 0.1']} tickFormatter={v => `${v.toFixed(2)}%`} stroke="hsl(var(--muted-foreground))" />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
              itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
              labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
              formatter={(v: number) => (typeof v === 'number' ? `${v.toFixed(2)}%` : v)}
            />
            <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Data Table - REVISED CLASS */}
      <div className="card mt-8">
        <h2 className="section-title">Forward Curve Data Points</h2>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr className="bg-secondary">
                <th className="px-4 py-2 text-left">Tenor</th>
                <th className="px-4 py-2 text-left">Months</th>
                <th className="px-4 py-2 text-right">Rate (%)</th>
                <th className="px-4 py-2 text-left">Source</th>
              </tr>
            </thead>
            <tbody>
              {forwardCurve.map((point, index) => (
                <tr key={index}>
                  <td className="px-4 py-2 font-medium">{point.tenor}</td>
                  <td className="px-4 py-2">{point.months}</td>
                  <td className="px-4 py-2 text-right font-mono">{point.rate.toFixed(4)}</td>
                  <td className="px-4 py-2 text-sm text-muted-foreground">{point.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AUDForwardCurveTool;
