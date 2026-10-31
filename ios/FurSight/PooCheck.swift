import SwiftUI

// The daily poo check on Today: take a photo of the litter tray, or choose one. It goes to /api/droppings: SAM
// counts and outlines the droppings, Muse Spark judges size and shape next to the last check's photo and count.
// The answer comes back ringed on the photo, with how it compares with last time, and is kept in the diary (with
// the rings), so the web reminder, Quest and the next check all see it. It notices; the vet decides.
struct PooCard: View {
    let pet: String
    let due: Bool
    var checked: () -> Void

    @State private var picking: UIImagePickerController.SourceType?
    @State private var busy = false
    @State private var result: [String: Any]?
    @State private var picture: UIImage?
    @State private var error: String?

    private static let words = ["normal": ("safe", "Looks healthy"), "watch": ("caution", "Keep an eye on it"), "vet": ("vet", "See a vet today")]
    private static let trends = ["first": "First check", "better": "Better than last check", "same": "Same as last check", "worse": "Worse than last check"]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Poo check").font(.nunito(20))
                Spacer()
                Pill(text: due && result == nil ? "Due today" : "Done today", status: due && result == nil ? "caution" : "safe")
            }
            if let r = result { answer(r) } else {
                Text(due ? "A photo of \(pet)'s litter tray, once a day. Fewer, smaller or misshapen droppings are an early sign of gut trouble."
                         : "Today's is done. Check again any time.")
                    .font(.nunito(15, black: false)).foregroundStyle(Color.muted)
            }
            if busy {
                HStack(spacing: 10) { ProgressView(); Text("Counting, and comparing with the last check…").font(.nunito(14)).foregroundStyle(Color.muted) }
            } else {
                HStack(spacing: 10) {
                    Button { picking = UIImagePickerController.isSourceTypeAvailable(.camera) ? .camera : .photoLibrary } label: { Label("Take a photo", systemImage: "camera.fill") }
                        .buttonStyle(ChunkyButton(color: due && result == nil ? .sun : .white, lip: due && result == nil ? .sunLip : .line))
                    Button { picking = .photoLibrary } label: { Label("Choose a photo", systemImage: "photo.on.rectangle") }
                        .buttonStyle(ChunkyButton(color: .white, lip: .line))
                }
            }
            if let error { Text(error).font(.nunito(14, black: false)).foregroundStyle(Color.coral) }
        }
        .card(due && result == nil ? .sun : .line)
        .fullScreenCover(isPresented: Binding(get: { picking != nil }, set: { if !$0 { picking = nil } })) {
            CameraPicker(source: picking ?? .photoLibrary) { img in
                picking = nil
                if let img { Task { await check(img) } }
            }.ignoresSafeArea()
        }
    }

    private func answer(_ r: [String: Any]) -> some View {
        let (v, word) = Self.words[r.str("verdict")] ?? ("caution", "Keep an eye on it")
        let prev = (r["previous"] as? [[String: Any]])?.first?["count"] as? Int
        return VStack(alignment: .leading, spacing: 10) {
            if let picture { Image(uiImage: picture).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 14)) }
            HStack(spacing: 12) {
                VerdictBadge(verdict: v, size: 40)
                VStack(alignment: .leading, spacing: 0) {
                    Text("\(r["count"] as? Int ?? 0) found").font(.nunito(22))
                    Text(word).font(.nunito(15)).foregroundStyle(Color.verdict(v).0 == .sun ? Color(hex: 0xB87700) : Color.verdict(v).0)
                }
            }
            Text(r.str("summary")).font(.nunito(15, black: false)).foregroundStyle(Color.muted)
            HStack(alignment: .top, spacing: 8) {
                Pill(text: Self.trends[r.str("trend")] ?? "First check", status: r.str("trend") == "worse" ? "caution" : r.str("trend") == "better" ? "safe" : "other")
                Text(r.str("compare") + (prev.map { " (last time \($0))" } ?? "")).font(.nunito(14, black: false))
            }
            Text("It notices; the vet decides. No droppings for 12 hours is a vet call.").font(.nunito(12, black: false)).foregroundStyle(Color.muted)
        }
    }

    private func check(_ img: UIImage) async {
        busy = true; error = nil
        defer { busy = false }
        let small = img.resized(1024)
        guard let jpeg = small.jpegData(compressionQuality: 0.8) else { return }
        let url = "data:image/jpeg;base64," + jpeg.base64EncodedString()
        do {
            let r = try await API.server("api/droppings", ["image": url])
            let (v, _) = Self.words[r.str("verdict")] ?? ("caution", "")
            let boxes = r["boxes"] as? [[String: Any]] ?? []
            picture = Self.ringed(small, boxes, Color.verdict(v).0)
            result = r
            // kept in the diary with the rings, for the next check to compare with
            let marks = boxes.map { b in ["b": ["x0", "y0", "x1", "y1"].map { Int(b.num($0) * 1000) }, "v": v] as [String: Any] }
            let note = "\(r["count"] as? Int ?? 0) found. \(r.str("summary")) \(r.str("compare"))"
            _ = try? await API.hub("/diary", method: "POST", body: ["kind": "droppings", "title": "Droppings check", "note": note, "verdict": v, "image": url, "pet": pet,
                                                                   "extra": ["count": r["count"] as? Int ?? 0, "verdict": r.str("verdict"), "trend": r.str("trend"), "size_spread": r["size_spread"] ?? 0, "marks": marks]])
            checked()
        } catch { self.error = error.shown ?? "Couldn't check just now. Try again in a moment." }
    }

    // a rounded ring round each dropping, white under the verdict colour so it shows on any litter
    private static func ringed(_ img: UIImage, _ boxes: [[String: Any]], _ colour: Color) -> UIImage {
        UIGraphicsImageRenderer(size: img.size).image { ctx in
            img.draw(at: .zero)
            let lw = max(3, img.size.width / 200), ui = UIColor(colour)
            for b in boxes {
                let r = CGRect(x: b.num("x0") * img.size.width, y: b.num("y0") * img.size.height,
                               width: (b.num("x1") - b.num("x0")) * img.size.width, height: (b.num("y1") - b.num("y0")) * img.size.height).insetBy(dx: -lw, dy: -lw)
                let path = UIBezierPath(roundedRect: r, cornerRadius: lw * 3)
                UIColor.white.setStroke(); path.lineWidth = lw * 2.2; path.stroke()
                ui.setStroke(); path.lineWidth = lw; path.stroke()
            }
            _ = ctx
        }
    }
}
