import UIKit

// One food check, shared by the phone camera screen and the glasses: the picture goes to /api/food (Muse Spark
// with the safety list having the last word), each verdict is written to the diary, and "We fed him this"
// goes to /api/fed. The pet is fetched once and kept (each request costs seconds from far away).
@MainActor
enum FoodCheck {
    struct Result {
        let image: UIImage
        let items: [[String: Any]]
        let held: Int
    }

    private static var pet: [String: Any]?
    static var petName: String { pet?.str("name").isEmpty == false ? pet!.str("name") : "him" }
    static var tz: Int { TimeZone.current.secondsFromGMT() / 60 }

    static func loadPet() async {
        if pet == nil, let p = try? await API.hub("/me").arr("pets").first { pet = p }
    }

    static func run(_ img: UIImage) async throws -> Result {
        let small = img.resized(768)   // plenty to read a label; a smaller upload answers sooner
        guard let jpeg = small.jpegData(compressionQuality: 0.72) else { throw URLError(.cannotDecodeContentData) }
        let url = "data:image/jpeg;base64," + jpeg.base64EncodedString()
        await loadPet()
        let p = pet ?? [:]
        let r = try await API.server("api/food", ["image": url, "pet": ["name": p.str("name"), "species": p.str("species"), "breed": p.str("breed"), "notes": p.str("notes")], "tz": tz])
        let items = r.arr("items")
        let held = (r["held"] as? Int).map { min($0, max(0, items.count - 1)) } ?? 0
        Task {
            for i in items {
                _ = try? await API.hub("/diary", method: "POST", body: ["kind": "food", "title": i.str("food").capitalized, "note": i.str("reason"), "verdict": i.str("verdict"), "image": url])
            }
        }
        return Result(image: img, items: items, held: held)
    }

    // saved with when he can have it again; that day goes on the calendar. Returns what to say.
    static func fed(_ i: [String: Any]) async throws -> (said: String, next: String?) {
        let r = try await API.server("api/fed", ["food": i.str("food"), "verdict": i.str("verdict"), "wait_days": i["wait_days"] as? Int ?? 3, "tz": tz])
        return (r.str("said"), r["next"] as? String)
    }

    nonisolated static func word(_ v: String) -> String { ["safe": "Safe", "caution": "Small treat only", "toxic": "Don't"][v] ?? v.capitalized }
}
