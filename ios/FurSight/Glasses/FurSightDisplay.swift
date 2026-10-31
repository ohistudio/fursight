//
// FurSightDisplay.swift
// FurSight
//
// The screens on the Ray-Ban Display. Every send() replaces the whole display, so each is a complete layout:
// a card with the words, then the buttons (picked with the Neural Band or the touchpad).
//

import MWDATDisplay

enum FurSightDisplay {
  static func home(pet: String, onCheck: @escaping @Sendable () -> Void) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      FlexBox(direction: .column, spacing: 4) {
        Text("FurSight", style: .heading)
        Text("Look at food, something he might chew, or him.", style: .body)
        Text("It notices, your vet decides.", style: .meta, color: .secondary)
      }
      .padding(24)
      .background(.card)
      Button(label: "Check", style: .primary, iconName: .eye, onClick: onCheck)
    }
  }

  static func checking(pet: String) -> FlexBox {
    FlexBox(direction: .column, spacing: 8) {
      FlexBox(direction: .column, spacing: 4) {
        Text("Checking…", style: .heading)
        Text("Food, a chew risk, or \(pet)?", style: .body)
      }
      .padding(24)
      .background(.card)
    }
  }

  /// The food you're holding: what it is, the verdict, why, and how much (or what instead).
  static func verdict(
    _ item: [String: Any],
    pet: String,
    others: Int,
    onFed: @escaping @Sendable () -> Void,
    onAgain: @escaping @Sendable () -> Void
  ) -> FlexBox {
    let v = item.str("verdict")
    let mark = v == "safe" ? "✓" : v == "toxic" ? "✕" : "!"
    var detail = ""
    if v == "caution", !item.str("portion").isEmpty, item.str("portion") != "none" { detail = "How much: " + item.str("portion") }
    if v == "toxic", !item.str("instead").isEmpty { detail = "Instead: " + item.str("instead") }
    let had = (item["fed"] as? [String: Any])?.str("said") ?? ""
    let meta = [had, others > 0 ? "+\(others) more on your phone" : ""].filter { !$0.isEmpty }.joined(separator: "  ·  ")
    return FlexBox(direction: .column, spacing: 12) {
      FlexBox(direction: .column, spacing: 4) {
        Text("\(mark) \(item.str("food").capitalized): \(FoodCheck.word(v))", style: .heading)
        Text(item.str("reason"), style: .body)
        if !detail.isEmpty { Text(detail, style: .body, color: .secondary) }
        if !meta.isEmpty { Text(meta, style: .meta, color: .secondary) }
      }
      .padding(24)
      .background(.card)
      FlexBox(direction: .column, spacing: 8) {
        if v != "toxic" { Button(label: "We fed \(pet) this", style: .primary, iconName: .checkmark, onClick: onFed) }
        Button(label: "Check something else", style: v == "toxic" ? .primary : .secondary, onClick: onAgain)
      }
    }
  }

  /// Something he could chew: the risk, why, and the fix.
  static func object(_ things: [[String: Any]], onAgain: @escaping @Sendable () -> Void) -> FlexBox {
    let t = things.first ?? [:]
    let risk = t.str("risk"), mark = risk == "high" ? "✕" : risk == "medium" ? "!" : "✓"
    let word = risk == "good" ? "Good for him" : "Chew risk: " + risk
    let more = things.count > 1 ? "Also: " + things.dropFirst().map { $0.str("label") + " (" + ($0.str("risk") == "good" ? "good" : $0.str("risk")) + ")" }.joined(separator: ", ") : ""
    return FlexBox(direction: .column, spacing: 12) {
      FlexBox(direction: .column, spacing: 4) {
        Text("\(mark) \(t.str("label").capitalized): \(word)", style: .heading)
        Text(t.str("why"), style: .body)
        if !t.str("fix").isEmpty { Text("Fix: " + t.str("fix"), style: .body, color: .secondary) }
        if !more.isEmpty { Text(more, style: .meta, color: .secondary) }
      }
      .padding(24)
      .background(.card)
      Button(label: "Check something else", style: .primary, onClick: onAgain)
    }
  }

  /// Him: what he's doing, then what to look at more closely.
  static func pet(_ name: String, seen: String, options: [[String: Any]], onPick: @escaping @Sendable (String) -> Void, onAgain: @escaping @Sendable () -> Void) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      FlexBox(direction: .column, spacing: 4) {
        Text("That's \(name)", style: .heading)
        Text(seen, style: .body)
        Text("What do you want to check?", style: .meta, color: .secondary)
      }
      .padding(24)
      .background(.card)
      FlexBox(direction: .column, spacing: 8) {
        if options.count > 0 { Button(label: options[0].str("label"), style: .primary, onClick: { onPick(options[0].str("id")) }) }
        if options.count > 1 { Button(label: options[1].str("label"), style: .primary, onClick: { onPick(options[1].str("id")) }) }
        if options.count > 2 { Button(label: options[2].str("label"), style: .primary, onClick: { onPick(options[2].str("id")) }) }
        Button(label: "Check something else", style: .secondary, onClick: onAgain)
      }
    }
  }

  /// A closer look at him: his coat, eyes...
  static func look(_ r: [String: Any], onAgain: @escaping @Sendable () -> Void) -> FlexBox {
    let v = r.str("verdict"), mark = v == "normal" ? "✓" : v == "vet" ? "✕" : "!"
    let word = ["normal": "looks healthy", "watch": "keep an eye on it", "vet": "see a vet"][v] ?? ""
    return FlexBox(direction: .column, spacing: 12) {
      FlexBox(direction: .column, spacing: 4) {
        Text("\(mark) \(r.str("label")): \(word)", style: .heading)
        Text(r.str("says"), style: .body)
        if !r.str("tip").isEmpty { Text(r.str("tip"), style: .body, color: .secondary) }
        Text("It notices, your vet decides.", style: .meta, color: .secondary)
      }
      .padding(24)
      .background(.card)
      Button(label: "Check something else", style: .primary, onClick: onAgain)
    }
  }

  static func message(_ title: String, _ body: String, onAgain: @escaping @Sendable () -> Void) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      FlexBox(direction: .column, spacing: 4) {
        Text(title, style: .heading)
        Text(body, style: .body)
      }
      .padding(24)
      .background(.card)
      Button(label: "Check something else", style: .primary, onClick: onAgain)
    }
  }
}
