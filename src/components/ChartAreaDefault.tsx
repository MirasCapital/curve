"use client";

import { TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip } from "recharts";
import React from "react";

// If you have shadcn/ui installed, import these:
// import {
//   Card,
//   CardContent,
//   CardDescription,
//   CardFooter,
//   CardHeader,
//   CardTitle,
// } from "@/components/ui/card";
// import {
//   ChartConfig,
//   ChartContainer,
//   ChartTooltip,
//   ChartTooltipContent,
// } from "@/components/ui/chart";

// For now, use fallback Card if shadcn/ui is not installed
const Card = ({ children }) => <div className="card bg-white border rounded-xl shadow-sm p-6 mb-6">{children}</div>;
const CardHeader = ({ children }) => <div className="mb-4">{children}</div>;
const CardTitle = ({ children }) => <h2 className="text-xl font-semibold mb-1">{children}</h2>;
const CardDescription = ({ children }) => <p className="text-gray-500 text-sm mb-2">{children}</p>;
const CardContent = ({ children }) => <div>{children}</div>;
const CardFooter = ({ children }) => <div className="mt-4">{children}</div>;

export const description = "A simple area chart";

// Accepts data as a prop
export function ChartAreaDefault({ data, xKey = "month", yKey = "rate", title = "Area Chart", description = "Showing forward curve" }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <AreaChart
          width={600}
          height={300}
          data={data}
          margin={{ left: 12, right: 12 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey={xKey}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickFormatter={v => typeof v === 'number' ? String(v) : String(v).slice(0, 6)}
          />
          <YAxis
            tickFormatter={v => `${v.toFixed(2)}%`}
            domain={["dataMin - 0.1", "dataMax + 0.1"]}
          />
          <Tooltip formatter={(v) => (typeof v === 'number' ? `${v.toFixed(4)}%` : v)} />
          <Area
            dataKey={yKey}
            type="natural"
            fill="#2563eb"
            fillOpacity={0.4}
            stroke="#2563eb"
          />
        </AreaChart>
      </CardContent>
      <CardFooter>
        <div className="flex w-full items-start gap-2 text-sm">
          <div className="grid gap-2">
            <div className="flex items-center gap-2 leading-none font-medium">
              Trending up by 5.2% this month <TrendingUp className="h-4 w-4" />
            </div>
            <div className="text-muted-foreground flex items-center gap-2 leading-none">
              Forward Curve Data
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
