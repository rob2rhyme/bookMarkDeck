# Native iOS shell — guaranteed time-sensitive timer alerts

The PWA's web push **cannot** break through silent/Focus on iOS (Critical/Time-
Sensitive alerts are native-only). This wraps the live web app in a thin
[Capacitor](https://capacitorjs.com) iOS shell that schedules a **local,
time-sensitive notification** at the timer's end — so it buzzes through Focus /
Do Not Disturb even with the app closed.

> **Time-Sensitive caveat:** it breaks through Focus/DND and fires a strong
> haptic, and works with a free Apple ID (no entitlement request). The hardware
> **Ring/Silent switch still silences the *sound*** (the haptic still fires).
> Bypassing the mute switch needs **Critical Alerts**, which require Apple's
> special entitlement — see the last section.

Everything web-side already ships: when the app runs inside the shell,
`src/features/focus/lib/nativeNotify.ts` schedules/cancels via a custom
`TimerAlert` plugin. On the plain web/PWA it's a no-op (web push still applies).

## Prerequisites
- macOS with **Xcode** + Command Line Tools, and **CocoaPods** (`sudo gem install cocoapods`).
- A free Apple ID is enough to run on your own device (7-day signing); a paid
  Apple Developer account ($99/yr) for TestFlight / long-lived installs.

## 1. Generate the iOS project
Deps are already in `package.json`. From the repo root:

```bash
npm install
npx cap add ios          # creates the ios/ native project
```

Confirm `capacitor.config.ts` `server.url` points at **your** deployed domain.

## 2. Add the custom `TimerAlert` plugin
Create two files in `ios/App/App/`:

**`TimerAlertPlugin.swift`**
```swift
import Foundation
import Capacitor
import UserNotifications

@objc(TimerAlertPlugin)
public class TimerAlertPlugin: CAPPlugin {
    @objc func requestPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current()
            .requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
                call.resolve(["granted": granted])
            }
    }

    @objc func schedule(_ call: CAPPluginCall) {
        let id = call.getInt("id") ?? 7001
        let atMs = call.getDouble("at") ?? 0
        let title = call.getString("title") ?? "Bookmark Deck"
        let body = call.getString("body") ?? ""

        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        if #available(iOS 15.0, *) {
            content.interruptionLevel = .timeSensitive   // breaks through Focus/DND
        }

        // `at` is epoch ms; schedule relative to now (min 1s).
        let seconds = max(1, atMs / 1000.0 - Date().timeIntervalSince1970)
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
        let request = UNNotificationRequest(identifier: "timer-\(id)", content: content, trigger: trigger)

        // Replace any pending alert with the same id, then add.
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: ["timer-\(id)"])
        UNUserNotificationCenter.current().add(request) { _ in call.resolve() }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        let id = call.getInt("id") ?? 7001
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: ["timer-\(id)"])
        call.resolve()
    }
}
```

**`TimerAlertPlugin.m`** (registers the plugin with Capacitor's bridge)
```objc
#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(TimerAlertPlugin, "TimerAlert",
  CAP_PLUGIN_METHOD(requestPermission, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(schedule, CAPPluginReturnPromise);
  CAP_PLUGIN_METHOD(cancel, CAPPluginReturnPromise);
)
```

When Xcode asks to create an Objective-C bridging header (because of the `.m`),
accept it.

## 3. Enable the Time-Sensitive capability
Open the workspace: `npx cap open ios`. Then in Xcode:

1. Select the **App** target → **Signing & Capabilities**.
2. Set your **Team** (your Apple ID) and a unique **Bundle Identifier**
   (match `appId` in `capacitor.config.ts`, e.g. `app.rob2rhyme.bmarkdeck`).
3. **+ Capability → Time Sensitive Notifications**.

(Time-sensitive needs no Apple approval — it's a free capability.)

## 4. Build & run on your device
```bash
npx cap sync ios     # copies config + plugins into the native project
npx cap open ios     # then Cmd-R in Xcode with your iPhone connected
```

First launch will prompt for notification permission — allow it. Start a focus
block, lock the phone (even with a Focus on), and the end alert will buzz
through. Re-run `npx cap sync ios` whenever you change `capacitor.config.ts`.

## How it's wired
- `nativeNotify.ts` (`scheduleNativeTimerAlert` / `cancelNativeTimerAlert` /
  `ensureNativeNotifPermission`) calls the `TimerAlert` plugin only when
  `Capacitor.isNativePlatform()` is true.
- `useFocusTimer` schedules the native alert at block start (alongside the web
  push) and cancels it on pause/reset. The web push remains for browser/PWA use.

## Upgrade path: bypass the mute switch (Critical Alerts)
If you need sound even on hardware-silent (true Garmin-style), switch
`content.interruptionLevel = .timeSensitive` to `.critical` and set
`content.sound = .defaultCritical`, then add the **Critical Alerts** entitlement
(`com.apple.developer.usernotifications.critical-alerts`). That entitlement
requires a paid Apple Developer account **and** Apple's approval via their
request form — granted for legitimate can't-miss use cases.
