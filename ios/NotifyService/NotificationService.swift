import UserNotifications

// Puts the picture into a FurSight notification: a flop arrives with a link to his sticker (signed by the hub,
// valid for a day), and this downloads it and attaches it before the notification shows.
final class NotificationService: UNNotificationServiceExtension {
    private var handler: ((UNNotificationContent) -> Void)?
    private var content: UNMutableNotificationContent?

    override func didReceive(_ request: UNNotificationRequest, withContentHandler handler: @escaping (UNNotificationContent) -> Void) {
        self.handler = handler
        let content = (request.content.mutableCopy() as? UNMutableNotificationContent) ?? UNMutableNotificationContent()
        self.content = content
        guard let link = request.content.userInfo["image"] as? String, let url = URL(string: link) else { return handler(content) }
        URLSession.shared.downloadTask(with: url) { file, response, _ in
            defer { handler(content) }
            guard let file, (response as? HTTPURLResponse)?.statusCode == 200 else { return }
            let ext = (response?.mimeType == "image/png") ? "png" : "jpg"
            let local = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + "." + ext)
            guard (try? FileManager.default.moveItem(at: file, to: local)) != nil,
                  let attachment = try? UNNotificationAttachment(identifier: "picture", url: local) else { return }
            content.attachments = [attachment]
        }.resume()
    }

    // out of time: show it without the picture
    override func serviceExtensionTimeWillExpire() {
        if let handler, let content { handler(content) }
    }
}
