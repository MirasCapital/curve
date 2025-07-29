import React from 'react';
import { RefreshCw, Download, Calculator } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';

interface ControlsProps {
  oisSpread: number;
  setOISSpread: (value: number) => void;
  fetchMarketData: () => void;
  isLoadingData: boolean;
  downloadCSV: () => void;
  dataFetchErrors: string[];
}

export function Controls({
  oisSpread,
  setOISSpread,
  fetchMarketData,
  isLoadingData,
  downloadCSV,
  dataFetchErrors
}: ControlsProps) {
  return (
    <div className="mb-8">
      <Card className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 rounded-xl shadow-sm dark:shadow-gray-900/10">
        <CardHeader className="bg-white dark:bg-gray-800 rounded-t-xl">
          <CardTitle className="flex items-center space-x-2 text-lg font-semibold text-gray-900 dark:text-white">
            <Calculator className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            <span>Curve Construction Controls</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="bg-white dark:bg-gray-800 rounded-b-xl">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                <label className="text-sm font-medium text-gray-900 dark:text-white">Data Source</label>
                <Button
                  onClick={fetchMarketData}
                  disabled={isLoadingData}
                  size="sm"
                  className="w-full sm:w-auto bg-black hover:bg-gray-800 text-white font-medium rounded-md px-3 py-1.5 shadow-sm focus:ring-2 focus:ring-gray-500 dark:bg-gray-800 dark:hover:bg-gray-700 transition-colors duration-200"
                >
                  {isLoadingData ? (
                    <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  <span className="text-white">{isLoadingData ? 'Loading...' : 'Refresh RBA Data'}</span>
                </Button>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-900">
                  BBSW-OIS Spread (bp)
                </label>
                <Input
                  type="number"
                  value={oisSpread}
                  onChange={(e) => setOISSpread(Number(e.target.value))}
                  className="h-9 w-full rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-500 dark:focus:ring-gray-400 transition-colors duration-200"
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
  );
}