// UI thresholds that reuse engine rules (documented in docs/calculations.md).
import { HEADROOM_WARNING_PERCENT } from "./findings";

/** Budget warnings list projects forecast to overrun or with less headroom than the budget_headroom rule allows. */
export const BUDGET_WARN_PERCENT = HEADROOM_WARNING_PERCENT;
