// The database schema, kept in a file with no imports so the migration script can run it directly with Node.
// The table is prefixed so it can share a Neon database with other projects.
export const MIGRATIONS: string[] = [
  `create table if not exists solpay_links (
    id          text primary key,
    merchant    text        not null,
    label       text        not null,
    memo        text,
    amount      bigint      not null check (amount > 0),
    currency    text        not null check (currency in ('SOL','USDC')),
    reference   text        not null unique,
    status      text        not null default 'pending' check (status in ('pending','paid')),
    signature   text,
    payer       text,
    paid_at     timestamptz,
    created_at  timestamptz not null default now(),
    expires_at  timestamptz not null
  )`,
  `create index if not exists solpay_links_merchant_created on solpay_links (merchant, created_at desc)`,
];
