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
- macOS with **Xcode 26.0+** and Command Line Tools. Capacitor 8 requires it;
  older Xcode will not build the project.
- **CocoaPods** (`sudo gem install cocoapods`) **only if you take the CocoaPods
  path in step 1** — the default no longer needs it.
- A free Apple ID is enough to run on your own device (7-day signing); a paid
  Apple Developer account ($99/yr) for TestFlight / long-lived installs.

## 1. Generate the iOS project
Deps are already in `package.json`. From the repo root:

```bash
npm install
npx cap add ios          # creates the ios/ native project (Swift Package Manager)
```

**Capacitor 8 creates an SPM project, not a CocoaPods one.** So there is no
`Podfile` and no `.xcworkspace` — `ios/App/App.xcodeproj` is what opens. If you
want the CocoaPods layout instead (and the `Podfile` the rest of this file used
to assume), ask for it explicitly:

```bash
npx cap add ios --packagemanager CocoaPods
```

Either way, set the **iOS Deployment Target to 15.0** — Capacitor 8's minimum —
on the project *and* on the App target. On the CocoaPods path also set
`platform :ios, '15.0'` in `ios/App/Podfile`.

Confirm `capacitor.config.ts` `server.url` points at **your** deployed domain.

**Re-sync after adding a plugin.** `@capacitor/clipboard` (Notes' Copy and
"Paste as new note") is native code, so it reaches the app only through
`npx cap sync ios` and a rebuild. Until then the web side — which ships with
every deploy, since the shell loads `server.url` — finds `isNativePlatform()`
true but the plugin unimplemented, and falls back to `navigator.clipboard`
(`src/features/notes/lib/clipboard.ts`). So nothing breaks in between; the
native path simply isn't used yet.

## 2. Add the custom `TimerAlert` plugin
> **Untested against Capacitor 8.** The Swift and Objective-C below were written
> for Capacitor 6 and nothing in this repo compiles them — there is no `ios/`
> directory in git and no macOS runner in CI, so the first person to run this on
> a Mac is the test. The 8.0 release notes list one `@capacitor/ios` breaking
> change, to `CAPBridgeViewController`'s `viewDidAppear` / `viewWillTransition`
> notifications, which this plugin does not use; `CAPPlugin`, `CAPPluginCall` and
> `CAP_PLUGIN_METHOD` are unchanged. So it *should* build as-is. If it doesn't,
> fix it here so the next person inherits the fix.

> **Try the official plugin first.** This custom plugin exists to set
> `content.interruptionLevel = .timeSensitive`, and `@capacitor/local-notifications`
> **8.1.0** added exactly that as a first-class option
> (`interruptionLevel: 'active' | 'critical' | 'passive' | 'timeSensitive'`). The Swift
> below predates it. So before writing any of it, try
> `npm i @capacitor/local-notifications` and the plugin's `schedule()` with
> `interruptionLevel: 'timeSensitive'` — if that works, everything in this section goes
> away. (The package was a dependency here until it was dropped as unused; nothing ever
> imported it, because this plugin was written instead.)

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
Open the project: `npx cap open ios` (the `.xcodeproj` on the SPM default, the
`.xcworkspace` if you chose CocoaPods). Then in Xcode:

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

## App Review (Guideline 4.2): what's done in the web app, and what's left

Apple rejects "a website in a box", and reviewers test **Airplane Mode**. See
`ANALYSIS-MOBILE-APP-STRATEGY.md` §1 for the checklist; this is where each item stands.
Nothing below can be built or checked from a Linux box — the native steps need a Mac,
Xcode, and (for TestFlight / the Store) a paid Apple Developer account — so the web side
is tested here and the native side is a checklist for the first person on a Mac.

**Offline shell — web side done.** `capacitor.config.ts` sets `server.errorPath:
"offline.html"`, so when the live site can't load the webview shows the bundled
`public/offline.html` (it is in `webDir`, so `cap sync` copies it in) instead of a blank
error. That page's *Try again* goes back to the live site when it is running from the app
(a bare `location.reload()` would just reload the local page). `src/lib/capacitorShell.test.ts`
keeps the page's address equal to `server.url`. To verify on a device: `npx cap sync ios`,
run, enable Airplane Mode, relaunch — you should see "You're offline", and *Try again* with
the connection back should load the app. (A service worker can't do this job here: WKWebView
only runs one for app-bound domains.) Note this is an *offline message*, not offline use of
the app; the app's data is local-first, but its pages still come from the network.

**On-device date reminders — web side done, needs `npx cap sync ios`.**
`@capacitor/local-notifications` is a dependency again (see the Dependency note in
`CLAUDE.md`). In the app, *My Stuff → Reminders → "Remind me on this phone"* schedules a
9:00 notification for each dated thing — 2 weeks before a warranty ends, 3 days before a
use-by or renewal, the day before upkeep, the day a loan is due — through the plugin, with no
server and weeks ahead (web push is capped at a day). The plan is pure and tested
(`features/inventory/lib/localReminders.ts`); `lib/nativeReminders.ts` is the thin adapter and
is a no-op on the plain web. Until the app is rebuilt with the plugin the toggle simply
fails to schedule (every call is guarded); permission is asked from the tap, and a PIN-locked
My Stuff keeps names off the notification. On a Mac: `npm i`, `npx cap sync ios`, run, turn
the toggle on, add an item whose use-by is 3 days away plus a minute (or temporarily change
`REMINDER_HOUR`) and background the app. **Not yet exercised on a device.**

**Not done — needs native work and a device to verify:**
- **Native barcode scanning** (`@capacitor-mlkit/barcode-scanning`): faster than the
  ZXing-WASM path in `lib/barcodeEngine.ts`. Left out deliberately: it is a heavy native
  dependency with its own iOS minimum and camera-usage string, and I couldn't build or
  test it. Add it behind the same "native if present, else web" pattern as the clipboard.
- **Share extension / Home-screen quick actions** (Swift).
- **Try the official plugin for the timer too:** `@capacitor/local-notifications` is now
  installed, so §2's custom `TimerAlert` can probably be replaced with `schedule()` +
  `interruptionLevel: 'timeSensitive'` (8.1.0+), as the note there says.
- **Android / Google Play** — `npx cap add android`, Android Studio, a $25 Play account;
  the strategy doc recommends doing it first as the dress rehearsal.
- **Store listing itself**: App Store Connect record, screenshots, privacy "nutrition
  label" (the privacy page is the source), review notes explaining the native features.
