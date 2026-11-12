# App and mini-program notification repair (2026-11-12)

## Confirmed production state

- The customer can see messages in the in-app list. Two advisor messages inspected today were recalled; neither should be restored or resent.
- Native push and iOS APNs configuration are enabled and the APNs key is present. The production PushDevice collection contained zero records, so there was no destination for system notifications.
- The installed iPhone App reports v1.0.0. The iOS 1.0.0(3) source has only the Huawei bridge and cannot obtain an APNs token or set the iOS desktop badge.
- The existing dispatcher marked a job `done` even when it found no registered destination. This repair introduces `no_destination` for that case.
- A read-only query of the WeChat mini-program account returned zero subscription templates. Mini-program notifications outside WeChat require a configured template and the customer's WeChat subscription authorization; the App APNs channel does not cover it.

## Prepared source

- Isolated native source: `../ios-push-fix-20261112`, based on the known iOS 1.0.0(3) source. Version 1.0.2(5) adds `expo-notifications`, production APNs entitlement, permission and device-token acquisition, icon badge updates, and notification-open events through the existing H5 bridge.
- This worktree adds App H5 opt-in, APNs device registration, restoration after a previously approved opt-in, logout cleanup, unread-count badge sync, and notification-open navigation. The H5 build uses `/mobile-preview/` asset paths and same-origin API calls.
- The backend dispatcher now records `no_destination` instead of `done` when an eligible message has no device. It does not change historical messages or jobs.

## Verification and release limits

- Backend APNs/registry/dispatcher tests: 13 passed.
- Native SDK 54 iOS JS export succeeded; Expo configuration resolved version 1.0.2(5), `expo-notifications`, and production APNs entitlement. This is not a signed-device delivery result.
- H5 production build succeeded with 47 output files and `/mobile-preview/` asset paths. It has not been deployed. The installed App H5 has other release overlays; compare those before replacing its current assets.
- A signed TestFlight candidate is being built separately. The user must install a version containing the native module, allow Notifications and Badges, then explicitly choose **App 系统消息通知 → 开启 / 重新绑定**. Only a new, non-recalled human message and real-device receipt can establish delivery.
- The WeChat mini-program notification sender cannot be completed until its subscription template ID and field definitions are available. No customer subscription or test notification has been triggered.
