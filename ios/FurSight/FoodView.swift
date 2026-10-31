import AVFoundation
import SwiftUI
import UIKit

// Check: food, something he could chew, or him. Muse Spark works out which ("Check as" below the answer puts it
// right in one tap). The camera fills the screen; tap anywhere (or the button) and the picture holds still while
// FurSight checks it. Each food gets a label pinned on it, like the Quest cards: the verdict badge, what it thinks
// the food is, and the verdict in its colour. Tap a label for the details: why, how much, when he last had it, and
// "We fed him this", which puts the day it's OK again on the calendar. The safety list has the last word.
// With the glasses on (Glasses tab), the picture is the glasses camera and the verdict shows on the lens too;
// a check started from the lens shows up here with its labels.
struct FoodView: View {
    @StateObject private var camera = CameraFeed()
    private var glasses = GlassesManager.shared
    private var onGlasses: Bool { glasses.phase == .ready || glasses.phase == .checking }
    @State private var still: UIImage?                 // the frame being checked (the screen holds it)
    @State private var items: [[String: Any]] = []
    @State private var selected = 0
    @State private var checking = false
    @State private var error: String?
    @State private var petName = "him"
    @State private var fed: [String: String] = [:]      // food -> what saving "We fed him this" said
    @State private var feeding: String?
    @State private var picking = false
    @State private var seen: String?                   // him: what he's doing, and what to look at closer
    @State private var options: [[String: Any]] = []
    @State private var look: [String: Any]?
    @State private var looking = false
    @State private var photo = ""                      // the checked frame, for a closer look at him
    @State private var mode = "auto"                   // what it is, if you say so before the photo: auto, food, room, pet

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black.ignoresSafeArea()
                if let still { Image(uiImage: still).resizable().scaledToFill().frame(width: geo.size.width, height: geo.size.height).clipped() }
                else if onGlasses {
                    if let f = glasses.currentFrame { Image(uiImage: f).resizable().scaledToFill().frame(width: geo.size.width, height: geo.size.height).clipped() }
                    else { Text("Waiting for the glasses camera…").font(.nunito(16)).foregroundStyle(.white) }
                }
                else if camera.available { CameraPreview(session: camera.session).ignoresSafeArea() }
                else { noCamera }

