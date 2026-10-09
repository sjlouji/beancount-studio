export interface QueryExample {
  label: string;
  description: string;
  query: string;
}

/** Starter BQL queries; `currency` is the ledger's primary operating currency. */
export function queryExamples(currency: string): QueryExample[] {
  return [
    {
      label: "Balances",
      description: "Asset and liability balances per account",
      query: "SELECT account, sum(position) AS balance\nWHERE account ~ '^(Assets|Liabilities)'\nGROUP BY account\nORDER BY account",
    },
    {
      label: "Expenses by month",
      description: `Monthly spending converted to ${currency}`,
      query: `SELECT year, month, sum(convert(position, '${currency}')) AS total\nWHERE account ~ '^Expenses'\nGROUP BY year, month\nORDER BY year, month`,
    },
    {
      label: "Top payees",
      description: "Where the most money goes",
      query: `SELECT payee, count(*) AS postings, sum(convert(position, '${currency}')) AS total\nWHERE account ~ '^Expenses' AND payee != ''\nGROUP BY payee\nORDER BY total DESC\nLIMIT 20`,
    },
    {
      label: "Holdings",
      description: "Units, cost and market value per asset account",
      query: "SELECT account, units(sum(position)) AS units, cost(sum(position)) AS cost, value(sum(position)) AS market_value\nWHERE account ~ '^Assets'\nGROUP BY account\nORDER BY account",
    },
    {
      label: "Income by account",
      description: `Income totals converted to ${currency}`,
      query: `SELECT account, sum(convert(position, '${currency}')) AS total\nWHERE account ~ '^Income'\nGROUP BY account\nORDER BY total`,
    },
    {
      label: "Pending transactions",
      description: "Postings flagged with !",
      query: "SELECT date, payee, narration, account, position\nWHERE flag = '!'\nORDER BY date DESC",
    },
    {
      label: "Tagged transactions",
      description: "Every posting on a transaction that has tags",
      query: "SELECT date, payee, narration, tags, account, position\nWHERE tags\nORDER BY date DESC\nLIMIT 200",
    },
    {
      label: "Prices",
      description: "Most recent price directives",
      query: "SELECT date, currency, amount\nFROM #prices\nORDER BY date DESC\nLIMIT 50",
    },
  ];
}
