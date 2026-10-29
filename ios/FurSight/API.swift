import Foundation
import Security

// Talking to FurSight: the hub (household, diary, linking) on Cloudflare and the server (the AI) on Vercel.
// The phone is a device in the household like the glasses or the Quest: it links once with a 4-letter code and
// keeps its device token in the Keychain.
enum Config {
    static let hub = URL(string: "https://fursight-cam.wibble-crossplay.workers.dev")!
    // the simulator talks to the local dev server (node dev.js); a real phone to the deployed one
    #if targetEnvironment(simulator)
    static let server = URL(string: "http://localhost:3030")!
    #else
    static let server = URL(string: "https://fursight-seven.vercel.app")!
    #endif
}

enum Keychain {
    static func get(_ key: String) -> String? {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key, kSecReturnData as String: true]
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data else { return nil }
        return String(data: d, encoding: .utf8)
    }
    static func set(_ key: String, _ value: String?) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key]
        SecItemDelete(q as CFDictionary)
        guard let value else { return }
        var add = q; add[kSecValueData as String] = Data(value.utf8)
        SecItemAdd(add as CFDictionary, nil)
    }
}

struct APIError: LocalizedError { let message: String; var errorDescription: String? { message } }

enum API {
    static var token: String? { Keychain.get("fs.token") }

    static func hub(_ path: String, method: String = "GET", body: [String: Any]? = nil) async throws -> [String: Any] {
        try await call(URL(string: Config.hub.absoluteString + "/hub" + path)!, method: method, body: body)
    }
    static func server(_ path: String, _ body: [String: Any] = [:]) async throws -> [String: Any] {
        try await call(Config.server.appendingPathComponent(path), method: "POST", body: body, timeout: 90)
    }

    private static func call(_ url: URL, method: String, body: [String: Any]?, timeout: TimeInterval = 30) async throws -> [String: Any] {
        var req = URLRequest(url: url, timeoutInterval: timeout)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let token { req.setValue("Bearer " + token, forHTTPHeaderField: "Authorization") }
        if let body { req.httpBody = try JSONSerialization.data(withJSONObject: body) }
        let (data, res) = try await URLSession.shared.data(for: req)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        let status = (res as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401, token != nil, url.host == Config.hub.host { await MainActor.run { Session.shared.unlink() } }
        guard (200..<300).contains(status) else { throw APIError(message: json["error"] as? String ?? "Something went wrong (\(status))") }
        return json
    }

    // a diary picture, readable by an image view (the hub accepts the token as ?t= for images)
    static func imageURL(_ path: String) -> URL? {
        guard let token else { return nil }
        var c = URLComponents(url: Config.hub.appendingPathComponent("hub" + path), resolvingAgainstBaseURL: false)!
        c.queryItems = [URLQueryItem(name: "t", value: token)]
        return c.url
    }
}

// Whether this phone is linked, and the push token to hand the hub once it is.
@MainActor
final class Session: ObservableObject {
    static let shared = Session()
    @Published var linked = API.token != nil
    var pushToken: String?

    func link(_ token: String) {
        Keychain.set("fs.token", token)
        linked = true
        Task { await sendPushToken() }
    }
    func unlink() { Keychain.set("fs.token", nil); linked = false }

    func sendPushToken() async {
        guard linked, let pushToken else { return }
        #if DEBUG
        let sandbox = true
        #else
        let sandbox = false
        #endif
        _ = try? await API.hub("/push", method: "PUT", body: ["token": pushToken, "sandbox": sandbox])
    }
}

// Loose JSON helpers: the API answers in plain JSON objects
extension Dictionary where Key == String, Value == Any {
    func str(_ k: String) -> String { self[k] as? String ?? "" }
    func num(_ k: String) -> Double { (self[k] as? NSNumber)?.doubleValue ?? 0 }
    func obj(_ k: String) -> [String: Any]? { self[k] as? [String: Any] }
    func arr(_ k: String) -> [[String: Any]] { self[k] as? [[String: Any]] ?? [] }
}

extension Error {
    // a request SwiftUI cancelled (the screen reloading or going away) isn't something to show in red
    var cancelled: Bool { self is CancellationError || (self as? URLError)?.code == .cancelled || (self as NSError).code == NSURLErrorCancelled }
    // the message to show, or nil when there's nothing to tell the owner
    var shown: String? { cancelled ? nil : localizedDescription }
}
