import SwiftUI

// The FurSight look, matching the web app: Nunito, white cards with a chunky lip, bright buttons that press down.
extension Color {
    init(hex: UInt32) { self.init(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255) }
    static let fern = Color(hex: 0x3DBE6B), fernLip = Color(hex: 0x2A9A52)
    static let sun = Color(hex: 0xFFB627), sunLip = Color(hex: 0xD9900A)
    static let coral = Color(hex: 0xFF4D5E), coralLip = Color(hex: 0xD93545)
    static let sky = Color(hex: 0x2FA8F5), skyLip = Color(hex: 0x1E86C9)
    static let grape = Color(hex: 0x9B6CF0), grapeLip = Color(hex: 0x7A4ED1)
    static let ink = Color(hex: 0x2B2A33), muted = Color(hex: 0x6B6977), line = Color(hex: 0xE4E1EA), page = Color(hex: 0xF6F5F9)

    static func verdict(_ v: String) -> (Color, Color) {
        switch v {
        case "safe", "normal": return (.fern, .fernLip)
        case "caution", "watch": return (.sun, .sunLip)
        case "toxic", "vet": return (.coral, .coralLip)
        default: return (.sky, .skyLip)
        }
    }
}

extension Font {
    static func nunito(_ size: CGFloat, black: Bool = true) -> Font { .custom(black ? "NunitoExtraLight-Black" : "NunitoExtraLight-ExtraBold", size: size) }
}

struct Card: ViewModifier {
    var tint: Color = .line
    func body(content: Content) -> some View {
        content.padding(16).frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 20).fill(.white))
            .overlay(RoundedRectangle(cornerRadius: 20).strokeBorder(tint, lineWidth: 2))
            .background(RoundedRectangle(cornerRadius: 20).fill(tint).offset(y: 4))
            .padding(.bottom, 4)
    }
}
extension View { func card(_ tint: Color = .line) -> some View { modifier(Card(tint: tint)) } }

