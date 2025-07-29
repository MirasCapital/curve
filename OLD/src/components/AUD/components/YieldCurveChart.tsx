import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { RefreshCw, TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Switch } from '../../ui/switch';
import { CurvePoint } from '../utils/calculations';

interface YieldCurveChartProps {
  forwardCurve: CurvePoint[];
  showRBAYieldCurve: boolean;
  setShowRBAYieldCurve: (value: boolean) => void;
  isLoadingData: boolean;
  isDarkMode: boolean;
  spotRates: any;
  govBonds: any;
}

export function YieldCurveChart({
  forwardCurve,
  showRBAYieldCurve,
  setShowRBAYieldCurve,
  isLoadingData,
  isDarkMode,
  spotRates,
  govBonds
}: YieldCurveChartProps) {
  return (
    <div className="mt-8">
      <Card className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm dark:shadow-gray-900/10">
        <CardHeader className="bg-white dark:bg-gray-800 rounded-t-xl">
          <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center space-y-2 sm:space-y-0 text-base font-semibold text-gray-900 dark:text-white">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-gray-700 dark:text-gray-300" />
              <span>RBA Government Bond Yield Curve</span>
            </div>
            <div className="flex items-center space-x-2 w-full sm:ml-auto">
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
  );
}