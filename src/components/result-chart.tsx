"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSpec } from "@/lib/chart";
import { formatCell } from "@/lib/format";
import type { QueryResult } from "@/lib/sql/execute";

const SERIES_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

export function ResultChart({
  result,
  chart,
}: {
  result: QueryResult;
  chart: ChartSpec;
}) {
  const xColumn = result.columns[chart.x];
  // Recharts wants objects; keys are positional because column names can repeat.
  const data = result.rows.map((row) => {
    const point: Record<string, string | number | null> = {
      x: formatCell(row[chart.x], xColumn.kind),
    };
    for (const index of chart.y) {
      const value = row[index];
      point[`y${index}`] = typeof value === "number" ? value : null;
    }
    return point;
  });

  const axisProps = {
    stroke: "var(--muted)",
    fontSize: 12,
    tickLine: false,
  };
  const series = chart.y.map((index, position) => ({
    key: `y${index}`,
    name: result.columns[index].name,
    color: SERIES_COLORS[position % SERIES_COLORS.length],
  }));
  const tooltip = (
    <Tooltip
      cursor={{ fill: "var(--line)", stroke: "var(--line)" }}
      contentStyle={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 8,
        fontSize: 13,
      }}
      formatter={(value) =>
        typeof value === "number" ? formatCell(value, "number") : String(value)
      }
    />
  );

  return (
    <figure
      className="h-72 w-full"
      aria-label={`${chart.type} chart of ${series.map((s) => s.name).join(", ")} by ${xColumn.name}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        {chart.type === "line" ? (
          <LineChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="x" {...axisProps} minTickGap={24} />
            <YAxis
              {...axisProps}
              width={64}
              tickFormatter={(v: number) => formatCell(v, "number")}
            />
            {tooltip}
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        ) : (
          <BarChart
            data={data}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="x" {...axisProps} interval="preserveStartEnd" />
            <YAxis
              {...axisProps}
              width={64}
              tickFormatter={(v: number) => formatCell(v, "number")}
            />
            {tooltip}
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.name}
                fill={s.color}
                radius={[3, 3, 0, 0]}
              />
            ))}
          </BarChart>
        )}
      </ResponsiveContainer>
    </figure>
  );
}
