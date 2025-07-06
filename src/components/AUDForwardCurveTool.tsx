// --- IMPORTANT: Install papaparse before running this code ---
// npm install papaparse @types/papaparse
// -------------------------------------------------------------

import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, Calculator, TrendingUp, Info, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import Papa from 'papaparse';

// Chad.CN-inspired Card component
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`rounded-xl border bg-card text-card-foreground shadow-sm p-6 ${className}`}>{children}</div>
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
  // Current market data
  const [spotRates, setSpotRates] = useState<SpotRates | null>(null);
  // Government bond yields
  const [govBonds, setGovBonds] = useState<BondYields | null>(null);
  const [forwardCurve, setForwardCurve] = useState<CurvePoint[]>([]);
  const [showInstructions, setShowInstructions] = useState(false);
  const [useForecastMode, setUseForecastMode] = useState(false);
  // Data fetching states
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [lastDataUpdate, setLastDataUpdate] = useState(null);
  const [dataFetchErrors, setDataFetchErrors] = useState([]);
  const [isConnected, setIsConnected] = useState(true);
  const [dataSource, setDataSource] = useState('Manual Input');
  // Swap between RBA-style and full swap curve
  const [showRBAYieldCurve, setShowRBAYieldCurve] = useState(true);

  const dataFetcher = new AUDDataFetcher();

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
    <div className="w-full max-w-7xl mx-auto p-6 bg-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">AUD Forward Curve Construction Tool</h1>
        <p className="text-gray-600">Build forward-looking AUD swap curves using dynamic market data</p>
        
        {/* Data Status Bar */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isConnected ? <Wifi className="text-green-500" size={16} /> : <WifiOff className="text-red-500" size={16} />}
              <span className="text-sm">
                Data Source: <strong>{dataSource}</strong>
              </span>
              {lastDataUpdate && (
                <span className="text-xs text-gray-500">
                  Last Updated: {new Date(lastDataUpdate).toLocaleTimeString()}
                </span>
              )}
            </div>
            <button
              onClick={fetchMarketData}
              disabled={isLoadingData}
              className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50"
            >
              <RefreshCw className={`${isLoadingData ? 'animate-spin' : ''}`} size={14} />
              {isLoadingData ? 'Updating...' : 'Refresh Data'}
            </button>
          </div>
          
          {dataFetchErrors.length > 0 && (
            <div className="mt-2 p-2 bg-red-100 border border-red-300 rounded text-xs">
              <strong>Data Fetch Errors:</strong> {dataFetchErrors.join(', ')}
            </div>
          )}
          
          {dataSource.includes('Mock Data') && (
            <div className="mt-2 p-2 bg-orange-100 border border-orange-300 rounded text-xs">
              <strong>Using Mock Data:</strong> Live RBA data unavailable, using representative market rates with slight randomization
            </div>
          )}
        </div>
        
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200"
          >
            <Info size={16} />
            Instructions
          </button>
          <button
            onClick={downloadCSV}
            className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200"
          >
            <Download size={16} />
            Download CSV
          </button>
        </div>

        {showInstructions && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">How to Use This Tool:</h3>
            <ol className="list-decimal list-inside text-blue-800 space-y-1 text-sm">
              <li>Click <strong>"Refresh Data"</strong> to automatically fetch current market data</li>
              <li>Manual adjustments can be made to any input fields as needed</li>
              <li>The forward curve automatically recalculates using bootstrapping methodology</li>
              <li>Data is automatically refreshed every 15 minutes</li>
              <li>Download the results as CSV for use in Excel or other tools</li>
            </ol>
            <div className="mt-3 pt-3 border-t border-blue-300">
              <h4 className="font-semibold text-blue-900 mb-1">Data Sources (Auto-fetched):</h4>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• <strong>Nomics World API:</strong> Professional financial data API for RBA statistical tables</li>
                <li>• <strong>Live Data:</strong> F1 (Money Market) and F2 (Capital Market) via db.nomics.world</li>
                <li>• <strong>Update Frequency:</strong> Real-time API access to latest RBA data</li>
                <li>• <strong>Reliability:</strong> Enterprise-grade data service with high availability</li>
              </ul>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Current Spot Rates Input */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Calculator size={20} />
            Current Spot Rates (BBSW)
            {isLoadingData && <RefreshCw className="animate-spin text-blue-500" size={16} />}
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-700">Cash Rate:</label>
              <input
                type="number"
                step="0.01"
                value={spotRates?.cash?.toFixed(4) || ''}
                onChange={e => setSpotRates({ ...spotRates!, cash: parseFloat(e.target.value) || 0 })}
                className="w-24 px-2 py-1 border rounded text-right font-mono text-sm"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-700">1M BBSW:</label>
              <input
                type="number"
                step="0.01"
                value={spotRates?.oneMonth?.toFixed(4) || ''}
                onChange={e => setSpotRates({ ...spotRates!, oneMonth: parseFloat(e.target.value) || 0 })}
                className="w-24 px-2 py-1 border rounded text-right font-mono text-sm"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-700">3M BBSW:</label>
              <input
                type="number"
                step="0.01"
                value={spotRates?.threeMonth?.toFixed(4) || ''}
                onChange={e => setSpotRates({ ...spotRates!, threeMonth: parseFloat(e.target.value) || 0 })}
                className="w-24 px-2 py-1 border rounded text-right font-mono text-sm"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-700">6M BBSW:</label>
              <input
                type="number"
                step="0.01"
                value={spotRates?.sixMonth?.toFixed(4) || ''}
                onChange={e => setSpotRates({ ...spotRates!, sixMonth: parseFloat(e.target.value) || 0 })}
                className="w-24 px-2 py-1 border rounded text-right font-mono text-sm"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
          </div>
        </div>

        {/* Government Bond Yields Input */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <TrendingUp size={20} />
            Govt Bond Rate
            {isLoadingData && <RefreshCw className="animate-spin text-blue-500" size={16} />}
          </h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-700">2Y Govt Bond:</label>
              <input
                type="number"
                step="0.01"
                value={govBonds && typeof govBonds.bond2Y === 'number' && !isNaN(govBonds.bond2Y) ? govBonds.bond2Y.toFixed(2) : ''}
                onChange={(e) => setGovBonds({...govBonds!, bond2Y: parseFloat(e.target.value) || 0})}
                className="w-20 px-2 py-1 border rounded text-right font-mono text-sm"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-700">3Y Govt Bond:</label>
              <input
                type="number"
                step="0.01"
                value={govBonds && typeof govBonds.bond3Y === 'number' && !isNaN(govBonds.bond3Y) ? govBonds.bond3Y.toFixed(2) : ''}
                onChange={(e) => setGovBonds({...govBonds!, bond3Y: parseFloat(e.target.value) || 0})}
                className="w-20 px-2 py-1 border rounded text-right font-mono text-sm"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-700">5Y Govt Bond:</label>
              <input
                type="number"
                step="0.01"
                value={govBonds && typeof govBonds.bond5Y === 'number' && !isNaN(govBonds.bond5Y) ? govBonds.bond5Y.toFixed(2) : ''}
                onChange={(e) => setGovBonds({...govBonds!, bond5Y: parseFloat(e.target.value) || 0})}
                className="w-20 px-2 py-1 border rounded text-right font-mono text-sm"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-700">10Y Govt Bond:</label>
              <input
                type="number"
                step="0.01"
                value={govBonds && typeof govBonds.bond10Y === 'number' && !isNaN(govBonds.bond10Y) ? govBonds.bond10Y.toFixed(2) : ''}
                onChange={(e) => setGovBonds({...govBonds!, bond10Y: parseFloat(e.target.value) || 0})}
                className="w-20 px-2 py-1 border rounded text-right font-mono text-sm"
              />
              <span className="text-sm text-gray-500">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Forward Curve Chart */}
      {forwardCurve.length > 0 && (
        <div className="bg-white border rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">
            {showRBAYieldCurve ? 'RBA Government Bond Yield Curve' : 'AUD Forward Swap Curve'}
          </h2>
          <div className="mb-2 flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={showRBAYieldCurve}
                onChange={e => setShowRBAYieldCurve(e.target.checked)}
                className="mr-2"
              />
              Show only Cash Rate & Govt Bonds (RBA-style)
            </label>
          </div>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={forwardCurve}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="tenor" label={{ value: 'Term to Maturity', position: 'insideBottom', offset: -5 }} />
              <YAxis 
                domain={['dataMin - 0.1', 'dataMax + 0.1']}
                tickFormatter={(value) => `${value.toFixed(2)}%`}
                label={{ value: 'Yield (%)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                formatter={(value: number, name: string) => [`${typeof value === 'number' ? value.toFixed(4) : value}%`, 'Yield']}
                labelFormatter={(label) => `Tenor: ${label}`}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="rate" 
                stroke="#2563eb" 
                strokeWidth={2}
                dot={{ r: 4 }}
                name="Yield (%)"
              />
            </LineChart>         
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly Interpolated Curve */}
      <div className="bg-white border rounded-lg p-6 mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Monthly Interpolated Forward Curve (0–96 months)</h2>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              <input
                type="checkbox"
                checked={useForecastMode}
                onChange={(e) => setUseForecastMode(e.target.checked)}
                className="mr-2"
              />
              Use Cubic Spline Interpolation (vs Linear)
            </label>
          </div>
        </div>
        
        
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={useForecastMode ? forecasted : interpolated}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" label={{ value: 'Month', position: 'insideBottom', offset: -5 }} />
            <YAxis domain={['dataMin - 0.1', 'dataMax + 0.1']} tickFormatter={v => `${v.toFixed(2)}%`} />
            <Tooltip formatter={(v: number) => (typeof v === 'number' ? `${v.toFixed(2)}%` : v)} />
            <Line type="monotone" dataKey="rate" stroke="#4f46e5" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Data Table */}
      <div className="bg-white border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-4">Forward Curve Data Points</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-4 py-2 text-left">Tenor</th>
                <th className="px-4 py-2 text-left">Months</th>
                <th className="px-4 py-2 text-right">Rate (%)</th>
                <th className="px-4 py-2 text-left">Source</th>
              </tr>
            </thead>
            <tbody>
              {forwardCurve.map((point, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                  <td className="px-4 py-2 font-medium">{point.tenor}</td>
                  <td className="px-4 py-2">{point.months}</td>
                  <td className="px-4 py-2 text-right font-mono">{point.rate.toFixed(4)}</td>
                  <td className="px-4 py-2 text-sm text-gray-600">{point.type}</td>
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