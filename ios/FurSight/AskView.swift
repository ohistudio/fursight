import SwiftUI

// Ask anything about him. The agent looks (pet cams, litter tray, diary, safety list...) before it answers,
// and shows how it decided. If it can't tell, it asks you back, and your next message is the reply.
struct AskView: View {
    @State private var question = ""
    @State private var thinking = false
    @State private var answer: [String: Any]?
    @State private var pending: (question: String, asked: String)?
    @State private var error: String?
    @FocusState private var focused: Bool

    private let ideas = ["Is he OK today?", "Can he have strawberries?", "How has he been this week?", "Remind me to trim his nails on Friday"]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 12) {
                        Bean(mood: thinking ? "thinking" : mood, size: 72)
                        Text(pending != nil ? "Quick question back" : "Ask about him").font(.nunito(26))
                    }
                    HStack(spacing: 10) {
                        TextField(pending?.asked ?? "Type or tap the mic on the keyboard", text: $question, axis: .vertical)
                            .font(.nunito(17, black: false)).focused($focused).lineLimit(1...4).submitLabel(.send).onSubmit { send() }
                            .padding(14).background(RoundedRectangle(cornerRadius: 16).fill(.white)).overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(focused ? Color.grape : Color.line, lineWidth: 2))
                        Button { send() } label: { Image(systemName: "arrow.up").font(.system(size: 18, weight: .black)) }
                            .buttonStyle(ChunkyButton(color: .grape, lip: .grapeLip)).frame(width: 56).disabled(question.trimmingCharacters(in: .whitespaces).isEmpty || thinking)
                    }
                    if answer == nil && !thinking {
                        ForEach(ideas, id: \.self) { q in
                            Button { question = q; send() } label: { Text(q).font(.nunito(15)).foregroundStyle(Color.ink).frame(maxWidth: .infinity, alignment: .leading) }.card()
                        }
                    }
                    if thinking { Text("Looking through the pet cam, the tray and his diary…").font(.nunito(15, black: false)).foregroundStyle(Color.muted) }
                    if let error { Text(error).font(.nunito(15, black: false)).foregroundStyle(Color.coral) }
                    if let a = answer { result(a) }
                }.padding(16)
            }
            .background(Color.page.ignoresSafeArea())
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private var mood: String {
        guard let a = answer else { return "idle" }
        if a.obj("needs") != nil { return "thinking" }
        return ["safe": "safe", "caution": "caution", "toxic": "toxic", "vet": "toxic"][a.str("verdict")] ?? "idle"
    }

    private func result(_ a: [String: Any]) -> some View {
        let needs = a.obj("needs"), (c, _) = Color.verdict(a.str("verdict"))
        return VStack(alignment: .leading, spacing: 10) {
            if needs == nil, let word = ["safe": "Safe", "caution": "Small treat only", "toxic": "Don't", "vet": "See a vet today"][a.str("verdict")] {
                Text(word.uppercased()).font(.nunito(13)).foregroundStyle(c).kerning(0.8)
            }
            Text(needs?.str("ask") ?? a.str("answer")).font(.nunito(19, black: false))
            Text("You asked: " + a.str("question")).font(.nunito(12)).foregroundStyle(Color.muted)
            let steps = a.arr("steps")
            if !steps.isEmpty {
                DisclosureGroup {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(steps.enumerated()), id: \.offset) { _, s in
                            HStack(alignment: .top, spacing: 8) {
                                Circle().fill(s.str("kind") == "check" ? Color.coral : s.str("tool") == "answer" ? Color.fern : Color.line).frame(width: 10, height: 10).padding(.top, 5)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(s.str("label")).font(.nunito(14))
                                    if !s.str("detail").isEmpty { Text(s.str("detail")).font(.nunito(12, black: false)).foregroundStyle(Color.muted) }
                                }
                            }
                        }
                    }.padding(.top, 6)
                } label: { Text("How it decided").font(.nunito(14)).foregroundStyle(Color.grapeLip) }
            }
        }.card(needs != nil ? .grape : (a.str("verdict") == "none" ? .line : c))
    }

    func send() {
        let q = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !thinking else { return }
        question = ""; focused = false; thinking = true; error = nil
        var body: [String: Any] = ["question": q, "from": "phone", "cam": true]
        if let p = pending { body = ["question": p.question, "followup": ["asked": p.asked, "reply": q], "from": "phone", "cam": true]; pending = nil }
        Task {
            do {
                let a = try await API.server("api/ask", body)
                answer = a
                if let n = a.obj("needs") { pending = (a.str("question"), n.str("ask")) }
                // keep the diary in step with the other devices
                if a.obj("needs") == nil {
                    let steps = a.arr("steps").map { ["tool": $0.str("tool"), "label": $0.str("label"), "detail": $0.str("detail"), "kind": $0.str("kind")] }
                    var entry: [String: Any] = ["kind": "ask", "title": a.str("question"), "note": a.str("answer"), "extra": ["steps": steps]]
                    if ["safe", "caution", "toxic", "vet"].contains(a.str("verdict")) { entry["verdict"] = a.str("verdict") }
                    _ = try? await API.hub("/diary", method: "POST", body: entry)
                }
            } catch { if let m = error.shown { self.error = m } }
            thinking = false
        }
    }
}
