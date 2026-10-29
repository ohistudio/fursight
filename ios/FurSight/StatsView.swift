import SwiftUI
import Charts

// The week in numbers: weight, resting (loaf, stretched, flopped) each day, litter tray visits and output.
// One y-axis per chart; tap a chart to read a day.
struct StatsView: View {
    @State private var data: [String: Any] = [:]
    @State private var error: String?
    @State private var picked: [String: String] = [:]   // chart -> picked day

    private let restColours: [String: Color] = ["Loafing": Color(hex: 0x7A4ED1), "Stretched out": Color(hex: 0x2FA8F5), "Flopped": Color(hex: 0xE8A21A)]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Stats").font(.nunito(34))
                    if let error { Text(error).font(.nunito(15, black: false)).foregroundStyle(Color.coral) }
                    tiles
                    if data.arr("weight").count > 1 { weight }
                    if !data.arr("days").isEmpty { resting }
                    if !data.arr("tray").isEmpty { trayBars("Litter tray visits", key: "visits", unit: "", colour: .grapeLip); trayBars("Litter tray output", key: "output_g", unit: " g", colour: Color(hex: 0xB87700)) }
                    if data.arr("weight").isEmpty && data.arr("days").isEmpty && error == nil {
                        VStack(spacing: 10) { Bean(mood: "idle", size: 90); Text("Stats fill in from the litter tray and the pet cam.").font(.nunito(15, black: false)).foregroundStyle(Color.muted) }.frame(maxWidth: .infinity).card()
                    }
                }.padding(16)
            }
            .background(Color.page.ignoresSafeArea())
            .refreshable { await load() }
            .task { await load() }
        }
    }

    private var tiles: some View {
        let w = data.arr("weight"), t = data.obj("today") ?? [:], wk = data.obj("week") ?? [:]
        let change = w.count > 1 ? Int(w.last!.num("g") - w.first!.num("g")) : nil
        return LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
            if let last = w.last { tile(String(format: "%.2f kg", last.num("g") / 1000), "weight", change.map { "\($0 >= 0 ? "+" : "−")\(abs($0)) g this week" } ?? "") }
            if !data.arr("days").isEmpty {
                tile(hm(t.num("loaf")), "loafing today", "\(hm(wk.num("loaf"))) this week")
                tile("\(Int(t.num("flops")))", "flops today", "\(Int(wk.num("flops"))) this week")
                tile(hm(t.num("active")), "on the move", "\(hm(wk.num("active"))) this week")
                tile(hm(wk.num("seen") / 7), "seen a day", "\(hm(wk.num("unseen") / 7)) a day not seen")
                if wk.num("treats") > 0 { tile("\(Int(wk.num("treats")))", "treats this week", "added by you") }
            }
        }
    }

    private func tile(_ big: String, _ label: String, _ sub: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(big).font(.nunito(26)).monospacedDigit()
            Text(label).font(.nunito(13)).foregroundStyle(Color.muted)
            Text(sub).font(.nunito(12, black: false)).foregroundStyle(Color.muted)
        }.card()
    }

    private var weight: some View {
        let pts = data.arr("weight").map { (day: day($0.str("date")), g: $0.num("g")) }
        let lo = (pts.map(\.g).min() ?? 0) - 10, hi = (pts.map(\.g).max() ?? 0) + 10
        return VStack(alignment: .leading, spacing: 8) {
            header("Weight", picked["w"].flatMap { p in pts.first { $0.day == p }.map { "\(p): \(String(format: "%.3f", $0.g / 1000)) kg" } })
            Chart(pts, id: \.day) { p in
                LineMark(x: .value("Day", p.day), y: .value("Grams", p.g)).foregroundStyle(Color.skyLip).lineStyle(StrokeStyle(lineWidth: 2))
                PointMark(x: .value("Day", p.day), y: .value("Grams", p.g)).foregroundStyle(Color.skyLip).symbolSize(p.day == pts.last?.day ? 90 : 40)
            }
            .chartYScale(domain: lo...hi).chartYAxisLabel("g").frame(height: 170)
            .chartXSelection(value: Binding(get: { picked["w"] }, set: { picked["w"] = $0 }))
            if (data.obj("simulated")?["tray"] as? Bool) == true { Text("Simulated tray").font(.nunito(12)).foregroundStyle(Color.muted) }
        }.card()
    }

    private var resting: some View {
        let days = data.arr("days")
        let rows: [(day: String, kind: String, mins: Double)] = days.flatMap { d in [("Loafing", "loaf"), ("Stretched out", "stretched"), ("Flopped", "flop")].map { (day(d.str("date")), $0.0, d.num($0.1)) } }
        let rest = { (d: [String: Any]) in d.num("loaf") + d.num("stretched") + d.num("flop") }
        let past = days.filter { day($0.str("date")) != "Today" && $0.num("seen") > 0 }
        let usual = past.isEmpty ? 0 : past.map(rest).reduce(0, +) / Double(past.count)
        let todaySoFar = days.last.map(rest) ?? 0
        return VStack(alignment: .leading, spacing: 8) {
            header("Resting each day", picked["r"].flatMap { p in days.first { day($0.str("date")) == p }.map { "\(p)\(p == "Today" ? " so far" : ""): loaf \(hm($0.num("loaf"))), stretched \(hm($0.num("stretched"))), \(Int($0.num("flops"))) flops, not seen \(hm($0.num("unseen")))" } })
            Chart {
                ForEach(Array(rows.enumerated()), id: \.offset) { _, r in
                    BarMark(x: .value("Day", r.day), y: .value("Minutes", r.mins)).foregroundStyle(by: .value("Pose", r.kind)).cornerRadius(3).opacity(r.day == "Today" ? 0.4 : 1)
                }
                if usual > 0 { usualTick(usual, above: todaySoFar) }
            }
            .chartForegroundStyleScale(["Loafing": restColours["Loafing"]!, "Stretched out": restColours["Stretched out"]!, "Flopped": restColours["Flopped"]!])
            .chartLegend(position: .top, alignment: .leading).chartYAxisLabel("min").frame(height: 200)
            .chartXSelection(value: Binding(get: { picked["r"] }, set: { picked["r"] = $0 }))
            Text("Today is so far: the line is a usual day. Counts only the time the cams saw him.").font(.nunito(12, black: false)).foregroundStyle(Color.muted)
            if (data.obj("simulated")?["activity"] as? Bool) == true { Text("Includes simulated days").font(.nunito(12)).foregroundStyle(Color.muted) }
        }.card()
    }

    // today isn't over: a short line at a usual day's level, and "so far" over today's bar
    @ChartContentBuilder private func usualTick(_ usual: Double, above: Double) -> some ChartContent {
        RectangleMark(x: .value("Day", "Today"), y: .value("Usual", usual), height: 2).foregroundStyle(Color.muted)
            .annotation(position: .top, spacing: 2) { Text(usual >= above ? "usual" : "").font(.nunito(9)).foregroundStyle(Color.muted) }
        RectangleMark(x: .value("Day", "Today"), y: .value("So far", above), height: 0).foregroundStyle(.clear)
            .annotation(position: .top, spacing: 2) { Text(usual >= above ? "" : "so far").font(.nunito(9)).foregroundStyle(Color.muted) }
    }

    private func trayBars(_ title: String, key: String, unit: String, colour: Color) -> some View {
        let pts = data.arr("tray").map { (day: day($0.str("date")), v: $0.num(key)) }
        let usual = data.obj("usual")?.num(key == "visits" ? "visits" : "output_g") ?? 0, now = pts.last { $0.day == "Today" }?.v ?? 0
        return VStack(alignment: .leading, spacing: 8) {
            header(title, picked[key].flatMap { p in pts.first { $0.day == p }.map { "\(p)\(p == "Today" ? " so far" : ""): \(Int($0.v))\(unit)" } })
            Chart {
                ForEach(pts, id: \.day) { p in BarMark(x: .value("Day", p.day), y: .value(title, p.v)).foregroundStyle(colour).cornerRadius(4).opacity(p.day == "Today" ? 0.4 : 1) }
                if usual > 0, pts.contains(where: { $0.day == "Today" }) { usualTick(usual, above: now) }
            }
            .frame(height: 150).chartXSelection(value: Binding(get: { picked[key] }, set: { picked[key] = $0 }))
            Text("Today is so far: the line is a usual day.").font(.nunito(12, black: false)).foregroundStyle(Color.muted)
        }.card()
    }

    private func header(_ title: String, _ reading: String?) -> some View {
        HStack { Text(title).font(.nunito(19)); Spacer(); if let reading { Text(reading).font(.nunito(12)).foregroundStyle(Color.muted).lineLimit(1) } }
    }

    private func hm(_ m: Double) -> String { let m = Int(m.rounded()); return m < 60 ? "\(m)m" : "\(m / 60)h \(String(format: "%02d", m % 60))" }
    private func day(_ key: String) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        if key == f.string(from: .now) { return "Today" }   // the week runs Tue to Tue: two "Tue"s would merge
        return f.date(from: key).map { $0.formatted(.dateTime.weekday(.abbreviated)) } ?? key
    }
    func load() async {
        do { data = try await API.server("api/stats"); error = nil } catch { if let m = error.shown { self.error = m } }
    }
}
