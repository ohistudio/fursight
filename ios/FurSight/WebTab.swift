import SwiftUI
import WebKit

// Everything else (diary, care, calendar, pet cams, devices) is the FurSight web app, signed in as this phone:
// its device token goes into the page's storage before it loads, so there's no second linking.
struct WebTab: View {
    var body: some View { WebApp().ignoresSafeArea(edges: .bottom).background(Color.page) }
}

struct WebApp: UIViewRepresentable {
    func makeUIView(context _: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        if let token = API.token {
            let js = "try { localStorage.setItem('fs.token', \(literal(token))); } catch (e) {}"
            config.userContentController.addUserScript(WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .clear
        web.load(URLRequest(url: Config.server))
        return web
    }
    func updateUIView(_: WKWebView, context _: Context) {}

    private func literal(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s])
        return data.flatMap { String(data: $0, encoding: .utf8) }.map { String($0.dropFirst().dropLast()) } ?? "''"
    }
}
