import { useState, useEffect, useCallback, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts'
import { Download, Calculator, TrendingUp, RefreshCw, Wifi, WifiOff, AlertCircle, CheckCircle, Copy, Eye, EyeOff } from 'lucide-react'
import Papa from 'papaparse'

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import { ThemeToggle } from '@/components/theme-toggle'
import { HelpDialog } from '@/components/HelpDialog'

interface SpotRates {
  cash: number
  oneMonth: number
  threeMonth: number
  sixMonth: number
}

interface BondYields {
  bond2Y: number
  bond3Y: number
  bond5Y: number
  bond10Y: number
}

interface FetchResults {
  bbsw: SpotRates | null
  bonds: BondYields | null
  errors: string[]
  lastUpdate: string
}

interface CurvePoint {
  tenor: string
  months: number
  rate: number
  type: string
}

class AUDDataFetcher {
  corsProxy = 'https://corsproxy.io/?'
  f1Url = this.corsProxy + 'https://www.rba.gov.au/statistics/tables/csv/f1.1-data.csv'
  f2Url = this.corsProxy + 'https://www.rba.gov.au/statistics/tables/csv/f2-data.csv'

  async fetchCSV(url: string): Promise<any[]> {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`)
    const text = await response.text()
    return new Promise((resolve, reject) => {
      Papa.parse(text, {
        header: false,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data),
        error: (err: any) => reject(err)
      })
    })
  }

  async fetchBBSWRates(): Promise<SpotRates> {
    const data = await this.fetchCSV(this.f1Url)
    let lastRow: string[] | undefined
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i].map((cell: string) => (cell || '').trim())
      if (
        row[0] &&
        row[1] && row[7] && row[8] && row[9] &&
        !isNaN(Number(row[1])) &&
        !isNaN(Number(row[7])) &&
        !isNaN(Number(row[8])) &&
        !isNaN(Number(row[9]))
      ) {
        lastRow = row
        break
      }
    }
    if (!lastRow) throw new Error('No valid BBSW data found in F1 CSV')
    return {
      cash: Number(lastRow[1]),
      oneMonth: Number(lastRow[7]),
      threeMonth: Number(lastRow[8]),
      sixMonth: Number(lastRow[9])
    }
  }

  async fetchRBABondYields(): Promise<BondYields> {
    const data = await this.fetchCSV(this.f2Url)
    let lastRow: string[] | undefined
    for (let i = data.length - 1; i >= 0; i--) {
      const row = data[i]
      if (row[1] && row[2] && row[3] && row[4] && !isNaN(parseFloat(row[1]))) {
        lastRow = row
        break
      }
    }
    if (!lastRow) throw new Error('No valid bond yield data found in F2 CSV')
    return {
      bond2Y: parseFloat(lastRow[1]),
      bond3Y: parseFloat(lastRow[2]),
      bond5Y: parseFloat(lastRow[3]),
      bond10Y: parseFloat(lastRow[4])
    }
  }

  async fetchAllData(): Promise<FetchResults> {
    const results: FetchResults = {
      bbsw: null,
      bonds: null,
      errors: [],
      lastUpdate: new Date().toISOString()
    }
    try {
      results.bbsw = await this.fetchBBSWRates()
    } catch (error: any) {
      results.errors.push('Failed to fetch BBSW: ' + error.message)
    }
    try {
      results.bonds = await this.fetchRBABondYields()
    } catch (error: any) {
      results.errors.push('Failed to fetch Bonds: ' + error.message)
    }
    return results
  }
}

function interpolateMonthlyRates(tenors: { months: number; rate: number }[], totalMonths = 96) {
  const result: { month: number; rate: number }[] = []

  for (let m = 1; m <= totalMonths; m++) {
    const lower = [...tenors].reverse().find(t => t.months <= m)
    const upper = tenors.find(t => t.months >= m)

    if (lower && upper && lower.months !== upper.months) {
      const interpolated = lower.rate + ((upper.rate - lower.rate) / (upper.months - lower.months)) * (m - lower.months)
      result.push({ month: m, rate: interpolated })
    } else if (lower) {
      result.push({ month: m, rate: lower.rate })
    }
  }

  return result
}

function cubicSplineInterpolate(points: { months: number; rate: number }[], totalMonths = 96) {
  if (points.length < 2) return []
  const sorted = [...points].sort((a, b) => a.months - b.months)
  const n = sorted.length
  const xs = sorted.map(p => p.months)
  const ys = sorted.map(p => p.rate)

  const h = Array(n - 1).fill(0).map((_, i) => xs[i + 1] - xs[i])
  const alpha = Array(n - 1).fill(0)
  for (let i = 1; i < n - 1; i++) {
    alpha[i] = (3 / h[i]) * (ys[i + 1] - ys[i]) - (3 / h[i - 1]) * (ys[i] - ys[i - 1])
  }

  const l = Array(n).fill(1)
  const mu = Array(n).fill(0)
  const z = Array(n).fill(0)
  for (let i = 1; i < n - 1; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1]
    mu[i] = h[i] / l[i]
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i]
  }

  const c = Array(n).fill(0)
  const b = Array(n - 1).fill(0)
  const d = Array(n - 1).fill(0)
  for (let j = n - 2; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1]
    b[j] = (ys[j + 1] - ys[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3
    d[j] = (c[j + 1] - c[j]) / (3 * h[j])
  }

  const result: { month: number; rate: number }[] = []
  for (let m = 1; m <= totalMonths; m++) {
    let i = 0
    while (i < n - 2 && m > xs[i + 1]) i++
    const dx = m - xs[i]
    const rate = ys[i] + b[i] * dx + c[i] * dx * dx + d[i] * dx * dx * dx
    result.push({ month: m, rate })
  }
  return result
}

const AUDForwardCurveTool = () => {
  const [spotRates, setSpotRates] = useState<SpotRates | null>(null)
  const [govBonds, setGovBonds] = useState<BondYields | null>(null)
  const [forwardCurve, setForwardCurve] = useState<CurvePoint[]>([])
  const [useForecastMode, setUseForecastMode] = useState(true)
  const [oisSpread, setOISSpread] = useState(30)
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [lastDataUpdate, setLastDataUpdate] = useState(new Date().toISOString())
  const [dataFetchErrors, setDataFetchErrors] = useState<string[]>([])
  const [isConnected, setIsConnected] = useState(true)
  const [dataSource, setDataSource] = useState('Loading...')
  const [showRBAYieldCurve, setShowRBAYieldCurve] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval, setRefreshInterval] = useState(300) // 5 minutes
  const [lastSuccessfulFetch, setLastSuccessfulFetch] = useState<Date | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)

  const dataFetcher = new AUDDataFetcher()

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + R: Refresh data
      if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault()
        if (!isLoadingData) {
          fetchMarketData()
        }
      }
      // Ctrl/Cmd + D: Download CSV
      if ((event.ctrlKey || event.metaKey) && event.key === 'd') {
        event.preventDefault()
        if (forwardCurve.length > 0) {
          downloadCSV()
        }
      }
      // Ctrl/Cmd + E: Toggle advanced options
      if ((event.ctrlKey || event.metaKey) && event.key === 'e') {
        event.preventDefault()
        setShowAdvancedOptions(!showAdvancedOptions)
      }
      // T: Toggle dark mode
      if (event.key === 't' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const activeElement = document.activeElement
        if (!activeElement || activeElement.tagName !== 'INPUT') {
          event.preventDefault()
          // This would need theme toggle function from context
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isLoadingData, forwardCurve.length, showAdvancedOptions])

  const fetchMarketData = useCallback(async () => {
    setIsLoadingData(true)
    setDataFetchErrors([])
    setLoadingProgress(0)
    
    try {
      // Simulate progress updates for better UX
      setLoadingProgress(20)
      setDataSource('Fetching BBSW rates...')
      
      const results = await dataFetcher.fetchAllData()
      setLoadingProgress(60)
      
      if (results.bbsw) {
        setSpotRates(results.bbsw)
        setLoadingProgress(80)
      }
      if (results.bonds) {
        setGovBonds(results.bonds)
        setLoadingProgress(90)
      }
      
      if (results.bbsw && results.bonds) {
        setDataSource('RBA F1 & F2 CSV')
      } else if (results.bbsw) {
        setDataSource('RBA F1 CSV')
      } else if (results.bonds) {
        setDataSource('RBA F2 CSV')
      }
      
      setLastDataUpdate(results.lastUpdate)
      setDataFetchErrors(results.errors)
      setIsConnected(results.errors.length === 0)
      
      if (results.errors.length === 0) {
        setLastSuccessfulFetch(new Date())
      }
      
      setLoadingProgress(100)
    } catch (error: any) {
      setDataFetchErrors([`Failed to fetch data: ${error.message}`])
      setIsConnected(false)
      setDataSource('Error - Network Issue')
      setLoadingProgress(0)
    } finally {
      setTimeout(() => {
        setIsLoadingData(false)
        setLoadingProgress(0)
      }, 500)
    }
  }, [])

  const getAdjustedBBSW = (rate: number | undefined) => {
    if (typeof rate !== 'number' || isNaN(rate)) return ''
    return (rate - (oisSpread / 100)).toFixed(4)
  }

  const calculateRBAYieldCurve = useCallback(() => {
    if (!spotRates || !govBonds) {
      setForwardCurve([])
      return
    }
    const curve: CurvePoint[] = []
    curve.push({ tenor: 'Cash', months: 0, rate: Number(spotRates.cash), type: 'Cash Rate' })
    curve.push({ tenor: '1M', months: 1, rate: Number(spotRates.oneMonth) - (oisSpread / 100), type: 'BBSW (adj)' })
    curve.push({ tenor: '3M', months: 3, rate: Number(spotRates.threeMonth) - (oisSpread / 100), type: 'BBSW (adj)' })
    curve.push({ tenor: '6M', months: 6, rate: Number(spotRates.sixMonth) - (oisSpread / 100), type: 'BBSW (adj)' })
    curve.push({ tenor: '2Y', months: 24, rate: Number(govBonds.bond2Y), type: 'Govt Bond' })
    curve.push({ tenor: '3Y', months: 36, rate: Number(govBonds.bond3Y), type: 'Govt Bond' })
    curve.push({ tenor: '5Y', months: 60, rate: Number(govBonds.bond5Y), type: 'Govt Bond' })
    curve.push({ tenor: '10Y', months: 120, rate: Number(govBonds.bond10Y), type: 'Govt Bond' })
    setForwardCurve(curve)
  }, [spotRates, govBonds, oisSpread])

  const calculateForwardCurve = useCallback(() => {
    if (!spotRates || !govBonds) {
      setForwardCurve([])
      return
    }
    const curve: CurvePoint[] = []
    curve.push({ tenor: '1M', months: 1, rate: Number(spotRates.oneMonth) - (oisSpread / 100), type: 'Spot (adj)' })
    curve.push({ tenor: '3M', months: 3, rate: Number(spotRates.threeMonth) - (oisSpread / 100), type: 'Spot (adj)' })
    curve.push({ tenor: '6M', months: 6, rate: Number(spotRates.sixMonth) - (oisSpread / 100), type: 'Spot (adj)' })
    curve.push({ tenor: '2Y', months: 24, rate: Number(govBonds.bond2Y), type: 'Govt Bond' })
    curve.push({ tenor: '3Y', months: 36, rate: Number(govBonds.bond3Y), type: 'Govt Bond' })
    curve.push({ tenor: '5Y', months: 60, rate: Number(govBonds.bond5Y), type: 'Govt Bond' })
    curve.push({ tenor: '10Y', months: 120, rate: Number(govBonds.bond10Y), type: 'Govt Bond' })
    setForwardCurve(curve)
  }, [spotRates, govBonds, oisSpread])

  useEffect(() => {
    if (showRBAYieldCurve) {
      calculateRBAYieldCurve()
    } else {
      calculateForwardCurve()
    }
  }, [])

  useEffect(() => {
    fetchMarketData()
  }, [fetchMarketData])

  useEffect(() => {
    if (showRBAYieldCurve) {
      calculateRBAYieldCurve()
    } else {
      calculateForwardCurve()
    }
  }, [showRBAYieldCurve, calculateRBAYieldCurve, calculateForwardCurve])

  const forecasted = cubicSplineInterpolate(forwardCurve, 96)
  const interpolated = interpolateMonthlyRates(forwardCurve, 96)

  // Auto-refresh functionality
  useEffect(() => {
    if (!autoRefresh || refreshInterval <= 0) return
    
    const interval = setInterval(() => {
      fetchMarketData()
    }, refreshInterval * 1000)
    
    return () => clearInterval(interval)
  }, [autoRefresh, refreshInterval, fetchMarketData])

  // Enhanced CSV download with progress feedback
  const downloadCSV = () => {
    const headers1 = ['Tenor', 'Months', 'Rate (%)', 'Source']
    const csvContent1 = [
      headers1.join(','),
      ...forwardCurve.map(point => 
        `${point.tenor},${point.months},${point.rate.toFixed(4)},${point.type}`
      )
    ].join('\n')

    const headers2 = ['Month', 'Linear Interpolation (%)', 'Cubic Spline Interpolation (%)']
    const maxMonths = Math.max(interpolated.length, forecasted.length)
    const csvContent2 = [
      headers2.join(','),
      ...Array.from({ length: maxMonths }, (_, i) => {
        const month = i + 1
        const linear = interpolated[i]?.rate
        const spline = forecasted[i]?.rate
        return `${month},${typeof linear === 'number' ? linear.toFixed(4) : ''},${typeof spline === 'number' ? spline.toFixed(4) : ''}`
      })
    ].join('\n')

    const fullCSV =
      'Forward Curve Data Points\n' +
      csvContent1 +
      '\n\n' +
      'Monthly Interpolated Forward Curve (Linear vs Cubic Spline)\n' +
      csvContent2

    const blob = new Blob([fullCSV], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `AUD_Forward_Curve_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    
    // Show success feedback
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
    
    // Cleanup
    window.URL.revokeObjectURL(url)
  }

  const validateAndCleanData = (data: { month: number; rate: number }[]) => {
    return data.filter(point => 
      point && 
      typeof point.rate === 'number' && 
      !isNaN(point.rate) && 
      isFinite(point.rate) &&
      point.rate >= 0 &&
      point.rate <= 30
    )
  }

  // Copy data to clipboard
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    } catch (err) {
      console.error('Failed to copy: ', err)
    }
  }

  // Memoized chart data for performance
  const chartData = useMemo(() => {
    return showRBAYieldCurve 
      ? forwardCurve
      : forwardCurve.filter(point => point.tenor !== 'Cash')
  }, [forwardCurve, showRBAYieldCurve])

  const interpolatedChartData = useMemo(() => {
    return validateAndCleanData(useForecastMode ? forecasted : interpolated)
  }, [useForecastMode, forecasted, interpolated])

  // Data quality indicator
  const dataQuality = useMemo(() => {
    if (!spotRates || !govBonds) return 'No Data'
    if (dataFetchErrors.length > 0) return 'Partial'
    if (lastSuccessfulFetch && (Date.now() - lastSuccessfulFetch.getTime()) > 24 * 60 * 60 * 1000) return 'Stale'
    return 'Good'
  }, [spotRates, govBonds, dataFetchErrors, lastSuccessfulFetch])

  const getDataQualityColor = (quality: string) => {
    switch (quality) {
      case 'Good': return 'text-green-600 dark:text-green-400'
      case 'Partial': return 'text-yellow-600 dark:text-yellow-400'
      case 'Stale': return 'text-orange-600 dark:text-orange-400'
      default: return 'text-red-600 dark:text-red-400'
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Miras Design System styling */}
      <header className="border-b bg-card shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-6 space-y-4 sm:space-y-0">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">
                AUD Forward Rate Curve Construction Tool
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground mt-1">
                Build forward-looking AUD base rate curves using dynamic market data
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                {isConnected ? (
                  <div className="flex items-center gap-2">
                    <Wifi className="h-4 w-4 text-green-600" />
                    <Badge variant="outline" className={getDataQualityColor(dataQuality)}>
                      {dataQuality}
                    </Badge>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <WifiOff className="h-4 w-4 text-destructive" />
                    <Badge variant="destructive">Offline</Badge>
                  </div>
                )}
                <span className="text-muted-foreground">
                  {dataSource}
                </span>
              </div>
              <div className="text-xs sm:text-sm text-muted-foreground">
                Last Updated: {new Date(lastDataUpdate).toLocaleTimeString()}
                {lastSuccessfulFetch && (
                  <div className="text-xs opacity-75">
                    Last Success: {lastSuccessfulFetch.toLocaleTimeString()}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <HelpDialog />
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Controls Row */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Calculator className="h-5 w-5" />
                <span>Curve Construction Controls</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <Label className="text-sm font-medium">Data Source</Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={fetchMarketData}
                          disabled={isLoadingData}
                          size="sm"
                          className="w-full"
                          aria-label="Refresh market data from RBA"
                        >
                          {isLoadingData ? (
                            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          {isLoadingData ? 'Loading...' : 'Refresh RBA Data'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Fetch latest data from RBA F1 (BBSW) and F2 (Government Bonds) CSV files</p>
                        <p className="text-xs opacity-75 mt-1">Keyboard shortcut: Ctrl+R</p>
                      </TooltipContent>
                    </Tooltip>
                    {isLoadingData && loadingProgress > 0 && (
                      <div className="space-y-1">
                        <Progress value={loadingProgress} className="w-full" />
                        <p className="text-xs text-muted-foreground">{loadingProgress.toFixed(0)}% complete</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="ois-spread" className="text-sm font-medium mb-2 block">
                      BBSW-OIS Spread (bp)
                    </Label>
                    <Input
                      id="ois-spread"
                      type="number"
                      value={oisSpread}
                      onChange={(e) => setOISSpread(Number(e.target.value))}
                      step="1"
                      min="0"
                      max="100"
                      className="transition-colors"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Typical range: 10-50bp
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium mb-2 block">
                      Auto Refresh
                    </Label>
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="auto-refresh"
                        checked={autoRefresh}
                        onCheckedChange={setAutoRefresh}
                      />
                      <Label htmlFor="auto-refresh" className="text-sm">
                        Every {refreshInterval}s
                      </Label>
                    </div>
                    {autoRefresh && (
                      <Input
                        type="number"
                        value={refreshInterval}
                        onChange={(e) => setRefreshInterval(Number(e.target.value))}
                        min="60"
                        max="3600"
                        step="60"
                        className="mt-2"
                        placeholder="Seconds"
                      />
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex flex-col gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={downloadCSV}
                          variant="outline"
                          className="w-full"
                          disabled={forwardCurve.length === 0}
                          aria-label="Download curve data as CSV file"
                        >
                          {copySuccess ? (
                            <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                          ) : (
                            <Download className="h-4 w-4 mr-2" />
                          )}
                          {copySuccess ? 'Downloaded!' : 'Download CSV'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Download forward curve data and interpolations as CSV</p>
                        <p className="text-xs opacity-75 mt-1">Keyboard shortcut: Ctrl+D</p>
                      </TooltipContent>
                    </Tooltip>
                    <Button
                      onClick={() => copyToClipboard(JSON.stringify(forwardCurve, null, 2))}
                      variant="ghost"
                      size="sm"
                      className="w-full"
                      disabled={forwardCurve.length === 0}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Data
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          aria-label="Toggle advanced options visibility"
                        >
                          {showAdvancedOptions ? (
                            <EyeOff className="h-4 w-4 mr-2" />
                          ) : (
                            <Eye className="h-4 w-4 mr-2" />
                          )}
                          {showAdvancedOptions ? 'Hide' : 'Show'} Advanced
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Toggle advanced curve construction options</p>
                        <p className="text-xs opacity-75 mt-1">Keyboard shortcut: Ctrl+E</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {dataFetchErrors.length > 0 && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="space-y-1">
                          {dataFetchErrors.map((error, i) => (
                            <p key={i} className="text-sm">{error}</p>
                          ))}
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                  {dataQuality === 'Stale' && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Data is more than 24 hours old. Consider refreshing.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts and Tables Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Current Spot Rates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Current Spot Rates (BBSW)</span>
                <Badge variant="outline">
                  {spotRates?.cash ? `${spotRates.cash.toFixed(2)}%` : 'Loading...'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="cash-rate">Cash Rate</Label>
                    <Input
                      id="cash-rate"
                      type="number"
                      value={spotRates?.cash || ''}
                      onChange={(e) => setSpotRates(prev => ({
                        cash: Number(e.target.value),
                        oneMonth: prev?.oneMonth || 0,
                        threeMonth: prev?.threeMonth || 0,
                        sixMonth: prev?.sixMonth || 0
                      }))}
                      step="0.01"
                    />
                  </div>
                  <div>
                    <Label htmlFor="1m-bbsw">1M BBSW</Label>
                    <Input
                      id="1m-bbsw"
                      type="number"
                      value={spotRates?.oneMonth || ''}
                      onChange={(e) => setSpotRates(prev => ({
                        cash: prev?.cash || 0,
                        oneMonth: Number(e.target.value),
                        threeMonth: prev?.threeMonth || 0,
                        sixMonth: prev?.sixMonth || 0
                      }))}
                      step="0.01"
                    />
                  </div>
                  <div>
                    <Label htmlFor="3m-bbsw">3M BBSW</Label>
                    <Input
                      id="3m-bbsw"
                      type="number"
                      value={spotRates?.threeMonth || ''}
                      onChange={(e) => setSpotRates(prev => ({
                        cash: prev?.cash || 0,
                        oneMonth: prev?.oneMonth || 0,
                        threeMonth: Number(e.target.value),
                        sixMonth: prev?.sixMonth || 0
                      }))}
                      step="0.01"
                    />
                  </div>
                  <div>
                    <Label htmlFor="6m-bbsw">6M BBSW</Label>
                    <Input
                      id="6m-bbsw"
                      type="number"
                      value={spotRates?.sixMonth || ''}
                      onChange={(e) => setSpotRates(prev => ({
                        cash: prev?.cash || 0,
                        oneMonth: prev?.oneMonth || 0,
                        threeMonth: prev?.threeMonth || 0,
                        sixMonth: Number(e.target.value)
                      }))}
                      step="0.01"
                    />
                  </div>
                </div>
                <Separator />
                <div className="space-y-2">
                  <h4 className="font-medium">Adjusted Rates (BBSW - OIS Spread)</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">1M BBSW (Adj):</span>
                      <span className="font-mono">{getAdjustedBBSW(spotRates?.oneMonth)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">3M BBSW (Adj):</span>
                      <span className="font-mono">{getAdjustedBBSW(spotRates?.threeMonth)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">6M BBSW (Adj):</span>
                      <span className="font-mono">{getAdjustedBBSW(spotRates?.sixMonth)}%</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Government Bond Rates */}
          <Card>
            <CardHeader>
              <CardTitle>Government Bond Rates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="2y-bond">2Y Govt Bond</Label>
                  <Input
                    id="2y-bond"
                    type="number"
                    value={govBonds?.bond2Y || ''}
                    onChange={(e) => setGovBonds(prev => ({
                      bond2Y: Number(e.target.value),
                      bond3Y: prev?.bond3Y || 0,
                      bond5Y: prev?.bond5Y || 0,
                      bond10Y: prev?.bond10Y || 0
                    }))}
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="3y-bond">3Y Govt Bond</Label>
                  <Input
                    id="3y-bond"
                    type="number"
                    value={govBonds?.bond3Y || ''}
                    onChange={(e) => setGovBonds(prev => ({
                      bond2Y: prev?.bond2Y || 0,
                      bond3Y: Number(e.target.value),
                      bond5Y: prev?.bond5Y || 0,
                      bond10Y: prev?.bond10Y || 0
                    }))}
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="5y-bond">5Y Govt Bond</Label>
                  <Input
                    id="5y-bond"
                    type="number"
                    value={govBonds?.bond5Y || ''}
                    onChange={(e) => setGovBonds(prev => ({
                      bond2Y: prev?.bond2Y || 0,
                      bond3Y: prev?.bond3Y || 0,
                      bond5Y: Number(e.target.value),
                      bond10Y: prev?.bond10Y || 0
                    }))}
                    step="0.01"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="10y-bond">10Y Govt Bond</Label>
                  <Input
                    id="10y-bond"
                    type="number"
                    value={govBonds?.bond10Y || ''}
                    onChange={(e) => setGovBonds(prev => ({
                      bond2Y: prev?.bond2Y || 0,
                      bond3Y: prev?.bond3Y || 0,
                      bond5Y: prev?.bond5Y || 0,
                      bond10Y: Number(e.target.value)
                    }))}
                    step="0.01"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RBA Government Bond Yield Curve Chart */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0">
                <div className="flex items-center space-x-2">
                  <TrendingUp className="h-5 w-5" />
                  <span>RBA Government Bond Yield Curve</span>
                </div>
                <div className="flex items-center space-x-2 w-full sm:ml-auto">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="show-rba-curve"
                      checked={showRBAYieldCurve}
                      onCheckedChange={setShowRBAYieldCurve}
                    />
                    <Label htmlFor="show-rba-curve" className="text-sm text-muted-foreground">
                      Show Cash Rate & Govt Bonds
                    </Label>
                  </div>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 sm:h-80 lg:h-96">
                {isLoadingData ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="flex flex-col items-center space-y-4">
                      <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Loading market data...</span>
                    </div>
                  </div>
                ) : (!spotRates || !govBonds) ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="space-y-3">
                      <Skeleton className="h-4 w-32 mx-auto" />
                      <Skeleton className="h-3 w-48 mx-auto" />
                    </div>
                  </div>
                ) : forwardCurve.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-muted-foreground">No curve data to display</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis 
                        dataKey="tenor"
                        tick={{ fontSize: 12 }}
                        label={{ value: 'Term to Maturity', position: 'insideBottom', offset: -40 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        label={{ value: 'Yield (%)', angle: -90, position: 'insideLeft' }}
                        domain={[
                          (dataMin: number) => Math.max(dataMin - 0.5, 0),
                          (dataMax: number) => dataMax + 0.5
                        ]}
                        tickFormatter={(value) => `${value.toFixed(2)}%`}
                        className="text-muted-foreground"
                      />
                      <RechartsTooltip 
                        formatter={(value: number) => [`${value.toFixed(3)}%`, 'Yield']}
                        labelFormatter={(tenor: string) => `${tenor}`}
                        contentStyle={{
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                          color: 'hsl(var(--popover-foreground))'
                        }}
                      />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="rate"
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={{ r: 4, fill: "hsl(var(--primary))" }}
                        name="RBA Style"
                        activeDot={{ r: 6, fill: "hsl(var(--primary))" }}
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
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <TrendingUp className="h-5 w-5" />
                <span>Monthly Interpolated Forward Curve (0–96 months)</span>
                <div className="flex items-center space-x-2 ml-auto">
                  <Switch
                    id="use-cubic-spline"
                    checked={useForecastMode}
                    onCheckedChange={setUseForecastMode}
                  />
                  <Label htmlFor="use-cubic-spline" className="text-sm text-muted-foreground">
                    Use Cubic Spline Interpolation (vs Linear)
                  </Label>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 sm:h-80 lg:h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={interpolatedChartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="month"
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Months', position: 'insideBottom', offset: -40 }}
                      className="text-muted-foreground"
                    />
                    <YAxis 
                      tick={{ fontSize: 12 }}
                      label={{ value: 'Rate (%)', angle: -90, position: 'insideLeft' }}
                      domain={[
                        (dataMin: number) => Math.max(dataMin - 0.5, 0),
                        (dataMax: number) => dataMax + 0.5
                      ]}
                      tickFormatter={(value) => `${value.toFixed(2)}%`}
                      className="text-muted-foreground"
                    />
                    <RechartsTooltip 
                      formatter={(value: number) => [`${value.toFixed(3)}%`, 'Rate']}
                      labelFormatter={(month: number) => `Month ${month}`}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        color: 'hsl(var(--popover-foreground))'
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="rate"
                      stroke="hsl(var(--primary))" 
                      strokeWidth={2}
                      dot={false}
                      name={useForecastMode ? 'Cubic Spline' : 'Linear'}
                      activeDot={{ r: 4, fill: "hsl(var(--primary))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Forward Curve Data Points Table */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle>Forward Curve Data Points</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tenor</TableHead>
                      <TableHead>Months</TableHead>
                      <TableHead>Rate (%)</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forwardCurve.map((point, index) => (
                      <TableRow key={index}>
                        <TableCell>{point.tenor}</TableCell>
                        <TableCell>{point.months}</TableCell>
                        <TableCell className="font-mono">{point.rate.toFixed(4)}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {point.type}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default AUDForwardCurveTool