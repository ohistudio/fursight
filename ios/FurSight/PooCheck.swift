import SwiftUI

// The daily poo check on Today: take a close photo of a few of his droppings, wherever he left them, or choose one. It goes to /api/droppings: SAM
// outlines the droppings, Muse Spark judges shape, size, colour and texture next to the last check's photo.
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
                Text(due ? "A close photo of a few of \(pet)'s droppings, wherever he left them, once a day. Small, misshapen or odd-coloured droppings are an early sign of gut trouble."
                         : "Today's is done. Check again any time.")
                    .font(.nunito(15, black: false)).foregroundStyle(Color.muted)
            }
            if busy {
                HStack(spacing: 10) { ProgressView(); Text("Looking at them, and comparing with the last check…").font(.nunito(14)).foregroundStyle(Color.muted) }
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
        return VStack(alignment: .leading, spacing: 10) {
            if let picture { Image(uiImage: picture).resizable().scaledToFit().clipShape(RoundedRectangle(cornerRadius: 14)) }
            HStack(spacing: 12) {
                VerdictBadge(verdict: v, size: 40)
                VStack(alignment: .leading, spacing: 0) {
                    Text("His droppings").font(.nunito(22))
                    Text(word).font(.nunito(15)).foregroundStyle(Color.verdict(v).0 == .sun ? Color(hex: 0xB87700) : Color.verdict(v).0)
                }
            }
            Text(r.str("summary")).font(.nunito(15, black: false)).foregroundStyle(Color.muted)
            HStack(alignment: .top, spacing: 8) {
                Pill(text: Self.trends[r.str("trend")] ?? "First check", status: r.str("trend") == "worse" ? "caution" : r.str("trend") == "better" ? "safe" : "other")
                Text(r.str("compare")).font(.nunito(14, black: false))
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
            let (v, word) = Self.words[r.str("verdict")] ?? ("caution", "Keep an eye on it")
            let boxes = r["boxes"] as? [[String: Any]] ?? []
            let title = "Poo check: " + word.lowercased(), line = (Self.trends[r.str("trend")] ?? "First check") + ". " + r.str("compare")
            picture = Self.ringed(small, boxes, Color.verdict(v).0, label: word, title: title, line: line)
            result = r
            // kept in the diary with the rings, for the next check to compare with
            var marks = boxes.map { b in ["b": ["x0", "y0", "x1", "y1"].map { Int(b.num($0) * 1000) }, "v": v] as [String: Any] }
            if !boxes.isEmpty {   // the group, labelled with the verdict
                let all = marks.compactMap { $0["b"] as? [Int] }
                marks.append(["b": [all.map { $0[0] }.min()!, all.map { $0[1] }.min()!, all.map { $0[2] }.max()!, all.map { $0[3] }.max()!], "v": v, "t": word])
            }
            let note = "\(r.str("summary")) \(r.str("compare"))"
            _ = try? await API.hub("/diary", method: "POST", body: ["kind": "droppings", "title": "Droppings check", "note": note, "verdict": v, "image": url, "pet": pet,
                                                                   "extra": ["count": r["count"] as? Int ?? 0, "verdict": r.str("verdict"), "trend": r.str("trend"), "size_spread": r["size_spread"] ?? 0, "marks": marks, "caption": ["title": title, "line": line, "v": v]]])
            checked()
        } catch { self.error = error.shown ?? "Couldn't check just now. Try again in a moment." }
    }

    // a rounded ring round each dropping (white under the verdict colour so it shows on any floor), the group
    // labelled with the verdict, and a strip along the bottom that says what was found: the picture tells the story
    private static func ringed(_ img: UIImage, _ boxes: [[String: Any]], _ colour: Color, label: String, title: String, line: String) -> UIImage {
        UIGraphicsImageRenderer(size: img.size).image { _ in
            img.draw(at: .zero)
            let W = img.size.width, H = img.size.height, lw = max(3, W / 200), ui = UIColor(colour)
            var group = CGRect.null
            for b in boxes {
                let r = CGRect(x: b.num("x0") * W, y: b.num("y0") * H, width: (b.num("x1") - b.num("x0")) * W, height: (b.num("y1") - b.num("y0")) * H).insetBy(dx: -lw, dy: -lw)
                group = group.union(r)
                let path = UIBezierPath(roundedRect: r, cornerRadius: lw * 3)
                UIColor.white.setStroke(); path.lineWidth = lw * 2.2; path.stroke()
                ui.setStroke(); path.lineWidth = lw; path.stroke()
            }
            let ink = colour == .sun ? UIColor(Color.ink) : .white
            if !group.isNull {
                let font = UIFont(name: "NunitoExtraLight-Black", size: lw * 5.5) ?? .systemFont(ofSize: lw * 5.5, weight: .black)
                let text = NSAttributedString(string: label, attributes: [.font: font, .foregroundColor: ink])
                let ts = text.size(), pw = ts.width + lw * 6, ph = lw * 9
                var y = group.minY - ph - lw * 1.5
                if y < lw { y = group.maxY + lw * 1.5 }
                let pill = CGRect(x: min(max(lw, group.midX - pw / 2), W - pw - lw), y: min(y, H - ph - lw), width: pw, height: ph)
                ui.setFill(); UIBezierPath(roundedRect: pill, cornerRadius: ph / 2).fill()
                text.draw(at: CGPoint(x: pill.minX + lw * 3, y: pill.midY - ts.height / 2))
            }
            // the story strip
            let pad = lw * 4
            let tf = UIFont(name: "NunitoExtraLight-Black", size: lw * 6.5) ?? .systemFont(ofSize: lw * 6.5, weight: .black)
            let lf = UIFont(name: "NunitoExtraLight-ExtraBold", size: lw * 4.6) ?? .systemFont(ofSize: lw * 4.6, weight: .bold)
            let t = NSAttributedString(string: title, attributes: [.font: tf, .foregroundColor: UIColor(Color.ink)])
            let l = NSAttributedString(string: line, attributes: [.font: lf, .foregroundColor: UIColor(Color.muted)])
            let lr = l.boundingRect(with: CGSize(width: W - pad * 2 - lw * 2, height: lf.lineHeight * 2.2), options: [.usesLineFragmentOrigin], context: nil)
            let h = pad * 2 + t.size().height + lr.height + lw
            UIColor.white.withAlphaComponent(0.93).setFill(); UIRectFill(CGRect(x: 0, y: H - h, width: W, height: h))
            ui.setFill(); UIRectFill(CGRect(x: 0, y: H - h, width: lw * 2.5, height: h))
            t.draw(at: CGPoint(x: pad + lw * 2, y: H - h + pad))
            l.draw(with: CGRect(x: pad + lw * 2, y: H - h + pad + t.size().height + lw, width: W - pad * 2 - lw * 2, height: lr.height), options: [.usesLineFragmentOrigin], context: nil)
        }
    }
}
