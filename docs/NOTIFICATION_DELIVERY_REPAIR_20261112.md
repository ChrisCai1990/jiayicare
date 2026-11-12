# App and mini-program notification repair (2026-11-12)

## Category-switch follow-up

The user clarified that every category shown on the iPhone settings screen is needed for real notifications. A prepared H5 update makes the top App notification control and individual category switches functional, loading and saving each category through `/api/push-devices/settings`. The matching backend release is in `../backend-push-release-20261112`, commit `1ad54ace` merged with production source; details are in its `docs/APP_NOTIFICATION_CATEGORIES_20261112.md`. H5 build and browser interaction/regression smoke passed. This follow-up has **not** been published: production Git has unrelated tracked modifications and the standard backend release gate stops. The H5 category UI must be published only after the matching backend API is live.

## Confirmed production state

- The customer can see messages in the in-app list. Two advisor messages inspected today were recalled; neither should be restored or resent.
- Native push and iOS APNs configuration are enabled and the APNs key is present. The production PushDevice collection contained zero records, so there was no destination for system notifications.
- The installed iPhone App reports v1.0.0. The iOS 1.0.0(3) source has only the Huawei bridge and cannot obtain an APNs token or set the iOS desktop badge.
- The existing dispatcher marked a job `done` even when it found no registered destination. This repair introduces `no_destination` for that case.
- A read-only query of the WeChat mini-program account returned zero subscription templates. Mini-program notifications outside WeChat require a configured template and the customer's WeChat subscription authorization; the App APNs channel does not cover it.

## Prepared source

- Isolated native source: `../ios-push-fix-20261112`, based on the known iOS 1.0.0(3) source. Version 1.0.2(5) adds `expo-notifications`, production APNs entitlement, permission and device-token acquisition, icon badge updates, and notification-open events through the existing H5 bridge.
- This worktree adds App H5 opt-in, APNs device registration, restoration after a previously approved opt-in, logout cleanup, unread-count badge sync, and notification-open navigation. The H5 build uses `/mobile-preview/` asset paths and same-origin API calls. It includes the monthly report explanation change that was deployed concurrently.
- The backend dispatcher now records `no_destination` instead of `done` when an eligible message has no device. It does not change historical messages or jobs.

## Verification and release limits

- Backend APNs/registry/dispatcher tests: 13 passed.
- Native SDK 54 iOS JS export succeeded; Expo configuration resolved version 1.0.2(5), `expo-notifications`, and production APNs entitlement. This is not a signed-device delivery result.
- H5 production build succeeded with 47 output files and `/mobile-preview/` asset paths. Local smoke covered APNs binding, badge bridge, health archive, adviser conversation, questionnaire, and message list. The H5 was published with a hash-checked index swap from `e66a6c4c` to `17ea89a5`; backup: `/var/backups/jiayicare-app-h5-push-20261112-17ea89a5f8c0/previous-index.html`. Public entry and its referenced assets were verified.
- Signed iOS 1.0.2(5) EAS build `cccc6c9e-a00a-4927-b1a3-42c5bbd24fc8` finished; its Xcode log contains ExpoNotifications and APNs entitlement. The binary was uploaded to App Store Connect / TestFlight submission `088121f6-b478-474b-967d-6df35b284507` and awaits Apple processing. The user must install it, allow Notifications and Badges, then explicitly choose **App 系统消息通知 → 开启 / 重新绑定**. Only a new, non-recalled human message and real-device receipt can establish delivery.
- The backend `no_destination` status change passed 13 tests in branch `fix/backend-push-status-20261112` commit `e77a7e53`, but production deployment was stopped by the existing Git cleanliness gate: tracked production files are modified by other work. Do not bypass that gate or claim this backend status change is live.
- The WeChat mini-program notification sender cannot be completed until its subscription template ID and field definitions are available. No customer subscription or test notification has been triggered.
