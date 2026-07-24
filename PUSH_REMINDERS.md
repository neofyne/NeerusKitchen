# Phone delivery alerts

The app already has desk sounds. Phone delivery alerts use Web Push, so they can
arrive when the order desk is backgrounded or closed. The push notification is
deliberately generic on a locked phone: it says a delivery reminder is due and
opens `/admin` when tapped.

Before publishing this feature, perform the following once:

1. Run `npm run push:keys` locally. Keep `VAPID_PRIVATE_KEY` private.
2. In Supabase SQL Editor, run `supabase/push_reminders.sql`.
3. Add the generated public key to Cloudflare Pages:
   `npx wrangler pages secret put PUSH_VAPID_PUBLIC_KEY --project-name neerushomekitchen`
4. Add the Worker secrets:
   - `npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler.reminder-push.jsonc`
   - `npx wrangler secret put PUSH_VAPID_PUBLIC_KEY --config wrangler.reminder-push.jsonc`
   - `npx wrangler secret put VAPID_PRIVATE_KEY --config wrangler.reminder-push.jsonc`
5. Deploy the scheduled worker with `npm run deploy:push-reminders`, then deploy
   the Pages app normally.

After that, open **Settings → Phone delivery alerts** on each kitchen phone and
choose **Turn on phone alerts**. On iPhone, first add the kitchen app to the
Home Screen, then allow notifications.

The Worker runs once a minute and claims each due reminder once. Invalid phone
subscriptions are automatically removed. The manual **WhatsApp reminder** on an
order card remains entirely user-initiated.
