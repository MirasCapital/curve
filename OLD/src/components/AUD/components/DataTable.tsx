import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { CurvePoint } from '../utils/calculations';

interface DataTableProps {
  forwardCurve: CurvePoint[];
}

export function DataTable({ forwardCurve }: DataTableProps) {
  return (
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
                    <td className="py-2 px-4 text-gray-900 dark:text-white">{point.rate.toFixed(4)}</td>
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
  );
}