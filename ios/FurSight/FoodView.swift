import SwiftUI
import UIKit

// Food check with the iPhone camera: point at a food or plant, one card per food, the safety list has the last word.
struct FoodView: View {
    @State private var camera = false
    @State private var photo: UIImage?
    @State private var items: [[String: Any]] = []
    @State private var checking = false
    @State private var error: String?
    @State private var petName = "him"
    @State private var fed: [String: String] = [:]      // food -> what saving "We fed him this" said
    @State private var feeding: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 12) {
                        Bean(mood: checking ? "thinking" : mood, size: 72)
                        Text("Can he eat this?").font(.nunito(26))
                    }
                    if let photo { Image(uiImage: photo).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 16)) }
                    Button(photo == nil ? "Take a photo" : "Check something else") { camera = true }.buttonStyle(ChunkyButton())
                    if checking { Text("Checking against his safety list…").font(.nunito(15, black: false)).foregroundStyle(Color.muted) }
                    if let error { Text(error).font(.nunito(15, black: false)).foregroundStyle(Color.coral) }
                    ForEach(Array(items.enumerated()), id: \.offset) { _, i in card(i) }
                }.padding(16)
            }
            .background(Color.page.ignoresSafeArea())
            .fullScreenCover(isPresented: $camera) { CameraPicker { img in camera = false; if let img { check(img) } }.ignoresSafeArea() }
        }
    }

    private var mood: String {
        let v = items.map { $0.str("verdict") }
        return v.contains("toxic") ? "toxic" : v.contains("caution") ? "caution" : v.isEmpty ? "idle" : "safe"
    }

    private func card(_ i: [String: Any]) -> some View {
        let v = i.str("verdict"), (c, _) = Color.verdict(v)
        return VStack(alignment: .leading, spacing: 6) {
            Text(i.str("food").capitalized).font(.nunito(22))
            Text(["safe": "Safe", "caution": "Small treat only", "toxic": "Don't"][v] ?? v).font(.nunito(15)).foregroundStyle(c)
            Text(i.str("reason")).font(.nunito(15, black: false))
            if !i.str("portion").isEmpty { Text("How much: " + i.str("portion")).font(.nunito(14, black: false)).foregroundStyle(Color.muted) }
            if !i.str("instead").isEmpty { Text("Instead: " + i.str("instead")).font(.nunito(14, black: false)).foregroundStyle(Color.muted) }
            // when he last had it, and whether to wait (from "We fed him this" and notes)
            if let had = i["fed"] as? [String: Any], !had.str("said").isEmpty {
                Label(had.str("said"), systemImage: (had["wait_left"] as? Int ?? 0) > 0 ? "calendar.badge.clock" : "clock")
                    .font(.nunito(14)).foregroundStyle((had["wait_left"] as? Int ?? 0) > 0 ? Color.sunLip : Color.muted)
            }
            if v != "toxic" {
                if let done = fed[i.str("food")] {
                    Label(done, systemImage: "checkmark.circle.fill").font(.nunito(14)).foregroundStyle(Color.fern)
                } else {
                    Button(feeding == i.str("food") ? "Marking…" : "We fed \(petName) this") { Task { await markFed(i) } }
                        .buttonStyle(ChunkyButton(color: .fern, lip: .fernLip)).disabled(feeding != nil)
                }
            }
        }.card(c)
    }

    // saved with when he can have it again; that day goes on the calendar
    func markFed(_ i: [String: Any]) async {
        let food = i.str("food")
        feeding = food; defer { feeding = nil }
        do {
            let r = try await API.server("api/fed", ["food": food, "verdict": i.str("verdict"), "wait_days": i["wait_days"] as? Int ?? 3, "tz": TimeZone.current.secondsFromGMT() / 60])
            fed[food] = r.str("said")
        } catch { self.error = error.localizedDescription }
    }

    func check(_ img: UIImage) {
        photo = img; items = []; fed = [:]; checking = true; error = nil
        let small = img.resized(1024)
        guard let jpeg = small.jpegData(compressionQuality: 0.8) else { return }
        let url = "data:image/jpeg;base64," + jpeg.base64EncodedString()
        Task {
            do {
                let me = try await API.hub("/me")
                let pet = me.arr("pets").first ?? [:]
                if !pet.str("name").isEmpty { petName = pet.str("name") }
                let r = try await API.server("api/food", ["image": url, "pet": ["name": pet.str("name"), "species": pet.str("species"), "breed": pet.str("breed"), "notes": pet.str("notes")], "tz": TimeZone.current.secondsFromGMT() / 60])
                items = r.arr("items")
                for i in items {
                    _ = try? await API.hub("/diary", method: "POST", body: ["kind": "food", "title": i.str("food").capitalized, "note": i.str("reason"), "verdict": i.str("verdict"), "image": url])
                }
            } catch { self.error = error.localizedDescription }
            checking = false
        }
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    var done: (UIImage?) -> Void
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary   // the simulator has no camera
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_: UIImagePickerController, context _: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(done) }
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let done: (UIImage?) -> Void
        init(_ done: @escaping (UIImage?) -> Void) { self.done = done }
        func imagePickerController(_: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) { done(info[.originalImage] as? UIImage) }
        func imagePickerControllerDidCancel(_: UIImagePickerController) { done(nil) }
    }
}

extension UIImage {
    func resized(_ maxSide: CGFloat) -> UIImage {
        let s = min(1, maxSide / max(size.width, size.height))
        guard s < 1 else { return self }
        let target = CGSize(width: size.width * s, height: size.height * s)
        return UIGraphicsImageRenderer(size: target).image { _ in draw(in: CGRect(origin: .zero, size: target)) }
    }
}
