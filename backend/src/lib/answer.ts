import type { QuestionBucket, QuestionMeasure, StructuredQuestion } from "../ai/types.js";
import { dayLabel, monthLabel } from "./dates.js";
import { bucketEnd, type Answer, type ResolvedFilters } from "./insights.js";
import { formatMoney } from "./money.js";

/**
 * Turning computed figures into a sentence.
 *
 * Templates, deliberately. The model could phrase these more naturally, and it
 * could also misstate a number it was handed — and this application would rather
 * read slightly mechanically than be wrong about money. The model chose the
 * question; the database computed the figure; this writes it down. No step in
 * that chain lets a language model near an arithmetic result.
 */

function bucketLabel(bucket: QuestionBucket, key: string): string {
  switch (bucket) {
    case "day":
      return dayLabel(key);
    case "week":
      // "the week of 3 August" rather than a range, which reads better in a
      // sentence and is unambiguous because weeks here always start on Monday.
      return `the week of ${dayLabel(key)}`;
    case "month":
      return monthLabel(key);
    default:
      return key;
  }
}

function scope(filters: ResolvedFilters): string {
  const parts: string[] = [];
  if (filters.category) parts.push(`in ${filters.category}`);
  if (filters.merchant) parts.push(`at ${filters.merchant}`);
  parts.push(`between ${dayLabel(filters.from)} and ${dayLabel(filters.to)}`);
  return parts.join(" ");
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function formatAnswer(
  answer: Answer,
  question: StructuredQuestion,
  filters: ResolvedFilters,
  currency: string,
): string {
  if (answer.kind === "empty") {
    // Not "you spent €0.00". Nothing matching and spending nothing are different
    // facts, and only one of them is true here.
    return `Nothing matches that ${scope(filters)}.`;
  }

  if (answer.kind === "expenses") {
    const word = answer.order === "highest" ? "highest" : "lowest";
    const named = (row: (typeof answer.rows)[number]) =>
      `${formatMoney(Number(row.amountBase), currency)} at ${row.merchant ?? row.description ?? "an unnamed place"} on ${dayLabel(row.expenseDate)}`;

    if (answer.rows.length === 1) {
      return `Your ${word} expense ${scope(filters)} was ${named(answer.rows[0]!)}.`;
    }

    return `Your ${answer.rows.length} ${word} expenses ${scope(filters)}: ${answer.rows
      .map(named)
      .join("; ")}.`;
  }

  if (answer.kind === "buckets") {
    const word = answer.order === "highest" ? "highest" : "lowest";
    const unit =
      answer.bucket === "category" ? "category" : answer.bucket === "merchant" ? "shop" : answer.bucket;

    const described = (row: (typeof answer.rows)[number]) => {
      const label = bucketLabel(answer.bucket, row.key);
      const figure =
        answer.measure === "count"
          ? plural(row.count, "expense", "expenses")
          : answer.measure === "average"
            ? `${formatMoney(Number(row.average), currency)} on average`
            : `${formatMoney(Number(row.total), currency)} across ${plural(row.count, "expense", "expenses")}`;
      return `${label}, at ${figure}`;
    };

    if (answer.rows.length === 1) {
      return `Your ${word} ${unit} ${scope(filters)} was ${described(answer.rows[0]!)}.`;
    }

    return `Your ${answer.rows.length} ${word} ${unit === "category" ? "categories" : `${unit}s`} ${scope(
      filters,
    )}: ${answer.rows.map(described).join("; ")}.`;
  }

  const measure: QuestionMeasure = answer.measure;
  if (measure === "count") {
    return `You recorded ${plural(answer.count, "expense", "expenses")} ${scope(filters)}.`;
  }
  if (measure === "average") {
    return `Your average expense ${scope(filters)} was ${formatMoney(Number(answer.average), currency)}, across ${plural(answer.count, "expense", "expenses")}.`;
  }
  return `You spent ${formatMoney(Number(answer.total), currency)} ${scope(filters)}, across ${plural(answer.count, "expense", "expenses")}.`;
}

/**
 * How the question was read, shown under the answer.
 *
 * The same honesty as the confirm step: the person can see what was actually
 * asked of the database, so a misread question looks like a misread question
 * rather than a surprising number.
 */
export function describeQuestion(
  question: StructuredQuestion,
  filters: ResolvedFilters,
): string | null {
  const where = [
    filters.category,
    filters.merchant ? `at ${filters.merchant}` : null,
    `${dayLabel(filters.from)} to ${dayLabel(filters.to)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  switch (question.kind) {
    case "aggregate":
      return `${question.measure} · ${where}`;
    case "topExpenses":
      return `${question.order} ${plural(question.limit, "expense", "expenses")} · ${where}`;
    case "topBuckets":
      return `${question.order} ${question.bucket} by ${question.measure} · ${where}`;
    default:
      return null;
  }
}
