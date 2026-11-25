// A plain-language takeaway shown at the bottom of an analytics card.

export type InsightTone = "positive" | "attention" | "neutral";
export type Insight = { tone: InsightTone; text: string };

export const fmt = (value: number) => value.toLocaleString("en-US");
export const percent = (value: number) => `${value.toFixed(1)}%`;
export const plural = (count: number, one: string, many = `${one}s`) => `${fmt(count)} ${count === 1 ? one : many}`;
