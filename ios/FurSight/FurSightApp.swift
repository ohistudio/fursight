import SwiftUI
import UserNotifications

// FurSight for iPhone: today at a glance, ask, food checks with the camera, the full app for everything else,
// and notifications (a flop, a litter tray change, a "don't" or "see a vet") sent by the hub through Apple.
@main
struct FurSightApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var session = Session.shared

    var body: some Scene {
        WindowGroup {
            Group {
                if session.linked { MainView() } else { LinkView() }
            }
            .environmentObject(session)
            .tint(.grape)
        }
    }
}

final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ app: UIApplication, didFinishLaunchingWithOptions _: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { ok, _ in
            if ok { DispatchQueue.main.async { app.registerForRemoteNotifications() } }
        }
        return true
    }
    func application(_: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
        let hex = token.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in Session.shared.pushToken = hex; await Session.shared.sendPushToken() }
    }
    func application(_: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[FurSight] push registration failed:", error.localizedDescription)
    }
    // show notifications while the app is open too, and refresh Today
    func userNotificationCenter(_: UNUserNotificationCenter, willPresent _: UNNotification) async -> UNNotificationPresentationOptions {
        await MainActor.run { NotificationCenter.default.post(name: .fursightRefresh, object: nil) }
        return [.banner, .sound, .list]
    }
}

extension Notification.Name { static let fursightRefresh = Notification.Name("fursight.refresh") }

struct MainView: View {
    var body: some View {
        TabView {
            TodayView().tabItem { Label("Today", systemImage: "sun.max.fill") }
            AskView().tabItem { Label("Ask", systemImage: "bubble.left.and.text.bubble.right.fill") }
            FoodView().tabItem { Label("Food check", systemImage: "camera.fill") }
            WebTab().tabItem { Label("More", systemImage: "square.grid.2x2.fill") }
        }
    }
}

// Linking: the phone shows a code, you enter it in FurSight on a device that's already linked (Devices tab).
struct LinkView: View {
    @EnvironmentObject var session: Session
    @State private var code = "····"
    @State private var error: String?

    var body: some View {
        VStack(spacing: 18) {
            Spacer()
            Bean(mood: "idle", size: 150)
            Text("FurSight").font(.nunito(34))
            Text("Rabbits hide illness. FurSight notices.\nIt notices, your vet decides.").font(.nunito(16, black: false)).foregroundStyle(Color.muted).multilineTextAlignment(.center)
            VStack(spacing: 8) {
                Text("LINK THIS PHONE").font(.nunito(13)).foregroundStyle(Color.muted).kerning(1)
                Text(code).font(.nunito(64)).kerning(8).foregroundStyle(Color.fern).monospacedDigit()
                Text("Open FurSight on a device that's already linked, go to Devices and enter this code.").font(.nunito(15, black: false)).foregroundStyle(Color.muted).multilineTextAlignment(.center)
            }.card()
            if let error { Text(error).font(.nunito(14, black: false)).foregroundStyle(Color.coral) }
            Spacer()
        }
        .padding(20).background(Color.page.ignoresSafeArea())
        .task { await link() }
    }

    func link() async {
        while !session.linked {
            do {
                let s = try await API.hub("/link/start", method: "POST", body: ["kind": "phone", "name": "iPhone"])
                code = s.str("code")
                let nonce = s.str("nonce")
                while !session.linked {
                    try await Task.sleep(for: .seconds(1.8))
                    let p = try await API.hub("/link/poll?code=\(code)&nonce=\(nonce)")
                    if p.str("status") == "expired" { break }
                    if p.str("status") == "linked" { session.link(p.str("token")); return }
                }
            } catch { self.error = error.localizedDescription; try? await Task.sleep(for: .seconds(3)) }
        }
    }
}
