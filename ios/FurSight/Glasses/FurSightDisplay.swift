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
        Text("Hold the food up and look at it.", style: .body)
        Text("It notices, your vet decides.", style: .meta, color: .secondary)
      }
      .padding(24)
      .background(.card)
      Button(label: "Can \(pet) eat this?", style: .primary, iconName: .eye, onClick: onCheck)
    }
  }

  static func checking(pet: String) -> FlexBox {
    FlexBox(direction: .column, spacing: 8) {
      FlexBox(direction: .column, spacing: 4) {
        Text("Checking…", style: .heading)
        Text("Against \(pet)'s safety list.", style: .body)
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
