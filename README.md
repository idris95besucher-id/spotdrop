# SpotDrop

SpotDrop is a mobile-first city-based chat MVP built with Next.js App Router, TypeScript, Tailwind, and Supabase.

## MVP scope

- Supabase authentication
- Profile page with username, avatar, bio, country, city
- Country selection page
- City selection page
- Public city chat room
- Profile navigation from chat messages
- Direct messaging placeholder flow
- Dark, mobile-friendly UI

## Project structure

- `app/` — Next.js App Router pages and layouts
- `components/` — shared UI components
- `lib/` — Supabase client and shared TypeScript types
- `database/schema.sql` — Supabase database tables for countries, cities, profiles, public chat messages, and direct messages

## Supabase schema

The SQL schema is available at `database/schema.sql`.

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Create a `.env.local` file with these variables:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

3. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see SpotDrop.

## Next steps

- Add Supabase Auth sign-in and profile management
- Implement real-time city chat with Supabase Realtime
- Persist country/city selection in user profiles
- Build direct message inbox and message composer
