import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Input } from '../../ui/input';
import { Badge } from '../../ui/badge';
import { Separator } from '../../ui/separator';
import { SpotRates, BondYields } from '../utils/dataFetcher';

interface DataInputsProps {
  spotRates: SpotRates | null;
  setSpotRates: React.Dispatch<React.SetStateAction<SpotRates | null>>;
  govBonds: BondYields | null;
  setGovBonds: React.Dispatch<React.SetStateAction<BondYields | null>>;
  getAdjustedBBSW: (rate: number | undefined) => string;
}

export function DataInputs({
  spotRates,
  setSpotRates,
  govBonds,
  setGovBonds,
  getAdjustedBBSW
}: DataInputsProps) {
  return (
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
                  <span className="text-gray-900 dark:text-white">{getAdjustedBBSW(spotRates?.oneMonth)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300">3M BBSW (Adj):</span>
                  <span className="text-gray-900 dark:text-white">{getAdjustedBBSW(spotRates?.threeMonth)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-700 dark:text-gray-300">6M BBSW (Adj):</span>
                  <span className="text-gray-900 dark:text-white">{getAdjustedBBSW(spotRates?.sixMonth)}%</span>
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
  );
}