                // the labels, pinned where each food is in the picture
                // a few things: a full label on each, pushed apart so none covers another. Many (a room): a numbered
                // dot on each, and the full label only on the one you've tapped (its details are below)
                if let still, !checking {
                    let spots = places(still.size, geo.size)
                    let compact = items.count > 3
                    ForEach(Array(items.enumerated()), id: \.offset) { n, it in
                        if let p = spots[n] {
                            Group {
                                if compact && n != selected { NumberDot(n: n + 1, verdict: it.str("verdict")) }
                                else { FoodTag(item: it, on: n == selected) }
                            }
                            .position(x: p.x, y: p.y)
                            .zIndex(n == selected ? 1 : 0)
                            .onTapGesture { withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) { selected = n } }
                            .transition(.scale(scale: 0.2).combined(with: .opacity))
                        }
                    }
                }

                VStack(spacing: 12) {
                    header
                    Spacer()
                    if checking { checkingPill }
                    if let error { Text(error).font(.nunito(15)).foregroundStyle(Color.ink).padding(12).background(RoundedRectangle(cornerRadius: 14).fill(.white)) }
                    // the answer scrolls in its own space, so the buttons under it never cover it
                    if still != nil, !checking, items.indices.contains(selected) || seen != nil {
                        ScrollView {
                            if items.indices.contains(selected) { details(items[selected]) }
                            if let seen { petCard(seen) }
                        }
                        .frame(maxHeight: geo.size.height * 0.42)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                    if still != nil, !checking, items.isEmpty, error == nil, seen == nil {
                        Text("Nothing to check there. Try again, or say what it is below.").font(.nunito(15)).foregroundStyle(Color.ink)
                            .padding(14).frame(maxWidth: .infinity).background(RoundedRectangle(cornerRadius: 16).fill(.white))
                    }
                    // couldn't tell what it was: say, and the same photo is checked again as that
                    if still != nil, !checking, items.isEmpty, seen == nil { checkAs }
                    if still == nil { modes }
                    controls
                }
                .padding(16)
            }
            .contentShape(Rectangle())
            .onTapGesture { if still == nil { snap() } }   // tap the live picture to check it
        }
        .onAppear {
            if !onGlasses { camera.start() }
            Task { await FoodCheck.loadPet(); petName = FoodCheck.petName }   // the pet ahead of the first check
        }
        .onDisappear { camera.stop() }
        .onChange(of: onGlasses) { _, on in if on { camera.stop() } else { camera.start() } }
        // a check made from the lens: show it here with its labels
        .onChange(of: glasses.results) { _, _ in if let r = glasses.lastResult { show(r) } }
        .fullScreenCover(isPresented: $picking) { CameraPicker { img in picking = false; if let img { check(img, as: mode == "auto" ? nil : mode) } }.ignoresSafeArea() }
    }

    // ---------------------------------------------------------------- pieces

    private var header: some View {
        HStack(spacing: 10) {
            Bean(mood: checking ? "thinking" : mood, size: 52)
            VStack(alignment: .leading, spacing: 0) {
                Text("Check").font(.nunito(22)).foregroundStyle(Color.ink)
                Text("Food, a chew risk, or \(petName)").font(.nunito(13)).foregroundStyle(Color.muted)
                if onGlasses { Label("Glasses camera", systemImage: "eyeglasses").font(.nunito(13)).foregroundStyle(Color.grapeLip) }
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 20).fill(.white.opacity(0.94)))
    }

    private var checkingPill: some View {
        HStack(spacing: 10) {
            ProgressView().tint(Color.sky)
            Text("Checking…").font(.nunito(15)).foregroundStyle(Color.ink)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(Capsule().fill(.white))
    }

    private var controls: some View {
        HStack(spacing: 10) {
            if still == nil {
                Button { snap() } label: { Label("Check this", systemImage: onGlasses ? "eyeglasses" : "camera.viewfinder") }.buttonStyle(ChunkyButton())
                    .disabled(onGlasses ? glasses.currentFrame == nil : !camera.available)
                Button { picking = true } label: { Image(systemName: "photo.on.rectangle") }
                    .buttonStyle(ChunkyButton(color: .white, lip: .line)).frame(width: 64)
            } else if !checking {
                Button { reset() } label: { Label("Check something else", systemImage: "arrow.counterclockwise") }.buttonStyle(ChunkyButton(color: .sky, lip: .skyLip))
            }
        }
    }

    private var noCamera: some View {
        VStack(spacing: 12) {
            Image(systemName: "camera.fill").font(.system(size: 40)).foregroundStyle(.white.opacity(0.7))
            Text(camera.denied ? "Camera access is off. Turn it on in Settings, or pick a photo." : "No camera here. Pick a photo instead.")
                .font(.nunito(16)).foregroundStyle(.white).multilineTextAlignment(.center).padding(.horizontal, 40)
        }
    }

    // the card for the selected food: why, how much, when he last had it, and "We fed him this"
    private func details(_ i: [String: Any]) -> some View {
        let v = i.str("verdict"), (c, _) = Color.verdict(v)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 10) {
                VerdictBadge(verdict: v, size: 34)
                VStack(alignment: .leading, spacing: 0) {
                    Text((items.count > 3 ? "\((items.firstIndex { $0.str("food") == i.str("food") } ?? 0) + 1)  " : "") + i.str("food").capitalized).font(.nunito(21)).foregroundStyle(Color.ink)
                    Text(word(i)).font(.nunito(15)).foregroundStyle(v == "caution" ? Color.sunLip : v == "safe" ? Color.fernLip : c)
                }
            }
            Text(i.str("reason")).font(.nunito(15, black: false)).foregroundStyle(Color.ink)
            if !i.str("fix").isEmpty { Text("Fix: " + i.str("fix")).font(.nunito(14, black: false)).foregroundStyle(Color.muted) }
            if !i.str("label").isEmpty { Label("Label: " + i.str("label"), systemImage: "text.viewfinder").font(.nunito(14, black: false)).foregroundStyle(Color.muted) }
            if v == "caution", !i.str("portion").isEmpty, i.str("portion") != "none" { Text("How much: " + i.str("portion")).font(.nunito(14, black: false)).foregroundStyle(Color.muted) }
            if v == "toxic", !i.str("instead").isEmpty { Text("Instead: " + i.str("instead")).font(.nunito(14, black: false)).foregroundStyle(Color.muted) }
            if let had = i["fed"] as? [String: Any], !had.str("said").isEmpty {
                let wait = (had["wait_left"] as? Int ?? 0) > 0
                Label(had.str("said"), systemImage: wait ? "calendar.badge.clock" : "clock")
                    .font(.nunito(14)).foregroundStyle(wait ? Color.sunLip : Color.muted)
            }
            if v != "toxic", i.str("kind") != "thing" {
                if let done = fed[i.str("food")] {
                    Label(done, systemImage: "checkmark.circle.fill").font(.nunito(14)).foregroundStyle(Color.fernLip)
                } else {
                    Button(feeding == i.str("food") ? "Marking…" : "We fed \(petName) this") { Task { await markFed(i) } }
                        .buttonStyle(ChunkyButton()).disabled(feeding != nil).padding(.top, 4)
                }
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20).fill(.white))
        .background(RoundedRectangle(cornerRadius: 20).fill(c).offset(y: 5))
        .padding(.bottom, 5)
    }

    private var mood: String {
        let v = items.map { $0.str("verdict") }
        return v.contains("toxic") ? "toxic" : v.contains("caution") ? "caution" : v.isEmpty ? "idle" : "safe"
    }

    // every label's place, kept apart: each starts at its box, then moves down past any already placed that it
    // would overlap (a full label is about 190 x 64 points; a numbered dot about 40)
    private func places(_ image: CGSize, _ view: CGSize) -> [CGPoint?] {
        let compact = items.count > 3
        var out = [CGPoint?](repeating: nil, count: items.count), taken: [CGRect] = []
        let order = items.indices.sorted { (anchor(items[$0], image: image, view: view)?.y ?? 0) < (anchor(items[$1], image: image, view: view)?.y ?? 0) }
        for n in order {
            guard var p = anchor(items[n], image: image, view: view) else { continue }
            let size = compact && n != selected ? CGSize(width: 40, height: 40) : CGSize(width: 190, height: 64)
            var r = CGRect(x: p.x - size.width / 2, y: p.y - size.height / 2, width: size.width, height: size.height)
            for _ in 0..<12 where taken.contains(where: { $0.intersects(r) }) { r.origin.y += size.height * 0.6 + 6 }
            p.y = r.midY
            taken.append(r)
            out[n] = p
        }
        return out
    }

    // where a food's label goes: the top middle of its box (0-1000 grid), on a picture that fills the screen
    private func anchor(_ it: [String: Any], image: CGSize, view: CGSize) -> CGPoint? {
        guard let b = it["box"] as? [Any], b.count == 4 else { return nil }
        let n = b.map { ($0 as? NSNumber)?.doubleValue ?? 0 }
        let s = max(view.width / image.width, view.height / image.height)
        let ox = (view.width - image.width * s) / 2, oy = (view.height - image.height * s) / 2
        let x = (n[0] + n[2]) / 2 / 1000 * image.width * s + ox
        let y = n[1] / 1000 * image.height * s + oy
        // keep it on screen, clear of the header and the details card
        return CGPoint(x: min(max(x, 90), view.width - 90), y: min(max(y - 34, 120), view.height * 0.55))
    }

    // ---------------------------------------------------------------- checking

    private func snap() {
        guard !checking, let img = onGlasses ? glasses.currentFrame : camera.frame() else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        check(img, as: mode == "auto" ? nil : mode)
    }

    private func reset() { withAnimation { still = nil; items = []; fed = [:]; error = nil; selected = 0; seen = nil; options = []; look = nil } }

    func check(_ img: UIImage, as kind: String? = nil) {
        still = img; items = []; fed = [:]; checking = true; error = nil; selected = 0; seen = nil; options = []; look = nil
        Task {
            do {
                switch try await FoodCheck.check(img, as: kind) {
                case .food(let r):
                    show(r)
                    if onGlasses { await glasses.showVerdict(r) }   // the lens shows the food being held
                case .object(let things):
                    withAnimation(.spring(response: 0.35, dampingFraction: 0.65)) { items = things.map(thing); selected = 0 }
                    UINotificationFeedbackGenerator().notificationOccurred(things.contains { $0.str("risk") == "high" } ? .error : .warning)
                case .pet(let s, let o, let p):
                    withAnimation { seen = s; options = o; photo = p }
                case .none(let says):
                    error = says
                }
                petName = FoodCheck.petName
            } catch { if let m = error.shown { self.error = m } }
            checking = false
        }
    }

    // a thing he could chew, as a label like a food's: its risk in the verdict colours, the fix in the details
    private func thing(_ t: [String: Any]) -> [String: Any] {
        let r = t.str("risk"), b = t.arr("boxes").first
        var i: [String: Any] = ["kind": "thing", "food": t.str("label"), "reason": t.str("why"), "fix": t.str("fix"),
                                "verdict": ["high": "toxic", "medium": "caution", "good": "safe"][r] ?? "other",
                                "word": r == "good" ? "Good for him" : "Chew risk: " + r]
        if let b { i["box"] = ["x0", "y0", "x1", "y1"].map { b.num($0) * 1000 } }
        return i
    }

    // him: what he's doing, and buttons for what to look at closer in the same photo
    private func petCard(_ seen: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if let look {
                let v = ["normal": "safe", "watch": "caution", "vet": "vet"][look.str("verdict")] ?? "caution"
                HStack(spacing: 10) {
                    VerdictBadge(verdict: v, size: 34)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(look.str("label")).font(.nunito(21)).foregroundStyle(Color.ink)
                        Text(["normal": "Looks healthy", "watch": "Keep an eye on it", "vet": "See a vet"][look.str("verdict")] ?? "").font(.nunito(15)).foregroundStyle(Color.verdict(v).0 == .sun ? Color.sunLip : Color.verdict(v).0)
                    }
                }
                Text(look.str("says")).font(.nunito(15, black: false)).foregroundStyle(Color.ink)
                if !look.str("tip").isEmpty { Text(look.str("tip")).font(.nunito(14, black: false)).foregroundStyle(Color.muted) }
                Text("It notices; your vet decides.").font(.nunito(12, black: false)).foregroundStyle(Color.muted)
            } else {
                Text("That's \(petName)").font(.nunito(21)).foregroundStyle(Color.ink)
                Text(seen).font(.nunito(15, black: false)).foregroundStyle(Color.ink)
                Text("What do you want to check?").font(.nunito(14)).foregroundStyle(Color.muted)
                if looking { ProgressView().tint(Color.sky) }
                else {
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                        ForEach(Array(options.enumerated()), id: \.offset) { _, o in
                            Button(o.str("label")) { Task { await closer(o.str("id")) } }.buttonStyle(ChunkyButton(color: .sky, lip: .skyLip))
                        }
                    }
                }
            }
        }
        .padding(16).frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 20).fill(.white))
    }

    private func closer(_ focus: String) async {
        looking = true; defer { looking = false }
        do { let r = try await FoodCheck.look(photo, focus: focus); withAnimation { look = r } } catch { if let m = error.shown { self.error = m } }
    }

    // before the photo: Auto works it out; or say what it is and it goes straight to that check
    private var modes: some View {
        HStack(spacing: 6) {
            ForEach([("auto", "Auto"), ("food", "Food"), ("room", "Room"), ("pet", "Him")], id: \.0) { k, l in
                Button(l) { withAnimation(.spring(response: 0.25)) { mode = k } }
                    .font(.nunito(15)).foregroundStyle(mode == k ? Color.white : Color.ink)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(Capsule().fill(mode == k ? Color.grapeLip : Color.white))
            }
        }
        .padding(5)
        .background(Capsule().fill(.black.opacity(0.4)))
    }

    // couldn't tell what it was: say what it is, and the same photo is checked again as that
    private var checkAs: some View {
        HStack(spacing: 8) {
            Text("Check it as").font(.nunito(13)).foregroundStyle(.white)
            ForEach([("food", "Food"), ("room", "Room"), ("pet", "Him")], id: \.0) { k, l in
                Button(l) { if let still { check(still, as: k) } }
                    .font(.nunito(14)).foregroundStyle(Color.ink).padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Capsule().fill(.white))
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 6)
        .background(Capsule().fill(.black.opacity(0.45)))
    }

    private func show(_ r: FoodCheck.Result) {
        still = r.image; error = nil; fed = [:]; seen = nil; look = nil
        withAnimation(.spring(response: 0.35, dampingFraction: 0.65)) { items = r.items; selected = r.held }
        let v = r.items.map { $0.str("verdict") }
        UINotificationFeedbackGenerator().notificationOccurred(v.contains("toxic") ? .error : v.contains("caution") ? .warning : .success)
    }

    // saved with when he can have it again; that day goes on the calendar
    func markFed(_ i: [String: Any]) async {
        let food = i.str("food")
        feeding = food; defer { feeding = nil }
        do {
            fed[food] = try await FoodCheck.fed(i).said
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch { if let m = error.shown { self.error = m } }
    }
}

