import SwiftUI

// Today at a glance: the Bean in his mood for the day, anything that needs you, the litter tray, his day from the
// pet cam, the latest flop, grooming that's due and what's coming up. One call to /api/today.
struct TodayView: View {
    @State private var data: [String: Any] = [:]
    @State private var error: String?
    @State private var loading = true
    @State private var wrapped = false
    @State private var charts = false
    @State private var logging = false
    @State private var uploading = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    if data.obj("activity") != nil || data.obj("tray") != nil {
                        Button { wrapped = true } label: { Label("\(data.obj("pet")?.str("name") ?? "His")'s week, wrapped", systemImage: "sparkles") }
                            .buttonStyle(ChunkyButton(color: .sky, lip: .skyLip))
                    }
                    if let error { Text(error).font(.nunito(15, black: false)).foregroundStyle(Color.coral).card() }
                    ForEach(Array(data.arr("alerts").enumerated()), id: \.offset) { _, a in alert(a) }
                    if let m = data.obj("moment") { moment(m) }
                    if let t = data.obj("tray") { tray(t) }
                    if let c = data.obj("climate") { room(c) }
                    if let a = data.obj("activity") { activity(a) }
                    if !data.arr("due").isEmpty || !data.arr("coming").isEmpty { upcoming }
                    // old photos, videos and vet papers: the web app's upload page, which reads PDFs and videos
                    Button { uploading = true } label: { Label("Add photos, videos or vet papers", systemImage: "doc.badge.plus") }
                        .buttonStyle(ChunkyButton(color: .sky, lip: .skyLip))
                    if let r = data.obj("recap") { recap(r) }
                }
                .padding(16)
            }
            .background(Color.page.ignoresSafeArea())
            .refreshable { await load() }
            .task { await load() }
            .fullScreenCover(isPresented: $wrapped) {
                ZStack(alignment: .topTrailing) {
                    WebApp(url: URL(string: Config.server.absoluteString + "/wrapped/?app=1")!).ignoresSafeArea()
                    Button { wrapped = false } label: { Image(systemName: "xmark").font(.system(size: 20, weight: .black)).foregroundStyle(.white).frame(width: 52, height: 52) }
                        .padding(.top, 14).padding(.trailing, 6)
                }
            }
            .sheet(isPresented: $uploading, onDismiss: { Task { await load() } }) {
                NavigationStack {
                    WebApp(url: URL(string: Config.server.absoluteString + "/#upload")!).ignoresSafeArea(edges: .bottom)
                        .navigationTitle("Add to his record").navigationBarTitleDisplayMode(.inline)
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { uploading = false } } }
                }
            }
            .sheet(isPresented: $charts) { StatsView() }
            .sheet(isPresented: $logging) { LogView(pet: data.obj("pet")?.str("name") ?? "him") { Task { await load() } }.presentationDetents([.medium, .large]) }
            .onReceive(NotificationCenter.default.publisher(for: .fursightRefresh)) { _ in Task { await load() } }
        }
    }

    // the Bean's mood: worried if anything needs the vet, careful for a watch, happy when there's been a flop
    private var mood: String {
        if loading { return "thinking" }
        let alerts = data.arr("alerts"), tray = data.obj("tray")?.str("status") ?? ""
        if alerts.contains(where: { $0.str("verdict") == "vet" || $0.str("verdict") == "toxic" }) || tray == "vet" { return "toxic" }
        if tray == "watch" || !alerts.isEmpty { return "caution" }
        if (data.obj("activity")?.obj("today")?.num("flops") ?? 0) > 0 { return "safe" }
        return "idle"
    }

    private var header: some View {
        let pet = data.obj("pet")
        return HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(Date.now.formatted(.dateTime.weekday(.wide).day().month(.wide)).uppercased()).font(.nunito(13)).foregroundStyle(Color.muted).kerning(0.8)
                Text(pet?.str("name") ?? "FurSight").font(.nunito(34))
                if let n = pet?.str("nicknames"), !n.isEmpty { Text(n).font(.nunito(14, black: false)).foregroundStyle(Color.muted) }
            }
            Spacer()
            Bean(mood: mood, size: 92)
        }
    }

    private func alert(_ a: [String: Any]) -> some View {
        let (c, _) = Color.verdict(a.str("verdict"))
        return VStack(alignment: .leading, spacing: 4) {
            Text(a.str("title")).font(.nunito(19)).foregroundStyle(c)
            if !a.str("note").isEmpty { Text(a.str("note")).font(.nunito(15, black: false)).foregroundStyle(Color.ink) }
            Text(time(a.num("at"))).font(.nunito(12)).foregroundStyle(Color.muted)
        }.card(c)
    }

    private func moment(_ m: [String: Any]) -> some View {
        HStack(spacing: 14) {
            if m["has_image"] as? Bool == true, let url = API.imageURL("/diary/\(m.str("id"))/image") {
                if m["sticker"] as? Bool == true {
                    // a cut-out sticker of him: no frame, a little tilt
                    AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { Color.clear }
                        .frame(width: 110, height: 110).rotationEffect(.degrees(-4))
                } else {
                    AsyncImage(url: url) { $0.resizable().scaledToFill() } placeholder: { Color.line }
                        .frame(width: 96, height: 96).clipShape(RoundedRectangle(cornerRadius: 14))
                }
            }
            VStack(alignment: .leading, spacing: 4) {
                Text("MOMENT").font(.nunito(12)).foregroundStyle(Color.grape).kerning(0.8)
                Text(m.str("title")).font(.nunito(18))
                Text(time(m.num("at"))).font(.nunito(12)).foregroundStyle(Color.muted)
            }
        }.card()
    }

    private func tray(_ t: [String: Any]) -> some View {
        let today = t.obj("today") ?? [:], usual = t.obj("usual")
        let word = ["normal": "All normal", "watch": "Worth watching", "vet": "Talk to your vet"][t.str("status")] ?? ""
        return VStack(alignment: .leading, spacing: 12) {
            HStack { Text("Litter tray").font(.nunito(20)); Spacer(); Pill(text: word, status: t.str("status")) }
            HStack(alignment: .top) {
                stat(today.num("weight_g") > 0 ? String(format: "%.2f kg", today.num("weight_g") / 1000) : "–", "weight", usual.map { String(format: "usual %.2f", $0.num("weight_g") / 1000) })
                stat("\(Int(today.num("visits")))", "visits", usual.map { "usual \(Int($0.num("visits"))) by now" })
                stat("\(Int(today.num("output_g"))) g", "output", usual.map { "usual \(Int($0.num("output_g"))) g" })
            }
            ForEach(t["reasons"] as? [String] ?? [], id: \.self) { Text("• " + $0).font(.nunito(14, black: false)).foregroundStyle(Color.muted) }
            if t["simulated"] as? Bool == true { Text("Simulated tray").font(.nunito(12)).foregroundStyle(Color.muted) }
        }.card()
    }

    // the room by his tray: rabbits handle heat badly
    private func room(_ c: [String: Any]) -> some View {
        let word = ["normal": "Comfortable", "watch": "Worth watching", "vet": "Too hot"][c.str("status")] ?? ""
        return VStack(alignment: .leading, spacing: 10) {
            HStack { Text("The room").font(.nunito(20)); Spacer(); Pill(text: word, status: c.str("status")) }
            HStack(alignment: .top) {
                stat(String(format: "%.1f°C", c.num("t")), "by his tray", c["max"] is NSNumber ? String(format: "today %.0f to %.0f°C", c.num("min"), c.num("max")) : nil)
                stat("\(Int(c.num("h")))%", "humidity", nil)
            }
            ForEach(c["reasons"] as? [String] ?? [], id: \.self) { Text("• " + $0).font(.nunito(14, black: false)).foregroundStyle(Color.muted) }
            if c["simulated"] as? Bool == true { Text("Simulated readings").font(.nunito(12)).foregroundStyle(Color.muted) }
        }.card(c.str("status") == "vet" ? .coral : .line)
    }

    private func activity(_ a: [String: Any]) -> some View {
        let today = a.obj("today") ?? [:], week = a.obj("week") ?? [:]
        let rest = today.num("loaf") + today.num("stretched") + today.num("flop")
        return VStack(alignment: .leading, spacing: 12) {
            HStack { Text("His day").font(.nunito(20)); Spacer(); Pill(text: "\(Int(today.num("flops"))) flops today", status: "safe") }
            HStack(alignment: .top) {
                stat(hm(rest), "resting", "\(hm(week.num("loaf") + week.num("stretched") + week.num("flop"))) this week")
                stat(hm(today.num("loaf")), "loafing", "\(hm(week.num("loaf"))) this week")
                stat(hm(today.num("active")), "on the move", "\(hm(week.num("active"))) this week")
            }
            // the cams only see part of the day, and say so
            HStack(spacing: 6) {
                Image(systemName: "eye.slash").foregroundStyle(Color.muted)
                Text("Not seen today: \(hm(today.num("unseen")))").font(.nunito(13)).foregroundStyle(Color.muted)
                if today.num("flopsYou") > 0 { Text("· \(Int(today.num("flopsYou"))) flop\(today.num("flopsYou") == 1 ? "" : "s") added by you").font(.nunito(13)).foregroundStyle(Color.muted) }
            }
            if let treats = a.obj("treats")?["today"] as? [[String: Any]], !treats.isEmpty {
                Text("Treats today: " + treats.map { $0.str("item") + ($0.str("amount").isEmpty ? "" : " (\($0.str("amount")))") }.joined(separator: ", ")).font(.nunito(14, black: false))
            }
            Button { logging = true } label: { Label("Add a note", systemImage: "square.and.pencil") }
                .buttonStyle(ChunkyButton(color: .grape, lip: .grapeLip))
            Button { charts = true } label: { Label("His week in charts", systemImage: "chart.bar.fill") }
                .buttonStyle(ChunkyButton(color: .white, lip: .line))
            if a["simulated"] as? Bool == true { Text("Includes simulated days").font(.nunito(12)).foregroundStyle(Color.muted) }
        }.card()
    }

    private var upcoming: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Coming up").font(.nunito(20))
            ForEach(Array(data.arr("due").enumerated()), id: \.offset) { _, r in
                HStack { Text(r.str("title")).font(.nunito(16)); Spacer(); Text(r.str("when")).font(.nunito(13)).foregroundStyle(r.num("days") < 0 ? Color.coral : Color(hex: 0xB87700)) }
            }
            ForEach(Array(data.arr("coming").enumerated()), id: \.offset) { _, c in
                HStack { Text(c.str("title")).font(.nunito(16)); Spacer(); Text(day(c.str("date"))).font(.nunito(13)).foregroundStyle(Color.muted) }
            }
        }.card()
    }

    private func recap(_ r: [String: Any]) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            if r["has_image"] as? Bool == true, let url = API.imageURL("/diary/\(r.str("id"))/image") {
                AsyncImage(url: url) { $0.resizable().scaledToFit() } placeholder: { Color.line.frame(height: 200) }.clipShape(RoundedRectangle(cornerRadius: 16))
            }
            Text("THIS WEEK").font(.nunito(12)).foregroundStyle(Color.grape).kerning(0.8)
            Text(r.str("title")).font(.nunito(22))
        }.card()
    }

    private func stat(_ big: String, _ label: String, _ sub: String?) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(big).font(.nunito(22)).monospacedDigit()
            Text(label).font(.nunito(12)).foregroundStyle(Color.muted)
            if let sub { Text(sub).font(.nunito(11, black: false)).foregroundStyle(Color.muted) }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }

    private func hm(_ m: Double) -> String { let m = Int(m.rounded()); return m < 60 ? "\(m)m" : "\(m / 60)h \(String(format: "%02d", m % 60))" }
    private func time(_ ms: Double) -> String { Date(timeIntervalSince1970: ms / 1000).formatted(date: .omitted, time: .shortened) }
    private func day(_ key: String) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        return f.date(from: key).map { $0.formatted(.dateTime.weekday(.abbreviated).day().month(.abbreviated)) } ?? key
    }

    func load() async {
        do { data = try await API.server("api/today"); error = nil } catch { if let m = error.shown { self.error = m } }
        loading = false
    }
}
