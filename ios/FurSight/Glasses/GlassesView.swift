import MWDATCore
import SwiftUI

// The Glasses tab: connect FurSight to Meta AI (once), then start the glasses. While they're on, Food check
// uses the glasses camera and the verdict shows on the lens. Developer Mode in the Meta AI app is enough;
// no registered app ID is needed yet (the IDs in project.yml are placeholders, like Lisso's).
struct GlassesView: View {
    @State var wearables: WearablesViewModel
    var glasses = GlassesManager.shared

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 12) {
                        Image(systemName: "eyeglasses").font(.system(size: 34, weight: .bold)).foregroundStyle(Color.grapeLip)
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Ray-Ban Display").font(.nunito(24)).foregroundStyle(Color.ink)
                            Text(wearables.registrationLabel).font(.nunito(15, black: false)).foregroundStyle(Color.muted)
                        }
                    }

                    // 1. connect to Meta AI
                    VStack(alignment: .leading, spacing: 10) {
                        Text("1. Connect to Meta AI").font(.nunito(18)).foregroundStyle(Color.ink)
                        Text("Opens the Meta AI app to let FurSight use your glasses. Turn on Developer Mode there first.")
                            .font(.nunito(14, black: false)).foregroundStyle(Color.muted)
                        if wearables.registrationState == .registered {
                            Label(wearables.deviceNames.isEmpty ? "Connected" : "Connected: " + wearables.deviceNames.joined(separator: ", "), systemImage: "checkmark.circle.fill")
                                .font(.nunito(15)).foregroundStyle(Color.fernLip)
                            Button("Disconnect") { Task { await wearables.disconnectGlasses() } }.buttonStyle(ChunkyButton(color: .white, lip: .line))
                        } else {
                            Button(wearables.registrationState == .registering ? "Connecting…" : "Connect glasses") { Task { await wearables.connectGlasses() } }
                                .buttonStyle(ChunkyButton(color: .grape, lip: .grapeLip)).disabled(wearables.registrationState == .registering)
                        }
                    }.card()

                    // 2. start them
                    VStack(alignment: .leading, spacing: 10) {
                        Text("2. Start the glasses").font(.nunito(18)).foregroundStyle(Color.ink)
                        Text("The lens shows \"Can \(FoodCheck.petName) eat this?\". Hold the food up, look at it and press it, or use Check this in Food check.")
                            .font(.nunito(14, black: false)).foregroundStyle(Color.muted)
                        switch glasses.phase {
                        case .idle:
                            Button("Start glasses") { Task { await glasses.start() } }.buttonStyle(ChunkyButton())
                                .disabled(wearables.registrationState != .registered)
                        case .starting:
                            HStack(spacing: 10) { ProgressView(); Text("Starting… the first time can take a while").font(.nunito(15)).foregroundStyle(Color.ink) }
                        case .ready, .checking:
                            if let f = glasses.currentFrame {
                                Image(uiImage: f).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 14)).frame(maxHeight: 260)
                            }
                            Text("Camera: \(glasses.streamStateLabel) · Display: \(glasses.displayStatus)").font(.nunito(13, black: false)).foregroundStyle(Color.muted)
                            Button("Can \(FoodCheck.petName) eat this?") { glasses.check() }.buttonStyle(ChunkyButton()).disabled(glasses.phase == .checking)
                            Button("Stop glasses") { glasses.stop() }.buttonStyle(ChunkyButton(color: .white, lip: .line))
                        }
                        if glasses.requiresDATAppUpdate {
                            Button("Update the app on the glasses") { glasses.openDATGlassesAppUpdate() }.buttonStyle(ChunkyButton(color: .sun, lip: .sunLip))
                        }
                        if let e = glasses.errorMessage { Text(e).font(.nunito(14, black: false)).foregroundStyle(Color.coralLip) }
                    }.card()

                    Text("Keep FurSight open on the phone while you use the glasses: iOS pauses apps in the background, and the glasses stop with it.")
                        .font(.nunito(13, black: false)).foregroundStyle(Color.muted)
                }.padding(16)
            }
            .background(Color.page.ignoresSafeArea())
            .alert("Glasses", isPresented: $wearables.showError) { Button("OK") { wearables.dismissError() } } message: { Text(wearables.errorMessage) }
        }
    }
}
