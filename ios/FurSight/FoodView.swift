import AVFoundation
import SwiftUI
import UIKit

// "Can he eat this?" The camera fills the screen; tap anywhere (or the button) and the picture holds still while
// FurSight checks it. Each food gets a label pinned on it, like the Quest cards: the verdict badge, what it thinks
// the food is, and the verdict in its colour. Tap a label for the details: why, how much, when he last had it, and
// "We fed him this", which puts the day it's OK again on the calendar. The safety list has the last word.
struct FoodView: View {
    @StateObject private var camera = CameraFeed()
    @State private var still: UIImage?                 // the frame being checked (the screen holds it)
    @State private var items: [[String: Any]] = []
    @State private var selected = 0
    @State private var checking = false
    @State private var error: String?
    @State private var petName = "him"
    @State private var fed: [String: String] = [:]      // food -> what saving "We fed him this" said
    @State private var feeding: String?
    @State private var picking = false
    @State private var pet: [String: Any]?             // fetched once, not before every check (each request costs seconds from far away)

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.black.ignoresSafeArea()
                if let still { Image(uiImage: still).resizable().scaledToFill().frame(width: geo.size.width, height: geo.size.height).clipped() }
                else if camera.available { CameraPreview(session: camera.session).ignoresSafeArea() }
                else { noCamera }

                // the labels, pinned where each food is in the picture
                if let still, !checking {
                    ForEach(Array(items.enumerated()), id: \.offset) { n, it in
                        if let p = anchor(it, image: still.size, view: geo.size) {
                            FoodTag(item: it, on: n == selected).position(x: p.x, y: p.y)
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
                    if still != nil, !checking, items.indices.contains(selected) { details(items[selected]) }
                    if still != nil, !checking, items.isEmpty, error == nil {
                        Text("No food seen. Hold it up in front of the camera and try again.").font(.nunito(15)).foregroundStyle(Color.ink)
                            .padding(14).frame(maxWidth: .infinity).background(RoundedRectangle(cornerRadius: 16).fill(.white))
                    }
                    controls
                }
                .padding(16)
            }
            .contentShape(Rectangle())
            .onTapGesture { if still == nil { snap() } }   // tap the live picture to check it
        }
        .onAppear {
            camera.start()
            // the pet ahead of the first check
            if pet == nil { Task { if let p = try? await API.hub("/me").arr("pets").first { pet = p; if !p.str("name").isEmpty { petName = p.str("name") } } } }
        }
        .onDisappear { camera.stop() }
        .fullScreenCover(isPresented: $picking) { CameraPicker { img in picking = false; if let img { check(img) } }.ignoresSafeArea() }
    }

    // ---------------------------------------------------------------- pieces

    private var header: some View {
        HStack(spacing: 10) {
            Bean(mood: checking ? "thinking" : mood, size: 52)
            Text("Can \(petName) eat this?").font(.nunito(22)).foregroundStyle(Color.ink)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .background(RoundedRectangle(cornerRadius: 20).fill(.white.opacity(0.94)))
    }

    private var checkingPill: some View {
        HStack(spacing: 10) {
            ProgressView().tint(Color.sky)
            Text("Checking against \(petName)'s safety list…").font(.nunito(15)).foregroundStyle(Color.ink)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(Capsule().fill(.white))
    }

    private var controls: some View {
        HStack(spacing: 10) {
            if still == nil {
                Button { snap() } label: { Label("Check this", systemImage: "camera.viewfinder") }.buttonStyle(ChunkyButton())
                    .disabled(!camera.available)
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
                    Text(i.str("food").capitalized).font(.nunito(21)).foregroundStyle(Color.ink)
                    Text(word(v)).font(.nunito(15)).foregroundStyle(v == "caution" ? Color.sunLip : v == "safe" ? Color.fernLip : c)
                }
            }
            Text(i.str("reason")).font(.nunito(15, black: false)).foregroundStyle(Color.ink)
            if !i.str("label").isEmpty { Label("Label: " + i.str("label"), systemImage: "text.viewfinder").font(.nunito(14, black: false)).foregroundStyle(Color.muted) }
            if v == "caution", !i.str("portion").isEmpty, i.str("portion") != "none" { Text("How much: " + i.str("portion")).font(.nunito(14, black: false)).foregroundStyle(Color.muted) }
            if v == "toxic", !i.str("instead").isEmpty { Text("Instead: " + i.str("instead")).font(.nunito(14, black: false)).foregroundStyle(Color.muted) }
            if let had = i["fed"] as? [String: Any], !had.str("said").isEmpty {
                let wait = (had["wait_left"] as? Int ?? 0) > 0
                Label(had.str("said"), systemImage: wait ? "calendar.badge.clock" : "clock")
                    .font(.nunito(14)).foregroundStyle(wait ? Color.sunLip : Color.muted)
            }
            if v != "toxic" {
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
        guard !checking, let img = camera.frame() else { return }
        UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        check(img)
    }

    private func reset() { withAnimation { still = nil; items = []; fed = [:]; error = nil; selected = 0 } }

    func check(_ img: UIImage) {
        still = img; items = []; fed = [:]; checking = true; error = nil; selected = 0
        let small = img.resized(768)   // plenty to read a label; a smaller upload answers sooner
        guard let jpeg = small.jpegData(compressionQuality: 0.72) else { return }
        let url = "data:image/jpeg;base64," + jpeg.base64EncodedString()
        Task {
            do {
                if self.pet == nil { self.pet = (try await API.hub("/me")).arr("pets").first ?? [:] }
                let pet = self.pet ?? [:]
                if !pet.str("name").isEmpty { petName = pet.str("name") }
                let r = try await API.server("api/food", ["image": url, "pet": ["name": pet.str("name"), "species": pet.str("species"), "breed": pet.str("breed"), "notes": pet.str("notes")], "tz": TimeZone.current.secondsFromGMT() / 60])
                let found = r.arr("items")
                withAnimation(.spring(response: 0.35, dampingFraction: 0.65)) {
                    items = found
                    selected = (r["held"] as? Int).map { min($0, max(0, found.count - 1)) } ?? 0
                }
                let v = found.map { $0.str("verdict") }
                UINotificationFeedbackGenerator().notificationOccurred(v.contains("toxic") ? .error : v.contains("caution") ? .warning : .success)
                for i in found {
                    _ = try? await API.hub("/diary", method: "POST", body: ["kind": "food", "title": i.str("food").capitalized, "note": i.str("reason"), "verdict": i.str("verdict"), "image": url])
                }
            } catch { if let m = error.shown { self.error = m } }
            checking = false
        }
    }

    // saved with when he can have it again; that day goes on the calendar
    func markFed(_ i: [String: Any]) async {
        let food = i.str("food")
        feeding = food; defer { feeding = nil }
        do {
            let r = try await API.server("api/fed", ["food": food, "verdict": i.str("verdict"), "wait_days": i["wait_days"] as? Int ?? 3, "tz": TimeZone.current.secondsFromGMT() / 60])
            fed[food] = r.str("said")
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch { if let m = error.shown { self.error = m } }
    }
}

private func word(_ v: String) -> String { ["safe": "Safe", "caution": "Small treat only", "toxic": "Don't"][v] ?? v.capitalized }

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
                    Text(word(v)).font(.nunito(13)).foregroundStyle(v == "caution" ? Color.sunLip : v == "safe" ? Color.fernLip : c).lineLimit(1)
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
    var done: (UIImage?) -> Void
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let p = UIImagePickerController()
        p.sourceType = .photoLibrary
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
