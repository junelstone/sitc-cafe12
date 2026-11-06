# SITC Cyber Café

Web app for the daily work of Stone's IT Consulting's cyber café (Brazzaville): counter sales and receipts, typing/design jobs, computer session timer, paper and ink stock, and a daily cash report. French and English, amounts in F CFA.

- **Live:** https://sitc-cafe.netlify.app (Netlify site `sitc-cafe`)
- **Stack:** Vite + React, Supabase (auth, Postgres, one edge function), Netlify hosting.

## Run locally

```bash
cp .env.example .env   # fill VITE_SUPABASE_URL and VITE_SUPABASE_KEY (publishable key)
npm install
npm run dev
```

## Database

SQL in `supabase/migrations/` (apply in order) and the admin-only `create-staff` edge function in `supabase/functions/`.
The first user created in Supabase Auth becomes admin; admins add cashiers from the Staff page.

Money rules live in the database (`record_sale`, `pay_job`, `end_session`, `void_sale`, `restock`), so prices and totals cannot be changed from the browser.
Computer sessions bill per minute, 15-minute minimum, rounded up to the next 25 F CFA.

## Not done yet

- Mobile Money API: payments are recorded by hand with the transaction ID for now.