private func word(_ i: [String: Any]) -> String { i.str("word").isEmpty ? (["safe": "Safe", "caution": "Small treat only", "toxic": "Don't"][i.str("verdict")] ?? i.str("verdict").capitalized) : i.str("word") }

// ---------------------------------------------------------------- the label on a food (same look as the Quest card)

private struct FoodTag: View {
    let item: [String: Any]
    let on: Bool
    var body: some View {
        let v = item.str("verdict"), (c, lip) = Color.verdict(v)
        VStack(spacing: 0) {
            HStack(spacing: 8) {
                VerdictBadge(verdict: v, size: 28)
                VStack(alignment: .leading, spacing: 0) {
                    Text(item.str("food").capitalized).font(.nunito(16)).foregroundStyle(Color.ink).lineLimit(1)
                    Text(word(item)).font(.nunito(13)).foregroundStyle(v == "caution" ? Color.sunLip : v == "safe" ? Color.fernLip : c).lineLimit(1)
                }
            }
            .padding(.leading, 8).padding(.trailing, 12).padding(.vertical, 7)
            .background(RoundedRectangle(cornerRadius: 16).fill(.white))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(on ? c : .clear, lineWidth: 3))
            .background(RoundedRectangle(cornerRadius: 16).fill(lip).offset(y: 4))
            // the stem and dot tie the label to the food
            Rectangle().fill(.white).frame(width: 3, height: 16)
            Circle().fill(c).frame(width: 12, height: 12).overlay(Circle().strokeBorder(.white, lineWidth: 3))
        }
        .scaleEffect(on ? 1.06 : 0.94)
        .shadow(color: .black.opacity(0.25), radius: 6, y: 3)
    }
}