struct ChunkyButton: ButtonStyle {
    var color: Color = .fern, lip: Color = .fernLip
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.nunito(17)).foregroundStyle(.white).frame(maxWidth: .infinity, minHeight: 54)
            .background(RoundedRectangle(cornerRadius: 16).fill(color))
            .background(RoundedRectangle(cornerRadius: 16).fill(lip).offset(y: configuration.isPressed ? 1 : 5))
            .offset(y: configuration.isPressed ? 4 : 0)
            .animation(.spring(response: 0.15, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

struct Pill: View {
    let text: String, status: String
    var body: some View {
        let (c, _) = Color.verdict(status)
        Text(text).font(.nunito(13)).padding(.horizontal, 12).padding(.vertical, 4)
            .background(Capsule().fill(c.opacity(0.16))).foregroundStyle(c == .sun ? Color(hex: 0xB87700) : c)
    }
}

// The Bean: FurSight's character, the same glossy jellybean head as the web app, idling and reacting by mood.
struct Bean: View {
    var mood: String = "idle"
    var size: CGFloat = 120
    @State private var t: Double = 0
    @State private var hop: Double = 0

    var body: some View {
        TimelineView(.animation) { tl in
            let s = tl.date.timeIntervalSinceReferenceDate
            canvas(s)
        }
        .frame(width: size, height: size * 1.04)
        .onAppear { if mood == "safe" { withAnimation(.interpolatingSpring(stiffness: 220, damping: 9)) { hop = 1 } } }
        .onChange(of: mood) { _, m in hop = 0; if m == "safe" { withAnimation(.interpolatingSpring(stiffness: 220, damping: 9)) { hop = 1 } } }
    }

    private func canvas(_ s: Double) -> some View {
        let u = size / 260   // drawn on the web's 260-wide grid
        let bob = sin(s * .pi * 2 / (mood == "thinking" ? 2 : mood == "toxic" ? 4.5 : 3.2)) * 4 * u
        let blink = fmod(s, 4.7) > 4.55 ? 0.12 : 1.0
        let lookX = mood == "thinking" ? sin(s * 2.6) * 6 * u : mood == "toxic" ? 0 : sin(s * 0.7) * 5 * u
        let lookY = mood == "thinking" ? -7 * u : mood == "toxic" ? 4 * u : 0
        let earL = mood == "safe" ? -4.0 : mood == "toxic" ? -62.0 : -12 + sin(s * 1.19) * 4
        let earR = mood == "safe" ? 4.0 : mood == "toxic" ? 62.0 : mood == "caution" ? 38.0 : 10 + sin(s * 1.03 + 1) * 4
        let body = LinearGradient(colors: [.white, Color(hex: 0xF3F0FA), Color(hex: 0xC6BAE5)], startPoint: .topLeading, endPoint: .bottomTrailing)
        let inner = LinearGradient(colors: [Color(hex: 0xC2A8F7), Color(hex: 0x9B6CF0)], startPoint: .top, endPoint: .bottom)
        return ZStack {
            Ellipse().fill(Color.ink.opacity(0.14)).frame(width: 168 * u, height: 24 * u).offset(y: 120 * u)
            ZStack {
                ear(u, angle: earL, x: -52, body: body, inner: inner)
                ear(u, angle: earR, x: 52, body: body, inner: inner)
                RoundedRectangle(cornerRadius: 88 * u).fill(body).frame(width: 224 * u, height: 176 * u).offset(y: 27 * u)
                Ellipse().fill(LinearGradient(colors: [.white, Color(hex: 0xECE6F7)], startPoint: .top, endPoint: .bottom))
                    .overlay(Ellipse().stroke(Color(hex: 0xE2DBF2), lineWidth: 3 * u)).frame(width: 156 * u, height: 120 * u).offset(y: 29 * u)
                ZStack {
                    ForEach([-26.0, 26.0], id: \.self) { x in
                        ZStack {
                            Ellipse().fill(Color(hex: 0x1E1D24)).frame(width: 20 * u, height: 28 * u)
                            Circle().fill(.white).frame(width: 6.4 * u).offset(x: -3 * u, y: -6 * u)
                        }.scaleEffect(x: 1, y: blink * (mood == "safe" ? 0.75 : 1)).offset(x: x * u, y: 23 * u)
                    }
                    Triangle().fill(Color(hex: 0xC9A3E8)).frame(width: 10 * u, height: 5 * u).offset(y: 47 * u)
                    mouth(u)
                }.offset(x: lookX, y: lookY)
                Ellipse().fill(.white.opacity(0.75)).frame(width: 24 * u, height: 68 * u).rotationEffect(.degrees(22)).offset(x: -74 * u, y: 11 * u)
            }
            .offset(y: bob - hop * sin(min(1, hop) * .pi) * 40 * u)
            .rotationEffect(.degrees(mood == "caution" ? -8 : 0), anchor: .bottom)
        }
        .frame(width: size, height: size * 1.04)
    }

    private func ear(_ u: CGFloat, angle: Double, x: CGFloat, body: LinearGradient, inner: LinearGradient) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: 22 * u).fill(body).frame(width: 44 * u, height: 96 * u)
            RoundedRectangle(cornerRadius: 11 * u).fill(inner).opacity(0.85).frame(width: 22 * u, height: 64 * u).offset(y: -2 * u)
        }
        .rotationEffect(.degrees(angle), anchor: UnitPoint(x: 0.5, y: 0.95))
        .offset(x: x * u, y: -73 * u)
    }

    @ViewBuilder private func mouth(_ u: CGFloat) -> some View {
        switch mood {
        case "safe": Arc(up: false).stroke(Color.ink, style: StrokeStyle(lineWidth: 3 * u, lineCap: .round)).frame(width: 24 * u, height: 10 * u).offset(y: 56 * u)
        case "toxic": Arc(up: true).stroke(Color.ink, style: StrokeStyle(lineWidth: 3 * u, lineCap: .round)).frame(width: 18 * u, height: 7 * u).offset(y: 59 * u)
        case "caution": Capsule().fill(Color.ink).frame(width: 16 * u, height: 3 * u).offset(y: 56 * u)
        case "thinking": Ellipse().stroke(Color.ink, lineWidth: 3 * u).frame(width: 8 * u, height: 10 * u).offset(y: 57 * u)
        default: Arc(up: false).stroke(Color.ink, style: StrokeStyle(lineWidth: 3 * u, lineCap: .round)).frame(width: 14 * u, height: 5 * u).offset(y: 55 * u)
        }
    }
}

struct Triangle: Shape { func path(in r: CGRect) -> Path { Path { p in p.move(to: CGPoint(x: r.minX, y: r.minY)); p.addLine(to: CGPoint(x: r.maxX, y: r.minY)); p.addLine(to: CGPoint(x: r.midX, y: r.maxY)); p.closeSubpath() } } }
struct Arc: Shape {
    var up: Bool
    func path(in r: CGRect) -> Path { Path { p in p.move(to: CGPoint(x: r.minX, y: up ? r.maxY : r.minY)); p.addQuadCurve(to: CGPoint(x: r.maxX, y: up ? r.maxY : r.minY), control: CGPoint(x: r.midX, y: up ? r.minY - r.height : r.maxY + r.height)) } }
}
