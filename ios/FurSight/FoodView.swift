import SwiftUI
import UIKit

// Food check with the iPhone camera: point at a food or plant, one card per food, the safety list has the last word.
struct FoodView: View {
    @State private var camera = false
    @State private var photo: UIImage?
    @State private var items: [[String: Any]] = []
    @State private var checking = false
    @State private var error: String?

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
        }.card(c)
    }

    func check(_ img: UIImage) {
        photo = img; items = []; checking = true; error = nil
        let small = img.resized(1024)
        guard let jpeg = small.jpegData(compressionQuality: 0.8) else { return }
        let url = "data:image/jpeg;base64," + jpeg.base64EncodedString()
        Task {
            do {
                let me = try await API.hub("/me")
                let pet = me.arr("pets").first ?? [:]
                let r = try await API.server("api/food", ["image": url, "pet": ["name": pet.str("name"), "species": pet.str("species"), "breed": pet.str("breed"), "notes": pet.str("notes")]])
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