// one of many things on a room photo: its number in a dot of its colour (tap it for its label and details)
private struct NumberDot: View {
    let n: Int, verdict: String
    var body: some View {
        let (c, lip) = Color.verdict(verdict)
        Text("\(n)").font(.nunito(16)).foregroundStyle(verdict == "caution" ? Color.ink : .white)
            .frame(width: 32, height: 32)
            .background(Circle().fill(c)).overlay(Circle().strokeBorder(.white, lineWidth: 3))
            .background(Circle().fill(lip).offset(y: 2))
            .shadow(color: .black.opacity(0.25), radius: 4, y: 2)
    }
}

// the round verdict badge: tick, "!" or cross, drawn in ink on the verdict colour
struct VerdictBadge: View {
    let verdict: String
    var size: CGFloat = 30
    var body: some View {
        let (c, lip) = Color.verdict(verdict)
        Image(systemName: verdict == "safe" ? "checkmark" : verdict == "toxic" ? "xmark" : "exclamationmark")
            .font(.system(size: size * 0.48, weight: .black)).foregroundStyle(Color.ink)
            .frame(width: size, height: size)
            .background(Circle().fill(c))
            .background(Circle().fill(lip).offset(y: 2))
    }
}

// ---------------------------------------------------------------- the phone camera, live

