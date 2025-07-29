import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Switch } from '../../ui/switch';
import { validateAndCleanData } from '../utils/calculations';

interface ForwardCurveChartProps {
  forecasted: { month: number; rate: number }[];
  interpolated: { month: number; rate: number }[];
  useForecastMode: boolean;
  setUseForecastMode: (value: boolean) => void;
  isDarkMode: boolean;
}

export function ForwardCurveChart({
  forecasted,
  interpolated,
  useForecastMode,
  setUseForecastMode,
  isDarkMode
}: ForwardCurveChartProps) {
  return (
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
  );
}