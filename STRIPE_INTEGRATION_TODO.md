# Stripe integration notes — Open Late Featured

## What applies here

Open Late Featured checkout is a **Stripe Pricing Table** embed on [`featured.html`](featured.html), not a custom Checkout Session API call in this repo.

- Pricing table id: `prctbl_1UXBOHLrtLzemS8xJtlv9ULa`
- Publishable key is already on the page
- Promo code created for DM outreach: **OPENLATEMONTH1** (30 days free Featured / 100% off first month)

The Checkout Studio export (`allow_promotion_codes: true` and related `fixed_by_ui` fields) maps to **Pricing Table → Edit → payment page settings → Allow promotion codes**, not to new server code. Adding a Scenario B Checkout Session endpoint would duplicate Featured and is intentionally not done.

## Configured / to confirm in Dashboard

| Parameter (Checkout Studio) | How it applies on Open Late |
|----------------------------|-----------------------------|
| `allow_promotion_codes: true` | Enable on Pricing Table payment page (Dashboard) |
| `billing_address_collection: auto` | Pricing Table payment page defaults |
| `phone_number_collection.enabled: false` | Leave off unless you want phone |
| `automatic_tax.enabled: false` | Leave off until Tax registrations are set up |
| `ui_mode: hosted_page` | Pricing Table already redirects to hosted Checkout |

## Values already live

| Item | Value |
|------|--------|
| Promotion code | `OPENLATEMONTH1` |
| Coupon | 100% off first month (Featured) |
| Pricing table | `prctbl_1UXBOHLrtLzemS8xJtlv9ULa` |

## Remaining setup

1. ~~Confirm Allow promotion codes~~ **DONE 2026-11-05 ~2:35 PM ET** — enabled for all 3 prices on `prctbl_1UXBOHLrtLzemS8xJtlv9ULa`.
2. Smoke-test Featured: open `/featured.html`, start checkout, enter `OPENLATEMONTH1`, verify discount applies (use a test card in test mode, or a $0 first-month path carefully in live).
3. Optional: prefill via Pricing Table / Checkout URL params if Stripe documents a promo prefill for pricing tables.
4. If you later move off Pricing Table to a custom Checkout Session server, apply the Checkout Studio `fixed_by_ui` fields on `checkout.sessions.create` and keep subscription `mode` with Featured Price IDs.

## Tax note

Stripe Tax is currently off (`automatic_tax` false). If you charge customers in US/EU states with nexus, set up [tax registrations](https://docs.stripe.com/tax/register) before turning automatic tax on.

## Resources

- https://docs.stripe.com/payments/checkout/pricing-table
- https://docs.stripe.com/payments/checkout/discounts
- https://support.stripe.com
- https://docs.stripe.com/mcp