final class CameraFeed: NSObject, ObservableObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    let session = AVCaptureSession()
    @Published var available = false
    @Published var denied = false
    private let queue = DispatchQueue(label: "fursight.camera")
    private let lock = NSLock()
    private var latest: CVPixelBuffer?
    private var configured = false

    func start() {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: run()
        case .notDetermined: AVCaptureDevice.requestAccess(for: .video) { ok in DispatchQueue.main.async { if ok { self.run() } else { self.denied = true } } }
        default: denied = true
        }
    }

    func stop() { queue.async { if self.session.isRunning { self.session.stopRunning() } } }

    private func run() {
        queue.async {
            if !self.configured {
                guard let cam = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
                      let input = try? AVCaptureDeviceInput(device: cam) else { return }
                self.session.beginConfiguration()
                self.session.sessionPreset = .hd1280x720
                if self.session.canAddInput(input) { self.session.addInput(input) }
                let out = AVCaptureVideoDataOutput()
                out.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
                out.alwaysDiscardsLateVideoFrames = true
                out.setSampleBufferDelegate(self, queue: self.queue)
                if self.session.canAddOutput(out) { self.session.addOutput(out) }
                if let conn = out.connection(with: .video), conn.isVideoRotationAngleSupported(90) { conn.videoRotationAngle = 90 }   // portrait frames
                self.session.commitConfiguration()
                self.configured = true
            }
            if !self.session.isRunning { self.session.startRunning() }
            DispatchQueue.main.async { self.available = self.configured }
        }
    }

    func captureOutput(_: AVCaptureOutput, didOutput buffer: CMSampleBuffer, from _: AVCaptureConnection) {
        guard let px = CMSampleBufferGetImageBuffer(buffer) else { return }
        lock.lock(); latest = px; lock.unlock()
    }

    // the newest frame as an image
    func frame() -> UIImage? {
        lock.lock(); let px = latest; lock.unlock()
        guard let px else { return nil }
        let ci = CIImage(cvPixelBuffer: px)
        guard let cg = CIContext().createCGImage(ci, from: ci.extent) else { return nil }
        return UIImage(cgImage: cg)
    }
}

struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    final class View: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
    func makeUIView(context _: Context) -> View {
        let v = View()
        v.preview.session = session
        v.preview.videoGravity = .resizeAspectFill
        if let c = v.preview.connection, c.isVideoRotationAngleSupported(90) { c.videoRotationAngle = 90 }
        return v
    }
    func updateUIView(_: View, context _: Context) {}
}

// ---------------------------------------------------------------- a photo instead (and the simulator, which has no camera)

struct CameraPicker: UIViewControllerRepresentable {
    var source: UIImagePickerController.SourceType = .photoLibrary   // .camera to take one
    var done: (UIImage?) -> Void
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = UIImagePickerController.isSourceTypeAvailable(source) ? source : .photoLibrary
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
