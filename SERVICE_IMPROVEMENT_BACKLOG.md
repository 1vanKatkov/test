# Astrolhub Improvement Backlog

## Package 2: Product Features

Goal: finish features that are already partially present in the codebase and can increase product value without a full architecture rewrite.

### 1. Lunar Calendar

Priority: High

Scope:
- Connect the existing lunar service to a complete user flow.
- Make `/client/lunar` available from the dashboard instead of showing it as locked.
- Show month navigation, current moon phase, daily recommendations, and loading/error states.
- Store the selected language in requests and UI labels.

Acceptance criteria:
- A logged-in user opens Lunar Calendar from the dashboard.
- The page loads the current month by default.
- The user can change month/year and receive localized results.
- Guests are redirected to login before using the feature.

Test plan:
- Smoke `/client/lunar?lang=en` and `/client/lunar?lang=ru`.
- Verify `/api/lunar` unauthorized behavior.
- Verify mobile layout with fixed bottom navigation.

### 2. Subscriptions

Priority: High

Scope:
- Add a profile/top-up UI block for subscription plans.
- Reuse existing payment infrastructure where possible.
- Show what is included: monthly sparks, discounted AI requests, or premium modules.
- Add status display in profile: active plan, renewal date, cancellation state.

Acceptance criteria:
- A logged-in user can see available plans.
- Payment creation clearly distinguishes one-time spark packages from subscriptions.
- Profile shows active subscription state after payment/provider sync.
- Guests are sent to login from subscription entry points.

Test plan:
- Payment creation smoke for subscription package.
- Profile render with active/inactive subscription rows.
- Admin/user balance checks after sync.

### 3. Numerology PDF

Priority: Medium

Scope:
- Port the legacy PDF generator from `bots228/numerology/report_generator.py` into the main web service.
- Add a PDF download action on numerology report pages.
- Keep HTML report as the primary mobile view.
- Ensure report ownership checks before PDF download.

Acceptance criteria:
- A user can generate a numerology report and download PDF from the report page.
- PDF is localized according to report language.
- Users cannot download another user's report.
- File names are safe and do not expose internal paths.

Test plan:
- Generate report and open HTML.
- Download PDF for the same user.
- Attempt unauthorized download and expect 401/404.
- Verify Cyrillic and English rendering in PDF.

### 4. AI Prompt Improvements

Priority: Medium

Scope:
- Extract prompt templates for Sonnik and Compatibility into versioned helper functions.
- Add stronger language instructions for English/Russian.
- Add output structure guidance: short summary, detailed interpretation, practical advice.
- Reuse legacy prompt material where it improves answer quality.

Acceptance criteria:
- Sonnik responses are consistently in selected language.
- Compatibility responses include a readable structure instead of one long paragraph.
- Prompt changes are isolated enough to test and adjust without touching route logic.
- Failed AI calls still refund balance where applicable.

Test plan:
- Manual smoke with English and Russian payloads.
- Verify no Cyrillic appears in English response except user-provided names/text.
- Verify balance charge/refund behavior on simulated AI failure.

## Suggested Order

1. Lunar Calendar: fastest product win because service and page already exist.
2. AI Prompt Improvements: improves perceived quality of paid tools.
3. Numerology PDF: valuable, but needs file/rendering/ownership care.
4. Subscriptions: largest scope because it touches payments, profile, and product rules.

## Risks To Handle

- Payment and subscription state must not double-credit or double-charge.
- Report/PDF endpoints must enforce ownership and path traversal protection.
- English mode must be enforced at API payload and prompt level, not only in UI.
- Mobile bottom navigation must be tested on all new pages to avoid content overlap.
