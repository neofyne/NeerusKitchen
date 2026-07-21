# Neeru's Kitchen — Project Record

Last updated: 22 July 2026

This file records the accounts and services used to operate the Neeru's Kitchen family order manager. It intentionally contains no passwords, API keys, recovery codes, or other secrets.

## GitHub

- Account email: `neofyne@gmail.com`
- Repository owner: `neofyne`
- Repository: [neofyne/NeerusKitchen](https://github.com/neofyne/NeerusKitchen)
- Production branch: `main`

## Supabase

- Account email: `neofyne@gmail.com`
- Project reference: `aqwczyplrqpdbxkfflhj`
- Project URL: [aqwczyplrqpdbxkfflhj.supabase.co](https://aqwczyplrqpdbxkfflhj.supabase.co)
- Dashboard: [Supabase project dashboard](https://supabase.com/dashboard/project/aqwczyplrqpdbxkfflhj)
- Purpose: Authentication and shared order/menu data for the family.

## Netlify

- Organization/team name: `Musifine`
- Site name: `neerus-kitchen`
- Live app: [neerus-kitchen.netlify.app](https://neerus-kitchen.netlify.app)
- Deployment source: GitHub repository `neofyne/NeerusKitchen`, branch `main`
- Automatic deployment: Enabled when changes are pushed to `main`

## Environment configuration

The deployed app requires these variables in Netlify:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Their values must stay in Netlify's environment settings or a local ignored `.env.local` file. Do not place their values in this document. Never commit a Supabase service-role key, a password, or a personal access token to GitHub.

## Access and recovery

- Family members sign in through Supabase authentication.
- Password resets are requested from the app's login page and delivered by email.
- The application administrator should retain access to `neofyne@gmail.com` because it owns the connected GitHub and Supabase accounts.
