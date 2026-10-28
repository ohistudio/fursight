import SwiftUI

// Add what the cams missed: a treat or greens you gave him, a flop you saw, good droppings, a note. It goes through
// /api/log, which checks a treat against his never list.
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

    private let kinds: [(String, String, String)] = [("treat", "Treat", "carrot.fill"), ("greens", "Greens", "leaf.fill"), ("flop", "Flop", "zzz"), ("loaf", "Loaf", "circle.fill"), ("zoomies", "Zoomies", "hare.fill"), ("droppings", "Good droppings", "checkmark.circle.fill"), ("note", "Note", "pencil")]
    private var food: Bool { what == "treat" || what == "greens" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("The cams only see part of \(pet)'s day. Add what they missed and it counts, marked as yours.").font(.nunito(15, black: false)).foregroundStyle(Color.muted)
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
            .navigationTitle("Add what we missed").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Close") { dismiss() } } }
        }
    }

    private func save() async {
        saving = true; defer { saving = false }
        do {
            let r = try await API.server("api/log", ["what": what, "item": item, "amount": food ? amount : ""])
            done()
            if let never = r["never"] as? String { warning = "Careful: that's on \(pet)'s never list (\(never)). If he ate some, ask FurSight or call a vet."; return }
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}
