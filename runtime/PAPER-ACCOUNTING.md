# Confirmed paper simulation v2

This is an unfunded simulation, not a broker account. No initial balance, margin model, leverage, risk ceiling or global live authorization is invented. Every submit, fill, cancel, reduce and close requires authenticated explicit user confirmation, bound to owner/action/payload; approval consumption and the ledger event commit atomically. Idempotent retries return the original result without a second event. Real-money endpoint allowlists are unchanged.

## Decimal contract

`paper-decimal.mjs` uses BigInt fixed point at 12 decimal places; JSON/storage uses canonical decimal strings. Input quantity supports at most eight decimal places. Input prices/quantities remain bounded to positive values <= 10^12 as representation bounds, not user risk limits. Non-finite values, excess precision, invalid strings and unsupported instruments are refused. Public decimal strings are preserved in `projectPerp().rows[].exact` before display conversion. Numeric publisher values can retain only the precision supplied by that publisher; no precision is fabricated.

Multiplication/division round to nearest 10^-12 with exact ties away from zero. Each fill stores rounded price×quantity as cost basis. Average entry is display information (rounded cost/quantity); subsequent realized P&L uses remaining cost basis, never the rounded display entry. Partial reductions allocate remaining cost proportionally with the same rounding rule. Final close consumes every remaining cost unit, preventing residual dust. Realized long P&L = exit notional − allocated entry cost; short P&L reverses the sign. Persisted totals and UI P&L use decimal arithmetic/string rendering rather than binary floating-point summation.

## Simulation assumptions

Execution uses fresh approved BloFin public perpetual bid/ask, with limit-price enforcement and no extra slippage. Fees and funding are **not modelled**, represented as null and displayed as “not modelled,” never represented as zero actual cost. P&L is gross simulated price movement, not net investment return. No approved operational cost schedule/funding schedule was supplied. Funding-rate validity and source freshness remain validated. TradingView is display-only; unsupported spot remains unavailable.

## Legacy continuity and recovery

Before conversion, the full original ledger JSON is archived in SQLite `ledger_v1_archive` in the same `BEGIN IMMEDIATE` transaction. Existing orders and positions retain IDs/owners/history. Decimal-exact legacy numbers are converted directly; otherwise finite legacy values up to 10^12 are rounded to 12 decimal places with JavaScript's legacy-number `toFixed(12)` representation, explicitly labelled in migration metadata. This cannot recover precision already lost in the old binary model. Failed conversion rolls back and refuses startup. Original history and request receipts are not rewritten. Historical fee/funding deductions remain in realized P&L; new closes follow the explicitly labelled v2 assumptions. Existing pending orders can be cancelled or filled after renewed confirmation; existing positions can be reduced/closed.

Persistent production path is `/home/k/.openclaw/services/trading-protected-origin/state/paper.sqlite`, outside immutable releases. Directory/file modes are 0700/0600; SQLite uses WAL/FULL sync. Graceful app teardown closes the ledger. Before deployment an operator must preserve a consistent SQLite backup including WAL state and verify rollback compatibility. Rolling code back must not silently overwrite ledger history with a pre-trade backup. The archive is migration evidence, not permission to erase later trades.

Legacy `paper-ledger.mjs` policy/float methods remain for historical fixture compatibility and storage scaffolding; operational `PaperSimulation` overrides mutation and view accounting. Historical fixture tests do not qualify the new operational runtime. New origin, decimal, lifecycle, race and browser tests cover v2 separately.
