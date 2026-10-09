const LINES = [
  ['2026-03-01 * "Blue Bottle" "Flat white"', "  Expenses:Food:Coffee          4.50 USD", "  Assets:Bank:Checking"],
  ['2026-03-01 * "Payroll" "March salary"', "  Assets:Bank:Checking     4,850.00 USD", "  Income:Salary"],
  ["2026-03-02 balance Assets:Bank:Checking   7,212.40 USD"],
  ['2026-03-04 * "Vanguard" "Buy VTI"', "  Assets:Brokerage:VTI    12 VTI {251.10 USD}", "  Assets:Brokerage:Cash"],
  ['2026-03-05 ! "Landlord" "Rent"', "  Expenses:Housing:Rent     1,900.00 USD", "  Liabilities:CreditCard"],
  ["2026-03-06 price VTI   254.03 USD"],
  ['2026-03-07 * "Trader Joe\'s" "Groceries" #weekly', "  Expenses:Food:Groceries     96.12 USD", "  Assets:Bank:Checking"],
  ['2026-03-09 note Assets:Bank:Savings "Emergency fund topped up"'],
  ['2026-03-12 * "Netflix" "Subscription"', "  Expenses:Entertainment      15.99 USD", "  Liabilities:CreditCard"],
  ['2026-03-15 * "Hooli" "Dividend"', "  Assets:Brokerage:Cash        32.10 USD", "  Income:Dividends"],
];

function Block({ lines, i }: { lines: string[]; i: number }) {
  return (
    <pre className="mb-5 font-mono text-[13px] leading-relaxed text-foreground/80" aria-hidden style={{ opacity: 0.55 + ((i * 7) % 4) * 0.12 }}>
      {lines.map((line, j) => (
        <div key={j}>
          {j === 0 ? (
            <>
              <span className="text-muted-foreground">{line.slice(0, 10)}</span>
              <span className={line[11] === "!" ? "text-warning" : "text-primary"}>{line.slice(10, 13)}</span>
              {line.slice(13)}
            </>
          ) : (
            <span className="text-foreground/70">{line}</span>
          )}
        </div>
      ))}
    </pre>
  );
}

/** A slowly scrolling column of sample ledger entries — the "ticker" on the sign-in page. */
export function LedgerTicker() {
  const doubled = [...LINES, ...LINES];
  return (
    <div className="pointer-events-none relative mt-10 flex-1 overflow-hidden px-10 [mask-image:linear-gradient(to_bottom,transparent,black_12%,black_80%,transparent)]">
      <div className="animate-ticker motion-reduce:animate-none">
        {doubled.map((lines, i) => (
          <Block key={i} lines={lines} i={i} />
        ))}
      </div>
    </div>
  );
}
