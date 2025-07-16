import React, { useState, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download, Calculator, TrendingUp, RefreshCw, Wifi, WifiOff, Moon, Sun } from 'lucide-react';
import Papa from 'papaparse';

// Import shadcn components
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';

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

interface CurvePoint {
  tenor: string;
  months: number;
  rate: number;
  type: string;
}

// Data fetching class for RBA CSVs
class AUDDataFetcher {
  corsProxy = 'https://corsproxy.io/?';
  f1Url = this.corsProxy + 'https://www.rba.gov.au/statistics/tables/csv/f1.1-data.csv';
  f2Url = this.corsProxy + 'https://www.rba.gov.au/statistics/tables/csv/f2-data.csv';

  async fetchCSV(url: string): Promise<any[]> {
    console.log('Fetching CSV from:', url);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
    const text = await response.text();
    console.log('CSV text length:', text.length);
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => {
          console.log('Parsed rows:', results.data.length);
          resolve(results.data);
        },
        error: (err: any) => reject(err)
      });
    });
  }

  async fetchBBSWRates(): Promise<SpotRates> {
    const data = await this.fetchCSV(this.f1Url);
    let lastRow: string[] | undefined;
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i].map((cell: string) => (cell || '').trim());
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

  async fetchRBABondYields(): Promise<BondYields> {
    const data = await this.fetchCSV(this.f2Url);
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

function cubicSplineInterpolate(points: { months: number; rate: number }[], totalMonths = 96) {
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

const AUDForwardCurveTool = () => {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [spotRates, setSpotRates] = useState<SpotRates | null>(null);
  const [govBonds, setGovBonds] = useState<BondYields | null>(null);
  const [forwardCurve, setForwardCurve] = useState<CurvePoint[]>([]);
  const [useForecastMode, setUseForecastMode] = useState(true);
  const [interpolationMethod, setInterpolationMethod] = useState('linear');
  const [oisSpread, setOISSpread] = useState(30);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [lastDataUpdate, setLastDataUpdate] = useState(new Date().toISOString());
  const [dataFetchErrors, setDataFetchErrors] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(true);
  const [dataSource, setDataSource] = useState('Loading...');
  const [showRBAYieldCurve, setShowRBAYieldCurve] = useState(true);

  const dataFetcher = new AUDDataFetcher();

  // Initialize dark mode based on system preference
  useEffect(() => {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newDarkMode = !isDarkMode;
    setIsDarkMode(newDarkMode);
    document.documentElement.classList.toggle('dark', newDarkMode);
    document.documentElement.style.colorScheme = newDarkMode ? 'dark' : 'light';
  };

  const fetchMarketData = useCallback(async () => {
    setIsLoadingData(true);
    setDataFetchErrors([]);
    
    try {
      const results = await dataFetcher.fetchAllData();
      if (results.bbsw) {
        setSpotRates(results.bbsw);
      }
      if (results.bonds) {
        setGovBonds(results.bonds);
      }
      if (results.bbsw && results.bonds) {
        setDataSource('RBA F1 & F2 CSV');
      } else if (results.bbsw) {
        setDataSource('RBA F1 CSV');
      } else if (results.bonds) {
        setDataSource('RBA F2 CSV');
      }
      setLastDataUpdate(results.lastUpdate);
      setDataFetchErrors(results.errors);
      setIsConnected(results.errors.length === 0);
    } catch (error: any) {
      console.error('Data fetch error:', error);
      setDataFetchErrors([`Failed to fetch data: ${error.message}`]);
      setIsConnected(false);
      setDataSource('Error - Check Console');
    } finally {
      setIsLoadingData(false);
    }
  }, []);

  const getAdjustedBBSW = (rate: number | undefined) => {
    if (typeof rate !== 'number' || isNaN(rate)) return '';
    return (rate - (oisSpread / 100)).toFixed(4);
  };

  const calculateRBAYieldCurve = useCallback(() => {
    if (!spotRates || !govBonds) {
      setForwardCurve([]);
      return;
    }
    const curve: CurvePoint[] = [];
    curve.push({ tenor: 'Cash', months: 0, rate: Number(spotRates.cash), type: 'Cash Rate' });
    curve.push({ tenor: '1M', months: 1, rate: Number(spotRates.oneMonth) - (oisSpread / 100), type: 'BBSW (adj)' });
    curve.push({ tenor: '3M', months: 3, rate: Number(spotRates.threeMonth) - (oisSpread / 100), type: 'BBSW (adj)' });
    curve.push({ tenor: '6M', months: 6, rate: Number(spotRates.sixMonth) - (oisSpread / 100), type: 'BBSW (adj)' });
    curve.push({ tenor: '2Y', months: 24, rate: Number(govBonds.bond2Y), type: 'Govt Bond' });
    curve.push({ tenor: '3Y', months: 36, rate: Number(govBonds.bond3Y), type: 'Govt Bond' });
    curve.push({ tenor: '5Y', months: 60, rate: Number(govBonds.bond5Y), type: 'Govt Bond' });
    curve.push({ tenor: '10Y', months: 120, rate: Number(govBonds.bond10Y), type: 'Govt Bond' });
    setForwardCurve(curve);
  }, [spotRates, govBonds, oisSpread]);

  const calculateForwardCurve = useCallback(() => {
    if (!spotRates || !govBonds) {
      setForwardCurve([]);
      return;
    }
    const curve: CurvePoint[] = [];
    curve.push({ tenor: '1M', months: 1, rate: Number(spotRates.oneMonth) - (oisSpread / 100), type: 'Spot (adj)' });
    curve.push({ tenor: '3M', months: 3, rate: Number(spotRates.threeMonth) - (oisSpread / 100), type: 'Spot (adj)' });
    curve.push({ tenor: '6M', months: 6, rate: Number(spotRates.sixMonth) - (oisSpread / 100), type: 'Spot (adj)' });
    curve.push({ tenor: '2Y', months: 24, rate: Number(govBonds.bond2Y), type: 'Govt Bond' });
    curve.push({ tenor: '3Y', months: 36, rate: Number(govBonds.bond3Y), type: 'Govt Bond' });
    curve.push({ tenor: '5Y', months: 60, rate: Number(govBonds.bond5Y), type: 'Govt Bond' });
    curve.push({ tenor: '10Y', months: 120, rate: Number(govBonds.bond10Y), type: 'Govt Bond' });
    setForwardCurve(curve);
  }, [spotRates, govBonds, oisSpread]);

  useEffect(() => {
    if (showRBAYieldCurve) {
      calculateRBAYieldCurve();
    } else {
      calculateForwardCurve();
    }
  }, []);

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

  const forecasted = cubicSplineInterpolate(forwardCurve, 96);
  const interpolated = interpolateMonthlyRates(forwardCurve, 96);

  const downloadCSV = () => {
    const headers1 = ['Tenor', 'Months', 'Rate (%)', 'Source'];
    const csvContent1 = [
      headers1.join(','),
      ...forwardCurve.map(point => 
        `${point.tenor},${point.months},${point.rate.toFixed(4)},${point.type}`
      )
    ].join('\n');

    const headers2 = ['Month', 'Linear Interpolation (%)', 'Cubic Spline Interpolation (%)'];
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

  const validateAndCleanData = (data: { month: number; rate: number }[]) => {
    return data.filter(point => 
      point && 
      typeof point.rate === 'number' && 
      !isNaN(point.rate) && 
      isFinite(point.rate) &&
      point.rate >= 0 &&
      point.rate <= 30
    );
  };

  useEffect(() => {
    console.log('Forward Curve Data:', forwardCurve);
    console.log('Forecasted Data:', forecasted.slice(0, 5));
    console.log('Interpolated Data:', interpolated.slice(0, 5));
  }, [forwardCurve, forecasted, interpolated]);

  return (
    <div className="min-h-screen bg-white dark:bg-gray-900 transition-colors duration-200">
      {/* Header */}
      <header className="bg-black text-white p-4 shadow-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">AUD Forward Rate Curve Construction Tool</h1>
            <p className="text-gray-300 mt-1">Build forward-looking AUD base rate curves using dynamic market data</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="h-4 w-4 text-green-400" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-400" />
              )}
              <span className="text-sm text-gray-300">
                {dataSource}
              </span>
            </div>
            <div className="text-sm text-gray-300">
              Last Updated: {new Date(lastDataUpdate).toLocaleTimeString()}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleDarkMode}
              className="text-white hover:bg-white/10 border-gray-600"
            >
              {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-8">
        {/* Controls Row */}
        <div className="mb-8">
          <Card className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm dark:shadow-gray-900/10">
            <CardHeader className="bg-white dark:bg-gray-800 rounded-t-xl">
              <CardTitle className="flex items-center space-x-2 text-lg font-semibold text-gray-900 dark:text-white">
                <Calculator className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                <span>Curve Construction Controls</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="bg-white dark:bg-gray-800 rounded-b-xl">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-sm font-medium text-gray-900 dark:text-white">Data Source</label>
                    <Button
                      onClick={fetchMarketData}
                      disabled={isLoadingData}
                      size="sm"
                      className="bg-black hover:bg-gray-800 text-white font-medium rounded-md px-3 py-1.5 shadow-sm focus:ring-2 focus:ring-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors duration-200"
                    >
                      {isLoadingData ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      {isLoadingData ? 'Loading...' : 'Refresh RBA Data'}
                    </Button>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-900 dark:text-white">
                      BBSW-OIS Spread (bp)
                    </label>
                    <Input
                      type="number"
                      value={oisSpread}
                      onChange={(e) => setOISSpread(Number(e.target.value))}
                      className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400 transition-colors duration-200"
                      step="1"
                      min="0"
                      max="100"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <Button
                    onClick={downloadCSV}
                    variant="outline"
                    className="w-full border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-600"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Download CSV
                  </Button>
                  {dataFetchErrors.length > 0 && (
                    <div className="text-sm text-red-600 dark:text-red-400 space-y-1">
                      {dataFetchErrors.map((error, i) => (
                        <p key={i}>{error}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts and Tables Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Current Spot Rates */}
          <Card className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm dark:shadow-gray-900/10">
            <CardHeader className="bg-white dark:bg-gray-800 rounded-t-xl">
              <CardTitle className="flex items-center justify-between text-base font-semibold text-gray-900 dark:text-white">
                <span>Current Spot Rates (BBSW)</span>
                <Badge variant="outline" className="bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600">
                  {spotRates?.cash ? `${spotRates.cash.toFixed(2)}%` : 'Loading...'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="bg-white dark:bg-gray-800 rounded-b-xl">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">Cash Rate</label>
                    <Input
                      type="number"
                      value={spotRates?.cash || ''}
                      onChange={(e) => setSpotRates(prev => ({
                        cash: Number(e.target.value),
                        oneMonth: prev?.oneMonth || 0,
                        threeMonth: prev?.threeMonth || 0,
                        sixMonth: prev?.sixMonth || 0
                      }))}
                      className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">1M BBSW</label>
                    <Input
                      type="number"
                      value={spotRates?.oneMonth || ''}
                      onChange={(e) => setSpotRates(prev => ({
                        cash: prev?.cash || 0,
                        oneMonth: Number(e.target.value),
                        threeMonth: prev?.threeMonth || 0,
                        sixMonth: prev?.sixMonth || 0
                      }))}
                      className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">3M BBSW</label>
                    <Input
                      type="number"
                      value={spotRates?.threeMonth || ''}
                      onChange={(e) => setSpotRates(prev => ({
                        cash: prev?.cash || 0,
                        oneMonth: prev?.oneMonth || 0,
                        threeMonth: Number(e.target.value),
                        sixMonth: prev?.sixMonth || 0
                      }))}
                      className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">6M BBSW</label>
                    <Input
                      type="number"
                      value={spotRates?.sixMonth || ''}
                      onChange={(e) => setSpotRates(prev => ({
                        cash: prev?.cash || 0,
                        oneMonth: prev?.oneMonth || 0,
                        threeMonth: prev?.threeMonth || 0,
                        sixMonth: Number(e.target.value)
                      }))}
                      className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                      step="0.01"
                    />
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <h4 className="font-medium text-gray-900 dark:text-white">Adjusted Rates (BBSW - OIS Spread)</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-700 dark:text-gray-300">1M BBSW (Adj):</span>
                      <span className="font-mono text-gray-900 dark:text-white">{getAdjustedBBSW(spotRates?.oneMonth)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700 dark:text-gray-300">3M BBSW (Adj):</span>
                      <span className="font-mono text-gray-900 dark:text-white">{getAdjustedBBSW(spotRates?.threeMonth)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-700 dark:text-gray-300">6M BBSW (Adj):</span>
                      <span className="font-mono text-gray-900 dark:text-white">{getAdjustedBBSW(spotRates?.sixMonth)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Government Bond Rates */}
          <Card className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm dark:shadow-gray-900/10">
            <CardHeader className="bg-white dark:bg-gray-800 rounded-t-xl">
              <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">Government Bond Rates</CardTitle>
            </CardHeader>
            <CardContent className="bg-white dark:bg-gray-800 rounded-b-xl">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">2Y Govt Bond</label>
                  <Input
                    type="number"
                    value={govBonds?.bond2Y || ''}
                    onChange={(e) => setGovBonds(prev => ({
                      bond2Y: Number(e.target.value),
                      bond3Y: prev?.bond3Y || 0,
                      bond5Y: prev?.bond5Y || 0,
                      bond10Y: prev?.bond10Y || 0
                    }))}
                    className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">3Y Govt Bond</label>
                  <Input
                    type="number"
                    value={govBonds?.bond3Y || ''}
                    onChange={(e) => setGovBonds(prev => ({
                      bond2Y: prev?.bond2Y || 0,
                      bond3Y: Number(e.target.value),
                      bond5Y: prev?.bond5Y || 0,
                      bond10Y: prev?.bond10Y || 0
                    }))}
                    className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">5Y Govt Bond</label>
                  <Input
                    type="number"
                    value={govBonds?.bond5Y || ''}
                    onChange={(e) => setGovBonds(prev => ({
                      bond2Y: prev?.bond2Y || 0,
                      bond3Y: prev?.bond3Y || 0,
                      bond5Y: Number(e.target.value),
                      bond10Y: prev?.bond10Y || 0
                    }))}
                    className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-900 dark:text-white">10Y Govt Bond</label>
                  <Input
                    type="number"
                    value={govBonds?.bond10Y || ''}
                    onChange={(e) => setGovBonds(prev => ({
                      bond2Y: prev?.bond2Y || 0,
                      bond3Y: prev?.bond3Y || 0,
                      bond5Y: prev?.bond5Y || 0,
                      bond10Y: Number(e.target.value)
                    }))}
                    className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500"
                    step="0.01"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RBA Government Bond Yield Curve Chart */}
        <div className="mt-8">
          <Card className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm dark:shadow-gray-900/10">
            <CardHeader className="bg-white dark:bg-gray-800 rounded-t-xl">
              <CardTitle className="flex items-center space-x-2 text-base font-semibold text-gray-900 dark:text-white">
                <TrendingUp className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                <span>RBA Government Bond Yield Curve</span>
                <div className="flex items-center space-x-2 ml-auto">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="show-rba-curve"
                      checked={showRBAYieldCurve}
                      onCheckedChange={setShowRBAYieldCurve}
                      className="data-[state=checked]:bg-gray-800 dark:data-[state=checked]:bg-gray-600"
                    />
                    <label htmlFor="show-rba-curve" className="text-sm text-gray-600 dark:text-gray-400">
                      Show Cash Rate & Govt Bonds
                    </label>
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="bg-white dark:bg-gray-800 rounded-b-xl">
              <div className="h-80 sm:h-96">
                {isLoadingData ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex flex-col items-center space-y-4">
                      <RefreshCw className="h-8 w-8 animate-spin text-gray-500" />
                      <span className="text-sm text-gray-500">Loading market data...</span>
                    </div>
                  </div>
                ) : (!spotRates || !govBonds) ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-gray-500">
                      <p>No data available</p>
                      <p className="text-sm">Please check your connection and try again</p>
                    </div>
                  </div>
                ) : forwardCurve.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-500">No curve data to display</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={showRBAYieldCurve 
                      ? forwardCurve
                      : forwardCurve.filter(point => point.tenor !== 'Cash')
                    } margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-800" />
                      <XAxis 
                        dataKey="tenor"
                        tick={{ fontSize: 12 }}
                        label={{ value: 'Term to Maturity', position: 'insideBottom', offset: -40 }}
                        className="text-gray-600 dark:text-gray-300"
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        label={{ value: 'Yield (%)', angle: -90, position: 'insideLeft' }}
                        domain={[
                          (dataMin: number) => Math.max(dataMin - 0.5, 0),
                          (dataMax: number) => dataMax + 0.5
                        ]}
                        tickFormatter={(value) => `${value.toFixed(2)}%`}
                        className="text-gray-600 dark:text-gray-300"
                      />
                      <Tooltip 
                        formatter={(value: number) => [`${value.toFixed(3)}%`, 'Yield']}
                        labelFormatter={(tenor) => `${tenor}`}
                        contentStyle={{
                          backgroundColor: isDarkMode ? '#374151' : 'white',
                          border: `1px solid ${isDarkMode ? '#4B5563' : '#e2e8f0'}`,
                          borderRadius: '6px',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          color: isDarkMode ? 'white' : 'black'
                        }}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="rate"
                        stroke={isDarkMode ? '#E5E7EB' : '#374151'} 
                        strokeWidth={2}
                        dot={{ r: 4, fill: isDarkMode ? '#E5E7EB' : '#374151' }}
                        name="RBA Style"
                        activeDot={{ r: 6, fill: isDarkMode ? '#F9FAFB' : '#1F2937' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Interpolated Forward Curve Chart */}
        <div className="mt-8">
          <Card className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm dark:shadow-gray-900/10">
            <CardHeader className="bg-white dark:bg-gray-800 rounded-t-xl">
              <CardTitle className="flex items-center space-x-2 text-base font-semibold text-gray-900 dark:text-white">
                <TrendingUp className="h-5 w-5 text-gray-700 dark:text-gray-300" />
                <span>Monthly Interpolated Forward Curve (0–96 months)</span>
                <div className="flex items-center space-x-2 ml-auto">
                  <Switch
                    id="use-cubic-spline"
                    checked={useForecastMode}
                    onCheckedChange={setUseForecastMode}
                    className="data-[state=checked]:bg-gray-800 dark:data-[state=checked]:bg-gray-600"
                  />
                  <label htmlFor="use-cubic-spline" className="text-sm text-gray-600 dark:text-gray-300">
                    Use Cubic Spline Interpolation (vs Linear)
                  </label>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="bg-white dark:bg-gray-800 rounded-b-xl">
              <div className="h-80 sm:h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={validateAndCleanData(useForecastMode ? forecasted : interpolated)}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                    <XAxis 
                      dataKey="month"
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Months', position: 'insideBottom', offset: -40 }}
                      className="text-gray-600 dark:text-gray-300"
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Rate (%)', angle: -90, position: 'insideLeft' }}
                      domain={[
                        (dataMin: number) => Math.max(dataMin - 0.5, 0),
                        (dataMax: number) => dataMax + 0.5
                      ]}
                      tickFormatter={(value) => `${value.toFixed(2)}%`}
                      className="text-gray-600 dark:text-gray-300"
                    />
                    <Tooltip 
                      formatter={(value: number) => [`${value.toFixed(3)}%`, 'Rate']}
                      labelFormatter={(month) => `Month ${month}`}
                      contentStyle={{
                        backgroundColor: isDarkMode ? '#374151' : 'white',
                        border: `1px solid ${isDarkMode ? '#4B5563' : '#e2e8f0'}`,
                        borderRadius: '6px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        color: isDarkMode ? 'white' : 'black'
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="rate"
                      stroke={isDarkMode ? '#E5E7EB' : '#374151'} 
                      strokeWidth={2}
                      dot={false}
                      name={useForecastMode ? 'Cubic Spline' : 'Linear'}
                      activeDot={{ r: 4, fill: isDarkMode ? '#F9FAFB' : '#1F2937' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Forward Curve Data Points Table */}
        <div className="mt-8">
          <Card className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm dark:shadow-gray-900/10">
            <CardHeader className="bg-white dark:bg-gray-800 rounded-t-xl">
              <CardTitle className="text-base font-semibold text-gray-900 dark:text-white">Forward Curve Data Points</CardTitle>
            </CardHeader>
            <CardContent className="bg-white dark:bg-gray-800 rounded-b-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-sm bg-white dark:bg-gray-800 transition-colors duration-200">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-4 font-medium text-gray-900 dark:text-white">Tenor</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-900 dark:text-white">Months</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-900 dark:text-white">Rate (%)</th>
                      <th className="text-left py-2 px-4 font-medium text-gray-900 dark:text-white">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forwardCurve.map((point, index) => (
                      <tr key={index} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="py-2 px-4 text-gray-900 dark:text-white">{point.tenor}</td>
                        <td className="py-2 px-4 text-gray-900 dark:text-white">{point.months}</td>
                        <td className="py-2 px-4 font-mono text-gray-900 dark:text-white">{point.rate.toFixed(4)}</td>
                        <td className="py-2 px-4">
                          <Badge variant="outline" className="text-xs bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-600">
                            {point.type}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default AUDForwardCurveTool;
