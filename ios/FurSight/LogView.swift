import SwiftUI

// Add what the cams missed. "Add a note" takes your own words ("fed him a strawberry, brushed his coat") and
// /api/note does each thing: checks the food and puts the day it's OK again on the calendar, ticks his care,
// marks grooming done. Or pick one of the buttons, which go through /api/log (a treat is checked against his
// never list).
struct LogView: View {
    let pet: String
    var done: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var what = ""
    @State private var item = ""
    @State private var amount = "small"
    @State private var saving = false
    @State private var warning: String?
    @State private var error: String?
    @State private var note = ""
    @State private var noting = false
    @State private var noted: [[String: Any]] = []

    private let kinds: [(String, String, String)] = [("treat", "Treat", "carrot.fill"), ("greens", "Greens", "leaf.fill"), ("flop", "Flop", "zzz"), ("loaf", "Loaf", "circle.fill"), ("zoomies", "Zoomies", "hare.fill"), ("droppings", "Good droppings", "checkmark.circle.fill"), ("note", "Note", "pencil")]
    private var food: Bool { what == "treat" || what == "greens" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Add a note").font(.nunito(20))
                    TextField("e.g. fed him a strawberry, brushed his coat", text: $note, axis: .vertical).lineLimit(2...5)
                        .font(.nunito(17, black: false)).padding(12).background(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 2))
                    Button(noting ? "Reading it…" : "Add note") { Task { await addNote() } }
                        .buttonStyle(ChunkyButton(color: .grape, lip: .grapeLip)).disabled(noting || note.trimmingCharacters(in: .whitespaces).isEmpty)
                    ForEach(Array(noted.enumerated()), id: \.offset) { _, d in
                        let toxic = d.str("verdict") == "toxic"
                        Label(d.str("said"), systemImage: toxic ? "exclamationmark.triangle.fill" : d.str("type") == "fed" ? "calendar.badge.clock" : "checkmark.circle.fill")
                            .font(.nunito(15, black: false)).foregroundStyle(toxic ? Color.coral : Color.ink)
                    }
                    Text("Or pick one. The cams only see part of \(pet)'s day: what you add counts, marked as yours.").font(.nunito(15, black: false)).foregroundStyle(Color.muted).padding(.top, 8)
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                        ForEach(kinds, id: \.0) { k in
                            Button { what = k.0; warning = nil } label: {
                                Label(k.1, systemImage: k.2).font(.nunito(15)).frame(maxWidth: .infinity, minHeight: 46)
                                    .foregroundStyle(what == k.0 ? .white : Color.ink)
                                    .background(RoundedRectangle(cornerRadius: 14).fill(what == k.0 ? Color.grape : .white))
                                    .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(what == k.0 ? Color.grape : Color.line, lineWidth: 2))
                            }
                        }
                    }
                    if food || what == "note" {
                        TextField(what == "note" ? "What happened?" : what == "greens" ? "Which? e.g. coriander" : "What? e.g. a slice of apple", text: $item)
                            .font(.nunito(17, black: false)).padding(12).background(RoundedRectangle(cornerRadius: 14).strokeBorder(Color.line, lineWidth: 2))
                    }
                    if food {
                        Picker("How much", selection: $amount) { Text("A tiny bit").tag("tiny"); Text("A small piece").tag("small"); Text("A handful").tag("handful") }.pickerStyle(.segmented)
                    }
                    if let warning { Text(warning).font(.nunito(15)).foregroundStyle(Color.coral).card(.coral) }
                    if let error { Text(error).font(.nunito(14, black: false)).foregroundStyle(Color.coral) }
                    Button(saving ? "Adding…" : "Add to his diary") { Task { await save() } }
                        .buttonStyle(ChunkyButton(color: .grape, lip: .grapeLip)).disabled(what.isEmpty || saving || ((food || what == "note") && item.trimmingCharacters(in: .whitespaces).isEmpty))
                        .opacity(what.isEmpty ? 0.5 : 1)
                }.padding(16)
            }
            .background(Color.page.ignoresSafeArea())
            .navigationTitle("Add a note").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }

    private func addNote() async {
        noting = true; defer { noting = false }
        do {
            let r = try await API.server("api/note", ["text": note, "tz": TimeZone.current.secondsFromGMT() / 60])
            noted = r.arr("done"); note = ""; done()
        } catch { if let m = error.shown { self.error = m } }
    }

    private func save() async {
        saving = true; defer { saving = false }
        do {
            let r = try await API.server("api/log", ["what": what, "item": item, "amount": food ? amount : ""])
            done()
            if let never = r["never"] as? String { warning = "Careful: that's on \(pet)'s never list (\(never)). If he ate some, ask FurSight or call a vet."; return }
            dismiss()
        } catch { if let m = error.shown { self.error = m } }
    }
}
