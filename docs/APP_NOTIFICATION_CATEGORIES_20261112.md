# App notification categories, 2026-11-12

## Customer requirement

The switches in the iPhone 1.0.2(5) notification settings screen must control real delivery. A message present only in the App inbox is not proof of a desktop notification.

## Prepared backend

- New eligible human and system `Message` documents enter `NativePushJob`; unread, recalled, AI draft and rejected messages remain excluded. Existing explicit human-message enqueue calls remain idempotent.
- APNs and Huawei keep notification content generic. Per-device category settings are saved via authenticated `/api/push-devices/settings` and applied immediately before each send. An account transfer resets old account settings.
- Combined medication doses, due customer reminders, daily monitoring messages, approved report organization, appointment reminders, and service expiration events feed native delivery. Due customer reminders use Beijing time and a deterministic dedupe key. Service expiration uses verified service access and notifies at 7, 3 and 1 days remaining.
- Source categories: medication, measurement, exercise, doctor, manager, nutritionist, report, system, service_exp. Exercise delivery requires an enabled exercise reminder in the customer's reminder list; it does not invent a plan from unrelated health records.

## Verification and release state

- 34 targeted backend tests passed after merging production commit `3b424783` and the existing monthly-report explanation commit `e3169a4a`; App H5 build and browser smoke passed in `../app-h5-push-release-20261112`.
- Production source is `3b424783916c2f24f40f9b16205420febc2d2b5e` and has 8 dirty tracked files unrelated to this change, including `backend/src/utils/healthRecordSummary.js` and seven geo site files. The normal backend deploy gate refuses a dirty server. No backend or new H5 category UI was published in this follow-up. H5 dry-run verified the current live index hash and 47-file candidate.
- After the unrelated production edits are reconciled, recheck the exact server commit and H5 index, run the normal backend release from the clean merged source, publish H5, and verify a newly sent, non-recalled human message plus a due reminder on a real iPhone. Provider acceptance and a stored device token alone do not establish handset delivery.
