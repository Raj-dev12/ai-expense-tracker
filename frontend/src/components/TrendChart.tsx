import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "../api";
import { formatDayMonth, formatMoney, formatMoneyShort } from "../format";
import { CARD } from "./Panel";

type Point = TrendPoint & { total: number };

function ChartTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
  currency: string;
}) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;

  return (
    <div className="rounded-lg bg-white px-3 py-2 text-sm shadow-lg ring-1 ring-slate-200">
      <p className="font-medium text-slate-900">
        Week of {formatDayMonth(point.weekStart)}
      </p>
      <p className="text-slate-500">
        {formatMoney(point.totalBase, currency)} · {point.count}{" "}
        {point.count === 1 ? "expense" : "expenses"}
      </p>
    </div>
  );
}

/**
 * Weekly totals across the last three months.
 *
 * Weekly rather than monthly because three months is three points, and three
 * points is not a line. Weeks with no spending arrive as zeroes rather than
 * gaps: a missing week would be drawn as a straight line across it, which reads
 * as steady spending during a week when there was none.
 *
 * One series, so there is no legend — the heading names it.
 */
export function TrendChart({
  points,
  currency,
}: {
  points: TrendPoint[];
  currency: string;
}) {
  const data: Point[] = points.map((point) => ({ ...point, total: Number(point.totalBase) }));
  const busiest = data.reduce<Point | null>(
    (best, point) => (best === null || point.total > best.total ? point : best),
    null,
  );

  return (
    <section className={CARD}>
      <header className="mb-3">
        <h2 className="text-sm font-medium text-slate-900">The last three months</h2>
        <p className="text-xs text-slate-400">
          Spending per week
          {busiest && busiest.total > 0 && (
            <> · busiest was the week of {formatDayMonth(busiest.weekStart)}</>
          )}
        </p>
      </header>

      {/* The container is tall enough for the plot and the axis labels, so the
          card never grows a small nested scrollbar. */}
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            {/* Hairline grid, horizontal only, solid — one shade off the surface
                so it stays behind the data rather than competing with it. */}
            <CartesianGrid stroke="var(--chart-grid)" strokeWidth={1} vertical={false} />
            <XAxis
              dataKey="weekStart"
              tickFormatter={formatDayMonth}
              tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: "var(--chart-axis)" }}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(value: number) => formatMoneyShort(value, currency)}
              tick={{ fill: "var(--chart-muted)", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              content={<ChartTooltip currency={currency} />}
              cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="var(--series-1)"
              strokeWidth={2}
              // 8px markers, each with a 2px ring in the surface colour so the
              // line passing behind them does not touch the dot.
              dot={{ r: 4, fill: "var(--series-1)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
              activeDot={{ r: 5, fill: "var(--series-1)", stroke: "var(--chart-surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
